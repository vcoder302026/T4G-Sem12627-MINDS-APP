// Building blocks for the staff dashboard: page headers, stat tiles, tables,
// pop-up forms, pickers, money and CSV export. Built on the phone app's
// helpers in ../../js/ui.js, so data is only ever rendered as text.

import {
  badge, busy, combobox, el, errorBlock, field, fmtDay, formData, icon as baseIcon, labelled, loading, modal, mount, selectField,
} from '../../js/ui.js';

// A few extra outline icons for the dashboard (same style as ui.js).
const EXTRA = {
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"/>',
  bus: '<path d="M8 6v6M15 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};

export function icon(name, cls = 'size-5') {
  if (!EXTRA[name]) return baseIcon(name, cls);
  const span = document.createElement('span');
  span.className = `inline-flex shrink-0 ${cls}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-full">${EXTRA[name]}</svg>`;
  return span;
}

/* ---------- formatting ---------- */

export const money = (cents) => `$${(Number(cents || 0) / 100).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const hours = (h) => (h === null || h === undefined ? 'In progress' : `${Number(h).toLocaleString('en-SG', { maximumFractionDigits: 2 })} h`);
export const time = (dt) => (dt ? String(dt).slice(11, 16) : '');
export const day = (d) => (d ? fmtDay(d) : '—');
export function dateRangeText(start, end) {
  if (!start) return '—';
  return end && end !== start ? `${fmtDay(start)} – ${fmtDay(end)}` : fmtDay(start);
}
export const plural = (n, word, many) => `${n} ${n === 1 ? word : many || `${word}s`}`;

/* ---------- layout ---------- */

export function pageHead(title, subtitle, ...actions) {
  return el('div', { class: 'mb-6 flex flex-wrap items-end justify-between gap-4' },
    el('div', { class: 'min-w-0' },
      el('h1', { class: 'page-title' }, title),
      subtitle ? el('p', { class: 'mt-1 muted' }, subtitle) : null),
    actions.length ? el('div', { class: 'flex flex-wrap gap-2' }, actions) : null);
}

export function backTo(href, text) {
  return el('a', { href, class: 'back-link mb-3 inline-flex items-center gap-1 text-sm font-bold muted hover:text-indigo-600 dark:hover:text-indigo-400' }, icon('back', 'size-4'), text);
}

const TONES = {
  indigo: 'text-indigo-600 dark:text-indigo-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  purple: 'text-purple-600 dark:text-purple-400',
  red: 'text-red-600 dark:text-red-400',
  slate: 'text-slate-900 dark:text-white',
};

/** Big number tile. href makes it a link. */
export function stat(label, value, { tone = 'slate', sub, href } = {}) {
  return el(href ? 'a' : 'div', { href, class: `card block p-4 ${href ? 'transition hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-700' : ''}` },
    el('p', { class: 'text-xs font-bold uppercase tracking-wider muted' }, label),
    el('p', { class: `mt-1 ${String(value).length > 8 ? 'text-2xl' : 'text-3xl'} font-extrabold tracking-tight ${TONES[tone] || TONES.slate}` }, String(value)),
    sub ? el('p', { class: 'mt-1 text-xs muted' }, sub) : null);
}

export function statGrid(...tiles) {
  return el('div', { class: 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6' }, tiles);
}

/** Card with a title row (and optional buttons on the right). */
export function panel(title, actions, ...body) {
  return el('section', { class: 'card overflow-hidden' },
    el('div', { class: 'flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-neutral-800' },
      el('h2', { class: 'font-extrabold text-slate-900 dark:text-white' }, title),
      actions ? el('div', { class: 'flex flex-wrap gap-2' }, actions) : null),
    el('div', {}, body));
}

/**
 * Table. columns: [{ label, cell: (row) => text|node, class }]
 * Options: empty (text when no rows), href(row) makes the first cell a link.
 * On a computer it is a table; on a phone the same rows show as cards
 * (first column as the title, the others as "label: value" lines), so the same
 * information is there on both.
 */
export function table(columns, rows, { empty = 'Nothing here yet.', href, rowClass } = {}) {
  if (!rows.length) return el('p', { class: 'px-4 py-8 text-center text-sm muted' }, empty);
  const content = (c, r, i) => {
    const value = c.cell(r);
    return i === 0 && href ? el('a', { href: href(r), class: 'link' }, value) : value;
  };
  const blank = (v) => v === '' || v === null || v === undefined;
  const wide = el('div', { class: 'only-wide overflow-x-auto' },
    el('table', { class: 'w-full text-left text-sm' },
      el('thead', { class: 'bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 dark:bg-neutral-900 dark:text-neutral-400' },
        el('tr', {}, columns.map((c) => el('th', { scope: 'col', class: `whitespace-nowrap px-4 py-2.5 ${c.class || ''}` }, c.label)))),
      el('tbody', { class: 'divide-y divide-slate-100 dark:divide-neutral-800' },
        rows.map((r) => el('tr', { class: `align-top hover:bg-slate-50/60 dark:hover:bg-neutral-900/60 ${rowClass ? rowClass(r) : ''}` },
          columns.map((c, i) => {
            const v = content(c, r, i);
            return el('td', { class: `px-4 py-3 ${c.class || ''}` }, blank(v) ? '—' : v);
          }))))));
  const narrow = el('div', { class: 'only-narrow' }, rows.map((r) => {
    const title = content(columns[0], r, 0);
    const lines = columns.slice(1).map((c, j) => {
      const v = content(c, r, j + 1);
      if (blank(v)) return null;
      return c.label ? el('div', { class: 'rt-line' }, el('span', {}, c.label), el('span', {}, v)) : el('div', { class: 'mt-2' }, v);
    });
    return el('div', { class: `rt-card ${rowClass ? rowClass(r) : ''}` }, el('div', { class: 'mb-1 font-bold' }, title), lines);
  }));
  return el('div', {}, wide, narrow);
}

/** Toolbar row above a table: search, filters, buttons. */
export function toolbar(...items) {
  return el('div', { class: 'flex flex-wrap items-end gap-3 border-b border-slate-100 p-4 dark:border-neutral-800' }, items);
}

export function pill(text, tone) {
  return badge(text, tone);
}

/** Loads data into host: spinner, then draw(data), or an error with Try again. */
export async function load(host, ctx, fetcher, draw) {
  mount(host, loading());
  try {
    const data = await fetcher();
    if (ctx.alive()) draw(data);
    return data;
  } catch (err) {
    if (ctx.alive()) mount(host, errorBlock(err, () => load(host, ctx, fetcher, draw)));
    return undefined;
  }
}

/* ---------- forms ---------- */

/**
 * Pop-up form. body: form fields. onSubmit(data, form) returns a promise;
 * the window closes when it resolves, and stays open (keeping what was typed)
 * if it throws — the error shows inside the form.
 */
export function formModal(title, body, submitLabel, onSubmit, { wide = false } = {}) {
  const error = el('div', { class: 'alert alert-error', role: 'alert', hidden: true });
  const submit = el('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel);
  const cancel = el('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancel');
  const form = el('form', { novalidate: true, class: 'space-y-4' }, error, body,
    el('div', { class: 'flex justify-end gap-2 pt-2' }, cancel, submit));
  const m = modal(title, form);
  if (wide) m.el.classList.add('sm:w-[min(48rem,calc(100vw-2rem))]');
  cancel.addEventListener('click', () => m.close());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    error.hidden = true;
    busy(submit, 'Saving…', async () => {
      try {
        await onSubmit(formData(form), form);
        m.close();
      } catch (err) {
        error.textContent = err.message || 'Something went wrong.';
        error.hidden = false;
        error.scrollIntoView({ block: 'nearest' });
      }
    });
  });
  return m;
}

/** Two fields side by side on wider screens. */
export function row(...fields) {
  return el('div', { class: 'grid gap-4 sm:grid-cols-2' }, fields);
}

export { field, selectField, labelled };

/** Fuzzy-search picker for a volunteer. Submits userId under `name`. */
export function volunteerPicker(volunteers, { name = 'userId', value = '', optional = false, label = 'Volunteer' } = {}) {
  const cb = combobox({
    name,
    value,
    options: volunteers.map((v) => ({ value: v.userId, label: v.name, hint: v.email })),
    placeholder: 'Type a name',
    emptyText: 'No volunteer matches',
    emptyOption: optional ? 'Not assigned' : undefined,
  });
  return labelled(label, cb.el, { optional });
}

/** Fuzzy-search picker for a trainee. Submits the trainee ID under `name`. */
export function traineePicker(trainees, { name = 'traineeId', value = '', label = 'Trainee' } = {}) {
  const cb = combobox({
    name,
    value,
    options: trainees.map((t) => ({ value: t.id, label: t.name, hint: [t.id, t.preferredName].filter(Boolean).join(' · ') })),
    placeholder: 'Type a name',
    emptyText: 'No trainee matches',
  });
  return labelled(label, cb.el);
}

/** Small <select> that saves as soon as it changes. */
export function inlineSelect(options, value, onChange, label) {
  const s = el('select', { class: 'input min-w-32 py-1.5 text-sm', 'aria-label': label },
    options.map((o) => el('option', { value: o.value, selected: o.value === value }, o.label)));
  s.addEventListener('change', async () => {
    s.disabled = true;
    try {
      await onChange(s.value);
    } catch {
      s.value = value; // the error is shown as a toast by the caller
    } finally {
      if (s.isConnected) s.disabled = false;
    }
  });
  return s;
}

/* ---------- CSV ---------- */

const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // stop spreadsheet apps treating text as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(filename, header, rows) {
  const text = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
