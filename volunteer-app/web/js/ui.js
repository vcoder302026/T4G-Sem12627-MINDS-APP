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
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', // as in admin/js/kit.js (Sections menu)
  // All pages: a grid of dots (More uses the list icon).
  apps: '<circle cx="5" cy="5" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="19" cy="5" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="19" r="1.5"/><circle cx="12" cy="19" r="1.5"/><circle cx="19" cy="19" r="1.5"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  qr: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/>',
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
  grip: '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
  sparkle: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.13 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
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

/**
 * While a page loads: grey shimmering blocks in the shape of a page (MINDS's
 * template: "skeletons over spinners"), with the text for screen readers.
 */
export function loading(text = 'Loading…') {
  const bar = (w) => el('div', { class: 'skeleton skeleton-line', style: `width:${w}%` });
  const card = () => el('div', { class: 'skeleton-card' }, bar(55), bar(85), bar(70));
  return el('div', { class: 'space-y-3 py-2', 'aria-live': 'polite', 'aria-busy': 'true' },
    el('span', { class: 'sr-only' }, text),
    el('div', { class: 'skeleton skeleton-title' }), card(), card(), card());
}

export function errorBlock(err, retry) {
  return el('div', { class: 'alert alert-error', role: 'alert' },
    el('p', { class: 'font-bold' }, err.message || 'Something went wrong.'),
    err.permissionUrl ? el('a', { href: err.permissionUrl, target: '_blank', rel: 'noopener', class: 'link mt-2 block text-sm' }, 'Open the Google permissions page') : null,
    retry ? el('button', { class: 'btn btn-secondary btn-sm mt-3', onclick: retry }, icon('refresh', 'size-4'), 'Try again') : null);
}

export function badge(text, tone = 'slate', iconName) {
  return el('span', { class: `badge badge-${tone}` }, iconName ? icon(iconName, 'size-3.5') : null, text);
}

export function statusBadge(status) {
  if (status === 'confirmed' || status === 'pending') return badge('Coming', 'emerald', 'tick');
  if (status === 'cancelled') return badge('Cancelled', 'red');
  return badge(status);
}

