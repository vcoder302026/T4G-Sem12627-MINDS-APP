// Admin → Volunteers and Trainees.

import { personName, traineeName } from '../../../js/quickview.js';
import { audienceBadge, shareChooser } from '../../../js/views/trainees.js';
import { call } from '../../../js/api.js';
import {
  badge, busy, el, filePicker, fuzzyFilter, hvSections, labelled, majorActionPrompt, modal, mount, passwordPrompt, searchBox, toast, traineeAvatar, typeBadges,
} from '../../../js/ui.js';
import {
  backTo, dateRangeText, day, field, formModal, hours, icon, load, pageHead, panel, plural, row, selectField, stat, statGrid, table,
  toolbar,
} from '../kit.js';

/* ---------------- volunteers ---------------- */

const PROFILE = [
  ['name', 'Full name', { required: true }],
  ['email', 'Email', { type: 'email', required: true }],
  ['phone', 'Phone', { type: 'tel', inputmode: 'tel', placeholder: '+65 91234567', hint: '+65 followed by 8 digits.' }],
  ['birthday', 'Birthday', { type: 'date' }],
  ['telegram', 'Telegram', { placeholder: 'username, without @' }],
  // The registration form's emergency contact: relationship and number (no name).
  ['emergencyRelation', 'Relationship', { placeholder: 'e.g. Mother' }],
  ['emergencyPhone', 'Emergency Contact No.', { type: 'tel', inputmode: 'tel', placeholder: '+65 91234567', hint: '+65 followed by 8 digits.' }],
];

function profileFields(p = {}) {
  const f = ([key, label, attrs]) => field(key, label, { ...attrs, value: p[key] || '' });
  return [row(f(PROFILE[0]), f(PROFILE[1])), row(f(PROFILE[2]), f(PROFILE[3])), f(PROFILE[4]),
    el('p', { class: 'group-label mt-2!' }, 'Emergency contact'), row(f(PROFILE[5]), f(PROFILE[6]))];
}

function showTempPassword(name, email, password) {
  modal('Temporary password', el('div', { class: 'space-y-4' },
    el('p', {}, `${name} signs in with ${email}.`),
    el('p', { class: 'well select-all p-4 text-center font-mono text-2xl font-bold tracking-wider' }, password),
    el('p', { class: 'text-xs muted' }, 'Shown only once.')));
}

/**
 * Calls the server; if the change affects who is an admin (making, removing,
 * deactivating or reactivating an admin, or adding someone as an admin), the
 * server asks for the shared admin password: ask for it, then try again.
 */
async function withAdminPassword(action, payload) {
  try {
    return await call(action, payload);
  } catch (err) {
    if (err.code !== 'PASSWORD_REQUIRED') throw err;
    const pw = await passwordPrompt('Admin password needed', err.message);
    if (!pw) throw new Error('Not changed.');
    return call(action, { ...payload, adminPassword: pw });
  }
}

const updatePerson = (payload) => withAdminPassword('updatePerson', payload);

/* ---------------- warnings before major changes ---------------- */

/** Short warnings before major changes. */
const adminWarning = (name) => majorActionPrompt({ action: `making ${name} an admin`, confirmLabel: 'Continue', needsPassword: true });
const deactivateWarning = (p) => majorActionPrompt({ action: `deactivating ${p.name}`, confirmLabel: 'Continue', needsPassword: p.role === 'admin' });

