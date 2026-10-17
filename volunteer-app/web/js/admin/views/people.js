// Admin: Volunteers and Trainees — the shared lists everyone uses.
// Volunteers: new or regular, deactivate/reactivate from the list (with the
// admin password), regular pairs, partner history and no-shows.
// Trainees: details, photo, what volunteers see, house-visit updates, notes,
// regular volunteers and everyone they have been with.

import { call } from '../../api.js';
import { chooseUpload, forgetFile, photo } from '../../media.js';
import { askPassword, badge, busy, el, fuzzyFilter, labelled, modal, mount, searchBox, toast, typeBadge } from '../../ui.js';
import {
  backTo, dateRangeText, day, field, formModal, hours, icon, load, pageHead, panel, plural, row, selectField, stat, statGrid, table,
  toolbar, volunteerPicker,
} from '../kit.js';

/* ---------------- volunteers ---------------- */

const PROFILE = [
  ['name', 'Full name', { required: true }],
  ['email', 'Email', { type: 'email', required: true }],
  ['phone', 'Phone', { type: 'tel', placeholder: '+65 9123 4567' }],
  ['birthday', 'Birthday', { type: 'date' }],
  ['telegram', 'Telegram', { placeholder: 'username, without @' }],
];

const TYPE_OPTIONS = (n) => [
  { value: 'auto', label: `Automatic (regular after ${n} sessions)` },
  { value: 'regular', label: 'Regular' },
  { value: 'new', label: 'New (stays new)' },
];

function profileFields(p = {}) {
  const f = ([key, label, attrs]) => field(key, label, { ...attrs, value: p[key] || '' });
  return [row(f(PROFILE[0]), f(PROFILE[1])), row(f(PROFILE[2]), f(PROFILE[3])), f(PROFILE[4])];
}

function showTempPassword(name, email, password) {
  modal('Temporary password', el('div', { class: 'space-y-4' },
    el('p', {}, `Give ${name} this temporary password. They sign in with ${email} and change it under Me.`),
    el('p', { class: 'well select-all p-4 text-center font-mono text-2xl font-bold tracking-wider' }, password),
    el('p', { class: 'text-xs muted' }, 'It is shown only once. If it gets lost, use Reset password on their page.')));
}

/** Deactivate / reactivate: needs the admin password typed again. */
async function setStatus(p, active, btn, after) {
  const pw = await askPassword(active ? `Reactivate ${p.name}` : `Deactivate ${p.name}`,
    active ? `${p.name} will be able to sign in again.` : `${p.name} is signed out and can't sign in until reactivated. Their hours and history stay in the sheet.`,
    active ? 'Reactivate' : 'Deactivate');
  if (!pw) return;
  busy(btn, 'Saving…', async () => {
    const res = await call('updatePerson', { userId: p.userId, status: active ? 'active' : 'inactive', adminPassword: pw });
    toast(res.message);
    after(res);
  });
}

function statusButton(p, after) {
  const active = p.status === 'inactive';
  const btn = el('button', { class: `btn btn-sm ${active ? 'btn-success' : 'btn-danger'}` }, active ? 'Reactivate' : 'Deactivate');
  btn.addEventListener('click', () => setStatus(p, active, btn, after));
  return btn;
}

