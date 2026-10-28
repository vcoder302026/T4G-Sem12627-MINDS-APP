// House visits: the visit history (add-only, newest first) and the House Visit
// Form, laid out like MINDS's own form: coloured sections, each question with
// its guide text, 1–5 scales, the date wheel, prefilled with the trainee's
// current answers. Server: gas/Visits.gs.

import { personName, traineeName } from '../../../js/quickview.js';
import { call } from '../../../js/api.js';
import { busy, el, fuzzyFilter, hvLabel, hvSections, labelled, loading, mount, searchBox, todaySG, toast } from '../../../js/ui.js';
import { day, icon, load, pageHead, panel, plural, stat, statGrid, toolbar } from '../kit.js';

// Visits saved before the House Visit Form (four boxes and a follow-up).
const OLD_AREAS = [['family', 'Family'], ['dailyLiving', 'Daily living'], ['social', 'Social'], ['health', 'Health'], ['followUp', 'Follow-up']];

function visitCard(v) {
  const old = OLD_AREAS.filter(([k]) => v[k]);
  return el('article', { class: 'card overflow-hidden' },
    el('header', { class: 'flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-neutral-800' },
      el('div', {},
        el('a', { href: `#/trainee/${encodeURIComponent(v.traineeId)}`, class: 'link text-base' }, traineeName(v.traineeName, v.traineeId)),
        el('p', { class: 'text-xs muted' }, v.volunteerName ? ['Visited by ', personName(v.volunteerName, v.userId), ' · '] : null, `Recorded by ${v.createdBy}`)),
      el('span', { class: 'badge badge-indigo' }, day(v.date))),
    v.sections && v.sections.length ? el('div', { class: 'px-3 pb-3' }, hvSections(v.sections, { open: false }))
      : old.length ? el('dl', { class: 'grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2' }, old.map(([k, label]) => el('div', {},
        el('dt', { class: 'text-xs font-bold uppercase tracking-wider muted' }, label),
        el('dd', { class: 'mt-0.5 whitespace-pre-line' }, v[k])))) : null);
}

export function renderVisits(root, app, ctx) {
  const host = el('div', {});
  const listHost = el('div', { class: 'space-y-4 p-4' });
  let data = null;
  let query = '';
  let traineeFilter = '';

  const words = (v) => (v.sections || []).flatMap((s) => s.fields.map((f) => f.value)).concat(OLD_AREAS.map(([k]) => v[k] || ''));
  const drawList = () => {
    let rows = traineeFilter ? data.visits.filter((v) => v.traineeId === traineeFilter) : data.visits;
    rows = fuzzyFilter(rows, query, (v) => [v.traineeName, v.volunteerName, v.createdBy].concat(words(v)));
    mount(listHost, rows.length ? rows.map(visitCard)
      : el('p', { class: 'py-8 text-center text-sm muted' }, data.visits.length ? 'No visits match.' : 'No house visits yet.'));
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
        stat('Visits', d.visits.length, { tone: 'indigo' }),
        stat('This month', d.visits.filter((v) => String(v.date).slice(0, 7) === month).length),
        stat('Trainees visited', traineeIds.length, { tone: 'purple' })),
      el('div', { class: 'mt-6' }, panel(`Visit history (${plural(d.visits.length, 'visit')})`,
        el('a', { href: '#/visit-new', class: 'btn btn-primary btn-sm' }, icon('plus', 'size-4'), 'New visit'),
        toolbar(labelled('Trainee', traineeSelect),
          el('div', { class: 'min-w-64 flex-1' }, labelled('Search', searchBox('Search visits', (q) => { query = q; drawList(); })))),
        listHost)));
    drawList();
  };

  mount(root, pageHead('House visits', ''), host);
  return load(host, ctx, () => call('listVisits', {}), draw);
}

/* ---------------- the House Visit Form ---------------- */

const TONES = ['blue', 'green', 'yellow', 'red', 'purple', 'indigo', 'pink'];

