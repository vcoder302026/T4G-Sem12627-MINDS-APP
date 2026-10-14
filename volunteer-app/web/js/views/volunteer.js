// Volunteer screens: Home, Pass (QR), Sessions, Me, Feedback.
// Every screen draws instantly from what's saved on the phone, then refreshes.

import { call, isNetworkError } from '../api.js';
import { drawQr } from '../qr.js';
import {
  backLink, busy, chip, clockTime, el, errorBlock, fmtDay, fmtHours, fmtTimes, formData, icon, loading, mount,
  statusChip, toast, todaySG,
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

function panel(...children) {
  return el('div', { class: 'divide-y divide-line overflow-hidden rounded-xl border border-line bg-white' }, ...children);
}

function traineeBlock(trainee) {
  if (!trainee) return null;
  return el('div', { class: 'mt-3 border-l-4 border-strap pl-3' },
    el('p', { class: 'font-bold' }, `You're paired with ${trainee.name}`),
    trainee.fields.length
      ? el('dl', { class: 'mt-1 space-y-1 text-sm' }, trainee.fields.map((f) =>
        el('div', {}, el('dt', { class: 'inline font-bold' }, `${f.label}: `), el('dd', { class: 'inline' }, f.value))))
      : null);
}

function attendanceLine(a) {
  if (!a) return null;
  if (a.clockOut) return el('p', { class: 'mt-2 flex items-center gap-1.5 font-bold text-out' }, icon('check', 'size-5'), `Done: ${clockTime(a.clockIn)}–${clockTime(a.clockOut)}, ${fmtHours(a.hours)}`);
  return el('p', { class: 'mt-2 flex items-center gap-1.5 font-bold text-go' }, icon('clock', 'size-5'), `Clocked in at ${clockTime(a.clockIn)}`);
}

function cancelButton(app, booking, redraw) {
  if (!booking.canCancel) return null;
  const btn = el('button', { class: 'text-sm font-bold text-stop underline underline-offset-4' }, 'Cancel booking');
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
      el('h1', { class: 'text-2xl font-bold' }, `Hi ${firstName(h.user.name)}`),
      el('p', { class: 'text-ink-soft' }, h.totals.sessions
        ? `You've volunteered ${fmtHours(h.totals.hours)} over ${h.totals.sessions} session${h.totals.sessions === 1 ? '' : 's'}.`
        : 'Your volunteering hours will show here after your first session.'),

      h.pendingFeedback.map((f) => el('a', {
        href: `#/feedback/${f.bookingId}`,
        class: 'mt-4 block rounded-xl bg-strap-tint p-4 ring-1 ring-strap/40',
      },
      el('p', { class: 'font-bold' }, `How did ${f.sessionTitle} go?`),
      el('p', { class: 'text-sm' }, f.traineeName
        ? `A minute of feedback helps MINDS staff support ${f.traineeName}.`
        : 'A minute of feedback helps the team plan better sessions.'),
      el('span', { class: 'btn btn-go btn-sm mt-3' }, 'Give feedback'))),

      todays.length ? el('h2', { class: 'section-title' }, 'Today') : null,
      todays.map((u) => el('article', { class: 'mb-3 rounded-xl border-2 border-go bg-white p-4' },
        el('div', { class: 'flex items-start justify-between gap-3' },
          el('div', {},
            el('h3', { class: 'text-xl font-bold leading-snug' }, u.session.title),
            el('p', { class: 'mt-0.5' }, fmtTimes(u.session)),
            el('p', { class: 'flex items-center gap-1 text-sm text-ink-soft' }, icon('pin', 'size-4'), u.session.venue || 'Venue to be confirmed')),
          u.attendance ? null : statusChip(u.status)),
        attendanceLine(u.attendance),
        traineeBlock(u.trainee),
        u.status === 'pending' ? el('p', { class: 'mt-3 text-sm text-ink-soft' }, "You can still come: your leader will confirm you when they scan your pass.") : null,
        u.attendance && u.attendance.clockOut ? null
          : el('a', { href: '#/pass', class: 'btn btn-go mt-4 w-full' }, icon('pass', 'size-5'), 'Show my pass'))),

      el('h2', { class: 'section-title' }, 'Coming up'),
      later.length
        ? panel(later.map((u) => el('div', { class: 'p-4' },
          el('div', { class: 'flex items-start justify-between gap-3' },
            el('div', {},
              el('p', { class: 'text-sm font-bold text-go' }, fmtDay(u.session.date, today)),
              el('h3', { class: 'font-bold' }, u.session.title),
              el('p', { class: 'text-sm text-ink-soft' }, `${fmtTimes(u.session)}, ${u.session.venue}`)),
            statusChip(u.status)),
          traineeBlock(u.trainee),
          el('div', { class: 'mt-2' }, cancelButton(app, u, draw)))))
        : el('div', { class: 'rounded-xl border border-dashed border-line p-6 text-center' },
          el('p', { class: 'mb-3 text-ink-soft' }, 'No sessions booked yet.'),
          el('a', { href: '#/sessions', class: 'btn btn-go' }, 'Find a session')));
  };
  return withHome(root, app, ctx, draw);
}

