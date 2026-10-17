// Admin: Settings (the shared admin password, links to MINDS's other
// databases, what new and regular volunteers may see, Google Contacts) and
// the Activity log of every admin change.

import { call } from '../../api.js';
import { askPassword, badge, busy, el, fuzzyFilter, mount, searchBox, toast } from '../../ui.js';
import { field, icon, load, pageHead, panel, row, table } from '../kit.js';

/* ---------------- settings ---------------- */

export function renderSettings(root, app, ctx) {
  const host = el('div', {});

  const passwordPanel = () => {
    const form = el('form', { class: 'space-y-4 p-4', novalidate: true },
      el('p', { class: 'text-sm muted' }, 'One password for all MINDS admins, not tied to anyone\'s account. Changing it ends admin on every other device.'),
      field('currentPassword', 'Current admin password', { type: 'password', autocomplete: 'off' }),
      row(field('newPassword', 'New admin password', { type: 'password', autocomplete: 'new-password', hint: 'At least 10 characters.' }),
        field('newPassword2', 'Type it again', { type: 'password', autocomplete: 'new-password' })),
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'Change admin password'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (form.newPassword.value !== form.newPassword2.value) { toast('The two new passwords are different.', 'warn'); return; }
      busy(form.querySelector('button[type=submit]'), 'Saving…', async () => {
        const res = await call('changeAdminPassword', { currentPassword: form.currentPassword.value, newPassword: form.newPassword.value });
        app.setAdmin(res);
        form.reset();
        toast(res.message);
      });
    });
    const out = el('button', { class: 'btn btn-danger btn-sm' }, icon('logout', 'size-4'), 'Sign out every other admin device');
    out.addEventListener('click', async () => {
      const pw = await askPassword('Sign out every admin device', 'Everyone else who has admin open (on any phone or computer) will have to type the admin password again.', 'Sign them out');
      if (!pw) return;
      busy(out, 'Saving…', async () => {
        const res = await call('adminSignOutAll', { adminPassword: pw });
        app.setAdmin(res);
        toast(res.message);
      });
    });
    return panel('Admin password', null, form, el('div', { class: 'border-t border-slate-100 p-4 dark:border-neutral-800' }, out));
  };

  const databasesPanel = (dbs) => panel('Databases', null,
    el('p', { class: 'px-4 pt-4 text-sm muted' }, 'Where the app finds MINDS\'s information. Paste the link to a Google Sheet; to use one tab of it, open that tab first and copy the link (it ends in #gid=…). The sheet must be shared with the Google account that runs the app. Leave blank to use the default.'),
    el('div', { class: 'divide-y divide-slate-100 dark:divide-neutral-800' }, dbs.map((db) => {
      const form = el('form', { class: 'grid gap-3 p-4 md:grid-cols-[1fr_12rem_auto] md:items-end', novalidate: true },
        field(`url-${db.key}`, db.kind === 'folder' ? 'Drive folder link' : 'Google Sheet link', { value: db.url, optional: true, placeholder: db.kind === 'folder' ? 'https://drive.google.com/drive/folders/…' : 'https://docs.google.com/spreadsheets/d/…' }),
        db.kind === 'sheet' ? field(`tab-${db.key}`, 'Tab name', { value: db.tab, optional: true, placeholder: 'or #gid in the link' }) : el('span', { class: 'hidden md:block' }),
        el('button', { type: 'submit', class: 'btn btn-secondary' }, 'Save'));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const payload = { key: db.key, url: form[`url-${db.key}`].value.trim() };
        if (form[`tab-${db.key}`]) payload.tab = form[`tab-${db.key}`].value.trim();
        busy(form.querySelector('button[type=submit]'), 'Checking…', async () => {
          const res = await call('saveDataSource', payload);
          toast(res.message);
          refresh();
        });
      });
      return el('div', {},
        el('div', { class: 'flex flex-wrap items-start justify-between gap-2 px-4 pt-4' },
          el('div', { class: 'min-w-0' },
            el('p', { class: 'font-bold text-slate-900 dark:text-white' }, db.label),
            el('p', { class: 'text-xs muted' }, db.notes)),
          badge(db.ok ? (db.linked ? 'Linked' : 'Default') : 'Problem', db.ok ? (db.linked ? 'emerald' : 'slate') : 'red')),
        el('p', { class: `px-4 pt-2 text-sm ${db.ok ? 'text-slate-700 dark:text-neutral-300' : 'font-bold text-red-600 dark:text-red-400'}` }, db.status),
        db.updatedBy ? el('p', { class: 'px-4 text-xs muted' }, `Changed by ${db.updatedBy}, ${String(db.updatedAt).slice(0, 16)}`) : null,
        form);
    })));

  const accessPanel = (fa) => {
    const state = Object.fromEntries(fa.fields.map((f) => [f.key, { newSee: f.newSee, regularSee: f.regularSee }]));
    const box = (f, k) => {
      const input = el('input', { type: 'checkbox', class: 'size-5 accent-indigo-600', checked: f[k], 'aria-label': `${k === 'newSee' ? 'New' : 'Regular'} volunteers see ${f.label}` });
      input.addEventListener('change', () => { state[f.key][k] = input.checked; });
      return el('label', { class: 'flex cursor-pointer justify-center' }, input);
    };
    const group = (title, fields) => (fields.length ? [
      el('p', { class: 'group-label px-4' }, title),
      table([
        { label: 'Field', cell: (f) => el('span', { class: 'font-bold' }, f.label) },
        { label: 'New volunteers see', cell: (f) => box(f, 'newSee'), class: 'text-center w-32' },
        { label: 'Regular volunteers see', cell: (f) => box(f, 'regularSee'), class: 'text-center w-32' },
      ], fields),
    ] : null);
    const save = el('button', { class: 'btn btn-primary' }, 'Save what volunteers see');
    save.addEventListener('click', () => busy(save, 'Saving…', async () => {
      const res = await call('saveFieldAccess', { fields: Object.keys(state).map((key) => ({ key, ...state[key] })) });
      toast(res.message);
      refresh();
    }));
    return panel('What volunteers see about trainees', null,
      el('p', { class: 'px-4 pt-4 text-sm muted' }, 'New volunteers only ever see the trainee(s) they are paired with; regular volunteers can open every trainee. Admins always see everything. Keep it to what volunteers need (PDPA).'),
      group('From the trainee list', fa.fields.filter((f) => f.source === 'trainee')),
      group('From the app', fa.fields.filter((f) => f.source === 'app')),
      fa.updatesLinked
        ? group('From the house-visit form (trainee updates)', fa.fields.filter((f) => f.source === 'update'))
        : el('p', { class: 'px-4 pt-4 text-sm muted' }, fa.updatesError || 'Link the house-visit form responses under Databases to choose which answers volunteers see (and can update).'),
      el('div', { class: 'p-4' }, save));
  };

  const contactsPanel = (c) => {
    const sync = el('button', { class: 'btn btn-secondary btn-sm' }, icon('refresh', 'size-4'), 'Sync now');
    sync.addEventListener('click', () => busy(sync, 'Syncing…', async () => {
      const res = await call('syncContacts', {});
      toast(res.message);
      refresh();
    }));
    return panel('Google Contacts', c.enabled ? sync : null, el('div', { class: 'space-y-2 p-4 text-sm' },
      el('p', {}, 'Each new volunteer is added to the contacts of the Google account that runs the app, with their Telegram handle in the contact\'s notes', c.label ? `, under the label "${c.label}".` : '.'),
      !c.enabled ? el('p', { class: 'alert alert-info' }, 'Turned off in Config.gs (SYNC_GOOGLE_CONTACTS).')
        : !c.available ? el('p', { class: 'alert alert-warn' }, 'The People API is not turned on for the Apps Script project yet (Services → People API).')
          : null,
      el('p', { class: 'font-bold' }, `${c.synced} of ${c.volunteers} active volunteers are in Google Contacts.${c.errors ? ` ${c.errors} could not be added (see the Google Contact column).` : ''}`)));
  };

  const draw = (s) => mount(host,
    el('div', { class: 'grid gap-6 xl:grid-cols-2' },
      el('div', { class: 'space-y-6' }, passwordPanel(), contactsPanel(s.contacts),
        panel('Activity log', el('a', { href: '#/admin/log', class: 'link text-sm' }, 'Open'),
          el('p', { class: 'p-4 text-sm muted' }, 'Every admin change is recorded with the name of the person who made it, in the app and in the "Admin Log" tab of the sheet.'))),
      databasesPanel(s.databases)),
    el('div', { class: 'mt-6' }, accessPanel(s.fieldAccess)),
    el('p', { class: 'mt-4 text-xs muted' }, `Admin stays open for ${s.adminSessionHours} hours on a device. Volunteers become regular after ${s.regularAfterSessions} completed sessions (or when an admin marks them regular).`));

  const refresh = () => load(host, ctx, () => call('adminSettings'), draw);
  mount(root, pageHead('Settings', 'Admin password, databases, what volunteers see and Google Contacts.'), host);
  return refresh();
}

