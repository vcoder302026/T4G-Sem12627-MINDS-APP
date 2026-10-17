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
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.98-3.98L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  sparkle: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.13 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 13H8M16 17H8M16 13h-2"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
  pair: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-.87 0-1.6.12-2.3.5"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  ear: '<path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"/><path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4"/>',
  shirt: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
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
  if (status === 'confirmed' || status === 'pending' || status === 'coming') return badge("You're coming", 'emerald', 'tick');
  if (status === 'cancelled') return badge('Cancelled', 'red');
  return badge(status);
}

/** "Regular" / "New" volunteer badge. */
export function typeBadge(type) {
  return type === 'regular' ? badge('Regular', 'emerald', 'heart') : badge('New', 'indigo', 'sparkle');
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

/* ---------- fuzzy search (used by every search box and picker) ---------- */

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
export const normalizeText = (s) => fold(s).replace(/[^a-z0-9@.+]+/g, ' ').trim();

/** True when a and b are within `max` edits (insert, delete, change, swap two neighbours). */
function withinEdits(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return false;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length] <= max;
}

function inOrder(needle, hay) {
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i += 1;
  return i === needle.length;
}

function tokenScore(tok, words, digits, acronym) {
  let best = 0;
  for (const w of words) {
    if (w === tok) return 100;
    if (w.startsWith(tok)) best = Math.max(best, 90);
    else if (tok.length >= 2 && w.includes(tok)) best = Math.max(best, 70);
    else if (tok.length >= 3 && (withinEdits(tok, w.slice(0, tok.length), tok.length <= 4 ? 1 : 2) || withinEdits(tok, w, tok.length <= 4 ? 1 : 2))) {
      best = Math.max(best, 60); // typo: "veera" → vera, "wodlands" → woodlands
    } else if (tok.length >= 2 && tok[0] === w[0] && inOrder(tok, w)) {
      best = Math.max(best, 40); // letters skipped: "lm" → lim, "bkng" → baking
    }
  }
  if (!best && /^\d{3,}$/.test(tok) && digits.includes(tok)) best = 80;
  if (!best && tok.length >= 2 && acronym.includes(tok)) best = 50; // "wgs" → Woodlands Gardens School
  return best;
}

/** 0 = no match; higher = better. Every word typed must match something (typos allowed). */
export function fuzzyScore(query, ...fields) {
  const q = normalizeText(query);
  if (!q) return 1;
  const raw = fields.filter(Boolean).join(' ');
  const text = normalizeText(raw);
  if (!text) return 0;
  if (text.includes(q)) return 200;
  const words = text.split(/[\s@.+]+/).filter(Boolean);
  const digits = raw.replace(/\D/g, '');
  const acronym = text.split(' ').map((w) => w[0]).join('');
  const toks = q.split(' ');
  let total = 0;
  for (const tok of toks) {
    const s = tokenScore(tok, words, digits, acronym);
    if (!s) return 0;
    total += s;
  }
  return total / toks.length;
}

