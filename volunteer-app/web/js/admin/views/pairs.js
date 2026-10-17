// Admin: the Pairing List — standing volunteer ↔ trainee pairs, mostly for
// regular volunteers. Pairs go both ways (one volunteer, several trainees; one
// trainee, several volunteers). When a volunteer says they're coming, their
// pairs are used first. Pairs can be imported from an existing pairs sheet or
// from the house-visit form responses (Settings → Databases).

import { call } from '../../api.js';
import { badge, busy, el, fuzzyFilter, mount, searchBox, toast, typeBadge } from '../../ui.js';
import { field, icon, load, pageHead, panel, row, stat, statGrid, tabs, traineePicker, volunteerPicker } from '../kit.js';

export function renderPairs(root, app, ctx, view = 'volunteers') {
  let data = null;
  let query = '';
  let showEnded = false;
  const host = el('div', {});
  const listHost = el('div', {});
  const importOut = el('div', {});

  const endPair = (x, btn) => {
    if (!confirm(`End the regular pair ${x.volunteerName} – ${x.traineeName}? It stays in the Pairing List tab as history.`)) return;
    busy(btn, '', async () => {
      const res = await call('endPair', { pairId: x.pairId });
      toast(res.message);
      draw(res);
    });
  };

  const chip = (x, label) => {
    const ended = x.status === 'ended';
    const end = ended ? null : el('button', { type: 'button', class: 'ml-0.5 rounded-full px-1 text-base leading-none hover:bg-white/60 dark:hover:bg-black/30', 'aria-label': `End pair ${x.volunteerName} and ${x.traineeName}`, title: 'End this pair' }, '×');
    if (end) end.addEventListener('click', () => endPair(x, end));
    return el('span', { class: `badge ${ended ? 'badge-slate line-through opacity-70' : 'badge-emerald'} py-1 text-sm`, title: [x.source === 'imported' ? 'Imported' : '', x.since ? `Since ${x.since}` : '', x.notes].filter(Boolean).join(' · ') || null }, label, end);
  };

  const drawList = () => {
    if (!data) return;
    const pairs = data.pairs.filter((x) => showEnded || x.status === 'active');
    const byVolunteer = view === 'volunteers';
    const groups = {};
    pairs.forEach((x) => {
      const key = byVolunteer ? x.userId : x.traineeId;
      const g = groups[key] || (groups[key] = { key, name: byVolunteer ? x.volunteerName : x.traineeName, type: x.volunteerType, items: [] });
      g.items.push(x);
    });
    let rows = Object.values(groups).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    rows = fuzzyFilter(rows, query, (g) => [g.name, ...g.items.map((x) => (byVolunteer ? x.traineeName : x.volunteerName))]);
    const unpairedTrainees = byVolunteer ? [] : data.options.trainees.filter((t) => !groups[t.id]);
    mount(listHost, rows.length || unpairedTrainees.length
      ? el('div', { class: 'divide-y divide-slate-100 dark:divide-neutral-800' },
        rows.map((g) => el('div', { class: 'flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center' },
          el('div', { class: 'flex min-w-0 items-center gap-2 sm:w-64' },
            el('a', { href: byVolunteer ? `#/admin/volunteer/${g.key}` : `#/admin/trainee/${encodeURIComponent(g.key)}`, class: 'link truncate' }, g.name),
            byVolunteer && g.type ? typeBadge(g.type) : null),
          el('div', { class: 'flex flex-1 flex-wrap gap-1.5' }, g.items.map((x) => chip(x, byVolunteer ? x.traineeName : x.volunteerName))))),
        query ? null : unpairedTrainees.map((t) => el('div', { class: 'flex items-center gap-2 px-4 py-3' },
          el('a', { href: `#/admin/trainee/${encodeURIComponent(t.id)}`, class: 'link sm:w-64' }, t.name),
          badge('No regular volunteer', 'amber'))))
      : el('p', { class: 'px-4 py-8 text-center text-sm muted' }, data.pairs.length ? 'No pair matches.' : 'No regular pairs yet. Add one above, or import them.'));
  };

  const doImport = (from, btn) => busy(btn, 'Importing…', async () => {
    const res = await call('importPairs', { from });
    toast(res.message, res.imported.unmatched.length ? 'warn' : 'ok');
    draw(res);
    mount(importOut, res.imported.unmatched.length ? el('div', { class: 'alert alert-warn mt-4' },
      el('p', { class: 'font-bold' }, `Not imported: ${res.imported.unmatched.length} (no matching name or email in the app)`),
      el('ul', { class: 'mt-1 list-disc pl-5' }, res.imported.unmatched.map((u) => el('li', {}, u))),
      el('p', { class: 'mt-2 text-xs' }, 'Add the volunteer (Admin → Volunteers) or fix the name in the sheet, then import again. Pairs already on the list are skipped.')) : []);
  });

  function draw(d) {
    data = d;
    const add = el('form', { class: 'grid items-end gap-3 p-4 md:grid-cols-[1fr_1fr_1fr_auto]', novalidate: true },
      volunteerPicker(d.options.volunteers),
      traineePicker(d.options.trainees),
      field('notes', 'Notes', { optional: true, placeholder: 'e.g. Saturday sessions' }),
      el('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus', 'size-4'), 'Add pair'));
    add.addEventListener('submit', (e) => {
      e.preventDefault();
      const userId = add.querySelector('input[name=userId]').value;
      const traineeId = add.querySelector('input[name=traineeId]').value;
      if (!userId || !traineeId) { toast('Choose a volunteer and a trainee.', 'warn'); return; }
      busy(add.querySelector('button[type=submit]'), 'Adding…', async () => {
        const res = await call('addPair', { userId, traineeId, notes: add.notes.value.trim() });
        toast(res.message);
        draw(res);
      });
    });
    const imports = [];
    if (d.importFrom.traineeUpdates) {
      const b = el('button', { class: 'btn btn-secondary btn-sm' }, icon('download', 'size-4'), 'Import from house-visit responses');
      b.addEventListener('click', () => doImport('traineeUpdates', b));
      imports.push(b);
    }
    if (d.importFrom.pairs) {
      const b = el('button', { class: 'btn btn-secondary btn-sm' }, icon('download', 'size-4'), 'Import from the pairs sheet');
      b.addEventListener('click', () => doImport('pairs', b));
      imports.push(b);
    }
    const ended = el('label', { class: 'flex items-center gap-2 text-sm font-bold' },
      el('input', { type: 'checkbox', class: 'size-4 accent-indigo-600', checked: showEnded, onchange: (e) => { showEnded = e.target.checked; drawList(); } }), 'Show ended pairs');
    mount(host,
      statGrid(
        stat('Regular pairs', d.counts.pairs, { tone: 'emerald' }),
        stat('Volunteers with a pair', d.counts.volunteers, { tone: 'indigo' }),
        stat('Trainees with a pair', d.counts.trainees, { tone: 'purple' }),
        stat('Trainees without one', d.counts.traineesWithoutPair, { tone: d.counts.traineesWithoutPair ? 'amber' : 'slate' })),
      el('div', { class: 'mt-6' }, panel('Add a regular pair', imports.length ? imports : el('a', { href: '#/admin/settings', class: 'link text-sm' }, 'Link a sheet to import pairs'), add)),
      importOut,
      el('div', { class: 'mt-6' }, panel('Pairing list', ended,
        el('div', { class: 'flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-neutral-800' },
          el('div', { class: 'w-full sm:w-auto' }, tabs([
            { href: '#/admin/pairs/volunteers', label: 'By volunteer', icon: 'users', active: view !== 'trainees' },
            { href: '#/admin/pairs/trainees', label: 'By trainee', icon: 'heart', active: view === 'trainees' },
          ], 'mb-0')),
          el('div', { class: 'min-w-56 flex-1' }, searchBox('Search names', (q) => { query = q; drawList(); }))),
        listHost)),
      el('p', { class: 'mt-3 text-xs muted' }, 'Tap × to end a pair. Ended pairs are kept as history and still show in each trainee\'s list of past partners.'));
    drawList();
  }

  mount(root, pageHead('Pairing list', 'Regular volunteers and the trainee(s) they always work with. They are paired automatically when they say they\'re coming.'), host);
  return load(host, ctx, () => call('listPairs', { showEnded: true }), draw);
}
