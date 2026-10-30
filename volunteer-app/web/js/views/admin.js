// Admin hub (the phone's "Admin" tab), the activity log, and the editor for
// what volunteers and regulars can see about trainees.

import { call } from '../api.js';
import {
  backLink, badge, busy, el, errorBlock, fmtDay, fmtTimes, icon as baseIcon, loading, majorActionPrompt, mount, projectShort, searchBox, toast,
} from '../ui.js';
import { icon } from '../../admin/js/kit.js';
import { personName } from '../quickview.js';

/* ---------------- hub ---------------- */

export function renderAdminHub(root, app, ctx) {
  // Laid out like the Comm Dashboard: create and manage on the left, upcoming sessions on the right.
  let selected = '';
  const cardHead = (iconName, tone, text) => el('h2', { class: 'dash-head' }, el('span', { class: `dash-ico dash-${tone}` }, icon(iconName, 'size-5')), text);
  const outline = (href, tone, text, iconName) => el('a', { href, class: `dash-btn dash-btn-${tone}` }, iconName ? icon(iconName, 'size-5') : null, text);

  /** "Copy Info": the session, venue and who's coming (with trainees), ready to paste into Telegram. */
  const copyInfo = (s, btn) => busy(btn, 'Copying…', async () => {
    const d = await call('sessionDetail', { sessionId: s.sessionId });
    const coming = d.bookings.filter((b) => b.status !== 'cancelled');
    const lines = [
      `${s.title}: ${fmtDay(s.date)}, ${fmtTimes(s)}`,
      s.venue,
      s.projects && s.projects.length ? `Projects: ${s.projects.join(', ')}` : '',
      '',
      `Coming (${coming.length}):`,
      ...coming.map((b) => `• ${(b.volunteer || {}).name || b.name}${(b.trainees || []).length ? ` → ${b.trainees.map((t) => t.name).join(', ')}` : ' (to pair)'}`),
    ].filter((l, k, all) => l !== '' || (all[k - 1] !== '' && k > 0));
    await navigator.clipboard.writeText(lines.join('\n'));
    toast('Copied. Paste it into Telegram.');
  });

  const sessionCard = (s, today) => {
    const st = s.stats || {};
    const rows = st.byProject && st.byProject.length ? st.byProject : [];
    const copyBtn = el('button', { type: 'button', class: 'dash-act w-full' }, icon('copy', 'size-4'), 'Copy Info');
    copyBtn.addEventListener('click', () => copyInfo(s, copyBtn));
    return el('div', { class: 'dash-session' },
      el('div', { class: 'flex items-start justify-between gap-2' },
        el('div', { class: 'min-w-0' },
          el('p', { class: 'truncate font-bold text-slate-900 dark:text-white' }, s.title, s.date === today ? el('span', { class: 'ml-2' }, badge('Today', 'emerald')) : null),
          el('p', { class: 'text-xs muted' }, `${fmtDay(s.date, today)} · ${fmtTimes(s)}`)),
        null),
      el('div', { class: 'mt-3 overflow-x-auto' },
        el('table', { class: 'dash-table' },
          el('thead', {}, el('tr', {}, el('th', {}, 'Proj'), el('th', {}, 'Coming'), el('th', {}, 'Paired'), el('th', {}, 'To pair'))),
          el('tbody', {},
            rows.map((r) => el('tr', { class: r.project === 'Not given' ? 'dash-muted' : '' },
              el('td', {}, projectShort(r.project) || r.project), el('td', {}, String(r.coming)), el('td', {}, String(r.paired)), el('td', {}, String(r.unpaired)))),
            el('tr', { class: 'dash-total' }, el('td', {}, 'Total'), el('td', {}, String(st.booked || 0)), el('td', {}, String(st.paired || 0)),
              el('td', { class: st.unpaired ? 'text-red-600 dark:text-red-400' : '' }, String(st.unpaired || 0)))))),
      // The session's actions (Pair, Who's coming, Scan, Clock in) are in Session Management, once.
      el('div', { class: 'mt-3' }, copyBtn));
  };

  const draw = (h) => {
    const today = h ? h.today : '';
    const upcoming = (h ? h.sessions : []).filter((s) => s.date >= today).slice(0, 6);
    if (!selected || !upcoming.some((s) => s.sessionId === selected)) selected = upcoming.length ? upcoming[0].sessionId : '';
    const pick = el('select', { class: 'input', 'aria-label': 'Select session' },
      upcoming.length ? upcoming.map((s) => el('option', { value: s.sessionId, selected: s.sessionId === selected }, `${s.title} · ${fmtDay(s.date, today)}`))
        : el('option', { value: '' }, 'No upcoming sessions'));
    const manage = el('div', { class: 'grid grid-cols-2 gap-3' });
    const drawManage = () => {
      const id = selected;
      const onDay = (upcoming.find((s) => s.sessionId === id) || {}).date === today;
      // Scan and Clock in are for the day itself.
      const dayOnly = (href, tone, text) => (onDay ? outline(href, tone, text)
        : el('span', { class: `dash-btn dash-btn-${tone} opacity-40`, title: 'On the day of the session', 'aria-disabled': 'true' }, text, el('span', { class: 'text-xs font-semibold' }, '(on the day)')));
      mount(manage, id ? [
        outline(`#/pair/${id}`, 'green', 'Pair'),
        outline(`#/session/${id}`, 'blue', "Who's coming"),
        dayOnly(`#/scan/${id}`, 'purple', 'Scan'),
        dayOnly(`#/clock/${id}`, 'orange', 'Clock in'),
      ] : el('p', { class: 'dash-span2 text-sm muted' }, 'No upcoming sessions.'));
    };
    pick.addEventListener('change', () => { selected = pick.value; drawManage(); });
    drawManage();
    mount(root,
      el('h1', { class: 'page-title' }, 'Dashboard'),
      el('div', { class: 'dash-grid' },
        el('div', { class: 'space-y-6' },
          el('section', { class: 'dash-card' }, cardHead('plus', 'blue', 'Create New Session'),
            el('a', { href: '#/new-session', class: 'btn btn-primary mt-4 w-full' }, 'Create Session')),
          el('section', { class: 'dash-card' }, cardHead('list', 'green', 'Session Management'),
            el('label', { class: 'dash-label' }, 'Select session'), pick,
            el('div', { class: 'mt-3' }, manage))),
        el('section', { class: 'dash-card' }, cardHead('calendar', 'purple', 'Upcoming Sessions'),
          el('div', { class: 'mt-4 space-y-4' },
            upcoming.length ? upcoming.map((s) => sessionCard(s, today)) : el('p', { class: 'text-sm muted' }, 'No upcoming sessions.')))));
  };
  const cached = app.cachedAdminHome();
  draw(cached);
  return app.fetchAdminHome().then((h) => { if (ctx.alive()) draw(h); }).catch(() => {});
}

