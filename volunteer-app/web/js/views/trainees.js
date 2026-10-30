// Trainees for volunteers: the one-line trainee on Home, a trainee's page
// (#/info/<id>: regulars can open any trainee, volunteers only their paired
// one, each seeing what admins allow), the regulars' trainee list
// (#/directory), and the admins' review queue for volunteer notes.

import { call } from '../api.js';
import {
  attachmentList, attachPicker, backLink, badge, hvJump, busy, el, errorBlock, field, fmtDay, fmtTimes, fuzzyFilter, hvSections, icon, loading, modal, mount, multiPick, searchBox, toast, traineeAvatar,
} from '../ui.js';
import { asTrainee, personName, traineeName } from '../quickview.js';

function list(...rows) {
  return el('div', { class: 'card divide-y divide-slate-100 overflow-hidden dark:divide-neutral-900' }, ...rows);
}

const sourceLabel = (source) => (source === 'Leader' ? 'Admin' : 'Volunteer');

/* ---------------- who can read a note ---------------- */

const AUDIENCE_BADGE = {
  all: ['All volunteers', 'emerald'],
  regular: ['Regulars only', 'purple'],
  selected: ['Selected volunteers', 'indigo'],
  private: ['Private: admins only', 'slate'],
};

/** A badge saying who can read a note (for admins). */
export function audienceBadge(n) {
  const [text, tone] = AUDIENCE_BADGE[n.audience] || AUDIENCE_BADGE.all;
  const who = n.audience === 'selected' ? (n.sharedWith || []) : [];
  const b = badge(n.audience === 'selected' ? 'Shared with selected volunteers' : text, tone, n.audience === 'private' ? 'eyeOff' : 'eye');
  b.classList.add('whitespace-normal');
  if (who.length) {
    // Press and hold (or right-click, or Enter) to see who was picked.
    const names = who.map((x) => x.name).join(', ');
    b.title = `Shared with ${names}`;
    b.setAttribute('role', 'button');
    b.setAttribute('tabindex', '0');
    b.setAttribute('aria-label', `Shared with selected volunteers: ${names}. Press and hold to see them.`);
    b.classList.add('hold-badge');
    onHold(b, () => sharedWithCard(who));
  }
  return b;
}

/** Calls open() on press and hold (half a second), right-click, or Enter / Space. */
function onHold(target, open) {
  let timer = null;
  let start = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  target.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    start = { x: e.clientX, y: e.clientY };
    cancel();
    timer = setTimeout(() => { timer = null; if (navigator.vibrate) navigator.vibrate(20); open(); }, 500);
  });
  target.addEventListener('pointermove', (e) => { if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => target.addEventListener(t, cancel));
  target.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); open(); });
  target.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
}

/** Who a "selected volunteers" note is shared with. */
function sharedWithCard(who) {
  modal('Shared with', el('ul', { class: 'divide-y divide-slate-100 dark:divide-neutral-800' },
    who.map((x) => el('li', { class: 'py-2.5 text-sm font-bold' }, personName(x.name, x.userId)))));
}

/**
 * The four ways a note can be shared, as radio cards; "selected volunteers"
 * opens a fuzzy search to pick several people. get() returns
 * { audience, userIds } or null (with a toast) when nobody is picked.
 */
export function shareChooser({ audiences, volunteers, audience = 'all', userIds = [], name = 'share' }) {
  let value = audience;
  let picked = userIds.slice();
  const pickHost = el('div', { class: 'mt-2', hidden: value !== 'selected' });
  const picker = multiPick({
    name: `${name}-people`,
    options: volunteers.map((v) => ({ value: v.userId, label: v.name, hint: v.type === 'regular' ? 'Regular' : 'Volunteer' })),
    values: picked,
    placeholder: 'Search volunteers by name',
    noneText: 'Pick one or more volunteers',
    onChange: (ids) => { picked = ids; },
  });
  mount(pickHost, picker.el);
  const opts = audiences.map((a) => {
    const radio = el('input', { type: 'radio', name, value: a.key, checked: a.key === value });
    radio.addEventListener('change', () => { if (radio.checked) { value = a.key; pickHost.hidden = value !== 'selected'; } });
    return el('label', { class: 'share-opt' }, radio,
      el('span', { class: 'min-w-0' }, el('span', { class: 'block text-sm font-bold' }, a.label)));
  });
  return {
    el: el('div', { class: 'space-y-2' }, opts, pickHost),
    get() {
      if (value === 'selected' && !picked.length) { toast('Pick at least one volunteer to share it with.', 'warn'); return null; }
      return { audience: value, userIds: value === 'selected' ? picked : [] };
    },
  };
}

const NOTE_FILTERS = [['all', 'All notes'], ['volunteer', 'From volunteers'], ['admin', 'From admins']];

