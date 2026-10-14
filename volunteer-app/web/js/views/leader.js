// Volunteer leader screens: Sessions, Session detail, New session, Scan, People.

import { call, isNetworkError } from '../api.js';
import { startScanner } from '../qr.js';
import {
  backLink, busy, chip, clockTime, el, errorBlock, fmtDay, fmtHours, fmtTimes, formData, icon, loading, mount,
  statusChip, toast, todaySG,
} from '../ui.js';

function panel(...children) {
  return el('div', { class: 'divide-y divide-line overflow-hidden rounded-xl border border-line bg-white' }, ...children);
}

async function withAdminHome(root, app, ctx, draw) {
  const cached = app.cachedAdminHome();
  if (cached) draw(cached);
  else mount(root, loading());
  try {
    const fresh = await app.fetchAdminHome();
    if (ctx.alive()) draw(fresh);
  } catch (err) {
    if (!ctx.alive()) return;
    if (!cached) mount(root, errorBlock(err, () => app.rerender()));
    else if (!isNetworkError(err)) toast(err.message, 'error');
  }
}

/* ---------------- Sessions overview ---------------- */

export function renderToday(root, app, ctx) {
  const row = (s, today) => {
    const st = s.stats;
    return el('div', { class: 'flex items-center gap-3 p-4' },
      el('a', { href: `#/session/${s.sessionId}`, class: 'min-w-0 flex-1' },
        el('p', { class: 'text-sm font-bold text-go' }, s.date === today ? fmtTimes(s) : `${fmtDay(s.date, today)}, ${fmtTimes(s)}`),
        el('h3', { class: 'font-bold leading-snug' }, s.title, s.status === 'closed' ? el('span', { class: 'ml-2 align-middle' }, chip('Bookings closed')) : null),
        el('p', { class: 'truncate text-sm text-ink-soft' }, s.venue),
        el('p', { class: 'mt-1 flex flex-wrap items-center gap-1.5 text-sm' },
          `${st.booked}${s.capacity ? `/${s.capacity}` : ''} booked`,
          st.pending ? chip(`${st.pending} to confirm`, 'strap') : null,
          st.onSite ? chip(`${st.onSite} on site`, 'go') : null,
          st.done ? chip(`${st.done} done`, 'out') : null)),
      s.date === today
        ? el('a', { href: `#/scan/${s.sessionId}`, class: 'btn btn-go btn-sm shrink-0', 'aria-label': `Scan passes for ${s.title}` }, icon('scan', 'size-5'), 'Scan')
        : null);
  };

  const draw = (a) => {
    const today = a.today;
    const todays = a.sessions.filter((s) => s.date === today);
    const upcoming = a.sessions.filter((s) => s.date > today);
    const past = a.sessions.filter((s) => s.date < today).reverse();
    mount(root, 
      el('div', { class: 'flex items-center justify-between' },
        el('h1', { class: 'text-2xl font-bold' }, 'Sessions'),
        el('a', { href: '#/new-session', class: 'btn btn-go btn-sm' }, icon('plus', 'size-5'), 'New session')),
      a.pendingTotal ? el('p', { class: 'mt-3 rounded-lg bg-strap-tint p-3 font-bold' },
        `${a.pendingTotal} booking${a.pendingTotal === 1 ? ' is' : 's are'} waiting for you to confirm.`) : null,
      el('h2', { class: 'section-title' }, `Today, ${fmtDay(today, today).replace('Today, ', '')}`),
      todays.length ? panel(todays.map((s) => row(s, today))) : el('p', { class: 'text-ink-soft' }, 'No sessions today.'),
      el('h2', { class: 'section-title' }, 'Coming up'),
      upcoming.length ? panel(upcoming.map((s) => row(s, today))) : el('p', { class: 'text-ink-soft' }, 'Nothing scheduled. Create a session so volunteers can book.'),
      past.length ? el('details', { class: 'mt-6' },
        el('summary', { class: 'cursor-pointer font-bold' }, `Past week (${past.length})`),
        el('div', { class: 'mt-2' }, panel(past.map((s) => row(s, today))))) : null);
  };
  return withAdminHome(root, app, ctx, draw);
}

