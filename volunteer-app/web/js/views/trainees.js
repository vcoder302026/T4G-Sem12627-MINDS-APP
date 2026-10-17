// Trainees for volunteers: the card on Home, the Trainees tab, one trainee's
// page and the "Add an update" form. Regular volunteers see every trainee (an
// info dump); new volunteers see the trainee(s) they are paired with. What
// each sees is set by admins (Admin → Settings → What volunteers see).
// Also the admin "Notes to review" queue.

import { call, isNetworkError, storage } from '../api.js';
import { photo } from '../media.js';
import {
  backLink, badge, busy, el, errorBlock, field, fmtDay, fuzzyFilter, icon, loading, mount, searchBox, section, toast, todaySG,
} from '../ui.js';

function list(...rows) {
  return el('div', { class: 'card divide-y divide-slate-100 overflow-hidden dark:divide-neutral-900' }, ...rows);
}

const sourceLabel = (source) => (source === 'Leader' || source === 'Admin' ? 'MINDS staff' : 'Volunteer');
const SHOWN_ABOVE = ['preferredName', 'gender', 'communication', 'takeNote'];

function notesBlock(notes, open = false) {
  if (!notes || !notes.length) return null;
  return el('details', { class: 'group border-t border-slate-200 dark:border-neutral-800', open },
    el('summary', { class: 'flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-indigo-700 dark:text-indigo-300' },
      el('span', { class: 'flex items-center gap-2' }, icon('book', 'size-4'), `Notes from previous volunteers (${notes.length})`),
      icon('down', 'size-4 transition-transform group-open:rotate-180')),
    el('ul', { class: 'space-y-3 px-4 pb-4' }, notes.map((n) => el('li', { class: 'border-l-2 border-indigo-200 pl-3 text-sm dark:border-indigo-800' },
      el('p', { class: 'whitespace-pre-line text-slate-700 dark:text-neutral-300' }, n.note),
      el('p', { class: 'mt-0.5 text-xs muted' }, `${n.author || sourceLabel(n.source)}, ${fmtDay(n.date)}`)))));
}

function fieldList(fields) {
  return el('dl', { class: 'mt-3 space-y-2 text-sm' }, fields.map((f) => el('div', {},
    el('dt', { class: 'font-bold text-slate-700 dark:text-neutral-200' }, f.label),
    el('dd', { class: 'whitespace-pre-line text-slate-600 dark:text-neutral-400' }, f.value))));
}

/** The top of a trainee card: photo, name, gender/communication, "things to take note". */
function traineeHead(t, by, big) {
  return [
    el('div', { class: 'flex items-center gap-3' },
      photo(t.photoFileId, t.name, big ? 'size-20' : 'size-14'),
      el('div', { class: 'min-w-0' },
        el('p', { class: `${big ? 'text-2xl' : 'text-lg'} font-bold leading-tight text-slate-900 dark:text-white` }, t.name),
        by.preferredName ? el('p', { class: 'text-sm muted' }, `Goes by ${by.preferredName.value}`) : null,
        by.gender ? el('div', { class: 'mt-1.5' }, badge(by.gender.value, 'slate', 'user')) : null)),
    by.communication ? el('p', { class: 'mt-3 flex gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200' },
      icon('message', 'mt-0.5 size-4'), el('span', {}, el('span', { class: 'font-bold' }, `${by.communication.label}: `), by.communication.value)) : null,
    by.takeNote ? el('div', { class: 'alert alert-warn mt-3 flex gap-2' }, icon('alert', 'mt-0.5 size-4'),
      el('div', {}, el('p', { class: 'font-bold' }, by.takeNote.label), el('p', {}, by.takeNote.value))) : null,
  ];
}

