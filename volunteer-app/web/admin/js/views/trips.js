// Section 4: Overseas trips — participants (with a medical/dietary copy for
// the trip), the logistics checklist and expenses.

import { personName, traineeName } from '../../../js/quickview.js';
import { call } from '../../../js/api.js';
import { badge, el, mount, toast } from '../../../js/ui.js';
import {
  backTo, dateRangeText, day, field, formModal, icon, inlineSelect, load, money, pageHead, panel, plural, row, selectField, stat, statGrid,
  table, traineePicker, volunteerPicker,
} from '../kit.js';

const TRIP_STATUS = { planning: ['Planning', 'amber'], confirmed: ['Confirmed', 'indigo'], done: ['Done', 'emerald'], cancelled: ['Cancelled', 'red'] };
const tripBadge = (s) => badge(...(TRIP_STATUS[s] || TRIP_STATUS.planning));
const PARTICIPANT_STATUS = [{ value: 'registered', label: 'Registered' }, { value: 'confirmed', label: 'Confirmed' }, { value: 'withdrawn', label: 'Withdrawn' }];

function tripFields(t = {}) {
  return [
    field('title', 'Trip name', { value: t.title || '', required: true, placeholder: 'e.g. Bangkok cultural exchange' }),
    field('destination', 'Destination', { value: t.destination || '', required: true }),
    row(field('startDate', 'Start date', { type: 'date', value: t.startDate || '', required: true }),
      field('endDate', 'End date', { type: 'date', value: t.endDate || '', required: true })),
    field('notes', 'Notes', { type: 'textarea', value: t.notes || '', rows: 2, optional: true }),
  ];
}

export function renderTrips(root, app, ctx) {
  const host = el('div', {});
  const create = () => formModal('New overseas trip', tripFields(), 'Create trip', async (d) => {
    const res = await call('createTrip', d);
    toast(res.message);
    location.hash = `#/trip/${res.trip.tripId}`;
  });
  mount(root, pageHead('Overseas trips', '',
    el('button', { class: 'btn btn-primary', onclick: create }, icon('plus', 'size-4'), 'New trip')), host);
  return load(host, ctx, () => call('listTrips'), (d) => {
    const current = d.trips.filter((t) => t.endDate >= d.today && t.status !== 'cancelled');
    const past = d.trips.filter((t) => !(t.endDate >= d.today && t.status !== 'cancelled')).reverse();
    const cols = [
      { label: 'Trip', cell: (t) => el('span', {}, el('span', { class: 'block font-bold' }, t.title), el('span', { class: 'block text-xs muted' }, t.destination)) },
      { label: 'Dates', cell: (t) => dateRangeText(t.startDate, t.endDate), class: 'whitespace-nowrap' },
      { label: 'Status', cell: (t) => tripBadge(t.status) },
      { label: 'Going', cell: (t) => String(t.participants), class: 'text-right' },
      { label: 'Checklist', cell: (t) => `${t.logisticsDone} / ${t.logisticsTotal}`, class: 'text-right' },
      { label: 'Spent', cell: (t) => money(t.expensesCents), class: 'text-right whitespace-nowrap' },
    ];
    const href = (t) => `#/trip/${t.tripId}`;
    mount(host,
      statGrid(stat('Upcoming trips', current.length, { tone: 'indigo' }), stat('Past or cancelled', past.length)),
      el('div', { class: 'mt-6 space-y-6' },
        panel('Upcoming and in progress', null, table(cols, current, { empty: 'No trips planned.', href })),
        panel('Past and cancelled', null, table(cols, past, { empty: 'None yet.', href }))));
  });
}

