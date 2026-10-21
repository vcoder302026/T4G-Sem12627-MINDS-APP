// Admin screens for sessions: the list, one session (who's coming), new
// session, scanning QR passes and clocking in by hand. Pairing boards are in
// pairing.js. Layout and colours follow CSL Attendance's admin dashboard.

import { call, isNetworkError } from '../api.js';
import { startScanner } from '../qr.js';
import {
  backLink, badge, busy, clockTime, combobox, el, errorBlock, field, fmtDay, fmtHours, fmtTimes, formData, fuzzyFilter, projectBadges, projectShort,
  icon, initials, labelled, loading, mapsLink, mount, multiPick, searchBox, section, toast, todaySG, typeBadges,
} from '../ui.js';
import { personName, traineeName as traineeLabel } from '../quickview.js';
import { projectChecks, venuePicker } from './content.js';

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
  const project = projectChecks(ref.projects || [], s.projects || []);
  const trainees = multiPick({
    name: 'traineeIds',
    options: (ref.trainees || []).map((t) => ({ value: t.id, label: t.name, hint: traineeHint(t) })),
    values: s.traineeIds || [],
    placeholder: 'Search trainees',
  });
  return {
    venue: labelled('Venue', venue.el, { hint: "Not in the list? Type the name and choose “Add a new venue”." }),
    project: labelled('Projects', project.el, { hint: 'Tick every project this session is for.' }),
    projectValues: project.values,
    trainees: labelled('Trainees attending', trainees.el, {
      optional: true,
      hint: 'Shown first on the pairing board. Leave empty to choose from all active trainees.',
    }),
  };
}

/** Form values → createSession/updateSession payload. Returns null (and warns) if something is missing. */
function sessionPayload(form, parts) {
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
    project: parts.projectValues(),
    capacity: f.capacity === '' ? 0 : Number(f.capacity),
    notes: f.notes || '',
    traineeIds: f.traineeIds ? f.traineeIds.split(',').filter(Boolean) : [],
  };
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
        el('p', { class: 'truncate text-sm muted' }, [s.venue, (s.projects || []).map(projectShort).join(' + ')].filter(Boolean).join(' · ')),
        el('div', { class: 'mt-2 flex flex-wrap items-center gap-1.5' },
          badge(`${st.booked}${s.capacity ? `/${s.capacity}` : ''} coming`, 'slate'),
          st.unpaired && s.date >= today ? badge(`${st.unpaired} to pair`, 'amber') : null,
          st.onSite ? badge(`${st.onSite} on site`, 'emerald') : null,
          st.done ? badge(`${st.done} done`, 'indigo') : null,
          st.noShows ? badge(`${st.noShows} no-show${st.noShows === 1 ? '' : 's'}`, 'red') : null,
          s.status === 'closed' ? badge('Sign-ups closed', 'red') : null)),
      // Everything for one session, right on its row: pairing, and on the day scanning and clocking in by hand.
      el('div', { class: 'flex shrink-0 flex-col gap-1.5' },
        el('a', { href: `#/pair/${s.sessionId}`, class: 'btn btn-secondary btn-sm', 'aria-label': `Pair volunteers for ${s.title}` }, icon('sparkle', 'size-4'), 'Pair'),
        s.date === today ? el('a', { href: `#/scan/${s.sessionId}`, class: 'btn btn-success btn-sm', 'aria-label': `Scan passes for ${s.title}` }, icon('scan', 'size-4'), 'Scan') : null,
        s.date === today ? el('a', { href: `#/clock/${s.sessionId}`, class: 'btn btn-secondary btn-sm', 'aria-label': `Clock in by hand for ${s.title}` }, icon('clock', 'size-4'), 'Clock in') : null));
  };

  const drawList = () => {
    const a = latest;
    if (!a) return;
    const today = a.today;
    const alerts = [
      a.unpairedTotal ? el('a', { href: '#/pairings', class: 'alert alert-warn mt-4 flex items-center gap-2' }, icon('alert', 'size-4'),
        el('span', { class: 'flex-1' }, `${a.unpairedTotal} volunteer${a.unpairedTotal === 1 ? '' : 's'} coming soon still need${a.unpairedTotal === 1 ? 's' : ''} a trainee.`),
        icon('chevron', 'size-4')) : null,
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
      upcoming.length ? list(upcoming.map((s) => row(s, today))) : el('p', { class: 'text-sm muted' }, 'Nothing scheduled. Create a session so volunteers can say they\'re coming.'),
      past.length ? el('details', { class: 'mt-6' },
        el('summary', { class: 'group-label cursor-pointer' }, `Past week (${past.length})`),
        list(past.map((s) => row(s, today)))) : null);
  };

  mount(root,
    el('div', { class: 'flex flex-wrap items-center justify-between gap-3' },
      el('h1', { class: 'page-title' }, 'Sessions'),
      el('div', { class: 'flex gap-2' },
        el('a', { href: '#/scan', class: 'btn btn-success btn-sm' }, icon('scan', 'size-4'), 'Scan passes'),
        el('a', { href: '#/new-session', class: 'btn btn-primary btn-sm' }, icon('plus', 'size-4'), 'New session'))),
    el('p', { class: 'mt-1 text-xs muted' }, 'Press and hold any name for their details.'),
    el('div', { class: 'mt-4' }, searchBox('Search sessions by title, venue, project or date', (q) => { query = q; drawList(); })),
    host);
  return withAdminHome(host, app, ctx, (a) => { latest = a; drawList(); });
}

