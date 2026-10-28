// Pairing, in the style of the WERONE outing app's manual pairing page:
// volunteers (green) beside trainees (blue), a search box for each, an
// All / Paired / Unpaired filter on each column and an "unpaired" count.
// Drag a card sideways onto a card in the other column to pair them (phones
// and computers), or tap a card (or its "+ Trn" / "+ Vol") for a pick list.
// Each card lists who it is paired with; the small ✕ on a name unpairs them.
// Press and hold a card (or a name on it) for their details.
//
//   #/pairings            upcoming sessions that need pairing
//   #/pairings/regular    each regular volunteer's fixed trainees
//   #/pairings/history    who has been with whom, and each regular's trainees over time
//   #/pair/<sessionId>    who is with whom at one session
//
// Rules (Pairing.gs): many to many. A volunteer can have several trainees, and
// a trainee several volunteers (ideally at least one regular).

import { call } from '../api.js';
import {
  backLink, badge, el, errorBlock, fmtDay, fmtTimes, fuzzyFilter, loading, modal, mount, searchBox, toast, traineeAvatar, typeBadges,
} from '../ui.js';
import { icon, panel, table } from '../../admin/js/kit.js';
import { asPerson, asTrainee, personName, traineeName } from '../quickview.js';
import { pairDrag } from '../dnd.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Together 3× · last Tue, 13 Oct", "Was their regular trainee …", or "New for them". */
function historyText(h) {
  if (!h) return 'New for them';
  const parts = [];
  if (h.regularNow) parts.push('Their regular trainee now');
  else if (h.regularFrom) parts.push(`Was their regular trainee ${fmtDay(h.regularFrom)} – ${h.regularTo ? fmtDay(h.regularTo) : 'now'}`);
  if (h.sessions) parts.push(`Together ${h.sessions}× · last ${fmtDay(h.last)}`);
  return parts.join(' · ') || 'New for them';
}
const historyOf = (o, userId, traineeId) => ((o.history || {})[userId] || {})[traineeId];
const historyLine = (o, userId, traineeId) => el('span', {
  class: `pb-sub ${historyOf(o, userId, traineeId) ? 'font-bold text-indigo-700 dark:text-indigo-300' : 'text-emerald-700 dark:text-emerald-400'}`,
}, historyText(historyOf(o, userId, traineeId)));

const FILTERS = [['all', 'All'], ['paired', 'Paired'], ['unpaired', 'Unpaired']];

/** All / Paired / Unpaired for one column. */
function filterSeg(value, label, onPick) {
  return el('span', { class: 'pb-seg', role: 'group', 'aria-label': `Show ${label}` }, FILTERS.map(([key, text]) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(value === key) }, text);
    b.addEventListener('click', () => onPick(key));
    return b;
  }));
}

/**
 * The two-column board. All data comes in `o`; it redraws itself when filters
 * change. Changes show straight away and are saved in the background:
 * o.save('add' | 'remove', volunteer, trainee) returns a promise of the server's
 * reply, and o.settled(reply) runs once nothing else is waiting, so a quick run
 * of drags doesn't flicker. A failed save shows why and reloads (o.reload).
 *   o.volunteers: [{ key, userId, name, type, isAdmin, trainees: [{ id, name }], tag, note }]
 *   o.trainees:   [{ id, name, preferredName, photoUrl, note, warn(vols) }]
 */
