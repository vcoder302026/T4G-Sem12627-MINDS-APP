// The Volunteer Guide (what new volunteers read before their first sign-up), and
// the admin screens that edit it: text sections, infographics (images or PDFs,
// uploaded or picked from Google Drive), projects and venues.

import { call, isNetworkError, storage } from '../api.js';
import {
  backLink, badge, busy, combobox, el, errorBlock, field, fuzzyFilter, icon, labelled, loading, mapsLink, modal, mount,
  richText, searchBox, section, toast,
} from '../ui.js';

const COLOURS = ['blue', 'green', 'purple', 'indigo', 'red'];

function list(...rows) {
  return el('div', { class: 'card divide-y divide-slate-100 overflow-hidden dark:divide-neutral-900' }, ...rows);
}

function projectCard(pr) {
  return el('article', { class: 'card border-l-4 border-l-emerald-500 p-4' },
    el('h3', { class: 'font-bold text-slate-900 dark:text-white' }, pr.name),
    pr.schedule ? el('p', { class: 'mt-1 flex items-center gap-1.5 text-sm text-slate-700 dark:text-neutral-300' }, icon('clock', 'size-4 text-slate-400'), pr.schedule) : null,
    pr.venue ? el('p', { class: 'mt-0.5 flex items-center gap-1.5 text-sm muted' }, icon('pin', 'size-4 text-slate-400'),
      el('a', { href: mapsLink(pr.venueAddress || pr.venue), target: '_blank', rel: 'noopener', class: 'hover:underline' }, pr.venue)) : null,
    pr.description ? el('div', { class: 'mt-2' }, richText(pr.description)) : null);
}

/* ---------------- volunteers: read the guide ---------------- */

/** An image or PDF in the guide. Shared from Google Drive, so it needs signal to load. */
function infographicCard(s, colour) {
  const openLink = s.openUrl ? el('a', { href: s.openUrl, target: '_blank', rel: 'noopener', class: 'btn btn-secondary btn-sm' }, icon('eye', 'size-4'),
    s.kind === 'pdf' ? 'Open PDF' : 'Open full size') : null;
  let media;
  if (s.kind === 'pdf') {
    media = el('iframe', { src: s.previewUrl, title: s.title || s.fileName || 'Guide PDF', loading: 'lazy', class: 'block w-full border-0 bg-slate-100 dark:bg-neutral-900', style: 'height:70vh', allow: 'autoplay' });
  } else {
    const img = el('img', { src: s.imageUrl, alt: s.title || s.body || 'Guide infographic', loading: 'lazy', class: 'block h-auto w-full' });
    img.addEventListener('error', () => img.replaceWith(el('p', { class: 'p-4 text-sm muted' },
      "The picture couldn't load. Check your connection, or open it in Google Drive.")));
    media = el('a', { href: s.openUrl, target: '_blank', rel: 'noopener', 'aria-label': 'Open the picture full size' }, img);
  }
  return el('section', { class: 'card overflow-hidden' },
    s.title ? el('div', { class: `section-head section-${colour}` }, s.title) : null,
    media,
    s.body || openLink ? el('div', { class: 'space-y-3 p-4' }, s.body ? richText(s.body) : null, openLink) : null);
}