export function backLink(href, text = 'Back') {
  // The header's ← button follows this link (app.js); the link itself is hidden when signed in.
  return el('a', { href, class: 'back-link mb-4 inline-flex items-center gap-1 text-sm font-bold muted hover:text-indigo-600 dark:hover:text-indigo-400' }, icon('back', 'size-4'), text);
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
    const input = el('input', { id, name, class: 'input pr-12', 'data-eye': '1', ...rest }); // has its own eye (controls.js skips it)
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
  const input = el('input', { type: 'search', class: 'input search-input pl-10', placeholder, 'aria-label': label || placeholder, autocomplete: 'off' });
  // A clear (×) button inside the box, as in the Overseas Trip Planner's searches.
  const clear = el('button', { type: 'button', class: 'search-clear', 'aria-label': 'Clear search', hidden: true }, '✕');
  input.addEventListener('input', () => { clear.hidden = !input.value; onQuery(input.value); });
  clear.addEventListener('click', () => {
    input.value = '';
    clear.hidden = true;
    onQuery('');
    input.focus();
  });
  return el('div', { class: 'relative' },
    el('span', { class: 'pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400' }, icon('search')),
    input, clear);
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
export function multiPick({ name, options, values = [], placeholder = 'Search', emptyText = 'No matches', noneText = 'None selected: any trainee can be paired', onChange }) {
  const chosen = new Set(values.map(String));
  const hidden = el('input', { type: 'hidden', name, value: [...chosen].join(',') });
  const count = el('span', { class: 'text-xs font-bold muted' });
  const listHost = el('div', { class: 'well max-h-56 divide-y divide-slate-200 overflow-y-auto dark:divide-neutral-800' });
  let query = '';
  const sync = () => {
    hidden.value = [...chosen].join(',');
    count.textContent = chosen.size ? `${chosen.size} selected` : noneText;
    if (onChange) onChange([...chosen]);
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

/** Google Maps search link for an address (opens the Maps app on phones). */
export const mapsLink = (place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;

/** The three profiles: Admin (on top of either), Regular, Volunteer (new / ad hoc). */
export function typeBadges(p) {
  return [
    p.role === 'admin' ? badge('Admin', 'purple', 'shield') : null,
    p.volunteerType === 'regular' || p.type === 'regular' ? badge('Regular', 'emerald') : badge('Volunteer', 'indigo'),
  ];
}

/** Asks for the admin password (the shared one, not a sign-in password). Resolves to the text, or null if cancelled. */
export function passwordPrompt(title, text) {
  return new Promise((resolve) => {
    let done = false;
    const input = el('input', { type: 'password', name: 'adminPassword', class: 'input', autocomplete: 'off', 'aria-label': 'Admin password' });
    const submit = el('button', { type: 'submit', class: 'btn btn-danger' }, 'Confirm');
    const cancel = el('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancel');
    const form = el('form', { class: 'space-y-4' },
      el('p', { class: 'text-sm' }, text),
      el('label', { class: 'label', for: 'pw-confirm' }, 'Admin password'), input,
      el('div', { class: 'flex justify-end gap-2' }, cancel, submit));
    input.id = 'pw-confirm';
    const m = modal(title, form, () => { if (!done) resolve(null); });
    cancel.addEventListener('click', () => m.close());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value) { input.focus(); return; }
      done = true;
      resolve(input.value);
      m.close();
    });
  });
}

/**
 * A trainee's photo, or a placeholder when there isn't one (or it can't load).
 * size: 'sm' (list rows), 'md' (cards) or 'lg' (a trainee's page).
 */
export function traineeAvatar(t, size = 'md') {
  const placeholder = () => el('span', { class: `avatar avatar-${size} avatar-empty`, role: 'img', 'aria-label': `No photo of ${t.name} yet` }, icon('user', 'avatar-icon'));
  if (!t.photoUrl) return placeholder();
  const img = el('img', { src: t.photoUrl, alt: `Photo of ${t.name}`, loading: 'lazy', class: `avatar avatar-${size}` });
  img.addEventListener('error', () => img.replaceWith(placeholder()));
  return img;
}

/** A project's short name for badges: the code in brackets, e.g. "RSPID", else the name. */
export function projectShort(name) {
  const text = String(name || '');
  if (text.length <= 14) return text; // "West End", "RSPID (WGS)": short enough already
  const m = /\(([^()]{1,12})\)\s*$/.exec(text);
  return m ? m[1] : text;
}

/** One badge per project, with the full name on hover. */
export function projectBadges(projects) {
  return (projects || []).map((p) => {
    const b = badge(projectShort(p), 'emerald');
    b.title = p;
    return b;
  });
}

/**
 * A Singapore phone number as "+65 91234567", or null if it isn't one. Accepts
 * the 8 digits alone or with +65 / 65, with spaces or dashes. (The server checks too.)
 */
export function sgPhone(value) {
  const m = /^(?:\+65|65)?(\d{8})$/.exec(String(value || '').replace(/[\s-]/g, ''));
  return m ? `+65 ${m[1]}` : null;
}
export const PHONE_HINT = '+65 followed by 8 digits, e.g. +65 91234567.';

/** True for an email that looks like name@domain.tld (same rule as the server). */
export function isEmail(value) {
  const s = String(value || '').trim().toLowerCase();
  return /^[a-z0-9._%+-]+@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(s) && !/\.\./.test(s) && !/^\.|\.@/.test(s);
}

/* ---------- trainee details laid out like MINDS's House Visit form ---------- */

/** The form's colour for a section, by its title (same rules as the Trainee House Visit app). */
export function sectionTone(title) {
  const l = String(title || '').toLowerCase();
  if (/general|visit|volunteer/.test(l) && !/observation/.test(l)) return 'blue';
  if (/trainee/.test(l)) return 'green';
  if (/caregiver|family|emergency|background/.test(l)) return 'yellow';
  if (/medical|health/.test(l)) return 'red';
  if (/abilit|behavio/.test(l)) return 'purple';
  if (/school|work/.test(l)) return 'indigo';
  if (/observation/.test(l)) return 'pink';
  return 'slate';
}

/**
 * A form question split like the House Visit form shows it: the question, and
 * the guide text in brackets under it. "Current Health Condition （近期的身体状况）"
 * → { label: 'Current Health Condition', guide: '近期的身体状况' }. Numbered
 * questions keep their number: "Name of Caregiver / Guardian (2)".
 */
export function hvLabel(raw) {
  const text = String(raw || '').trim();
  const num = /\((\d+)\)/.exec(text);
  let label = text;
  let guide = '';
  const hyphen = /^(.+?\(\d+\))\s*[-–]\s*(.+)$/.exec(text);
  const bracket = /^(.+?)(\s*[(（].+)$/.exec(text);
  if (/^area/i.test(text)) label = text;
  else if (hyphen) { label = hyphen[1].trim(); guide = hyphen[2].trim(); }
  else if (bracket && !/^[(（][s\d]+[)）]$/i.test(bracket[2].trim())) { label = bracket[1].trim(); guide = bracket[2].trim(); }
  guide = guide.replace(/[(（]dd\/mm\/yy.*?[)）]/gi, '').replace(/\(\d+\)/g, '').replace(/\(s\)/g, '').replace(/[()（）]/g, '').trim();
  if (num && !/\(\d+\)/.test(label)) label = `${label} (${num[1]})`;
  return { label: label.replace(/\s+/g, ' '), guide };
}

/**
 * Collapsible coloured sections, one per form section, each question with its
 * guide line. sections: [{ title, fields: [{ label, value }] }].
 */
// The House Visit Form's 1–5 questions and the words at each end (same as gas/Config.gs → HOUSE_VISIT.likert).
const LIKERT_ENDS = [
  [/mobility/i, 'Need support to walk and can be clumsy', 'Agile and stable'],
  [/comprehension/i, 'Very Low (unable to follow instructions)', 'High (able to follow instructions effectively)'],
  [/verbal/i, 'Very Low (non-verbal)', 'High (able to engage in conversations)'],
];

/** A 1–5 answer drawn as the form's scale (the chosen number filled in), or null if it isn't one. */
export function likertView(f) {
  const v = String(f.value || '').trim();
  if (!/^[1-5]$/.test(v) || !(f.type === 'likert' || /^select the .*(level|ability)/i.test(String(f.label)))) return null;
  const ends = f.likert ? [f.likert.left, f.likert.right] : (LIKERT_ENDS.find(([re]) => re.test(f.label)) || [null, '1', '5']).slice(1);
  return el('div', { class: 'hv-likert hv-likert-view' },
    el('div', { class: 'hv-likert-ends' }, el('span', {}, ends[0]), el('span', {}, ends[1])),
    el('div', { class: 'hv-likert-row', 'aria-label': `${v} out of 5` },
      [1, 2, 3, 4, 5].map((n) => el('span', { class: `hv-likert-cell ${String(n) === v ? 'hv-on' : ''}` }, String(n)))));
}

/* ---- Design update: easier-to-read details pages ---- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Dates written for people: "2025-12-29T12:26:09.000Z" → "29 Dec 2025"; "2026-10-30 01:58:47" → "30 Oct 2026, 1:58 am". */
export function niceDates(value) {
  if (typeof value !== 'string') return value;
  const iso = /^(\d{4})-(\d{2})-(\d{2})T[\d:.]+Z$/.exec(value.trim());
  if (iso) {
    const d = new Date(value.trim());
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric' });
  }
  return value.replace(/\b(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2})?)?\b/g, (m, y, mo, d, h, mi) => {
    const date = `${Number(d)} ${MONTHS[Number(mo) - 1] || mo} ${y}`;
    if (h === undefined) return date;
    const hr = Number(h);
    return `${date}, ${hr % 12 || 12}:${mi} ${hr < 12 ? 'am' : 'pm'}`;
  });
}
/** Form questions as short labels: drops the "(e.g. …)" format guide, which belongs on the form. */
export function shortLabel(label) {
  const text = String(label || '');
  if (/^nric/i.test(text)) return 'NRIC (last 4)';
  return text.replace(/\s*[(（][^)）]*[)）]\s*/g, ' ').replace(/\s+/g, ' ').trim() || text;
}
const hvId = (title, i) => `hv-${i}-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
/** A row of jump buttons above the House Visit sections (opens and scrolls to one). */
export function hvJump(sections) {
  if (!sections || sections.length < 3) return null;
  return el('details', { class: 'hv-jump-menu' },
    el('summary', { class: 'btn btn-secondary btn-sm' }, icon('list', 'size-4'), 'Sections', icon('down', 'size-4')),
    el('nav', { class: 'hv-jump', 'aria-label': 'Jump to a section' }, sections.map((s, i) => {
    const b = el('button', { type: 'button', class: `hv-jump-btn section-${sectionTone(s.title)}` }, hvLabel(s.title).label.replace(/'s details$/i, ''));
    b.addEventListener('click', () => {
      const d = document.getElementById(hvId(s.title, i));
      if (!d) return;
      d.open = true;
      d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return b;
  })));
}

export function hvSections(sections, { open = true } = {}) {
  // Design update: the first two sections start open, the rest closed (jump buttons open them).
  return sections.map((s, i) => el('details', { id: hvId(s.title, i), class: 'card group mt-3 overflow-hidden', open: open && i < 2 },
    el('summary', { class: `section-head section-${sectionTone(s.title)} cursor-pointer list-none select-none` }, s.title,
      icon('down', 'size-5 transition-transform duration-200 group-open:rotate-180')),
    s.fields.length ? el('dl', { class: 'divide-y divide-slate-100 px-4 text-sm dark:divide-neutral-800' }, s.fields.map((f) => {
      const q = hvLabel(f.label);
      // Design update: label left, answer right; the form's guide text stays visible under the
      // question (as on MINDS's House Visit form; a tooltip can't be seen on a phone).
      return el('div', { class: 'hv-row' },
        el('dt', { class: 'font-semibold text-slate-500 dark:text-neutral-400' }, q.label, q.guide ? el('span', { class: 'hv-guide' }, q.guide) : null),
        el('dd', { class: 'whitespace-pre-line text-slate-900 dark:text-neutral-100' }, likertView(f) || niceDates(f.value)));
    })) : el('p', { class: 'p-4 text-sm muted' }, 'Nothing filled in yet.')));
}

/**
 * A short warning before a major change: "Warning: You are <action>. Do you
 * wish to continue?", plus the admin password when needed.
 * Resolves to { password } or null if cancelled.
 *   { action: 'making Sam Siva an admin', confirmLabel, needsPassword }
 */
export function majorActionPrompt({ action, confirmLabel = 'Continue', needsPassword = false }) {
  return new Promise((resolve) => {
    let done = false;
    const pw = needsPassword ? el('input', { type: 'password', id: 'major-pw', class: 'input', autocomplete: 'off', 'aria-label': 'Admin password' }) : null;
    const confirmBtn = el('button', { type: 'submit', class: 'btn btn-danger', disabled: Boolean(pw) }, confirmLabel);
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancel');
    if (pw) pw.addEventListener('input', () => { confirmBtn.disabled = !pw.value; });
    const form = el('form', { class: 'space-y-4' },
      el('p', { class: 'major-warning' }, el('strong', {}, 'Warning: '), `You are ${action}. Do you wish to continue?`),
      pw ? el('div', {},
        el('label', { class: 'label', for: 'major-pw' }, 'Admin password'), pw) : null,
      el('div', { class: 'flex justify-end gap-2' }, cancelBtn, confirmBtn));
    const m = modal('Warning', form, () => { if (!done) resolve(null); });
    cancelBtn.addEventListener('click', () => m.close());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (confirmBtn.disabled) return;
      done = true;
      resolve({ password: pw ? pw.value : '' });
      m.close();
    });
    if (pw) setTimeout(() => pw.focus(), 50);
  });
}

/**
 * Choosing a file: a dropdown "Import from device" / "Import from Google Drive".
 * Device: a "Choose a file or drag it here" box, then a preview of the picture or
 * PDF. Drive: a box for the link. Used by the guide infographics and trainee photos.
 *   { accept: [mime types], hint } → { el, source(), file(), driveUrl() }
 */
export function filePicker({ accept, hint }) {
  const source = el('select', { class: 'input', 'aria-label': 'Where is the file?' },
    el('option', { value: 'device' }, 'Import from device'),
    el('option', { value: 'drive' }, 'Import from Google Drive'));
  const input = el('input', { type: 'file', accept: accept.join(','), class: 'sr-only', 'aria-label': 'Choose a file' });
  const prompt = el('span', { class: 'fp-text' }, el('strong', {}, 'Choose a file'), ' or drag it here.');
  const arrow = el('span', { class: 'fp-icon', 'aria-hidden': 'true' });
  arrow.innerHTML = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6v24M14 21l10 10 10-10M6 30v10h36V30"/></svg>';
  const drop = el('label', { class: 'fp-drop' }, input, arrow, prompt);
  const preview = el('div', { class: 'fp-preview', hidden: true });
  let url = null;
  const show = (file) => {
    if (url) URL.revokeObjectURL(url);
    url = file ? URL.createObjectURL(file) : null;
    preview.hidden = !file;
    if (!file) { mount(preview, null); prompt.replaceChildren(el('strong', {}, 'Choose a file'), ' or drag it here.'); return; }
    const kb = file.size / 1024;
    // Wrong file? Remove takes it off before anything is uploaded.
    const remove = el('button', { type: 'button', class: 'fp-remove', 'aria-label': `Remove ${file.name}` }, icon('trash', 'size-4'), 'Remove');
    remove.addEventListener('click', () => { input.value = ''; show(null); });
    mount(preview,
      file.type.startsWith('image/') ? el('img', { src: url, alt: file.name, class: 'fp-img' })
        : file.type === 'application/pdf' ? el('iframe', { src: url, title: file.name, class: 'fp-pdf' })
          : null,
      el('div', { class: 'fp-foot' },
        el('p', { class: 'fp-name' }, `${file.name} · ${kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`}`),
        remove));
    prompt.replaceChildren(el('strong', {}, 'Choose another file'), ' or drag it here.');
  };
  input.addEventListener('change', () => show(input.files && input.files[0]));
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('fp-over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('fp-over')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      show(input.files[0]);
    }
  });
  const deviceBox = el('div', { class: 'space-y-2' }, drop, preview, hint ? el('p', { class: 'hint' }, hint) : null);
  const driveBox = el('div', { hidden: true }, field('driveUrl', 'Google Drive link', {
    placeholder: 'https://drive.google.com/file/d/…/view', hint: 'Right-click → Share → Copy link.',
  }));
  source.addEventListener('change', () => { deviceBox.hidden = source.value !== 'device'; driveBox.hidden = source.value !== 'drive'; });
  return {
    el: el('div', { class: 'space-y-3' }, source, deviceBox, driveBox),
    source: () => source.value,
    file: () => (input.files && input.files[0]) || null,
    driveUrl: () => driveBox.querySelector('input').value.trim(),
  };
}

