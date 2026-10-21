// Pairing, in the style of the WERONE outing app's manual pairing page:
// volunteers (green) beside trainees (blue), a search box for each, an
// "Unpaired" count that filters the list, tap a card to pair, press and hold a
// volunteer for their contact details.
//
//   #/pairings            upcoming sessions that need pairing
//   #/pairings/regular    each regular volunteer's fixed trainee
//   #/pair/<sessionId>    who is with whom at one session
//
// Rules (Pairing.gs): a volunteer has one trainee; a trainee can have several
// volunteers, ideally at least one regular.

import { call } from '../api.js';
import {
  backLink, badge, el, errorBlock, fmtDay, fmtTimes, fuzzyFilter, loading, modal, mount, onLongPress, searchBox, toast, typeBadges,
} from '../ui.js';
import { icon } from '../../admin/js/kit.js';
import { showVolunteerContact } from './leader.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The two-column board. All data comes in `o`; it redraws itself when filters
 * change, and calls o.onPair / o.onUnpair (which return a promise) to save.
 *   o.volunteers: [{ key, userId, name, type, isAdmin, telegram, phone, traineeId, traineeName, tag, note }]
 *   o.trainees:   [{ id, name, preferredName, note, warn }]
 */
function pairBoard(o) {
  const state = { vq: '', tq: '', unpairedOnly: false, traineeFilter: 'all' };
  const host = el('div', {});
  const pairedTo = () => {
    const map = {};
    o.volunteers.forEach((v) => { if (v.traineeId) (map[v.traineeId] = map[v.traineeId] || []).push(v); });
    return map;
  };

  const pickTrainee = (v) => {
    let q = '';
    const listHost = el('div', { class: 'mt-3 space-y-1' });
    const byTrainee = pairedTo();
    const draw = () => {
      const shown = fuzzyFilter(o.trainees, q, (t) => [t.name, t.preferredName, t.id]);
      mount(listHost,
        v.traineeId ? el('button', { type: 'button', class: 'pick-row font-bold text-red-600 dark:text-red-400', onclick: () => save(null) }, icon('x', 'size-5'), `Unpair from ${v.traineeName}`) : null,
        shown.slice(0, 60).map((t) => {
          const others = (byTrainee[t.id] || []).filter((x) => x.key !== v.key);
          return el('button', { type: 'button', class: `pick-row ${t.id === v.traineeId ? 'select-ring' : ''}`, onclick: () => save(t) },
            el('span', { class: 'min-w-0 flex-1' },
              el('span', { class: 'pb-name' }, t.name),
              el('span', { class: 'pb-sub' }, [t.note, others.length ? `With ${others.map((x) => x.name).join(', ')}` : 'No one yet'].filter(Boolean).join(' · '))),
            t.id === v.traineeId ? icon('tick', 'size-5 text-indigo-600') : null);
        }),
        shown.length > 60 ? el('p', { class: 'px-3 text-xs muted' }, `Showing 60 of ${shown.length}. Search to narrow it down.`) : null,
        !shown.length ? el('p', { class: 'p-3 text-sm muted' }, 'No trainee matches.') : null);
    };
    const m = modal(`Pair ${v.name}`, [searchBox('Search trainees', (x) => { q = x; draw(); }, 'Search trainees'), listHost]);
    const save = (t) => {
      m.close();
      Promise.resolve(t ? o.onPair(v, t) : o.onUnpair(v)).catch((err) => toast(err.message, 'error'));
    };
    draw();
  };

  const pickVolunteer = (t) => {
    let q = '';
    const listHost = el('div', { class: 'mt-3 space-y-1' });
    const draw = () => {
      const pool = fuzzyFilter(o.volunteers, q, (v) => [v.name, v.traineeName]);
      const sorted = [...pool.filter((v) => !v.traineeId), ...pool.filter((v) => v.traineeId && v.traineeId !== t.id), ...pool.filter((v) => v.traineeId === t.id)];
      mount(listHost, sorted.map((v) => {
        const here = v.traineeId === t.id;
        return el('button', { type: 'button', class: `pick-row ${here ? 'select-ring' : ''}`, onclick: () => save(v, here) },
          el('span', { class: 'min-w-0 flex-1' },
            el('span', { class: 'pb-name' }, v.name),
            el('span', { class: 'pb-sub' }, here ? 'Paired here: tap to unpair' : v.traineeId ? `Now with ${v.traineeName}: tap to move here` : 'Unpaired')),
          el('span', { class: 'flex shrink-0 flex-wrap gap-1' }, typeBadges(v)));
      }), !sorted.length ? el('p', { class: 'p-3 text-sm muted' }, o.emptyVolunteers || 'No volunteers.') : null);
    };
    const m = modal(`Who is with ${t.name}?`, [searchBox(`Search ${o.volunteerLabel.toLowerCase()}`, (x) => { q = x; draw(); }, 'Search'), listHost]);
    const save = (v, here) => {
      m.close();
      Promise.resolve(here ? o.onUnpair(v) : o.onPair(v, t)).catch((err) => toast(err.message, 'error'));
    };
    draw();
  };

  const draw = () => {
    const byTrainee = pairedTo();
    const unpaired = o.volunteers.filter((v) => !v.traineeId);
    let vols = fuzzyFilter(o.volunteers, state.vq, (v) => [v.name, v.traineeName]);
    if (state.unpairedOnly) vols = vols.filter((v) => !v.traineeId);
    let trainees = fuzzyFilter(o.trainees, state.tq, (t) => [t.name, t.preferredName, t.id, (byTrainee[t.id] || []).map((v) => v.name).join(' ')]);
    if (state.traineeFilter === 'warn') trainees = trainees.filter((t) => t.warn(byTrainee[t.id] || []));

    const volCard = (v) => {
      const card = el('button', { type: 'button', class: `pb-card ${v.traineeId ? '' : 'pb-warn'}`, 'aria-label': `${v.name}: ${v.traineeId ? `with ${v.traineeName}` : 'unpaired'}. Press and hold for contact details.` },
        el('span', { class: 'pb-name' }, v.name),
        el('span', { class: 'pb-chips' }, typeBadges(v)),
        el('span', { class: 'pb-sub' }, v.traineeId ? `→ ${v.traineeName}${v.tag === 'standing' ? ' (regular)' : ''}` : 'Unpaired'),
        v.note ? el('span', { class: 'pb-sub' }, v.note) : null);
      card.addEventListener('click', () => pickTrainee(v));
      return onLongPress(card, () => showVolunteerContact(v));
    };
    const traineeCard = (t) => {
      const withVols = byTrainee[t.id] || [];
      const warn = t.warn(withVols);
      const card = el('button', { type: 'button', class: `pb-card ${warn ? 'pb-warn' : ''}` },
        el('span', { class: 'pb-name' }, t.name),
        t.note ? el('span', { class: 'pb-sub' }, t.note) : null,
        withVols.length ? el('span', { class: 'pb-chips' }, withVols.map((v) => el('span', { class: `pb-chip ${v.type === 'regular' ? 'pb-reg' : ''}` }, v.name)))
          : el('span', { class: 'pb-sub' }, 'No one yet'));
      card.addEventListener('click', () => pickVolunteer(t));
      if (o.traineeHref) onLongPress(card, () => { location.hash = o.traineeHref(t); });
      return card;
    };
    const unpairedBtn = el('button', { type: 'button', class: `pb-unpaired ${unpaired.length ? 'pb-pulse' : ''}`, 'aria-pressed': String(state.unpairedOnly) },
      `${unpaired.length} unpaired`);
    unpairedBtn.addEventListener('click', () => { state.unpairedOnly = !state.unpairedOnly; draw(); });
    const traineeToggle = el('button', { type: 'button', class: 'pb-filter' }, state.traineeFilter === 'warn' ? o.warnLabel : 'All');
    traineeToggle.addEventListener('click', () => { state.traineeFilter = state.traineeFilter === 'warn' ? 'all' : 'warn'; draw(); });
    const volToggle = el('button', { type: 'button', class: 'pb-filter' }, state.unpairedOnly ? 'Unpaired' : 'All');
    volToggle.addEventListener('click', () => { state.unpairedOnly = !state.unpairedOnly; draw(); });

    mount(host,
      el('div', { class: 'mb-3 flex flex-wrap items-center gap-2' }, unpairedBtn,
        el('span', { class: 'text-xs muted' }, 'Tap a card to pair. Press and hold a volunteer for their Telegram.')),
      el('div', { class: 'pb' },
        el('section', { class: 'pb-col pb-vol', 'aria-label': o.volunteerLabel },
          el('div', { class: 'pb-head' }, `${o.volunteerLabel} (${o.volunteers.length})`, volToggle),
          el('div', { class: 'pb-list' }, vols.length ? vols.map(volCard) : el('p', { class: 'p-2 text-xs muted' }, state.vq || state.unpairedOnly ? 'No one matches.' : o.emptyVolunteers))),
        el('section', { class: 'pb-col pb-tr', 'aria-label': 'Trainees' },
          el('div', { class: 'pb-head' }, `Trainees (${o.trainees.length})`, traineeToggle),
          el('div', { class: 'pb-list' }, trainees.length ? trainees.map(traineeCard) : el('p', { class: 'p-2 text-xs muted' }, 'No trainee matches.')))));
  };

  const searches = el('div', { class: 'mb-3 grid grid-cols-2 gap-2' },
    searchBox(`Search ${o.volunteerLabel.toLowerCase()}`, (q) => { state.vq = q; draw(); }, `Search ${o.volunteerLabel.toLowerCase()}`),
    searchBox('Search trainees', (q) => { state.tq = q; draw(); }, 'Search trainees'));
  draw();
  return {
    el: el('div', {}, searches, host),
    update(next) { Object.assign(o, next); draw(); },
  };
}