export function renderGuide(root, app, ctx) {
  const draw = (g) => {
    const read = Boolean(g.guideReadAt);
    const [first, ...rest] = g.sections;
    const sectionCard = (s, i) => (s.kind === 'image' || s.kind === 'pdf'
      ? infographicCard(s, COLOURS[i % COLOURS.length])
      : section(s.title, COLOURS[i % COLOURS.length], richText(s.body)));
    let footer;
    if (read) {
      footer = el('div', { class: 'mt-6 space-y-3 text-center' },
        el('p', { class: 'text-sm muted' }, `You read this guide on ${String(g.guideReadAt).slice(0, 10)}. Admins update it from time to time.`),
        el('a', { href: app.isAdmin ? '#/guide-edit' : '#/sessions', class: 'btn btn-primary w-full' },
          app.isAdmin ? [icon('pencil'), 'Edit the guide'] : [icon('calendar'), 'Find a session']));
    } else {
      const done = el('button', { type: 'button', class: 'btn btn-success w-full' }, icon('tick'), "I've read the guide");
      done.addEventListener('click', () => busy(done, 'Saving…', async () => {
        const res = await call('acknowledgeGuide');
        storage.set('minds.guide', { ...g, guideReadAt: new Date().toISOString().slice(0, 10) });
        app.saveHome(res.home);
        toast(res.message);
        app.go('#/sessions');
      }));
      footer = [
        el('div', { class: 'h-24' }),
        el('div', { class: 'action-bar' }, el('div', { class: 'mx-auto max-w-2xl' }, done)),
      ];
    }
    mount(root,
      app.isAdmin ? backLink('#/guide-edit', 'Edit guide') : backLink('#/home', 'Home'),
      el('div', { class: 'mb-5 flex items-center gap-3' },
        el('span', { class: 'flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }, icon('book', 'size-6')),
        el('div', {},
          el('h1', { class: 'page-title' }, 'Volunteer Guide'),
          el('p', { class: 'text-sm muted' }, read ? 'Everything you need to know before a session.' : 'Please read this before booking your first session. It takes about 3 minutes.'))),
      el('div', { class: 'space-y-4' },
        first ? sectionCard(first, 0) : null,
        g.projects.length ? [
          el('h2', { class: 'group-label' }, 'Projects you can join'),
          g.projects.map(projectCard),
        ] : null,
        rest.map((s, i) => sectionCard(s, i + 1))),
      footer);
  };

  const cached = storage.get('minds.guide');
  if (cached) draw(cached);
  else mount(root, loading());
  return call('guide').then((g) => {
    storage.set('minds.guide', g);
    if (ctx.alive()) draw(g);
  }).catch((err) => {
    if (!ctx.alive()) return;
    if (!cached) mount(root, errorBlock(err, () => app.rerender()));
    else if (!isNetworkError(err)) toast(err.message, 'error');
  });
}

/* ---------------- venue pickers and the add/edit venue form ---------------- */

/** Opens the add/edit venue pop-up; onSaved(venue, activeVenues). */
export function openVenueForm(venue, onSaved, prefill = '') {
  const save = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, venue ? 'Save venue' : 'Add venue');
  const form = el('form', { novalidate: true, class: 'space-y-4' },
    field('venueName', 'Venue name', { value: venue ? venue.name : prefill, placeholder: 'e.g. MINDS Woodlands Gardens School', maxlength: 120 }),
    field('address', 'Address', { optional: true, value: venue ? venue.address : '', placeholder: 'Street, postal code', hint: 'Volunteers get a Google Maps link to this address.' }),
    field('venueNotes', 'Notes for admins', { type: 'textarea', optional: true, rows: 2, value: venue ? venue.notes : '', placeholder: 'Where to meet, parking, who to call' }),
    venue && venue.name ? el('p', { class: 'hint' }, 'Renaming also renames this venue on today’s and future sessions.') : null,
    save);
  const dlg = modal(venue ? 'Edit venue' : 'Add a venue', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.venueName.value.trim();
    if (!name) {
      toast('Enter the venue name.', 'warn');
      form.venueName.focus();
      return;
    }
    busy(save, 'Saving…', async () => {
      const payload = { name, address: form.address.value.trim(), notes: form.venueNotes.value.trim() };
      if (venue) payload.venueId = venue.venueId;
      const res = await call('saveVenue', payload);
      dlg.close();
      toast(venue ? 'Venue saved.' : `${res.venue.name} added to the venue list.`);
      onSaved(res.venue, res.venues);
    });
  });
}

const venueOptions = (venues, current) => {
  const opts = venues.map((v) => ({ value: v.name, label: v.name, hint: v.address }));
  if (current && !opts.some((o) => o.value === current)) opts.push({ value: current, label: current, hint: 'Archived venue' });
  return opts;
};

/**
 * Venue dropdown with fuzzy search and "+ Add a new venue".
 * New venues are saved straight away and selected.
 */
export function venuePicker(app, venues, value, { optional = false, label = 'Venue' } = {}) {
  let picker;
  const onAdd = (text) => openVenueForm(null, (venue, active) => {
    picker.setOptions(venueOptions(active, ''));
    picker.value = venue.name;
    app.updateVenues(active);
  }, text);
  picker = combobox({
    name: 'venue',
    options: venueOptions(venues, value),
    value: value || (optional || !venues[0] ? '' : venues[0].name),
    placeholder: 'Type to search venues',
    emptyText: 'No venue matches. Add it below.',
    emptyOption: optional ? 'No usual venue' : undefined,
    addLabel: 'Add a new venue',
    onAdd,
  });
  picker.input.setAttribute('aria-label', label);
  return picker;
}