export function renderTrip(root, app, ctx, tripId) {
  const host = el('div', {});
  let data = null;
  const refresh = () => load(host, ctx, () => call('tripDetail', { tripId }), draw);
  const apply = (res) => { if (res.message) toast(res.message); draw(res); };

  const edit = () => formModal('Edit trip', [
    ...tripFields(data.trip),
    selectField('status', 'Status', Object.keys(TRIP_STATUS).map((k) => ({ value: k, label: TRIP_STATUS[k][0] })), data.trip.status),
  ], 'Save', async (d) => apply(await call('updateTrip', { tripId, ...d })));

  const addParticipant = () => {
    const on = new Set(data.participants.map((x) => x.traineeId));
    const free = data.options.trainees.filter((t) => !on.has(t.id));
    if (!free.length) { toast('Every active trainee is already on this trip.', 'warn'); return; }
    formModal('Register a trainee', [
      null,
      traineePicker(free),
      volunteerPicker(data.options.volunteers, { label: 'Volunteer', optional: true }),
      field('notes', 'Notes for this trip', { type: 'textarea', rows: 2, optional: true }),
    ], 'Register', async (d) => apply(await call('addTripParticipant', { tripId, ...d })));
  };

  const editParticipant = (x) => formModal(`${x.traineeName}: trip details`, [
    volunteerPicker(data.options.volunteers, { label: 'Volunteer', value: x.userId, optional: true }),
    selectField('status', 'Status', PARTICIPANT_STATUS, x.status),
    field('medicalNotes', 'Medical notes for this trip', { type: 'textarea', rows: 2, value: x.medicalNotes, optional: true }),
    field('dietaryNotes', 'Dietary notes for this trip', { type: 'textarea', rows: 2, value: x.dietaryNotes, optional: true }),
    field('notes', 'Other notes', { type: 'textarea', rows: 2, value: x.notes, optional: true }),
  ], 'Save', async (d) => apply(await call('updateTripParticipant', { participantId: x.participantId, ...d })), { wide: true });

  const addItem = () => formModal('Add to the checklist', [
    field('description', 'What needs doing', { required: true, placeholder: 'e.g. Book flights' }),
    field('dueDate', 'Due date', { type: 'date', optional: true }),
  ], 'Add', async (d) => apply(await call('addTripLogistics', { tripId, ...d })));

  const addExpense = () => formModal('Record an expense', [
    field('description', 'Expense', { required: true, placeholder: 'e.g. Hotel deposit' }),
    row(field('amount', 'Amount (SGD)', { inputmode: 'decimal', placeholder: '250.00', required: true }), field('date', 'Date', { type: 'date', optional: true })),
    field('paidBy', 'Paid by', { optional: true }),
  ], 'Add expense', async (d) => apply(await call('addTripExpense', { tripId, ...d })));

  const tick = (i) => {
    const box = el('input', { type: 'checkbox', class: 'size-5 cursor-pointer accent-emerald-600', checked: i.status === 'done', 'aria-label': `${i.description} done` });
    box.addEventListener('change', async () => {
      box.disabled = true;
      try {
        draw(await call('updateTripLogistics', { itemId: i.itemId, status: box.checked ? 'done' : 'pending' }));
      } catch (err) {
        box.checked = !box.checked;
        box.disabled = false;
        toast(err.message, 'error');
      }
    });
    return box;
  };

  const draw = (d) => {
    data = d;
    const t = d.trip;
    const tot = d.totals;
    mount(host,
      backTo('#/trips', 'Overseas trips'),
      pageHead(t.title, `${t.destination} · ${dateRangeText(t.startDate, t.endDate)}`,
        tripBadge(t.status),
        el('button', { class: 'btn btn-secondary', onclick: edit }, icon('pencil', 'size-4'), 'Edit')),
      t.notes ? el('p', { class: 'alert alert-info mb-4 whitespace-pre-line' }, t.notes) : null,
      statGrid(
        stat('Going', tot.participants, { tone: 'indigo', sub: `${tot.confirmed} confirmed` }),
        stat('Without a volunteer', tot.unassigned, { tone: tot.unassigned ? 'amber' : 'slate' }),
        stat('Checklist', `${tot.logisticsDone} / ${tot.logisticsTotal}`, { tone: tot.logisticsTotal && tot.logisticsDone === tot.logisticsTotal ? 'emerald' : 'slate' }),
        stat('Spent so far', money(tot.expensesCents), { tone: 'purple' })),
      el('div', { class: 'mt-6' }, panel(`Participants (${plural(tot.participants, 'trainee')})`,
        t.status !== 'cancelled' ? el('button', { class: 'btn btn-primary btn-sm', onclick: addParticipant }, icon('plus', 'size-4'), 'Register a trainee') : null,
        table([
          { label: 'Trainee', cell: (x) => el('a', { href: `#/trainee/${encodeURIComponent(x.traineeId)}`, class: 'link' }, traineeName(x.traineeName, x.traineeId)) },
          { label: 'Status', cell: (x) => inlineSelect(PARTICIPANT_STATUS, x.status, async (v) => {
            try { apply(await call('updateTripParticipant', { participantId: x.participantId, status: v })); } catch (err) { toast(err.message, 'error'); throw err; }
          }, `Status of ${x.traineeName}`) },
          { label: 'Volunteer', cell: (x) => (x.volunteerName ? personName(x.volunteerName, x.userId) : badge('Not assigned', 'amber')) },
          { label: 'Medical (trip copy)', cell: (x) => x.medicalNotes, class: 'max-w-xs whitespace-pre-line' },
          { label: 'Dietary (trip copy)', cell: (x) => x.dietaryNotes, class: 'max-w-xs whitespace-pre-line' },
          { label: 'Notes', cell: (x) => x.notes, class: 'max-w-xs whitespace-pre-line' },
          { label: '', cell: (x) => el('button', { class: 'btn btn-secondary btn-sm', onclick: () => editParticipant(x) }, icon('pencil', 'size-4'), 'Edit'), class: 'text-right' },
        ], d.participants, { empty: 'No one registered yet.', rowClass: (x) => (x.status === 'withdrawn' ? 'opacity-50' : '') }))),
      el('div', { class: 'mt-6 grid gap-6 lg:grid-cols-2' },
        panel('Logistics checklist', el('button', { class: 'btn btn-secondary btn-sm', onclick: addItem }, icon('plus', 'size-4'), 'Add item'),
          table([
            { label: 'Done', cell: tick, class: 'w-16' },
            { label: 'Item', cell: (i) => el('span', {}, el('span', { class: i.status === 'done' ? 'block muted line-through' : 'block font-bold' }, i.description),
              i.doneBy ? el('span', { class: 'block text-xs muted' }, `Done by ${i.doneBy}, ${i.doneAt.slice(0, 10)}`) : null) },
            { label: 'Due', cell: (i) => (i.dueDate ? day(i.dueDate) : ''), class: 'whitespace-nowrap' },
          ], d.logistics, { empty: 'Nothing on the checklist yet.' })),
        panel('Expenses', el('button', { class: 'btn btn-secondary btn-sm', onclick: addExpense }, icon('plus', 'size-4'), 'Add expense'),
          table([
            { label: 'Expense', cell: (e) => el('span', {}, el('span', { class: 'block font-bold' }, e.description), e.paidBy ? el('span', { class: 'block text-xs muted' }, `Paid by ${e.paidBy}`) : null) },
            { label: 'Date', cell: (e) => (e.date ? day(e.date) : ''), class: 'whitespace-nowrap' },
            { label: 'Amount', cell: (e) => money(e.amountCents), class: 'text-right whitespace-nowrap' },
          ], d.expenses, { empty: 'No expenses recorded.' }),
          d.expenses.length ? el('p', { class: 'flex justify-between border-t border-slate-100 px-4 py-3 font-extrabold dark:border-neutral-800' }, el('span', {}, 'Total'), el('span', {}, money(tot.expensesCents))) : null)));
  };

  mount(root, host);
  return refresh();
}