export function renderVolunteers(root, app, ctx) {
  let people = null;
  let query = '';
  let show = 'active';
  let typeFilter = '';
  const host = el('div', {});
  const listHost = el('div', {});

  const addVolunteer = () => formModal('Add a volunteer', [
    ...profileFields(),
    selectField('volunteerType', 'New or regular', TYPE_OPTIONS(10), 'auto', { hint: 'Choose Regular for someone who volunteered with MINDS before the app.' }),
    el('label', { class: 'flex items-start gap-3 text-sm' },
      el('input', { type: 'checkbox', name: 'createLogin', value: 'yes', checked: true, class: 'mt-0.5 size-5 accent-indigo-600' }),
      el('span', {}, el('span', { class: 'block font-bold' }, 'Create a login now'),
        el('span', { class: 'block muted' }, 'You get a temporary password to give them. Untick to only add them to the list; they can register in the app later with this email.'))),
  ], 'Add volunteer', async (d) => {
    const payload = { ...d, createLogin: d.createLogin === 'yes' };
    Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k]; });
    const res = await call('createVolunteer', payload);
    toast(res.message);
    if (res.tempPassword) showTempPassword(res.person.name, res.person.email, res.tempPassword);
    refresh();
  }, { wide: true });

  const drawList = () => {
    if (!people) return;
    let rows = show === 'all' ? people : people.filter((p) => (show === 'inactive' ? p.status === 'inactive' : p.status !== 'inactive'));
    if (typeFilter) rows = rows.filter((p) => p.type === typeFilter);
    rows = fuzzyFilter(rows, query, (p) => [p.name, p.email, p.phone, p.telegram, p.type]);
    mount(listHost, table([
      { label: 'Name', cell: (p) => el('span', { class: 'font-bold' }, p.name) },
      { label: 'Type', cell: (p) => el('span', { class: 'flex flex-wrap gap-1' }, typeBadge(p.type), p.status === 'inactive' ? badge('Deactivated', 'red') : null, p.hasAccount ? null : badge('No login yet', 'amber')) },
      { label: 'Telegram', cell: (p) => (p.telegram ? el('a', { href: `https://t.me/${p.telegram}`, target: '_blank', rel: 'noopener', class: 'link' }, `@${p.telegram}`) : '') },
      { label: 'Phone', cell: (p) => p.phone, class: 'whitespace-nowrap' },
      { label: 'Sessions', cell: (p) => String(p.sessions), class: 'text-right' },
      { label: 'No-shows', cell: (p) => (p.noShows ? badge(String(p.noShows), 'red') : '0'), class: 'text-right' },
      { label: 'Hours', cell: (p) => hours(p.hours), class: 'text-right whitespace-nowrap' },
      { label: '', cell: (p) => (app.user && p.userId === app.user.userId ? el('span', { class: 'text-xs muted' }, 'You') : statusButton(p, () => refresh())), class: 'text-right' },
    ], rows, { empty: 'No one matches.', href: (p) => `#/admin/volunteer/${p.userId}`, rowClass: (p) => (p.status === 'inactive' ? 'opacity-70' : '') }));
  };

  const draw = (res) => {
    people = res.people;
    const active = people.filter((p) => p.status !== 'inactive');
    const select = (label, options, value, onChange) => {
      const s = el('select', { class: 'input py-2', 'aria-label': label }, options.map(([v, l]) => el('option', { value: v, selected: v === value }, l)));
      s.addEventListener('change', () => onChange(s.value));
      return labelled(label, s);
    };
    mount(host,
      statGrid(
        stat('Active volunteers', active.length, { tone: 'indigo' }),
        stat('Regular', active.filter((p) => p.type === 'regular').length, { tone: 'emerald' }),
        stat('New', active.filter((p) => p.type !== 'regular').length, { tone: 'indigo' }),
        stat('Without a login', active.filter((p) => !p.hasAccount).length, { tone: 'amber' }),
        stat('Not in Google Contacts', active.filter((p) => !p.contactSynced).length, { href: '#/admin/settings' }),
        stat('Deactivated', people.length - active.length)),
      el('div', { class: 'mt-6' }, panel('Volunteer list',
        el('button', { class: 'btn btn-primary btn-sm', onclick: addVolunteer }, icon('userPlus', 'size-4'), 'Add volunteer'),
        toolbar(
          select('Show', [['active', 'Active'], ['inactive', 'Deactivated'], ['all', 'Everyone']], show, (v) => { show = v; drawList(); }),
          select('Type', [['', 'New and regular'], ['regular', 'Regular'], ['new', 'New']], typeFilter, (v) => { typeFilter = v; drawList(); }),
          el('div', { class: 'min-w-56 flex-1' }, labelled('Search', searchBox('Name, email, phone or Telegram', (q) => { query = q; drawList(); })))),
        listHost)));
    drawList();
  };

  const refresh = () => load(host, ctx, () => call('listPeople'), draw);
  mount(root, pageHead('Volunteers', 'Everyone who volunteers, MINDS staff included. Deactivate someone from the list (needs the admin password).'), host);
  return refresh();
}