/* ---------------- activity log ---------------- */

export function renderLog(root, app, ctx) {
  let data = null;
  let query = '';
  const host = el('div', {});
  const listHost = el('div', {});
  const drawList = () => {
    if (!data) return;
    const rows = fuzzyFilter(data.entries, query, (e) => [e.person, e.action, e.details, e.time]);
    mount(listHost, table([
      { label: 'When', cell: (e) => e.time.slice(0, 16), class: 'whitespace-nowrap' },
      { label: 'Who', cell: (e) => (e.userId ? el('a', { href: `#/admin/volunteer/${e.userId}`, class: 'link' }, e.person) : e.person) },
      { label: 'What', cell: (e) => el('span', { class: `font-bold ${/wrong/i.test(e.action) ? 'text-red-600 dark:text-red-400' : ''}` }, e.action) },
      { label: 'Details', cell: (e) => el('span', { class: 'text-slate-600 dark:text-neutral-400' }, e.details) },
    ], rows, { empty: data.entries.length ? 'Nothing matches.' : 'No admin activity yet.' }));
  };
  const draw = (d) => {
    data = d;
    mount(host, panel(`Activity log (${d.total})`, null,
      el('div', { class: 'border-b border-slate-100 p-4 dark:border-neutral-800' }, searchBox('Search by name, action or details', (q) => { query = q; drawList(); })),
      listHost),
    el('p', { class: 'mt-3 text-xs muted' }, d.total > d.entries.length ? `Showing the newest ${d.entries.length}. Everything is in the "Admin Log" tab of the sheet.` : 'Also in the "Admin Log" tab of the sheet.'));
    drawList();
  };
  mount(root, pageHead('Activity log', 'Who opened admin and every change they made, newest first.'), host);
  return load(host, ctx, () => call('listAdminLog', {}), draw);
}