/**
 * Tick boxes for a session's projects (several allowed). `selected`: names to tick.
 * Returns { el, values() }. An archived project already on the session stays listed.
 */
export function projectChecks(projects, selected = []) {
  const names = projects.map((p) => p.name);
  selected.forEach((n) => { if (!names.includes(n)) names.push(n); });
  const boxes = names.map((n) => el('input', { type: 'checkbox', value: n, checked: selected.includes(n) }));
  const wrap = el('div', { class: 'space-y-1' }, boxes.map((box, i) => el('label', { class: 'check-row' }, box,
    el('span', {}, names[i], projects.some((p) => p.name === names[i]) ? null : el('span', { class: 'muted' }, ' (archived)')))));
  return { el: wrap, values: () => boxes.filter((b) => b.checked).map((b) => b.value) };
}

export function projectPicker(projects, value) {
  const opts = projects.map((p) => ({ value: p.name, label: p.name, hint: p.schedule }));
  if (value && !opts.some((o) => o.value === value)) opts.push({ value, label: value, hint: 'Archived project' });
  const picker = combobox({ name: 'project', options: opts, value, placeholder: 'Type to search projects', emptyOption: 'No project', emptyText: 'No project matches' });
  picker.input.setAttribute('aria-label', 'Project');
  return picker;
}

/* ---------------- admins: venues ---------------- */

export function renderVenues(root, app, ctx) {
  let venues = null;
  let query = '';
  const host = el('div', { class: 'mt-4' });
  const drawList = () => {
    if (!venues) return;
    const shown = fuzzyFilter(venues, query, (v) => [v.name, v.address, v.notes]);
    const row = (v) => {
      const edit = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('pencil', 'size-4'), 'Edit');
      edit.addEventListener('click', () => openVenueForm(v, () => load()));
      const archived = v.status === 'archived';
      const toggle = el('button', { type: 'button', class: `btn btn-sm ${archived ? 'btn-secondary' : 'btn-danger'}` }, archived ? 'Restore' : 'Archive');
      toggle.addEventListener('click', () => {
        if (!archived && !confirm(`Archive ${v.name}? It will no longer appear in the venue list for new sessions. Existing sessions keep it.`)) return;
        busy(toggle, 'Saving…', async () => {
          const res = await call('saveVenue', { venueId: v.venueId, status: archived ? 'active' : 'archived' });
          app.updateVenues(res.venues);
          toast(archived ? `${v.name} restored.` : `${v.name} archived.`);
          load();
        });
      });
      return el('div', { class: `p-4 ${archived ? 'opacity-60' : ''}` },
        el('div', { class: 'flex items-start gap-3' },
          el('span', { class: 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }, icon('building', 'size-5')),
          el('div', { class: 'min-w-0 flex-1' },
            el('p', { class: 'flex flex-wrap items-center gap-2 font-bold text-slate-900 dark:text-white' }, v.name, archived ? badge('Archived', 'slate') : null),
            v.address ? el('a', { href: mapsLink(v.address), target: '_blank', rel: 'noopener', class: 'text-sm muted hover:underline' }, v.address)
              : el('p', { class: 'text-sm muted' }, 'No address yet'),
            v.notes ? el('p', { class: 'mt-1 text-sm text-slate-700 dark:text-neutral-300' }, v.notes) : null)),
        el('div', { class: 'mt-3 flex gap-2' }, edit, toggle));
    };
    mount(host, shown.length ? list(shown.map(row)) : el('p', { class: 'text-sm muted' }, venues.length ? 'No venue matches that search.' : 'No venues yet.'));
  };
  const load = () => call('listVenues').then((res) => {
    venues = res.venues;
    if (ctx.alive()) drawList();
  }).catch((err) => { if (ctx.alive() && !venues) mount(host, errorBlock(err, () => app.rerender())); });

  const add = el('button', { type: 'button', class: 'btn btn-primary btn-sm' }, icon('plus', 'size-4'), 'Add venue');
  add.addEventListener('click', () => openVenueForm(null, (v, active) => { app.updateVenues(active); load(); }));
  mount(root,
    el('div', { class: 'flex items-center justify-between gap-3' }, el('h1', { class: 'page-title' }, 'Venues'), add),
    el('p', { class: 'mb-4 mt-1 text-sm muted' }, 'These appear in the venue dropdown when you create a session.'),
    searchBox('Search venues', (q) => { query = q; drawList(); }),
    host);
  mount(host, loading());
  return load();
}