/** Items matching the query, best first; fieldsOf(item) returns the strings to search. */
export function fuzzyFilter(items, query, fieldsOf) {
  if (!normalizeText(query)) return items.slice();
  return items
    .map((item, i) => ({ item, i, score: fuzzyScore(query, ...fieldsOf(item)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.item);
}

/** Search box with a magnifying-glass icon; calls onQuery(text) as the person types. */
export function searchBox(placeholder, onQuery, label) {
  const input = el('input', { type: 'search', class: 'input pl-10', placeholder, 'aria-label': label || placeholder, autocomplete: 'off' });
  input.addEventListener('input', () => onQuery(input.value));
  return el('div', { class: 'relative' },
    el('span', { class: 'pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400' }, icon('search')),
    input);
}

let pickerSeq = 0;

/**
 * Dropdown with fuzzy search (type to filter, arrow keys, Enter, Escape).
 * options: [{ value, label, hint }]. Submits its value through a hidden input called `name`.
 * onAdd(text) adds a "+ <addLabel>" row at the bottom of the list.
 */
export function combobox({ name, options, value = '', placeholder = 'Type to search', emptyText = 'No matches', onChange, addLabel, onAdd, emptyOption }) {
  const id = `cb${++pickerSeq}`;
  let opts = options.slice();
  let selected = value || '';
  let active = -1;
  const hidden = el('input', { type: 'hidden', name, value: selected });
  const input = el('input', {
    type: 'text', class: 'input pr-10', role: 'combobox', autocomplete: 'off', placeholder,
    'aria-expanded': 'false', 'aria-controls': `${id}-list`, 'aria-autocomplete': 'list',
  });
  const list = el('ul', { id: `${id}-list`, role: 'listbox', class: 'card absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto p-1 shadow-xl', hidden: true });
  const labelOf = (v) => {
    if (!v) return '';
    const o = opts.find((x) => String(x.value) === String(v));
    return o ? o.label : String(v);
  };
  const showSelected = () => { input.value = labelOf(selected); };
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const choose = (o) => {
    if (String(o.value) === String(selected)) { showSelected(); close(); return; } // same choice: nothing to save
    selected = o.value;
    hidden.value = o.value;
    showSelected();
    close();
    if (onChange) onChange(o.value, o);
  };
  let rows = [];
  const render = () => {
    const q = input.value === labelOf(selected) ? '' : input.value;
    rows = [];
    if (emptyOption && !q) rows.push({ value: '', label: emptyOption, kind: 'empty' });
    fuzzyFilter(opts, q, (o) => [o.label, o.hint]).forEach((o) => rows.push(o));
    if (onAdd) rows.push({ kind: 'add', label: q.trim() ? `${addLabel}: "${q.trim()}"` : addLabel, text: q.trim() });
    const items = rows.map((o, i) => el('li', {
      id: `${id}-o${i}`, role: 'option', 'aria-selected': o.kind !== 'add' && String(o.value) === String(selected) ? 'true' : 'false',
      class: `flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${i === active ? 'bg-indigo-50 dark:bg-indigo-900/40' : 'hover:bg-slate-50 dark:hover:bg-neutral-900'} ${o.kind === 'add' ? 'font-bold text-indigo-600 dark:text-indigo-400' : ''}`,
      onmousedown: (e) => { e.preventDefault(); pick(i); },
    },
    o.kind === 'add' ? icon('plus', 'size-4') : null,
    el('span', { class: 'min-w-0 flex-1' },
      el('span', { class: `block truncate ${o.kind === 'empty' ? 'muted' : 'font-bold text-slate-900 dark:text-white'}` }, o.label),
      o.hint ? el('span', { class: 'block truncate text-xs muted' }, o.hint) : null),
    o.kind !== 'add' && String(o.value) === String(selected) && selected ? icon('tick', 'size-4 text-indigo-600') : null));
    const matches = rows.filter((r) => !r.kind).length;
    mount(list, items, !matches && q ? el('li', { class: 'px-3 py-2 text-sm muted' }, emptyText) : null);
    if (active >= 0) input.setAttribute('aria-activedescendant', `${id}-o${active}`);
  };
  const pick = (i) => {
    const o = rows[i];
    if (!o) return;
    if (o.kind === 'add') {
      close();
      showSelected();
      onAdd(o.text);
    } else choose(o);
  };
  const open = () => { list.hidden = false; input.setAttribute('aria-expanded', 'true'); render(); };
  input.addEventListener('focus', () => { input.select(); open(); });
  input.addEventListener('input', () => { active = 0; open(); });
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) { close(); showSelected(); } }, 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) open(); active = Math.min(active + 1, rows.length - 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
    else if (e.key === 'Enter' && !list.hidden && active >= 0) { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') { close(); showSelected(); }
  });
  showSelected();
  return {
    el: el('div', { class: 'relative' }, input, el('span', { class: 'pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400' }, icon('down', 'size-4')), list, hidden),
    input,
    get value() { return selected; },
    set value(v) { selected = v || ''; hidden.value = selected; showSelected(); },
    setOptions(next) { opts = next.slice(); showSelected(); },
  };
}

/** Checklist with fuzzy search, for choosing several items (e.g. trainees attending). */
export function multiPick({ name, options, values = [], placeholder = 'Search', emptyText = 'No matches' }) {
  const chosen = new Set(values.map(String));
  const hidden = el('input', { type: 'hidden', name, value: [...chosen].join(',') });
  const count = el('span', { class: 'text-xs font-bold muted' });
  const listHost = el('div', { class: 'well max-h-56 divide-y divide-slate-200 overflow-y-auto dark:divide-neutral-800' });
  let query = '';
  const sync = () => {
    hidden.value = [...chosen].join(',');
    count.textContent = chosen.size ? `${chosen.size} selected` : 'None selected: any trainee can be paired';
  };
  const draw = () => {
    const shown = fuzzyFilter(options, query, (o) => [o.label, o.hint]);
    mount(listHost, shown.length ? shown.map((o) => {
      const box = el('input', { type: 'checkbox', class: 'size-5 shrink-0 accent-indigo-600', checked: chosen.has(String(o.value)) });
      box.addEventListener('change', () => { if (box.checked) chosen.add(String(o.value)); else chosen.delete(String(o.value)); sync(); });
      return el('label', { class: 'flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm' }, box,
        el('span', { class: 'min-w-0' }, el('span', { class: 'block font-bold' }, o.label), o.hint ? el('span', { class: 'block text-xs muted' }, o.hint) : null));
    }) : el('p', { class: 'px-3 py-2 text-sm muted' }, emptyText));
  };
  const search = searchBox(placeholder, (q) => { query = q; draw(); });
  const clear = el('button', { type: 'button', class: 'text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400' }, 'Clear');
  clear.addEventListener('click', () => { chosen.clear(); sync(); draw(); });
  sync();
  draw();
  return {
    el: el('div', { class: 'space-y-2' }, search, listHost, el('div', { class: 'flex items-center justify-between' }, count, clear), hidden),
    get values() { return [...chosen]; },
  };
}