function pairBoard(o) {
  const state = { vq: '', tq: '', vf: 'all', tf: 'all', flash: null };
  let pending = 0;
  const host = el('div', {});
  const pairedTo = () => {
    const map = {};
    o.volunteers.forEach((v) => v.trainees.forEach((t) => { (map[t.id] = map[t.id] || []).push(v); }));
    return map;
  };
  const volByKey = (key) => o.volunteers.find((v) => String(v.key) === String(key));
  const traineeById = (id) => o.trainees.find((t) => t.id === id) || { id, name: id };
  const isPaired = (v, t) => v.trainees.some((x) => x.id === t.id);
  const redrawers = new Set(); // open pick lists redraw with the board

  const change = (op, vIn, t) => {
    const v = volByKey(vIn.key);
    if (!v) return;
    if (op === 'add' && isPaired(v, t)) { toast(`${v.name} is already paired with ${t.name}.`, 'warn'); return; }
    v.trainees = op === 'add' ? v.trainees.concat([{ id: t.id, name: t.name }]) : v.trainees.filter((x) => x.id !== t.id);
    state.flash = op === 'add' ? { key: v.key, id: t.id } : null;
    draw();
    pending += 1;
    Promise.resolve(o.save(op, v, t)).then((res) => {
      pending -= 1;
      if (res && res.message) toast(res.message);
      if (!pending && o.settled) o.settled(res);
    }).catch((err) => {
      pending -= 1;
      toast(err.message, 'error');
      if (o.reload) o.reload();
    });
  };

  const pill = (text, id, onRemove, isTrainee, extraCls = '') => {
    const x = el('button', { type: 'button', class: 'pb-x', 'aria-label': `Unpair ${text}` }, '✕');
    x.addEventListener('click', (e) => { e.stopPropagation(); onRemove(); });
    const label = isTrainee ? traineeName(text, id) : personName(text, id);
    return el('span', { class: `pb-pill ${extraCls}` }, label, x);
  };

  const pickTrainee = (vIn) => {
    let q = '';
    const listHost = el('div', { class: 'mt-3 space-y-1' });
    const draw2 = () => {
      const v = volByKey(vIn.key);
      if (!v) return;
      const byTrainee = pairedTo();
      let shown = fuzzyFilter(o.trainees, q, (t) => [t.name, t.preferredName, t.id]);
      if (o.newFirst && !q) {
        // Regular pairings: trainees this regular hasn't been with come first, to encourage variety.
        const seen = (t) => { const h = historyOf(o, v.userId, t.id); return h ? 1 + (h.sessions || 0) : 0; };
        shown = [...shown].sort((a, b) => seen(a) - seen(b));
      }
      if (!q) shown = [...shown.filter((t) => isPaired(v, t)), ...shown.filter((t) => !isPaired(v, t))]; // theirs first
      // Who they've been with, most recent first: so past trainees are visible even when "new first" pushes them down the list.
      const past = Object.keys((o.history || {})[v.userId] || {}).map((id) => ({ id, h: o.history[v.userId][id], t: o.trainees.find((x) => x.id === id) }))
        .filter((x) => x.t).sort((a, b) => String(b.h.regularFrom || b.h.last).localeCompare(String(a.h.regularFrom || a.h.last)));
      mount(listHost,
        v.trainees.length ? el('p', { class: 'px-1 pb-1 text-sm' }, el('span', { class: 'font-bold' }, 'Now with: '), v.trainees.map((t) => t.name).join(', ')) : null,
        past.length && !q ? el('div', { class: 'well mb-2 p-3 text-xs' },
          el('p', { class: 'font-bold uppercase tracking-wider muted' }, 'Been with before'),
          el('ul', { class: 'mt-1 space-y-0.5' }, past.slice(0, 6).map((x) => el('li', {}, el('span', { class: 'font-bold' }, x.t.name), ` · ${historyText(x.h)}`)))) : null,
        el('p', { class: 'px-1 pb-1 text-xs muted' }, `Tap to pair or unpair. ${v.name.split(' ')[0]} can have several trainees.${o.newFirst ? ' Trainees new for them are listed first.' : ''}`),
        shown.slice(0, 60).map((t) => {
          const here = isPaired(v, t);
          const others = (byTrainee[t.id] || []).filter((x) => x.key !== v.key);
          return asTrainee(el('button', { type: 'button', class: `pick-row ${here ? 'select-ring' : ''}`, onclick: () => change(here ? 'remove' : 'add', v, t) },
            traineeAvatar(t, 'sm'),
            el('span', { class: 'min-w-0 flex-1' },
              el('span', { class: 'pb-name' }, t.name),
              historyLine(o, v.userId, t.id),
              el('span', { class: 'pb-sub' }, [here ? 'Paired: tap to unpair' : '', t.note, others.length ? `With ${others.map((x) => x.name).join(', ')}` : 'No one yet'].filter(Boolean).join(' · '))),
            here ? icon('tick', 'size-5 text-emerald-600') : icon('plus', 'size-5 text-slate-400')), t.id);
        }),
        shown.length > 60 ? el('p', { class: 'px-3 text-xs muted' }, `Showing 60 of ${shown.length}. Search to narrow it down.`) : null,
        !shown.length ? el('p', { class: 'p-3 text-sm muted' }, 'No trainee matches.') : null);
    };
    const done = el('button', { type: 'button', class: 'btn btn-primary btn-sm mt-3 w-full' }, 'Done');
    const m = modal(`Pair ${vIn.name}`, [searchBox('Search trainees', (x) => { q = x; draw2(); }, 'Search trainees'), listHost, done], () => redrawers.delete(draw2));
    done.addEventListener('click', () => m.close());
    redrawers.add(draw2);
    draw2();
  };

  const pickVolunteer = (t) => {
    let q = '';
    const listHost = el('div', { class: 'mt-3 space-y-1' });
    const draw2 = () => {
      const pool = fuzzyFilter(o.volunteers, q, (v) => [v.name, v.trainees.map((x) => x.name).join(' ')]);
      const sorted = [...pool.filter((v) => isPaired(v, t)), ...pool.filter((v) => !v.trainees.length), ...pool.filter((v) => v.trainees.length && !isPaired(v, t))];
      mount(listHost,
        el('p', { class: 'px-1 pb-1 text-xs muted' }, `Tap to pair or unpair. ${t.name} can have several volunteers.`),
        sorted.map((v) => {
          const here = isPaired(v, t);
          return asPerson(el('button', { type: 'button', class: `pick-row ${here ? 'select-ring' : ''}`, onclick: () => change(here ? 'remove' : 'add', v, t) },
            el('span', { class: 'min-w-0 flex-1' },
              el('span', { class: 'pb-name' }, v.name),
              el('span', { class: 'pb-sub' }, here ? 'Paired here: tap to unpair' : v.trainees.length ? `Also with ${v.trainees.map((x) => x.name).join(', ')}` : 'Unpaired'),
              historyLine(o, v.userId, t.id)),
            el('span', { class: 'flex shrink-0 flex-wrap items-center gap-1' }, typeBadges(v), here ? icon('tick', 'size-5 text-emerald-600') : null)), v.userId);
        }), !sorted.length ? el('p', { class: 'p-3 text-sm muted' }, o.emptyVolunteers || 'No volunteers.') : null);
    };
    const done = el('button', { type: 'button', class: 'btn btn-primary btn-sm mt-3 w-full' }, 'Done');
    const m = modal(`Who is with ${t.name}?`, [searchBox(`Search ${o.volunteerLabel.toLowerCase()}`, (x) => { q = x; draw2(); }, 'Search'), listHost, done], () => redrawers.delete(draw2));
    done.addEventListener('click', () => m.close());
    redrawers.add(draw2);
    draw2();
  };

  const draw = () => {
    const byTrainee = pairedTo();
    const unpairedVols = o.volunteers.filter((v) => !v.trainees.length);
    const unpairedTrainees = o.trainees.filter((t) => !(byTrainee[t.id] || []).length);
    let vols = fuzzyFilter(o.volunteers, state.vq, (v) => [v.name, v.trainees.map((t) => t.name).join(' ')]);
    if (state.vf === 'paired') vols = vols.filter((v) => v.trainees.length);
    if (state.vf === 'unpaired') vols = vols.filter((v) => !v.trainees.length);
    let trainees = fuzzyFilter(o.trainees, state.tq, (t) => [t.name, t.preferredName, t.id, (byTrainee[t.id] || []).map((v) => v.name).join(' ')]);
    if (state.tf === 'paired') trainees = trainees.filter((t) => (byTrainee[t.id] || []).length);
    if (state.tf === 'unpaired') trainees = trainees.filter((t) => !(byTrainee[t.id] || []).length);
    const flashed = (key, id) => state.flash && ((key !== null && String(state.flash.key) === String(key)) || (id !== null && state.flash.id === id));

    const card = (role, key, paired, warn, flash, label, ...body) => {
      const c = el('div', {
        class: `pb-card ${paired ? 'pb-paired' : 'pb-unpaired-card'} ${warn ? 'pb-warn' : ''} ${flash ? 'pb-flash' : ''}`,
        role: 'button', tabindex: '0', 'aria-label': label, dataset: { dndRole: role, dndKey: key },
      }, ...body);
      return c;
    };
    const volCard = (v) => {
      const add = el('button', { type: 'button', class: 'pb-add', 'aria-label': `Add a trainee for ${v.name}` }, '+ Trn');
      add.addEventListener('click', (e) => { e.stopPropagation(); pickTrainee(v); });
      const c = card('vol', v.key, v.trainees.length > 0, false, flashed(v.key, null),
        `${v.name}: ${v.trainees.length ? `with ${v.trainees.map((t) => t.name).join(', ')}` : 'unpaired'}. Tap to pair, or drag onto a trainee.`,
        el('span', { class: 'pb-name' }, v.trainees.length ? icon('tick', 'pb-tick') : null, el('span', {}, v.name)),
        el('span', { class: 'pb-chips' }, typeBadges(v), v.tag === 'standing' && v.trainees.length ? badge('Regular pair', 'purple') : null),
        v.note ? el('span', { class: 'pb-sub' }, v.note) : null,
        // Who they're with (✕ unpairs), then "+ Trn" to add another.
        el('span', { class: 'pb-drop' },
          v.trainees.map((t) => pill(t.name, t.id, () => change('remove', v, traineeById(t.id)), true, flashed(null, t.id) && String(state.flash.key) === String(v.key) ? 'pb-pill-new' : '')),
          el('span', { class: 'pb-drop-foot' }, v.trainees.length ? null : el('span', { class: 'pb-hint' }, 'Drop a trainee here'), add)));
      c.addEventListener('click', () => pickTrainee(v));
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickTrainee(v); } });
      return asPerson(c, v.userId); // press and hold: Telegram and phone
    };
    const traineeCard = (t) => {
      const withVols = byTrainee[t.id] || [];
      const add = el('button', { type: 'button', class: 'pb-add', 'aria-label': `Add a volunteer for ${t.name}` }, '+ Vol');
      add.addEventListener('click', (e) => { e.stopPropagation(); pickVolunteer(t); });
      const c = card('tr', t.id, withVols.length > 0, t.warn(withVols), flashed(null, t.id),
        `${t.name}: ${withVols.length ? `with ${withVols.map((v) => v.name).join(', ')}` : 'no one yet'}. Tap to pair, or drag onto a volunteer.`,
        el('span', { class: 'pb-name' }, traineeAvatar(t, 'xs'), withVols.length ? icon('tick', 'pb-tick') : null, el('span', {}, t.name)),
        t.note ? el('span', { class: 'pb-sub' }, t.note) : null,
        el('span', { class: 'pb-drop' },
          withVols.map((v) => pill(v.name, v.userId, () => change('remove', v, t), false, v.type === 'regular' ? 'pb-pill-reg' : '')),
          el('span', { class: 'pb-drop-foot' }, withVols.length ? null : el('span', { class: 'pb-hint' }, 'Drop a volunteer here'), add)));
      c.addEventListener('click', () => pickVolunteer(t));
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickVolunteer(t); } });
      return asTrainee(c, t.id); // press and hold: photo and key details
    };
    const unpairedBtn = el('button', { type: 'button', class: `pb-unpaired ${unpairedVols.length ? 'pb-pulse' : 'pb-all-paired'}`, 'aria-pressed': String(state.vf === 'unpaired') },
      unpairedVols.length ? `${unpairedVols.length} unpaired` : ['✓ All paired']);
    unpairedBtn.addEventListener('click', () => { state.vf = state.vf === 'unpaired' ? 'all' : 'unpaired'; draw(); });
    const empty = (filter, query, text) => el('p', { class: 'p-2 text-xs muted' }, query || filter !== 'all' ? 'No one matches.' : text);

    mount(host,
      el('div', { class: 'mb-3 flex flex-wrap items-center gap-2' }, unpairedBtn,
        el('span', { class: 'pb-legend' }, el('span', { class: 'pb-dot pb-dot-paired' }), 'Paired'),
        el('span', { class: 'pb-legend' }, el('span', { class: 'pb-dot pb-dot-unpaired' }), 'Not yet'),
        el('span', { class: 'text-xs muted' }, 'Drag a card onto the other column, or tap it. ✕ unpairs. Press and hold for details.')),
      el('div', { class: 'pb' },
        el('section', { class: 'pb-col pb-vol', 'aria-label': o.volunteerLabel },
          el('div', { class: 'pb-head' }, el('span', {}, `${o.volunteerLabel} (${o.volunteers.length})`),
            filterSeg(state.vf, o.volunteerLabel.toLowerCase(), (k) => { state.vf = k; draw(); })),
          el('div', { class: 'pb-list' }, vols.length ? vols.map(volCard) : empty(state.vf, state.vq, o.emptyVolunteers))),
        el('section', { class: 'pb-col pb-tr', 'aria-label': 'Trainees' },
          el('div', { class: 'pb-head', title: `${unpairedTrainees.length} ${o.warnLabel.toLowerCase()}` }, el('span', {}, `Trainees (${o.trainees.length})`),
            filterSeg(state.tf, 'trainees', (k) => { state.tf = k; draw(); })),
          el('div', { class: 'pb-list' }, trainees.length ? trainees.map(traineeCard) : empty(state.tf, state.tq, 'No trainees.')))));
    redrawers.forEach((fn) => fn());
    if (state.flash) {
      const f = state.flash;
      setTimeout(() => { if (state.flash === f) { state.flash = null; host.querySelectorAll('.pb-flash, .pb-pill-new').forEach((n) => n.classList.remove('pb-flash', 'pb-pill-new')); } }, 1200);
    }
  };

  const searches = el('div', { class: 'mb-3 grid grid-cols-2 gap-2' },
    searchBox(`Search ${o.volunteerLabel.toLowerCase()}`, (q) => { state.vq = q; draw(); }, `Search ${o.volunteerLabel.toLowerCase()}`),
    searchBox('Search trainees', (q) => { state.tq = q; draw(); }, 'Search trainees'));
  const stopDrag = pairDrag(host, (from, to) => {
    const vKey = from.role === 'vol' ? from.key : to.key;
    const tId = from.role === 'tr' ? from.key : to.key;
    const v = volByKey(vKey);
    if (v) change('add', v, traineeById(tId));
  });
  draw();
  return {
    el: el('div', {}, searches, host),
    update(next) { if (!pending) { Object.assign(o, next); draw(); } },
    destroy: stopDrag,
  };
}