export function renderVolunteers(root, app, ctx) {
  let people = null;
  let query = '';
  let show = 'active';
  let type = 'all';
  const host = el('div', {});
  const listHost = el('div', {});

  const addVolunteer = () => formModal('Add a volunteer', [
    ...profileFields(),
    selectField('role', 'Admin access', [{ value: 'volunteer', label: 'No' }, { value: 'admin', label: 'Yes: can use the Admin menu' }], 'volunteer'),
    el('label', { class: 'flex items-start gap-3 text-sm' },
      el('input', { type: 'checkbox', name: 'createLogin', value: 'yes', checked: true, class: 'mt-0.5 size-5 accent-indigo-600' }),
      el('span', { class: 'font-bold' }, 'Create a login now')),
  ], 'Add volunteer', async (d) => {
    const payload = { ...d, createLogin: d.createLogin === 'yes' };
    Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k]; });
    if (payload.role === 'admin') {
      const ok = await majorActionPrompt({ action: `adding ${payload.name || 'this person'} as an admin`, needsPassword: true });
      if (!ok) throw new Error('Not added: admin access needs your confirmation.');
      payload.adminPassword = ok.password;
    }
    const res = await withAdminPassword('createVolunteer', payload);
    toast(res.contact ? `${res.message} ${res.contact.status === 'saved' ? 'Saved to Google Contacts.' : `Not saved to Google Contacts: ${res.contact.message}`}` : res.message,
      res.contact && res.contact.status !== 'saved' ? 'warn' : 'ok');
    if (res.tempPassword) showTempPassword(res.person.name, res.person.email, res.tempPassword);
    refresh();
  }, { wide: true });

  const drawList = () => {
    if (!people) return;
    let rows = show === 'all' ? people : people.filter((p) => (show === 'inactive' ? p.status === 'inactive' : p.status !== 'inactive'));
    if (type !== 'all') rows = rows.filter((p) => (type === 'admin' ? p.role === 'admin' : p.volunteerType === type));
    rows = fuzzyFilter(rows, query, (p) => [p.name, p.email, p.phone, p.telegram, p.role === 'admin' ? 'admin' : '', p.volunteerType, p.regularTraineeName]);
    const statusButton = (p) => {
      const b = el('button', { class: p.status === 'inactive' ? 'btn btn-success btn-sm' : 'btn btn-danger btn-sm' }, p.status === 'inactive' ? 'Reactivate' : 'Deactivate');
      b.addEventListener('click', async () => {
        const ok = p.status === 'inactive'
          ? await majorActionPrompt({ action: `reactivating ${p.name}`, needsPassword: p.role === 'admin' })
          : await deactivateWarning(p);
        if (!ok) return;
        const adminPassword = ok.password || undefined;
        busy(b, '', async () => {
          const res = await updatePerson({ userId: p.userId, status: p.status === 'inactive' ? 'active' : 'inactive', adminPassword });
          toast(res.message);
          refresh();
        });
      });
      return b;
    };
    mount(listHost, table([
      { label: 'Name', cell: (p) => personName(p.name, p.userId, 'font-bold') },
      { label: 'Profile', cell: (p) => el('span', { class: 'flex flex-wrap gap-1' }, typeBadges(p), p.status === 'inactive' ? badge('Deactivated', 'red') : null, p.hasAccount ? null : badge('No login yet', 'amber')) },
      { label: 'Regular trainees', cell: (p) => (p.regularTrainees || []).map((t, i) => [i ? ', ' : '', traineeName(t.name, t.id)]) },
      { label: 'Phone', cell: (p) => p.phone, class: 'whitespace-nowrap' },
      { label: 'Sessions', cell: (p) => String(p.sessions), class: 'text-right' },
      { label: 'No-shows', cell: (p) => (p.noShows ? el('span', { class: 'font-bold text-red-600 dark:text-red-400' }, String(p.noShows)) : '0'), class: 'text-right' },
      { label: 'Hours', cell: (p) => hours(p.hours), class: 'text-right whitespace-nowrap' },
      { label: '', cell: (p) => statusButton(p), class: 'text-right' },
    ], rows, { empty: 'No one matches.', href: (p) => `#/volunteer/${p.userId}`, rowClass: (p) => (p.status === 'inactive' ? 'opacity-60' : '') }));
  };

  const draw = (res) => {
    people = res.people;
    const active = people.filter((p) => p.status !== 'inactive');
    const showSelect = el('select', { class: 'input py-2', 'aria-label': 'Show' },
      [['active', 'Active'], ['inactive', 'Deactivated'], ['all', 'Everyone']].map(([v, l]) => el('option', { value: v, selected: v === show }, l)));
    showSelect.addEventListener('change', () => { show = showSelect.value; drawList(); });
    const typeSelect = el('select', { class: 'input py-2', 'aria-label': 'Profile' },
      [['all', 'All profiles'], ['volunteer', 'Volunteers'], ['regular', 'Regulars'], ['admin', 'Admins']].map(([v, l]) => el('option', { value: v, selected: v === type }, l)));
    typeSelect.addEventListener('change', () => { type = typeSelect.value; drawList(); });
    mount(host,
      statGrid(
        stat('Volunteers', active.filter((p) => p.volunteerType !== 'regular').length, { tone: 'indigo', sub: `Become regulars after ${res.regularAfter || 10} sessions` }),
        stat('Regulars', active.filter((p) => p.volunteerType === 'regular').length, { tone: 'emerald' }),
        stat('Admins', active.filter((p) => p.role === 'admin').length, { tone: 'purple' }),
        stat('Deactivated', people.length - active.length)),
      el('div', { class: 'mt-6' }, panel('Volunteer list',
        el('button', { class: 'btn btn-primary btn-sm', onclick: addVolunteer }, icon('userPlus', 'size-4'), 'Add volunteer'),
        toolbar(labelled('Show', showSelect), labelled('Profile', typeSelect),
          el('div', { class: 'min-w-64 flex-1' }, labelled('Search', searchBox('Name, email, phone or Telegram', (q) => { query = q; drawList(); })))),
        listHost)));
    drawList();
  };

  const refresh = () => load(host, ctx, () => call('listPeople'), draw);
  mount(root, pageHead('Volunteers', ''), host);
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
    const save = (btn, payload, label) => busy(btn, label, async () => {
      const res = await updatePerson({ userId, ...payload }, p.name);
      toast(res.message);
      refresh();
    });
    const regular = p.volunteerType === 'regular';
    const typeBtn = el('button', { class: 'btn btn-secondary btn-sm' }, icon('sparkle', 'size-4'), regular ? 'Move back to volunteer' : 'Promote to regular');
    typeBtn.addEventListener('click', async () => {
      if (!(await majorActionPrompt({ action: regular ? `moving ${p.name} back to volunteer` : `promoting ${p.name} to regular` }))) return;
      busy(typeBtn, 'Saving…', async () => {
        const res = await call('setVolunteerType', { userId, volunteerType: regular ? 'volunteer' : 'regular' });
        toast(res.message);
        refresh();
      });
    });
    const roleBtn = el('button', { class: 'btn btn-secondary btn-sm' }, icon('shield', 'size-4'), p.role === 'admin' ? 'Remove admin access' : 'Make an admin');
    // Google Contacts (Contacts.gs): shown when CONTACTS_SYNC is on. Saves now, or retries a failed save.
    const contactBtn = d.contact && d.contact.on
      ? el('button', { class: 'btn btn-secondary btn-sm' }, icon('userPlus', 'size-4'), d.contact.saved ? 'Update Google contact' : 'Save to Google Contacts')
      : null;
    if (contactBtn) {
      contactBtn.addEventListener('click', () => busy(contactBtn, 'Saving…', async () => {
        const res = await call('syncContact', { userId });
        toast(res.message, res.contact && res.contact.saved ? 'ok' : 'warn');
        refresh();
      }));
    }
    roleBtn.addEventListener('click', async () => {
      if (p.role === 'admin') {
        const off = await majorActionPrompt({ action: `removing ${p.name}'s admin access`, needsPassword: true });
        if (off) save(roleBtn, { role: 'volunteer', adminPassword: off.password });
        return;
      }
      const ok = await adminWarning(p.name); // a major change: warn first
      if (ok) save(roleBtn, { role: 'admin', adminPassword: ok.password });
    });
    const statusBtn = el('button', { class: p.status === 'inactive' ? 'btn btn-success btn-sm' : 'btn btn-danger btn-sm' }, p.status === 'inactive' ? 'Reactivate' : 'Deactivate');
    statusBtn.addEventListener('click', async () => {
      if (p.status === 'inactive') {
        const back = await majorActionPrompt({ action: `reactivating ${p.name}`, needsPassword: p.role === 'admin' });
        if (back) save(statusBtn, { status: 'active', adminPassword: back.password || undefined });
        return;
      }
      const ok = await deactivateWarning(p);
      if (ok) save(statusBtn, { status: 'inactive', adminPassword: ok.password || undefined });
    });
    const resetBtn = el('button', { class: 'btn btn-secondary btn-sm' }, 'Reset password');
    resetBtn.addEventListener('click', async () => {
      if (!(await majorActionPrompt({ action: `resetting ${p.name}'s password` }))) return;
      busy(resetBtn, 'Resetting…', async () => {
        const res = await call('resetPassword', { userId });
        showTempPassword(p.name, p.email, res.tempPassword);
        refresh();
      });
    });
    const dl = (label, value) => el('div', { class: 'flex justify-between gap-4 py-2' }, el('dt', { class: 'muted' }, label), el('dd', { class: 'text-right font-bold' }, value || '—'));
    mount(host,
      backTo('#/volunteers', 'Volunteers'),
      pageHead(p.name, p.email, typeBadges(p), p.status === 'inactive' ? badge('Deactivated', 'red') : null, p.hasAccount ? null : badge('No login yet', 'amber')),
      statGrid(stat('Hours', hours(d.stats.hours), { tone: 'indigo' }),
        stat('Sessions attended', d.stats.attended, { tone: 'emerald', sub: regular ? 'Regular volunteer' : `${Math.max(0, d.regularAfter - d.stats.attended)} more to become a regular` }),
        stat('No-shows', d.stats.noShows, { tone: d.stats.noShows ? 'red' : 'slate' }),
        stat('Coming up', d.stats.upcoming)),
      el('div', { class: 'mt-6 grid gap-6 lg:grid-cols-2' },
        panel('Details', el('button', { class: 'btn btn-secondary btn-sm', onclick: () => edit(p) }, icon('pencil', 'size-4'), 'Edit'),
          el('dl', { class: 'divide-y divide-slate-100 px-4 py-2 text-sm dark:divide-neutral-800' },
            dl('Phone', p.phone), dl('Telegram', p.telegram ? `@${p.telegram}` : ''), dl('Birthday', p.birthday),
            dl((d.regularTrainees || []).length > 1 ? 'Regular trainees' : 'Regular trainee', (d.regularTrainees || []).length
              ? d.regularTrainees.map((t, i) => [i ? ', ' : '', traineeName(t.name, t.id)])
              : (regular ? 'Not set: see Pairing → Regular pairings' : '')),
            d.typeSetBy ? dl('Profile set by', d.typeSetBy) : null,
            d.contact && d.contact.on ? dl('Google Contacts', d.contact.saved ? d.contact.status
              : d.contact.status ? el('span', { class: 'font-bold text-red-600 dark:text-red-400' }, d.contact.status) : 'Not saved yet') : null,
            // The emergency contact is a registration question now (relationship and number, below);
            // a name given in Version 1 is still shown.
            p.emergencyName ? dl('Emergency contact name (Version 1)', p.emergencyName) : null,
            // The registration form's other questions (Config.gs → REGISTRATION).
            (p.answers || []).filter((a) => a.value).map((a) => dl(a.label, a.value)),
            dl('Registered', p.createdAt),
            p.updatedBy ? dl('Last edited', `${p.updatedAt} by ${p.updatedBy}`) : null)),
        el('div', { class: 'space-y-6' },
          panel('Recent sessions', el('a', { href: '#/hours', class: 'link text-sm' }, 'Hours report'),
            table([
              { label: 'Date', cell: (r) => day(r.date), class: 'whitespace-nowrap' },
              { label: 'Session', cell: (r) => r.title },
              { label: 'Trainee', cell: (r) => (r.trainees || (r.traineeId ? [{ id: r.traineeId, name: r.traineeName }] : [])).map((t, i) => [i ? ', ' : '', traineeName(t.name, t.id)]) },
              { label: 'Hours', cell: (r) => hours(r.hours), class: 'text-right' },
            ], d.recent, { empty: 'No completed sessions yet.' })),
          d.regularHistory && d.regularHistory.length ? panel('Regular trainees over time', el('a', { href: '#/pairings/history', class: 'link text-sm' }, 'Pairing history'),
            table([
              { label: 'Trainee', cell: (x) => traineeName(x.traineeName, x.traineeId) },
              { label: 'From', cell: (x) => (x.from ? day(x.from) : ''), class: 'whitespace-nowrap' },
              { label: 'To', cell: (x) => (x.active ? badge('Now', 'emerald') : x.to ? day(x.to) : ''), class: 'whitespace-nowrap' },
            ], d.regularHistory)) : null,
          panel('Profile and access', null, el('div', { class: 'flex flex-wrap gap-2 p-4' }, typeBtn, roleBtn, resetBtn, statusBtn, contactBtn),
            null))));
  };
  mount(root, host);
  return refresh();
}