/** Renders admin-written text safely: "- " lines become bullets, "1. " lines numbered steps. */
export function richText(body) {
  const blocks = [];
  let para = [];
  let listEl = null;
  let listKind = '';
  const flushPara = () => {
    if (para.length) blocks.push(el('p', {}, para.flatMap((line, i) => (i ? [el('br'), line] : [line]))));
    para = [];
  };
  String(body || '').split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    const bullet = /^[-•*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const kind = bullet ? 'ul' : numbered ? 'ol' : '';
    if (kind) {
      flushPara();
      if (!listEl || listKind !== kind) {
        listEl = el(kind, { class: kind === 'ul' ? 'list-disc space-y-1 pl-5' : 'list-decimal space-y-1 pl-5' });
        listKind = kind;
        blocks.push(listEl);
      }
      listEl.append(el('li', {}, (bullet || numbered)[1]));
      return;
    }
    listEl = null;
    if (!line) flushPara();
    else para.push(line);
  });
  flushPara();
  return el('div', { class: 'space-y-3 text-[15px] leading-relaxed text-slate-700 dark:text-neutral-300' }, blocks);
}

/**
 * Small pop-up window (native <dialog>, so Escape and focus trapping work).
 * body: nodes; returns { close }. onClose runs however it was closed.
 */
export function modal(title, body, onClose) {
  const dlg = el('dialog', { class: 'card m-auto w-[min(32rem,calc(100vw-2rem))] p-0 text-slate-900 shadow-2xl backdrop:bg-black/50 dark:text-neutral-100' });
  const closeBtn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close' }, icon('x'));
  mount(dlg,
    el('div', { class: 'flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 dark:border-neutral-800' },
      el('h2', { class: 'text-lg font-extrabold' }, title), closeBtn),
    el('div', { class: 'max-h-[75vh] overflow-y-auto p-5' }, body));
  const close = () => { if (dlg.open) dlg.close(); };
  closeBtn.addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', () => { dlg.remove(); if (onClose) onClose(); });
  document.body.append(dlg);
  dlg.showModal();
  const first = dlg.querySelector('input:not([type=hidden]), textarea, select');
  if (first) first.focus();
  return { close, el: dlg };
}

/** <select> with a label, for short fixed lists. options: [{ value, label }] */
export function selectField(name, label, options, value, attrs = {}) {
  const { hint, optional, ...rest } = attrs;
  const id = `f-${name}`;
  return el('div', {},
    el('label', { class: 'label', for: id }, label, optional ? el('span', { class: 'font-normal text-slate-400' }, ' (optional)') : null),
    el('select', { id, name, class: 'input', ...rest },
      options.map((o) => el('option', { value: o.value, selected: String(o.value) === String(value ?? '') }, o.label))),
    hint ? el('p', { class: 'hint' }, hint) : null);
}

/** Label + any control (combobox, multiPick…) laid out like field(). */
export function labelled(label, control, { hint, optional } = {}) {
  return el('div', {},
    el('p', { class: 'label' }, label, optional ? el('span', { class: 'font-normal text-slate-400' }, ' (optional)') : null),
    control,
    hint ? el('p', { class: 'hint' }, hint) : null);
}

/**
 * Press and hold (touch), right-click or Enter/Space (keyboard) on `node` calls fn().
 * Used for volunteer details on the admin session page, so the list stays uncluttered.
 */
export function onLongPress(node, fn, { ms = 450, onTap } = {}) {
  let timer = null;
  let fired = false;
  let startX = 0;
  let startY = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  node.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    fired = false;
    startX = e.clientX;
    startY = e.clientY;
    cancel();
    timer = setTimeout(() => {
      fired = true;
      if (navigator.vibrate) navigator.vibrate(15);
      fn(e);
    }, ms);
  });
  node.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => node.addEventListener(t, cancel));
  node.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!fired) fn(e);
  });
  node.addEventListener('click', (e) => {
    if (fired) { e.preventDefault(); fired = false; return; }
    if (onTap) onTap(e);
  });
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); }
  });
  return node;
}

/** Asks for the admin password again (for sensitive changes). Resolves to the password, or null. */
export function askPassword(title, message, confirmLabel = 'Confirm') {
  return new Promise((resolve) => {
    let done = false;
    const input = el('input', { type: 'password', class: 'input', autocomplete: 'off', 'aria-label': 'Admin password', placeholder: 'Admin password' });
    const ok = el('button', { type: 'submit', class: 'btn btn-danger' }, confirmLabel);
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancel');
    const form = el('form', { class: 'space-y-4', novalidate: true },
      el('p', { class: 'text-sm' }, message),
      el('label', { class: 'label', for: 'ask-pw' }, 'Type the MINDS admin password to confirm'),
      input,
      el('div', { class: 'flex justify-end gap-2' }, cancelBtn, ok));
    input.id = 'ask-pw';
    const dlg = modal(title, form, () => { if (!done) resolve(null); });
    cancelBtn.addEventListener('click', () => dlg.close());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value) { input.focus(); return; }
      done = true;
      resolve(input.value);
      dlg.close();
    });
  });
}

/** Google Maps search link for an address (opens the Maps app on phones). */
export const mapsLink = (place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