/* ---------------- Session detail ---------------- */

export function renderSession(root, app, ctx, sessionId) {
  const draw = (d) => {
    const s = d.session;
    const isToday = s.date === d.today;
    const active = d.bookings.filter((b) => b.status !== 'cancelled');
    const cancelled = d.bookings.filter((b) => b.status === 'cancelled');
    const pairedWith = {};
    active.forEach((b) => { if (b.trainee) pairedWith[b.trainee.id] = b.volunteer.name; });
    const apply = (res) => {
      app.cacheDetail(sessionId, res.detail);
      app.dropAdminHome();
      if (ctx.alive()) draw(res.detail);
    };

    const bookingRow = (b) => {
      const select = el('select', { class: 'field mt-1 py-2', 'aria-label': `Trainee for ${b.volunteer.name}` },
        el('option', { value: '' }, 'No trainee yet'),
        d.trainees.map((t) => el('option', { value: t.id, selected: b.trainee && b.trainee.id === t.id },
          pairedWith[t.id] && !(b.trainee && b.trainee.id === t.id) ? `${t.name} (with ${pairedWith[t.id]})` : t.name)));

      let primary = null;
      if (b.status === 'pending') {
        primary = el('button', { class: 'btn btn-go btn-sm' }, icon('check', 'size-4'), 'Confirm');
        primary.addEventListener('click', () => busy(primary, 'Saving…', async () => {
          const payload = { bookingId: b.bookingId, status: 'confirmed' };
          if (select.value) payload.traineeId = select.value;
          apply(await call('updateBooking', payload));
          toast(`${b.volunteer.name} confirmed${select.value ? ` and paired with ${select.selectedOptions[0].textContent}` : ''}.`);
        }));
      } else {
        select.addEventListener('change', () => {
          select.disabled = true;
          call('updateBooking', { bookingId: b.bookingId, traineeId: select.value })
            .then((res) => { apply(res); toast(select.value ? 'Pairing saved.' : 'Pairing removed.'); })
            .catch((err) => { toast(err.message, 'error'); draw(d); });
        });
      }

      let clock = null;
      const a = b.attendance;
      if (a && a.clockOut) {
        clock = el('p', { class: 'text-sm font-bold text-out' }, `${clockTime(a.clockIn)}–${clockTime(a.clockOut)}, ${fmtHours(a.hours)}`);
      } else if (isToday) {
        const btn = el('button', { class: `btn btn-sm ${a ? 'btn-out' : 'btn-quiet'}` }, a ? `Clock out (in at ${clockTime(a.clockIn)})` : 'Clock in by hand');
        btn.addEventListener('click', () => busy(btn, 'Saving…', async () => {
          const res = await call('manualClock', { bookingId: b.bookingId });
          apply(res);
          toast(`${b.volunteer.name}: ${res.message}`);
        }));
        clock = btn;
      } else if (a) {
        clock = el('p', { class: 'text-sm font-bold text-go' }, `Clocked in at ${clockTime(a.clockIn)}`);
      }

      const v = b.volunteer;
      const contacts = el('p', { class: 'mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm' },
        v.phone ? el('a', { href: `tel:${v.phone.replace(/\s/g, '')}`, class: 'inline-flex items-center gap-1 font-bold text-go' }, icon('phone', 'size-4'), 'Call') : null,
        v.telegram ? el('a', { href: `https://t.me/${v.telegram}`, target: '_blank', rel: 'noopener', class: 'inline-flex items-center gap-1 font-bold text-go' }, icon('send', 'size-4'), 'Telegram') : null,
        v.emergencyPhone ? el('a', { href: `tel:${v.emergencyPhone.replace(/\s/g, '')}`, class: 'inline-flex items-center gap-1 font-bold text-stop' }, icon('phone', 'size-4'),
          `Emergency: ${v.emergencyName}${v.emergencyRelation ? ` (${v.emergencyRelation})` : ''}`) : null);

      let remove = null;
      if (!a) {
        remove = el('button', { class: 'text-sm font-bold text-stop underline underline-offset-4' }, 'Remove booking');
        remove.addEventListener('click', () => {
          if (!confirm(`Remove ${v.name} from ${s.title}?`)) return;
          busy(remove, 'Removing…', async () => apply(await call('updateBooking', { bookingId: b.bookingId, status: 'cancelled' })));
        });
      }

      return el('div', { class: 'p-4' },
        el('div', { class: 'flex flex-wrap items-center gap-2' },
          el('h3', { class: 'mr-auto font-bold' }, v.name),
          b.walkIn ? chip('Walk-in') : null,
          b.feedbackGiven ? chip('Feedback in', 'out') : null,
          b.status === 'pending' ? statusChip('pending') : null),
        el('label', { class: 'mt-2 block text-sm text-ink-soft' }, 'Trainee', select),
        el('div', { class: 'mt-3 flex flex-wrap items-center gap-3' }, primary, clock, remove),
        contacts);
    };

    // Edit form (collapsed)
    const edit = el('form', { class: 'mt-3 grid grid-cols-2 gap-3', novalidate: true },
      el('label', { class: 'label col-span-2' }, 'Title', el('input', { name: 'title', class: 'field mt-1 font-normal', value: s.title })),
      el('label', { class: 'label col-span-2' }, 'Date', el('input', { name: 'date', type: 'date', class: 'field mt-1 font-normal', value: s.date })),
      el('label', { class: 'label' }, 'Starts', el('input', { name: 'startTime', type: 'time', class: 'field mt-1 font-normal', value: s.startTime })),
      el('label', { class: 'label' }, 'Ends', el('input', { name: 'endTime', type: 'time', class: 'field mt-1 font-normal', value: s.endTime })),
      el('label', { class: 'label col-span-2' }, 'Venue', el('input', { name: 'venue', class: 'field mt-1 font-normal', value: s.venue })),
      el('label', { class: 'label col-span-2' }, 'Volunteer slots (0 = no limit)', el('input', { name: 'capacity', type: 'number', min: 0, max: 500, class: 'field mt-1 font-normal', value: s.capacity })),
      el('label', { class: 'label col-span-2' }, 'Notes for volunteers', el('textarea', { name: 'notes', rows: 2, class: 'field mt-1 font-normal' }, s.notes || '')),
      el('button', { type: 'submit', class: 'btn btn-go col-span-2' }, 'Save changes'));
    edit.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = formData(edit);
      busy(edit.querySelector('button'), 'Saving…', async () => {
        apply(await call('updateSession', { sessionId, ...f, capacity: f.capacity === '' ? 0 : Number(f.capacity) }));
        toast('Session updated.');
      });
    });
    const statusButton = (label, status, cls, question) => {
      const btn = el('button', { class: `btn ${cls} w-full` }, label);
      btn.addEventListener('click', () => {
        if (question && !confirm(question)) return;
        busy(btn, 'Saving…', async () => apply(await call('updateSession', { sessionId, status })));
      });
      return btn;
    };

    const stat = (n, label, tone) => el('div', { class: 'rounded-lg bg-white p-2 text-center ring-1 ring-line' },
      el('p', { class: `text-2xl font-bold ${tone}` }, String(n)), el('p', { class: 'text-xs text-ink-soft' }, label));

    mount(root, 
      backLink('#/today', 'Sessions'),
      el('h1', { class: 'text-2xl font-bold leading-tight' }, s.title),
      el('p', { class: 'font-bold text-go' }, `${fmtDay(s.date, d.today)}, ${fmtTimes(s)}`),
      el('p', { class: 'flex items-center gap-1 text-ink-soft' }, icon('pin', 'size-4'), s.venue || 'No venue set'),
      s.status !== 'open' ? el('div', { class: 'mt-2' }, chip(s.status === 'closed' ? 'Bookings closed' : 'Cancelled', s.status === 'closed' ? 'quiet' : 'stop')) : null,
      el('div', { class: 'mt-4 grid grid-cols-4 gap-2' },
        stat(`${d.stats.booked}${s.capacity ? `/${s.capacity}` : ''}`, 'booked', ''),
        stat(d.stats.pending, 'to confirm', 'text-ink'),
        stat(d.stats.onSite, 'on site', 'text-go'),
        stat(d.stats.done, 'done', 'text-out')),
      isToday && s.status !== 'cancelled'
        ? el('a', { href: `#/scan/${sessionId}`, class: 'btn btn-go mt-4 w-full' }, icon('scan', 'size-5'), 'Scan passes for this session')
        : null,
      el('h2', { class: 'section-title' }, `Volunteers (${active.length})`),
      active.length ? panel(active.map(bookingRow)) : el('p', { class: 'text-ink-soft' }, 'No bookings yet.'),
      cancelled.length ? el('details', { class: 'mt-4' },
        el('summary', { class: 'cursor-pointer text-sm font-bold text-ink-soft' }, `Cancelled bookings (${cancelled.length})`),
        el('ul', { class: 'mt-2 space-y-1 text-sm text-ink-soft' }, cancelled.map((b) => el('li', {}, b.volunteer.name)))) : null,
      el('details', { class: 'mt-6 rounded-xl bg-white p-4 ring-1 ring-line' },
        el('summary', { class: 'cursor-pointer font-bold' }, 'Edit or close this session'),
        edit,
        el('div', { class: 'mt-4 space-y-2' },
          s.status === 'open' ? statusButton('Close bookings', 'closed', 'btn-quiet') : statusButton('Reopen bookings', 'open', 'btn-quiet'),
          s.status !== 'cancelled' ? statusButton('Cancel session', 'cancelled', 'btn-stop', `Cancel ${s.title}? Volunteers will see it disappear from their list.`) : null)));
  };

  const cached = app.cachedDetail(sessionId);
  if (cached) draw(cached);
  else mount(root, loading());
  return call('sessionDetail', { sessionId })
    .then((d) => { app.cacheDetail(sessionId, d); if (ctx.alive() && !root.contains(document.activeElement)) draw(d); else if (ctx.alive() && !cached) draw(d); })
    .catch((err) => { if (ctx.alive() && !cached) mount(root, errorBlock(err, () => app.rerender())); else if (ctx.alive()) toast(err.message, 'error'); });
}

