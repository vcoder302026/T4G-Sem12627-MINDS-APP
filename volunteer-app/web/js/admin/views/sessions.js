// Admin: sessions and pairing, new session, scanning passes and clocking in by hand.
//
// Volunteers just say they're coming, so there is nothing to confirm. The
// session page is for pairing only: who still needs a trainee (new and ad-hoc
// volunteers) is at the top; regulars are usually paired already. Press and
// hold a volunteer's name (or right-click) for their contact details, so the
// list itself stays short. Clocking in by hand is its own tab on the Scan page.

import { call, isNetworkError } from '../../api.js';
import { startScanner } from '../../qr.js';
import {
  badge, busy, clockTime, el, errorBlock, field, fmtDay, fmtHours, fmtTimes, formData, fuzzyFilter, icon, labelled, loading,
  mapsLink, modal, mount, multiPick, onLongPress, searchBox, section, selectField, toast, todaySG, typeBadge,
} from '../../ui.js';
import { projectPicker, venuePicker } from '../../views/content.js';
import { backTo, pageHead, tabs } from '../kit.js';

function list(...rows) {
  return el('div', { class: 'card divide-y divide-slate-100 overflow-hidden dark:divide-neutral-900' }, ...rows);
}

async function withAdminHome(root, app, ctx, draw) {
  const cached = app.cachedAdminHome();
  if (cached && cached.sessionTypes) draw(cached);
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

/* ---------------- volunteer details on press-and-hold ---------------- */

export function volunteerCard(v) {
  const contact = (href, iconName, text) => el('a', { href, target: href.startsWith('http') ? '_blank' : null, rel: 'noopener', class: 'btn btn-secondary btn-sm justify-start' }, icon(iconName, 'size-4'), text);
  modal(v.name, el('div', { class: 'space-y-4' },
    el('div', { class: 'flex flex-wrap items-center gap-2' },
      typeBadge(v.type),
      badge(`${v.completedSessions} session${v.completedSessions === 1 ? '' : 's'} done`, 'slate'),
      v.noShows ? badge(`${v.noShows} no-show${v.noShows === 1 ? '' : 's'}`, 'red') : null),
    el('div', { class: 'grid gap-2' },
      v.telegram ? contact(`https://t.me/${v.telegram}`, 'send', `Telegram @${v.telegram}`) : el('p', { class: 'text-sm muted' }, 'No Telegram handle.'),
      v.phone ? contact(`tel:${String(v.phone).replace(/\s/g, '')}`, 'phone', `Call ${v.phone}`) : null),
    v.regularTrainees && v.regularTrainees.length ? el('p', { class: 'text-sm' }, el('span', { class: 'font-bold' }, 'Regular trainees: '), v.regularTrainees.join(', ')) : null,
    el('a', { href: `#/admin/volunteer/${v.userId}`, class: 'link text-sm' }, 'Open their full page')));
}

/** A volunteer's name you can press and hold for details. */
function holdName(v, cls = '') {
  const b = el('button', { type: 'button', class: `hold min-w-0 truncate text-left font-bold text-slate-900 underline decoration-dotted decoration-slate-300 underline-offset-4 dark:text-white dark:decoration-neutral-700 ${cls}`, title: 'Press and hold (or right-click) for contact details', 'aria-label': `${v.name}. Press Enter for contact details.` }, v.name);
  onLongPress(b, () => volunteerCard(v), { onTap: (e) => { if (e.pointerType === 'mouse') volunteerCard(v); } });
  return b;
}

/* ---------------- sessions list ---------------- */

export function renderSessions(root, app, ctx) {
  let query = '';
  let latest = null;
  const host = el('div', {});
  const row = (s, today) => {
    const st = s.stats;
    return el('div', { class: 'flex items-center gap-3 p-4' },
      el('a', { href: `#/admin/session/${s.sessionId}`, class: 'min-w-0 flex-1' },
        el('p', { class: 'text-sm font-bold text-indigo-600 dark:text-indigo-400' }, s.date === today ? fmtTimes(s) : `${fmtDay(s.date, today)}, ${fmtTimes(s)}`),
        el('h3', { class: 'font-bold leading-snug text-slate-900 dark:text-white' }, s.title),
        el('p', { class: 'truncate text-sm muted' }, [s.type !== 'Volunteer session' ? s.type : '', s.venue, s.project].filter(Boolean).join(' · ')),
        el('div', { class: 'mt-2 flex flex-wrap items-center gap-1.5' },
          badge(`${st.coming} coming${s.capacity ? ` of ${s.capacity}` : ''}`, 'slate'),
          st.unpaired ? badge(`${st.unpaired} need${st.unpaired === 1 ? 's' : ''} a trainee`, 'amber') : null,
          st.onSite ? badge(`${st.onSite} on site`, 'emerald') : null,
          st.done ? badge(`${st.done} done`, 'indigo') : null,
          s.status === 'closed' ? badge('Sign-ups closed', 'red') : null)),
      s.date === today
        ? el('a', { href: `#/admin/scan/${s.sessionId}`, class: 'btn btn-success btn-sm shrink-0', 'aria-label': `Scan passes for ${s.title}` }, icon('scan', 'size-4'), 'Scan')
        : icon('chevron', 'size-5 text-slate-300 dark:text-neutral-700'));
  };

  const drawList = () => {
    const a = latest;
    if (!a) return;
    const today = a.today;
    const alerts = [
      a.unpairedTotal ? el('p', { class: 'alert alert-warn mt-4 flex items-center gap-2' }, icon('alert', 'size-4'),
        `${a.unpairedTotal} volunteer${a.unpairedTotal === 1 ? ' is' : 's are'} coming without a trainee yet. Open the session to pair them.`) : null,
      a.reviewCount ? el('a', { href: '#/admin/review', class: 'alert alert-info mt-3 flex items-center gap-2' }, icon('inbox', 'size-4'),
        el('span', { class: 'flex-1' }, `${a.reviewCount} volunteer note${a.reviewCount === 1 ? '' : 's'} about trainees to review`), icon('chevron', 'size-4')) : null,
    ];
    if (query.trim()) {
      const shown = fuzzyFilter(a.sessions, query, (s) => [s.title, s.type, s.venue, s.project, s.notes, fmtDay(s.date, today), s.date]);
      mount(host, alerts,
        el('h2', { class: 'group-label' }, `${shown.length} match${shown.length === 1 ? '' : 'es'}`),
        shown.length ? list(shown.map((s) => row(s, today))) : el('p', { class: 'text-sm muted' }, 'No session matches that search.'));
      return;
    }
    const todays = a.sessions.filter((s) => s.date === today);
    const upcoming = a.sessions.filter((s) => s.date > today);
    const past = a.sessions.filter((s) => s.date < today).reverse();
    mount(host, alerts,
      el('div', { class: 'grid gap-x-6 lg:grid-cols-2' },
        el('div', {},
          el('h2', { class: 'group-label' }, fmtDay(today, today)),
          todays.length ? list(todays.map((s) => row(s, today))) : el('p', { class: 'text-sm muted' }, 'No sessions today.')),
        el('div', {},
          el('h2', { class: 'group-label' }, 'Coming up'),
          upcoming.length ? list(upcoming.map((s) => row(s, today))) : el('p', { class: 'text-sm muted' }, 'Nothing scheduled. Add a session so volunteers can say they\'re coming.'))),
      past.length ? el('details', { class: 'mt-6' },
        el('summary', { class: 'group-label cursor-pointer' }, `Past week (${past.length})`),
        list(past.map((s) => row(s, today)))) : null);
  };

  mount(root,
    pageHead('Sessions & pairing', 'Who is coming, and who they are with.',
      el('a', { href: '#/admin/new-session', class: 'btn btn-primary btn-sm' }, icon('plus', 'size-4'), 'New session')),
    searchBox('Search sessions by title, type, venue, project or date', (q) => { query = q; drawList(); }),
    host);
  return withAdminHome(host, app, ctx, (a) => { latest = a; drawList(); });
}

/* ---------------- one session: pairing ---------------- */

/** Pop-up to choose every trainee a volunteer looks after (multi-pairing). */
function pickTrainees(d, b, onSave) {
  const attending = new Set(d.session.traineeIds || []);
  const options = d.trainees.map((t) => {
    const others = t.with.filter((n) => n !== b.volunteer.name);
    let hint = traineeHint(t);
    if (attending.has(t.id)) hint = ['Attending', hint].filter(Boolean).join(', ');
    if (others.length) hint = `Also with ${others.join(', ')}`;
    return { value: t.id, label: t.name, hint };
  });
  if (attending.size) options.sort((x, y) => Number(attending.has(y.value)) - Number(attending.has(x.value)));
  b.trainees.forEach((t) => { if (!options.some((o) => o.value === t.id)) options.unshift({ value: t.id, label: t.name, hint: 'Not on the active trainee list' }); });
  const regular = new Set((b.volunteer.regularTrainees || []));
  options.forEach((o) => { if (regular.has(o.label)) o.hint = ['Regular pair', o.hint].filter(Boolean).join(', '); });
  const pick = multiPick({ name: 'traineeIds', options, values: b.trainees.map((t) => t.id), placeholder: 'Search trainees' });
  const save = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Save');
  const form = el('form', { class: 'space-y-4', novalidate: true },
    el('p', { class: 'text-sm muted' }, `Tick every trainee ${b.volunteer.name.split(' ')[0]} looks after today.${d.allowShared ? ' A trainee can be with more than one volunteer.' : ''}`),
    pick.el,
    el('div', { class: 'flex justify-end gap-2' }, save));
  const dlg = modal(`Trainees for ${b.volunteer.name}`, form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(save, 'Saving…', async () => {
      await onSave(pick.values);
      dlg.close();
    });
  });
}