/* ---------------- files attached to notes (Version 4) ---------------- */

const NOTE_FILE_LIMITS = { maxFiles: 3, maxMb: 10 }; // the same as CONFIG.NOTE_FILES on the server
const NOTE_FILE_ACCEPT = 'image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';

const fileSize = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('A file could not be read. Choose it again.'));
  r.readAsDataURL(blob);
});

/**
 * Makes a photo smaller before upload: the longest side becomes at most 1600 px, saved as
 * JPEG. Keeps the original when that wouldn't help (small photos, GIFs, or a format the
 * browser can't open, like HEIC on most non-Apple browsers).
 */
export async function shrinkPhoto(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 300 * 1024) return file;
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = URL.createObjectURL(file);
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(img.src);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (e) {
    return file;
  }
}

/**
 * "Attach files" for notes and updates, like the guide's file picker: Import from device
 * (choose or drag; each file previewed with Remove) or Import from Google Drive (a link).
 * files() resolves to what the server expects: [{ fileName, mimeType, data }] and/or [{ driveUrl }].
 */
export function attachPicker() {
  const chosen = [];
  const source = el('select', { class: 'input', 'aria-label': 'Where are the files?' },
    el('option', { value: 'device' }, 'Import from device'),
    el('option', { value: 'drive' }, 'Import from Google Drive'));
  const input = el('input', { type: 'file', multiple: true, accept: NOTE_FILE_ACCEPT, class: 'sr-only', 'aria-label': 'Choose files' });
  const arrow = el('span', { class: 'fp-icon', 'aria-hidden': 'true' });
  arrow.innerHTML = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6v24M14 21l10 10 10-10M6 30v10h36V30"/></svg>';
  const prompt = el('span', { class: 'fp-text' }, el('strong', {}, 'Choose files'), ' or drag them here.');
  const drop = el('label', { class: 'fp-drop fp-drop-sm' }, input, arrow, prompt);
  const list = el('div', { class: 'space-y-2' });
  const problem = el('p', { class: 'text-sm font-semibold text-red-600', role: 'alert', hidden: true });
  const draw = () => {
    problem.hidden = true;
    mount(list, chosen.map((f, i) => {
      const url = URL.createObjectURL(f);
      const remove = el('button', { type: 'button', class: 'fp-remove', 'aria-label': `Remove ${f.name}` }, icon('trash', 'size-4'), 'Remove');
      remove.addEventListener('click', () => { chosen.splice(i, 1); draw(); });
      return el('div', { class: 'fp-preview fp-row' },
        f.type.startsWith('image/') ? el('img', { src: url, alt: '', class: 'fp-thumb' })
          : f.type.startsWith('video/') ? el('video', { src: url, class: 'fp-thumb', muted: true, playsinline: true })
            : el('span', { class: 'fp-thumb fp-doc', 'aria-hidden': 'true' }, '📄'),
        el('p', { class: 'fp-name' }, `${f.name} · ${fileSize(f.size)}`),
        remove);
    }));
    drop.hidden = chosen.length >= NOTE_FILE_LIMITS.maxFiles;
  };
  const add = async (files) => {
    for (const f of [...files]) {
      if (chosen.length >= NOTE_FILE_LIMITS.maxFiles) break;
      chosen.push(await shrinkPhoto(f)); // photos are made smaller straight away, so the sizes shown are what's uploaded
    }
    input.value = '';
    draw();
  };
  input.addEventListener('change', () => add(input.files || []));
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('fp-over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('fp-over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer) add(e.dataTransfer.files); });
  const hint = el('p', { class: 'hint' }, `Photos, videos or documents: up to ${NOTE_FILE_LIMITS.maxFiles} files, ${NOTE_FILE_LIMITS.maxMb} MB in total. Photos are made smaller automatically; for a long video, use Import from Google Drive.`);
  const deviceBox = el('div', { class: 'space-y-2' }, drop, list);
  const driveInput = el('input', { class: 'input', type: 'url', placeholder: 'https://drive.google.com/file/d/…/view', 'aria-label': 'Google Drive link' });
  const driveBox = el('div', { hidden: true, class: 'space-y-1' }, driveInput, el('p', { class: 'hint' }, 'Right-click → Share → Copy link.'));
  source.addEventListener('change', () => { deviceBox.hidden = source.value !== 'device'; driveBox.hidden = source.value !== 'drive'; });
  const wrap = el('details', { class: 'attach' },
    el('summary', { class: 'attach-summary' }, icon('plus', 'size-4'), 'Attach files (optional)'),
    el('div', { class: 'mt-3 space-y-3' }, source, deviceBox, driveBox, hint, problem));
  return {
    el: wrap,
    /** Throws (with a message to show) if the files are too big together. */
    async files() {
      const out = [];
      const total = chosen.reduce((n, f) => n + f.size, 0);
      if (total > NOTE_FILE_LIMITS.maxMb * 1024 * 1024) {
        throw new Error(`The files are ${fileSize(total)} together: keep them under ${NOTE_FILE_LIMITS.maxMb} MB, or use Import from Google Drive for a long video.`);
      }
      for (const f of chosen) out.push({ fileName: f.name, mimeType: f.type || 'application/octet-stream', data: await readAsDataUrl(f) });
      const link = driveInput.value.trim();
      if (link) out.push({ driveUrl: link });
      return out.length ? out : undefined;
    },
    clear() { chosen.length = 0; driveInput.value = ''; draw(); wrap.open = false; },
  };
}

