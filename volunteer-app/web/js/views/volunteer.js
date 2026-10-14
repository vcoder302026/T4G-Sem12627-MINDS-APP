// Volunteer screens: Home, QR pass, Sessions, Me, Feedback.
// Every screen draws instantly from what's saved on the phone, then refreshes.

import { call, isNetworkError } from '../api.js';
import { drawQr } from '../qr.js';
import {
  backLink, badge, busy, clockTime, el, errorBlock, field, fmtDay, fmtHours, fmtTimes, formData, icon, initials,
  likert, loading, mount, section, statusBadge, toast, todaySG,
} from '../ui.js';

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
    el('p', { class: 'mt-1 text-sm' }, text),
    action || null);
}

function sessionMeta(s) {
  return [
    el('p', { class: 'mt-1 flex items-center gap-1.5 text-sm text-slate-700 dark:text-neutral-300' }, icon('clock', 'size-4 text-slate-400'), fmtTimes(s)),
    el('p', { class: 'mt-0.5 flex items-center gap-1.5 text-sm muted' }, icon('pin', 'size-4 text-slate-400'), s.venue || 'Venue to be confirmed'),
  ];
}

function traineeBlock(trainee) {
  if (!trainee) return null;
  return el('div', { class: 'well mt-4 p-4' },
    el('p', { class: 'text-xs font-bold uppercase tracking-wider muted' }, 'Your trainee'),
    el('p', { class: 'mt-0.5 text-lg font-bold text-slate-900 dark:text-white' }, trainee.name),
    trainee.fields.length
      ? el('dl', { class: 'mt-2 space-y-1.5 text-sm' }, trainee.fields.map((f) =>
        el('div', {}, el('dt', { class: 'inline font-bold text-slate-700 dark:text-neutral-200' }, `${f.label}: `), el('dd', { class: 'inline text-slate-600 dark:text-neutral-400' }, f.value))))
      : null);
}

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
  const btn = el('button', { class: 'text-sm font-bold text-red-600 hover:underline dark:text-red-400' }, 'Cancel booking');
  btn.addEventListener('click', () => {
    if (!confirm(`Cancel your booking for ${booking.session.title}?`)) return;
    busy(btn, 'Cancelling…', async () => {
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

    mount(root,
      el('h1', { class: 'page-title' }, `Welcome, ${firstName(h.user.name)}!`),
      el('p', { class: 'mt-1 text-sm muted' }, h.totals.sessions
        ? `You've volunteered ${fmtHours(h.totals.hours)} over ${h.totals.sessions} session${h.totals.sessions === 1 ? '' : 's'}.`
        : 'Your volunteering hours will show here after your first session.'),

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
          u.attendance ? null : statusBadge(u.status)),
        attendanceBox(u.attendance),
        traineeBlock(u.trainee),
        u.status === 'pending' && !u.attendance
          ? el('p', { class: 'alert alert-info mt-4' }, 'You can still come: your leader confirms you when they scan your pass.')
          : null,
        u.attendance && u.attendance.clockOut ? null
          : el('a', { href: '#/pass', class: 'btn btn-primary mt-4 w-full' }, icon('qr'), 'Show my QR pass'))),

      el('h2', { class: 'group-label' }, 'Coming up'),
      later.length
        ? list(later.map((u) => el('div', { class: 'p-4' },
          el('div', { class: 'flex items-start justify-between gap-3' },
            el('div', { class: 'min-w-0' },
              el('p', { class: 'text-sm font-bold text-indigo-600 dark:text-indigo-400' }, fmtDay(u.session.date, today)),
              el('h3', { class: 'font-bold text-slate-900 dark:text-white' }, u.session.title),
              el('p', { class: 'text-sm muted' }, `${fmtTimes(u.session)}, ${u.session.venue}`)),
            statusBadge(u.status)),
          traineeBlock(u.trainee),
          el('div', { class: 'mt-2' }, cancelButton(app, u, draw)))))
        : emptyState('calendar', 'No sessions booked yet', 'Find a session that suits you and book a slot.',
          el('a', { href: '#/sessions', class: 'btn btn-primary mt-5' }, 'Find a session')));
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
        : el('p', { class: 'text-sm muted' }, 'No session booked today. A leader can still add you as a walk-in.'),
      att ? el('div', { class: 'mt-3' }, att.clockOut
        ? badge(`Clocked out, ${fmtHours(att.hours)}`, 'indigo', 'check')
        : badge(`Clocked in at ${clockTime(att.clockIn)}`, 'emerald', 'check')) : null,
      done
        ? el('div', { class: 'mt-4 space-y-3' },
          el('p', { class: 'alert alert-success' }, 'All done for today. Thank you for volunteering!'),
          h.pendingFeedback.length ? el('a', { href: `#/feedback/${h.pendingFeedback[0].bookingId}`, class: 'btn btn-primary w-full' }, 'Give feedback') : null)
        : el('p', { class: 'alert alert-info mt-4' }, 'Show this to your volunteer leader to clock in, and again to clock out.'),
      el('p', { class: 'mt-3 text-xs muted' }, 'Turn your screen brightness up if the scan is slow.')));

    if (entry) {
      drawQr(canvas, entry.code, 250).catch((err) => canvas.replaceWith(el('p', { class: 'text-sm font-bold text-red-600' }, err.message)));
    }
  };

  const ready = withHome(root, app, ctx, draw);
  // While the pass is open, check every 20 s so it updates when the leader scans.
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
  const draw = (h) => {
    const byDate = {};
    h.openSessions.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push(s); });
    const dates = Object.keys(byDate).sort();
    mount(root,
      el('h1', { class: 'page-title' }, 'Find a session'),
      el('p', { class: 'mt-1 text-sm muted' }, 'Tap Book to ask for a slot. A leader confirms it and pairs you with a trainee.'),
      dates.length ? null : el('div', { class: 'mt-6' }, emptyState('calendar', 'No sessions open right now', 'New sessions appear here as soon as a leader posts them.')),
      dates.map((date) => [
        el('h2', { class: 'group-label' }, fmtDay(date, h.today)),
        list(byDate[date].map((s) => {
          const full = s.spotsLeft === 0 && !s.myStatus;
          let action;
          if (s.myStatus) {
            action = statusBadge(s.myStatus);
          } else {
            action = el('button', { class: 'btn btn-primary btn-sm shrink-0', disabled: full }, full ? 'Full' : 'Book');
            action.addEventListener('click', () => busy(action, '', async () => {
              const res = await call('bookSession', { sessionId: s.sessionId });
              app.saveHome(res.home);
              draw(res.home);
              toast(res.message);
            }));
          }
          let spots = null;
          if (s.spotsLeft !== null && !s.myStatus) {
            spots = s.spotsLeft === 0 ? badge('No spots left', 'red')
              : badge(`${s.spotsLeft} spot${s.spotsLeft === 1 ? '' : 's'} left`, s.spotsLeft <= 2 ? 'amber' : 'emerald');
          }
          return el('div', { class: 'flex items-start justify-between gap-3 p-4' },
            el('div', { class: 'min-w-0' },
              el('h3', { class: 'font-bold text-slate-900 dark:text-white' }, s.title),
              el('p', { class: 'text-sm text-slate-700 dark:text-neutral-300' }, `${fmtTimes(s)}, ${s.venue}`),
              s.notes ? el('p', { class: 'mt-1 text-sm muted' }, s.notes) : null,
              spots ? el('div', { class: 'mt-2' }, spots) : null),
            action);
        })),
      ]));
  };
  return withHome(root, app, ctx, draw);
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

    mount(root,
      el('div', { class: 'card flex items-center gap-4 p-5' },
        el('div', { class: 'flex size-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-xl font-extrabold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' }, initials(u.name)),
        el('div', { class: 'min-w-0' },
          el('h1', { class: 'truncate text-xl font-extrabold text-slate-900 dark:text-white' }, u.name),
          el('p', { class: 'truncate font-mono text-xs muted' }, u.email),
          el('div', { class: 'mt-1.5' }, u.role === 'admin' ? badge('Volunteer leader', 'purple', 'shield') : badge('Volunteer', 'indigo')))),
      el('div', { class: 'mt-3 grid grid-cols-2 gap-3' },
        el('div', { class: 'card p-4' }, el('p', { class: 'text-3xl font-extrabold text-indigo-600 dark:text-indigo-400' }, fmtHours(h.totals.hours)), el('p', { class: 'mt-1 text-xs font-bold uppercase tracking-wider muted' }, 'Hours volunteered')),
        el('div', { class: 'card p-4' }, el('p', { class: 'text-3xl font-extrabold text-emerald-600 dark:text-emerald-400' }, String(h.totals.sessions)), el('p', { class: 'mt-1 text-xs font-bold uppercase tracking-wider muted' }, h.totals.sessions === 1 ? 'Session' : 'Sessions'))),
      el('h2', { class: 'group-label' }, 'History'),
      h.history.length
        ? list(h.history.map((a) => el('div', { class: 'flex items-center justify-between gap-3 p-4' },
          el('div', { class: 'min-w-0' },
            el('p', { class: 'font-bold text-slate-900 dark:text-white' }, a.sessionTitle),
            el('p', { class: 'text-sm muted' }, `${fmtDay(a.date, h.today)}, ${clockTime(a.clockIn)}–${clockTime(a.clockOut)}`)),
          badge(fmtHours(a.hours), 'indigo'))))
        : emptyState('clock', 'No completed sessions yet', 'Sessions you finish will be listed here with your hours.'),
      el('h2', { class: 'group-label' }, 'Account'),
      accordion('My details', 'blue',
        el('dl', { class: 'divide-y divide-slate-100 text-sm dark:divide-neutral-800' },
          detail('Phone', u.phone), detail('Telegram', u.telegram ? `@${u.telegram}` : ''), detail('Birthday', u.birthday),
          detail('Emergency contact', `${u.emergencyName}${u.emergencyRelation ? ` (${u.emergencyRelation})` : ''}`),
          detail('Emergency phone', u.emergencyPhone)),
        el('p', { class: 'hint' }, 'To change these, ask a volunteer leader.')),
      accordion('Change password', 'indigo', pwForm),
      u.role === 'admin'
        ? el('a', { href: '#/mode', class: 'btn btn-secondary mt-6 w-full' }, icon('dashboard'), 'Switch mode')
        : null,
      el('button', { class: 'btn btn-danger mt-3 w-full', onclick: () => app.signOut() }, icon('logout'), 'Sign out'));
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
        field('traineeObservation', `Anything you noticed about ${item.traineeName}?`, {
          type: 'textarea', optional: true, rows: 4, maxlength: 5000,
          hint: `New skills, mood, what helped or upset them. MINDS staff use this to update ${item.traineeName}'s records.`,
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