export function renderSession(root, app, ctx, sessionId) {
  const draw = (d) => {
    const s = d.session;
    const isToday = s.date === d.today;
    const attending = new Set(s.traineeIds || []);
    const traineeName = Object.fromEntries(d.trainees.map((t) => [t.id, t.name]));
    const apply = (res) => {
      app.cacheDetail(sessionId, res.detail);
      app.dropAdminHome();
      if (ctx.alive()) draw(res.detail);
    };
    const save = async (b, ids) => {
      const res = await call('updateBooking', { bookingId: b.bookingId, traineeIds: ids });
      apply(res);
      toast(res.message);
    };

    const traineeChips = (b) => el('div', { class: 'mt-1 flex flex-wrap gap-1.5' }, b.trainees.map((t) => el('a', {
      href: `#/admin/trainee/${encodeURIComponent(t.id)}`, class: 'badge badge-emerald hover:underline',
    }, icon('heart', 'size-3.5'), t.name)));

    const row = (b) => {
      const v = b.volunteer;
      const a = b.attendance;
      const change = el('button', { class: `btn btn-sm ${b.trainees.length ? 'btn-secondary' : 'btn-primary'}` }, icon(b.trainees.length ? 'pencil' : 'plus', 'size-4'), b.trainees.length ? 'Change' : 'Pair');
      change.addEventListener('click', () => pickTrainees(d, b, (ids) => save(b, ids)));
      let remove = null;
      if (!a) {
        remove = el('button', { class: 'text-sm font-bold text-red-600 hover:underline dark:text-red-400' }, 'Remove');
        remove.addEventListener('click', () => {
          if (!confirm(`Remove ${v.name} from ${s.title}?`)) return;
          busy(remove, 'Removing…', async () => { const res = await call('updateBooking', { bookingId: b.bookingId, status: 'cancelled' }); apply(res); toast(res.message); });
        });
      }
      let clock = null;
      if (a && a.clockOut) clock = badge(`${clockTime(a.clockIn)}–${clockTime(a.clockOut)}, ${fmtHours(a.hours)}`, 'indigo', 'check');
      else if (a) clock = badge(`In at ${clockTime(a.clockIn)}`, 'emerald', 'clock');
      return el('div', { class: 'flex flex-col gap-2 p-4 sm:flex-row sm:items-center' },
        el('div', { class: 'min-w-0 flex-1' },
          el('div', { class: 'flex flex-wrap items-center gap-1.5' },
            holdName(v),
            typeBadge(v.type),
            b.walkIn ? badge('Walk-in', 'purple') : null,
            b.pairing === 'auto' && b.trainees.length ? badge('Auto-paired', 'slate', 'sparkle') : null,
            clock),
          b.trainees.length ? traineeChips(b) : el('p', { class: 'mt-1 text-sm font-bold text-amber-700 dark:text-amber-400' }, 'No trainee yet')),
        el('div', { class: 'flex items-center gap-3' }, change, remove));
    };

    const unpaired = d.coming.filter((b) => !b.trainees.length);
    const paired = d.coming.filter((b) => b.trainees.length);
    let pairRest = null;
    if (s.status !== 'cancelled' && unpaired.length) {
      pairRest = el('button', { class: 'btn btn-secondary btn-sm' }, icon('sparkle', 'size-4'), 'Pair the rest automatically');
      pairRest.addEventListener('click', () => busy(pairRest, 'Pairing…', async () => {
        const res = await call('pairUnpaired', { sessionId });
        apply(res);
        toast(res.message, res.detail.stats.unpaired ? 'warn' : 'ok');
      }));
    }

    // Edit the session (MINDS will look at this form again with the team in person).
    const parts = sessionFormFields(app, s, d);
    const edit = el('form', { class: 'space-y-4', novalidate: true },
      parts.type,
      field('title', 'Title', { value: s.title === s.type ? '' : s.title, optional: true, placeholder: `Leave blank to show "${s.type}"` }),
      field('date', 'Date', { type: 'date', value: s.date }),
      el('div', { class: 'grid grid-cols-2 gap-4' },
        field('startTime', 'Starts', { type: 'time', value: s.startTime }),
        field('endTime', 'Ends', { type: 'time', value: s.endTime })),
      parts.venue,
      parts.project,
      field('capacity', 'Volunteer slots', { type: 'number', min: 0, max: 500, value: s.capacity, hint: '0 means no limit.' }),
      field('notes', 'Notes for volunteers', { type: 'textarea', value: s.notes || '', optional: true }),
      parts.trainees,
      el('button', { type: 'submit', class: 'btn btn-primary w-full' }, 'Save changes'));
    edit.addEventListener('submit', (e) => {
      e.preventDefault();
      const payload = sessionPayload(edit);
      if (!payload) return;
      busy(edit.querySelector('button[type=submit]'), 'Saving…', async () => {
        const res = await call('updateSession', { sessionId, ...payload });
        apply(res);
        toast(res.message);
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
    const venueAddress = (d.venues.find((v) => v.name === s.venue) || {}).address || s.venueAddress;

    mount(root,
      backTo('#/admin/sessions', 'Sessions'),
      el('div', { class: 'flex flex-wrap items-start justify-between gap-3' },
        el('div', { class: 'min-w-0' },
          el('h1', { class: 'page-title leading-tight' }, s.title),
          el('p', { class: 'mt-1 font-bold text-indigo-600 dark:text-indigo-400' }, `${fmtDay(s.date, d.today)}, ${fmtTimes(s)}`),
          el('p', { class: 'flex items-center gap-1 text-sm muted' }, icon('pin', 'size-4'),
            s.venue ? el('a', { href: mapsLink(venueAddress || s.venue), target: '_blank', rel: 'noopener', class: 'hover:underline' }, s.venue) : 'No venue set'),
          el('div', { class: 'mt-1.5 flex flex-wrap gap-1' }, badge(s.type, s.type === 'Outing' ? 'purple' : 'indigo'), s.project ? badge(s.project, 'emerald') : null,
            s.status !== 'open' ? badge(s.status === 'closed' ? 'Sign-ups closed' : 'Cancelled', 'red') : null)),
        isToday && s.status !== 'cancelled' ? el('div', { class: 'flex flex-wrap gap-2' },
          el('a', { href: `#/admin/scan/${sessionId}`, class: 'btn btn-success btn-sm' }, icon('scan', 'size-4'), 'Scan passes'),
          el('a', { href: `#/admin/clock/${sessionId}`, class: 'btn btn-secondary btn-sm' }, icon('clock', 'size-4'), 'Clock in by hand')) : null),
      attending.size ? el('p', { class: 'mt-3 text-sm muted' },
        el('span', { class: 'font-bold text-slate-700 dark:text-neutral-200' }, 'Trainees attending: '),
        [...attending].map((id) => traineeName[id] || id).join(', ')) : null,
      el('p', { class: 'mt-3 text-sm muted' }, `${d.stats.coming} coming${s.capacity ? ` (of ${s.capacity} slots)` : ''}. Press and hold a name for contact details.`),

      el('div', { class: 'mt-2 flex flex-wrap items-center justify-between gap-2' },
        el('h2', { class: 'group-label' }, `Need a trainee (${unpaired.length})`), pairRest),
      unpaired.length ? list(unpaired.map(row)) : el('p', { class: 'alert alert-success' }, d.coming.length ? 'Everyone coming has a trainee.' : 'No one has said they\'re coming yet.'),
      paired.length ? [el('h2', { class: 'group-label' }, `Paired (${paired.length})`), list(paired.map(row))] : null,
      d.cancelled.length ? el('details', { class: 'mt-4' },
        el('summary', { class: 'group-label cursor-pointer' }, `Can't make it (${d.cancelled.length})`),
        el('ul', { class: 'space-y-1 text-sm muted' }, d.cancelled.map((c) => el('li', {}, c.name)))) : null,
      el('details', { class: 'card group mt-6 overflow-hidden lg:max-w-2xl' },
        el('summary', { class: 'section-head section-indigo cursor-pointer list-none select-none' },
          'Edit or close this session', icon('down', 'size-5 transition-transform duration-200 group-open:rotate-180')),
        el('div', { class: 'space-y-4 p-4' },
          edit,
          s.status === 'open' ? statusButton('Close sign-ups', 'closed', 'btn-secondary') : statusButton('Reopen sign-ups', 'open', 'btn-secondary'),
          s.status !== 'cancelled' ? statusButton('Cancel session', 'cancelled', 'btn-danger', `Cancel ${s.title}? It disappears from everyone's schedule.`) : null)));
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
      if (!cached) mount(root, backTo('#/admin/sessions', 'Sessions'), errorBlock(err, () => app.rerender()));
      else toast(err.message, 'error');
    });
}

/* ---------------- new session ---------------- */

/** Type, venue (with add-a-venue), project and trainees attending: shared by New and Edit session. */
function sessionFormFields(app, s, ref) {
  const types = ref.sessionTypes || ['Volunteer session', 'Outing'];
  const venue = venuePicker(app, ref.venues || [], s.venue);
  const project = projectPicker(ref.projects || [], s.project || '');
  const trainees = multiPick({
    name: 'traineeIds',
    options: (ref.trainees || []).map((t) => ({ value: t.id, label: t.name, hint: traineeHint(t) })),
    values: s.traineeIds || [],
    placeholder: 'Search trainees',
  });
  return {
    type: selectField('type', 'Type', types.map((t) => ({ value: t, label: t })), s.type || types[0],
      { hint: 'Overseas trips are planned under Admin → Overseas trips.' }),
    venue: labelled('Venue', venue.el, { hint: "Not in the list? Type the name and choose “Add a new venue”." }),
    project: labelled('Project', project.el, { optional: true }),
    trainees: labelled('Trainees attending', trainees.el, {
      optional: true,
      hint: 'Volunteers are paired with these trainees. Leave empty to pair from all active trainees.',
    }),
  };
}

/** Form values → createSession/updateSession payload. Returns null (and warns) if something is missing. */
function sessionPayload(form) {
  const f = formData(form);
  if (!f.venue) {
    toast('Choose a venue, or add a new one.', 'warn');
    return null;
  }
  return {
    type: f.type,
    title: f.title || '',
    date: f.date,
    startTime: f.startTime,
    endTime: f.endTime,
    venue: f.venue,
    project: f.project || '',
    capacity: f.capacity === '' || f.capacity === undefined ? 0 : Number(f.capacity),
    notes: f.notes || '',
    traineeIds: f.traineeIds ? f.traineeIds.split(',').filter(Boolean) : [],
  };
}

export function renderNewSession(root, app, ctx) {
  const draw = (home) => {
    const submit = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, 'Add session');
    const parts = sessionFormFields(app, { traineeIds: [] }, home);
    const form = el('form', { novalidate: true, class: 'space-y-6' },
      section('Session details', 'indigo',
        parts.type,
        field('title', 'Title', { optional: true, placeholder: 'Leave blank to show the type' }),
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
      busy(submit, 'Adding…', async () => {
        const res = await call('createSession', payload);
        app.saveAdminHome(res.home);
        toast(`${res.message} Everyone can see it in their schedule now.`);
        app.go(`#/admin/session/${res.session.sessionId}`);
      });
    });
    mount(root, backTo('#/admin/sessions', 'Sessions'), el('div', { class: 'max-w-2xl' }, el('h1', { class: 'page-title mb-6' }, 'New session'), form));
  };
  const home = app.cachedAdminHome();
  if (home && home.venues && home.sessionTypes) {
    draw(home);
    return Promise.resolve();
  }
  mount(root, loading());
  return app.fetchAdminHome().then((h) => { if (ctx.alive()) draw(h); })
    .catch((err) => { if (ctx.alive()) mount(root, backTo('#/admin/sessions', 'Sessions'), errorBlock(err, () => app.rerender())); });
}

/* ---------------- scan passes ---------------- */

// CSL Attendance convention: clock in = emerald, clock out = indigo.
const OUTCOME = {
  in: { title: 'Successful clock in!', icon: 'check', circle: 'bg-emerald-500', box: 'alert-success', vibrate: 80 },
  out: { title: 'Successful clock out!', icon: 'logout', circle: 'bg-indigo-600', box: 'alert-info', vibrate: [60, 50, 60] },
  'already-in': { title: 'Already clocked in', icon: 'clock', circle: 'bg-amber-500', box: 'alert-warn', vibrate: [30, 30, 30] },
  'already-out': { title: 'Already clocked out', icon: 'clock', circle: 'bg-amber-500', box: 'alert-warn', vibrate: [30, 30, 30] },
  'not-booked': { title: 'Not on today\'s list', icon: 'alert', circle: 'bg-amber-500', box: 'alert-warn', vibrate: [200] },
  queued: { title: 'Saved on this phone', icon: 'cloudOff', circle: 'bg-slate-700', box: 'alert-warn', vibrate: 80 },
  error: { title: "Couldn't clock in or out", icon: 'x', circle: 'bg-red-600', box: 'alert-error', vibrate: [200, 80, 200] },
};

const scanTabs = (active, sessionId) => tabs([
  { href: `#/admin/scan${sessionId ? `/${sessionId}` : ''}`, label: 'Scan QR passes', icon: 'scan', active: active === 'scan' },
  { href: `#/admin/clock${sessionId ? `/${sessionId}` : ''}`, label: 'Clock in by hand', icon: 'clock', active: active === 'clock' },
]);

function todaysSessions(app, ctx, onReady) {
  const today = todaySG();
  const pick = (h) => h.sessions.filter((s) => s.date === today && s.status !== 'cancelled');
  const home = app.cachedAdminHome();
  if (home && home.sessions) onReady(pick(home));
  app.fetchAdminHome().then((h) => { if (ctx.alive()) onReady(pick(h)); }).catch(() => {});
}

export function renderScan(root, app, ctx, presetSessionId) {
  let scanner = null;
  let sessionsToday = [];
  const select = el('select', { id: 'scan-session', class: 'input' });
  const fillSelect = () => {
    const current = select.value || presetSessionId;
    mount(select,
      el('option', { value: '' }, "Match to each volunteer's sign-up"),
      sessionsToday.map((s) => el('option', { value: s.sessionId, selected: s.sessionId === current }, `${s.title} (${fmtTimes(s)})`)));
  };
  fillSelect();
  todaysSessions(app, ctx, (list) => { sessionsToday = list; fillSelect(); });

  const reader = el('div', { id: 'reader', class: 'relative mt-4 aspect-[4/3] max-h-[42vh] w-full overflow-hidden rounded-2xl bg-slate-900 shadow-xl' });
  const result = el('div', { class: 'mt-4', 'aria-live': 'assertive' },
    el('div', { class: 'card flex items-center gap-3 p-4 text-sm muted' }, icon('scan', 'size-6 text-slate-300 dark:text-neutral-700'), "Point the camera at a volunteer's QR pass. The result shows here."));
  const queueLine = el('div', { class: 'mt-4' });
  const recentList = el('div', {});
  const startBtn = el('button', { class: 'btn btn-secondary mt-3 w-full', hidden: true }, icon('scan'), 'Start camera');

  const drawRecent = () => {
    const recent = app.recentScans();
    mount(recentList, recent.length ? [
      el('h2', { class: 'group-label' }, 'Scan logs on this device'),
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
          res && res.trainee ? el('p', { class: 'text-sm' }, `With ${res.trainee.name}`) : null,
          res && res.session ? el('p', { class: 'text-xs muted' }, `${res.session.title}, ${fmtTimes(res.session)}`) : null)),
      el('p', { class: `mt-2 ${outcome === 'out' ? 'text-base font-bold' : ''}` }, res && res.message ? res.message : extra || ''),
      outcome === 'not-booked' ? walkInButton() : null,
      res && res.session && !res.trainee && outcome === 'in' ? el('a', { href: `#/admin/session/${res.session.sessionId}`, class: 'btn btn-secondary btn-sm mt-3' }, 'Pair them now') : null));
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

  mount(root, el('div', { class: 'mx-auto max-w-2xl' },
    scanTabs('scan', presetSessionId),
    el('h1', { class: 'page-title' }, 'Scan passes'),
    el('p', { class: 'mt-1 text-sm muted' }, 'This page is only for scanning: the first scan clocks a volunteer in, the next clocks them out.'),
    el('label', { class: 'label mt-4', for: 'scan-session' }, 'Session'), select,
    result, reader, startBtn, queueLine, recentList));
  drawQueue();
  drawRecent();
  start();
}

/* ---------------- clock in by hand (separate from scanning) ---------------- */

export function renderClock(root, app, ctx, presetSessionId) {
  let sessionId = presetSessionId || '';
  let sessionsToday = [];
  const select = el('select', { id: 'clock-session', class: 'input' });
  const host = el('div', { class: 'mt-4' });
  let query = '';
  let detail = null;

  const drawPeople = () => {
    if (!detail) return;
    const shown = fuzzyFilter(detail.coming, query, (b) => [b.volunteer.name, ...b.trainees.map((t) => t.name)]);
    mount(host,
      el('div', { class: 'mb-3' }, searchBox('Find a volunteer', (q) => { query = q; drawPeople(); })),
      shown.length ? list(shown.map((b) => {
        const a = b.attendance;
        let action;
        if (a && a.clockOut) action = badge(`${clockTime(a.clockIn)}–${clockTime(a.clockOut)}`, 'indigo', 'check');
        else {
          action = el('button', { class: `btn btn-sm ${a ? 'btn-primary' : 'btn-success'}` }, icon(a ? 'logout' : 'clock', 'size-4'), a ? 'Clock out' : 'Clock in');
          action.addEventListener('click', () => busy(action, 'Saving…', async () => {
            const res = await call('manualClock', { bookingId: b.bookingId });
            detail = res.detail;
            app.dropAdminHome();
            toast(`${b.volunteer.name}: ${res.message}`);
            if (ctx.alive()) drawPeople();
          }));
        }
        return el('div', { class: 'flex items-center gap-3 p-4' },
          el('div', { class: 'min-w-0 flex-1' },
            el('p', { class: 'truncate font-bold text-slate-900 dark:text-white' }, b.volunteer.name),
            el('p', { class: 'truncate text-sm muted' }, a && !a.clockOut ? `In since ${clockTime(a.clockIn)}` : b.trainees.length ? `With ${b.trainees.map((t) => t.name).join(', ')}` : 'No trainee yet')),
          action);
      })) : el('p', { class: 'text-sm muted' }, detail.coming.length ? 'No one matches.' : 'No one has said they\'re coming to this session. Walk-ins: scan their pass and choose "Add as walk-in".'));
  };

  const load = () => {
    if (!sessionId) {
      mount(host, el('p', { class: 'text-sm muted' }, sessionsToday.length ? 'Choose the session.' : 'No sessions today.'));
      return;
    }
    mount(host, loading());
    call('sessionDetail', { sessionId }).then((d) => {
      detail = d;
      if (ctx.alive()) drawPeople();
    }).catch((err) => { if (ctx.alive()) mount(host, errorBlock(err, load)); });
  };
  const fill = () => {
    if (!sessionId && sessionsToday.length === 1) sessionId = sessionsToday[0].sessionId;
    mount(select, el('option', { value: '' }, 'Choose today\'s session'),
      sessionsToday.map((s) => el('option', { value: s.sessionId, selected: s.sessionId === sessionId }, `${s.title} (${fmtTimes(s)})`)));
  };
  select.addEventListener('change', () => { sessionId = select.value; load(); });
  let first = true;
  todaysSessions(app, ctx, (l) => {
    sessionsToday = l;
    fill();
    if (first) { first = false; load(); }
  });
  fill();
  mount(host, loading());

  mount(root, el('div', { class: 'mx-auto max-w-2xl' },
    scanTabs('clock', presetSessionId),
    el('h1', { class: 'page-title' }, 'Clock in by hand'),
    el('p', { class: 'mt-1 text-sm muted' }, 'For volunteers whose phone is flat or who forgot their pass. Only works on the day; fix past times in Attendance.'),
    el('label', { class: 'label mt-4', for: 'clock-session' }, 'Session'), select,
    host));
}