/** A printable / screenshot-friendly list: Volunteer | Trainee (like the WERONE groupings export). */
function pairingList(rows, title) {
  return el('div', {},
    el('h2', { class: 'mb-2 text-lg font-extrabold' }, title),
    el('div', { class: 'card overflow-hidden' },
      el('table', { class: 'w-full text-left text-sm' },
        el('thead', { class: 'bg-slate-900 text-xs font-bold uppercase tracking-wider text-white dark:bg-neutral-800' },
          el('tr', {}, el('th', { class: 'px-4 py-2.5' }, 'Volunteer'), el('th', { class: 'px-4 py-2.5' }, 'Trainee'))),
        el('tbody', { class: 'divide-y divide-slate-100 dark:divide-neutral-800' },
          rows.map((r) => el('tr', {},
            el('td', { class: 'px-4 py-2.5 font-bold' }, r.volunteer, r.type === 'regular' ? el('span', { class: 'ml-1 text-xs font-medium text-purple-700 dark:text-purple-300' }, '(Regular)') : null),
            el('td', { class: 'px-4 py-2.5' }, r.trainee || el('span', { class: 'font-bold text-red-600' }, 'Unpaired'))))))));
}

/* ---------------- one session ---------------- */

export function renderSessionPairing(root, app, ctx, sessionId) {
  let board = null;
  let showAll = false;
  let showList = false;
  let latest = null;

  const options = (d) => {
    const s = d.session;
    const attending = new Set(s.traineeIds || []);
    const volunteers = d.bookings.filter((b) => b.status !== 'cancelled').map((b) => ({
      key: b.bookingId,
      bookingId: b.bookingId,
      ...b.volunteer,
      traineeId: b.trainee ? b.trainee.id : '',
      traineeName: b.trainee ? b.trainee.name : '',
      tag: b.pairing,
      note: b.volunteer.standingTraineeName && (!b.trainee || b.trainee.id !== b.volunteer.standingTraineeId)
        ? `Regular trainee: ${b.volunteer.standingTraineeName}` : '',
    }));
    const paired = new Set(volunteers.map((v) => v.traineeId).filter(Boolean));
    let trainees = d.trainees;
    if (attending.size && !showAll) trainees = trainees.filter((t) => attending.has(t.id) || paired.has(t.id));
    trainees = trainees.map((t) => ({
      ...t,
      note: [t.preferredName && t.preferredName !== t.name ? t.preferredName : '', attending.has(t.id) ? 'Attending' : ''].filter(Boolean).join(' · '),
      warn: (vols) => attending.has(t.id) && !vols.length,
    }));
    return {
      volunteers,
      trainees,
      volunteerLabel: 'Volunteers',
      warnLabel: 'Needs someone',
      emptyVolunteers: 'No one has said they\'re coming yet.',
      traineeHref: (t) => `#/trainee/${encodeURIComponent(t.id)}`,
      onPair: (v, t) => save({ bookingId: v.bookingId, traineeId: t.id }),
      onUnpair: (v) => save({ bookingId: v.bookingId, traineeId: '' }),
    };
  };

  const save = async (payload) => {
    const res = await call('updateBooking', payload);
    app.cacheDetail(sessionId, res.detail);
    app.dropAdminHome();
    toast(res.message);
    if (ctx.alive()) draw(res.detail);
  };

  const draw = (d) => {
    latest = d;
    const s = d.session;
    const o = options(d);
    const unpaired = o.volunteers.filter((v) => !v.traineeId).length;
    const allBtn = s.traineeIds && s.traineeIds.length
      ? el('button', { class: 'btn btn-secondary btn-sm', onclick: () => { showAll = !showAll; draw(latest); } }, showAll ? 'Only trainees attending' : 'Show all trainees') : null;
    const listBtn = el('button', { class: 'btn btn-secondary btn-sm', onclick: () => { showList = !showList; draw(latest); } }, icon('list', 'size-4'), showList ? 'Back to the board' : 'Pairing list');
    if (board && !showList) board.update(o);
    else board = pairBoard(o);
    mount(root,
      backLink(`#/session/${sessionId}`, s.title),
      el('div', { class: 'mb-4 flex flex-wrap items-end justify-between gap-3' },
        el('div', { class: 'min-w-0' },
          el('h1', { class: 'page-title leading-tight' }, `Pairing: ${s.title}`),
          el('p', { class: 'mt-1 text-sm muted' }, `${fmtDay(s.date, d.today)}, ${fmtTimes(s)} · ${plural(o.volunteers.length, 'volunteer')}, ${unpaired} unpaired`)),
        el('div', { class: 'flex flex-wrap gap-2' }, allBtn, listBtn)),
      showList
        ? pairingList(o.volunteers.map((v) => ({ volunteer: v.name, type: v.type, trainee: v.traineeName })), `${s.title}, ${fmtDay(s.date, d.today)}`)
        : board.el);
  };

  const cached = app.cachedDetail(sessionId);
  if (cached) draw(cached);
  else mount(root, loading());
  return call('sessionDetail', { sessionId }).then((d) => {
    app.cacheDetail(sessionId, d);
    if (ctx.alive()) draw(d);
  }).catch((err) => { if (ctx.alive() && !cached) mount(root, errorBlock(err, () => app.rerender())); });
}