/** A printable / screenshot-friendly list: Volunteer | Trainees (like the WERONE groupings export). */
function pairingList(rows, title) {
  return el('div', {},
    el('h2', { class: 'mb-2 text-lg font-extrabold' }, title),
    el('div', { class: 'card overflow-hidden' },
      el('table', { class: 'w-full text-left text-sm' },
        el('thead', { class: 'bg-slate-900 text-xs font-bold uppercase tracking-wider text-white dark:bg-neutral-800' },
          el('tr', {}, el('th', { class: 'px-4 py-2.5' }, 'Volunteer'), el('th', { class: 'px-4 py-2.5' }, 'Trainee'))),
        el('tbody', { class: 'divide-y divide-slate-100 dark:divide-neutral-800' },
          rows.map((r) => el('tr', {},
            el('td', { class: 'px-4 py-2.5 font-bold' }, personName(r.volunteer, r.userId), r.type === 'regular' ? el('span', { class: 'ml-1 text-xs font-medium text-purple-700 dark:text-purple-300' }, '(Regular)') : null),
            el('td', { class: 'px-4 py-2.5' }, r.trainees.length
              ? r.trainees.map((t, i) => [i ? ', ' : '', traineeName(t.name, t.id)])
              : el('span', { class: 'font-bold text-red-600' }, 'Unpaired'))))))));
}