/* ---------------- trainees ---------------- */

const GROUPS = [
  { title: 'About', keys: ['name', 'preferredName', 'gender', 'active'] },
  { title: 'For volunteers', keys: ['communication', 'behaviours', 'takeNote', 'interests', 'supportNeeds'] },
  { title: 'Health and family (staff only)', keys: ['medicalNotes', 'dietaryNotes', 'caregiverName', 'caregiverPhone'] },
];
const LONG = ['communication', 'behaviours', 'takeNote', 'interests', 'supportNeeds', 'medicalNotes', 'dietaryNotes'];

function traineeForm(columns, t) {
  const label = (key) => (columns.find((c) => c.key === key) || {}).label || key;
  const value = (key) => (t ? t.fields[key] || '' : '');
  const input = (key) => {
    if (key === 'active') {
      return selectField('active', 'Active', [{ value: 'Yes', label: 'Yes: can be paired' }, { value: 'No', label: 'No: left or on break' }], t && !t.active ? 'No' : 'Yes');
    }
    const visible = (columns.find((c) => c.key === key) || {}).visibleToVolunteers;
    return field(key, label(key), {
      type: LONG.includes(key) ? 'textarea' : key === 'caregiverPhone' ? 'tel' : 'text',
      value: value(key),
      required: key === 'name',
      hint: visible ? 'Paired volunteers see this.' : undefined,
      rows: 2,
    });
  };
  return GROUPS.map((g) => el('fieldset', { class: 'space-y-4' },
    el('legend', { class: 'group-label mt-0!' }, g.title),
    g.keys.length === 4 && !LONG.includes(g.keys[0]) ? [row(input(g.keys[0]), input(g.keys[1])), row(input(g.keys[2]), input(g.keys[3]))] : g.keys.map(input)));
}

