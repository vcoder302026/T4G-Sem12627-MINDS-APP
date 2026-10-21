// Section 5: House visits — add-only visit history, newest first.

import { personName, traineeName } from '../../../js/quickview.js';
import { call } from '../../../js/api.js';
import { el, fuzzyFilter, labelled, mount, searchBox, todaySG, toast } from '../../../js/ui.js';
import { day, field, formModal, icon, load, pageHead, panel, plural, row, stat, statGrid, toolbar, traineePicker, volunteerPicker } from '../kit.js';

const AREAS = [
  ['family', 'Family', 'How the family is coping, changes at home'],
  ['dailyLiving', 'Daily living', 'Meals, hygiene, routines, independence'],
  ['social', 'Social', 'Friends, activities, community'],
  ['health', 'Health', 'Physical and mental health, medication'],
];

function visitCard(v) {
  return el('article', { class: 'card overflow-hidden' },
    el('header', { class: 'flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-neutral-800' },
      el('div', {},
        el('a', { href: `#/trainee/${encodeURIComponent(v.traineeId)}`, class: 'link text-base' }, traineeName(v.traineeName, v.traineeId)),
        el('p', { class: 'text-xs muted' }, 'Visited by ', personName(v.volunteerName, v.userId), ` · recorded by ${v.createdBy}`)),
      el('span', { class: 'badge badge-indigo' }, day(v.date))),
    el('dl', { class: 'grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2' },
      AREAS.filter(([k]) => v[k]).map(([k, label]) => el('div', {},
        el('dt', { class: 'text-xs font-bold uppercase tracking-wider muted' }, label),
        el('dd', { class: 'mt-0.5 whitespace-pre-line' }, v[k])))),
    v.followUp ? el('div', { class: 'border-t border-amber-100 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/30' },
      el('p', { class: 'text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300' }, 'Follow-up'),
      el('p', { class: 'mt-0.5 whitespace-pre-line' }, v.followUp)) : null);
}

export function renderVisits(root, app, ctx) {
  const host = el('div', {});
  const listHost = el('div', { class: 'space-y-4 p-4' });
  let data = null;
  let query = '';
  let traineeFilter = '';

  const record = () => formModal('Record a house visit', [
    row(traineePicker(data.options.trainees), volunteerPicker(data.options.volunteers, { label: 'Visited by' })),
    field('date', 'Visit date', { type: 'date', value: todaySG(), max: todaySG(), required: true }),
    el('p', { class: 'text-sm muted' }, 'Fill in at least one area. Visit records can\'t be changed afterwards.'),
    AREAS.map(([k, label, hint]) => field(k, label, { type: 'textarea', rows: 2, placeholder: hint, optional: true })),
    field('followUp', 'Follow-up', { type: 'textarea', rows: 2, optional: true, placeholder: 'What should happen next, and who does it' }),
  ], 'Save visit', async (d) => {
    const res = await call('createVisit', d);
    toast(res.message);
    draw(res);
  }, { wide: true });

  const drawList = () => {
    let rows = traineeFilter ? data.visits.filter((v) => v.traineeId === traineeFilter) : data.visits;
    rows = fuzzyFilter(rows, query, (v) => [v.traineeName, v.volunteerName, v.family, v.dailyLiving, v.social, v.health, v.followUp]);
    mount(listHost, rows.length ? rows.map(visitCard)
      : el('p', { class: 'py-8 text-center text-sm muted' }, data.visits.length ? 'No visits match.' : 'No house visits recorded yet.'));
  };

  const draw = (d) => {
    data = d;
    const month = todaySG().slice(0, 7);
    const traineeIds = [...new Set(d.visits.map((v) => v.traineeId))];
    const traineeSelect = el('select', { class: 'input py-2', 'aria-label': 'Trainee' },
      el('option', { value: '' }, 'All trainees'),
      traineeIds.map((id) => el('option', { value: id, selected: id === traineeFilter }, d.visits.find((v) => v.traineeId === id).traineeName)));
    traineeSelect.addEventListener('change', () => { traineeFilter = traineeSelect.value; drawList(); });
    mount(host,
      statGrid(
        stat('Visits recorded', d.visits.length, { tone: 'indigo' }),
        stat('This month', d.visits.filter((v) => v.date.slice(0, 7) === month).length),
        stat('Trainees visited', traineeIds.length, { tone: 'purple' }),
        stat('With follow-up', d.visits.filter((v) => v.followUp).length, { tone: 'amber' })),
      el('div', { class: 'mt-6' }, panel(`Visit history (${plural(d.visits.length, 'visit')}, newest first)`,
        el('button', { class: 'btn btn-primary btn-sm', onclick: record }, icon('plus', 'size-4'), 'Record a visit'),
        toolbar(labelled('Trainee', traineeSelect),
          el('div', { class: 'min-w-64 flex-1' }, labelled('Search', searchBox('Names or anything written in a visit', (q) => { query = q; drawList(); })))),
        listHost)));
    drawList();
  };

  mount(root, pageHead('House visits', 'Notes from visits to trainees\' homes. History is add-only, so it stays a true record.'), host);
  return load(host, ctx, () => call('listVisits', {}), draw);
}