/* ---------------- one session ---------------- */

export function renderSessionPairing(root, app, ctx, sessionId) {
  let board = null;
  let showAll = false;
  let showList = false;
  let latest = null;
  ctx.onLeave(() => { if (board) board.destroy(); });

  const options = (d) => {
    const s = d.session;
    const attending = new Set(s.traineeIds || []);
    const volunteers = d.bookings.filter((b) => b.status !== 'cancelled').map((b) => {
      const fixed = b.volunteer.standingTrainees || [];
      const trainees = b.trainees || (b.trainee ? [b.trainee] : []);
      const missing = fixed.filter((f) => !trainees.some((t) => t.id === f.id));
      return {
        key: b.bookingId,
        bookingId: b.bookingId,
        ...b.volunteer,
        trainees: trainees.map((t) => ({ id: t.id, name: t.name })),
        tag: b.pairing,
        note: missing.length ? `Regular trainee${fixed.length > 1 ? 's' : ''}: ${fixed.map((f) => f.name).join(', ')}` : '',
      };
    });
    const paired = new Set(volunteers.flatMap((v) => v.trainees.map((t) => t.id)));
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
      history: d.history || {},
      volunteerLabel: 'Volunteers',
      warnLabel: 'Unpaired',
      emptyVolunteers: 'No one has said they\'re coming yet.',
      save: (op, v, t) => call('updateBooking', op === 'add' ? { bookingId: v.bookingId, addTraineeId: t.id } : { bookingId: v.bookingId, removeTraineeId: t.id })
        .then((res) => { app.cacheDetail(sessionId, res.detail); app.dropAdminHome(); return res; }),
      settled: (res) => { if (ctx.alive() && res && res.detail) draw(res.detail); },
      reload: () => load(),
    };
  };

  const draw = (d) => {
    latest = d;
    const s = d.session;
    const o = options(d);
    const unpaired = o.volunteers.filter((v) => !v.trainees.length).length;
    const allBtn = s.traineeIds && s.traineeIds.length
      ? el('button', { class: 'btn btn-secondary btn-sm', onclick: () => { showAll = !showAll; draw(latest); } }, showAll ? 'Only trainees attending' : 'Show all trainees') : null;
    const listBtn = el('button', { class: 'btn btn-secondary btn-sm', onclick: () => { showList = !showList; draw(latest); } }, icon('list', 'size-4'), showList ? 'Back to the board' : 'Pairing list');
    if (board && !showList) board.update(o);
    else { if (board) board.destroy(); board = pairBoard(o); }
    mount(root,
      backLink(`#/session/${sessionId}`, s.title),
      el('div', { class: 'mb-4 flex flex-wrap items-end justify-between gap-3' },
        el('div', { class: 'min-w-0' },
          el('h1', { class: 'page-title leading-tight' }, `Pairing: ${s.title}`),
          el('p', { class: 'mt-1 text-sm muted' }, `${fmtDay(s.date, d.today)}, ${fmtTimes(s)} · ${plural(o.volunteers.length, 'volunteer')}, ${unpaired} unpaired`)),
        el('div', { class: 'flex flex-wrap gap-2' }, allBtn, listBtn)),
      showList
        ? pairingList(o.volunteers.map((v) => ({ volunteer: v.name, userId: v.userId, type: v.type, trainees: v.trainees })), `${s.title}, ${fmtDay(s.date, d.today)}`)
        : board.el);
  };

  const load = () => call('sessionDetail', { sessionId }).then((d) => {
    app.cacheDetail(sessionId, d);
    if (ctx.alive()) draw(d);
  });
  const cached = app.cachedDetail(sessionId);
  if (cached) draw(cached);
  else mount(root, loading());
  return load().catch((err) => { if (ctx.alive() && !cached) mount(root, errorBlock(err, () => app.rerender())); });
}