/* ---------------- admins: edit the guide and projects ---------------- */

function sectionForm(s, onSaved) {
  const isFile = Boolean(s && s.kind !== 'text');
  const save = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, s ? 'Save' : 'Add section');
  const form = el('form', { novalidate: true, class: 'space-y-4' },
    field('title', 'Heading', { value: s ? s.title : '', placeholder: isFile ? 'e.g. On the day' : 'e.g. What to wear', maxlength: 120, optional: isFile }),
    field('body', isFile ? 'Caption' : 'Content', {
      type: 'textarea', rows: isFile ? 4 : 10, value: s ? s.body : '', maxlength: 5000, optional: isFile,
      hint: 'Start a line with "- " for a bullet point or "1. " for a numbered step. Leave an empty line between paragraphs.',
    }),
    save);
  const dlg = modal(isFile ? 'Edit infographic' : s ? 'Edit guide section' : 'New guide section', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    const body = form.body.value.trim();
    if (!isFile && (!title || !body)) {
      toast('Add a heading and some content.', 'warn');
      return;
    }
    busy(save, 'Saving…', async () => {
      const content = await call('saveGuideSection', { ...(s ? { sectionId: s.sectionId } : {}), title, body });
      dlg.close();
      toast('Guide updated. Volunteers see the change straight away.');
      onSaved(content);
    });
  });
}

const MAX_MB = 8;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('The file could not be read. Choose it again.'));
    r.readAsDataURL(file);
  });
}

/**
 * Add an infographic (an image or a PDF), or replace the file of an existing one.
 * From this device, or from Google Drive by its share link.
 */
function infographicForm(existing, onSaved) {
  let source = 'upload';
  const fileInput = el('input', { type: 'file', name: 'file', accept: FILE_TYPES.join(','), class: 'input py-2', 'aria-label': 'Choose a picture or PDF' });
  const uploadBox = el('div', { class: 'space-y-1' }, fileInput,
    el('p', { class: 'hint' }, `A JPG or PNG picture, or a PDF, up to ${MAX_MB} MB. It's saved in a "Guide infographics" folder in the app's Google Drive.`));
  const driveBox = el('div', { hidden: true },
    field('driveUrl', 'Google Drive link', {
      placeholder: 'https://drive.google.com/file/d/…/view',
      hint: 'In Google Drive: right-click the file → Share → Copy link. The file must be an image or a PDF that the app\'s Google account can open; the app makes it viewable by anyone with the link.',
    }));
  const choice = (value, label) => {
    const input = el('input', { type: 'radio', name: 'source', value, checked: value === source });
    input.addEventListener('change', () => {
      source = value;
      uploadBox.hidden = source !== 'upload';
      driveBox.hidden = source !== 'drive';
    });
    return el('label', { class: 'check-row' }, input, el('span', {}, label));
  };
  const submit = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, existing ? 'Replace file' : 'Add to the guide');
  const form = el('form', { novalidate: true, class: 'space-y-4' },
    existing ? el('p', { class: 'text-sm muted' }, `Now showing: ${existing.fileName || 'a file'}. The heading and caption stay the same.`) : [
      field('title', 'Heading', { optional: true, placeholder: 'e.g. Your first session', maxlength: 120 }),
      field('body', 'Caption', { type: 'textarea', rows: 3, optional: true, maxlength: 5000, placeholder: 'Shown under the picture' }),
    ],
    el('fieldset', { class: 'space-y-1' }, el('legend', { class: 'label' }, 'Where is the file?'),
      choice('upload', 'Upload from this device'), choice('drive', 'Already in Google Drive')),
    uploadBox, driveBox,
    existing ? null : el('div', {}, el('label', { class: 'label', for: 'f-position' }, 'Where in the guide'),
      el('select', { id: 'f-position', name: 'position', class: 'input' },
        el('option', { value: 'top' }, 'At the top (above everything else)'),
        el('option', { value: 'bottom' }, 'At the bottom'))),
    el('p', { class: 'hint' }, 'You can move it up or down afterwards.'),
    submit);
  const dlg = modal(existing ? 'Replace the infographic' : 'Add an infographic', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = existing ? { sectionId: existing.sectionId } : {
      title: form.title.value.trim(), body: form.body.value.trim(), position: form.position.value,
    };
    if (source === 'drive') {
      const url = form.driveUrl.value.trim();
      if (!url) { toast('Paste the Google Drive link first.', 'warn'); return; }
      payload.driveUrl = url;
    } else {
      const file = fileInput.files && fileInput.files[0];
      if (!file) { toast('Choose a picture or PDF first.', 'warn'); return; }
      if (!FILE_TYPES.includes(file.type)) { toast('Choose a JPG or PNG picture, or a PDF.', 'warn'); return; }
      if (file.size > MAX_MB * 1024 * 1024) { toast(`That file is over ${MAX_MB} MB. Make it smaller first.`, 'warn'); return; }
      payload.fileName = file.name;
      payload.mimeType = file.type;
      payload.file = file;
    }
    busy(submit, payload.file ? 'Uploading…' : 'Saving…', async () => {
      if (payload.file) {
        payload.data = await readAsBase64(payload.file);
        delete payload.file;
      }
      const content = await call('addGuideFile', payload, { timeoutMs: 120000 });
      dlg.close();
      toast(content.message, /may not be able/.test(content.message) ? 'warn' : 'ok');
      onSaved(content);
    });
  });
}