/* ---------------- trainee photos ---------------- */

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const PHOTO_MAX_MB = 5;

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('The photo could not be read. Choose it again.'));
    r.readAsDataURL(file);
  });
}

/** Add or change a trainee's photo: from this device (or the phone's camera), or a Google Drive link. */
function photoForm(t, onSaved) {
  const picker = filePicker({ accept: PHOTO_TYPES, hint: `JPG or PNG, up to ${PHOTO_MAX_MB} MB.` });
  const submit = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, 'Save photo');
  const form = el('form', { novalidate: true, class: 'space-y-4' },
    el('div', { class: 'flex justify-center' }, traineeAvatar(t, 'lg')),
    el('div', {}, el('p', { class: 'label' }, 'Photo'), picker.el),
    el('p', { class: 'hint' }, 'Check the caregiver has agreed.'),
    submit);
  const dlg = modal(t.photoUrl ? `Change ${t.name}'s photo` : `Add a photo of ${t.name}`, form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = { traineeId: t.id };
    let file = null;
    if (picker.source() === 'drive') {
      payload.driveUrl = picker.driveUrl();
      if (!payload.driveUrl) { toast('Paste the Google Drive link first.', 'warn'); return; }
    } else {
      file = picker.file();
      if (!file) { toast('Choose a photo first.', 'warn'); return; }
      if (!PHOTO_TYPES.includes(file.type)) { toast('Choose a JPG or PNG photo.', 'warn'); return; }
      if (file.size > PHOTO_MAX_MB * 1024 * 1024) { toast(`That photo is over ${PHOTO_MAX_MB} MB.`, 'warn'); return; }
      Object.assign(payload, { fileName: file.name, mimeType: file.type });
    }
    busy(submit, file ? 'Uploading…' : 'Saving…', async () => {
      if (file) payload.data = await readAsBase64(file);
      const res = await call('setTraineePhoto', payload, { timeoutMs: 120000 });
      dlg.close();
      toast(res.message, /may not be able/.test(res.message) ? 'warn' : 'ok');
      onSaved();
    });
  });
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
    location.hash = `#/trainee/${encodeURIComponent(res.trainee.id)}`;
  }, { wide: true });

  const drawList = () => {
    if (!data) return;
    let rows = show === 'all' ? data.trainees : data.trainees.filter((t) => (show === 'inactive' ? !t.active : t.active));
    if (show === 'noRegular') rows = data.trainees.filter((t) => t.active && !t.regulars.length);
    rows = fuzzyFilter(rows, query, (t) => [t.name, t.fields.preferredName, t.id, t.fields.caregiverName, t.regulars.map((r) => r.name).join(' ')]);
    mount(listHost, table([
      { label: 'Name', cell: (t) => el('span', { class: 'flex items-center gap-3' }, traineeAvatar(t, 'sm'),
        el('span', {}, traineeName(t.name, t.id, 'block font-bold'), t.fields.preferredName && t.fields.preferredName !== t.name ? el('span', { class: 'block text-xs muted' }, `Goes by ${t.fields.preferredName}`) : null)) },
      { label: 'ID', cell: (t) => el('span', { class: 'font-mono text-xs' }, t.id) },
      { label: 'Gender', cell: (t) => t.fields.gender },
      { label: 'Regular volunteers', cell: (t) => (t.regulars.length ? t.regulars.map((r, i) => [i ? ', ' : '', personName(r.name, r.userId)]) : badge('None yet', 'amber')) },
      { label: 'Caregiver', cell: (t) => [t.fields.caregiverName, t.fields.caregiverPhone].filter(Boolean).join(' · ') },
      { label: '', cell: (t) => (t.active ? '' : badge('Inactive', 'slate')) },
    ], rows, { empty: 'No trainee matches.', href: (t) => `#/trainee/${encodeURIComponent(t.id)}` }));
  };

  const draw = (d) => {
    data = d;
    const missing = d.columns.filter((c) => !c.inSheet);
    const showSelect = el('select', { class: 'input py-2', 'aria-label': 'Show' },
      [['active', 'Active'], ['noRegular', 'Without a regular'], ['inactive', 'Inactive'], ['all', 'Everyone']].map(([v, l]) => el('option', { value: v, selected: v === show }, l)));
    showSelect.addEventListener('change', () => { show = showSelect.value; drawList(); });
    mount(host,
      statGrid(stat('Active trainees', d.trainees.filter((t) => t.active).length, { tone: 'purple' }),
        stat('Without a regular', d.trainees.filter((t) => t.active && !t.regulars.length).length, { tone: 'amber', href: '#/pairings/regular' }),
        stat('Inactive', d.trainees.filter((t) => !t.active).length)),
      el('div', { class: 'mt-4 flex flex-wrap gap-2' },
        el('a', { href: '#/visibility', class: 'btn btn-secondary btn-sm' }, icon('eye', 'size-4'), 'What volunteers see'),
        el('a', { href: '#/pairings/regular', class: 'btn btn-secondary btn-sm' }, icon('sparkle', 'size-4'), 'Regular pairings')),
      // Only for a simple trainee list; a House Visit form sheet has its own columns.
      missing.length > 3 ? null : missing.length ? el('p', { class: 'alert alert-info mt-4' },
        `No ${missing.map((c) => `"${c.label}"`).join(', ')} column yet.`) : null,
      el('div', { class: 'mt-6' }, panel('Trainee list',
        el('button', { class: 'btn btn-primary btn-sm', onclick: addTrainee }, icon('plus', 'size-4'), 'Add trainee'),
        toolbar(labelled('Show', showSelect),
          el('div', { class: 'min-w-64 flex-1' }, labelled('Search', searchBox('Name, ID or caregiver', (q) => { query = q; drawList(); })))),
        listHost)));
    drawList();
  };

  mount(root, pageHead('Trainees', ''), host);
  return load(host, ctx, () => call('listTraineeRecords'), draw);
}