/* ---------------- activity log ---------------- */

export function renderActivityLog(root, app, ctx) {
  const filters = { adminId: '', query: '', from: '', to: '' };
  const host = el('div', { class: 'mt-4' });
  let timer = null;
  const adminSelect = el('select', { id: 'log-admin', class: 'input', 'aria-label': 'Admin' }, el('option', { value: '' }, 'All admins'));
  const from = el('input', { id: 'log-from', type: 'date', class: 'input', 'aria-label': 'From' });
  const to = el('input', { id: 'log-to', type: 'date', class: 'input', 'aria-label': 'To' });

  const load = () => {
    mount(host, loading());
    const payload = {};
    Object.keys(filters).forEach((k) => { if (filters[k]) payload[k] = filters[k]; });
    return call('listAdminLog', payload).then((d) => {
      if (!ctx.alive()) return;
      if (adminSelect.options.length === 1) d.admins.forEach((a) => adminSelect.append(el('option', { value: a.userId }, a.name)));
      const byDay = {};
      d.entries.forEach((e) => { (byDay[e.at.slice(0, 10)] = byDay[e.at.slice(0, 10)] || []).push(e); });
      mount(host,
        el('p', { class: 'mb-2 text-xs font-bold uppercase tracking-wider muted' },
          `${d.total} change${d.total === 1 ? '' : 's'}${d.entries.length < d.total ? `, newest ${d.entries.length} shown` : ''}`),
        d.entries.length ? Object.keys(byDay).map((day) => [
          el('h2', { class: 'group-label' }, fmtDay(day)),
          el('div', { class: 'card divide-y divide-slate-100 overflow-hidden dark:divide-neutral-900' }, byDay[day].map((e) => el('div', { class: 'flex gap-3 p-3 text-sm' },
            el('span', { class: 'w-12 shrink-0 font-mono text-xs muted' }, e.at.slice(11, 16)),
            // Who did it sits under the details (not a third column), so phones keep the text wide.
            el('span', { class: 'min-w-0 flex-1' },
              el('span', { class: 'block font-bold text-slate-900 dark:text-white' }, e.action),
              el('span', { class: 'block break-words text-slate-600 dark:text-neutral-400' }, e.summary),
              el('span', { class: 'mt-0.5 block text-xs' }, personName(e.adminName, e.adminId, 'font-bold text-indigo-700 dark:text-indigo-300')))))),
        ]) : el('p', { class: 'text-sm muted' }, 'Nothing matches these filters.'));
    }).catch((err) => { if (ctx.alive()) mount(host, errorBlock(err, load)); });
  };
  adminSelect.addEventListener('change', () => { filters.adminId = adminSelect.value; load(); });
  from.addEventListener('change', () => { filters.from = from.value; load(); });
  to.addEventListener('change', () => { filters.to = to.value; load(); });
  mount(root,
    el('h1', { class: 'page-title' }, 'Activity log'),
    // Each filter has a label (an empty date box is blank on iPhone without one).
    el('div', { class: 'mt-4 grid gap-3 sm:grid-cols-2' },
      el('div', {}, el('label', { class: 'label', for: 'log-admin' }, 'Admin'), adminSelect),
      el('div', {}, el('span', { class: 'label' }, 'Search'),
        searchBox('A name or "pairing"', (q) => { filters.query = q; clearTimeout(timer); timer = setTimeout(load, 300); }, 'Search the log')),
      el('div', {}, el('label', { class: 'label', for: 'log-from' }, 'From'), from),
      el('div', {}, el('label', { class: 'label', for: 'log-to' }, 'To'), to)),
    host);
  return load();
}