/* ---------------- Session detail ---------------- */

export function renderSession(root, app, ctx, sessionId) {
  const draw = (d) => {
    const s = d.session;
    const isToday = s.date === d.today;
    const isPast = s.date < d.today;
    const active = d.bookings.filter((b) => b.status !== 'cancelled');
    const cancelled = d.bookings.filter((b) => b.status === 'cancelled');
    const attending = new Set(s.traineeIds || []);
    const traineeName = Object.fromEntries(d.trainees.map((t) => [t.id, t.name]));
    const apply = (res) => {
      app.cacheDetail(sessionId, res.detail);
      app.dropAdminHome();
      if (ctx.alive()) draw(res.detail);
    };

    const row = (b) => {
      const v = b.volunteer;
      const a = b.attendance;
      let attendance = null;
      if (a && a.clockOut) attendance = badge(`${clockTime(a.clockIn)}–${clockTime(a.clockOut)}, ${fmtHours(a.hours)}`, 'indigo', 'check');
      else if (a) attendance = badge(`In since ${clockTime(a.clockIn)}`, 'emerald', 'clock');
      else if (b.noShow) attendance = badge('No-show', 'red');
      let remove = null;
      if (!a && !isPast) {
        remove = el('button', { class: 'text-sm font-bold text-red-600 hover:underline dark:text-red-400' }, 'Remove');
        remove.addEventListener('click', () => {
          if (!confirm(`Take ${v.name} off ${s.title}?`)) return;
          busy(remove, 'Removing…', async () => { const res = await call('updateBooking', { bookingId: b.bookingId, status: 'cancelled' }); apply(res); toast(res.message); });
        });
      }
      const name = el('div', { class: 'min-w-0 flex-1' },
        personName(v.name, v.userId, 'block truncate font-bold text-slate-900 dark:text-white'),
        el('span', { class: 'mt-0.5 flex flex-wrap gap-1' }, typeBadges(v), b.walkIn ? badge('Walk-in', 'purple') : null, b.feedbackGiven ? badge('Feedback in', 'indigo') : null));
      return el('div', { class: 'flex items-start gap-3 p-4' },
        el('span', { class: 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-sm font-extrabold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' }, initials(v.name)),
        el('div', { class: 'min-w-0 flex-1' },
          el('div', { class: 'flex items-start gap-2' }, name, remove),
          el('p', { class: 'mt-1.5 text-sm' }, b.trainee
            ? [el('span', { class: 'muted' }, b.pairing === 'standing' ? 'Regular trainee: ' : 'Trainee: '),
              el('a', { href: `#/trainee/${encodeURIComponent(b.trainee.id)}`, class: 'link' }, traineeLabel(b.trainee.name, b.trainee.id))]
            : badge('Not paired yet', 'amber', 'alert')),
          attendance ? el('div', { class: 'mt-1.5' }, attendance) : null));
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
      const payload = sessionPayload(edit, parts);
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
    const venueAddress = (d.venues.find((v) => v.name === s.venue) || {}).address || s.venueAddress;

    mount(root,
      backLink('#/today', 'Sessions'),
      el('div', { class: 'flex items-start justify-between gap-3' },
        el('div', { class: 'min-w-0' },
          el('h1', { class: 'page-title leading-tight' }, s.title),
          el('p', { class: 'mt-1 font-bold text-indigo-600 dark:text-indigo-400' }, `${fmtDay(s.date, d.today)}, ${fmtTimes(s)}`),
          el('p', { class: 'flex items-center gap-1 text-sm muted' }, icon('pin', 'size-4'),
            s.venue ? el('a', { href: mapsLink(venueAddress || s.venue), target: '_blank', rel: 'noopener', class: 'hover:underline' }, s.venue) : 'No venue set'),
          s.projects && s.projects.length ? el('div', { class: 'mt-1.5 flex flex-wrap gap-1' }, projectBadges(s.projects)) : null),
        s.status !== 'open' ? badge(s.status === 'closed' ? 'Sign-ups closed' : 'Cancelled', 'red') : null),
      attending.size ? el('p', { class: 'mt-2 text-sm muted' },
        el('span', { class: 'font-bold text-slate-700 dark:text-neutral-200' }, 'Trainees attending: '),
        [...attending].map((id, k) => [k ? ', ' : '', traineeLabel(traineeName[id] || id, id)])) : null,
      el('div', { class: 'mt-4 grid grid-cols-4 gap-2' },
        stat(`${d.stats.booked}${s.capacity ? `/${s.capacity}` : ''}`, 'Coming', 'text-slate-900 dark:text-white'),
        stat(d.stats.unpaired, 'To pair', 'text-amber-600 dark:text-amber-400'),
        stat(isPast ? d.stats.noShows : d.stats.onSite, isPast ? 'No-shows' : 'On site', isPast ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'),
        stat(d.stats.done, 'Done', 'text-indigo-600 dark:text-indigo-400')),
      s.status !== 'cancelled' ? el('div', { class: 'mt-4 grid gap-2 sm:grid-cols-3' },
        el('a', { href: `#/pair/${sessionId}`, class: 'btn btn-primary' }, icon('sparkle'), d.stats.unpaired ? `Pair ${d.stats.unpaired}` : 'Pairing'),
        isToday ? el('a', { href: `#/scan/${sessionId}`, class: 'btn btn-success' }, icon('scan'), 'Scan passes') : null,
        isToday ? el('a', { href: `#/clock/${sessionId}`, class: 'btn btn-secondary' }, icon('clock'), 'Clock in by hand') : null) : null,
      el('h2', { class: 'group-label' }, `Coming (${active.length})`),
      el('p', { class: 'mb-2 text-xs muted' }, 'Press and hold a name for their Telegram, phone or trainee details.'),
      active.length ? list(active.map(row)) : el('p', { class: 'text-sm muted' }, 'No one has said they\'re coming yet.'),
      cancelled.length ? el('details', { class: 'mt-4' },
        el('summary', { class: 'group-label cursor-pointer' }, `No longer coming (${cancelled.length})`),
        el('ul', { class: 'space-y-1 text-sm muted' }, cancelled.map((b) => el('li', {}, personName(b.volunteer.name, b.volunteer.userId))))) : null,
      el('details', { class: 'card group mt-6 overflow-hidden' },
        el('summary', { class: 'section-head section-indigo cursor-pointer list-none select-none' },
          'Edit or close this session', icon('down', 'size-5 transition-transform duration-200 group-open:rotate-180')),
        el('div', { class: 'space-y-4 p-4' },
          el('p', { class: 'alert alert-info' }, 'MINDS is reviewing how sessions are set up; this form may change.'),
          edit,
          s.status === 'open' ? statusButton('Close sign-ups', 'closed', 'btn-secondary') : statusButton('Reopen sign-ups', 'open', 'btn-secondary'),
          s.status !== 'cancelled' ? statusButton('Cancel session', 'cancelled', 'btn-danger', `Cancel ${s.title}? Volunteers will see it disappear from their list.`) : null)));
  };

  const cached = app.cachedDetail(sessionId);
  if (cached) draw(cached);
  else mount(root, loading());
  return call('sessionDetail', { sessionId })
    .then((d) => {
      app.cacheDetail(sessionId, d);
      // Don't redraw under someone who is typing.
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
    const opts = home.sessionOptions || { titles: ['Regular session'], times: [{ label: '2:30 pm – 5:30 pm', startTime: '14:30', endTime: '17:30' }], venue: '' };
    const OTHER = '__other__';
    const defaultProjects = (opts.projects || []).filter((n) => (home.projects || []).some((p) => p.name === n));
    const parts = sessionFormFields(app, { traineeIds: [], projects: defaultProjects }, home);

    // Session name: a dropdown (Config.gs → SESSION_OPTIONS.titles), or type another.
    const titleSelect = el('select', { id: 'f-titleChoice', class: 'input' },
      opts.titles.map((t) => el('option', { value: t }, t)), el('option', { value: OTHER }, 'Other…'));
    const titleOther = el('input', { class: 'input mt-2', name: 'titleOther', placeholder: 'Session name', maxlength: 120, hidden: true, 'aria-label': 'Session name' });
    titleSelect.addEventListener('change', () => { titleOther.hidden = titleSelect.value !== OTHER; if (!titleOther.hidden) titleOther.focus(); });

    // Time: a dropdown of fixed slots, or set your own.
    const timeSelect = el('select', { id: 'f-timeChoice', class: 'input' },
      opts.times.map((t, i) => el('option', { value: String(i) }, t.label)), el('option', { value: OTHER }, 'Other…'));
    const timeOther = el('div', { class: 'mt-2 grid grid-cols-2 gap-4', hidden: true },
      field('startTime', 'Starts', { type: 'time', value: opts.times[0] ? opts.times[0].startTime : '14:30' }),
      field('endTime', 'Ends', { type: 'time', value: opts.times[0] ? opts.times[0].endTime : '17:30' }));
    timeSelect.addEventListener('change', () => { timeOther.hidden = timeSelect.value !== OTHER; });

    // Venue: a dropdown of the venue list (Settings → Venues).
    const venues = home.venues || [];
    const defaultVenue = venues.some((v) => v.name === opts.venue) ? opts.venue : (venues[0] || {}).name;
    const venueSelect = el('select', { id: 'f-venueChoice', class: 'input' },
      venues.map((v) => el('option', { value: v.name, selected: v.name === defaultVenue }, v.name)));

    // Dates: the only thing to fill in. Several dates add the same session on each.
    const dateList = el('div', { class: 'space-y-2' });
    const submit = el('button', { type: 'submit', class: 'btn btn-primary w-full' });
    const dateInputs = () => [...dateList.querySelectorAll('input[type=date]')];
    const relabel = () => {
      const n = dateInputs().filter((d) => d.value).length;
      submit.textContent = n > 1 ? `Add ${n} sessions` : 'Add session';
    };
    const addDate = (value = '') => {
      const input = el('input', { type: 'date', class: 'input', min: todaySG(), value, 'aria-label': 'Date', required: true });
      input.addEventListener('change', relabel);
      const remove = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove this date' }, icon('x', 'size-5'));
      remove.addEventListener('click', () => { if (dateInputs().length > 1) { rowEl.remove(); relabel(); } else input.value = ''; });
      const rowEl = el('div', { class: 'flex items-center gap-2' }, input, remove);
      dateList.append(rowEl);
      relabel();
      return input;
    };
    addDate();
    const another = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('plus', 'size-4'), 'Add another date');
    another.addEventListener('click', () => addDate().focus());

    const form = el('form', { novalidate: true, class: 'space-y-6' },
      section('Session', 'indigo',
        el('div', {}, el('p', { class: 'label' }, 'Date'), dateList,
          el('div', { class: 'mt-2' }, another),
          el('p', { class: 'hint' }, 'Add several dates to put the same session on each, e.g. every Saturday this month.')),
        el('div', {}, el('label', { class: 'label', for: 'f-titleChoice' }, 'Session'), titleSelect, titleOther),
        el('div', {}, el('label', { class: 'label', for: 'f-timeChoice' }, 'Time'), timeSelect, timeOther),
        el('div', {}, el('label', { class: 'label', for: 'f-venueChoice' }, 'Venue'), venueSelect,
          el('p', { class: 'hint' }, 'Add or rename venues under Settings → Venues.')),
        parts.project),
      el('details', { class: 'card group overflow-hidden' },
        el('summary', { class: 'section-head section-green cursor-pointer list-none select-none' }, 'More options (optional)',
          icon('down', 'size-5 transition-transform duration-200 group-open:rotate-180')),
        el('div', { class: 'space-y-4 p-4' },
          field('capacity', 'Volunteer slots', { type: 'number', min: 0, max: 500, inputmode: 'numeric', optional: true, placeholder: 'Leave empty for no limit' }),
          field('notes', 'Notes for volunteers', { type: 'textarea', optional: true, placeholder: 'What to wear or bring, where to meet' }),
          parts.trainees)),
      el('div', { class: 'h-20' }),
      el('div', { class: 'action-bar' }, el('div', { class: 'mx-auto max-w-2xl' }, submit)));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dates = dateInputs().map((d) => d.value).filter(Boolean);
      if (!dates.length) { toast('Pick a date.', 'warn'); dateInputs()[0].focus(); return; }
      const title = titleSelect.value === OTHER ? titleOther.value.trim() : titleSelect.value;
      if (!title) { toast('Give the session a name.', 'warn'); titleOther.focus(); return; }
      const slot = timeSelect.value === OTHER ? null : opts.times[Number(timeSelect.value)];
      const f = formData(form);
      const payload = {
        dates,
        title,
        startTime: slot ? slot.startTime : f.startTime,
        endTime: slot ? slot.endTime : f.endTime,
        venue: venueSelect.value,
        project: parts.projectValues(),
        capacity: f.capacity === '' || f.capacity === undefined ? 0 : Number(f.capacity),
        notes: f.notes || '',
        traineeIds: f.traineeIds ? f.traineeIds.split(',').filter(Boolean) : [],
      };
      if (!payload.venue) { toast('Add a venue first, under Settings → Venues.', 'warn'); return; }
      busy(submit, 'Adding…', async () => {
        const res = await call('createSessions', payload);
        app.saveAdminHome(res.home);
        toast(res.message, res.skipped.length ? 'warn' : 'ok');
        if (res.created.length === 1) app.go(`#/session/${res.created[0].sessionId}`);
        else if (res.created.length) app.go('#/today');
      });
    });
    mount(root, backLink('#/today', 'Sessions'), el('h1', { class: 'page-title mb-6' }, 'New session'), form);
  };
  const home = app.cachedAdminHome();
  if (home && home.venues && home.sessionOptions) {
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
          personName(r.name || 'Unknown', r.userId, 'min-w-0 flex-1 truncate font-bold text-slate-900 dark:text-white'),
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
          res && res.volunteer ? el('p', { class: 'text-base font-bold text-slate-800 dark:text-neutral-100' }, personName(res.volunteer.name, res.volunteer.userId)) : null,
          res && res.trainee ? el('p', { class: 'text-sm' }, 'Paired with ', traineeLabel(res.trainee.name, res.trainee.id)) : null,
          res && res.session ? el('p', { class: 'text-xs muted' }, `${res.session.title}, ${fmtTimes(res.session)}`) : null)),
      el('p', { class: `mt-2 ${outcome === 'out' ? 'text-base font-bold' : ''}` }, res && res.message ? res.message : extra || ''),
      outcome === 'not-booked' ? walkInButton() : null));
    if (res && res.volunteer) app.addRecentScan({ name: res.volunteer.name, userId: res.volunteer.userId, outcome, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) });
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