/* ---------------- the Pairing menu: sessions, and regulars' fixed trainees ---------------- */

export function renderStandingPairings(root, app, ctx, tab) {
  const regular = tab === 'regular';
  const seg = el('div', { class: 'seg mb-4', role: 'tablist' },
    el('a', { href: '#/pairings', class: 'seg-item', role: 'tab', 'aria-current': regular ? null : 'page' }, icon('calendar', 'size-4'), 'Sessions'),
    el('a', { href: '#/pairings/regular', class: 'seg-item', role: 'tab', 'aria-current': regular ? 'page' : null }, icon('heart', 'size-4'), 'Regular pairings'));
  const host = el('div', {});
  mount(root,
    el('h1', { class: 'page-title mb-1' }, 'Pairing'),
    el('p', { class: 'mb-4 text-sm muted' }, regular
      ? 'Give each regular volunteer a fixed trainee. They are paired with that trainee every time they say they\'re coming, until you change it here.'
      : 'Volunteers (new / ad hoc) are paired by an admin for each session. Regulars with a fixed trainee are paired automatically.'),
    seg, host);

  if (!regular) {
    const draw = (h) => {
      const upcoming = h.sessions.filter((s) => s.date >= h.today);
      mount(host, upcoming.length ? el('div', { class: 'card divide-y divide-slate-100 overflow-hidden dark:divide-neutral-900' }, upcoming.map((s) => el('a', { href: `#/pair/${s.sessionId}`, class: 'flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-neutral-900' },
        el('span', { class: 'min-w-0 flex-1' },
          el('span', { class: 'block text-sm font-bold text-indigo-600 dark:text-indigo-400' }, `${fmtDay(s.date, h.today)}, ${fmtTimes(s)}`),
          el('span', { class: 'block font-bold text-slate-900 dark:text-white' }, s.title),
          el('span', { class: 'mt-1 flex flex-wrap gap-1.5' }, badge(`${s.stats.booked} coming`, 'slate'),
            s.stats.unpaired ? badge(`${s.stats.unpaired} to pair`, 'amber') : badge('All paired', 'emerald', 'tick'))),
        icon('chevron', 'size-5 text-slate-300 dark:text-neutral-700')))) : el('p', { class: 'text-sm muted' }, 'No upcoming sessions.'));
    };
    const cached = app.cachedAdminHome();
    if (cached) draw(cached);
    else mount(host, loading());
    return app.fetchAdminHome().then((h) => { if (ctx.alive()) draw(h); })
      .catch((err) => { if (ctx.alive() && !cached) mount(host, errorBlock(err, () => app.rerender())); });
  }

  let board = null;
  const options = (d) => ({
    volunteers: d.regulars.map((r) => ({ key: r.userId, ...r, type: 'regular', tag: 'standing' })),
    trainees: d.trainees.map((t) => ({
      ...t,
      note: t.preferredName && t.preferredName !== t.name ? t.preferredName : '',
      warn: (vols) => !vols.length,
    })),
    volunteerLabel: 'Regulars',
    warnLabel: 'No regular',
    emptyVolunteers: 'No regular volunteers yet. Volunteers become regulars after 10 sessions, or promote them under Volunteers.',
    traineeHref: (t) => `#/trainee/${encodeURIComponent(t.id)}`,
    onPair: (v, t) => save({ userId: v.userId, traineeId: t.id }),
    onUnpair: (v) => save({ userId: v.userId, traineeId: '' }),
  });
  const save = async (payload) => {
    const res = await call('setStandingPairing', payload);
    toast(res.message);
    app.dropAdminHome();
    if (ctx.alive()) draw(res);
  };
  const draw = (d) => {
    const c = d.counts;
    if (board) board.update(options(d));
    else board = pairBoard(options(d));
    mount(host,
      el('div', { class: 'mb-3 flex flex-wrap gap-1.5' },
        badge(`${c.regulars} regular${c.regulars === 1 ? '' : 's'}`, 'emerald'),
        c.traineesWithoutRegular ? badge(`${c.traineesWithoutRegular} trainee${c.traineesWithoutRegular === 1 ? '' : 's'} without a regular`, 'amber', 'alert') : badge('Every trainee has a regular', 'emerald', 'tick')),
      board.el);
  };
  mount(host, loading());
  return call('listStandingPairings').then((d) => { if (ctx.alive()) draw(d); })
    .catch((err) => { if (ctx.alive()) mount(host, errorBlock(err, () => app.rerender())); });
}
