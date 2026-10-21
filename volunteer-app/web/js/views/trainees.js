// Trainees for volunteers: the card on an upcoming session, a trainee's page
// (#/info/<id>: regulars can open any trainee, volunteers only their paired
// one, each seeing what admins allow), the regulars' trainee list
// (#/directory), and the admins' review queue for volunteer notes.

import { call } from '../api.js';
import {
  backLink, badge, busy, el, errorBlock, field, fmtDay, fmtTimes, fuzzyFilter, icon, loading, mount, searchBox, toast, traineeAvatar,
} from '../ui.js';
import { asTrainee, personName, traineeName } from '../quickview.js';

function list(...rows) {
  return el('div', { class: 'card divide-y divide-slate-100 overflow-hidden dark:divide-neutral-900' }, ...rows);
}

const sourceLabel = (source) => (source === 'Leader' ? 'Admin' : 'Volunteer');

function notesList(notes) {
  return el('ul', { class: 'space-y-3' }, notes.map((n) => el('li', { class: 'border-l-2 border-indigo-200 pl-3 text-sm dark:border-indigo-800' },
    el('p', { class: 'whitespace-pre-line text-slate-700 dark:text-neutral-300' }, n.note),
    el('p', { class: 'mt-0.5 text-xs muted' }, `${n.author || sourceLabel(n.source)}, ${fmtDay(n.date)}`))));
}

/* ---------------- "Your trainee" on a session ---------------- */

/** What a paired volunteer sees about their trainee on Home (only the details admins allow). */
export function traineeCard(trainee, pairing) {
  if (!trainee) return null;
  const notes = trainee.notes || [];
  return el('div', { class: 'well mt-4 overflow-hidden' },
    el('div', { class: 'p-4' },
      el('div', { class: 'flex items-center gap-3' },
        traineeAvatar(trainee, 'md'),
        el('div', { class: 'min-w-0 flex-1' },
          el('p', { class: 'text-xs font-bold uppercase tracking-wider muted' }, pairing === 'standing' ? 'Your regular trainee' : 'Your trainee'),
          el('p', { class: 'mt-0.5 text-lg font-bold text-slate-900 dark:text-white' }, traineeName(trainee.name, trainee.id),
            trainee.preferredName && trainee.preferredName !== trainee.name ? el('span', { class: 'text-sm font-medium muted' }, ` (goes by ${trainee.preferredName})`) : null)),
        trainee.gender ? badge(trainee.gender, 'slate', 'user') : null),
      trainee.fields.length ? el('dl', { class: 'mt-3 space-y-2 text-sm' }, trainee.fields.map((f) => el('div', {},
        el('dt', { class: 'font-bold text-slate-700 dark:text-neutral-200' }, f.label),
        el('dd', { class: 'whitespace-pre-line text-slate-600 dark:text-neutral-400' }, f.value)))) : null,
      el('a', { href: `#/info/${encodeURIComponent(trainee.id)}`, class: 'btn btn-secondary btn-sm mt-3' }, icon('eye', 'size-4'),
        trainee.moreDetails ? 'See all details and notes' : 'Open profile')),
    notes.length ? el('details', { class: 'group border-t border-slate-200 dark:border-neutral-800' },
      el('summary', { class: 'flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-indigo-700 dark:text-indigo-300' },
        el('span', { class: 'flex items-center gap-2' }, icon('book', 'size-4'), `Notes from previous volunteers (${notes.length})`),
        icon('down', 'size-4 transition-transform group-open:rotate-180')),
      el('div', { class: 'px-4 pb-4' }, notesList(notes))) : null);
}

/**
 * One line instead of the full card: for regulars, whose trainee's details are
 * shown once at the top of Home rather than on every session.
 */