/* ---------------- New session ---------------- */

export function renderNewSession(root, app) {
  const field = (label, input, cls = 'col-span-2') => el('label', { class: `label ${cls}` }, label, input);
  const form = el('form', { class: 'mt-4 grid grid-cols-2 gap-4', novalidate: true },
    field('Title', el('input', { name: 'title', class: 'field mt-1 font-normal', placeholder: 'e.g. Art & Craft', required: true })),
    field('Date', el('input', { name: 'date', type: 'date', class: 'field mt-1 font-normal', value: todaySG(), min: todaySG(), required: true })),
    field('Starts', el('input', { name: 'startTime', type: 'time', class: 'field mt-1 font-normal', value: '10:00', required: true }), ''),
    field('Ends', el('input', { name: 'endTime', type: 'time', class: 'field mt-1 font-normal', value: '12:00', required: true }), ''),
    field('Venue', el('input', { name: 'venue', class: 'field mt-1 font-normal', placeholder: 'e.g. MINDS Clementi DAC' })),
    field('Volunteer slots', el('input', { name: 'capacity', type: 'number', min: 0, max: 500, inputmode: 'numeric', class: 'field mt-1 font-normal', placeholder: 'Leave empty for no limit' })),
    field('Notes for volunteers', el('textarea', { name: 'notes', rows: 3, class: 'field mt-1 font-normal', placeholder: 'What to wear or bring, where to meet' })),
    el('button', { type: 'submit', class: 'btn btn-go col-span-2' }, 'Create session'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(form);
    if (!f.title) {
      toast('Give the session a title.', 'warn');
      form.title.focus();
      return;
    }
    busy(form.querySelector('button'), 'Creating…', async () => {
      const res = await call('createSession', { ...f, capacity: f.capacity === '' ? 0 : Number(f.capacity) });
      app.saveAdminHome(res.home);
      toast('Session created. Volunteers can book it now.');
      app.go(`#/session/${res.session.sessionId}`);
    });
  });
  mount(root, backLink('#/today', 'Sessions'), el('h1', { class: 'text-2xl font-bold' }, 'New session'), form);
}

