// Volunteer screens: Home, QR pass, Schedule, Me, Feedback. (The Volunteer
// Guide is in content.js, trainees in trainees.js, Edit my details in profile.js.)
// Every screen draws instantly from what's saved on the phone, then refreshes.
// MINDS staff use these screens too; the Admin menu is opened from Me.

import { call, isNetworkError } from '../api.js';
import { drawQr } from '../qr.js';
import {
  backLink, badge, busy, clockTime, el, errorBlock, field, fmtDay, fmtHours, fmtTimes, formData, fuzzyFilter, icon,
  initials, likert, loading, mapsLink, mount, searchBox, section, toast, todaySG, typeBadge,
} from '../ui.js';
import { traineeCards, traineeChips } from './trainees.js';

/** Draw from cache, then from the server. `draw` gets the volunteerHome payload. */
async function withHome(root, app, ctx, draw) {
  const cached = app.cachedHome();
  if (cached && cached.schedule) draw(cached);
  else mount(root, loading());
  try {
    const fresh = await app.fetchHome();
    if (ctx.alive()) draw(fresh);
  } catch (err) {
    if (!ctx.alive()) return;
    if (!cached) mount(root, errorBlock(err, () => app.rerender()));
    else if (!isNetworkError(err)) toast(err.message, 'error');
  }
}

const firstName = (name) => String(name || '').trim().split(/\s+/)[0];

function list(...rows) {
  return el('div', { class: 'card divide-y divide-slate-100 overflow-hidden dark:divide-neutral-900' }, ...rows);
}

function emptyState(iconName, title, text, action) {
  return el('div', { class: 'flex flex-col items-center rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center muted dark:border-neutral-800' },
    icon(iconName, 'mb-3 size-12 text-slate-300 dark:text-neutral-700'),
    el('p', { class: 'font-medium text-slate-900 dark:text-white' }, title),
    el('p', { class: 'mt-1 text-sm' }, text),
    action || null);
}

const venueLink = (s) => (s.venue
  ? el('a', { href: mapsLink(s.venueAddress || s.venue), target: '_blank', rel: 'noopener', class: 'hover:underline' }, s.venue)
  : 'Venue to be confirmed');

function sessionMeta(s) {
  return [
    el('p', { class: 'mt-1 flex items-center gap-1.5 text-sm text-slate-700 dark:text-neutral-300' }, icon('clock', 'size-4 text-slate-400'), fmtTimes(s)),
    el('p', { class: 'mt-0.5 flex items-center gap-1.5 text-sm muted' }, icon('pin', 'size-4 text-slate-400'), venueLink(s)),
  ];
}

const typeChip = (s) => (s.type && s.type !== 'Volunteer session' ? badge(s.type, 'purple') : null);