/** What a paired volunteer sees about one trainee (Home and the session cards). */
export function traineeCard(trainee) {
  if (!trainee) return null;
  const by = Object.fromEntries(trainee.fields.map((f) => [f.key, f]));
  const others = trainee.fields.filter((f) => !SHOWN_ABOVE.includes(f.key));
  return el('div', { class: 'well mt-4 overflow-hidden' },
    el('div', { class: 'p-4' },
      el('p', { class: 'mb-2 text-xs font-bold uppercase tracking-wider muted' }, 'You\'re with'),
      traineeHead(trainee, by, false),
      others.length ? fieldList(others) : null,
      trainee.updateFields && trainee.updateFields.length ? el('div', { class: 'mt-3 border-t border-slate-200 pt-3 dark:border-neutral-800' },
        el('p', { class: 'text-xs font-bold uppercase tracking-wider muted' }, `From the latest house visit${trainee.lastVisit ? ` (${fmtDay(trainee.lastVisit)})` : ''}`),
        fieldList(trainee.updateFields)) : null,
      el('div', { class: 'mt-3 flex flex-wrap gap-3 text-sm' },
        el('a', { href: `#/trainee/${encodeURIComponent(trainee.id)}`, class: 'link' }, `Open ${trainee.name.split(' ')[0]}'s page`),
        el('a', { href: `#/update/${encodeURIComponent(trainee.id)}`, class: 'link' }, 'Add an update'))),
    notesBlock(trainee.notes));
}

/** Several trainees on one session card. */
export function traineeCards(trainees) {
  return (trainees || []).map(traineeCard);
}

/** Just the names (with photos), for sessions further ahead: the full cards are on Today and under Trainees. */
export function traineeChips(trainees) {
  if (!trainees || !trainees.length) return null;
  return el('div', { class: 'mt-3 flex flex-wrap items-center gap-2' },
    el('span', { class: 'text-xs font-bold uppercase tracking-wider muted' }, "You're with"),
    trainees.map((t) => el('a', { href: `#/trainee/${encodeURIComponent(t.id)}`, class: 'flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-sm font-bold text-slate-800 hover:border-indigo-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100' },
      photo(t.photoFileId, t.name, 'size-7 rounded-full text-[10px]'), t.name)));
}

/* ---------------- volunteers: the Trainees tab ---------------- */

export function renderMyTrainees(root, app, ctx) {
  let data = storage.get('minds.trainees');
  let query = '';
  const host = el('div', {});
  const drawList = () => {
    if (!data) return;
    const regular = data.type === 'regular';
    const mine = data.trainees.filter((t) => t.pairedBecause);
    const shown = fuzzyFilter(regular ? data.trainees : mine, query, (t) => [t.name, t.preferredName]);
    const row = (t) => el('a', { href: `#/trainee/${encodeURIComponent(t.id)}`, class: 'flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-neutral-900' },
      photo(t.photoFileId, t.name, 'size-12'),
      el('div', { class: 'min-w-0 flex-1' },
        el('p', { class: 'truncate font-bold text-slate-900 dark:text-white' }, t.name, t.preferredName ? el('span', { class: 'font-medium muted' }, ` (${t.preferredName})`) : null),
        t.pairedBecause ? el('p', { class: 'text-xs font-bold text-emerald-700 dark:text-emerald-400' }, t.pairedBecause === 'regular pair' ? 'Your regular trainee' : `With you: ${t.pairedBecause.replace(/^session on (\d{4}-\d{2}-\d{2})$/, (m, d) => fmtDay(d))}`) : null),
      icon('chevron', 'size-5 text-slate-300 dark:text-neutral-700'));
    if (!regular && !mine.length) {
      mount(host, el('div', { class: 'mt-6 flex flex-col items-center rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center muted dark:border-neutral-800' },
        icon('heart', 'mb-3 size-12 text-slate-300 dark:text-neutral-700'),
        el('p', { class: 'font-medium text-slate-900 dark:text-white' }, 'No trainee yet'),
        el('p', { class: 'mt-1 text-sm' }, 'Once a MINDS admin pairs you with a trainee for a session, you can read about them here before the day.'),
        el('p', { class: 'mt-3 text-xs' }, `After ${data.regularAfter} sessions you become a regular volunteer and can see every trainee.`)));
      return;
    }
    mount(host,
      regular ? el('div', { class: 'mt-4' }, searchBox('Search trainees', (q) => { query = q; drawList(); })) : null,
      regular && mine.length && !query ? [el('h2', { class: 'group-label' }, 'Yours'), list(mine.map(row))] : null,
      el('h2', { class: 'group-label' }, regular ? (query ? `${shown.length} match${shown.length === 1 ? '' : 'es'}` : 'All trainees') : 'Your trainees'),
      shown.length ? list((regular && !query ? data.trainees : shown).map(row)) : el('p', { class: 'text-sm muted' }, 'No trainee matches that search.'));
  };
  mount(root,
    el('h1', { class: 'page-title' }, 'Trainees'),
    el('p', { class: 'mt-1 text-sm muted' }, 'Read about a trainee before your session, and add an update after a visit.'),
    host);
  if (data) drawList();
  else mount(host, loading());
  return call('myTrainees').then((d) => {
    data = d;
    storage.set('minds.trainees', d);
    if (ctx.alive()) drawList();
  }).catch((err) => {
    if (!ctx.alive()) return;
    if (!data) mount(host, errorBlock(err, () => app.rerender()));
    else if (!isNetworkError(err)) toast(err.message, 'error');
  });
}

