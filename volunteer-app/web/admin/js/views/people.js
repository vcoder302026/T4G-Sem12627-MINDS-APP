// Admin → Volunteers and Trainees.

import { personName, traineeName } from '../../../js/quickview.js';
import { call } from '../../../js/api.js';
import {
  badge, busy, el, fuzzyFilter, labelled, modal, mount, passwordPrompt, searchBox, toast, traineeAvatar, typeBadges,
} from '../../../js/ui.js';
import {
  backTo, dateRangeText, day, field, formModal, hours, icon, load, pageHead, panel, plural, row, selectField, stat, statGrid, table,
  toolbar,
} from '../kit.js';

/* ---------------- volunteers ---------------- */

const PROFILE = [
  ['name', 'Full name', { required: true }],
  ['email', 'Email', { type: 'email', required: true }],
  ['phone', 'Phone', { type: 'tel', placeholder: '+65 9123 4567' }],
  ['birthday', 'Birthday', { type: 'date' }],
  ['telegram', 'Telegram', { placeholder: 'username, without @' }],
  ['emergencyName', 'Emergency contact name', {}],
  ['emergencyPhone', 'Emergency contact phone', { type: 'tel' }],
  ['emergencyRelation', 'Relationship', { placeholder: 'e.g. Mother' }],
];

function profileFields(p = {}) {
  const f = ([key, label, attrs]) => field(key, label, { ...attrs, value: p[key] || '' });
  return [row(f(PROFILE[0]), f(PROFILE[1])), row(f(PROFILE[2]), f(PROFILE[3])), f(PROFILE[4]),
    el('p', { class: 'group-label mt-2!' }, 'Emergency contact'), row(f(PROFILE[5]), f(PROFILE[6])), f(PROFILE[7])];
}

function showTempPassword(name, email, password) {
  modal('Temporary password', el('div', { class: 'space-y-4' },
    el('p', {}, `Give ${name} this temporary password. They sign in with ${email} and change it under Me.`),
    el('p', { class: 'well select-all p-4 text-center font-mono text-2xl font-bold tracking-wider' }, password),
    el('p', { class: 'text-xs muted' }, 'It is shown only once. If it gets lost, use Reset password on their page.')));
}

/**
 * Saves a change to a person. Removing an admin (role or deactivating them)
 * needs the signed-in admin's own password: ask for it, then try again.
 */
