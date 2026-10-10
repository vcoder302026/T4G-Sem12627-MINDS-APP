// Safe DOM helpers, notices and shared formatters.
// All dynamic text is rendered with textContent; innerHTML is never used.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (key === 'value') node.value = value;
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      node.append(String(child));
    } else if (child instanceof Node) {
      node.appendChild(child);
    }
  }
}

export function clearNode(node) {
  node.replaceChildren();
}

export function notice(kind, message) {
  const node = el(
    'div',
    { class: `notice notice-${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    String(message)
  );
  return node;
}

export function errorNotice(err) {
  const message = err instanceof Error ? err.message : 'Something went wrong.';
  return notice('error', message);
}

export function loadingState(message = 'Loading…') {
  return el('div', { class: 'loading', 'aria-live': 'polite' }, message);
}

export function emptyState(message) {
  return el('div', { class: 'empty' }, message);
}

export function pageError(err) {
  const wrap = el('div', {});
  wrap.appendChild(el('h1', {}, 'Something went wrong'));
  wrap.appendChild(errorNotice(err));
  return wrap;
}

// Builds a <table class="data"> from header labels and row cell nodes.
export function table(headers, rows) {
  const thead = el('thead', {}, el('tr', {}, ...headers.map((label) => el('th', { scope: 'col' }, label))));
  const tbody = el('tbody', {});
  for (const row of rows) {
    tbody.appendChild(el('tr', {}, ...row.map((cell) => el('td', {}, cell))));
  }
  return el('div', { class: 'table-wrap' }, el('table', { class: 'data' }, thead, tbody));
}

// Form field helpers.
export function field(labelText, input, { wide = false } = {}) {
  const label = el('label', {}, labelText);
  label.appendChild(input);
  return el('div', { class: `field${wide ? ' field-wide' : ''}` }, label);
}

export function textInput(name, { value = '', placeholder = '', required = false, type = 'text' } = {}) {
  return el('input', {
    type,
    name,
    value,
    placeholder,
    ...(required ? { required: true } : {}),
  });
}

export function textareaInput(name, { value = '', placeholder = '', rows = 3 } = {}) {
  const node = el('textarea', { name, rows, placeholder });
  node.value = value;
  return node;
}

export function dateInput(name, { value = '', required = false } = {}) {
  return el('input', {
    type: 'date',
    name,
    value,
    ...(required ? { required: true } : {}),
  });
}

export function selectInput(name, options, { value = '', required = false } = {}) {
  const select = el('select', { name, ...(required ? { required: true } : {}) });
  for (const option of options) {
    const opt = el('option', { value: option.value }, option.label);
    if (String(option.value) === String(value)) opt.selected = true;
    select.appendChild(opt);
  }
  return select;
}

export function button(label, { kind = '', small = false, type = 'button', onClick } = {}) {
  const classes = ['btn'];
  if (kind) classes.push(`btn-${kind}`);
  if (small) classes.push('btn-small');
  const node = el('button', { type, class: classes.join(' ') }, label);
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

let busyState = new WeakMap();
export function setBusy(btn, busy, busyLabel = 'Saving…') {
  if (busy) {
    busyState.set(btn, btn.textContent);
    btn.disabled = true;
    btn.textContent = busyLabel;
  } else {
    btn.disabled = false;
    const original = busyState.get(btn);
    if (original !== undefined) btn.textContent = original;
  }
}

// ---------- formatters ----------

// Single SGD money formatter: integer cents -> "SGD 12.50".
export function formatMoney(cents) {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const centsPart = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}SGD ${dollars.toLocaleString('en-SG')}.${centsPart}`;
}

// Exact integer cents from user input; null when invalid.
// Accepts at most two decimal places.
export function parseMoneyInput(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

// Singapore timestamp formatter for stored UTC ISO instants.
export function formatSGTimestamp(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', {
    timeZone: 'Asia/Singapore',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// Calendar date (YYYY-MM-DD) formatter — displays the date as stored.
export function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatHours(hours) {
  if (hours === null || hours === undefined) return '—';
  return `${hours.toFixed(2)} h`;
}

export function chip(text, kind = '') {
  return el('span', { class: `chip${kind ? ` chip-${kind}` : ''}` }, text);
}

// Today's calendar date in Asia/Singapore, for date input defaults.
export function todayInSingapore() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}