export function renderTrainee(root, app, ctx, traineeId) {
  const host = el('div', {});
  const refresh = () => load(host, ctx, () => call('traineeProfile', { traineeId }), draw);

  const draw = (d) => {
    const t = d.trainee;
    const edit = () => formModal(`Edit ${t.name}`, traineeForm(d.columns, t), 'Save changes', async (form) => {
      const changes = traineePayload(form, t);
      if (!Object.keys(changes).length) { toast('No changes to save.'); return; }
      const res = await call('updateTrainee', { traineeId: t.id, ...changes });
      toast(res.message);
      refresh();
    }, { wide: true });

    const audiences = d.noteAudiences || [];
    const newShare = shareChooser({ audiences, volunteers: d.volunteers || [], name: 'new-note' });
    const noteForm = el('form', { class: 'space-y-2 border-t border-slate-100 p-4 dark:border-neutral-800' },
      el('textarea', { name: 'note', class: 'input min-h-[60px]', rows: 2, placeholder: 'Add a note about this trainee', 'aria-label': 'New note' }),
      el('details', {}, el('summary', { class: 'cursor-pointer text-sm font-bold text-indigo-600 dark:text-indigo-400' }, 'Who can read it? (all future volunteers)'),
        el('div', { class: 'mt-2' }, newShare.el)),
      el('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Add note'));
    noteForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const note = noteForm.note.value.trim();
      if (!note) return;
      const how = newShare.get();
      if (!how) return;
      busy(noteForm.querySelector('button[type=submit]'), 'Adding…', async () => {
        await call('addTraineeNote', { traineeId: t.id, note, audience: how.audience, userIds: how.userIds });
        toast('Note added.');
        refresh();
      });
    });
    // Share a note with more volunteers, with specific ones, or keep it private (it is never deleted).
    const noteShare = (n) => {
      const b = el('button', { class: 'btn btn-secondary btn-sm' }, icon('eye', 'size-4'), 'Who can read');
      b.addEventListener('click', () => {
        const chooser = shareChooser({ audiences, volunteers: d.volunteers || [], audience: n.audience || 'all', userIds: (n.sharedWith || []).map((x) => x.userId), name: `note-${n.noteId}` });
        const saveBtn = el('button', { type: 'button', class: 'btn btn-primary w-full' }, 'Save');
        const m = modal('Who can read this note?', [el('p', { class: 'mb-3 whitespace-pre-line text-sm well p-3' }, n.note), chooser.el, el('div', { class: 'mt-4' }, saveBtn)]);
        saveBtn.addEventListener('click', () => {
          const how = chooser.get();
          if (!how) return;
          busy(saveBtn, 'Saving…', async () => {
            const res = await call('setNoteSharing', { noteId: n.noteId, audience: how.audience, userIds: how.userIds });
            m.close();
            toast(res.message);
            refresh();
          });
        });
      });
      return b;
    };

    const photoBtn = el('button', { class: 'btn btn-secondary btn-sm', onclick: () => photoForm(t, refresh) }, icon('pencil', 'size-4'), t.photoUrl ? 'Change photo' : 'Add photo');
    const removePhoto = t.photoUrl ? el('button', { class: 'btn btn-danger btn-sm' }, 'Remove') : null;
    if (removePhoto) {
      removePhoto.addEventListener('click', async () => {
        if (!(await majorActionPrompt({ action: `removing ${t.name}'s photo` }))) return;
        busy(removePhoto, '', async () => { const res = await call('setTraineePhoto', { traineeId: t.id, remove: true }); toast(res.message); refresh(); });
      });
    }
    mount(host,
      backTo('#/trainees', 'Trainees'),
      el('div', { class: 'mb-4 flex flex-wrap items-center gap-4' },
        traineeAvatar(t, 'lg'),
        el('div', { class: 'flex flex-wrap gap-2' }, photoBtn, removePhoto)),
      pageHead(t.name, `${t.id}${t.fields.preferredName && t.fields.preferredName !== t.name ? ` · goes by ${t.fields.preferredName}` : ''}`,
        t.active ? badge('Active', 'emerald') : badge('Inactive', 'slate'),
        el('a', { href: `#/visit-new/${encodeURIComponent(t.id)}`, class: 'btn btn-primary btn-sm' }, icon('plus', 'size-4'), 'New house visit'),
        el('a', { href: `#/visibility/${encodeURIComponent(t.id)}`, class: 'btn btn-secondary btn-sm' }, icon('eye', 'size-4'),
          d.visibility.volunteer || d.visibility.regular ? 'What volunteers see (own settings)' : 'What volunteers see'),
        el('button', { class: 'btn btn-secondary btn-sm', onclick: edit }, icon('pencil', 'size-4'), 'Edit')),
      el('div', { class: `alert ${d.regulars.length ? 'alert-success' : 'alert-warn'} mb-6 flex flex-wrap items-center justify-between gap-2` },
        el('span', {}, d.regulars.length ? ['Regular volunteers: ', d.regulars.map((r, i) => [i ? ', ' : '', personName(r.name, r.userId, 'font-bold')])] : 'No regular volunteer yet.'),
        el('a', { href: '#/pairings/regular', class: 'link' }, 'Regular pairings')),
      // Details grouped and coloured like MINDS's House Visit form.
      el('div', { class: 'grid gap-x-6 lg:grid-cols-2 [&>details:first-child]:mt-0 lg:[&>details:nth-child(2)]:mt-0' },
        hvSections(d.sections.length ? d.sections : [{ title: 'Details', fields: [] }])),
      el('div', { class: 'mt-6 grid gap-6 lg:grid-cols-2' },
        panel(`Notes (${d.notes.length})`, null,
          table([
            { label: 'Date', cell: (n) => day(n.date), class: 'whitespace-nowrap' },
            { label: 'Note', cell: (n) => el('span', {}, el('span', { class: 'block whitespace-pre-line' }, n.note), el('span', { class: 'block text-xs muted' }, `${n.author} · ${n.source}`), el('span', { class: 'mt-1 block' }, audienceBadge(n))) },
            { label: '', cell: (n) => noteShare(n), class: 'text-right' },
          ], d.notes, { empty: 'No notes yet.' }),
          noteForm),
        panel(`House visits (${d.visits.length})`, el('a', { href: '#/visits', class: 'link text-sm' }, 'All visits'),
          table([
            { label: 'Date', cell: (v) => day(v.date), class: 'whitespace-nowrap' },
            { label: 'Visited by', cell: (v) => personName(v.volunteerName, v.userId) },
            { label: 'Follow-up', cell: (v) => v.followUp, class: 'whitespace-pre-line' },
          ], d.visits, { empty: 'No house visits recorded.' }))),
      el('div', { class: 'mt-6 grid gap-6 lg:grid-cols-2' },
        panel('Recent sessions', null, table([
          { label: 'Date', cell: (b) => day(b.date), class: 'whitespace-nowrap' },
          { label: 'Session', cell: (b) => b.sessionTitle },
          { label: 'Volunteer', cell: (b) => personName(b.volunteerName, b.userId) },
        ], d.pairings, { empty: 'Not paired with a volunteer yet.' })),
        panel('Outings', null, table([
          { label: 'Outing', cell: (o) => o.title },
          { label: 'Date', cell: (o) => day(o.date), class: 'whitespace-nowrap' },
          { label: 'With', cell: (o) => personName(o.volunteerName, o.userId) },
        ], d.outings, { empty: 'No outings.', href: (o) => `#/outing/${o.outingId}` })),
        panel('Overseas trips', null, table([
          { label: 'Trip', cell: (x) => x.title },
          { label: 'Dates', cell: (x) => dateRangeText(x.startDate, x.endDate), class: 'whitespace-nowrap' },
          { label: 'Status', cell: (x) => x.status },
        ], d.trips, { empty: 'No trips.', href: (x) => `#/trip/${x.tripId}` }))),
      el('p', { class: 'mt-4 text-xs muted' }, `${plural(d.notes.filter((n) => n.audience === 'all').length, 'note')} shared with all future volunteers, ${plural(d.notes.filter((n) => n.audience === 'private').length, 'private note')}.`));
  };
  mount(root, host);
  return refresh();
}