export function renderVolunteer(root, app, ctx, userId) {
  const host = el('div', {});
  const refresh = () => load(host, ctx, () => call('personDetail', { userId }), draw);

  const edit = (p) => formModal(`Edit ${p.name}`, profileFields(p), 'Save changes', async (d) => {
    // Send only what changed, so blank optional fields that were already blank aren't re-checked.
    const changes = {};
    PROFILE.forEach(([key]) => { if ((d[key] || '') !== (p[key] || '')) changes[key] = d[key]; });
    if (!Object.keys(changes).length) { toast('No changes to save.'); return; }
    const res = await call('updatePerson', { userId, ...changes });
    toast(res.message);
    refresh();
  }, { wide: true });

  const draw = (d) => {
    const p = d.person;
    const isMe = app.user && p.userId === app.user.userId;
    const typeSelect = el('select', { class: 'input py-2', 'aria-label': 'New or regular' },
      TYPE_OPTIONS(d.regularAfter).map((o) => el('option', { value: o.value, selected: o.value === p.typeSetting }, o.label)));
    typeSelect.addEventListener('change', async () => {
      typeSelect.disabled = true;
      try {
        const res = await call('updatePerson', { userId, volunteerType: typeSelect.value });
        toast(res.message);
        refresh();
      } catch (err) {
        toast(err.message, 'error');
        typeSelect.disabled = false;
      }
    });
    const resetBtn = el('button', { class: 'btn btn-secondary btn-sm' }, 'Reset password');
    resetBtn.addEventListener('click', () => {
      if (!window.confirm(`Make a new temporary password for ${p.name}? Their old password stops working.`)) return;
      busy(resetBtn, 'Resetting…', async () => {
        const res = await call('resetPassword', { userId });
        showTempPassword(p.name, p.email, res.tempPassword);
        refresh();
      });
    });
    const dl = (label, value) => el('div', { class: 'flex justify-between gap-4 py-2' }, el('dt', { class: 'muted' }, label), el('dd', { class: 'text-right font-bold' }, value || '—'));
    const partnerText = (x) => [
      x.regular ? 'Regular pair' : x.pastPair ? 'Past regular pair' : '',
      x.sessions ? plural(x.sessions, 'session') : '',
      x.visits ? plural(x.visits, 'house visit') : '',
      x.outings ? plural(x.outings, 'outing') : '',
      x.trips ? plural(x.trips, 'trip') : '',
    ].filter(Boolean).join(' · ');
    mount(host,
      backTo('#/admin/volunteers', 'Volunteers'),
      pageHead(p.name, p.email, typeBadge(p.type), p.status === 'inactive' ? badge('Deactivated', 'red') : null, p.hasAccount ? null : badge('No login yet', 'amber')),
      statGrid(
        stat('Hours', hours(d.stats.hours), { tone: 'indigo' }),
        stat('Sessions', d.stats.sessions, { tone: 'emerald', sub: p.type === 'regular' ? (p.regularSince ? `Regular since ${p.regularSince}` : 'Regular') : `${Math.max(0, d.regularAfter - d.stats.sessions)} more to become regular` }),
        stat('Coming up', d.stats.upcoming),
        stat('No-shows', d.stats.noShows, { tone: d.stats.noShows ? 'red' : 'slate', href: '#/admin/attendance' })),
      el('div', { class: 'mt-6 grid gap-6 lg:grid-cols-2' },
        el('div', { class: 'space-y-6' },
          panel('Details', el('button', { class: 'btn btn-secondary btn-sm', onclick: () => edit(p) }, icon('pencil', 'size-4'), 'Edit'),
            el('dl', { class: 'divide-y divide-slate-100 px-4 py-2 text-sm dark:divide-neutral-800' },
              dl('Telegram', p.telegram ? el('a', { href: `https://t.me/${p.telegram}`, target: '_blank', rel: 'noopener', class: 'link' }, `@${p.telegram}`) : ''),
              dl('Phone', p.phone), dl('Birthday', p.birthday), dl('Registered', p.createdAt),
              dl('Google Contacts', p.contactSynced ? 'Added' : p.contactError || 'Not yet'),
              p.updatedBy ? dl('Last edited', `${p.updatedAt} by ${p.updatedBy}`) : null)),
          panel('New or regular', null, el('div', { class: 'p-4' }, labelled('Volunteer type', typeSelect, {
            hint: `Regular volunteers are paired automatically and see more about trainees. Automatic: regular after ${d.regularAfter} completed sessions.`,
          }))),
          panel('Access', null, el('div', { class: 'flex flex-wrap gap-2 p-4' }, resetBtn, isMe ? null : statusButton(p, () => refresh())),
            isMe ? el('p', { class: 'px-4 pb-4 text-xs muted' }, 'Another admin has to deactivate your own account.') : null)),
        el('div', { class: 'space-y-6' },
          panel(`Regular trainees (${d.pairs.length})`, el('a', { href: '#/admin/pairs', class: 'link text-sm' }, 'Pairing list'),
            d.pairs.length ? el('div', { class: 'flex flex-wrap gap-1.5 p-4' }, d.pairs.map((x) => el('a', { href: `#/admin/trainee/${encodeURIComponent(x.traineeId)}`, class: 'badge badge-emerald py-1 text-sm hover:underline' }, x.traineeName)))
              : el('p', { class: 'p-4 text-sm muted' }, 'No regular trainee. Add one on the Pairing list.')),
          panel('Trainees they have been with', null, table([
            { label: 'Trainee', cell: (x) => (x.traineeId ? el('a', { href: `#/admin/trainee/${encodeURIComponent(x.traineeId)}`, class: 'link' }, x.name) : x.name) },
            { label: 'How', cell: partnerText },
            { label: 'Last', cell: (x) => (x.last ? day(x.last) : ''), class: 'whitespace-nowrap' },
          ], d.partners, { empty: 'Not paired with anyone yet.' })),
          panel('Recent sessions', el('a', { href: '#/admin/hours', class: 'link text-sm' }, 'Hours report'),
            table([
              { label: 'Date', cell: (r) => day(r.date), class: 'whitespace-nowrap' },
              { label: 'Session', cell: (r) => r.title },
              { label: 'Hours', cell: (r) => hours(r.hours), class: 'text-right' },
            ], d.recent, { empty: 'No completed sessions yet.' })),
          d.noShows.length ? panel(`No-shows (${d.stats.noShows})`, null, table([
            { label: 'Date', cell: (r) => day(r.date), class: 'whitespace-nowrap' },
            { label: 'Session', cell: (r) => r.sessionTitle },
          ], d.noShows)) : null)));
  };
  mount(root, host);
  return refresh();
}