/* ---------------- Scan ---------------- */

const OUTCOME = {
  in: { title: 'Clocked in', tone: 'bg-go text-white', vibrate: 80 },
  out: { title: 'Clocked out', tone: 'bg-out text-white', vibrate: [60, 50, 60] },
  'already-in': { title: 'Already clocked in', tone: 'bg-strap-tint text-ink', vibrate: [30, 30, 30] },
  'already-out': { title: 'Already clocked out', tone: 'bg-strap-tint text-ink', vibrate: [30, 30, 30] },
  'not-booked': { title: 'Not booked for today', tone: 'bg-strap-tint text-ink', vibrate: [200] },
  queued: { title: 'Saved on this phone', tone: 'bg-ink text-white', vibrate: 80 },
  error: { title: "Couldn't clock", tone: 'bg-stop text-white', vibrate: [200, 80, 200] },
};

export function renderScan(root, app, ctx, presetSessionId) {
  let scanner = null;
  const home = app.cachedAdminHome();
  const today = todaySG();
  let sessionsToday = home ? home.sessions.filter((s) => s.date === today && s.status !== 'cancelled') : [];

  const select = el('select', { id: 'scan-session', class: 'field mt-1 font-normal' });
  const fillSelect = () => {
    mount(select, 
      el('option', { value: '' }, 'Match to each volunteer\'s booking'),
      sessionsToday.map((s) => el('option', { value: s.sessionId, selected: s.sessionId === presetSessionId }, `${s.title} (${fmtTimes(s)})`)));
  };
  fillSelect();
  if (!home) {
    app.fetchAdminHome().then((h) => {
      sessionsToday = h.sessions.filter((s) => s.date === today && s.status !== 'cancelled');
      if (ctx.alive()) fillSelect();
    }).catch(() => {});
  }

  const reader = el('div', { id: 'reader', class: 'relative mt-3 aspect-[4/3] max-h-[42vh] w-full overflow-hidden rounded-xl bg-ink' });
  const result = el('div', { class: 'mt-3', 'aria-live': 'assertive' },
    el('div', { class: 'rounded-xl bg-white p-4 text-ink-soft ring-1 ring-line' }, "Point the camera at a volunteer's pass. The result shows here."));
  const queueLine = el('div', { class: 'mt-3' });
  const recentList = el('div', {});
  const startBtn = el('button', { class: 'btn btn-quiet mt-3 w-full', hidden: true }, icon('scan', 'size-5'), 'Start camera');

  const drawRecent = () => {
    const recent = app.recentScans();
    mount(recentList, recent.length ? [
      el('h2', { class: 'section-title' }, 'Recent scans on this phone'),
      panel(recent.map((r) => el('div', { class: 'flex items-center justify-between gap-3 p-3 text-sm' },
        el('span', { class: 'font-bold' }, r.name || 'Unknown'),
        el('span', { class: 'text-ink-soft' }, `${(OUTCOME[r.outcome] || OUTCOME.error).title}, ${r.time}`)))),
    ] : []);
  };

  const drawQueue = () => {
    const n = app.queuedScans().length;
    mount(queueLine, n ? el('div', { class: 'flex items-center justify-between gap-3 rounded-lg bg-strap-tint p-3' },
      el('p', { class: 'text-sm font-bold' }, `${n} scan${n === 1 ? '' : 's'} saved offline. They upload automatically when you're back online.`),
      el('button', { class: 'btn btn-quiet btn-sm shrink-0', onclick: async (e) => { await busy(e.currentTarget, 'Uploading…', () => app.flushScans(true)); drawQueue(); drawRecent(); } }, 'Upload now')) : []);
  };
  ctx.onEvent('scans-changed', () => { drawQueue(); drawRecent(); });

  const show = (outcome, res, extra) => {
    const o = OUTCOME[outcome] || OUTCOME.error;
    if (navigator.vibrate) navigator.vibrate(o.vibrate);
    mount(result, el('div', { class: `flash rounded-xl p-4 ${o.tone}` },
      el('p', { class: 'text-sm font-bold opacity-90' }, o.title),
      res && res.volunteer ? el('p', { class: 'text-2xl font-bold leading-tight' }, res.volunteer.name) : null,
      res && res.trainee ? el('p', { class: 'font-bold' }, `Paired with ${res.trainee.name}`) : null,
      res && res.session ? el('p', { class: 'text-sm opacity-90' }, `${res.session.title}, ${fmtTimes(res.session)}`) : null,
      el('p', { class: `mt-1 ${outcome === 'out' ? 'text-lg font-bold' : ''}` }, res && res.message ? res.message : extra || ''),
      outcome === 'not-booked' ? walkInButton(res) : null));
    if (res && res.volunteer) app.addRecentScan({ name: res.volunteer.name, outcome, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) });
    drawRecent();
  };

  let lastCode = '';
  const walkInButton = () => {
    const btn = el('button', { class: 'btn btn-go mt-3 w-full' }, 'Add as walk-in and clock in');
    btn.addEventListener('click', () => {
      const sessionId = select.value || (sessionsToday.length === 1 ? sessionsToday[0].sessionId : '');
      if (!sessionId) {
        toast('Choose the session at the top first.', 'warn');
        select.focus();
        return;
      }
      busy(btn, 'Saving…', async () => {
        const res = await call('scan', { code: lastCode, sessionId, walkIn: true });
        show(res.outcome, res);
        app.dropAdminHome();
      });
    });
    return btn;
  };

  const onCode = async (code) => {
    lastCode = code;
    mount(result, el('div', { class: 'rounded-xl bg-white p-4 font-bold ring-1 ring-line' }, 'Checking pass…'));
    const payload = { code };
    if (select.value) payload.sessionId = select.value;
    try {
      const res = await call('scan', payload);
      show(res.outcome, res);
      app.dropAdminHome();
    } catch (err) {
      if (isNetworkError(err)) {
        app.queueScan({ ...payload, scannedAt: new Date().toISOString() });
        show('queued', null, 'No signal. The scan and its time are saved and will upload automatically.');
        drawQueue();
      } else {
        show('error', null, err.message);
      }
    }
  };

  const start = async () => {
    startBtn.hidden = true;
    mount(reader, el('p', { class: 'absolute inset-0 flex items-center justify-center p-6 text-center text-white' }, 'Starting camera…'));
    try {
      scanner = await startScanner('reader', onCode);
      const placeholder = reader.querySelector(':scope > p');
      if (placeholder) placeholder.remove(); // in case the library kept our "Starting camera…" text
      if (!ctx.alive()) scanner.stop();
    } catch (err) {
      mount(reader, el('p', { class: 'absolute inset-0 flex items-center justify-center p-6 text-center text-white' }, err.message));
      startBtn.hidden = false;
    }
  };
  startBtn.addEventListener('click', start);
  ctx.onLeave(() => { if (scanner) scanner.stop(); });

  mount(root, 
    el('h1', { class: 'text-2xl font-bold' }, 'Scan passes'),
    el('p', { class: 'text-sm text-ink-soft' }, 'First scan clocks a volunteer in, the next clocks them out.'),
    el('label', { class: 'label mt-3', for: 'scan-session' }, 'Session', select),
    result, reader, startBtn, queueLine, recentList);
  drawQueue();
  drawRecent();
  start();
}

