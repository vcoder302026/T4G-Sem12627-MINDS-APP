// Section 3: Outings — which volunteer looks after which trainee, groups,
// buses, and ticking who has boarded on the day.

import { call } from '../../../js/api.js';
import { badge, el, fmtTimes, fuzzyFilter, labelled, mount, searchBox, todaySG, toast } from '../../../js/ui.js';
import {
  backTo, day, field, formModal, icon, load, pageHead, panel, row, selectField, stat, statGrid, table, toolbar,
  traineePicker, volunteerPicker,
} from '../kit.js';

const STATUS = { planned: ['Planned', 'indigo'], done: ['Done', 'emerald'], cancelled: ['Cancelled', 'red'] };
const statusBadge = (s) => badge(...(STATUS[s] || STATUS.planned));

function outingFields(o = {}) {
  return [
    field('title', 'Outing name', { value: o.title || '', required: true, placeholder: 'e.g. Zoo trip' }),
    row(field('date', 'Date', { type: 'date', value: o.date || '', required: true }), field('startTime', 'Start time', { type: 'time', value: o.startTime || '', optional: true })),
    field('location', 'Location', { value: o.location || '', required: true }),
    field('notes', 'Notes', { type: 'textarea', value: o.notes || '', rows: 2, optional: true }),
  ];
}

export function renderOutings(root, app, ctx) {
  const host = el('div', {});
  const create = () => formModal('New outing', outingFields(), 'Create outing', async (d) => {
    const res = await call('createOuting', d);
    toast(res.message);
    location.hash = `#/outing/${res.outing.outingId}`;
  });
  mount(root, pageHead('Outings', 'Plan outings, pair each trainee with a volunteer, and check everyone onto the bus.',
    el('button', { class: 'btn btn-primary', onclick: create }, icon('plus', 'size-4'), 'New outing')), host);
  return load(host, ctx, () => call('listOutings'), (d) => {
    const upcoming = d.outings.filter((o) => o.date >= d.today && o.status !== 'cancelled');
    const past = d.outings.filter((o) => !(o.date >= d.today && o.status !== 'cancelled')).reverse();
    const cols = [
      { label: 'Outing', cell: (o) => el('span', {}, el('span', { class: 'block font-bold' }, o.title), el('span', { class: 'block text-xs muted' }, o.location)) },
      { label: 'Date', cell: (o) => el('span', {}, el('span', { class: 'block' }, day(o.date)), el('span', { class: 'block text-xs muted' }, o.startTime)), class: 'whitespace-nowrap' },
      { label: 'Status', cell: (o) => statusBadge(o.status) },
      { label: 'Trainees', cell: (o) => String(o.assigned), class: 'text-right' },
      { label: 'Boarded', cell: (o) => `${o.boarded} / ${o.assigned}`, class: 'text-right' },
    ];
    const href = (o) => `#/outing/${o.outingId}`;
    mount(host,
      statGrid(stat('Upcoming outings', upcoming.length, { tone: 'indigo' }), stat('Past or cancelled', past.length)),
      el('div', { class: 'mt-6 space-y-6' },
        panel('Upcoming', null, table(cols, upcoming, { empty: 'No outings coming up.', href })),
        panel('Past and cancelled', null, table(cols, past, { empty: 'None yet.', href }))));
  });
}