/* ---------------- what volunteers and regulars see ---------------- */

const AUDIENCE = {
  volunteer: { title: 'Volunteers', text: 'Only see the trainee an admin pairs them with.' },
  regular: { title: 'Regulars', text: 'Can open any trainee.' },
};

export function renderVisibility(root, app, ctx, traineeId) {
  const draw = (d) => {
    const forTrainee = Boolean(d.trainee);
    const editor = (audience) => {
      const chosen = new Set(d.audiences[audience].fields);
      const boxes = [];
      const sectionBlock = (s) => {
        const items = s.fields.map((f) => {
          const box = el('input', { type: 'checkbox', value: f.key, checked: chosen.has(f.key) });
          boxes.push(box);
          return el('label', { class: 'check-row' }, box, el('span', {}, f.label));
        });
        const all = el('button', { type: 'button', class: 'link text-xs' }, 'All');
        const none = el('button', { type: 'button', class: 'link text-xs' }, 'None');
        const setAll = (v) => items.forEach((row) => { row.querySelector('input').checked = v; });
        all.addEventListener('click', () => setAll(true));
        none.addEventListener('click', () => setAll(false));
        return el('details', { class: 'border-t border-slate-100 py-2 dark:border-neutral-800', open: s.fields.some((f) => chosen.has(f.key)) },
          el('summary', { class: 'flex cursor-pointer items-center justify-between gap-2 py-1 font-bold' },
            el('span', {}, `${s.title} (${s.fields.filter((f) => chosen.has(f.key)).length}/${s.fields.length})`),
            el('span', { class: 'flex gap-3' }, all, none)),
          s.notes ? null : null,
          el('div', { class: 'pl-1' }, items));
      };
      const fields = () => boxes.filter((b) => b.checked).map((b) => b.value);
      const save = el('button', { class: 'btn btn-primary btn-sm' }, forTrainee ? 'Save for this trainee' : 'Save default');
      const after = (res) => { toast(res.message); if (ctx.alive()) draw(res); };
      save.addEventListener('click', () => busy(save, 'Saving…', async () => after(await call('saveVisibility', { audience, fields: fields(), ...(forTrainee ? { traineeId: d.trainee.id } : {}) }))));
      const extra = [];
      if (forTrainee) {
        const makeDefault = el('button', { class: 'btn btn-secondary btn-sm' }, 'Set as default for everyone');
        makeDefault.addEventListener('click', async () => {
          if (!(await majorActionPrompt({ action: 'making these settings the default for every trainee' }))) return;
          busy(makeDefault, 'Saving…', async () => after(await call('saveVisibility', { audience, fields: fields(), traineeId: d.trainee.id, makeDefault: true })));
        });
        extra.push(makeDefault);
        if (!d.audiences[audience].isDefault) {
          const reset = el('button', { class: 'btn btn-secondary btn-sm' }, 'Use the default');
          reset.addEventListener('click', () => busy(reset, 'Saving…', async () => after(await call('saveVisibility', { audience, traineeId: d.trainee.id, reset: true }))));
          extra.push(reset);
        }
      }
      return el('section', { class: 'card overflow-hidden' },
        el('div', { class: 'section-head section-blue' }, AUDIENCE[audience].title,
          forTrainee ? badge(d.audiences[audience].isDefault ? 'Default' : 'Own settings', d.audiences[audience].isDefault ? 'slate' : 'amber') : null),
        el('div', { class: 'p-4' },

          d.sections.map(sectionBlock),
          el('div', { class: 'mt-3 flex flex-wrap gap-2' }, save, extra)));
    };
    mount(root,
      forTrainee ? backLink(`#/trainee/${encodeURIComponent(d.trainee.id)}`, d.trainee.name) : null,
      el('h1', { class: 'page-title mb-4' }, forTrainee ? `What volunteers see: ${d.trainee.name}` : 'What volunteers see'),
      el('div', { class: 'grid gap-4 lg:grid-cols-2' }, editor('volunteer'), editor('regular')));
  };
  mount(root, loading());
  return call('visibilitySettings', traineeId ? { traineeId } : {}).then((d) => { if (ctx.alive()) draw(d); })
    .catch((err) => { if (ctx.alive()) mount(root, errorBlock(err, () => app.rerender())); });
}