/* ---------------- the Pairing menu: sessions, and regulars' fixed trainees ---------------- */

/* ---------------- history ---------------- */

function renderHistory(host, app, ctx) {
  let data = null;
  let query = '';
  const listHost = el('div', {});
  const draw = () => {
    if (!data) return;
    const match = (x) => [x.volunteerName, x.traineeName];
    const periods = fuzzyFilter(data.regularPeriods, query, match);
    const pairs = fuzzyFilter(data.pairs, query, match);
    mount(listHost,
      el('div', { class: 'mt-4' }, panel(`Regular pairing changes (${periods.length})`, null,
        el('p', { class: 'px-4 pt-3 text-xs muted' }, 'Each regular volunteer\'s fixed trainees over time, newest last. Change one under Regular pairings.'),
        table([
          { label: 'Regular', cell: (x) => personName(x.volunteerName, x.userId, 'font-bold') },
          { label: 'Trainee', cell: (x) => traineeName(x.traineeName, x.traineeId) },
          { label: 'From', cell: (x) => (x.from ? fmtDay(x.from) : ''), class: 'whitespace-nowrap' },
          { label: 'To', cell: (x) => (x.active ? badge('Now', 'emerald') : x.to ? fmtDay(x.to) : ''), class: 'whitespace-nowrap' },
          { label: 'Sessions together', cell: (x) => String(x.sessions), class: 'text-right' },
        ], periods, { empty: query ? 'No match.' : 'No regular pairings yet.' }))),
      el('div', { class: 'mt-6' }, panel(`Sessions together (${pairs.length} pairs)`, null,
        el('p', { class: 'px-4 pt-3 text-xs muted' }, 'Every volunteer and trainee who have been at a session together (clocked in), most recent first.'),
        table([
          { label: 'Volunteer', cell: (x) => el('span', { class: 'flex flex-wrap items-center gap-1' }, personName(x.volunteerName, x.userId, 'font-bold'),
            x.type === 'regular' ? badge('Regular', 'emerald') : null) },
          { label: 'Trainee', cell: (x) => el('span', { class: 'flex flex-wrap items-center gap-1' }, traineeName(x.traineeName, x.traineeId),
            x.regularNow ? badge('Regular pair', 'purple') : null) },
          { label: 'Sessions', cell: (x) => String(x.sessions), class: 'text-right' },
          { label: 'Last together', cell: (x) => fmtDay(x.last), class: 'whitespace-nowrap' },
          { label: 'First', cell: (x) => fmtDay(x.first), class: 'whitespace-nowrap' },
        ], pairs, { empty: query ? 'No match.' : 'No sessions together yet.' }))));
  };
  mount(host,
    searchBox('Search a volunteer or trainee', (q) => { query = q; draw(); }, 'Search pairing history'),
    listHost);
  mount(listHost, loading());
  return call('pairingHistory').then((d) => { data = d; if (ctx.alive()) draw(); })
    .catch((err) => { if (ctx.alive()) mount(listHost, errorBlock(err, () => app.rerender())); });
}