function guideBanner() {
  return el('a', { href: '#/guide', class: 'card mt-4 flex items-center gap-4 border-l-4 border-l-emerald-500 p-4 hover:shadow-md' },
    el('span', { class: 'flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }, icon('book', 'size-6')),
    el('span', { class: 'min-w-0 flex-1' },
      el('span', { class: 'block font-bold text-slate-900 dark:text-white' }, 'New here? Start with the Volunteer Guide'),
      el('span', { class: 'block text-sm muted' }, 'Projects, what to wear and what to expect. Read it before your first session.')),
    icon('chevron', 'size-5 text-slate-400'));
}

/** "Regular volunteer", or how many sessions until they become one. */
function typeLine(h) {
  const u = h.user;
  if (u.type === 'regular') return el('p', { class: 'mt-2' }, badge('Regular volunteer', 'emerald', 'heart'));
  if (u.typeSetting === 'new') return el('p', { class: 'mt-2' }, badge('New volunteer', 'indigo', 'sparkle'));
  const left = Math.max(0, (h.regularAfter || 10) - (u.completedSessions || 0));
  return el('div', { class: 'mt-3' },
    el('div', { class: 'flex items-center justify-between text-xs font-bold muted' },
      el('span', {}, 'New volunteer'), el('span', {}, `${left} more session${left === 1 ? '' : 's'} to become a regular`)),
    el('div', { class: 'mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-neutral-800' },
      el('div', { class: 'h-full rounded-full bg-emerald-500', style: `width:${Math.round(100 * (u.completedSessions || 0) / (h.regularAfter || 10))}%` })));
}

function attendanceBox(a) {
  if (!a) return null;
  return el('div', { class: 'alert alert-success mt-4 text-center' },
    a.clockOut
      ? badge('Clocked out', 'emerald', 'check')
      : badge('Clocked in today', 'emerald', 'check'),
    el('p', { class: 'mt-1.5 text-xs text-slate-600 dark:text-neutral-400' }, a.clockOut
      ? `${clockTime(a.clockIn)}–${clockTime(a.clockOut)}, ${fmtHours(a.hours)} recorded.`
      : `Your clock-in was recorded at ${clockTime(a.clockIn)}. Show your pass again at the end to clock out.`));
}

function cantMakeIt(app, booking, redraw) {
  if (!booking.canCancel) return null;
  const btn = el('button', { class: 'text-sm font-bold text-red-600 hover:underline dark:text-red-400' }, "Can't make it");
  btn.addEventListener('click', () => {
    if (!confirm(`Tell MINDS you can't make it to ${booking.session.title} on ${fmtDay(booking.session.date)}?`)) return;
    busy(btn, 'Saving…', async () => {
      const res = await call('cancelBooking', { bookingId: booking.bookingId });
      app.saveHome(res.home);
      redraw(res.home);
      toast(res.message);
    });
  });
  return btn;
}

const noTraineeYet = (h) => el('p', { class: 'alert alert-info mt-4' }, h.user.type === 'regular'
  ? 'No free trainee yet. MINDS staff will pair you on the day.'
  : 'A MINDS admin will pair you with a trainee. You\'ll see them here, and under Trainees.');

/* ---------------- Home ---------------- */

export function renderHome(root, app, ctx) {
  const draw = (h) => {
    const today = h.today;
    const todays = h.upcoming.filter((u) => u.session.date === today);
    const later = h.upcoming.filter((u) => u.session.date !== today);

    mount(root,
      el('h1', { class: 'page-title' }, `Welcome, ${firstName(h.user.name)}!`),
      el('p', { class: 'mt-1 text-sm muted' }, h.totals.sessions
        ? `You've volunteered ${fmtHours(h.totals.hours)} over ${h.totals.sessions} session${h.totals.sessions === 1 ? '' : 's'}.`
        : 'Your volunteering hours will show here after your first session.'),
      typeLine(h),
      h.guideRead === false ? guideBanner() : null,

      h.pendingFeedback.map((f) => el('div', { class: 'card mt-4 border-l-4 border-l-amber-400 p-4' },
        badge('Feedback needed', 'amber', 'message'),
        el('p', { class: 'mt-2 font-bold text-slate-900 dark:text-white' }, `How did ${f.sessionTitle} go?`),
        el('p', { class: 'text-sm muted' }, f.traineeName
          ? `A minute of feedback helps MINDS staff support ${f.traineeName}.`
          : 'A minute of feedback helps the team plan better sessions.'),
        el('a', { href: `#/feedback/${f.bookingId}`, class: 'btn btn-primary btn-sm mt-3' }, 'Give feedback'))),

      todays.length ? el('h2', { class: 'group-label' }, 'Today') : null,
      todays.map((u) => el('article', { class: 'card mb-3 border-t-4 border-t-indigo-500 p-5' },
        el('div', { class: 'flex items-start justify-between gap-3' },
          el('div', { class: 'min-w-0' },
            el('h3', { class: 'text-xl font-extrabold leading-snug text-slate-900 dark:text-white' }, u.session.title),
            sessionMeta(u.session)),
          typeChip(u.session)),
        attendanceBox(u.attendance),
        u.trainees.length ? traineeCards(u.trainees) : noTraineeYet(h),
        u.attendance && u.attendance.clockOut ? null
          : el('a', { href: '#/pass', class: 'btn btn-primary mt-4 w-full' }, icon('qr'), 'Show my QR pass'))),

      el('div', { class: 'flex items-center justify-between' },
        el('h2', { class: 'group-label' }, 'Coming up'),
        el('a', { href: '#/schedule', class: 'link mt-6 mb-2 text-xs' }, 'Full schedule')),
      later.length
        ? list(later.map((u) => el('div', { class: 'p-4' },
          el('div', { class: 'flex items-start justify-between gap-3' },
            el('div', { class: 'min-w-0' },
              el('p', { class: 'text-sm font-bold text-indigo-600 dark:text-indigo-400' }, fmtDay(u.session.date, today)),
              el('h3', { class: 'font-bold text-slate-900 dark:text-white' }, u.session.title),
              el('p', { class: 'text-sm muted' }, `${fmtTimes(u.session)}, `, venueLink(u.session))),
            badge("You're coming", 'emerald', 'tick')),
          u.trainees.length ? traineeChips(u.trainees) : el('p', { class: 'mt-2 text-xs muted' }, h.user.type === 'regular' ? 'No trainee yet.' : 'A MINDS admin will pair you with a trainee before the day.'),
          el('div', { class: 'mt-2' }, cantMakeIt(app, u, draw)))))
        : emptyState('calendar', 'No sessions yet', 'Pick the sessions you can come to from the schedule.',
          el('a', { href: h.guideRead === false ? '#/guide' : '#/schedule', class: 'btn btn-primary mt-5' }, h.guideRead === false ? 'Read the guide first' : 'Open the schedule')),

      h.myPairs && h.myPairs.length ? [
        el('h2', { class: 'group-label' }, 'Your regular trainees'),
        el('div', { class: 'flex flex-wrap gap-2' }, h.myPairs.map((x) => el('a', { href: `#/trainee/${encodeURIComponent(x.traineeId)}`, class: 'btn btn-secondary btn-sm' }, icon('heart', 'size-4 text-emerald-600'), x.traineeName))),
      ] : null);
  };
  return withHome(root, app, ctx, draw);
}

/* ---------------- QR pass ---------------- */

export function renderPass(root, app, ctx) {
  let shown = '';
  const signature = (h) => JSON.stringify([h.qr, h.upcoming.filter((u) => u.session.date === todaySG()), h.pendingFeedback.length]);
  const draw = (h) => {
    if (signature(h) === shown) return; // nothing changed: don't redraw (avoids QR flicker)
    shown = signature(h);
    const today = todaySG();
    const entry = (h.qr || []).find((q) => q.date === today);
    const todays = h.upcoming.filter((u) => u.session.date === today);
    const att = todays.map((u) => u.attendance).find(Boolean);
    const done = todays.length > 0 && todays.every((u) => u.attendance && u.attendance.clockOut);
    const canvas = el('canvas', { class: 'size-full', role: 'img', 'aria-label': 'Your volunteer QR code', dataset: { qr: entry ? entry.code : '' } });

    mount(root, el('div', { class: 'mx-auto max-w-sm text-center' },
      el('h1', { class: 'text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white' }, 'Your QR pass'),
      el('p', { class: 'mt-1 text-sm font-bold text-slate-700 dark:text-neutral-200' }, h.user.name),
      el('p', { class: 'font-mono text-xs muted' }, h.user.email),
      // QR stays dark-on-white in dark mode too, so cameras read it reliably.
      el('div', { class: 'mx-auto mt-5 flex aspect-square w-full max-w-[290px] items-center justify-center rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-neutral-800' },
        entry ? canvas : el('p', { class: 'p-4 text-sm font-bold text-amber-700' }, "Today's pass isn't saved on this phone yet. Connect to the internet and reopen this page.")),
      el('p', { class: 'mt-5 font-bold text-slate-900 dark:text-white' }, fmtDay(today, today)),
      todays.length
        ? todays.map((u) => el('p', { class: 'text-sm muted' }, `${u.session.title}, ${fmtTimes(u.session)}${u.trainees.length ? `, with ${u.trainees.map((t) => t.name).join(' and ')}` : ''}`))
        : el('p', { class: 'text-sm muted' }, 'No session today on your list. MINDS staff can still add you as a walk-in.'),
      att ? el('div', { class: 'mt-3' }, att.clockOut
        ? badge(`Clocked out, ${fmtHours(att.hours)}`, 'indigo', 'check')
        : badge(`Clocked in at ${clockTime(att.clockIn)}`, 'emerald', 'check')) : null,
      done
        ? el('div', { class: 'mt-4 space-y-3' },
          el('p', { class: 'alert alert-success' }, 'All done for today. Thank you for volunteering!'),
          h.pendingFeedback.length ? el('a', { href: `#/feedback/${h.pendingFeedback[0].bookingId}`, class: 'btn btn-primary w-full' }, 'Give feedback') : null)
        : el('p', { class: 'alert alert-info mt-4' }, 'Show this to MINDS staff to clock in, and again to clock out.'),
      el('p', { class: 'mt-3 text-xs muted' }, 'Turn your screen brightness up if the scan is slow.')));

    if (entry) {
      drawQr(canvas, entry.code, 250).catch((err) => canvas.replaceWith(el('p', { class: 'text-sm font-bold text-red-600' }, err.message)));
    }
  };

  const ready = withHome(root, app, ctx, draw);
  // While the pass is open, check every 20 s so it updates when staff scan it.
  const timer = setInterval(async () => {
    if (!ctx.alive() || document.hidden || navigator.onLine === false) return;
    try {
      const fresh = await app.fetchHome();
      if (ctx.alive()) draw(fresh);
    } catch {
      // keep showing the saved pass
    }
  }, 20000);
  ctx.onLeave(() => clearInterval(timer));
  return ready;
}

/* ---------------- Schedule ---------------- */

/** Plain-text list of sessions, for sharing with caregivers (Telegram, WhatsApp…). */
function scheduleText(sessions, today) {
  const lines = ['MINDS volunteering: upcoming sessions', ''];
  let last = '';
  sessions.forEach((s) => {
    if (s.date !== last) {
      if (last) lines.push('');
      lines.push(fmtDay(s.date, today));
      last = s.date;
    }
    lines.push(`• ${fmtTimes(s)}  ${s.title}${s.venue ? ` @ ${s.venue}` : ''}`);
  });
  return lines.join('\n');
}

export function renderSchedule(root, app, ctx) {
  let query = '';
  let latest = null;
  const picked = new Set();
  const host = el('div', {});
  const bar = el('div', { class: 'action-bar', hidden: true });

  const comeTo = (ids, btn) => {
    if (latest && latest.guideRead === false) {
      toast('Please read the Volunteer Guide before signing up for your first session.', 'warn');
      app.go('#/guide');
      return;
    }
    busy(btn, 'Saving…', async () => {
      try {
        const res = ids.length === 1
          ? await call('bookSession', { sessionId: ids[0] })
          : await call('signUpSessions', { sessionIds: ids });
        app.saveHome(res.home);
        latest = res.home;
        picked.clear();
        drawList();
        toast(res.message, res.results && res.results.some((r) => !r.ok) ? 'warn' : 'ok');
      } catch (err) {
        if (err.code !== 'GUIDE_REQUIRED') throw err;
        toast(err.message, 'warn');
        app.go('#/guide');
      }
    });
  };

  const drawBar = () => {
    bar.hidden = picked.size === 0;
    if (bar.hidden) return;
    const go = el('button', { class: 'btn btn-primary flex-1' }, icon('tick'), `I'm coming to ${picked.size} session${picked.size === 1 ? '' : 's'}`);
    go.addEventListener('click', () => comeTo([...picked], go));
    mount(bar, el('div', { class: 'mx-auto flex max-w-2xl gap-3' },
      el('button', { class: 'btn btn-secondary', onclick: () => { picked.clear(); drawList(); } }, 'Clear'), go));
  };

  const sessionRow = (s) => {
    const mine = Boolean(s.myBookingId);
    let action;
    if (mine) action = badge("You're coming", 'emerald', 'tick');
    else if (s.status === 'closed') action = badge('Sign-ups closed', 'slate');
    else if (s.spotsLeft === 0) action = badge('Full', 'red');
    else {
      const box = el('input', { type: 'checkbox', class: 'size-6 shrink-0 accent-indigo-600', checked: picked.has(s.sessionId), 'aria-label': `I'm coming to ${s.title} on ${fmtDay(s.date)}` });
      box.addEventListener('change', () => { if (box.checked) picked.add(s.sessionId); else picked.delete(s.sessionId); drawBar(); });
      action = el('label', { class: 'flex shrink-0 cursor-pointer flex-col items-center gap-0.5 text-[11px] font-bold muted' }, box, 'Coming');
    }
    let spots = null;
    if (s.spotsLeft !== null && !mine && s.status === 'open') {
      spots = s.spotsLeft === 0 ? null : badge(`${s.spotsLeft} spot${s.spotsLeft === 1 ? '' : 's'} left`, s.spotsLeft <= 2 ? 'amber' : 'emerald');
    }
    return el('div', { class: `flex items-start justify-between gap-3 p-4 ${mine ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''}` },
      el('div', { class: 'min-w-0' },
        el('h3', { class: 'font-bold text-slate-900 dark:text-white' }, s.title),
        el('p', { class: 'text-sm text-slate-700 dark:text-neutral-300' }, `${fmtTimes(s)}, `, venueLink(s)),
        s.notes ? el('p', { class: 'mt-1 text-sm muted' }, s.notes) : null,
        spots || s.project || typeChip(s) ? el('div', { class: 'mt-2 flex flex-wrap gap-1.5' }, typeChip(s), s.project ? badge(s.project, 'emerald') : null, spots) : null),
      action);
  };

  const share = async (btn) => {
    const h = latest;
    if (!h) return;
    const text = scheduleText(h.schedule, h.today);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'MINDS volunteering sessions', text });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Schedule copied. Paste it into a chat to share it.');
    } catch {
      toast('Take a screenshot of this page to share it.', 'warn');
    }
    btn.blur();
  };

  const drawList = () => {
    const h = latest;
    if (!h) return;
    const matches = fuzzyFilter(h.schedule, query, (s) => [s.title, s.type, s.venue, s.project, s.notes, fmtDay(s.date, h.today), s.date]);
    const byDate = {};
    matches.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push(s); });
    const dates = query.trim() ? [...new Set(matches.map((s) => s.date))] : Object.keys(byDate).sort();
    let empty = null;
    if (!h.schedule.length) empty = emptyState('calendar', 'No sessions planned yet', 'New sessions appear here as soon as MINDS adds them.');
    else if (!matches.length) empty = emptyState('search', 'No session matches that search', 'Try a different word, a venue or a day like "Sat".');
    mount(host,
      h.guideRead === false ? guideBanner() : null,
      empty ? el('div', { class: 'mt-6' }, empty) : null,
      dates.map((date) => [
        el('h2', { class: 'group-label' }, fmtDay(date, h.today)),
        list(byDate[date].map(sessionRow)),
      ]),
      el('div', { class: 'h-20' }));
    drawBar();
  };
  const shareBtn = el('button', { class: 'btn btn-secondary btn-sm shrink-0' }, icon('share', 'size-4'), 'Share');
  shareBtn.addEventListener('click', () => share(shareBtn));
  mount(root,
    el('div', { class: 'flex items-center justify-between gap-3' }, el('h1', { class: 'page-title' }, 'Schedule'), shareBtn),
    el('p', { class: 'mb-4 mt-1 text-sm muted' }, 'Every upcoming session. Tick the ones you can come to, then tap "I\'m coming". Share the list, or screenshot it, for trainees\' caregivers.'),
    searchBox('Search by activity, venue, project or day', (q) => { query = q; drawList(); }),
    host,
    bar);
  ctx.onLeave(() => bar.remove());
  return withHome(host, app, ctx, (h) => { latest = h; drawList(); });
}