/** A note's attached files as chips; tapping one opens it (ref: { noteId } or { feedbackId }). */
export function attachmentList(attachments, ref) {
  if (!attachments || !attachments.length) return null;
  return el('div', { class: 'mt-2 flex flex-wrap gap-2' }, attachments.map((a) => {
    const chip = el('button', { type: 'button', class: 'attach-chip', title: `Open ${a.name}` },
      el('span', { 'aria-hidden': 'true' }, a.type.startsWith('image/') ? '🖼️' : a.type.startsWith('video/') ? '🎬' : a.type.startsWith('audio/') ? '🎵' : '📎'),
      el('span', { class: 'truncate' }, a.name));
    chip.addEventListener('click', () => busy(chip, 'Opening…', async () => {
      const { call } = await import('./api.js');
      const f = await call('noteFile', { ...ref, fileId: a.id });
      const bytes = Uint8Array.from(atob(f.data), (ch) => ch.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: f.mimeType }));
      const t = f.mimeType || '';
      const view = t.startsWith('image/') ? el('img', { src: url, alt: f.name, class: 'max-h-[70vh] w-full rounded-xl object-contain' })
        : t.startsWith('video/') ? el('video', { src: url, controls: true, playsinline: true, class: 'max-h-[70vh] w-full rounded-xl' })
          : t.startsWith('audio/') ? el('audio', { src: url, controls: true, class: 'w-full' })
            : t === 'application/pdf' ? el('iframe', { src: url, title: f.name, class: 'h-[70vh] w-full rounded-xl border' })
              : el('p', { class: 'text-sm' }, 'This kind of file opens in another app.');
      modal(f.name, el('div', { class: 'space-y-3' }, view,
        el('a', { href: url, download: f.name, class: 'btn btn-secondary w-full' }, icon('download', 'size-4'), 'Download')));
    }));
    return chip;
  }));
}

