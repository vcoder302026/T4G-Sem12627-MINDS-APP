// Trainees: the card a paired volunteer sees, and the leader screens
// (trainee list in People, one trainee's page, and the notes review queue).

import { call } from '../api.js';
import {
  backLink, badge, busy, el, errorBlock, fmtDay, fuzzyFilter, icon, loading, mount, searchBox, toast,
} from '../ui.js';

function list(...rows) {
  return el('div', { class: 'card divide-y divide-slate-100 overflow-hidden dark:divide-neutral-900' }, ...rows);
}

const sourceLabel = (source) => (source === 'Leader' ? 'Leader' : 'Volunteer');

/* ---------------- volunteers: "Your trainee" ---------------- */

/** What a paired volunteer sees about their trainee (only the fields leaders allow). */
export function traineeCard(trainee) {
  if (!trainee) return null;
  const by = Object.fromEntries(trainee.fields.map((f) => [f.key, f]));
  const shownAbove = ['preferredName', 'gender', 'communication', 'takeNote'];
  const others = trainee.fields.filter((f) => !shownAbove.includes(f.key));
  const notes = trainee.notes || [];
  return el('div', { class: 'well mt-4 overflow-hidden' },
    el('div', { class: 'p-4' },
      el('p', { class: 'text-xs font-bold uppercase tracking-wider muted' }, 'Your trainee'),
      el('p', { class: 'mt-0.5 text-lg font-bold text-slate-900 dark:text-white' }, trainee.name,
        by.preferredName ? el('span', { class: 'text-sm font-medium muted' }, ` (goes by ${by.preferredName.value})`) : null),
      by.gender || by.communication ? el('div', { class: 'mt-2 flex flex-wrap gap-1.5' },
        by.gender ? badge(by.gender.value, 'slate', 'user') : null,
        by.communication ? badge(by.communication.value, 'indigo', 'message') : null) : null,
      by.takeNote ? el('div', { class: 'alert alert-warn mt-3 flex gap-2' }, icon('alert', 'mt-0.5 size-4'),
        el('div', {}, el('p', { class: 'font-bold' }, by.takeNote.label), el('p', {}, by.takeNote.value))) : null,
      others.length ? el('dl', { class: 'mt-3 space-y-2 text-sm' }, others.map((f) => el('div', {},
        el('dt', { class: 'font-bold text-slate-700 dark:text-neutral-200' }, f.label),
        el('dd', { class: 'text-slate-600 dark:text-neutral-400' }, f.value)))) : null),
    notes.length ? el('details', { class: 'group border-t border-slate-200 dark:border-neutral-800' },
      el('summary', { class: 'flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-indigo-700 dark:text-indigo-300' },
        el('span', { class: 'flex items-center gap-2' }, icon('book', 'size-4'), `Notes from previous volunteers (${notes.length})`),
        icon('down', 'size-4 transition-transform group-open:rotate-180')),
      el('ul', { class: 'space-y-3 px-4 pb-4' }, notes.map((n) => el('li', { class: 'border-l-2 border-indigo-200 pl-3 text-sm dark:border-indigo-800' },
        el('p', { class: 'whitespace-pre-line text-slate-700 dark:text-neutral-300' }, n.note),
        el('p', { class: 'mt-0.5 text-xs muted' }, `${n.author || sourceLabel(n.source)}, ${fmtDay(n.date)}`))))) : null);
}

/* ---------------- leaders: trainee list (People → Trainees) ---------------- */