/* ---------------- trainees ---------------- */

const GROUPS = [
  { title: 'About', keys: ['name', 'preferredName', 'gender', 'active'] },
  { title: 'For volunteers', keys: ['communication', 'behaviours', 'takeNote', 'interests', 'supportNeeds'] },
  { title: 'Health and family', keys: ['medicalNotes', 'dietaryNotes', 'caregiverName', 'caregiverPhone'] },
];
const LONG = ['communication', 'behaviours', 'takeNote', 'interests', 'supportNeeds', 'medicalNotes', 'dietaryNotes'];

const visibility = (c) => {
  if (!c) return '';
  if (c.visibleToNew && c.visibleToRegular) return 'All paired volunteers see this.';
  if (c.visibleToRegular) return 'Regular volunteers see this.';
  if (c.visibleToNew) return 'New volunteers see this (regulars don\'t).';
  return 'Admins only.';
};

function traineeForm(columns, t) {
  const col = (key) => columns.find((c) => c.key === key);
  const label = (key) => (col(key) || {}).label || key;
  const value = (key) => (t ? t.fields[key] || '' : '');
  const input = (key) => {
    if (key === 'active') {
      return selectField('active', 'Active', [{ value: 'Yes', label: 'Yes: can be paired' }, { value: 'No', label: 'No: left or on break' }], t && !t.active ? 'No' : 'Yes');
    }
    return field(key, label(key), {
      type: LONG.includes(key) ? 'textarea' : key === 'caregiverPhone' ? 'tel' : 'text',
      value: value(key),
      required: key === 'name',
      hint: key === 'name' ? undefined : visibility(col(key)),
      rows: 2,
    });
  };
  return GROUPS.map((g) => el('fieldset', { class: 'space-y-4' },
    el('legend', { class: 'group-label mt-0!' }, g.title),
    g.keys.length === 4 && !LONG.includes(g.keys[0]) ? [row(input(g.keys[0]), input(g.keys[1])), row(input(g.keys[2]), input(g.keys[3]))] : g.keys.map(input)));
}