export function traineeLine(trainee, pairing) {
  if (!trainee) return null;
  return el('a', { href: `#/info/${encodeURIComponent(trainee.id)}`, class: 'well mt-3 flex items-center gap-3 p-3 hover:shadow-sm' },
    traineeAvatar(trainee, 'sm'),
    el('span', { class: 'min-w-0 flex-1' },
      el('span', { class: 'block text-xs font-bold uppercase tracking-wider muted' }, pairing === 'standing' ? 'With your regular trainee' : 'With'),
      traineeName(trainee.name, trainee.id, 'block truncate font-bold text-slate-900 dark:text-white')),
    icon('chevron', 'size-5 text-slate-400'));
}

/* ---------------- a trainee's page (volunteers and regulars) ---------------- */

function updateForm(trainee, onSent) {
  const form = el('form', { class: 'space-y-3', novalidate: true },
    field('note', `Something the next volunteer should know about ${trainee.preferredName || trainee.name}`, {
      type: 'textarea', rows: 3, maxlength: 5000,
      placeholder: 'e.g. Calmer with a 5-minute warning before changing activity.',
      hint: 'An admin reads it first, then adds it to the notes other volunteers see.',
    }),
    el('button', { type: 'submit', class: 'btn btn-primary w-full' }, icon('send', 'size-4'), 'Send update'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const note = form.note.value.trim();
    if (!note) { toast('Write your update first.', 'warn'); return; }
    busy(form.querySelector('button[type=submit]'), 'Sending…', async () => {
      const res = await call('submitTraineeUpdate', { traineeId: trainee.id, note });
      form.reset();
      toast(res.message);
      if (onSent) onSent();
    });
  });
  return form;
}

export function renderTraineeInfo(root, app, ctx, traineeId) {
  const back = app.isRegular && !app.isAdmin ? backLink('#/directory', 'Trainees') : backLink('#/home', 'Home');
  const draw = (d) => {
    const t = d.trainee;
    mount(root, back,
      el('div', { class: 'flex items-center gap-4' },
        traineeAvatar(t, 'lg'),
        el('div', { class: 'min-w-0' },
          el('h1', { class: 'page-title leading-tight' }, t.name),
          t.preferredName && t.preferredName !== t.name ? el('p', { class: 'mt-1 muted' }, `Goes by ${t.preferredName}`) : null,
          d.isMyRegular ? el('div', { class: 'mt-1.5' }, badge('Your regular trainee', 'emerald', 'heart')) : null)),
      d.regulars.length ? el('p', { class: 'mt-2 text-sm muted' }, `Regular volunteers: ${d.regulars.join(', ')}`) : null,
      d.together.length ? el('div', { class: 'alert alert-info mt-4' },
        el('p', { class: 'font-bold' }, "You're paired for:"),
        el('ul', { class: 'mt-1 list-disc pl-5' }, d.together.map((s) => el('li', {}, `${s.title}, ${fmtDay(s.date)}${s.startTime ? `, ${fmtTimes(s)}` : ''}`)))) : null,
      d.access === 'admin' ? el('p', { class: 'alert alert-info mt-4' }, 'You see every detail as an admin. ',
        el('a', { href: `#/trainee/${encodeURIComponent(t.id)}`, class: 'link' }, 'Open the admin profile')) : null,
      d.sections.length ? d.sections.map((s) => el('details', { class: 'card group mt-3 overflow-hidden', open: true },
        el('summary', { class: 'section-head section-blue cursor-pointer list-none select-none' }, s.title,
          icon('down', 'size-5 transition-transform duration-200 group-open:rotate-180')),
        el('dl', { class: 'divide-y divide-slate-100 px-4 text-sm dark:divide-neutral-800' }, s.fields.map((f) => el('div', { class: 'py-2.5' },
          el('dt', { class: 'font-bold text-slate-700 dark:text-neutral-200' }, f.label),
          el('dd', { class: 'mt-0.5 whitespace-pre-line text-slate-600 dark:text-neutral-400' }, f.value))))))
        : el('p', { class: 'alert alert-warn mt-4' }, 'No details are shared for this trainee yet.'),
      el('h2', { class: 'group-label' }, 'Notes from volunteers and admins'),
      d.notes.length ? el('div', { class: 'card p-4' }, notesList(d.notes)) : el('p', { class: 'text-sm muted' }, 'No notes yet.'),
      el('h2', { class: 'group-label' }, 'Send an update'),
      el('div', { class: 'card p-4' }, updateForm(t)));
  };
  mount(root, loading());
  return call('traineeInfo', { traineeId }).then((d) => { if (ctx.alive()) draw(d); })
    .catch((err) => { if (ctx.alive()) mount(root, back, errorBlock(err, () => app.rerender())); });
}

