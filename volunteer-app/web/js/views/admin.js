// Admin hub (the phone's "Admin" tab), the activity log, and the editor for
// what volunteers and regulars can see about trainees.

import { call } from '../api.js';
import {
  backLink, badge, busy, el, errorBlock, fmtDay, icon as baseIcon, loading, mount, searchBox, toast,
} from '../ui.js';
import { icon } from '../../admin/js/kit.js';
import { personName } from '../quickview.js';

/* ---------------- hub ---------------- */

export function renderAdminHub(root, app, ctx) {
  const tile = (href, iconName, title, text, count, tone = 'indigo') => el('a', { href, class: 'tile' },
    el('span', { class: 'flex items-center justify-between gap-2' },
      el('span', { class: `flex size-10 items-center justify-center rounded-xl ${tone === 'slate' ? 'bg-slate-100 text-slate-500 dark:bg-neutral-900 dark:text-neutral-400' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'}` }, icon(iconName, 'size-5')),
      count ? badge(String(count), 'amber') : null),
    el('span', { class: 'font-bold text-slate-900 dark:text-white' }, title),
    el('span', { class: 'text-xs muted' }, text));
  const draw = (h) => {
    const todays = (h ? h.sessions : []).filter((s) => s.date === (h && h.today));
    mount(root,
      el('h1', { class: 'page-title' }, 'Admin'),
      el('p', { class: 'mb-4 mt-1 text-sm muted' }, 'On a computer these are also in the sidebar.'),
      todays.length ? el('div', { class: 'alert alert-info mb-4' },
        el('p', { class: 'font-bold' }, `Today: ${todays.map((s) => s.title).join(', ')}`),
        el('div', { class: 'mt-2 flex flex-wrap gap-2' },
          el('a', { href: '#/scan', class: 'btn btn-success btn-sm' }, baseIcon('scan', 'size-4'), 'Scan passes'),
          el('a', { href: '#/clock', class: 'btn btn-secondary btn-sm' }, baseIcon('clock', 'size-4'), 'Clock in by hand'))) : null,
      el('div', { class: 'tile-grid' },
        tile('#/today', 'calendar', 'Sessions', "Who's coming; pair, scan and clock in for each session"),
        tile('#/pairings', 'sparkle', 'Pairing', "Sessions to pair, and regulars' fixed trainees", h && h.unpairedTotal),
        tile('#/volunteers', 'users', 'Volunteers', 'People, attendance and hours'),
        tile('#/trainees', 'heart', 'Trainees', 'Details, photos, notes to review, what volunteers see', h && h.reviewCount),
        tile('#/overview', 'dashboard', 'Dashboard', 'Numbers, what needs attention, activity log'),
        tile('#/guide-edit', 'pencil', 'Settings', 'Volunteer guide, projects and venues'),
        tile('#/fundraising', 'list', 'More', 'Fundraising, outings, trips, house visits (placeholders)', 0, 'slate')),
      el('p', { class: 'mt-4 text-xs muted' }, 'Tip: press and hold any name in the app for their details.'));
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
  const adminSelect = el('select', { class: 'input', 'aria-label': 'Admin' }, el('option', { value: '' }, 'All admins'));
  const from = el('input', { type: 'date', class: 'input', 'aria-label': 'From' });
  const to = el('input', { type: 'date', class: 'input', 'aria-label': 'To' });

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
            el('span', { class: 'min-w-0 flex-1' },
              el('span', { class: 'block font-bold text-slate-900 dark:text-white' }, e.action),
              el('span', { class: 'block break-words text-slate-600 dark:text-neutral-400' }, e.summary)),
            personName(e.adminName, e.adminId, 'shrink-0 text-right text-xs font-bold text-indigo-700 dark:text-indigo-300')))),
        ]) : el('p', { class: 'text-sm muted' }, 'Nothing matches these filters.'));
    }).catch((err) => { if (ctx.alive()) mount(host, errorBlock(err, load)); });
  };
  adminSelect.addEventListener('change', () => { filters.adminId = adminSelect.value; load(); });
  from.addEventListener('change', () => { filters.from = from.value; load(); });
  to.addEventListener('change', () => { filters.to = to.value; load(); });
  mount(root,
    el('h1', { class: 'page-title' }, 'Activity log'),
    el('p', { class: 'mt-1 text-sm muted' }, 'Every change an admin makes, newest first. The same list is in the "Admin Activity Log" tab of the Google Sheet.'),
    el('div', { class: 'mt-4 grid gap-2 sm:grid-cols-2' },
      adminSelect,
      searchBox('Search, e.g. a name or "pairing"', (q) => { filters.query = q; clearTimeout(timer); timer = setTimeout(load, 300); }, 'Search the log'),
      from, to),
    host);
  return load();
}

/* ---------------- what volunteers and regulars see ---------------- */

const AUDIENCE = {
  volunteer: { title: 'Volunteers (new / ad hoc)', text: 'Only see the trainee an admin pairs them with.' },
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
          el('div', { class: 'pl-1' }, items));
      };
      const fields = () => boxes.filter((b) => b.checked).map((b) => b.value);
      const save = el('button', { class: 'btn btn-primary btn-sm' }, forTrainee ? 'Save for this trainee' : 'Save default');
      const after = (res) => { toast(res.message); if (ctx.alive()) draw(res); };
      save.addEventListener('click', () => busy(save, 'Saving…', async () => after(await call('saveVisibility', { audience, fields: fields(), ...(forTrainee ? { traineeId: d.trainee.id } : {}) }))));
      const extra = [];
      if (forTrainee) {
        const makeDefault = el('button', { class: 'btn btn-secondary btn-sm' }, 'Set as default for everyone');
        makeDefault.addEventListener('click', () => {
          if (!confirm(`Use these ${fields().length} details as the default for all trainees?`)) return;
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
          el('p', { class: 'mb-2 text-sm muted' }, `${AUDIENCE[audience].text} Tick what they can see.`),
          d.sections.map(sectionBlock),
          el('div', { class: 'mt-3 flex flex-wrap gap-2' }, save, extra)));
    };
    mount(root,
      forTrainee ? backLink(`#/trainee/${encodeURIComponent(d.trainee.id)}`, d.trainee.name) : null,
      el('h1', { class: 'page-title' }, forTrainee ? `What volunteers see about ${d.trainee.name}` : 'What volunteers see about trainees'),
      el('p', { class: 'mb-4 mt-1 text-sm muted' }, forTrainee
        ? 'These settings apply to this trainee only. "Set as default" makes them the starting point for every trainee.'
        : 'The default for every trainee. You can change it for one trainee from their page. MINDS will confirm the final lists; this is a starting point.'),
      el('div', { class: 'grid gap-4 lg:grid-cols-2' }, editor('volunteer'), editor('regular')),
      el('p', { class: 'mt-4 text-xs muted' }, 'Admins always see everything. Names are always shown.'));
  };
  mount(root, loading());
  return call('visibilitySettings', traineeId ? { traineeId } : {}).then((d) => { if (ctx.alive()) draw(d); })
    .catch((err) => { if (ctx.alive()) mount(root, errorBlock(err, () => app.rerender())); });
}