/** Only fields that changed (all fields when adding). */
function traineePayload(d, t) {
  const out = {};
  Object.keys(d).forEach((k) => {
    const before = t ? (k === 'active' ? (t.active ? 'Yes' : 'No') : t.fields[k] || '') : '';
    if (!t ? d[k] !== '' : d[k] !== before) out[k] = d[k];
  });
  return out;
}

export function renderTrainees(root, app, ctx) {
  let data = null;
  let query = '';
  let show = 'active';
  const host = el('div', {});
  const listHost = el('div', {});

  const addTrainee = () => formModal('Add a trainee', traineeForm(data.columns, null), 'Add trainee', async (d) => {
    const res = await call('createTrainee', traineePayload(d, null));
    toast(res.message);
    location.hash = `#/admin/trainee/${encodeURIComponent(res.trainee.id)}`;
  }, { wide: true });

  const drawList = () => {
    if (!data) return;
    let rows = show === 'all' ? data.trainees : data.trainees.filter((t) => (show === 'inactive' ? !t.active : t.active));
    rows = fuzzyFilter(rows, query, (t) => [t.name, t.fields.preferredName, t.id, t.fields.caregiverName]);
    mount(listHost, table([
      { label: 'Name', cell: (t) => el('span', {}, el('span', { class: 'block font-bold' }, t.name), t.fields.preferredName ? el('span', { class: 'block text-xs muted' }, `Goes by ${t.fields.preferredName}`) : null) },
      { label: 'ID', cell: (t) => el('span', { class: 'font-mono text-xs' }, t.id) },
      { label: 'Gender', cell: (t) => t.fields.gender },
      { label: 'Communication', cell: (t) => t.fields.communication, class: 'max-w-xs' },
      { label: 'Caregiver', cell: (t) => [t.fields.caregiverName, t.fields.caregiverPhone].filter(Boolean).join(' · ') },
      { label: '', cell: (t) => (t.active ? '' : badge('Inactive', 'slate')) },
    ], rows, { empty: 'No trainee matches.', href: (t) => `#/admin/trainee/${encodeURIComponent(t.id)}` }));
  };

  const draw = (d) => {
    data = d;
    const missing = d.columns.filter((c) => !c.inSheet);
    const showSelect = el('select', { class: 'input py-2', 'aria-label': 'Show' },
      [['active', 'Active'], ['inactive', 'Inactive'], ['all', 'Everyone']].map(([v, l]) => el('option', { value: v, selected: v === show }, l)));
    showSelect.addEventListener('change', () => { show = showSelect.value; drawList(); });
    mount(host,
      statGrid(stat('Active trainees', d.trainees.filter((t) => t.active).length, { tone: 'purple' }), stat('Inactive', d.trainees.filter((t) => !t.active).length),
        stat('What volunteers see', 'Settings', { href: '#/admin/settings', sub: 'Choose fields for new and regular volunteers' })),
      missing.length ? el('p', { class: 'alert alert-info mt-4' },
        `The trainee sheet has no ${missing.map((c) => `"${c.label}"`).join(', ')} column yet. It is added automatically the first time you fill it in.`) : null,
      el('div', { class: 'mt-6' }, panel('Trainee list',
        el('button', { class: 'btn btn-primary btn-sm', onclick: addTrainee }, icon('plus', 'size-4'), 'Add trainee'),
        toolbar(labelled('Show', showSelect),
          el('div', { class: 'min-w-56 flex-1' }, labelled('Search', searchBox('Name, ID or caregiver', (q) => { query = q; drawList(); })))),
        listHost)));
    drawList();
  };

  mount(root, pageHead('Trainees', 'MINDS\'s trainee list in the Google Sheet. Rows are never deleted: mark someone inactive instead.'), host);
  return load(host, ctx, () => call('listTraineeRecords'), draw);
}