/** Notes with a filter by who wrote them (volunteers' feedback and updates, or admins). */
function notesBlock(notes, isAdmin) {
  let filter = 'all';
  const host = el('div', {});
  const chips = el('div', { class: 'chip-row mb-3' });
  const draw = () => {
    const from = (n) => n.from || (n.source === 'Leader' ? 'admin' : 'volunteer');
    const shown = notes.filter((n) => filter === 'all' || from(n) === filter);
    mount(chips, NOTE_FILTERS.map(([key, text]) => {
      const count = notes.filter((n) => key === 'all' || from(n) === key).length;
      const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(filter === key) }, `${text} (${count})`);
      b.addEventListener('click', () => { filter = key; draw(); });
      return b;
    }));
    mount(host, shown.length ? notesList(shown, isAdmin) : el('p', { class: 'text-sm muted' }, 'No notes here.'));
  };
  draw();
  return el('div', {}, notes.length > 1 ? chips : null, host);
}

function notesList(notes, isAdmin) {
  return el('ul', { class: 'space-y-3' }, notes.map((n) => el('li', { class: 'border-l-2 border-indigo-200 pl-3 text-sm dark:border-indigo-800' },
    el('p', { class: 'whitespace-pre-line text-slate-700 dark:text-neutral-300' }, n.note),
    attachmentList(n.attachments, { noteId: n.noteId }),
    el('p', { class: 'mt-0.5 text-xs muted' }, `${n.author || sourceLabel(n.source)}, ${fmtDay(n.date)}${n.source === 'Volunteer update' ? ' · update' : ''}`),
    isAdmin && n.audience ? el('p', { class: 'mt-1' }, audienceBadge(n)) : null)));
}

/* ---------------- "Paired trainee" on session cards ---------------- */

/**
 * One line on Home: photo, name and a hint. Details stay out of the way:
 * press and hold for the quick card (quickview.js), or tap for the full page.
 */
export function traineeLine(trainee, pairing, label) {
  if (!trainee) return null;
  return asTrainee(el('a', { href: `#/info/${encodeURIComponent(trainee.id)}`, class: 'well mt-3 flex items-center gap-3 p-3 hover:shadow-sm' },
    traineeAvatar(trainee, 'sm'),
    el('span', { class: 'min-w-0 flex-1' },
      el('span', { class: 'block text-xs font-bold uppercase tracking-wider muted' }, label || 'Paired trainee'),
      traineeName(trainee.name, trainee.id, 'block truncate font-bold text-slate-900 dark:text-white'),
      null),
    icon('chevron', 'size-5 text-slate-400')), trainee.id);
}

/* ---------------- a trainee's page (volunteers and regulars) ---------------- */