function projectForm(pr, venues, app, onSaved) {
  const save = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, pr ? 'Save project' : 'Add project');
  const venue = venuePicker(app, venues, pr ? pr.venue : '', { optional: true, label: 'Usual venue' });
  const form = el('form', { novalidate: true, class: 'space-y-4' },
    field('name', 'Project name', { value: pr ? pr.name : '', placeholder: 'e.g. Saturday sports club', maxlength: 120 }),
    field('schedule', 'When', { optional: true, value: pr ? pr.schedule : '', placeholder: 'e.g. Saturdays, 9am to 12pm' }),
    labelled('Usual venue', venue.el, { optional: true }),
    field('description', 'What volunteers do', { type: 'textarea', rows: 6, optional: true, value: pr ? pr.description : '', maxlength: 5000, hint: 'Use "- " for bullet points.' }),
    save);
  const dlg = modal(pr ? 'Edit project' : 'New project', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    if (!name) {
      toast('Give the project a name.', 'warn');
      return;
    }
    busy(save, 'Saving…', async () => {
      const content = await call('saveProject', {
        ...(pr ? { projectId: pr.projectId } : {}),
        name, schedule: form.schedule.value.trim(), venue: venue.value, description: form.description.value.trim(),
      });
      dlg.close();
      toast(pr ? 'Project saved.' : `${name} added.`);
      onSaved(content);
    });
  });
}