export function traineeList(host, app, ctx) {
  let trainees = app.cachedTrainees();
  let query = '';
  const listHost = el('div', { class: 'mt-4' });
  const drawList = () => {
    if (!trainees) return;
    const shown = fuzzyFilter(trainees, query, (t) => [t.name, t.preferredName, t.id, t.gender, t.communication]);
    const active = trainees.filter((t) => t.active).length;
    mount(listHost,
      el('p', { class: 'mb-2 text-xs font-bold uppercase tracking-wider muted' }, `${trainees.length} trainees, ${active} active`),
      shown.length ? list(shown.map((t) => el('a', { href: `#/trainee/${encodeURIComponent(t.id)}`, class: `flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-neutral-900 ${t.active ? '' : 'opacity-60'}` },
        el('span', { class: 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }, icon('heart', 'size-5')),
        el('div', { class: 'min-w-0 flex-1' },
          el('p', { class: 'truncate font-bold text-slate-900 dark:text-white' }, t.name, t.preferredName ? el('span', { class: 'font-medium muted' }, ` (${t.preferredName})`) : null),
          el('div', { class: 'mt-1 flex flex-wrap gap-1' },
            badge(t.id, 'slate'),
            t.gender ? badge(t.gender, 'slate') : null,
            t.communication ? badge(t.communication, 'indigo') : null,
            t.noteCount ? badge(`${t.noteCount} note${t.noteCount === 1 ? '' : 's'}`, 'emerald') : null,
            t.active ? null : badge('Not active', 'red'))),
        icon('chevron', 'size-5 text-slate-300 dark:text-neutral-700'))))
        : el('p', { class: 'text-sm muted' }, 'No trainee matches that search.'));
  };
  mount(host,
    searchBox('Search trainees by name, ID or communication', (q) => { query = q; drawList(); }),
    listHost,
    el('p', { class: 'hint mt-3' }, 'Trainee details come from the trainee Google Sheet. Edit them there; they show here straight away.'));
  if (trainees) drawList();
  else mount(listHost, loading());
  return call('listTrainees').then((res) => {
    trainees = res.trainees;
    app.cacheTrainees(trainees);
    if (ctx.alive()) drawList();
  }).catch((err) => { if (ctx.alive() && !trainees) mount(listHost, errorBlock(err, () => app.rerender())); });
}

/* ---------------- leaders: one trainee ---------------- */

export function renderTrainee(root, app, ctx, traineeId) {
  const draw = (d) => {
    const t = d.trainee;
    const apply = (next) => { app.dropTrainees(); if (ctx.alive()) draw(next); };

    const noteRow = (n) => {
      const hidden = n.status === 'hidden';
      const toggle = el('button', { type: 'button', class: 'text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400' }, hidden ? 'Show to volunteers' : 'Hide from volunteers');
      toggle.addEventListener('click', () => busy(toggle, '', async () => {
        apply(await call('setNoteStatus', { noteId: n.noteId, status: hidden ? 'shared' : 'hidden' }));
        toast(hidden ? 'Note shown to volunteers again.' : 'Note hidden from volunteers.');
      }));
      return el('div', { class: `p-4 ${hidden ? 'opacity-60' : ''}` },
        el('p', { class: 'whitespace-pre-line text-sm text-slate-800 dark:text-neutral-200' }, n.note),
        el('div', { class: 'mt-2 flex flex-wrap items-center gap-2 text-xs muted' },
          el('span', {}, `${n.author}, ${fmtDay(n.date)}`),
          badge(sourceLabel(n.source), n.source === 'Leader' ? 'purple' : 'indigo'),
          hidden ? badge('Hidden', 'slate', 'eyeOff') : null,
          el('span', { class: 'ml-auto' }, toggle)));
    };

    const noteBox = el('textarea', { class: 'input min-h-[90px]', rows: 3, maxlength: 5000, placeholder: `e.g. ${t.name} enjoys helping set up; give a 5-minute warning before tidying up.`, 'aria-label': 'New note' });
    const addBtn = el('button', { type: 'button', class: 'btn btn-primary btn-sm mt-2' }, icon('plus', 'size-4'), 'Add note');
    addBtn.addEventListener('click', () => {
      const note = noteBox.value.trim();
      if (!note) {
        toast('Write the note first.', 'warn');
        noteBox.focus();
        return;
      }
      busy(addBtn, 'Saving…', async () => {
        apply(await call('addTraineeNote', { traineeId: t.id, note }));
        toast('Note added. Future volunteers paired with this trainee will see it.');
      });
    });

    mount(root,
      backLink('#/people/trainees', 'Trainees'),
      el('div', { class: 'card p-5' },
        el('h1', { class: 'text-xl font-extrabold text-slate-900 dark:text-white' }, t.name),
        el('div', { class: 'mt-1.5 flex flex-wrap gap-1' }, badge(t.id, 'slate'), t.active ? badge('Active', 'emerald') : badge('Not active: not paired automatically', 'red'))),
      el('h2', { class: 'group-label' }, 'Details'),
      t.fields.length ? list(t.fields.map((f) => el('div', { class: 'p-3' },
        el('div', { class: 'flex items-center justify-between gap-2' },
          el('p', { class: 'text-xs font-bold uppercase tracking-wider muted' }, f.label),
          f.visibleToVolunteers ? badge('Volunteer sees', 'indigo', 'eye') : badge('Leaders only', 'slate', 'eyeOff')),
        el('p', { class: 'mt-0.5 whitespace-pre-line text-sm text-slate-800 dark:text-neutral-200' }, f.value))))
        : el('p', { class: 'text-sm muted' }, 'No details in the trainee sheet yet.'),
      el('p', { class: 'hint mt-2' }, 'Change these in the trainee Google Sheet. "Volunteer sees" fields are set in Config.gs.'),
      el('h2', { class: 'group-label' }, `Notes for volunteers (${d.notes.length})`),
      el('div', { class: 'card p-4' }, noteBox, addBtn),
      d.notes.length ? el('div', { class: 'mt-3' }, list(d.notes.map(noteRow))) : null,
      d.pairings.length ? [
        el('h2', { class: 'group-label' }, 'Recent pairings'),
        list(d.pairings.map((p) => el('div', { class: 'flex items-center justify-between gap-3 p-3 text-sm' },
          el('span', { class: 'min-w-0 truncate' }, el('span', { class: 'font-bold' }, p.volunteerName), el('span', { class: 'muted' }, `, ${p.sessionTitle}`)),
          el('span', { class: 'shrink-0 muted' }, fmtDay(p.date))))),
      ] : null);
  };
  mount(root, loading());
  return call('traineeDetail', { traineeId }).then((d) => { if (ctx.alive()) draw(d); })
    .catch((err) => { if (ctx.alive()) mount(root, backLink('#/people/trainees', 'Trainees'), errorBlock(err, () => app.rerender())); });
}