/* ---------------- Pass ---------------- */

export function renderPass(root, app, ctx) {
  let shown = '';
  const signature = (h) => JSON.stringify([h.qr, h.upcoming.filter((u) => u.session.date === todaySG()), h.pendingFeedback.length]);
  const draw = (h) => {
    if (signature(h) === shown) return; // nothing changed: don't redraw (avoids QR flicker)
    shown = signature(h);
    const today = todaySG();
    const entry = (h.qr || []).find((q) => q.date === today);
    const todays = h.upcoming.filter((u) => u.session.date === today);
    const canvas = el('canvas', { class: 'mx-auto my-3 rounded', role: 'img', 'aria-label': 'Your volunteer QR code', dataset: { qr: entry ? entry.code : '' } });
    const att = todays.map((u) => u.attendance).find(Boolean);
    const done = todays.length && todays.every((u) => u.attendance && u.attendance.clockOut);

    mount(root, el('div', { class: 'mx-auto max-w-xs pt-2' },
      el('div', { class: 'pass-strap mx-auto h-14 w-20 rounded-t-md', 'aria-hidden': 'true' }),
      el('section', { class: 'overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-line', 'aria-label': 'Volunteer pass' },
        el('div', { class: 'pass-hole mx-auto mt-3 h-2.5 w-14 rounded-full bg-paper', 'aria-hidden': 'true' }),
        el('div', { class: 'px-5 pb-5 pt-3 text-center' },
          el('p', { class: 'text-sm font-bold text-go' }, 'MINDS volunteer'),
          el('h1', { class: 'text-2xl font-bold leading-tight' }, h.user.name),
          entry ? canvas : el('p', { class: 'my-8 rounded-lg bg-strap-tint p-3 text-sm font-bold' }, "Today's pass isn't saved on this phone yet. Connect to the internet and reopen this page."),
          el('p', { class: 'font-bold' }, fmtDay(today, today)),
          todays.length
            ? todays.map((u) => el('p', { class: 'text-sm text-ink-soft' }, `${u.session.title}, ${fmtTimes(u.session)}`))
            : el('p', { class: 'text-sm text-ink-soft' }, 'No session booked today. A leader can still add you as a walk-in.'),
          att ? el('div', { class: 'mt-2' }, att.clockOut ? chip(`Clocked out, ${fmtHours(att.hours)}`, 'out') : chip(`Clocked in at ${clockTime(att.clockIn)}`, 'go')) : null),
        el('p', { class: 'bg-go px-5 py-3 text-center text-sm font-bold text-white' },
          done ? 'All done for today. Thank you!' : 'Show this to your volunteer leader to clock in and out.')),
      done && h.pendingFeedback.length
        ? el('a', { href: `#/feedback/${h.pendingFeedback[0].bookingId}`, class: 'btn btn-go mt-4 w-full' }, 'Give feedback')
        : el('p', { class: 'mt-4 text-center text-sm text-ink-soft' }, 'Turn your screen brightness up if the scan is slow.')));

    if (entry) {
      drawQr(canvas, entry.code, 248).catch((err) => canvas.replaceWith(el('p', { class: 'my-6 text-sm font-bold text-stop' }, err.message)));
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
      el('h1', { class: 'text-2xl font-bold' }, 'Find a session'),
      el('p', { class: 'text-ink-soft' }, 'Tap Book to ask for a slot. A leader confirms it and pairs you with a trainee.'),
      dates.length ? null : el('p', { class: 'mt-8 rounded-xl border border-dashed border-line p-6 text-center text-ink-soft' }, 'No sessions are open for booking right now. Check back soon.'),
      dates.map((date) => [
        el('h2', { class: 'section-title' }, fmtDay(date, h.today)),
        panel(byDate[date].map((s) => {
          const full = s.spotsLeft === 0 && !s.myStatus;
          let action;
          if (s.myStatus) {
            action = statusChip(s.myStatus);
          } else {
            action = el('button', { class: 'btn btn-go btn-sm shrink-0', disabled: full }, full ? 'Full' : 'Book');
            action.addEventListener('click', () => busy(action, 'Booking…', async () => {
              const res = await call('bookSession', { sessionId: s.sessionId });
              app.saveHome(res.home);
              draw(res.home);
              toast(res.message);
            }));
          }
          return el('div', { class: 'flex items-start justify-between gap-3 p-4' },
            el('div', { class: 'min-w-0' },
              el('h3', { class: 'font-bold' }, s.title),
              el('p', { class: 'text-sm' }, `${fmtTimes(s)}, ${s.venue}`),
              s.notes ? el('p', { class: 'mt-1 text-sm text-ink-soft' }, s.notes) : null,
              s.spotsLeft !== null && !s.myStatus ? el('p', { class: `mt-1 text-sm font-bold ${s.spotsLeft <= 2 ? 'text-stop' : 'text-go'}` },
                s.spotsLeft === 0 ? 'No spots left' : `${s.spotsLeft} spot${s.spotsLeft === 1 ? '' : 's'} left`) : null),
            action);
        })),
      ]));
  };
  return withHome(root, app, ctx, draw);
}

