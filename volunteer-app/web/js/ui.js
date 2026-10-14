// DOM helpers, icons, feedback (toast, spinners) and formatters.
// Data is only ever rendered with textContent (via el()); innerHTML is used
// solely for the fixed icon markup below.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected') node[key] = Boolean(value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

/** Like node.replaceChildren(), but accepts nested arrays and skips null/false. */
export function mount(node, ...children) {
  node.replaceChildren(...children.flat(Infinity)
    .filter((c) => c !== null && c !== undefined && c !== false)
    .map((c) => (c instanceof Node ? c : String(c))));
  return node;
}

// Lucide-style outline icons (the icon set CSL Attendance uses).
const ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  qr: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10.01-3-3"/>',
  tick: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61M2 2l20 20"/>',
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
  x: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  cloudOff: '<path d="m2 2 20 20M5.78 5.78A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.31-.2M21.53 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7 7 0 0 0 9.3 5.1"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
};

export function icon(name, cls = 'size-5') {
  const span = document.createElement('span');
  span.className = `inline-flex shrink-0 ${cls}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-full">${ICONS[name] || ''}</svg>`;
  return span;
}

/* ---------- feedback ---------- */

let toastTimer = null;
/** Top-centre toast, green for success and red for errors (as in Trainee House Visit). */
export function toast(message, kind = 'ok') {
  const host = document.getElementById('toast');
  const colours = { ok: 'bg-green-600', error: 'bg-red-600', warn: 'bg-amber-500' };
  mount(host, el('div', { class: `pop-in pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-2xl ${colours[kind] || colours.ok}` }, message));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.replaceChildren(), kind === 'error' ? 6000 : 3500);
}

export function spinner(extra = '') {
  return el('span', { class: `spinner ${extra}`, 'aria-hidden': 'true' });
}

/** Disables a button and shows a spinner while an async action runs; errors become a toast. */
export async function busy(button, label, action) {
  const original = Array.from(button.childNodes);
  const light = /btn-(primary|success|dark)/.test(button.className);
  button.disabled = true;
  mount(button, spinner(light ? 'spinner-white size-4' : 'size-4'), label || null);
  try {
    return await action();
  } catch (err) {
    toast(err.message || 'Something went wrong.', 'error');
    return undefined;
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      mount(button, original);
    }
  }
}

export function loading(text = 'Loading…') {
  return el('div', { class: 'flex flex-col items-center justify-center gap-3 py-20 muted', 'aria-live': 'polite' },
    spinner('size-10 border-[3px]'), el('span', { class: 'text-sm font-bold' }, text));
}

export function errorBlock(err, retry) {
  return el('div', { class: 'alert alert-error', role: 'alert' },
    el('p', { class: 'font-bold' }, err.message || 'Something went wrong.'),
    retry ? el('button', { class: 'btn btn-secondary btn-sm mt-3', onclick: retry }, icon('refresh', 'size-4'), 'Try again') : null);
}

export function badge(text, tone = 'slate', iconName) {
  return el('span', { class: `badge badge-${tone}` }, iconName ? icon(iconName, 'size-3.5') : null, text);
}

export function statusBadge(status) {
  if (status === 'confirmed') return badge('Confirmed', 'emerald', 'tick');
  if (status === 'pending') return badge('Pending', 'amber');
  if (status === 'cancelled') return badge('Cancelled', 'red');
  return badge(status);
}

export function backLink(href, text = 'Back') {
  return el('a', { href, class: 'mb-4 inline-flex items-center gap-1 text-sm font-bold muted hover:text-indigo-600 dark:hover:text-indigo-400' }, icon('back', 'size-4'), text);
}

/** House Visit style card with a coloured uppercase section header. */
export function section(title, colour, ...body) {
  return el('section', { class: 'card overflow-hidden' },
    el('h2', { class: `section-head section-${colour}` }, title),
    el('div', { class: 'space-y-5 p-4' }, ...body));
}

/** Labelled input; type 'password' gets a show/hide eye button, type 'textarea' a textarea. */
export function field(name, label, attrs = {}) {
  const id = `f-${name}`;
  const { hint, optional, ...rest } = attrs;
  let control;
  if (rest.type === 'textarea') {
    delete rest.type;
    control = el('textarea', { id, name, class: 'input min-h-[100px]', rows: 3, ...rest });
  } else if (rest.type === 'password') {
    const input = el('input', { id, name, class: 'input pr-12', ...rest });
    const eye = el('button', { type: 'button', class: 'absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-indigo-600', 'aria-label': 'Show password' }, icon('eye'));
    eye.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      mount(eye, icon(show ? 'eyeOff' : 'eye'));
    });
    control = el('div', { class: 'relative' }, input, eye);
  } else {
    control = el('input', { id, name, class: 'input', ...rest });
  }
  return el('div', {},
    el('label', { class: 'label', for: id }, label, optional ? el('span', { class: 'font-normal text-slate-400' }, ' (optional)') : null),
    control,
    hint ? el('p', { class: 'hint' }, hint) : null);
}

/** House Visit style 1–5 scale with end labels. */
export function likert(name, leftLabel, rightLabel) {
  return el('div', { class: 'well p-4 shadow-inner' },
    el('div', { class: 'mb-3 flex items-end justify-between text-xs font-medium muted' },
      el('span', { class: 'w-1/2 pr-2 text-left' }, leftLabel), el('span', { class: 'w-1/2 pl-2 text-right' }, rightLabel)),
    el('div', { class: 'flex justify-between gap-2 sm:gap-3' }, [1, 2, 3, 4, 5].map((n) => el('label', { class: 'group flex-1 cursor-pointer' },
      el('input', { type: 'radio', name, value: n, class: 'peer sr-only' }),
      el('span', { class: 'flex items-center justify-center rounded-lg border border-slate-300 bg-white py-3 font-bold text-slate-700 shadow-sm transition-all group-hover:bg-slate-50 peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:group-hover:bg-neutral-800' }, String(n))))));
}

/* ---------- formatting (all dates are Singapore dates from the server) ---------- */

export function todaySG() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

export function fmtDay(dateStr, today = todaySG()) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00Z`);
  const t = new Date(`${today}T00:00:00Z`);
  const diff = Math.round((d - t) / 86400000);
  const label = d.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  if (diff === 0) return `Today, ${label}`;
  if (diff === 1) return `Tomorrow, ${label}`;
  if (diff === -1) return `Yesterday, ${label}`;
  return label;
}

export const fmtTimes = (s) => (s.startTime && s.endTime ? `${s.startTime}–${s.endTime}` : s.startTime || '');
export const clockTime = (sgDateTime) => (sgDateTime ? String(sgDateTime).slice(11, 16) : '');
export const fmtHours = (h) => `${Number(h || 0).toFixed(h % 1 === 0 ? 0 : 2)} h`;

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function formData(form) {
  const data = {};
  new FormData(form).forEach((value, key) => {
    data[key] = typeof value === 'string' ? value.trim() : value;
  });
  return data;
}