/* ---------------- People ---------------- */

export function renderPeople(root, app, ctx) {
  let people = app.cachedPeople();
  let query = '';
  const list = el('div', { class: 'mt-4' });
  const search = el('input', { type: 'search', class: 'field', placeholder: 'Search by name, email or phone', 'aria-label': 'Search volunteers' });
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); drawList(); });

  const personRow = (p) => {
    const roleBtn = el('button', { class: 'btn btn-quiet btn-sm' }, p.role === 'admin' ? 'Remove leader access' : 'Make volunteer leader');
    roleBtn.addEventListener('click', () => {
      const to = p.role === 'admin' ? 'volunteer' : 'admin';
      const q = to === 'admin'
        ? `Make ${p.name} a volunteer leader? They will be able to create sessions, scan passes and see volunteer contact details.`
        : `Remove leader access from ${p.name}?`;
      if (!confirm(q)) return;
      busy(roleBtn, 'Saving…', async () => {
        await call('setRole', { userId: p.userId, role: to });
        p.role = to;
        toast(to === 'admin' ? `${p.name} is now a volunteer leader.` : `${p.name} is now a volunteer.`);
        drawList();
      });
    });
    const resetBtn = el('button', { class: 'btn btn-quiet btn-sm' }, 'Reset password');
    const resetOut = el('div', {});
    resetBtn.addEventListener('click', () => {
      if (!confirm(`Reset ${p.name}'s password? They will be signed out on all their devices.`)) return;
      busy(resetBtn, 'Resetting…', async () => {
        const res = await call('resetPassword', { userId: p.userId });
        const copy = el('button', { class: 'btn btn-quiet btn-sm', onclick: () => navigator.clipboard?.writeText(res.tempPassword).then(() => toast('Copied.')) }, 'Copy');
        mount(resetOut, el('div', { class: 'mt-3 rounded-lg bg-strap-tint p-3' },
          el('p', { class: 'text-sm' }, `Give ${p.name} this temporary password. They can change it under Me.`),
          el('div', { class: 'mt-2 flex items-center justify-between gap-3' },
            el('code', { class: 'text-lg font-bold' }, res.tempPassword), copy)));
      });
    });
    const line = (label, value, href) => value ? el('div', { class: 'flex justify-between gap-3 py-1.5' },
      el('dt', { class: 'text-ink-soft' }, label),
      el('dd', { class: 'text-right font-bold' }, href ? el('a', { href, class: 'text-go underline underline-offset-4' }, value) : value)) : null;

    return el('details', { class: 'group p-4' },
      el('summary', { class: 'flex cursor-pointer list-none items-center justify-between gap-3' },
        el('div', { class: 'min-w-0' },
          el('p', { class: 'font-bold' }, p.name, p.role === 'admin' ? el('span', { class: 'ml-2 align-middle' }, chip('Leader', 'strap')) : null),
          el('p', { class: 'text-sm text-ink-soft' }, `${fmtHours(p.hours)} over ${p.sessions} session${p.sessions === 1 ? '' : 's'}`)),
        el('span', { class: 'text-ink-soft transition-transform group-open:rotate-90' }, '›')),
      el('dl', { class: 'mt-3 divide-y divide-line text-sm' },
        line('Email', p.email, `mailto:${p.email}`),
        line('Phone', p.phone, `tel:${String(p.phone).replace(/\s/g, '')}`),
        line('Telegram', p.telegram ? `@${p.telegram}` : '', p.telegram ? `https://t.me/${p.telegram}` : ''),
        line('Birthday', p.birthday),
        line('Emergency contact', `${p.emergencyName}${p.emergencyRelation ? ` (${p.emergencyRelation})` : ''}`),
        line('Emergency phone', p.emergencyPhone, `tel:${String(p.emergencyPhone).replace(/\s/g, '')}`),
        line('Registered', p.createdAt ? p.createdAt.slice(0, 10) : '')),
      el('div', { class: 'mt-3 flex flex-wrap gap-2' }, roleBtn, p.hasAccount ? resetBtn : chip('No app account yet')),
      resetOut);
  };

  const drawList = () => {
    if (!people) return;
    const shown = people.filter((p) => !query || [p.name, p.email, p.phone].some((v) => String(v || '').toLowerCase().includes(query)));
    const leaders = people.filter((p) => p.role === 'admin').length;
    mount(list, 
      el('p', { class: 'mb-2 text-sm text-ink-soft' }, `${people.length} people, ${leaders} leader${leaders === 1 ? '' : 's'}`),
      shown.length ? panel(shown.map(personRow)) : el('p', { class: 'text-ink-soft' }, 'No one matches that search.'));
  };

  mount(root, el('h1', { class: 'mb-3 text-2xl font-bold' }, 'People'), search, list);
  if (people) drawList();
  else mount(list, loading());
  return call('listPeople', {}).then((res) => {
    people = res.people;
    app.cachePeople(people);
    if (ctx.alive()) drawList();
  }).catch((err) => {
    if (ctx.alive() && !app.cachedPeople()) mount(list, errorBlock(err, () => app.rerender()));
  });
}