/* ---------------- the admin password ---------------- */

/** Settings → Admin password: change the shared password needed to make or remove an admin. */
export function renderAdminPassword(root) {
  const field = (name, label, autocomplete) => {
    const input = el('input', { type: 'password', name, id: `f-${name}`, class: 'input', autocomplete, minlength: 8, maxlength: 128 });
    return el('div', {}, el('label', { class: 'label', for: `f-${name}` }, label), input);
  };
  const submit = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, 'Change admin password');
  const form = el('form', { class: 'card space-y-4 p-4', novalidate: true },
    field('currentPassword', 'Current admin password', 'off'),
    field('newPassword', 'New admin password', 'new-password'),
    field('confirmPassword', 'Re-enter password', 'new-password'),
    el('p', { class: 'hint' }, 'At least 8 characters.'),
    submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const current = form.currentPassword.value;
    const next = form.newPassword.value;
    if (!current) { toast('Type the current admin password.', 'warn'); form.currentPassword.focus(); return; }
    if (next.length < 8) { toast('The new admin password needs at least 8 characters.', 'warn'); form.newPassword.focus(); return; }
    if (next !== form.confirmPassword.value) { toast("The two new passwords don't match.", 'warn'); form.confirmPassword.focus(); return; }
    busy(submit, 'Saving…', async () => {
      const res = await call('changeAdminPassword', { currentPassword: current, newPassword: next });
      form.reset();
      toast(res.message);
    });
  });
  mount(root,
    el('h1', { class: 'page-title mb-4' }, 'Admin password'),
    form,
    el('div', { class: 'alert alert-info mt-4 text-sm' },
      el('p', { class: 'font-bold' }, 'Forgotten it?'),
      el('p', {}, 'In Apps Script, run resetAdminPassword; the new one is in the Execution log.')));
}

/* ---------------- Advanced settings ---------------- */

/**
 * Settings → Advanced settings: one-time setup and migration functions, run
 * from the app instead of the Apps Script editor (MINDS's web app template).
 * Functions that change data need the admin password. Server: Maintenance.gs.
 */