/* ---------------- leaders: review volunteers' observations ---------------- */

export function renderReview(root, app, ctx) {
  const draw = (q) => {
    const after = (next, message) => {
      app.dropAdminHome();
      app.dropTrainees();
      toast(message);
      if (ctx.alive()) draw(next);
    };
    const item = (it) => {
      const text = el('textarea', { class: 'input min-h-[110px]', rows: 4, maxlength: 5000, 'aria-label': `Note about ${it.traineeName}` });
      text.value = it.observation;
      const share = el('button', { type: 'button', class: 'btn btn-success btn-sm flex-1' }, icon('tick', 'size-4'), 'Share with future volunteers');
      const keep = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, 'Keep private');
      share.addEventListener('click', () => {
        const note = text.value.trim();
        if (!note) {
          toast('The note is empty. Use Keep private instead.', 'warn');
          return;
        }
        busy(share, 'Sharing…', async () => after(await call('reviewObservation', { feedbackId: it.feedbackId, decision: 'share', note }),
          `Added to ${it.traineeName}'s notes.`));
      });
      keep.addEventListener('click', () => busy(keep, 'Saving…', async () => after(await call('reviewObservation', { feedbackId: it.feedbackId, decision: 'private' }),
        'Kept private. Leaders can still read it in the Feedback tab.')));
      return el('article', { class: 'card p-4' },
        el('div', { class: 'flex items-start justify-between gap-3' },
          el('div', { class: 'min-w-0' },
            el('a', { href: `#/trainee/${encodeURIComponent(it.traineeId)}`, class: 'font-bold text-slate-900 hover:underline dark:text-white' }, it.traineeName),
            el('p', { class: 'text-sm muted' }, `From ${it.volunteerName}, ${fmtDay(it.date)}`)),
          it.rating ? badge(`Session ${it.rating}/5`, 'slate') : null),
        el('div', { class: 'mt-3' }, text),
        el('p', { class: 'hint' }, 'Edit before sharing if needed, e.g. remove anything private or not helpful to other volunteers.'),
        el('div', { class: 'mt-3 flex gap-2' }, keep, share));
    };
    mount(root,
      backLink('#/today', 'Sessions'),
      el('h1', { class: 'page-title' }, 'Notes to review'),
      el('p', { class: 'mb-4 mt-1 text-sm muted' }, 'What volunteers noticed about their trainee. Shared notes appear for the next volunteers paired with that trainee.'),
      q.items.length ? el('div', { class: 'space-y-3' }, q.items.map(item))
        : el('div', { class: 'flex flex-col items-center rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center muted dark:border-neutral-800' },
          icon('inbox', 'mb-3 size-12 text-slate-300 dark:text-neutral-700'),
          el('p', { class: 'font-medium text-slate-900 dark:text-white' }, 'All caught up'),
          el('p', { class: 'mt-1 text-sm' }, 'New observations from volunteers will appear here.')));
  };
  mount(root, loading());
  return call('reviewQueue').then((q) => { if (ctx.alive()) draw(q); })
    .catch((err) => { if (ctx.alive()) mount(root, errorBlock(err, () => app.rerender())); });
}