export function renderStandingPairings(root, app, ctx, tab) {
  const regular = tab === 'regular';
  const host = el('div', {});
  if (tab === 'history') {
    mount(root,
      el('h1', { class: 'page-title mb-1' }, 'Pairing history'),
      el('p', { class: 'mb-4 text-sm muted' }, 'Who has been with whom. Use it to pair someone familiar, or to give a regular a trainee they haven\'t been with yet.'),
      host);
    return renderHistory(host, app, ctx);
  }
  mount(root,
    el('h1', { class: 'page-title mb-1' }, 'Pairing'),
    el('p', { class: 'mb-4 text-sm muted' }, regular
      ? 'Give each regular volunteer one or more fixed trainees. They are paired with them every time they say they\'re coming, until you change it here.'
      : 'Volunteers (new / ad hoc) are paired by an admin for each session. Regulars with a fixed trainee are paired automatically.'),
    host);

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
  ctx.onLeave(() => { if (board) board.destroy(); });
  const options = (d) => ({
    volunteers: d.regulars.map((r) => ({ key: r.userId, ...r, type: 'regular', tag: 'standing', trainees: r.trainees || (r.traineeId ? [{ id: r.traineeId, name: r.traineeName }] : []) })),
    trainees: d.trainees.map((t) => ({
      ...t,
      note: t.preferredName && t.preferredName !== t.name ? t.preferredName : '',
      warn: (vols) => !vols.length,
    })),
    history: d.history || {},
    newFirst: true,
    volunteerLabel: 'Regulars',
    warnLabel: 'Without a regular',
    emptyVolunteers: 'No regular volunteers yet. Volunteers become regulars after 10 sessions, or promote them under Volunteers.',
    save: (op, v, t) => call('setStandingPairing', op === 'add' ? { userId: v.userId, addTraineeId: t.id } : { userId: v.userId, removeTraineeId: t.id })
      .then((res) => { app.dropAdminHome(); return res; }),
    settled: (res) => { if (ctx.alive() && res) draw(res); },
    reload: () => load(),
  });
  const draw = (d) => {
    const c = d.counts;
    if (board) board.update(options(d));
    else board = pairBoard(options(d));
    mount(host,
      el('div', { class: 'mb-3 flex flex-wrap gap-1.5' },
        badge(`${c.regulars} regular${c.regulars === 1 ? '' : 's'}`, 'emerald'),
        c.unpairedRegulars ? badge(`${c.unpairedRegulars} without a trainee`, 'red') : null,
        c.traineesWithoutRegular ? badge(`${c.traineesWithoutRegular} trainee${c.traineesWithoutRegular === 1 ? '' : 's'} without a regular`, 'amber', 'alert') : badge('Every trainee has a regular', 'emerald', 'tick')),
      board.el);
  };
  const load = () => call('listStandingPairings').then((d) => { if (ctx.alive()) draw(d); });
  mount(host, loading());
  return load().catch((err) => { if (ctx.alive()) mount(host, errorBlock(err, () => app.rerender())); });
}