/* ---------------- Me ---------------- */

export function renderMe(root, app, ctx) {
  const draw = (h) => {
    const u = h.user;
    const pwForm = el('form', { class: 'mt-3 space-y-3', novalidate: true },
      el('div', {}, el('label', { class: 'label', for: 'pw-current' }, 'Current password'),
        el('input', { id: 'pw-current', name: 'currentPassword', type: 'password', class: 'field', autocomplete: 'current-password' })),
      el('div', {}, el('label', { class: 'label', for: 'pw-new' }, 'New password'),
        el('input', { id: 'pw-new', name: 'newPassword', type: 'password', class: 'field', autocomplete: 'new-password' })),
      el('button', { type: 'submit', class: 'btn btn-quiet w-full' }, 'Change password'));
    pwForm.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(pwForm.querySelector('button'), 'Saving…', async () => {
        const res = await call('changePassword', { currentPassword: pwForm.currentPassword.value, newPassword: pwForm.newPassword.value });
        app.setToken(res.token);
        pwForm.reset();
        toast('Password changed. Other devices have been signed out.');
      });
    });
    const detail = (label, value) => el('div', { class: 'flex justify-between gap-4 py-2' },
      el('dt', { class: 'text-ink-soft' }, label), el('dd', { class: 'text-right font-bold' }, value || '—'));

    mount(root, 
      el('h1', { class: 'text-2xl font-bold' }, u.name),
      el('p', { class: 'text-ink-soft' }, u.email),
      el('div', { class: 'mt-4 grid grid-cols-2 gap-3' },
        el('div', { class: 'rounded-xl bg-white p-4 ring-1 ring-line' }, el('p', { class: 'text-3xl font-bold text-go' }, fmtHours(h.totals.hours)), el('p', { class: 'text-sm text-ink-soft' }, 'volunteered')),
        el('div', { class: 'rounded-xl bg-white p-4 ring-1 ring-line' }, el('p', { class: 'text-3xl font-bold' }, String(h.totals.sessions)), el('p', { class: 'text-sm text-ink-soft' }, h.totals.sessions === 1 ? 'session' : 'sessions'))),
      el('h2', { class: 'section-title' }, 'History'),
      h.history.length
        ? panel(h.history.map((a) => el('div', { class: 'flex items-center justify-between gap-3 p-3' },
          el('div', {}, el('p', { class: 'font-bold' }, a.sessionTitle), el('p', { class: 'text-sm text-ink-soft' }, `${fmtDay(a.date, h.today)}, ${clockTime(a.clockIn)}–${clockTime(a.clockOut)}`)),
          el('p', { class: 'font-bold' }, fmtHours(a.hours)))))
        : el('p', { class: 'text-ink-soft' }, 'Completed sessions will be listed here.'),
      el('details', { class: 'mt-6 rounded-xl bg-white p-4 ring-1 ring-line' },
        el('summary', { class: 'cursor-pointer font-bold' }, 'My details'),
        el('dl', { class: 'mt-2 divide-y divide-line text-sm' },
          detail('Phone', u.phone), detail('Telegram', u.telegram ? `@${u.telegram}` : ''), detail('Birthday', u.birthday),
          detail('Emergency contact', `${u.emergencyName}${u.emergencyRelation ? ` (${u.emergencyRelation})` : ''}`),
          detail('Emergency phone', u.emergencyPhone)),
        el('p', { class: 'mt-2 text-sm text-ink-soft' }, 'To change these, ask a volunteer leader.')),
      el('details', { class: 'mt-3 rounded-xl bg-white p-4 ring-1 ring-line' },
        el('summary', { class: 'cursor-pointer font-bold' }, 'Change password'), pwForm),
      u.role === 'admin'
        ? el('button', { class: 'btn btn-quiet mt-6 w-full', onclick: () => app.setMode(app.mode === 'leader' ? 'volunteer' : 'leader') },
          app.mode === 'leader' ? 'Switch to volunteer view (to book sessions yourself)' : 'Switch to leader view')
        : null,
      el('button', { class: 'btn btn-stop mt-3 w-full', onclick: () => app.signOut() }, 'Sign out'));
  };
  return withHome(root, app, ctx, draw);
}