export function renderGuideEdit(root, app, ctx) {
  const draw = (c) => {
    const redraw = (content) => {
      storage.remove('minds.guide');
      app.updateVenues(content.venues);
      if (ctx.alive()) draw(content);
    };
    const move = (kind, id, direction, btn) => busy(btn, '', async () => redraw(await call('moveContent', { kind, id, direction })));
    const arrows = (kind, id, i, n) => {
      const up = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move up', disabled: i === 0 }, icon('up', 'size-4'));
      const down = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move down', disabled: i === n - 1 }, icon('down', 'size-4'));
      up.addEventListener('click', () => move(kind, id, 'up', up));
      down.addEventListener('click', () => move(kind, id, 'down', down));
      return el('div', { class: 'flex shrink-0 flex-col' }, up, down);
    };

    const sectionRow = (s, i) => {
      const isFile = s.kind === 'image' || s.kind === 'pdf';
      const name = s.title || (isFile ? s.fileName || 'Infographic' : 'Untitled');
      const edit = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'aria-label': `Edit ${name}` }, icon('pencil', 'size-4'), 'Edit');
      edit.addEventListener('click', () => sectionForm(s, redraw));
      const replace = isFile ? el('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'aria-label': `Replace the file for ${name}` }, icon('refresh', 'size-4')) : null;
      if (replace) replace.addEventListener('click', () => infographicForm(s, redraw));
      const del = el('button', { type: 'button', class: 'btn btn-danger btn-sm', 'aria-label': `Delete ${name}` }, icon('trash', 'size-4'));
      del.addEventListener('click', () => {
        if (!confirm(isFile ? `Remove "${name}" from the guide? The file stays in Google Drive.` : `Delete the "${name}" section from the guide?`)) return;
        busy(del, '', async () => { redraw(await call('deleteGuideSection', { sectionId: s.sectionId })); toast(isFile ? 'Infographic removed.' : 'Section deleted.'); });
      });
      const preview = isFile
        ? (s.kind === 'image'
          ? el('img', { src: s.imageUrl, alt: '', loading: 'lazy', class: 'size-12 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-neutral-800' })
          : el('span', { class: 'flex size-12 shrink-0 items-center justify-center rounded-lg bg-red-100 text-xs font-extrabold text-red-700 dark:bg-red-900/40 dark:text-red-300' }, 'PDF'))
        : null;
      return el('div', { class: 'edit-row' },
        arrows('guide', s.sectionId, i, c.sections.length),
        preview,
        el('div', { class: 'edit-row-main' },
          el('p', { class: 'flex flex-wrap items-center gap-1.5 font-bold text-slate-900 dark:text-white' }, name,
            isFile ? badge(s.kind === 'pdf' ? 'PDF' : 'Image', 'purple') : null),
          el('p', { class: 'line-clamp-2 text-sm muted' }, isFile
            ? (s.body || s.fileName || '')
            : s.body.replace(/^[-•*]\s+/gm, '').replace(/\s+/g, ' '))),
        el('div', { class: 'edit-row-actions' }, edit, replace, del));
    };

    const projectRow = (pr, i, all) => {
      const archived = pr.status === 'archived';
      const edit = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('pencil', 'size-4'), 'Edit');
      edit.addEventListener('click', () => projectForm(pr, c.venues, app, redraw));
      const toggle = el('button', { type: 'button', class: `btn btn-sm ${archived ? 'btn-secondary' : 'btn-danger'}` }, archived ? 'Restore' : 'Archive');
      toggle.addEventListener('click', () => {
        if (!archived && !confirm(`Archive ${pr.name}? It disappears from the guide and the session form.`)) return;
        busy(toggle, '', async () => redraw(await call('saveProject', { projectId: pr.projectId, status: archived ? 'active' : 'archived' })));
      });
      const active = all.filter((x) => x.status !== 'archived');
      return el('div', { class: `flex items-center gap-2 p-3 ${archived ? 'opacity-60' : ''}` },
        archived ? el('span', { class: 'w-9' }) : arrows('projects', pr.projectId, active.indexOf(pr), active.length),
        el('div', { class: 'min-w-0 flex-1' },
          el('p', { class: 'flex flex-wrap items-center gap-2 font-bold text-slate-900 dark:text-white' }, pr.name, archived ? badge('Archived', 'slate') : null),
          el('p', { class: 'truncate text-sm muted' }, [pr.schedule, pr.venue].filter(Boolean).join(', ') || 'No schedule or venue yet')),
        edit, toggle);
    };

    const addSection = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('plus', 'size-4'), 'Add text');
    addSection.addEventListener('click', () => sectionForm(null, redraw));
    const addFile = el('button', { type: 'button', class: 'btn btn-primary btn-sm' }, icon('plus', 'size-4'), 'Add infographic');
    addFile.addEventListener('click', () => infographicForm(null, redraw));
    const addProject = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('plus', 'size-4'), 'Add project');
    addProject.addEventListener('click', () => projectForm(null, c.venues, app, redraw));

    mount(root,
      el('h1', { class: 'page-title' }, 'Volunteer guide & projects'),
      el('p', { class: 'mt-1 text-sm muted' }, 'New volunteers read this before their first sign-up. Add text, or an infographic (a picture or a PDF), and use the arrows to order them. Changes show straight away.'),
      el('a', { href: '#/guide', class: 'btn btn-secondary btn-sm mt-3' }, icon('eye', 'size-4'), 'Preview as a volunteer'),
      el('div', { class: 'mt-6 flex flex-wrap items-center justify-between gap-2' }, el('h2', { class: 'group-label m-0' }, `The guide (${c.sections.length})`),
        el('div', { class: 'flex gap-2' }, addSection, addFile)),
      el('div', { class: 'mt-2' }, c.sections.length ? list(c.sections.map(sectionRow)) : el('p', { class: 'text-sm muted' }, 'Nothing in the guide yet.')),
      el('div', { class: 'mt-6 flex items-center justify-between' }, el('h2', { class: 'group-label m-0' }, `Projects (${c.projects.length})`), addProject),
      el('div', { class: 'mt-2' }, c.projects.length ? list(c.projects.map((pr, i, all) => projectRow(pr, i, all))) : el('p', { class: 'text-sm muted' }, 'No projects yet.')));
  };
  mount(root, loading());
  return call('leaderContent').then((c) => { if (ctx.alive()) draw(c); })
    .catch((err) => { if (ctx.alive()) mount(root, errorBlock(err, () => app.rerender())); });
}