/* ---------------- Me ---------------- */

function accordion(title, colour, ...body) {
  return el('details', { class: 'card group mt-3 overflow-hidden' },
    el('summary', { class: `section-head section-${colour} cursor-pointer list-none select-none` },
      title, icon('down', 'size-5 transition-transform duration-200 group-open:rotate-180')),
    el('div', { class: 'p-4' }, ...body));
}

export function renderMe(root, app, ctx) {
  const draw = (h) => {
    const u = h.user;
    const pwForm = el('form', { class: 'space-y-4', novalidate: true },
      field('currentPassword', 'Current password', { type: 'password', autocomplete: 'current-password' }),
      field('newPassword', 'New password', { type: 'password', autocomplete: 'new-password', hint: 'At least 8 characters. Other devices will be signed out.' }),
      el('button', { type: 'submit', class: 'btn btn-primary w-full' }, 'Change password'));
    pwForm.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(pwForm.querySelector('button[type=submit]'), 'Saving…', async () => {
        const res = await call('changePassword', { currentPassword: pwForm.currentPassword.value, newPassword: pwForm.newPassword.value });
        app.setToken(res.token);
        pwForm.reset();
        toast('Password changed. Other devices have been signed out.');
      });
    });
    const detail = (label, value) => el('div', { class: 'flex justify-between gap-4 py-2' },
      el('dt', { class: 'muted' }, label), el('dd', { class: 'text-right font-bold' }, value || '—'));
    const linkRow = (href, iconName, title, text, count) => el('a', { href, class: 'flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-neutral-900' },
      el('span', { class: 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-neutral-900 dark:text-neutral-300' }, icon(iconName)),
      el('span', { class: 'min-w-0 flex-1' },
        el('span', { class: 'block font-bold text-slate-900 dark:text-white' }, title),
        el('span', { class: 'block text-sm muted' }, text)),
      count ? badge(String(count), 'amber') : null,
      icon('chevron', 'size-5 text-slate-300 dark:text-neutral-700'));

    const adminCard = app.isAdmin
      ? el('div', { class: 'card mt-3 p-4' },
        el('div', { class: 'flex items-center gap-3' },
          el('span', { class: 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' }, icon('unlock')),
          el('div', { class: 'min-w-0 flex-1' },
            el('p', { class: 'font-bold text-slate-900 dark:text-white' }, 'Admin is open on this device'),
            el('p', { class: 'text-sm muted' }, `Until ${app.adminUntil}. Changes are recorded with your name.`))),
        el('div', { class: 'mt-3 flex gap-2' },
          el('a', { href: '#/admin', class: 'btn btn-primary btn-sm flex-1' }, icon('dashboard', 'size-4'), 'Go to admin'),
          el('button', { class: 'btn btn-secondary btn-sm', onclick: () => app.lockAdmin() }, icon('lock', 'size-4'), 'Leave admin')))
      : el('div', { class: 'card mt-3 flex items-center gap-3 p-4' },
        el('span', { class: 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-neutral-900 dark:text-neutral-300' }, icon('lock')),
        el('div', { class: 'min-w-0 flex-1' },
          el('p', { class: 'font-bold text-slate-900 dark:text-white' }, 'MINDS staff'),
          el('p', { class: 'text-sm muted' }, 'Sessions, pairing, scanning and records.')),
        el('button', { class: 'btn btn-secondary btn-sm shrink-0', onclick: () => app.openUnlock() }, 'Admin'));

    mount(root,
      el('div', { class: 'card flex items-center gap-4 p-5' },
        el('div', { class: 'flex size-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-xl font-extrabold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' }, initials(u.name)),
        el('div', { class: 'min-w-0' },
          el('h1', { class: 'truncate text-xl font-extrabold text-slate-900 dark:text-white' }, u.name),
          el('p', { class: 'truncate font-mono text-xs muted' }, u.email),
          el('div', { class: 'mt-1.5' }, typeBadge(u.type)))),
      el('div', { class: 'mt-3 grid grid-cols-2 gap-3' },
        el('div', { class: 'card p-4' }, el('p', { class: 'text-3xl font-extrabold text-indigo-600 dark:text-indigo-400' }, fmtHours(h.totals.hours)), el('p', { class: 'mt-1 text-xs font-bold uppercase tracking-wider muted' }, 'Hours volunteered')),
        el('div', { class: 'card p-4' }, el('p', { class: 'text-3xl font-extrabold text-emerald-600 dark:text-emerald-400' }, String(h.totals.sessions)), el('p', { class: 'mt-1 text-xs font-bold uppercase tracking-wider muted' }, h.totals.sessions === 1 ? 'Session' : 'Sessions'))),
      typeLine(h),
      el('h2', { class: 'group-label' }, 'History'),
      h.history.length
        ? list(h.history.map((a) => el('div', { class: 'flex items-center justify-between gap-3 p-4' },
          el('div', { class: 'min-w-0' },
            el('p', { class: 'font-bold text-slate-900 dark:text-white' }, a.sessionTitle),
            el('p', { class: 'text-sm muted' }, `${fmtDay(a.date, h.today)}, ${clockTime(a.clockIn)}–${clockTime(a.clockOut)}`)),
          badge(fmtHours(a.hours), 'indigo'))))
        : emptyState('clock', 'No completed sessions yet', 'Sessions you finish will be listed here with your hours.'),
      el('h2', { class: 'group-label' }, 'Account'),
      el('section', { class: 'card overflow-hidden' },
        el('div', { class: 'section-head section-blue' }, 'My details',
          el('a', { href: '#/edit-me', class: 'btn btn-secondary btn-sm normal-case tracking-normal' }, icon('pencil', 'size-4'), 'Edit')),
        el('dl', { class: 'divide-y divide-slate-100 px-4 py-2 text-sm dark:divide-neutral-800' },
          detail('Email', u.email), detail('Phone', u.phone), detail('Telegram', u.telegram ? `@${u.telegram}` : ''), detail('Birthday', u.birthday))),
      accordion('Change password', 'indigo', pwForm),
      el('div', { class: 'mt-3' }, list(linkRow('#/guide', 'book', 'Volunteer Guide', 'Projects, what to wear and what we expect'))),
      adminCard,
      el('button', { class: 'btn btn-danger mt-6 w-full', onclick: () => app.signOut() }, icon('logout'), 'Sign out'));
  };
  return withHome(root, app, ctx, draw);
}

/* ---------------- Feedback ---------------- */

export function renderFeedback(root, app, ctx, bookingId) {
  const draw = (h) => {
    const item = h.pendingFeedback.find((f) => f.bookingId === bookingId);
    if (!item) {
      mount(root, backLink('#/home'), el('p', { class: 'alert alert-success' }, 'Feedback for this session is already done. Thank you!'));
      return;
    }
    const submit = el('button', { type: 'submit', class: 'btn btn-primary flex-1' }, 'Send feedback');
    const form = el('form', { novalidate: true, class: 'space-y-6' },
      section('How did it go?', 'blue',
        el('div', {}, el('p', { class: 'label' }, 'Overall, how was the session?'), likert('rating', 'Very difficult', 'Went really well')),
        field('sessionFeedback', 'What went well, or what could be better?', { type: 'textarea', optional: true, maxlength: 5000 })),
      item.traineeName ? section(`About ${item.traineeName}`, 'green',
        field('traineeObservation', `Notes for future volunteers working with ${item.traineeName}`, {
          type: 'textarea', optional: true, rows: 4, maxlength: 5000,
          placeholder: 'e.g. Calmer with a 5-minute warning before changing activity. Loved the colouring sheets.',
          hint: `What helped, what to avoid, new skills or changes you noticed. A MINDS admin reads it first, then it is added to ${item.traineeName}'s notes for the next volunteer.`,
        })) : null,
      el('div', { class: 'action-bar' }, el('div', { class: 'mx-auto flex max-w-2xl gap-3' },
        el('a', { href: '#/home', class: 'btn btn-secondary' }, 'Not now'), submit)));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = formData(form);
      if (!d.rating && !d.sessionFeedback && !d.traineeObservation) {
        toast('Pick a rating or write a comment first.', 'warn');
        return;
      }
      busy(submit, 'Sending…', async () => {
        const res = await call('submitFeedback', {
          bookingId,
          rating: d.rating ? Number(d.rating) : '',
          sessionFeedback: d.sessionFeedback || '',
          traineeObservation: d.traineeObservation || '',
        });
        app.saveHome(res.home);
        toast(res.message);
        app.go('#/home');
      });
    });

    mount(root,
      backLink('#/home'),
      el('h1', { class: 'page-title' }, 'Session feedback'),
      el('p', { class: 'mb-6 mt-1 muted' }, `${item.sessionTitle}, ${fmtDay(item.date, h.today)}${item.traineeName ? `, with ${item.traineeName}` : ''}`),
      form);
  };
  // A form: draw once from cache (or fetch once) so typing is never interrupted.
  const cached = app.cachedHome();
  if (cached && cached.pendingFeedback.some((f) => f.bookingId === bookingId)) {
    draw(cached);
    return Promise.resolve();
  }
  mount(root, loading());
  return app.fetchHome().then((h) => { if (ctx.alive()) draw(h); })
    .catch((err) => { if (ctx.alive()) mount(root, errorBlock(err, () => app.rerender())); });
}
