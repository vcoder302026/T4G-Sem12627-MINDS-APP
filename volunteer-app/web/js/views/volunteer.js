// Volunteer screens: Home, QR pass, Sessions, Me, Feedback. (The Volunteer
// Guide is in content.js, the trainee card in trainees.js, Edit my details in profile.js.)
// Every screen draws instantly from what's saved on the phone, then refreshes.

import { call, isNetworkError } from '../api.js';
import { drawQr } from '../qr.js';
import {
  attachPicker, backLink, badge, busy, clockTime, el, errorBlock, field, fmtDay, fmtHours, fmtTimes, formData, fuzzyFilter, icon, initials, likert, loading, majorActionPrompt, mapsLink, mount, niceDates, projectBadges, searchBox, section, shortLabel, statusBadge, toast, todaySG, typeBadges,
} from '../ui.js';
import { traineeLine } from './trainees.js';
import { traineeName } from '../quickview.js';

/** Draw from cache, then from the server. `draw` gets the volunteerHome payload. */
async function withHome(root, app, ctx, draw) {
  const cached = app.cachedHome();
  if (cached) draw(cached);
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
    text ? el('p', { class: 'mt-1 text-sm' }, text) : null,
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

function guideBanner() {
  return el('a', { href: '#/guide', class: 'card mt-4 flex items-center gap-4 border-l-4 border-l-emerald-500 p-4 hover:shadow-md' },
    el('span', { class: 'flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }, icon('book', 'size-6')),
    el('span', { class: 'min-w-0 flex-1' },
      el('span', { class: 'block font-bold text-slate-900 dark:text-white' }, 'New here? Start with the Volunteer Guide'),
      null),
    icon('chevron', 'size-5 text-slate-400'));
}

const UNPAIRED_HINT = "You're on the list.";

/** A booking's trainees (one or several); older servers send just `trainee`. */
const traineesOf = (u) => u.trainees || (u.trainee ? [u.trainee] : []);


function attendanceBox(a) {
  if (!a) return null;
  return el('div', { class: 'alert alert-success mt-4 text-center' },
    a.clockOut
      ? badge('Clocked out', 'emerald', 'check')
      : badge('Clocked in today', 'emerald', 'check'),
    el('p', { class: 'mt-1.5 text-xs text-slate-600 dark:text-neutral-400' }, a.clockOut
      ? `${clockTime(a.clockIn)}–${clockTime(a.clockOut)}, ${fmtHours(a.hours)} recorded in Google Sheets.`
      : `Your clock-in was recorded at ${clockTime(a.clockIn)}. Show your pass again at the end to clock out.`));
}

function cancelButton(app, booking, redraw) {
  if (!booking.canCancel) return null;
  const btn = el('button', { class: 'text-sm font-bold text-red-600 hover:underline dark:text-red-400' }, "Can't make it");
  btn.addEventListener('click', async () => {
    if (!(await majorActionPrompt({ action: `taking yourself off ${booking.session.title}` }))) return;
    busy(btn, 'Saving…', async () => {
      const res = await call('cancelBooking', { bookingId: booking.bookingId });
      app.saveHome(res.home);
      redraw(res.home);
      toast(res.message);
    });
  });
  return btn;
}

/* ---------------- Home ---------------- */

export function renderHome(root, app, ctx) {
  const draw = (h) => {
    const today = h.today;
    const todays = h.upcoming.filter((u) => u.session.date === today);
    const later = h.upcoming.filter((u) => u.session.date !== today);

    const admin = app.cachedAdminHome();
    mount(root,
      el('div', { class: 'flex flex-wrap items-center gap-2' },
        el('h1', { class: 'page-title' }, `Welcome, ${h.user.shortName || firstName(h.user.name)}!`),
        el('span', { class: 'flex gap-1' }, typeBadges(h.user))),
      el('p', { class: 'mt-1 text-sm muted' }, h.totals.sessions
        ? `You've volunteered ${fmtHours(h.totals.hours)} over ${h.totals.sessions} session${h.totals.sessions === 1 ? '' : 's'}.`
        : null),
      h.guideRead === false ? guideBanner() : null,
      app.isAdmin && admin && (admin.unpairedTotal || admin.reviewCount) ? el('a', { href: '#/admin', class: 'card mt-4 flex items-center gap-3 border-l-4 border-l-purple-500 p-4 hover:shadow-md' },
        el('span', { class: 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' }, icon('shield', 'size-5')),
        el('span', { class: 'min-w-0 flex-1 text-sm' },
          el('span', { class: 'block font-bold text-slate-900 dark:text-white' }, 'Admin'),
          el('span', { class: 'block muted' }, [admin.unpairedTotal ? `${admin.unpairedTotal} to pair` : '', admin.reviewCount ? `${admin.reviewCount} note${admin.reviewCount === 1 ? '' : 's'} to review` : ''].filter(Boolean).join(' · '))),
        icon('chevron', 'size-5 text-slate-400')) : null,
      // Regulars: their fixed trainee, once. Details: press and hold, or tap.
      (h.regularTrainees || (h.regularTrainee ? [h.regularTrainee] : [])).map((t, i, all) => traineeLine(t, 'standing', all.length > 1 ? `Your regular trainee (${i + 1} of ${all.length})` : 'Your regular trainee')),

      h.pendingFeedback.map((f) => el('div', { class: 'card mt-4 border-l-4 border-l-amber-400 p-4' },
        badge('Feedback needed', 'amber', 'message'),
        el('p', { class: 'mt-2 font-bold text-slate-900 dark:text-white' }, `How did ${f.sessionTitle} go?`),
        f.traineeName ? el('p', { class: 'text-sm muted' }, `With ${f.traineeName}`) : null,
        el('a', { href: `#/feedback/${f.bookingId}`, class: 'btn btn-primary btn-sm mt-3' }, 'Give feedback'))),

      todays.length ? el('h2', { class: 'group-label' }, 'Today') : null,
      todays.map((u) => el('article', { class: 'card mb-3 border-t-4 border-t-indigo-500 p-5' },
        el('div', { class: 'flex items-start justify-between gap-3' },
          el('div', { class: 'min-w-0' },
            el('h3', { class: 'text-xl font-extrabold leading-snug text-slate-900 dark:text-white' }, u.session.title),
            sessionMeta(u.session)),
          u.attendance ? null : statusBadge(u.status)),
        attendanceBox(u.attendance),
        traineesOf(u).map((t) => traineeLine(t, u.pairing)),
        !traineesOf(u).length && !u.attendance ? el('p', { class: 'alert alert-info mt-4' }, UNPAIRED_HINT) : null,
        u.attendance && u.attendance.clockOut ? null
          : el('a', { href: '#/pass', class: 'btn btn-primary mt-4 w-full' }, icon('qr'), 'Show my QR pass'))),

      el('h2', { class: 'group-label' }, 'Coming up'),
      later.length
        ? list(later.map((u) => el('div', { class: 'p-4' },
          el('div', { class: 'flex items-start justify-between gap-3' },
            el('div', { class: 'min-w-0' },
              el('p', { class: 'text-sm font-bold text-indigo-600 dark:text-indigo-400' }, fmtDay(u.session.date, today)),
              el('h3', { class: 'font-bold text-slate-900 dark:text-white' }, u.session.title),
              el('p', { class: 'text-sm muted' }, `${fmtTimes(u.session)}, `, venueLink(u.session))),
            statusBadge(u.status)),
          traineesOf(u).length ? null : el('p', { class: 'mt-2 text-xs muted' }, UNPAIRED_HINT),
          traineesOf(u).map((t) => traineeLine(t, u.pairing)),
          el('div', { class: 'mt-2' }, cancelButton(app, u, draw)))))
        : emptyState('calendar', "You haven't signed up for any sessions", null,
          el('a', { href: h.guideRead === false ? '#/guide' : '#/sessions', class: 'btn btn-primary mt-5' }, h.guideRead === false ? 'Read the guide first' : 'Find a session')));
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
        ? todays.map((u) => el('p', { class: 'text-sm muted' }, `${u.session.title}, ${fmtTimes(u.session)}`))
        : el('p', { class: 'text-sm muted' }, "You haven't signed up for a session today."),
      att ? el('div', { class: 'mt-3' }, att.clockOut
        ? badge(`Clocked out, ${fmtHours(att.hours)}`, 'indigo', 'check')
        : badge(`Clocked in at ${clockTime(att.clockIn)}`, 'emerald', 'check')) : null,
      done
        ? el('div', { class: 'mt-4 space-y-3' },
          el('p', { class: 'alert alert-success' }, 'All done for today. Thank you for volunteering!'),
          h.pendingFeedback.length ? el('a', { href: `#/feedback/${h.pendingFeedback[0].bookingId}`, class: 'btn btn-primary w-full' }, 'Give feedback') : null)
        : el('p', { class: 'alert alert-info mt-4' }, 'Show this to an admin to clock in, and again to clock out.'),
      el('p', { class: 'mt-3 text-xs muted' }, 'Turn your screen brightness up if the scan is slow.')));

    if (entry) {
      drawQr(canvas, entry.code, 250).catch((err) => canvas.replaceWith(el('p', { class: 'text-sm font-bold text-red-600' }, err.message)));
    }
  };

  const ready = withHome(root, app, ctx, draw);
  // While the pass is open, check every 20 s so it updates when an admin scans.
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

/* ---------------- Sessions ---------------- */

export function renderSessions(root, app, ctx) {
  let query = '';
  let latest = null;
  const chosen = new Set();
  const host = el('div', {});
  const bar = el('div', { class: 'action-bar', hidden: true });

  const drawBar = () => {
    bar.hidden = chosen.size === 0;
    if (!chosen.size) return;
    const go = el('button', { class: 'btn btn-primary flex-1' }, icon('tick'), `I'm coming to ${chosen.size} session${chosen.size === 1 ? '' : 's'}`);
    go.addEventListener('click', () => {
      if (latest && latest.guideRead === false) {
        toast('Please read the Volunteer Guide before signing up for your first session.', 'warn');
        app.go('#/guide');
        return;
      }
      busy(go, 'Saving…', async () => {
        try {
          const res = await call('bookSessions', { sessionIds: [...chosen] });
          chosen.clear();
          app.saveHome(res.home);
          latest = res.home;
          drawList();
          toast(res.message, res.results.some((r) => !r.ok) ? 'warn' : 'ok');
        } catch (err) {
          if (err.code !== 'GUIDE_REQUIRED') throw err;
          toast(err.message, 'warn');
          app.go('#/guide');
        }
      });
    });
    mount(bar, el('div', { class: 'mx-auto flex max-w-2xl gap-3' },
      el('button', { class: 'btn btn-secondary', onclick: () => { chosen.clear(); drawList(); } }, 'Clear'), go));
  };

  const sessionRow = (s) => {
    const full = s.spotsLeft === 0 && !s.myStatus;
    let spots = null;
    if (s.spotsLeft !== null && !s.myStatus) {
      spots = s.spotsLeft === 0 ? badge('No spots left', 'red')
        : badge(`${s.spotsLeft} spot${s.spotsLeft === 1 ? '' : 's'} left`, s.spotsLeft <= 2 ? 'amber' : 'emerald');
    }
    let action;
    if (s.myStatus) action = badge("You're coming", 'emerald', 'tick');
    else if (full) action = el('span', { class: 'text-sm font-bold muted' }, 'Full');
    else {
      action = el('input', { type: 'checkbox', class: 'size-6 accent-indigo-600', checked: chosen.has(s.sessionId), 'aria-label': `I'm coming to ${s.title}, ${fmtDay(s.date, latest.today)}` });
      action.addEventListener('change', () => {
        if (action.checked) chosen.add(s.sessionId);
        else chosen.delete(s.sessionId);
        drawList();
      });
    }
    // "You're coming" sits above the title, so it never squeezes the text on a phone.
    const coming = s.myStatus ? action : null;
    if (coming) action = null;
    const rowEl = el(s.myStatus || full ? 'div' : 'label', { class: `flex items-start justify-between gap-3 p-4 ${chosen.has(s.sessionId) ? 'select-ring' : ''} ${s.myStatus || full ? '' : 'cursor-pointer'}` },
      el('div', { class: 'min-w-0 flex-1' },
        coming ? el('div', { class: 'mb-1.5' }, coming) : null,
        el('h3', { class: 'font-bold text-slate-900 dark:text-white' }, s.title),
        el('p', { class: 'text-sm text-slate-700 dark:text-neutral-300' }, `${fmtTimes(s)}, `, venueLink(s)),
        s.notes ? el('p', { class: 'mt-1 text-sm muted' }, s.notes) : null,
        spots || (s.projects && s.projects.length) ? el('div', { class: 'mt-2 flex flex-wrap gap-1.5' }, projectBadges(s.projects), spots) : null),
      action ? el('span', { class: 'shrink-0' }, action) : null);
    return rowEl;
  };
  const drawList = () => {
    const h = latest;
    if (!h) return;
    const matches = fuzzyFilter(h.openSessions, query, (s) => [s.title, s.venue, s.project, s.notes, fmtDay(s.date, h.today), s.date]);
    const byDate = {};
    matches.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push(s); });
    const dates = query.trim() ? [...new Set(matches.map((s) => s.date))] : Object.keys(byDate).sort();
    let empty = null;
    if (!h.openSessions.length) empty = emptyState('calendar', 'No upcoming sessions right now', 'New sessions appear here as soon as an admin adds them.');
    else if (!matches.length) empty = emptyState('search', 'No session matches that search', 'Try a different word, a venue or a day like "Sat".');
    mount(host,
      h.guideRead === false ? guideBanner() : null,
      empty ? el('div', { class: 'mt-6' }, empty) : null,
      dates.map((date) => [
        el('h2', { class: 'group-label' }, fmtDay(date, h.today)),
        list(byDate[date].map(sessionRow)),
      ]),
      chosen.size ? el('div', { class: 'h-24' }) : null);
    drawBar();
  };
  mount(root,
    el('h1', { class: 'page-title' }, 'Upcoming sessions'),
    el('p', { class: 'mb-4 mt-1 text-sm muted' }, "Tick the sessions you can come to."),
    searchBox('Search by activity, venue, project or day', (q) => { query = q; drawList(); }),
    host, bar);
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
      field('newPassword', 'New password', { type: 'password', autocomplete: 'new-password', hint: 'At least 8 characters.' }),
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
    // Label and answer side by side (as on an admin's volunteer page): short labels, readable dates.
    const detail = (label, value) => el('div', { class: 'py-2' },
      el('dt', { class: 'muted' }, shortLabel(label)), el('dd', { class: 'font-bold' }, (typeof value === 'string' ? niceDates(value) : value) || '—'));
    const group = (title) => el('p', { class: 'dl-group' }, title);
    const answers = (u.answers || []).filter((a) => a.value);
    const isEmergency = (a) => /emergency/i.test(`${a.key} ${a.label}`);
    const linkRow = (href, iconName, title, text, count) => el('a', { href, class: 'flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-neutral-900' },
      el('span', { class: 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-neutral-900 dark:text-neutral-300' }, icon(iconName)),
      el('span', { class: 'min-w-0 flex-1' },
        el('span', { class: 'block font-bold text-slate-900 dark:text-white' }, title),
        text ? el('span', { class: 'block text-sm muted' }, text) : null),
      count ? badge(String(count), 'amber') : null,
      icon('chevron', 'size-5 text-slate-300 dark:text-neutral-700'));

    mount(root,
      el('div', { class: 'card flex items-center gap-4 p-5' },
        el('div', { class: 'flex size-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-xl font-extrabold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' }, initials(u.name)),
        el('div', { class: 'min-w-0' },
          el('h1', { class: 'truncate text-xl font-extrabold text-slate-900 dark:text-white' }, u.name),
          el('p', { class: 'truncate font-mono text-xs muted' }, u.email),
          el('div', { class: 'mt-1.5 flex flex-wrap gap-1' }, typeBadges(h.user)))),
      el('div', { class: 'mt-3 grid grid-cols-2 gap-3' },
        el('div', { class: 'card p-4' }, el('p', { class: 'text-3xl font-extrabold text-indigo-600 dark:text-indigo-400' }, fmtHours(h.totals.hours)), el('p', { class: 'mt-1 text-xs font-bold uppercase tracking-wider muted' }, 'Hours volunteered')),
        el('div', { class: 'card p-4' }, el('p', { class: 'text-3xl font-extrabold text-emerald-600 dark:text-emerald-400' }, String(h.totals.sessions)), el('p', { class: 'mt-1 text-xs font-bold uppercase tracking-wider muted' }, h.totals.sessions === 1 ? 'Session' : 'Sessions'))),
      el('h2', { class: 'group-label' }, 'History'),
      h.history.length
        ? list(h.history.map((a) => el('div', { class: 'flex items-center justify-between gap-3 p-4' },
          el('div', { class: 'min-w-0' },
            el('p', { class: 'font-bold text-slate-900 dark:text-white' }, a.sessionTitle),
            el('p', { class: 'text-sm muted' }, `${fmtDay(a.date, h.today)}, ${clockTime(a.clockIn)}–${clockTime(a.clockOut)}`),
            // Who they were with. The name opens the trainee's details while they may still see them.
            el('p', { class: 'mt-0.5 text-sm' }, traineesOf(a).length
              ? ['With ', traineesOf(a).map((t, i) => [i ? ', ' : '', t.canView ? traineeName(t.name, t.id, 'font-bold') : el('span', { class: 'font-bold' }, t.name)])]
              : el('span', { class: 'muted' }, 'No trainee paired'))),
          badge(fmtHours(a.hours), 'indigo'))))
        : emptyState('clock', 'No completed sessions yet', 'Sessions you finish will be listed here with your hours.'),
      el('h2', { class: 'group-label' }, 'Account'),
      el('section', { class: 'card overflow-hidden' },
        el('div', { class: 'section-head section-blue' }, 'My details',
          el('a', { href: '#/edit-me', class: 'btn btn-secondary btn-sm normal-case tracking-normal' }, icon('pencil', 'size-4'), 'Edit')),
        el('dl', { class: 'person-facts divide-y divide-slate-100 px-4 py-2 text-sm dark:divide-neutral-800' },
          group('Contact'),
          detail('Email', u.email), detail('Phone', u.phone), detail('Telegram', u.telegram ? `@${u.telegram}` : ''),
          group('Personal'),
          detail('Birthday', u.birthday),
          answers.filter((a) => !isEmergency(a)).map((a) => detail(a.label, a.value)),
          answers.some(isEmergency) ? group('Emergency contact') : null,
          answers.filter(isEmergency).map((a) => detail(a.label, a.value)))),
      accordion('Change password', 'indigo', pwForm),
      el('div', { class: 'mt-3' }, list(linkRow('#/guide', 'book', 'Volunteer Guide', ''))),
      el('button', { class: 'btn btn-danger mt-3 w-full', onclick: () => app.signOut() }, icon('logout'), 'Sign out'));
  };
  return withHome(root, app, ctx, draw);
}

/* ---------------- Feedback ---------------- */

/** The trainees a pending feedback item is about (older servers send only the names). */
const feedbackTrainees = (item) => item.trainees || [];

export function renderFeedback(root, app, ctx, bookingId) {
  const draw = (h) => {
    const item = h.pendingFeedback.find((f) => f.bookingId === bookingId);
    if (!item) {
      mount(root, backLink('#/home'), el('p', { class: 'alert alert-success' }, 'Feedback for this session is already done. Thank you!'));
      return;
    }
    const submit = el('button', { type: 'submit', class: 'btn btn-primary flex-1' }, 'Send feedback');
    const pickers = Object.fromEntries(feedbackTrainees(item).map((t) => [t.id, attachPicker()])); // files about each trainee
    const form = el('form', { novalidate: true, class: 'space-y-6' },
      section('How did it go?', 'blue',
        el('div', {}, el('p', { class: 'label' }, 'Overall, how was the session?'), likert('rating', 'Very difficult', 'Went really well')),
        field('sessionFeedback', 'What went well, or what could be better?', { type: 'textarea', optional: true, maxlength: 5000 })),
      // One box per trainee they were with (a volunteer can be paired with several).
      feedbackTrainees(item).map((t) => section(`About ${t.name}`, 'green',
        field(`obs-${t.id}`, `Notes for volunteers working with ${t.name}`, {
          type: 'textarea', optional: true, rows: 4, maxlength: 5000,
          placeholder: 'e.g. Calmer with a 5-minute warning before changing activity. Loved the colouring sheets.',
        }),
        pickers[t.id].el)),
      el('div', { class: 'action-bar' }, el('div', { class: 'mx-auto flex max-w-2xl gap-3' },
        el('a', { href: '#/home', class: 'btn btn-secondary' }, 'Not now'), submit)));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = formData(form);
      const observations = feedbackTrainees(item).map((t) => ({ traineeId: t.id, note: (d[`obs-${t.id}`] || '').trim(), picker: pickers[t.id] })).filter((o) => o.note);
      if (!d.rating && !d.sessionFeedback && !observations.length) {
        toast('Pick a rating or write a comment first.', 'warn');
        return;
      }
      busy(submit, 'Sending…', async () => {
        const withFiles = [];
        for (const o of observations) withFiles.push({ traineeId: o.traineeId, note: o.note, files: await o.picker.files() });
        const res = await call('submitFeedback', {
          bookingId,
          rating: d.rating ? Number(d.rating) : '',
          sessionFeedback: d.sessionFeedback || '',
          observations: withFiles,
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