export function renderAdvanced(root, app, ctx) {
  const reportHost = el('div', {});
  const host = el('div', { class: 'space-y-3' });
  const run = async (t, btn) => {
    let adminPassword;
    if (t.changesData) {
      const ok = await majorActionPrompt({ action: `running "${t.label}"`, needsPassword: true });
      if (!ok) return;
      adminPassword = ok.password;
    }
    busy(btn, 'Running…', async () => {
      const res = await call('runMaintenance', { task: t.key, adminPassword }, { timeoutMs: 120000 });
      toast(res.message);
      mount(reportHost, el('h2', { class: 'group-label' }, `Report: ${t.label}`), el('pre', { class: 'report' }, res.report));
      reportHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  mount(root,
    el('h1', { class: 'page-title' }, 'Advanced settings'),
    el('div', { class: 'danger-zone mt-4' },
      el('p', { class: 'font-extrabold' }, '⚠ Warning'),
      el('p', { class: 'text-sm' }, 'Activating these functions may cause data loss. Only use them if you know what you are doing.')),
    host, reportHost);
  mount(host, loading());
  return call('maintenanceTasks').then((d) => {
    if (!ctx.alive()) return;
    mount(host, d.tasks.map((t) => {
      const btn = el('button', { class: `btn btn-sm ${t.changesData ? 'btn-danger' : 'btn-secondary'}` }, t.changesData ? 'Run…' : 'Run');
      btn.addEventListener('click', () => run(t, btn));
      return el('div', { class: 'card flex flex-wrap items-center justify-between gap-3 p-4' },
        el('div', { class: 'min-w-0 flex-1' },
          el('p', { class: 'font-bold text-slate-900 dark:text-white' }, t.label,
            t.changesData ? el('span', { class: 'ml-2' }, badge('Changes data', 'red')) : el('span', { class: 'ml-2' }, badge('Read-only', 'emerald'))),
          null),
        btn);
    }));
  }).catch((err) => { if (ctx.alive()) mount(host, errorBlock(err, () => app.rerender())); });
}

/* ---------------- Google Sheets (the databases) ---------------- */

const CREATE_HINT = {
  volunteers: 'Copies the current database.', // so nobody is signed out
};

/**
 * Settings → Google Sheets: which Google Sheet each database uses, and linking
 * another, as in CSL Attendance's "Manage Google Sheet": create a new sheet,
 * search Google Drive, or paste a URL / ID. Server: DataSources.gs.
 */
export function renderSheets(root, app, ctx) {
  const host = el('div', { class: 'space-y-6' });
  const reportHost = el('div', {});

  const after = (res) => {
    toast(res.message);
    if (res.report) mount(reportHost, el('details', { class: 'card p-4' }, el('summary', { class: 'cursor-pointer font-bold' }, 'Setup report'), el('pre', { class: 'report mt-3' }, res.report)));
    if (ctx.alive()) draw(res.sources);
  };
  const confirmThen = async (action, run) => {
    const ok = await majorActionPrompt({ action, needsPassword: true });
    if (ok) run(ok.password);
  };

  const divider = (text) => el('div', { class: 'or-divider' }, el('span', {}, text));

  const card = (s) => {
    const label = s.label.toLowerCase();
    const status = s.error ? badge('Can\u2019t open', 'red', 'alert')
      : s.check && s.check.ok ? badge('Ready', 'emerald', 'tick') : badge('Needs attention', 'amber', 'alert');

    const createBtn = el('button', { type: 'button', class: 'btn btn-success' }, icon('plus', 'size-5'), 'Create New Sheet');
    createBtn.addEventListener('click', () => confirmThen(`creating a new ${label}`, (adminPassword) => busy(createBtn, 'Creating…', async () => {
      after(await call('createDataSource', { source: s.key, adminPassword }, { timeoutMs: 120000 }));
    })));

    const results = el('div', { class: 'mt-2 space-y-1' });
    const query = el('input', { type: 'search', class: 'input search-input pl-10', placeholder: 'Search for a Google Sheet…', 'aria-label': `Search Google Drive for a ${label}` });
    const searchBtn = el('button', { type: 'button', class: 'btn btn-dark' }, 'Search');
    const link = (sheet) => confirmThen(`linking "${sheet.name}" as the ${label}`, (adminPassword) => busy(searchBtn, 'Linking…', async () => {
      after(await call('connectDataSource', { source: s.key, ref: sheet.id, adminPassword }, { timeoutMs: 120000 }));
    }));
    const search = () => busy(searchBtn, 'Searching…', async () => {
      const r = await call('searchSheets', { query: query.value.trim() });
      mount(results, r.results.length ? r.results.map((f) => el('div', { class: 'pick-row border border-slate-200 dark:border-neutral-800' },
        el('span', { class: 'min-w-0 flex-1' },
          el('span', { class: 'block truncate font-bold' }, f.name),
          el('span', { class: 'block text-xs muted' }, `Updated ${f.updated}`)),
        el('a', { href: f.url, target: '_blank', rel: 'noopener', class: 'link text-sm' }, 'Open'),
        el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => link(f) }, 'Link')))
        : el('p', { class: 'text-sm muted' }, 'No Google Sheets match. Check the name, or that the sheet is shared with the app\u2019s Google account.'));
    });
    searchBtn.addEventListener('click', search);
    query.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });

    const url = el('input', { type: 'text', class: 'input', placeholder: 'Paste Google Sheets URL or ID…', 'aria-label': `Google Sheets URL or ID for the ${label}` });
    const connectBtn = el('button', { type: 'button', class: 'btn btn-primary', disabled: true }, 'Connect');
    url.addEventListener('input', () => { connectBtn.disabled = !url.value.trim(); });
    const connect = () => confirmThen(`linking a different sheet as the ${label}`, (adminPassword) => busy(connectBtn, 'Checking…', async () => {
      after(await call('connectDataSource', { source: s.key, ref: url.value.trim(), adminPassword }, { timeoutMs: 120000 }));
    }));
    connectBtn.addEventListener('click', connect);
    url.addEventListener('keydown', (e) => { if (e.key === 'Enter' && url.value.trim()) { e.preventDefault(); connect(); } });

    let unlink = null;
    if (s.key !== 'volunteers' && s.linked && !s.linked.sharesVolunteerSheet) {
      unlink = el('button', { type: 'button', class: 'link text-sm' }, 'Use the volunteer database instead');
      unlink.addEventListener('click', () => confirmThen(`moving the ${label} back to the volunteer database`, (adminPassword) => busy(unlink, 'Saving…', async () => {
        after(await call('unlinkDataSource', { source: s.key, adminPassword }, { timeoutMs: 120000 }));
      })));
    }

    const linked = s.linked;
    return el('section', { class: 'card p-5' },
      el('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
        el('h2', { class: 'text-lg font-extrabold text-slate-900 dark:text-white' }, s.label), status),
      s.error ? el('p', { class: 'alert alert-error mt-3' }, s.error) : null,
      linked ? el('div', { class: 'well mt-3 p-3 text-sm' },
        el('p', {}, el('span', { class: 'muted' }, 'Now using: '),
          el('a', { href: linked.url, target: '_blank', rel: 'noopener', class: 'link font-bold' }, linked.name),
          linked.tab ? el('span', { class: 'muted' }, ` → tab "${linked.tab}"`) : null),
        linked.sharesVolunteerSheet ? el('p', { class: 'mt-1 text-xs muted' }, 'Same as the volunteer database.') : null,
        s.check && s.check.missing.length ? el('p', { class: 'mt-1 text-xs font-bold text-amber-700 dark:text-amber-400' }, `Missing: ${s.check.missing.join('; ')}`) : null,
        s.check && s.check.note ? el('p', { class: 'mt-1 text-xs muted' }, s.check.note) : null,
        unlink ? el('div', { class: 'mt-2' }, unlink) : null) : null,
      el('div', { class: 'mt-4' }, createBtn, CREATE_HINT[s.key] ? el('p', { class: 'hint mt-1' }, CREATE_HINT[s.key]) : null),
      divider('Or connect existing'),
      el('div', { class: 'flex gap-2' },
        el('div', { class: 'relative min-w-0 flex-1' },
          el('span', { class: 'pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400' }, icon('search')), query),
        searchBtn),
      results,
      divider('Or enter URL directly'),
      el('div', { class: 'flex gap-2' }, el('div', { class: 'min-w-0 flex-1' }, url), connectBtn));
  };

  const draw = (sources) => mount(host, sources.map(card));
  mount(root,
    el('h1', { class: 'page-title' }, 'Google Sheets'),
    host, reportHost);
  mount(host, loading());
  return call('dataSources').then((d) => { if (ctx.alive()) draw(d.sources); })
    .catch((err) => { if (ctx.alive()) mount(host, errorBlock(err, () => app.rerender())); });
}