export function renderTrainee(root, app, ctx, traineeId) {
  const host = el('div', {});
  const refresh = () => load(host, ctx, () => call('traineeProfile', { traineeId }), draw);

  const draw = (d) => {
    const t = d.trainee;
    const col = (key) => d.columns.find((c) => c.key === key) || {};
    const edit = () => formModal(`Edit ${t.name}`, traineeForm(d.columns, t), 'Save changes', async (form) => {
      const changes = traineePayload(form, t);
      if (!Object.keys(changes).length) { toast('No changes to save.'); return; }
      const res = await call('updateTrainee', { traineeId: t.id, ...changes });
      toast(res.message);
      refresh();
    }, { wide: true });

    // photo
    const upload = el('button', { class: 'btn btn-secondary btn-sm' }, icon('upload', 'size-4'), d.photoFileId ? 'Replace photo' : 'Add photo');
    upload.addEventListener('click', async () => {
      let file;
      try {
        file = await chooseUpload('image/png,image/jpeg,image/webp,image/gif');
      } catch (err) {
        toast(err.message, 'error');
        return;
      }
      if (!file) return;
      busy(upload, 'Uploading…', async () => {
        const res = await call('uploadTraineePhoto', { traineeId: t.id, ...file });
        if (d.photoFileId) forgetFile(d.photoFileId);
        toast(res.message);
        refresh();
      });
    });
    let removePhoto = null;
    if (d.photoFileId) {
      removePhoto = el('button', { class: 'text-sm font-bold text-red-600 hover:underline dark:text-red-400' }, 'Remove photo');
      removePhoto.addEventListener('click', () => {
        if (!confirm(`Remove ${t.name}'s photo?`)) return;
        busy(removePhoto, '', async () => { const res = await call('removeTraineePhoto', { traineeId: t.id }); forgetFile(d.photoFileId); toast(res.message); refresh(); });
      });
    }

    // notes
    const noteForm = el('form', { class: 'flex flex-col gap-2 border-t border-slate-100 p-4 sm:flex-row dark:border-neutral-800' },
      el('textarea', { name: 'note', class: 'input min-h-[60px] flex-1', rows: 2, placeholder: 'Add a note future volunteers will read', 'aria-label': 'New note' }),
      el('button', { type: 'submit', class: 'btn btn-primary self-start' }, 'Add note'));
    noteForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const note = noteForm.note.value.trim();
      if (!note) return;
      busy(noteForm.querySelector('button'), 'Adding…', async () => {
        await call('addTraineeNote', { traineeId: t.id, note });
        toast('Note added.');
        refresh();
      });
    });
    const noteToggle = (n) => {
      const b = el('button', { class: 'btn btn-secondary btn-sm' }, n.status === 'hidden' ? 'Show to volunteers' : 'Hide from volunteers');
      b.addEventListener('click', () => busy(b, '', async () => {
        await call('setNoteStatus', { noteId: n.noteId, status: n.status === 'hidden' ? 'shared' : 'hidden' });
        refresh();
      }));
      return b;
    };

    // regular volunteers: add one here too
    const addPair = el('form', { class: 'grid items-end gap-2 border-t border-slate-100 p-4 sm:grid-cols-[1fr_auto] dark:border-neutral-800', novalidate: true });
    let pickerHost = el('div', {}, el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('plus', 'size-4'), 'Add a regular volunteer'));
    pickerHost.firstChild.addEventListener('click', async () => {
      const opts = await call('listPairs', {});
      const picker = volunteerPicker(opts.options.volunteers.filter((v) => !d.pairs.some((x) => x.userId === v.userId)), { label: 'Regular volunteer' });
      mount(addPair, picker, el('button', { type: 'submit', class: 'btn btn-primary' }, 'Add'));
      pickerHost.replaceWith(addPair);
      pickerHost = addPair;
    });
    addPair.addEventListener('submit', (e) => {
      e.preventDefault();
      const userId = addPair.querySelector('input[name=userId]').value;
      if (!userId) { toast('Choose a volunteer.', 'warn'); return; }
      busy(addPair.querySelector('button[type=submit]'), 'Adding…', async () => {
        const res = await call('addPair', { userId, traineeId: t.id });
        toast(res.message);
        refresh();
      });
    });

    const partnerText = (x) => [
      x.regular ? 'Regular pair' : x.pastPair ? 'Past regular pair' : '',
      x.sessions ? plural(x.sessions, 'session') : '',
      x.visits ? plural(x.visits, 'house visit') : '',
      x.outings ? plural(x.outings, 'outing') : '',
      x.trips ? plural(x.trips, 'trip') : '',
    ].filter(Boolean).join(' · ');

    const u = d.updates;
    mount(host,
      backTo('#/admin/trainees', 'Trainees'),
      el('div', { class: 'mb-6 flex flex-wrap items-center gap-4' },
        photo(d.photoFileId, t.name, 'size-20'),
        el('div', { class: 'min-w-0 flex-1' },
          el('h1', { class: 'page-title' }, t.name),
          el('p', { class: 'mt-1 muted' }, `${t.id}${t.fields.preferredName ? ` · goes by ${t.fields.preferredName}` : ''}`),
          el('div', { class: 'mt-2 flex flex-wrap items-center gap-2' },
            t.active ? badge('Active', 'emerald') : badge('Inactive', 'slate'), upload, removePhoto)),
        el('button', { class: 'btn btn-primary btn-sm', onclick: edit }, icon('pencil', 'size-4'), 'Edit details')),
      el('div', { class: 'grid gap-6 lg:grid-cols-2' },
        GROUPS.slice(1).map((g) => panel(g.title, null,
          el('dl', { class: 'divide-y divide-slate-100 text-sm dark:divide-neutral-800' },
            g.keys.map((k) => el('div', { class: 'grid gap-1 px-4 py-2.5 sm:grid-cols-3' },
              el('dt', { class: 'muted' }, col(k).label || k,
                el('span', { class: 'block text-[11px]' }, col(k).visibleToRegular || col(k).visibleToNew ? (col(k).visibleToNew ? 'Volunteers see' : 'Regulars see') : 'Admins only')),
              el('dd', { class: 'whitespace-pre-line font-medium sm:col-span-2' }, t.fields[k] || '—'))))))),
      el('div', { class: 'mt-6 grid gap-6 lg:grid-cols-2' },
        panel(`House-visit updates${u.count ? ` (${u.count})` : ''}`, u.linked ? el('a', { href: '#/admin/visits', class: 'link text-sm' }, 'All responses') : null,
          !u.linked ? el('p', { class: 'p-4 text-sm muted' }, u.error || 'Link the house-visit form responses in Settings → Databases to see them here.')
            : u.fields.length ? el('dl', { class: 'divide-y divide-slate-100 text-sm dark:divide-neutral-800' },
              el('p', { class: 'px-4 py-2 text-xs muted' }, `Newest answer to each question, from the last visit (${day(u.lastVisit)}) unless a date is shown.`),
              u.fields.map((f) => el('div', { class: 'grid gap-1 px-4 py-2.5 sm:grid-cols-3' },
                el('dt', { class: 'muted' }, f.label), el('dd', { class: 'whitespace-pre-line font-medium sm:col-span-2' }, f.value,
                  f.date && f.date !== u.lastVisit ? el('span', { class: 'ml-1 text-xs muted' }, `(${day(f.date)})`) : null))))
              : el('p', { class: 'p-4 text-sm muted' }, 'No responses for this trainee yet (matched by full name).')),
        el('div', { class: 'space-y-6' },
          panel(`Regular volunteers (${d.pairs.length})`, el('a', { href: '#/admin/pairs/trainees', class: 'link text-sm' }, 'Pairing list'),
            d.pairs.length ? el('div', { class: 'flex flex-wrap gap-1.5 p-4' }, d.pairs.map((x) => el('a', { href: `#/admin/volunteer/${x.userId}`, class: 'badge badge-emerald py-1 text-sm hover:underline' }, x.volunteerName)))
              : el('p', { class: 'p-4 text-sm muted' }, 'No regular volunteer yet.'),
            pickerHost),
          panel('Everyone they have been with', null, table([
            { label: 'Volunteer', cell: (x) => (x.userId ? el('a', { href: `#/admin/volunteer/${x.userId}`, class: 'link' }, x.name) : x.name) },
            { label: 'How', cell: partnerText },
            { label: 'Last', cell: (x) => (x.last ? day(x.last) : ''), class: 'whitespace-nowrap' },
          ], d.partners, { empty: 'Not paired with a volunteer yet.' })))),
      el('div', { class: 'mt-6 grid gap-6 lg:grid-cols-2' },
        panel(`Notes for volunteers (${d.notes.length})`, null,
          table([
            { label: 'Date', cell: (n) => day(n.date), class: 'whitespace-nowrap' },
            { label: 'Note', cell: (n) => el('span', {}, el('span', { class: 'block whitespace-pre-line' }, n.note), el('span', { class: 'block text-xs muted' }, `${n.author} · ${n.source}`)) },
            { label: '', cell: (n) => el('span', { class: 'flex flex-col items-end gap-1' }, n.status === 'hidden' ? badge('Hidden', 'slate') : null, noteToggle(n)), class: 'text-right' },
          ], d.notes, { empty: 'No notes yet.' }),
          noteForm),
        panel(`House visits recorded in the app (${d.visits.length})`, el('a', { href: '#/admin/visits', class: 'link text-sm' }, 'All visits'),
          table([
            { label: 'Date', cell: (v) => day(v.date), class: 'whitespace-nowrap' },
            { label: 'Visited by', cell: (v) => v.volunteerName },
            { label: 'Follow-up', cell: (v) => v.followUp, class: 'whitespace-pre-line' },
          ], d.visits, { empty: 'No house visits recorded in the app.' }))),
      el('div', { class: 'mt-6 grid gap-6 lg:grid-cols-2' },
        panel('Sessions (recent and coming up)', null, table([
          { label: 'Date', cell: (b) => day(b.date), class: 'whitespace-nowrap' },
          { label: 'Session', cell: (b) => b.sessionTitle },
          { label: 'Volunteer', cell: (b) => b.volunteerName },
        ], d.pairings, { empty: 'Not paired with a volunteer yet.' })),
        el('div', { class: 'space-y-6' },
          panel('Outings', null, table([
            { label: 'Outing', cell: (o) => o.title },
            { label: 'Date', cell: (o) => day(o.date), class: 'whitespace-nowrap' },
            { label: 'With', cell: (o) => o.volunteerName },
          ], d.outings, { empty: 'No outings.', href: (o) => `#/admin/outing/${o.outingId}` })),
          panel('Overseas trips', null, table([
            { label: 'Trip', cell: (x) => x.title },
            { label: 'Dates', cell: (x) => dateRangeText(x.startDate, x.endDate), class: 'whitespace-nowrap' },
            { label: 'Status', cell: (x) => x.status },
          ], d.trips, { empty: 'No trips.', href: (x) => `#/admin/trip/${x.tripId}` })))),
      el('p', { class: 'mt-4 text-xs muted' }, `${plural(d.notes.filter((n) => n.status !== 'hidden').length, 'note')} visible to paired volunteers.`));
  };
  mount(root, host);
  return refresh();
}