/** One question: label, guide text, and the right control for its type. */
function question(f, i) {
  const q = hvLabel(f.label);
  const id = `hv-${i}`;
  let control;
  if (f.type === 'likert') {
    control = el('div', { class: 'hv-likert' },
      el('div', { class: 'hv-likert-ends' }, el('span', {}, f.likert.left), el('span', {}, f.likert.right)),
      el('div', { class: 'hv-likert-row', role: 'radiogroup', 'aria-label': q.label },
        [1, 2, 3, 4, 5].map((n) => el('label', { class: 'hv-likert-opt' },
          el('input', { type: 'radio', name: id, value: String(n), class: 'sr-only', checked: f.value === String(n), 'data-key': f.key }),
          el('span', {}, String(n))))));
  } else if (f.type === 'project') {
    control = el('select', { id, class: 'input', 'data-key': f.key },
      el('option', { value: '' }, 'Select Project…'),
      (f.options || []).map((o) => el('option', { value: o, selected: o === f.value }, o)));
  } else if (f.type === 'date') {
    control = el('input', { id, type: 'date', class: 'input', value: f.value, max: /visit/i.test(f.label) ? todaySG() : null, 'data-key': f.key });
  } else if (f.type === 'textarea') {
    control = el('textarea', { id, class: 'input min-h-[100px]', rows: 3, maxlength: 5000, 'data-key': f.key });
    control.value = f.value || '';
  } else {
    control = el('input', { id, type: 'text', class: 'input', value: f.value, maxlength: 500, 'data-key': f.key });
  }
  return el('div', {},
    el(f.type === 'likert' ? 'p' : 'label', { class: 'block text-sm font-semibold text-slate-800 dark:text-neutral-200', for: f.type === 'likert' ? null : id }, q.label),
    q.guide ? el('p', { class: 'hv-q-guide' }, q.guide) : null,
    control);
}

/** Admin → House visits → New visit (#/visit-new, or #/visit-new/<trainee ID>). */
export function renderVisitForm(root, app, ctx, param) {
  const preset = param ? decodeURIComponent(param) : '';
  const formHost = el('div', {});
  const pickHost = el('div', { class: 'card p-4' });
  let current = null;

  const drawForm = (d) => {
    current = d;
    let n = 0;
    const update = el('input', { type: 'checkbox', checked: true, class: 'size-5 accent-indigo-600' });
    const submit = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, 'Submit');
    const form = el('form', { novalidate: true, class: 'space-y-6' },
      d.sections.map((s, i) => el('details', { class: 'card group overflow-hidden', open: true },
        el('summary', { class: `section-head section-${TONES[i % TONES.length]} cursor-pointer list-none select-none` }, s.title,
          icon('down', 'size-5 transition-transform duration-200 group-open:rotate-180')),
        el('div', { class: 'space-y-5 p-4' }, s.fields.map((f) => question(f, n++))))),
      // A new trainee is added to the trainee sheet with these answers; otherwise their details can be updated.
      d.trainee ? el('label', { class: 'flex items-center gap-3 text-sm font-bold' }, update, 'Also update the trainee\u2019s details') : null,
      el('div', { class: 'action-bar' }, el('div', { class: 'mx-auto max-w-2xl' }, submit)));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const answers = {};
      form.querySelectorAll('[data-key]').forEach((c) => {
        if (c.type === 'radio') { if (c.checked) answers[c.dataset.key] = c.value; else if (!(c.dataset.key in answers)) answers[c.dataset.key] = ''; return; }
        answers[c.dataset.key] = c.value.trim();
      });
      busy(submit, 'Submitting…', async () => {
        const res = await call('createVisit', d.trainee
          ? { traineeId: d.trainee.id, answers, updateTrainee: update.checked }
          : { newTrainee: true, answers }); // "Start New Blank Visit"
        toast(res.message);
        app.go('#/visits');
      });
    });
    mount(formHost, form);
  };

  const choose = (id) => {
    if (!id) { mount(formHost, null); return; }
    mount(formHost, loading());
    call('houseVisitForm', { traineeId: id }).then((d) => { if (ctx.alive()) drawForm(d); })
      .catch((err) => { if (ctx.alive()) { mount(formHost, null); toast(err.message, 'error'); } });
  };

  mount(root, el('h1', { class: 'page-title mb-4' }, 'New visit'), pickHost, el('div', { class: 'mt-6' }, formHost));
  mount(pickHost, loading());
  return call('listVisits', {}).then((d) => {
    if (!ctx.alive()) return;
    const select = el('select', { class: 'input', 'aria-label': 'Trainee' },
      el('option', { value: '' }, 'Search name…'),
      d.options.trainees.map((t) => el('option', { value: t.id, selected: t.id === preset }, `${t.name} (${t.id})`)));
    select.addEventListener('change', () => choose(select.value));
    // Like MINDS's House Visit app: find a trainee, or start a blank visit for a new one.
    const blank = el('button', { type: 'button', class: 'btn btn-success hv-blank' }, '+ Start New Blank Visit');
    blank.addEventListener('click', () => {
      select.value = '';
      mount(formHost, loading());
      call('houseVisitForm', {}).then((d) => { if (ctx.alive()) drawForm(d); })
        .catch((err) => { if (ctx.alive()) { mount(formHost, null); toast(err.message, 'error'); } });
    });
    mount(pickHost, el('h2', { class: 'mb-3 text-lg font-bold' }, 'Find Trainee'), select,
      el('div', { class: 'mt-4 flex justify-center' }, blank));
    if (preset) choose(preset);
  });
}