/* ---------------- volunteers: one trainee ---------------- */

export function renderMyTrainee(root, app, ctx, traineeId) {
  const draw = (d) => {
    const t = d.trainee;
    const by = Object.fromEntries(t.fields.map((f) => [f.key, f]));
    const others = t.fields.filter((f) => !SHOWN_ABOVE.includes(f.key));
    mount(root,
      backLink('#/trainees', 'Trainees'),
      el('div', { class: 'card p-5' },
        traineeHead(t, by, true),
        d.pairedBecause ? el('p', { class: 'mt-3 text-sm font-bold text-emerald-700 dark:text-emerald-400' },
          d.pairedBecause === 'regular pair' ? 'Your regular trainee' : `You're with them: ${fmtDay(d.pairedBecause.replace(/^session on /, ''))}`) : null),
      others.length ? el('div', { class: 'mt-4' }, section('About', 'blue', fieldList(others))) : null,
      t.updateFields.length ? el('div', { class: 'mt-4' }, section(`Latest house visit${t.lastVisit ? `, ${fmtDay(t.lastVisit)}` : ''}`, 'green',
        el('dl', { class: 'space-y-2 text-sm' }, t.updateFields.map((f) => el('div', {},
          el('dt', { class: 'font-bold text-slate-700 dark:text-neutral-200' }, f.label),
          el('dd', { class: 'whitespace-pre-line text-slate-600 dark:text-neutral-400' }, f.value,
            f.date && f.date !== t.lastVisit ? el('span', { class: 'ml-1 text-xs muted' }, `(${fmtDay(f.date)})`) : null)))))) : null,
      t.notes.length ? el('div', { class: 'card mt-4 overflow-hidden' }, notesBlock(t.notes, true)) : null,
      !others.length && !t.updateFields.length && !t.notes.length
        ? el('p', { class: 'alert alert-info mt-4' }, 'MINDS has not shared more details about this trainee yet.') : null,
      el('a', { href: `#/update/${encodeURIComponent(t.id)}`, class: 'btn btn-primary mt-6 w-full' }, icon('pencil'), `Add an update about ${t.name.split(' ')[0]}`),
      el('p', { class: 'hint mt-2 text-center' }, t.viewerType === 'regular' ? 'As a regular volunteer you see more details, and can update any trainee.' : 'You see this because you are paired with them.'));
  };
  mount(root, loading());
  return call('myTrainee', { traineeId }).then((d) => { if (ctx.alive()) draw(d); })
    .catch((err) => { if (ctx.alive()) mount(root, backLink('#/trainees', 'Trainees'), errorBlock(err, () => app.rerender())); });
}

/* ---------------- volunteers: add an update ---------------- */

