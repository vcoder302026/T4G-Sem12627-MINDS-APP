// Volunteer leader screens: Choose mode, Sessions, Session detail, New session,
// Scan, People. Layout and colours follow CSL Attendance's admin dashboard.

import { call, isNetworkError } from '../api.js';
import { startScanner } from '../qr.js';
import {
  backLink, badge, busy, clockTime, combobox, el, errorBlock, field, fmtDay, fmtHours, fmtTimes, formData, fuzzyFilter,
  icon, initials, labelled, loading, mapsLink, mount, multiPick, searchBox, section, statusBadge, toast, todaySG,
} from '../ui.js';
import { projectPicker, venuePicker } from './content.js';
import { traineeList } from './trainees.js';

function list(...rows) {
  return el('div', { class: 'card divide-y divide-slate-100 overflow-hidden dark:divide-neutral-900' }, ...rows);
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

const traineeHint = (t) => [t.preferredName ? `Goes by ${t.preferredName}` : '', t.gender].filter(Boolean).join(', ');

/**
 * The session fields shared by "New session" and "Edit session":
 * venue dropdown (with add-a-venue), project dropdown and trainees attending.
 */
function sessionFormFields(app, s, ref) {
  const venue = venuePicker(app, ref.venues || [], s.venue);
  const project = projectPicker(ref.projects || [], s.project || '');
  const trainees = multiPick({
    name: 'traineeIds',
    options: (ref.trainees || []).map((t) => ({ value: t.id, label: t.name, hint: traineeHint(t) })),
    values: s.traineeIds || [],
    placeholder: 'Search trainees',
  });
  return {
    venue: labelled('Venue', venue.el, { hint: "Not in the list? Type the name and choose “Add a new venue”." }),
    project: labelled('Project', project.el, { optional: true }),
    trainees: labelled('Trainees attending', trainees.el, {
      optional: true,
      hint: 'Volunteers are paired with these trainees when you confirm them. Leave empty to pair from all active trainees.',
    }),
  };
}

/** Form values → createSession/updateSession payload. Returns null (and warns) if something is missing. */
function sessionPayload(form) {
  const f = formData(form);
  if (!f.title) {
    toast('Give the session a title.', 'warn');
    form.title.focus();
    return null;
  }
  if (!f.venue) {
    toast('Choose a venue, or add a new one.', 'warn');
    return null;
  }
  return {
    title: f.title,
    date: f.date,
    startTime: f.startTime,
    endTime: f.endTime,
    venue: f.venue,
    project: f.project || '',
    capacity: f.capacity === '' ? 0 : Number(f.capacity),
    notes: f.notes || '',
    traineeIds: f.traineeIds ? f.traineeIds.split(',').filter(Boolean) : [],
  };
}

/* ---------------- Choose mode (CSL Attendance "Choose Mode") ---------------- */

export function renderMode(root, app) {
  const option = (mode, iconName, tone, title, text) => el('button', {
    type: 'button',
    class: `group flex flex-col items-center rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center transition-all hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900 ${tone === 'emerald' ? 'hover:border-emerald-500' : 'hover:border-indigo-500'}`,
    onclick: () => app.setMode(mode),
  },
  el('span', { class: `mb-4 flex size-14 items-center justify-center rounded-2xl bg-white shadow-sm transition-transform group-hover:scale-110 dark:bg-neutral-950 ${tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-600 dark:text-indigo-400'}` }, icon(iconName, 'size-7')),
  el('span', { class: 'mb-1.5 text-lg font-bold text-slate-900 dark:text-white' }, title),
  el('span', { class: 'text-sm muted' }, text),
  app.mode === mode ? el('span', { class: 'mt-3' }, badge('Current mode', tone, 'tick')) : null);

  mount(root, el('div', { class: 'card rounded-3xl p-6 shadow-2xl sm:p-8' },
    el('div', { class: 'mb-6 text-center' },
      el('h1', { class: 'mb-1.5 text-2xl font-extrabold text-slate-900 dark:text-white sm:text-3xl' }, 'Choose Mode'),
      el('p', { class: 'text-sm muted' }, 'Select how you want to use the app.')),
    el('div', { class: 'grid grid-cols-1 gap-4 sm:grid-cols-2' },
      option('leader', 'dashboard', 'emerald', 'Volunteer Leader', 'Post sessions, pair trainees, scan passes and manage people.'),
      option('volunteer', 'qr', 'indigo', 'Volunteer', 'Book sessions for yourself and show your own QR pass.'))));
}

/* ---------------- Sessions overview ---------------- */

export function renderToday(root, app, ctx) {
  let query = '';
  let latest = null;
  const host = el('div', {});
  const row = (s, today) => {
    const st = s.stats;
    return el('div', { class: 'flex items-center gap-3 p-4' },
      el('a', { href: `#/session/${s.sessionId}`, class: 'min-w-0 flex-1' },
        el('p', { class: 'text-sm font-bold text-indigo-600 dark:text-indigo-400' }, s.date === today ? fmtTimes(s) : `${fmtDay(s.date, today)}, ${fmtTimes(s)}`),
        el('h3', { class: 'font-bold leading-snug text-slate-900 dark:text-white' }, s.title),
        el('p', { class: 'truncate text-sm muted' }, [s.venue, s.project].filter(Boolean).join(' · ')),
        el('div', { class: 'mt-2 flex flex-wrap items-center gap-1.5' },
          badge(`${st.booked}${s.capacity ? `/${s.capacity}` : ''} booked`, 'slate'),
          st.pending ? badge(`${st.pending} to confirm`, 'amber') : null,
          st.unpaired ? badge(`${st.unpaired} need${st.unpaired === 1 ? 's' : ''} a trainee`, 'amber') : null,
          st.onSite ? badge(`${st.onSite} on site`, 'emerald') : null,
          st.done ? badge(`${st.done} done`, 'indigo') : null,
          s.status === 'closed' ? badge('Bookings closed', 'red') : null)),
      s.date === today
        ? el('a', { href: `#/scan/${s.sessionId}`, class: 'btn btn-success btn-sm shrink-0', 'aria-label': `Scan passes for ${s.title}` }, icon('scan', 'size-4'), 'Scan')
        : icon('chevron', 'size-5 text-slate-300 dark:text-neutral-700'));
  };

  const drawList = () => {
    const a = latest;
    if (!a) return;
    const today = a.today;
    const alerts = [
      a.pendingTotal ? el('p', { class: 'alert alert-warn mt-4 flex items-center gap-2' }, icon('alert', 'size-4'),
        `${a.pendingTotal} booking${a.pendingTotal === 1 ? ' is' : 's are'} waiting for you to confirm.`) : null,
      a.reviewCount ? el('a', { href: '#/review', class: 'alert alert-info mt-3 flex items-center gap-2' }, icon('inbox', 'size-4'),
        el('span', { class: 'flex-1' }, `${a.reviewCount} volunteer note${a.reviewCount === 1 ? '' : 's'} about trainees to review`), icon('chevron', 'size-4')) : null,
    ];
    if (query.trim()) {
      const shown = fuzzyFilter(a.sessions, query, (s) => [s.title, s.venue, s.project, s.notes, fmtDay(s.date, today), s.date]);
      mount(host, alerts,
        el('h2', { class: 'group-label' }, `${shown.length} match${shown.length === 1 ? '' : 'es'}`),
        shown.length ? list(shown.map((s) => row(s, today))) : el('p', { class: 'text-sm muted' }, 'No session matches that search.'));
      return;
    }
    const todays = a.sessions.filter((s) => s.date === today);
    const upcoming = a.sessions.filter((s) => s.date > today);
    const past = a.sessions.filter((s) => s.date < today).reverse();
    mount(host, alerts,
      el('h2', { class: 'group-label' }, fmtDay(today, today)),
      todays.length ? list(todays.map((s) => row(s, today))) : el('p', { class: 'text-sm muted' }, 'No sessions today.'),
      el('h2', { class: 'group-label' }, 'Coming up'),
      upcoming.length ? list(upcoming.map((s) => row(s, today))) : el('p', { class: 'text-sm muted' }, 'Nothing scheduled. Create a session so volunteers can book.'),
      past.length ? el('details', { class: 'mt-6' },
        el('summary', { class: 'group-label cursor-pointer' }, `Past week (${past.length})`),
        list(past.map((s) => row(s, today)))) : null);
  };

  mount(root,
    el('div', { class: 'flex items-center justify-between gap-3' },
      el('h1', { class: 'page-title' }, 'Sessions'),
      el('a', { href: '#/new-session', class: 'btn btn-primary btn-sm' }, icon('plus', 'size-4'), 'New session')),
    el('div', { class: 'mt-4' }, searchBox('Search sessions by title, venue, project or date', (q) => { query = q; drawList(); })),
    host);
  return withAdminHome(host, app, ctx, (a) => { latest = a; drawList(); });
}

/* ---------------- Session detail ---------------- */

export function renderSession(root, app, ctx, sessionId) {
  const draw = (d) => {
    const s = d.session;
    const isToday = s.date === d.today;
    const active = d.bookings.filter((b) => b.status !== 'cancelled');
    const cancelled = d.bookings.filter((b) => b.status === 'cancelled');
    const attending = new Set(s.traineeIds || []);
    const traineeName = Object.fromEntries(d.trainees.map((t) => [t.id, t.name]));
    const pairedWith = {};
    active.forEach((b) => { if (b.trainee) pairedWith[b.trainee.id] = b.volunteer.name; });
    const apply = (res) => {
      app.cacheDetail(sessionId, res.detail);
      app.dropAdminHome();
      if (ctx.alive()) draw(res.detail);
    };

    const traineeOptions = (b) => {
      const mine = b.trainee ? b.trainee.id : '';
      const opts = d.trainees.map((t) => {
        const other = pairedWith[t.id] && t.id !== mine ? pairedWith[t.id] : '';
        let hint = traineeHint(t);
        if (attending.has(t.id)) hint = ['Attending', hint].filter(Boolean).join(', ');
        if (other) hint = `With ${other}`;
        return { value: t.id, label: t.name, hint };
      });
      if (attending.size) opts.sort((x, y) => Number(attending.has(y.value)) - Number(attending.has(x.value)));
      if (b.trainee && !opts.some((o) => o.value === mine)) opts.unshift({ value: mine, label: b.trainee.name, hint: 'Not on the active trainee list' });
      return opts;
    };

    const bookingRow = (b) => {
      const v = b.volunteer;
      const pending = b.status === 'pending';
      const picker = combobox({
        name: `trainee-${b.bookingId}`,
        options: traineeOptions(b),
        value: b.trainee ? b.trainee.id : '',
        placeholder: 'Type a trainee name',
        emptyOption: pending ? 'Pair automatically when confirmed' : 'No trainee',
        emptyText: 'No trainee matches',
        onChange: pending ? null : (value) => {
          picker.input.disabled = true;
          call('updateBooking', { bookingId: b.bookingId, traineeId: value })
            .then((res) => {
              apply(res);
              toast(value ? `${v.name} is now paired with ${traineeName[value] || 'the trainee'}.` : `Pairing removed for ${v.name}.`);
            })
            .catch((err) => { toast(err.message, 'error'); draw(d); });
        },
      });
      picker.input.setAttribute('aria-label', `Trainee for ${v.name}`);

      let primary = null;
      if (pending) {
        primary = el('button', { class: 'btn btn-success btn-sm' }, icon('tick', 'size-4'), picker.value ? 'Confirm' : 'Confirm & pair');
        primary.addEventListener('click', () => busy(primary, 'Saving…', async () => {
          const payload = { bookingId: b.bookingId, status: 'confirmed' };
          if (picker.value) payload.traineeId = picker.value;
          const res = await call('updateBooking', payload);
          apply(res);
          toast(res.message, res.detail.bookings.find((x) => x.bookingId === b.bookingId)?.trainee ? 'ok' : 'warn');
        }));
      }

      // CSL convention: clock in = emerald, clock out = indigo.
      let clock = null;
      const a = b.attendance;
      if (a && a.clockOut) {
        clock = badge(`${clockTime(a.clockIn)}–${clockTime(a.clockOut)}, ${fmtHours(a.hours)}`, 'indigo', 'check');
      } else if (isToday) {
        const btn = el('button', { class: `btn btn-sm ${a ? 'btn-primary' : 'btn-secondary'}` },
          icon(a ? 'logout' : 'clock', 'size-4'), a ? `Clock out (in ${clockTime(a.clockIn)})` : 'Clock in by hand');
        btn.addEventListener('click', () => busy(btn, 'Saving…', async () => {
          const res = await call('manualClock', { bookingId: b.bookingId });
          apply(res);
          toast(`${v.name}: ${res.message}`);
        }));
        clock = btn;
      } else if (a) {
        clock = badge(`Clocked in ${clockTime(a.clockIn)}`, 'emerald');
      }

      let remove = null;
      if (!a) {
        remove = el('button', { class: 'text-sm font-bold text-red-600 hover:underline dark:text-red-400' }, 'Remove');
        remove.addEventListener('click', () => {
          if (!confirm(`Remove ${v.name} from ${s.title}?`)) return;
          busy(remove, 'Removing…', async () => { const res = await call('updateBooking', { bookingId: b.bookingId, status: 'cancelled' }); apply(res); toast(res.message); });
        });
      }
      const contact = (href, iconName, text, danger) => el('a', { href, class: `inline-flex items-center gap-1 font-bold ${danger ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'}` }, icon(iconName, 'size-4'), text);

      return el('div', { class: 'p-4' },
        el('div', { class: 'flex items-center gap-3' },
          el('a', { href: `#/person/${v.userId}`, class: 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-sm font-extrabold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300', 'aria-label': `Open ${v.name}` }, initials(v.name)),
          el('div', { class: 'min-w-0 flex-1' },
            el('h3', { class: 'truncate font-bold text-slate-900 dark:text-white' }, v.name),
            el('div', { class: 'mt-0.5 flex flex-wrap gap-1' },
              statusBadge(b.status),
              b.pairing === 'auto' && b.trainee ? badge('Auto-paired', 'indigo', 'sparkle') : null,
              b.status === 'confirmed' && !b.trainee ? badge('Needs a trainee', 'amber', 'alert') : null,
              b.walkIn ? badge('Walk-in', 'purple') : null,
              b.feedbackGiven ? badge('Feedback in', 'indigo') : null))),
        el('div', { class: 'mt-3' },
          el('p', { class: 'mb-1 text-xs font-bold uppercase tracking-wider muted' }, 'Trainee'),
          picker.el,
          b.trainee ? el('a', { href: `#/trainee/${encodeURIComponent(b.trainee.id)}`, class: 'link mt-1 inline-block text-xs' }, `View ${b.trainee.name}'s details and notes`) : null),
        el('div', { class: 'mt-3 flex flex-wrap items-center gap-3' }, primary, clock, remove),
        el('p', { class: 'mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm' },
          v.phone ? contact(`tel:${v.phone.replace(/\s/g, '')}`, 'phone', 'Call') : null,
          v.telegram ? contact(`https://t.me/${v.telegram}`, 'send', 'Telegram') : null,
          v.emergencyPhone ? contact(`tel:${v.emergencyPhone.replace(/\s/g, '')}`, 'phone', `Emergency: ${v.emergencyName}${v.emergencyRelation ? ` (${v.emergencyRelation})` : ''}`, true) : null));
    };

    const parts = sessionFormFields(app, s, d);
    const edit = el('form', { class: 'space-y-4', novalidate: true },
      field('title', 'Title', { value: s.title }),
      field('date', 'Date', { type: 'date', value: s.date }),
      el('div', { class: 'grid grid-cols-2 gap-4' },
        field('startTime', 'Starts', { type: 'time', value: s.startTime }),
        field('endTime', 'Ends', { type: 'time', value: s.endTime })),
      parts.venue,
      parts.project,
      field('capacity', 'Volunteer slots', { type: 'number', min: 0, max: 500, value: s.capacity, hint: '0 means no limit.' }),
      field('notes', 'Notes for volunteers', { type: 'textarea', value: s.notes || '' }),
      parts.trainees,
      el('button', { type: 'submit', class: 'btn btn-primary w-full' }, 'Save changes'));
    edit.addEventListener('submit', (e) => {
      e.preventDefault();
      const payload = sessionPayload(edit);
      if (!payload) return;
      busy(edit.querySelector('button[type=submit]'), 'Saving…', async () => {
        apply(await call('updateSession', { sessionId, ...payload }));
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
    const stat = (n, label, tone) => el('div', { class: 'card p-3 text-center' },
      el('p', { class: `text-2xl font-extrabold ${tone}` }, String(n)),
      el('p', { class: 'text-[11px] font-bold uppercase tracking-wider muted' }, label));

    let pairAll = null;
    if (s.status !== 'cancelled' && (d.stats.pending || d.stats.unpaired)) {
      pairAll = el('button', { class: 'btn btn-primary mt-3 w-full' }, icon('sparkle'),
        d.stats.pending ? `Confirm all & pair trainees (${d.stats.pending})` : `Pair ${d.stats.unpaired} volunteer${d.stats.unpaired === 1 ? '' : 's'} with a trainee`);
      pairAll.addEventListener('click', () => busy(pairAll, 'Pairing…', async () => {
        const res = await call('confirmAll', { sessionId });
        apply(res);
        toast(res.message, res.detail.stats.unpaired ? 'warn' : 'ok');
      }));
    }
    const venueAddress = (d.venues.find((v) => v.name === s.venue) || {}).address || s.venueAddress;

    mount(root,
      backLink('#/today', 'Sessions'),
      el('div', { class: 'flex items-start justify-between gap-3' },
        el('div', { class: 'min-w-0' },
          el('h1', { class: 'page-title leading-tight' }, s.title),
          el('p', { class: 'mt-1 font-bold text-indigo-600 dark:text-indigo-400' }, `${fmtDay(s.date, d.today)}, ${fmtTimes(s)}`),
          el('p', { class: 'flex items-center gap-1 text-sm muted' }, icon('pin', 'size-4'),
            s.venue ? el('a', { href: mapsLink(venueAddress || s.venue), target: '_blank', rel: 'noopener', class: 'hover:underline' }, s.venue) : 'No venue set'),
          s.project ? el('div', { class: 'mt-1.5' }, badge(s.project, 'emerald')) : null),
        s.status !== 'open' ? badge(s.status === 'closed' ? 'Bookings closed' : 'Cancelled', 'red') : null),
      attending.size ? el('p', { class: 'mt-2 text-sm muted' },
        el('span', { class: 'font-bold text-slate-700 dark:text-neutral-200' }, 'Trainees attending: '),
        [...attending].map((id) => traineeName[id] || id).join(', ')) : null,
      el('div', { class: 'mt-4 grid grid-cols-4 gap-2' },
        stat(`${d.stats.booked}${s.capacity ? `/${s.capacity}` : ''}`, 'Booked', 'text-slate-900 dark:text-white'),
        stat(d.stats.pending, 'To confirm', 'text-amber-600 dark:text-amber-400'),
        stat(d.stats.onSite, 'On site', 'text-emerald-600 dark:text-emerald-400'),
        stat(d.stats.done, 'Done', 'text-indigo-600 dark:text-indigo-400')),
      isToday && s.status !== 'cancelled'
        ? el('a', { href: `#/scan/${sessionId}`, class: 'btn btn-success mt-4 w-full' }, icon('scan'), 'Scan passes for this session')
        : null,
      pairAll,
      el('h2', { class: 'group-label' }, `Volunteers (${active.length})`),
      active.length ? list(active.map(bookingRow)) : el('p', { class: 'text-sm muted' }, 'No bookings yet.'),
      cancelled.length ? el('details', { class: 'mt-4' },
        el('summary', { class: 'group-label cursor-pointer' }, `Cancelled (${cancelled.length})`),
        el('ul', { class: 'space-y-1 text-sm muted' }, cancelled.map((b) => el('li', {}, b.volunteer.name)))) : null,
      el('details', { class: 'card group mt-6 overflow-hidden' },
        el('summary', { class: 'section-head section-indigo cursor-pointer list-none select-none' },
          'Edit or close this session', icon('down', 'size-5 transition-transform duration-200 group-open:rotate-180')),
        el('div', { class: 'space-y-4 p-4' },
          edit,
          s.status === 'open' ? statusButton('Close bookings', 'closed', 'btn-secondary') : statusButton('Reopen bookings', 'open', 'btn-secondary'),
          s.status !== 'cancelled' ? statusButton('Cancel session', 'cancelled', 'btn-danger', `Cancel ${s.title}? Volunteers will see it disappear from their list.`) : null)));
  };

  const cached = app.cachedDetail(sessionId);
  if (cached) draw(cached);
  else mount(root, loading());
  return call('sessionDetail', { sessionId })
    .then((d) => {
      app.cacheDetail(sessionId, d);
      // Don't redraw under someone who is typing or choosing a trainee.
      if (ctx.alive() && (!cached || !root.contains(document.activeElement) || document.activeElement === document.body)) draw(d);
    })
    .catch((err) => {
      if (!ctx.alive()) return;
      if (!cached) mount(root, errorBlock(err, () => app.rerender()));
      else toast(err.message, 'error');
    });
}

/* ---------------- New session ---------------- */

export function renderNewSession(root, app, ctx) {
  const draw = (home) => {
    const submit = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, 'Create session');
    const parts = sessionFormFields(app, { traineeIds: [] }, home);
    const form = el('form', { novalidate: true, class: 'space-y-6' },
      section('Session details', 'indigo',
        field('title', 'Title', { placeholder: 'e.g. Art & Craft' }),
        field('date', 'Date', { type: 'date', value: todaySG(), min: todaySG() }),
        el('div', { class: 'grid grid-cols-2 gap-4' },
          field('startTime', 'Starts', { type: 'time', value: '10:00' }),
          field('endTime', 'Ends', { type: 'time', value: '12:00' })),
        parts.venue,
        parts.project),
      section('For volunteers', 'green',
        field('capacity', 'Volunteer slots', { type: 'number', min: 0, max: 500, inputmode: 'numeric', optional: true, placeholder: 'Leave empty for no limit' }),
        field('notes', 'Notes', { type: 'textarea', optional: true, placeholder: 'What to wear or bring, where to meet' })),
      section('Trainee pairing', 'purple', parts.trainees),
      el('div', { class: 'h-20' }),
      el('div', { class: 'action-bar' }, el('div', { class: 'mx-auto max-w-2xl' }, submit)));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const payload = sessionPayload(form);
      if (!payload) return;
      busy(submit, 'Creating…', async () => {
        const res = await call('createSession', payload);
        app.saveAdminHome(res.home);
        toast('Session created. Volunteers can book it now.');
        app.go(`#/session/${res.session.sessionId}`);
      });
    });
    mount(root, backLink('#/today', 'Sessions'), el('h1', { class: 'page-title mb-6' }, 'New session'), form);
  };
  const home = app.cachedAdminHome();
  if (home && home.venues) {
    draw(home);
    return Promise.resolve();
  }
  mount(root, loading());
  return app.fetchAdminHome().then((h) => { if (ctx.alive()) draw(h); })
    .catch((err) => { if (ctx.alive()) mount(root, backLink('#/today', 'Sessions'), errorBlock(err, () => app.rerender())); });
}

/* ---------------- Scan ---------------- */

// CSL Attendance convention: clock in = emerald, clock out = indigo.
const OUTCOME = {
  in: { title: 'Successful clock in!', icon: 'check', circle: 'bg-emerald-500', box: 'alert-success', vibrate: 80 },
  out: { title: 'Successful clock out!', icon: 'logout', circle: 'bg-indigo-600', box: 'alert-info', vibrate: [60, 50, 60] },
  'already-in': { title: 'Already clocked in', icon: 'clock', circle: 'bg-amber-500', box: 'alert-warn', vibrate: [30, 30, 30] },
  'already-out': { title: 'Already clocked out', icon: 'clock', circle: 'bg-amber-500', box: 'alert-warn', vibrate: [30, 30, 30] },
  'not-booked': { title: 'Not booked for today', icon: 'alert', circle: 'bg-amber-500', box: 'alert-warn', vibrate: [200] },
  queued: { title: 'Saved on this phone', icon: 'cloudOff', circle: 'bg-slate-700', box: 'alert-warn', vibrate: 80 },
  error: { title: "Couldn't clock in or out", icon: 'x', circle: 'bg-red-600', box: 'alert-error', vibrate: [200, 80, 200] },
};

export function renderScan(root, app, ctx, presetSessionId) {
  let scanner = null;
  const home = app.cachedAdminHome();
  const today = todaySG();
  let sessionsToday = home ? home.sessions.filter((s) => s.date === today && s.status !== 'cancelled') : [];

  const select = el('select', { id: 'scan-session', class: 'input' });
  const fillSelect = () => {
    mount(select,
      el('option', { value: '' }, "Match to each volunteer's booking"),
      sessionsToday.map((s) => el('option', { value: s.sessionId, selected: s.sessionId === presetSessionId }, `${s.title} (${fmtTimes(s)})`)));
  };
  fillSelect();
  if (!home) {
    app.fetchAdminHome().then((h) => {
      sessionsToday = h.sessions.filter((s) => s.date === today && s.status !== 'cancelled');
      if (ctx.alive()) fillSelect();
    }).catch(() => {});
  }

  const reader = el('div', { id: 'reader', class: 'relative mt-4 aspect-[4/3] max-h-[42vh] w-full overflow-hidden rounded-2xl bg-slate-900 shadow-xl' });
  const result = el('div', { class: 'mt-4', 'aria-live': 'assertive' },
    el('div', { class: 'card flex items-center gap-3 p-4 text-sm muted' }, icon('scan', 'size-6 text-slate-300 dark:text-neutral-700'), "Point the camera at a volunteer's QR pass. The result shows here."));
  const queueLine = el('div', { class: 'mt-4' });
  const recentList = el('div', {});
  const startBtn = el('button', { class: 'btn btn-secondary mt-3 w-full', hidden: true }, icon('scan'), 'Start camera');

  const drawRecent = () => {
    const recent = app.recentScans();
    mount(recentList, recent.length ? [
      el('h2', { class: 'group-label' }, 'Scan logs on this phone'),
      list(recent.map((r) => {
        const o = OUTCOME[r.outcome] || OUTCOME.error;
        return el('div', { class: 'flex items-center gap-3 p-3 text-sm' },
          el('span', { class: `flex size-7 shrink-0 items-center justify-center rounded-full text-white ${o.circle}` }, icon(o.icon, 'size-4')),
          el('span', { class: 'min-w-0 flex-1 truncate font-bold text-slate-900 dark:text-white' }, r.name || 'Unknown'),
          el('span', { class: 'shrink-0 muted' }, `${o.title.replace('Successful ', '').replace('!', '')}, ${r.time}`));
      })),
    ] : []);
  };

  const drawQueue = () => {
    const n = app.queuedScans().length;
    mount(queueLine, n ? el('div', { class: 'alert alert-warn flex items-center justify-between gap-3' },
      el('p', {}, `${n} scan${n === 1 ? '' : 's'} saved offline. They upload automatically when you're back online.`),
      el('button', { class: 'btn btn-secondary btn-sm shrink-0', onclick: async (e) => { await busy(e.currentTarget, 'Uploading…', () => app.flushScans(true)); drawQueue(); drawRecent(); } }, 'Upload now')) : []);
  };
  ctx.onEvent('scans-changed', () => { drawQueue(); drawRecent(); });

  let lastCode = '';
  const walkInButton = () => {
    const btn = el('button', { class: 'btn btn-success mt-3 w-full' }, icon('userPlus'), 'Add as walk-in and clock in');
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

  const show = (outcome, res, extra) => {
    const o = OUTCOME[outcome] || OUTCOME.error;
    if (navigator.vibrate) navigator.vibrate(o.vibrate);
    mount(result, el('div', { class: `pop-in alert ${o.box} p-4` },
      el('div', { class: 'flex items-start gap-3' },
        el('span', { class: `flex size-12 shrink-0 items-center justify-center rounded-full text-white shadow-lg ${o.circle}` }, icon(o.icon, 'size-6')),
        el('div', { class: 'min-w-0' },
          el('p', { class: 'text-lg font-extrabold leading-tight text-slate-900 dark:text-white' }, o.title),
          res && res.volunteer ? el('p', { class: 'text-base font-bold text-slate-800 dark:text-neutral-100' }, res.volunteer.name) : null,
          res && res.trainee ? el('p', { class: 'text-sm' }, `Paired with ${res.trainee.name}`) : null,
          res && res.session ? el('p', { class: 'text-xs muted' }, `${res.session.title}, ${fmtTimes(res.session)}`) : null)),
      el('p', { class: `mt-2 ${outcome === 'out' ? 'text-base font-bold' : ''}` }, res && res.message ? res.message : extra || ''),
      outcome === 'not-booked' ? walkInButton() : null));
    if (res && res.volunteer) app.addRecentScan({ name: res.volunteer.name, outcome, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) });
    drawRecent();
  };

  const onCode = async (code) => {
    lastCode = code;
    mount(result, el('div', { class: 'card flex items-center gap-3 p-4 font-bold' }, el('span', { class: 'spinner' }), 'Checking pass…'));
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
    mount(reader, el('p', { class: 'absolute inset-0 flex items-center justify-center gap-2 p-6 text-center text-sm font-bold text-white' }, el('span', { class: 'spinner spinner-white' }), 'Starting camera…'));
    try {
      scanner = await startScanner('reader', onCode);
      const placeholder = reader.querySelector(':scope > p');
      if (placeholder) placeholder.remove(); // in case the library kept our "Starting camera…" text
      if (!ctx.alive()) scanner.stop();
    } catch (err) {
      mount(reader, el('p', { class: 'absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-bold text-white' }, err.message));
      startBtn.hidden = false;
    }
  };
  startBtn.addEventListener('click', start);
  ctx.onLeave(() => { if (scanner) scanner.stop(); });

  mount(root,
    el('h1', { class: 'page-title' }, 'Scan passes'),
    el('p', { class: 'mt-1 text-sm muted' }, 'First scan clocks a volunteer in, the next clocks them out.'),
    el('label', { class: 'label mt-4', for: 'scan-session' }, 'Session'), select,
    result, reader, startBtn, queueLine, recentList);
  drawQueue();
  drawRecent();
  start();
}

/* ---------------- People (volunteers and leaders) and Trainees ---------------- */

export function renderPeople(root, app, ctx, tab) {
  const showTrainees = tab === 'trainees';
  const seg = el('div', { class: 'seg mb-4', role: 'tablist' },
    el('a', { href: '#/people', class: 'seg-item', role: 'tab', 'aria-current': showTrainees ? null : 'page' }, icon('users', 'size-4'), 'Volunteers'),
    el('a', { href: '#/people/trainees', class: 'seg-item', role: 'tab', 'aria-current': showTrainees ? 'page' : null }, icon('heart', 'size-4'), 'Trainees'));
  const host = el('div', {});
  mount(root, el('h1', { class: 'page-title mb-4' }, 'People'), seg, host);
  if (showTrainees) return traineeList(host, app, ctx);

  let people = app.cachedPeople();
  let query = '';
  const listHost = el('div', { class: 'mt-4' });

  const personRow = (p) => el('a', { href: `#/person/${p.userId}`, class: `flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-neutral-900 ${p.status === 'inactive' ? 'opacity-60' : ''}` },
    el('span', { class: 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-sm font-extrabold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' }, initials(p.name)),
    el('div', { class: 'min-w-0 flex-1' },
      el('p', { class: 'flex items-center gap-2 font-bold text-slate-900 dark:text-white' }, el('span', { class: 'truncate' }, p.name),
        p.role === 'admin' ? badge('Leader', 'purple') : null,
        p.status === 'inactive' ? badge('Deactivated', 'red') : null),
      el('p', { class: 'truncate text-sm muted' }, `${fmtHours(p.hours)} over ${p.sessions} session${p.sessions === 1 ? '' : 's'}${p.phone ? ` · ${p.phone}` : ''}`)),
    icon('chevron', 'size-5 text-slate-300 dark:text-neutral-700'));

  const drawList = () => {
    if (!people) return;
    const shown = fuzzyFilter(people, query, (p) => [p.name, p.email, p.phone, p.telegram, p.emergencyName, p.role === 'admin' ? 'leader' : 'volunteer']);
    const leaders = people.filter((p) => p.role === 'admin').length;
    mount(listHost,
      el('p', { class: 'mb-2 text-xs font-bold uppercase tracking-wider muted' }, `${people.length} people, ${leaders} leader${leaders === 1 ? '' : 's'}`),
      shown.length ? list(shown.map(personRow)) : el('p', { class: 'text-sm muted' }, 'No one matches that search.'));
  };

  mount(host, searchBox('Search by name, email, phone or Telegram', (q) => { query = q; drawList(); }, 'Search volunteers'), listHost);
  if (people) drawList();
  else mount(listHost, loading());
  return call('listPeople', {}).then((res) => {
    people = res.people;
    app.cachePeople(people);
    if (ctx.alive()) drawList();
  }).catch((err) => {
    if (ctx.alive() && !app.cachedPeople()) mount(listHost, errorBlock(err, () => app.rerender()));
  });
}