export function renderOuting(root, app, ctx, outingId) {
  const host = el('div', {});
  const listHost = el('div', {});
  let data = null;
  let query = '';
  let groupFilter = '';
  const refresh = () => load(host, ctx, () => call('outingDetail', { outingId }), draw);
  const apply = (res) => { if (res.message) toast(res.message); draw(res); };

  const edit = () => formModal('Edit outing', [
    ...outingFields(data.outing),
    selectField('status', 'Status', Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k][0] })), data.outing.status),
  ], 'Save', async (d) => apply(await call('updateOuting', { outingId, ...d })));

  const assign = () => {
    const taken = new Set(data.assignments.map((a) => a.traineeId));
    const free = data.options.trainees.filter((t) => !taken.has(t.id));
    if (!free.length) { toast('Every active trainee is already assigned.', 'warn'); return; }
    formModal('Assign a trainee', [
      traineePicker(free),
      volunteerPicker(data.options.volunteers, { label: 'Looked after by' }),
      row(field('group', 'Group', { optional: true, placeholder: 'e.g. A' }), field('bus', 'Bus', { optional: true, placeholder: 'e.g. 1' })),
    ], 'Assign', async (d) => apply(await call('assignOutingTrainee', { outingId, ...d })));
  };

  const editRow = (a) => formModal(`Change ${a.traineeName}`, [
    volunteerPicker(data.options.volunteers, { label: 'Looked after by', value: a.userId }),
    row(field('group', 'Group', { value: a.group, optional: true }), field('bus', 'Bus', { value: a.bus, optional: true })),
  ], 'Save', async (d) => apply(await call('updateOutingAssignment', { assignmentId: a.assignmentId, ...d })));

  const boardBox = (a) => {
    const box = el('input', { type: 'checkbox', class: 'size-6 cursor-pointer accent-emerald-600', checked: a.boarded, 'aria-label': `${a.traineeName} boarded` });
    box.addEventListener('change', async () => {
      box.disabled = true;
      try {
        data = await call('updateOutingAssignment', { assignmentId: a.assignmentId, boarded: box.checked });
        drawCounts();
        drawList();
      } catch (err) {
        box.checked = !box.checked;
        toast(err.message, 'error');
      } finally {
        box.disabled = false;
      }
    });
    return box;
  };

  const countsHost = el('div', {});
  const drawCounts = () => {
    const c = data.counts;
    mount(countsHost, statGrid(
      stat('Trainees assigned', c.assigned, { tone: 'indigo' }),
      stat('Boarded', `${c.boarded} / ${c.assigned}`, { tone: c.assigned && c.boarded === c.assigned ? 'emerald' : 'amber' }),
      stat('Volunteers', new Set(data.assignments.map((a) => a.userId)).size)));
  };

  const drawList = () => {
    let rows = groupFilter ? data.assignments.filter((a) => `${a.group}|${a.bus}` === groupFilter) : data.assignments;
    rows = fuzzyFilter(rows, query, (a) => [a.traineeName, a.volunteerName, a.group, a.bus]);
    mount(listHost, table([
      { label: 'Boarded', cell: boardBox, class: 'w-20' },
      { label: 'Trainee', cell: (a) => el('a', { href: `#/trainee/${encodeURIComponent(a.traineeId)}`, class: 'link' }, a.traineeName) },
      { label: 'Looked after by', cell: (a) => a.volunteerName },
      { label: 'Group', cell: (a) => a.group },
      { label: 'Bus', cell: (a) => a.bus },
      { label: '', cell: (a) => el('button', { class: 'btn btn-secondary btn-sm', onclick: () => editRow(a) }, icon('pencil', 'size-4'), 'Change'), class: 'text-right' },
    ], rows, { empty: data.assignments.length ? 'No one matches.' : 'No trainees assigned yet.', rowClass: (a) => (a.boarded ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : '') }));
  };

  const draw = (d) => {
    data = d;
    const o = d.outing;
    const groups = [...new Set(d.assignments.map((a) => `${a.group}|${a.bus}`))].filter((g) => g !== '|');
    const groupSelect = el('select', { class: 'input py-2', 'aria-label': 'Group and bus' },
      el('option', { value: '' }, 'All groups'),
      groups.map((g) => {
        const [grp, bus] = g.split('|');
        return el('option', { value: g, selected: g === groupFilter }, [grp && `Group ${grp}`, bus && `Bus ${bus}`].filter(Boolean).join(', '));
      }));
    groupSelect.addEventListener('change', () => { groupFilter = groupSelect.value; drawList(); });
    const today = todaySG();
    mount(host,
      backTo('#/outings', 'Outings'),
      pageHead(o.title, `${day(o.date)}${o.startTime ? `, ${fmtTimes({ startTime: o.startTime })}` : ''} · ${o.location}`,
        statusBadge(o.status),
        el('button', { class: 'btn btn-secondary', onclick: edit }, icon('pencil', 'size-4'), 'Edit'),
        o.status !== 'cancelled' ? el('button', { class: 'btn btn-primary', onclick: assign }, icon('plus', 'size-4'), 'Assign a trainee') : null),
      o.notes ? el('p', { class: 'alert alert-info mb-4 whitespace-pre-line' }, o.notes) : null,
      o.date === today ? el('p', { class: 'alert alert-success mb-4' }, 'Outing is today: tick each trainee as they board.') : null,
      countsHost,
      el('div', { class: 'mt-6' }, panel('Trainees and volunteers', null,
        toolbar(groups.length ? labelled('Group', groupSelect) : null,
          el('div', { class: 'min-w-64 flex-1' }, labelled('Search', searchBox('Trainee, volunteer, group or bus', (q) => { query = q; drawList(); })))),
        listHost)));
    drawCounts();
    drawList();
  };

  mount(root, host);
  return refresh();
}