/* ---------------- regulars: every trainee ---------------- */

export function renderDirectory(root, app, ctx) {
  let data = null;
  let query = '';
  const host = el('div', { class: 'mt-4' });
  const row = (t, mine) => asTrainee(el('a', { href: `#/info/${encodeURIComponent(t.id)}`, class: `flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-neutral-900 ${mine ? 'select-ring' : ''}` },
    traineeAvatar(t, 'sm'),
    el('span', { class: 'min-w-0 flex-1' },
      el('span', { class: 'block truncate font-bold text-slate-900 dark:text-white' }, t.name),
      el('span', { class: 'block truncate text-sm muted' }, [t.preferredName && t.preferredName !== t.name ? `Goes by ${t.preferredName}` : '', t.gender,
        t.regulars.length ? `Regular: ${t.regulars.join(', ')}` : 'No regular volunteer yet'].filter(Boolean).join(' · '))),
    mine ? badge('Yours', 'emerald') : icon('chevron', 'size-5 text-slate-300 dark:text-neutral-700')), t.id);
  const draw = () => {
    if (!data) return;
    const shown = fuzzyFilter(data.trainees, query, (t) => [t.name, t.preferredName, t.id, t.regulars.join(' ')]);
    const mine = data.trainees.find((t) => t.id === data.myTraineeId);
    mount(host,
      mine && !query ? [el('h2', { class: 'group-label mt-0' }, 'Your regular trainee'), list(row(mine, true))] : null,
      el('h2', { class: 'group-label' }, `${shown.length} trainee${shown.length === 1 ? '' : 's'}`),
      shown.length ? list(shown.map((t) => row(t, false))) : el('p', { class: 'text-sm muted' }, 'No trainee matches that search.'));
  };
  mount(root,
    el('h1', { class: 'page-title' }, 'Trainees'),
    el('p', { class: 'mb-4 mt-1 text-sm muted' }, 'As a regular volunteer you can read about any trainee and send updates about them.'),
    searchBox('Search by name', (q) => { query = q; draw(); }, 'Search trainees'),
    host);
  mount(host, loading());
  return call('traineeDirectory').then((d) => { data = d; if (ctx.alive()) draw(); })
    .catch((err) => { if (ctx.alive()) mount(host, errorBlock(err, () => app.rerender())); });
}

/* ---------------- admins: review volunteers' notes ---------------- */

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
        'Kept private. Admins can still read it in the Feedback tab.')));
      return el('article', { class: 'card p-4' },
        el('div', { class: 'flex items-start justify-between gap-3' },
          el('div', { class: 'min-w-0' },
            el('a', { href: `#/trainee/${encodeURIComponent(it.traineeId)}`, class: 'font-bold text-slate-900 hover:underline dark:text-white' }, traineeName(it.traineeName, it.traineeId)),
            el('p', { class: 'text-sm muted' }, 'From ', personName(it.volunteerName, it.userId), `, ${fmtDay(it.date)}`)),
          it.rating ? badge(`Session ${it.rating}/5`, 'slate') : null),
        el('div', { class: 'mt-3' }, text),
        el('p', { class: 'hint' }, 'Edit before sharing if needed, e.g. remove anything private or not helpful to other volunteers.'),
        el('div', { class: 'mt-3 flex gap-2' }, keep, share));
    };
    mount(root,
      el('h1', { class: 'page-title' }, 'Notes to review'),
      el('p', { class: 'mb-4 mt-1 text-sm muted' }, 'Session feedback and updates volunteers sent about trainees. Shared notes appear for the next volunteers paired with that trainee.'),
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