export function renderTraineeUpdate(root, app, ctx, traineeId) {
  const draw = (d) => {
    const t = d.trainee;
    const submit = el('button', { type: 'submit', class: 'btn btn-primary flex-1' }, 'Send update');
    const answers = d.editable.map((f, i) => {
      const long = f.value.length > 40 || /observ|note|follow|remark|comment|arrangement/i.test(f.label);
      const input = field(`q${i}`, f.label, { type: long ? 'textarea' : 'text', rows: 2, value: f.value, optional: true, maxlength: 5000 });
      return { label: f.label, before: f.value, input };
    });
    const form = el('form', { novalidate: true, class: 'space-y-6' },
      d.updatesLinked && answers.length ? section('Update their details', 'blue',
        el('p', { class: 'text-sm muted' }, 'Change only what is different now. Your answers are added to MINDS\'s house-visit records with your name.'),
        field('visitDate', 'Date of the visit or session', { type: 'date', value: todaySG(), max: todaySG() }),
        answers.map((a) => a.input)) : null,
      section('Anything else MINDS should know?', 'green',
        field('note', `A note about ${t.name.split(' ')[0]}`, {
          type: 'textarea', rows: 4, optional: true, maxlength: 5000,
          placeholder: 'e.g. Calmer with a 5-minute warning before changing activity.',
          hint: 'A MINDS admin reads it first, then it is shared with the next volunteers.',
        })),
      el('div', { class: 'h-20' }),
      el('div', { class: 'action-bar' }, el('div', { class: 'mx-auto flex max-w-2xl gap-3' },
        el('a', { href: `#/trainee/${encodeURIComponent(t.id)}`, class: 'btn btn-secondary' }, 'Cancel'), submit)));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const changes = {};
      answers.forEach((a, i) => {
        const v = form[`q${i}`].value.trim();
        if (v !== String(a.before || '').trim()) changes[a.label] = v;
      });
      const note = form.note.value.trim();
      if (!Object.keys(changes).length && !note) {
        toast('Change an answer or write a note first.', 'warn');
        return;
      }
      busy(submit, 'Sending…', async () => {
        const payload = { traineeId: t.id, changes, note };
        if (form.visitDate) payload.visitDate = form.visitDate.value;
        const res = await call('submitTraineeUpdate', payload);
        toast(res.message);
        app.go(`#/trainee/${encodeURIComponent(t.id)}`);
      });
    });
    mount(root,
      backLink(`#/trainee/${encodeURIComponent(t.id)}`, t.name),
      el('h1', { class: 'page-title' }, `Update about ${t.name}`),
      !d.updatesLinked ? el('p', { class: 'alert alert-info mt-3' }, 'MINDS has not linked its house-visit records to the app yet, so you can send a note.') : null,
      el('div', { class: 'mt-5' }, form));
  };
  mount(root, loading());
  return call('myTrainee', { traineeId }).then((d) => { if (ctx.alive()) draw(d); })
    .catch((err) => { if (ctx.alive()) mount(root, backLink('#/trainees', 'Trainees'), errorBlock(err, () => app.rerender())); });
}

/* ---------------- admins: review volunteers' notes ---------------- */

export function renderReview(root, app, ctx) {
  const draw = (q) => {
    const after = (next, message) => {
      app.dropAdminHome();
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
        'Kept private. Admins can still read it in the Feedback tab.')));
      return el('article', { class: 'card p-4' },
        el('div', { class: 'flex items-start justify-between gap-3' },
          el('div', { class: 'min-w-0' },
            el('a', { href: `#/admin/trainee/${encodeURIComponent(it.traineeId)}`, class: 'font-bold text-slate-900 hover:underline dark:text-white' }, it.traineeName),
            el('p', { class: 'text-sm muted' }, `From ${it.volunteerName}, ${fmtDay(it.date)}`)),
          el('div', { class: 'flex flex-wrap justify-end gap-1' },
            badge(it.type === 'Trainee update' ? 'Trainee update' : 'Session feedback', it.type === 'Trainee update' ? 'emerald' : 'indigo'),
            it.rating ? badge(`Session ${it.rating}/5`, 'slate') : null)),
        el('div', { class: 'mt-3' }, text),
        el('p', { class: 'hint' }, 'Edit before sharing if needed, e.g. remove anything private or not helpful to other volunteers.'),
        el('div', { class: 'mt-3 flex gap-2' }, keep, share));
    };
    mount(root,
      el('h1', { class: 'page-title' }, 'Notes to review'),
      el('p', { class: 'mb-4 mt-1 text-sm muted' }, 'What volunteers noticed about trainees, from session feedback and trainee updates. Shared notes appear for the next volunteers paired with that trainee.'),
      q.items.length ? el('div', { class: 'grid gap-3 lg:grid-cols-2' }, q.items.map(item))
        : el('div', { class: 'flex flex-col items-center rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center muted dark:border-neutral-800' },
          icon('inbox', 'mb-3 size-12 text-slate-300 dark:text-neutral-700'),
          el('p', { class: 'font-medium text-slate-900 dark:text-white' }, 'All caught up'),
          el('p', { class: 'mt-1 text-sm' }, 'New observations from volunteers will appear here.')));
  };
  mount(root, loading());
  return call('reviewQueue').then((q) => { if (ctx.alive()) draw(q); })
    .catch((err) => { if (ctx.alive()) mount(root, errorBlock(err, () => app.rerender())); });
}