/* ---------------- Clock in by hand ---------------- */

/** Today's sessions; one session's list with Clock in / Clock out buttons, and adding a walk-in. */
export function renderClock(root, app, ctx, presetSessionId) {
  const today = todaySG();
  const host = el('div', {});
  let sessionId = presetSessionId || '';

  const drawSession = (d) => {
    const s = d.session;
    const active = d.bookings.filter((b) => b.status !== 'cancelled');
    const apply = (res, message) => {
      app.cacheDetail(s.sessionId, res.detail);
      app.dropAdminHome();
      toast(message);
      if (ctx.alive()) drawSession(res.detail);
    };
    const row = (b) => {
      const v = b.volunteer;
      const a = b.attendance;
      let action;
      if (a && a.clockOut) action = badge(`${clockTime(a.clockIn)}–${clockTime(a.clockOut)}, ${fmtHours(a.hours)}`, 'indigo', 'check');
      else {
        action = el('button', { class: `btn btn-sm shrink-0 ${a ? 'btn-primary' : 'btn-success'}` }, icon(a ? 'logout' : 'clock', 'size-4'), a ? `Clock out (in ${clockTime(a.clockIn)})` : 'Clock in');
        action.addEventListener('click', () => busy(action, 'Saving…', async () => {
          const res = await call('manualClock', { bookingId: b.bookingId });
          apply(res, `${v.name}: ${res.message}`);
        }));
      }
      const name = el('div', { class: 'min-w-0 flex-1' },
        personName(v.name, v.userId, 'block truncate font-bold text-slate-900 dark:text-white'),
        el('span', { class: 'block truncate text-sm muted' }, b.trainee ? ['With ', traineeLabel(b.trainee.name, b.trainee.id)] : 'Not paired yet'));
      return el('div', { class: 'flex items-center gap-3 p-4' }, name, action);
    };
    const walkIn = combobox({
      name: 'walkIn',
      options: (d.people || []).filter((p) => !active.some((b) => b.volunteer.userId === p.userId)).map((p) => ({ value: p.userId, label: p.name, hint: p.email })),
      placeholder: 'Type a volunteer name',
      emptyText: 'No volunteer matches',
    });
    const addBtn = el('button', { class: 'btn btn-secondary' }, icon('userPlus', 'size-4'), 'Add & clock in');
    addBtn.addEventListener('click', () => {
      if (!walkIn.value) { toast('Choose the volunteer first.', 'warn'); return; }
      busy(addBtn, 'Adding…', async () => {
        const added = await call('addWalkIn', { sessionId: s.sessionId, userId: walkIn.value });
        const res = await call('manualClock', { bookingId: added.bookingId });
        apply(res, `${added.message} ${res.message}`);
      });
    });
    mount(host,
      el('h2', { class: 'group-label' }, `${s.title}, ${fmtTimes(s)}`),
      active.length ? list(active.map(row)) : el('p', { class: 'text-sm muted' }, 'No one has said they\'re coming.'),
      s.date === today ? el('section', { class: 'card mt-6 space-y-3 p-4' },
        el('h3', { class: 'font-bold' }, 'Someone turned up without signing up?'),
        walkIn.el, addBtn) : el('p', { class: 'alert alert-info mt-4' }, 'Clocking in by hand works on the day of the session. To fix past times, use Attendance.'));
  };

  const openSession = (id) => {
    sessionId = id;
    mount(host, loading());
    Promise.all([call('sessionDetail', { sessionId: id }), call('listPeople').catch(() => ({ people: [] }))])
      .then(([d, people]) => {
        if (!ctx.alive()) return;
        d.people = (people.people || []).filter((p) => p.status !== 'inactive');
        drawSession(d);
      })
      .catch((err) => { if (ctx.alive()) mount(host, errorBlock(err, () => openSession(id))); });
  };

  const select = el('select', { id: 'clock-session', class: 'input' });
  select.addEventListener('change', () => { if (select.value) openSession(select.value); else mount(host); });
  mount(root,
    el('h1', { class: 'page-title' }, 'Clock in by hand'),
    el('p', { class: 'mt-1 text-sm muted' }, 'For a volunteer whose phone is flat or who forgot their pass. Press and hold a name for their details.'),
    el('label', { class: 'label mt-4', for: 'clock-session' }, 'Session'), select, host);
  const fill = (h) => {
    const todays = h.sessions.filter((s) => s.date === today && s.status !== 'cancelled');
    mount(select, el('option', { value: '' }, todays.length ? 'Choose today\'s session' : 'No sessions today'),
      todays.map((s) => el('option', { value: s.sessionId, selected: s.sessionId === sessionId }, `${s.title} (${fmtTimes(s)})`)));
    if (!sessionId && todays.length === 1) sessionId = todays[0].sessionId;
    select.value = sessionId;
    if (sessionId && !host.childNodes.length) openSession(sessionId);
  };
  const cached = app.cachedAdminHome();
  if (cached) fill(cached);
  return app.fetchAdminHome().then((h) => { if (ctx.alive()) fill(h); }).catch((err) => {
    if (ctx.alive() && !cached) mount(host, errorBlock(err, () => app.rerender()));
  });
}