function updateForm(trainee, onSent) {
  const files = attachPicker(); // photos, documents, videos
  const form = el('form', { class: 'space-y-3', novalidate: true },
    field('note', `Something the next volunteer should know about ${trainee.preferredName || trainee.name}`, {
      type: 'textarea', rows: 3, maxlength: 5000,
      placeholder: 'e.g. Calmer with a 5-minute warning before changing activity.',
    }),
    files.el,
    el('button', { type: 'submit', class: 'btn btn-primary w-full' }, icon('send', 'size-4'), 'Send update'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const note = form.note.value.trim();
    if (!note) { toast('Write your update first.', 'warn'); return; }
    busy(form.querySelector('button[type=submit]'), 'Sending…', async () => {
      const res = await call('submitTraineeUpdate', { traineeId: trainee.id, note, files: await files.files() });
      form.reset();
      files.clear();
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
        // Beside the photo: short name, gender and language (the full name is the page title);
        // the sections below don't repeat them. Only what this person may see comes from the server.
        el('div', { class: 'min-w-0' },
          el('h1', { class: 'page-title leading-tight' }, t.fullName || t.name),
          el('dl', { class: 'qv-facts text-sm' },
            [['Short name', t.preferredName], ['Gender', t.gender], ['Language', t.language]]
              .filter(([, v]) => v).map(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
          d.isMyRegular ? el('div', { class: 'mt-2' }, badge('Your regular trainee', 'emerald', 'heart')) : null)),
      d.regulars.length ? el('p', { class: 'mt-2 text-sm muted' }, `Regular volunteers: ${d.regulars.join(', ')}`) : null,
      d.together.length ? el('div', { class: 'alert alert-info mt-4' },
        el('p', { class: 'font-bold' }, "You're paired for:"),
        el('ul', { class: 'mt-1 list-disc pl-5' }, d.together.map((s) => el('li', {}, `${s.title}, ${fmtDay(s.date)}${s.startTime ? `, ${fmtTimes(s)}` : ''}`)))) : null,
      d.access === 'admin' ? el('p', { class: 'alert alert-info mt-4' }, 'You see every detail as an admin. ',
        el('a', { href: `#/trainee/${encodeURIComponent(t.id)}`, class: 'link' }, 'Open the admin profile')) : null,
      // Grouped and coloured like MINDS's House Visit form, each question with its guide text.
      d.sections.length ? [hvJump(d.sections), hvSections(d.sections)]
        : el('p', { class: 'alert alert-warn mt-4' }, 'No details are shared for this trainee yet.'),
      el('h2', { class: 'group-label' }, 'Notes from volunteers and admins'),
      d.notes.length ? el('div', { class: 'card p-4' }, notesBlock(d.notes, d.access === 'admin')) : el('p', { class: 'text-sm muted' }, 'No notes yet.'),
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
    const shown = fuzzyFilter(data.trainees, query, (t) => [t.name, t.fullName, t.preferredName, t.id, t.regulars.join(' ')]);
    const myIds = data.myTraineeIds || (data.myTraineeId ? [data.myTraineeId] : []);
    const mine = data.trainees.filter((t) => myIds.includes(t.id));
    mount(host,
      mine.length && !query ? [el('h2', { class: 'group-label mt-0' }, mine.length > 1 ? 'Your regular trainees' : 'Your regular trainee'), list(mine.map((t) => row(t, true)))] : null,
      el('h2', { class: 'group-label' }, `${shown.length} trainee${shown.length === 1 ? '' : 's'}`),
      shown.length ? list(shown.map((t) => row(t, false))) : el('p', { class: 'text-sm muted' }, 'No trainee matches that search.'));
  };
  mount(root,
    el('h1', { class: 'page-title' }, 'Trainees'),
    searchBox('Search by name', (q) => { query = q; draw(); }, 'Search trainees'),
    host);
  mount(host, loading());
  return call('traineeDirectory').then((d) => { data = d; if (ctx.alive()) draw(); })
    .catch((err) => { if (ctx.alive()) mount(host, errorBlock(err, () => app.rerender())); });
}

/* ---------------- admins: review volunteers' notes ---------------- */

const KINDS = [['all', 'All'], ['session', 'Session feedback'], ['update', 'Trainee updates']];

export function renderReview(root, app, ctx) {
  let kind = 'all';
  const draw = (q) => {
    const after = (next) => {
      app.dropAdminHome();
      app.dropTrainees();
      toast(next.message || 'Saved.');
      if (ctx.alive()) draw(next);
    };
    const item = (it) => {
      const text = el('textarea', { class: 'input min-h-[110px]', rows: 4, maxlength: 5000, 'aria-label': `Note about ${it.traineeName}` });
      text.value = it.observation;
      const share = shareChooser({ audiences: q.audiences, volunteers: q.volunteers, name: `share-${it.feedbackId}` });
      const save = el('button', { type: 'button', class: 'btn btn-success btn-sm w-full sm:w-auto' }, icon('tick', 'size-4'), 'Save');
      save.addEventListener('click', () => {
        const how = share.get();
        if (!how) return;
        const note = text.value.trim();
        if (!note && how.audience !== 'private') {
          toast('The note is empty. Choose "Keep private" instead.', 'warn');
          return;
        }
        busy(save, 'Saving…', async () => after(await call('reviewObservation', {
          feedbackId: it.feedbackId, audience: how.audience, userIds: how.userIds, ...(note ? { note } : {}),
        })));
      });
      return el('article', { class: 'card p-4' },
        el('div', { class: 'flex items-start justify-between gap-3' },
          el('div', { class: 'min-w-0' },
            el('a', { href: `#/trainee/${encodeURIComponent(it.traineeId)}`, class: 'font-bold text-slate-900 hover:underline dark:text-white' }, traineeName(it.traineeName, it.traineeId)),
            el('p', { class: 'text-sm muted' }, 'From ', personName(it.volunteerName, it.userId), `, ${fmtDay(it.date)}`)),
          el('span', { class: 'flex flex-wrap justify-end gap-1' },
            badge(it.kind === 'update' ? 'Trainee update' : 'Session feedback', it.kind === 'update' ? 'indigo' : 'slate'),
            it.rating ? badge(`Session ${it.rating}/5`, 'slate') : null)),
        el('div', { class: 'mt-3' }, text),
        el('p', { class: 'label mt-4' }, 'Who can read it?'),
        attachmentList(it.attachments, { feedbackId: it.feedbackId }),
        share.el,
        el('div', { class: 'mt-3 flex justify-end' }, save));
    };
    const items = q.items.filter((it) => kind === 'all' || (it.kind || 'session') === kind);
    const chips = el('div', { class: 'chip-row mb-4' }, KINDS.map(([key, label]) => {
      const n = q.items.filter((it) => key === 'all' || (it.kind || 'session') === key).length;
      const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(kind === key) }, `${label} (${n})`);
      b.addEventListener('click', () => { kind = key; draw(q); });
      return b;
    }));
    mount(root,
      el('h1', { class: 'page-title' }, 'Notes to review'),
      q.items.length ? chips : null,
      items.length ? el('div', { class: 'space-y-3' }, items.map(item))
        : el('div', { class: 'flex flex-col items-center rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center muted dark:border-neutral-800' },
          icon('inbox', 'mb-3 size-12 text-slate-300 dark:text-neutral-700'),
          el('p', { class: 'font-medium text-slate-900 dark:text-white' }, q.items.length ? 'Nothing of this kind' : 'All caught up'),
          el('p', { class: 'mt-1 text-sm' }, 'New observations from volunteers will appear here.')));
  };
  mount(root, loading());
  return call('reviewQueue').then((q) => { if (ctx.alive()) draw(q); })
    .catch((err) => { if (ctx.alive()) mount(root, errorBlock(err, () => app.rerender())); });
}
