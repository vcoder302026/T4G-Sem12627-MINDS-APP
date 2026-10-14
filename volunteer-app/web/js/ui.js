// DOM helpers, icons and formatters.
// As in the original prototype, data is only ever rendered with textContent
// (via el()); innerHTML is used solely for the fixed icon markup below.

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

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5"/>',
  pass: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v3h6V3M9 12h2v2H9zM13 12h2v2h-2zM9 16h2M13 16h2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>',
  people: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 19c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.3c1.8.7 3 2.2 3.5 4.7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  phone: '<path d="M6.6 3.5 9 3l2 4.5-2.3 1.6a11 11 0 0 0 6.2 6.2L16.5 13l4.5 2-.5 2.4A2.5 2.5 0 0 1 18 20 15 15 0 0 1 4 6a2.5 2.5 0 0 1 2.6-2.5z"/>',
  send: '<path d="m21 4-18 7 6.5 2.5L12 20l3-5.5L21 4zM9.5 13.5 21 4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  star: '<path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z"/>',
};

export function icon(name, cls = 'size-6') {
  const span = document.createElement('span');
  span.className = `inline-flex shrink-0 ${cls}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="size-full">${ICONS[name] || ''}</svg>`;
  return span;
}

let toastTimer = null;
export function toast(message, kind = 'ok') {
  const host = document.getElementById('toast');
  const colours = { ok: 'bg-ink text-white', error: 'bg-stop text-white', warn: 'bg-strap text-ink' };
  host.replaceChildren(el('div', { class: `pointer-events-auto max-w-md rounded-lg px-4 py-3 font-bold shadow-lg flash ${colours[kind] || colours.ok}` }, message));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.replaceChildren(), kind === 'error' ? 6000 : 3500);
}

/** Disables a button while an async action runs; shows the error as a toast. */
export async function busy(button, label, action) {
  const original = button.textContent;
  button.disabled = true;
  if (label) button.textContent = label;
  try {
    return await action();
  } catch (err) {
    toast(err.message || 'Something went wrong.', 'error');
    return undefined;
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      if (label) button.textContent = original;
    }
  }
}

export function loading(text = 'Loading…') {
  return el('div', { class: 'py-16 text-center text-ink-soft', 'aria-live': 'polite' }, text);
}

export function errorBlock(err, retry) {
  return el('div', { class: 'rounded-lg border border-stop/30 bg-stop-tint p-4', role: 'alert' },
    el('p', { class: 'font-bold text-stop' }, err.message || 'Something went wrong.'),
    retry ? el('button', { class: 'btn btn-quiet btn-sm mt-3', onclick: retry }, 'Try again') : null);
}

export function chip(text, tone = 'quiet') {
  const tones = {
    quiet: 'bg-line/60 text-ink',
    go: 'bg-go-tint text-go-dark',
    strap: 'bg-strap-tint text-ink',
    out: 'bg-out-tint text-out',
    stop: 'bg-stop-tint text-stop',
  };
  return el('span', { class: `chip ${tones[tone] || tones.quiet}` }, text);
}

export function statusChip(status) {
  if (status === 'confirmed') return chip('Confirmed', 'go');
  if (status === 'pending') return chip('Pending', 'strap');
  if (status === 'cancelled') return chip('Cancelled', 'stop');
  return chip(status);
}

export function backLink(href, text = 'Back') {
  return el('a', { href, class: 'mb-3 inline-flex items-center gap-1 text-sm font-bold text-go' }, icon('back', 'size-4'), text);
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

/** Like node.replaceChildren(), but accepts nested arrays and skips null/false. */
export function mount(node, ...children) {
  node.replaceChildren(...children.flat(Infinity)
    .filter((c) => c !== null && c !== undefined && c !== false)
    .map((c) => (c instanceof Node ? c : String(c))));
  return node;
}