/* ---------------- Feedback ---------------- */

export function renderFeedback(root, app, ctx, bookingId) {
  const draw = (h) => {
    const item = h.pendingFeedback.find((f) => f.bookingId === bookingId);
    if (!item) {
      mount(root, backLink('#/home'), el('p', { class: 'text-ink-soft' }, 'Feedback for this session is already done. Thank you!'));
      return;
    }
    const scale = [[1, 'Hard'], [2, ''], [3, 'OK'], [4, ''], [5, 'Great']];
    const form = el('form', { novalidate: true },
      el('fieldset', { class: 'mt-6' },
        el('legend', { class: 'label' }, 'Overall, how was the session?'),
        el('div', { class: 'grid grid-cols-5 gap-2' }, scale.map(([n, word]) => el('label', { class: 'cursor-pointer' },
          el('input', { type: 'radio', name: 'rating', value: n, class: 'peer sr-only' }),
          el('span', { class: 'flex h-16 flex-col items-center justify-center rounded-lg border-2 border-line bg-white font-bold peer-checked:border-go peer-checked:bg-go-tint peer-focus-visible:ring-2 peer-focus-visible:ring-strap' },
            el('span', { class: 'text-xl' }, String(n)), word ? el('span', { class: 'text-xs font-normal' }, word) : null))))),
      el('label', { class: 'label mt-6', for: 'fb-session' }, 'What went well, or what could be better?'),
      el('textarea', { id: 'fb-session', name: 'sessionFeedback', rows: 3, class: 'field', maxlength: 5000 }),
      item.traineeName ? [
        el('label', { class: 'label mt-6', for: 'fb-trainee' }, `Anything you noticed about ${item.traineeName}?`),
        el('p', { class: 'mb-2 text-sm text-ink-soft' }, `New skills, mood, what helped or upset them. MINDS staff use this to update ${item.traineeName}'s records.`),
        el('textarea', { id: 'fb-trainee', name: 'traineeObservation', rows: 4, class: 'field', maxlength: 5000 }),
      ] : null,
      el('button', { type: 'submit', class: 'btn btn-go mt-6 w-full' }, 'Send feedback'),
      el('a', { href: '#/home', class: 'btn btn-quiet mt-3 w-full' }, 'Not now'));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = formData(form);
      if (!d.rating && !d.sessionFeedback && !d.traineeObservation) {
        toast('Pick a rating or write a comment first.', 'warn');
        return;
      }
      busy(form.querySelector('button[type=submit]'), 'Sending…', async () => {
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
      el('h1', { class: 'text-2xl font-bold' }, 'How did it go?'),
      el('p', { class: 'text-ink-soft' }, `${item.sessionTitle}, ${fmtDay(item.date, h.today)}${item.traineeName ? `, with ${item.traineeName}` : ''}`),
      form);
  };
  // Feedback is a form: draw once from cache (or fetch once) so typing is never interrupted.
  const cached = app.cachedHome();
  if (cached && cached.pendingFeedback.some((f) => f.bookingId === bookingId)) {
    draw(cached);
    return Promise.resolve();
  }
  mount(root, loading());
  return app.fetchHome().then((h) => { if (ctx.alive()) draw(h); })
    .catch((err) => { if (ctx.alive()) mount(root, errorBlock(err, () => app.rerender())); });
}
