// The Volunteer Guide (what new volunteers read before their first session),
// and the admin screens that edit it: guide sections (text, a picture or a
// PDF, or the built-in "On the day" infographic), projects and venues.

import { call, isNetworkError, storage } from '../api.js';
import { chooseUpload, forgetFile, openPdf, picture } from '../media.js';
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

/** A section's picture, PDF or the built-in infographic. */
export function mediaBlock(media, title) {
  if (!media) return null;
  if (media.kind === 'builtin') return el('img', { src: media.src, alt: `${title}: infographic`, class: 'w-full rounded-xl border border-slate-200 bg-white dark:border-neutral-800', loading: 'lazy' });
  if (media.kind === 'image') return picture(media.fileId, `${title}: picture`);
  const btn = el('button', { type: 'button', class: 'btn btn-secondary w-full' }, icon('file'), `Open ${media.name || 'the PDF'}`);
  btn.addEventListener('click', () => openPdf(media.fileId));
  return btn;
}

/* ---------------- volunteers: read the guide ---------------- */

export function renderGuide(root, app, ctx) {
  const draw = (g) => {
    const read = Boolean(g.guideReadAt);
    const [first, ...rest] = g.sections;
    const sectionCard = (s, i) => section(s.title, COLOURS[i % COLOURS.length], s.body ? richText(s.body) : null, mediaBlock(s.media, s.title));
    let footer;
    if (read) {
      footer = el('div', { class: 'mt-6 space-y-3 text-center' },
        el('p', { class: 'text-sm muted' }, `You read this guide on ${String(g.guideReadAt).slice(0, 10)}. MINDS updates it from time to time.`),
        el('a', { href: '#/schedule', class: 'btn btn-primary w-full' }, icon('calendar'), 'Open the schedule'),
        app.isAdmin ? el('a', { href: '#/admin/guide', class: 'btn btn-secondary w-full' }, icon('pencil'), 'Edit the guide') : null);
    } else {
      const done = el('button', { type: 'button', class: 'btn btn-success w-full' }, icon('tick'), "I've read the guide");
      done.addEventListener('click', () => busy(done, 'Saving…', async () => {
        const res = await call('acknowledgeGuide');
        storage.set('minds.guide', { ...g, guideReadAt: new Date().toISOString().slice(0, 10) });
        app.saveHome(res.home);
        toast(res.message);
        app.go('#/schedule');
      }));
      footer = [
        el('div', { class: 'h-24' }),
        el('div', { class: 'action-bar' }, el('div', { class: 'mx-auto max-w-2xl' }, done)),
      ];
    }
    mount(root,
      backLink('#/home', 'Home'),
      el('div', { class: 'mb-5 flex items-center gap-3' },
        el('span', { class: 'flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }, icon('book', 'size-6')),
        el('div', {},
          el('h1', { class: 'page-title' }, 'Volunteer Guide'),
          el('p', { class: 'text-sm muted' }, read ? 'Everything you need to know before a session.' : 'Please read this before your first session. It takes about 3 minutes.'))),
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
    field('venueNotes', 'Notes for staff', { type: 'textarea', optional: true, rows: 2, value: venue ? venue.notes : '', placeholder: 'Where to meet, parking, who to call' }),
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
    backLink('#/admin/guide', 'Guide & venues'),
    el('div', { class: 'flex items-center justify-between gap-3' }, el('h1', { class: 'page-title' }, 'Venues'), add),
    el('p', { class: 'mb-4 mt-1 text-sm muted' }, 'These appear in the venue dropdown when you create a session.'),
    searchBox('Search venues', (q) => { query = q; drawList(); }),
    host);
  mount(host, loading());
  return load();
}

/* ---------------- admins: edit the guide and projects ---------------- */

function sectionForm(s, onSaved) {
  const save = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, s ? 'Save section' : 'Add section');
  const form = el('form', { novalidate: true, class: 'space-y-4' },
    field('title', 'Heading', { value: s ? s.title : '', placeholder: 'e.g. What to wear', maxlength: 120 }),
    field('body', 'Content', {
      type: 'textarea', rows: 10, value: s ? s.body : '', maxlength: 5000, optional: Boolean(s),
      hint: 'Start a line with "- " for a bullet point or "1. " for a numbered step. Leave an empty line between paragraphs. A section can also show a picture or a PDF: add it from the list after saving.',
    }),
    save);
  const dlg = modal(s ? 'Edit guide section' : 'New guide section', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    const body = form.body.value.trim();
    if (!title || (!body && !(s && s.media))) {
      toast(s && !s.media ? 'Add some content, or a picture or PDF from the list.' : 'Add a heading and some content.', 'warn');
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
      const edit = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('pencil', 'size-4'), 'Edit');
      edit.addEventListener('click', () => sectionForm(s, redraw));
      const del = el('button', { type: 'button', class: 'btn btn-danger btn-sm', 'aria-label': `Delete ${s.title}` }, icon('trash', 'size-4'));
      del.addEventListener('click', () => {
        if (!confirm(`Delete the "${s.title}" section from the guide?`)) return;
        busy(del, '', async () => { redraw(await call('deleteGuideSection', { sectionId: s.sectionId })); toast('Section deleted.'); });
      });
      const upload = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('upload', 'size-4'), s.media ? 'Replace picture/PDF' : 'Add picture/PDF');
      upload.addEventListener('click', async () => {
        let file;
        try {
          file = await chooseUpload('image/png,image/jpeg,image/webp,image/gif,application/pdf');
        } catch (err) {
          toast(err.message, 'error');
          return;
        }
        if (!file) return;
        busy(upload, 'Uploading…', async () => {
          const res = await call('uploadGuideMedia', { sectionId: s.sectionId, ...file });
          if (s.media) forgetFile(s.media.fileId);
          redraw(res);
          toast(res.message);
        });
      });
      let removeMedia = null;
      if (s.media) {
        removeMedia = el('button', { type: 'button', class: 'text-xs font-bold text-red-600 hover:underline dark:text-red-400' }, s.media.kind === 'builtin' ? 'Remove infographic' : 'Remove');
        removeMedia.addEventListener('click', () => {
          if (!confirm(`Remove the ${s.media.kind === 'pdf' ? 'PDF' : 'picture'} from "${s.title}"?`)) return;
          busy(removeMedia, '', async () => { const res = await call('removeGuideMedia', { sectionId: s.sectionId }); redraw(res); toast(res.message); });
        });
      }
      const mediaLabel = s.media
        ? el('p', { class: 'mt-1 flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400' },
          icon(s.media.kind === 'pdf' ? 'file' : 'image', 'size-4'),
          s.media.kind === 'builtin' ? 'Built-in infographic' : s.media.name, removeMedia ? ' · ' : null, removeMedia)
        : null;
      return el('div', { class: 'flex flex-col gap-2 p-3 sm:flex-row sm:items-center' },
        el('div', { class: 'flex min-w-0 flex-1 items-center gap-2' },
          arrows('guide', s.sectionId, i, c.sections.length),
          el('div', { class: 'min-w-0 flex-1' },
            el('p', { class: 'font-bold text-slate-900 dark:text-white' }, s.title),
            s.body ? el('p', { class: 'line-clamp-2 text-sm muted' }, s.body.replace(/^[-•*]\s+/gm, '').replace(/\s+/g, ' ')) : null,
            mediaLabel)),
        el('div', { class: 'flex flex-wrap gap-2 pl-11 sm:pl-0' }, upload, edit, del));
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

    const addSection = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('plus', 'size-4'), 'Add section');
    addSection.addEventListener('click', () => sectionForm(null, redraw));
    const addProject = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, icon('plus', 'size-4'), 'Add project');
    addProject.addEventListener('click', () => projectForm(null, c.venues, app, redraw));

    mount(root,
      el('h1', { class: 'page-title' }, 'Guide & venues'),
      el('p', { class: 'mt-1 text-sm muted' }, 'New volunteers read the guide before their first session. Changes show straight away.'),
      el('div', { class: 'mt-3 flex flex-wrap gap-2' },
        el('a', { href: '#/guide', class: 'btn btn-secondary btn-sm' }, icon('eye', 'size-4'), 'Preview as a volunteer'),
        el('a', { href: '#/admin/venues', class: 'btn btn-secondary btn-sm' }, icon('building', 'size-4'), 'Venues')),
      el('div', { class: 'mt-6 flex items-center justify-between' }, el('h2', { class: 'group-label m-0' }, `Guide sections (${c.sections.length})`), addSection),
      el('div', { class: 'mt-2' }, c.sections.length ? list(c.sections.map(sectionRow)) : el('p', { class: 'text-sm muted' }, 'No sections yet.')),
      el('div', { class: 'mt-6 flex items-center justify-between' }, el('h2', { class: 'group-label m-0' }, `Projects (${c.projects.length})`), addProject),
      el('div', { class: 'mt-2' }, c.projects.length ? list(c.projects.map((pr, i, all) => projectRow(pr, i, all))) : el('p', { class: 'text-sm muted' }, 'No projects yet.')));
  };
  mount(root, loading());
  return call('leaderContent').then((c) => { if (ctx.alive()) draw(c); })
    .catch((err) => { if (ctx.alive()) mount(root, errorBlock(err, () => app.rerender())); });
}