async function updatePerson(payload, name) {
  try {
    return await call('updatePerson', payload);
  } catch (err) {
    if (err.code !== 'PASSWORD_REQUIRED') throw err;
    const pw = await passwordPrompt('Confirm with your password', `${name} is an admin. To ${payload.status === 'inactive' ? 'deactivate them' : 'remove their admin access'}, enter your own password.`);
    if (!pw) throw new Error('Not changed.');
    return call('updatePerson', { ...payload, adminPassword: pw });
  }
}

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
    if (type !== 'all') rows = rows.filter((p) => (type === 'admin' ? p.role === 'admin' : p.volunteerType === type));
    rows = fuzzyFilter(rows, query, (p) => [p.name, p.email, p.phone, p.telegram, p.role === 'admin' ? 'admin' : '', p.volunteerType, p.regularTraineeName]);
    const statusButton = (p) => {
      const b = el('button', { class: p.status === 'inactive' ? 'btn btn-success btn-sm' : 'btn btn-danger btn-sm' }, p.status === 'inactive' ? 'Reactivate' : 'Deactivate');
      b.addEventListener('click', () => {
        if (p.status !== 'inactive' && !window.confirm(`Deactivate ${p.name}? They are signed out and can't sign in until reactivated. Their hours stay in the sheet.`)) return;
        busy(b, '', async () => {
          const res = await updatePerson({ userId: p.userId, status: p.status === 'inactive' ? 'active' : 'inactive' }, p.name);
          toast(res.message);
          refresh();
        });
      });
      return b;
    };
    mount(listHost, table([
      { label: 'Name', cell: (p) => personName(p.name, p.userId, 'font-bold') },
      { label: 'Profile', cell: (p) => el('span', { class: 'flex flex-wrap gap-1' }, typeBadges(p), p.status === 'inactive' ? badge('Deactivated', 'red') : null, p.hasAccount ? null : badge('No login yet', 'amber')) },
      { label: 'Regular trainee', cell: (p) => (p.regularTraineeName ? traineeName(p.regularTraineeName, p.regularTraineeId) : '') },
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
      [['all', 'All profiles'], ['volunteer', 'Volunteers (new / ad hoc)'], ['regular', 'Regulars'], ['admin', 'Admins']].map(([v, l]) => el('option', { value: v, selected: v === type }, l)));
    typeSelect.addEventListener('change', () => { type = typeSelect.value; drawList(); });
    mount(host,
      statGrid(
        stat('New volunteers', active.filter((p) => p.volunteerType !== 'regular').length, { tone: 'indigo', sub: `Become regulars after ${res.regularAfter || 10} sessions` }),
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
  mount(root, pageHead('Volunteers', 'Everyone who volunteers. Admins are volunteers too, with the Admin menu on top.'), host);
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
    const typeBtn = el('button', { class: 'btn btn-secondary btn-sm' }, icon('sparkle', 'size-4'), regular ? 'Move back to volunteer (ad hoc)' : 'Promote to regular');
    typeBtn.addEventListener('click', () => {
      if (regular && !window.confirm(`Make ${p.name} a volunteer (ad hoc) again? Their regular pairing ends.`)) return;
      busy(typeBtn, 'Saving…', async () => {
        const res = await call('setVolunteerType', { userId, volunteerType: regular ? 'volunteer' : 'regular' });
        toast(res.message);
        refresh();
      });
    });
    const roleBtn = el('button', { class: 'btn btn-secondary btn-sm' }, icon('shield', 'size-4'), p.role === 'admin' ? 'Remove admin access' : 'Make an admin');
    roleBtn.addEventListener('click', () => save(roleBtn, { role: p.role === 'admin' ? 'volunteer' : 'admin' }));
    const statusBtn = el('button', { class: p.status === 'inactive' ? 'btn btn-success btn-sm' : 'btn btn-danger btn-sm' }, p.status === 'inactive' ? 'Reactivate' : 'Deactivate');
    statusBtn.addEventListener('click', () => {
      if (p.status !== 'inactive' && !window.confirm(`Deactivate ${p.name}? They are signed out and can't sign in until reactivated. Their hours stay in the sheet.`)) return;
      save(statusBtn, { status: p.status === 'inactive' ? 'active' : 'inactive' });
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
            dl('Regular trainee', d.regularTrainee ? traineeName(d.regularTrainee.name, d.regularTrainee.id) : (regular ? 'Not set: see Pairing → Regular pairings' : '')),
            d.typeSetBy ? dl('Profile set by', d.typeSetBy) : null,
            dl('Emergency contact', `${p.emergencyName || ''}${p.emergencyRelation ? ` (${p.emergencyRelation})` : ''}`),
            dl('Emergency phone', p.emergencyPhone), dl('Registered', p.createdAt),
            p.updatedBy ? dl('Last edited', `${p.updatedAt} by ${p.updatedBy}`) : null)),
        el('div', { class: 'space-y-6' },
          panel('Recent sessions', el('a', { href: '#/hours', class: 'link text-sm' }, 'Hours report'),
            table([
              { label: 'Date', cell: (r) => day(r.date), class: 'whitespace-nowrap' },
              { label: 'Session', cell: (r) => r.title },
              { label: 'Hours', cell: (r) => hours(r.hours), class: 'text-right' },
            ], d.recent, { empty: 'No completed sessions yet.' })),
          panel('Profile and access', null, el('div', { class: 'flex flex-wrap gap-2 p-4' }, typeBtn, roleBtn, resetBtn, statusBtn),
            el('p', { class: 'px-4 pb-4 text-xs muted' }, 'Removing an admin, or deactivating one, asks for your password. Every change is in the Activity log.')))));
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
  let source = 'upload';
  const fileInput = el('input', { type: 'file', accept: PHOTO_TYPES.join(','), class: 'input py-2', 'aria-label': 'Choose a photo' });
  const uploadBox = el('div', { class: 'space-y-1' }, fileInput,
    el('p', { class: 'hint' }, `A JPG or PNG up to ${PHOTO_MAX_MB} MB. On a phone you can take one with the camera. It's saved in a "Trainee photos" folder in the app's Google Drive.`));
  const driveBox = el('div', { hidden: true }, field('driveUrl', 'Google Drive link', {
    placeholder: 'https://drive.google.com/file/d/…/view',
    hint: 'In Google Drive: right-click the photo → Share → Copy link.',
  }));
  const choice = (value, label) => {
    const input = el('input', { type: 'radio', name: 'source', value, checked: value === source });
    input.addEventListener('change', () => { source = value; uploadBox.hidden = value !== 'upload'; driveBox.hidden = value !== 'drive'; });
    return el('label', { class: 'check-row' }, input, el('span', {}, label));
  };
  const submit = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, 'Save photo');
  const form = el('form', { novalidate: true, class: 'space-y-4' },
    el('div', { class: 'flex justify-center' }, traineeAvatar(t, 'lg')),
    el('fieldset', { class: 'space-y-1' }, el('legend', { class: 'label' }, 'Where is the photo?'),
      choice('upload', 'From this device'), choice('drive', 'Already in Google Drive')),
    uploadBox, driveBox,
    el('p', { class: 'hint' }, 'Volunteers paired with this trainee, and regular volunteers, will see the photo. Check the caregiver has agreed.'),
    submit);
  const dlg = modal(t.photoUrl ? `Change ${t.name}'s photo` : `Add a photo of ${t.name}`, form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = { traineeId: t.id };
    let file = null;
    if (source === 'drive') {
      payload.driveUrl = form.driveUrl.value.trim();
      if (!payload.driveUrl) { toast('Paste the Google Drive link first.', 'warn'); return; }
    } else {
      file = fileInput.files && fileInput.files[0];
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
        `The trainee sheet has no ${missing.map((c) => `"${c.label}"`).join(', ')} column yet. It is added automatically the first time you fill it in.`) : null,
      el('div', { class: 'mt-6' }, panel('Trainee list',
        el('button', { class: 'btn btn-primary btn-sm', onclick: addTrainee }, icon('plus', 'size-4'), 'Add trainee'),
        toolbar(labelled('Show', showSelect),
          el('div', { class: 'min-w-64 flex-1' }, labelled('Search', searchBox('Name, ID or caregiver', (q) => { query = q; drawList(); })))),
        listHost)));
    drawList();
  };

  mount(root, pageHead('Trainees', 'MINDS\'s trainee list (e.g. the House Visit form responses). Rows are never deleted: mark someone inactive instead.'), host);
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

    const photoBtn = el('button', { class: 'btn btn-secondary btn-sm', onclick: () => photoForm(t, refresh) }, icon('pencil', 'size-4'), t.photoUrl ? 'Change photo' : 'Add photo');
    const removePhoto = t.photoUrl ? el('button', { class: 'btn btn-danger btn-sm' }, 'Remove') : null;
    if (removePhoto) {
      removePhoto.addEventListener('click', () => {
        if (!window.confirm(`Remove ${t.name}'s photo? The file stays in Google Drive.`)) return;
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
        el('a', { href: `#/visibility/${encodeURIComponent(t.id)}`, class: 'btn btn-secondary btn-sm' }, icon('eye', 'size-4'),
          d.visibility.volunteer || d.visibility.regular ? 'What volunteers see (own settings)' : 'What volunteers see'),
        el('button', { class: 'btn btn-secondary btn-sm', onclick: edit }, icon('pencil', 'size-4'), 'Edit')),
      el('div', { class: `alert ${d.regulars.length ? 'alert-success' : 'alert-warn'} mb-6 flex flex-wrap items-center justify-between gap-2` },
        el('span', {}, d.regulars.length ? ['Regular volunteers: ', d.regulars.map((r, i) => [i ? ', ' : '', personName(r.name, r.userId, 'font-bold')])] : 'No regular volunteer yet. Ideally every trainee has at least one.'),
        el('a', { href: '#/pairings/regular', class: 'link' }, 'Regular pairings')),
      el('div', { class: 'grid gap-6 lg:grid-cols-2' },
        (d.sections.length ? d.sections : [{ title: 'Details', fields: [] }]).map((s) => panel(s.title, null,
          s.fields.length ? el('dl', { class: 'divide-y divide-slate-100 text-sm dark:divide-neutral-800' },
            s.fields.map((f) => el('div', { class: 'grid gap-1 px-4 py-2.5 sm:grid-cols-3' },
              el('dt', { class: 'muted' }, f.label),
              el('dd', { class: 'whitespace-pre-line font-medium sm:col-span-2' }, f.value))))
            : el('p', { class: 'p-4 text-sm muted' }, 'Nothing filled in yet.')))),
      el('div', { class: 'mt-6 grid gap-6 lg:grid-cols-2' },
        panel(`Notes for volunteers (${d.notes.length})`, null,
          table([
            { label: 'Date', cell: (n) => day(n.date), class: 'whitespace-nowrap' },
            { label: 'Note', cell: (n) => el('span', {}, el('span', { class: 'block whitespace-pre-line' }, n.note), el('span', { class: 'block text-xs muted' }, `${n.author} · ${n.source}`)) },
            { label: '', cell: (n) => el('span', { class: 'flex flex-col items-end gap-1' }, n.status === 'hidden' ? badge('Hidden', 'slate') : null, noteToggle(n)), class: 'text-right' },
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
      el('p', { class: 'mt-4 text-xs muted' }, `${plural(d.notes.filter((n) => n.status !== 'hidden').length, 'note')} visible to paired volunteers.`));
  };
  mount(root, host);
  return refresh();
}
