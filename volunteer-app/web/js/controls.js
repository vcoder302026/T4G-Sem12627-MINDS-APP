// Form controls shared with MINDS's other apps, applied to every screen
// automatically (a MutationObserver), so pages keep using plain inputs:
//
//   <input type="date">      → the House Visit app's "Rolodex" picker: a sheet with
//                              day / month / year wheels, Cancel and Confirm.
//                              The real input stays (hidden) and keeps its value,
//                              min, max and events, so forms read it as before.
//   <input type="password">  → a show / hide eye button, as in the House Visit
//                              and Overseas Trip Planner logins (form fields made
//                              by ui.js field() already have one: data-eye).
//
// installControls() is called once by app.js.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ROW = 40; // px, one wheel row
const pad = (n) => String(n).padStart(2, '0');
const daysIn = (m, y) => new Date(y, m + 1, 0).getDate();

function make(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  });
  kids.flat().forEach((c) => { if (c !== null && c !== undefined) node.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return node;
}

/** "Tue, 14 Oct 2026" from "2026-10-14". */
function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${DAYS[d.getDay()]}, ${Number(m[3])} ${MONTHS[d.getMonth()]} ${m[1]}`;
}

/* ---------------- wheel date picker ---------------- */

function openWheel(input, display) {
  const today = new Date();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? input.value
    : input.max && input.max < `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}` ? input.max
      : `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const sel = { y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1, d: Number(start.slice(8, 10)) };
  const minY = input.min ? Number(input.min.slice(0, 4)) : 1940;
  const maxY = input.max ? Number(input.max.slice(0, 4)) : today.getFullYear() + 5;
  const years = [];
  for (let y = minY; y <= maxY; y += 1) years.push(y);
  if (!years.includes(sel.y)) sel.y = Math.min(Math.max(sel.y, minY), maxY);

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); display.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };

  const wheel = (key, items, label) => {
    const col = make('div', { class: 'wheel-col', role: 'listbox', 'aria-label': label, tabindex: '0' });
    const fill = () => {
      col.replaceChildren(make('div', { class: 'wheel-pad' }),
        ...items().map((it) => make('div', {
          class: 'wheel-item', 'data-value': it.value, onclick: () => col.scrollTo({ top: it.index * ROW, behavior: 'smooth' }),
        }, it.text)),
        make('div', { class: 'wheel-pad' }));
    };
    let timer = null;
    const mark = () => {
      [...col.querySelectorAll('.wheel-item')].forEach((n) => n.classList.toggle('wheel-on', Number(n.dataset.value) === sel[key]));
    };
    col.addEventListener('scroll', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const list = items();
        const i = Math.max(0, Math.min(list.length - 1, Math.round(col.scrollTop / ROW)));
        if (sel[key] !== list[i].value) {
          sel[key] = list[i].value;
          if (key !== 'd') refreshDays();
        }
        mark();
      }, 80);
    });
    // Computers: drag the wheel with the mouse. Phones: a small vibration on each step.
    let drag = null;
    col.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      drag = { y: e.clientY, top: col.scrollTop, moved: false };
      col.style.scrollSnapType = 'none';
    });
    col.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const walk = (e.clientY - drag.y) * 1.5;
      if (Math.abs(walk) > 5) drag.moved = true;
      col.scrollTop = drag.top - walk;
    });
    const endDrag = () => {
      if (!drag) return;
      col.style.scrollSnapType = '';
      col.scrollTo({ top: Math.round(col.scrollTop / ROW) * ROW, behavior: 'smooth' });
      setTimeout(() => { drag = null; }, 0);
    };
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => col.addEventListener(t, endDrag));
    col.addEventListener('click', (e) => { if (drag && drag.moved) { e.stopPropagation(); e.preventDefault(); } }, true);
    let lastRow = -1;
    col.addEventListener('scroll', () => {
      const row = Math.round(col.scrollTop / ROW);
      if (lastRow !== -1 && row !== lastRow && navigator.vibrate) navigator.vibrate(10);
      lastRow = row;
    }, { passive: true });
    col.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      col.scrollBy({ top: e.key === 'ArrowDown' ? ROW : -ROW, behavior: 'smooth' });
    });
    const show = () => {
      const i = items().findIndex((it) => it.value === sel[key]);
      col.scrollTop = Math.max(0, i) * ROW;
      mark();
    };
    return { col, fill, show };
  };
  const dayWheel = wheel('d', () => Array.from({ length: daysIn(sel.m, sel.y) }, (_, i) => ({ value: i + 1, text: String(i + 1), index: i })), 'Day');
  const monthWheel = wheel('m', () => MONTHS.map((t, i) => ({ value: i, text: t, index: i })), 'Month');
  const yearWheel = wheel('y', () => years.map((y, i) => ({ value: y, text: String(y), index: i })), 'Year');
  function refreshDays() {
    sel.d = Math.min(sel.d, daysIn(sel.m, sel.y));
    dayWheel.fill();
    dayWheel.show();
  }

  const confirm = () => {
    const iso = `${sel.y}-${pad(sel.m + 1)}-${pad(sel.d)}`;
    if ((input.min && iso < input.min) || (input.max && iso > input.max)) {
      note.textContent = input.min && iso < input.min ? `Choose ${formatDate(input.min)} or later.` : `Choose ${formatDate(input.max)} or earlier.`;
      note.hidden = false;
      return;
    }
    setValue(input, display, iso);
    close();
  };
  const note = make('p', { class: 'wheel-note', role: 'alert', hidden: true });
  const clearBtn = input.required ? null : make('button', { type: 'button', class: 'btn btn-secondary', onclick: () => { setValue(input, display, ''); close(); } }, 'Clear');
  const sheet = make('div', { class: 'wheel-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Select date' },
    make('div', { class: 'wheel-head' },
      make('h3', { class: 'wheel-title' }, 'Select date'),
      make('button', { type: 'button', class: 'wheel-x', 'aria-label': 'Close', onclick: close }, '✕')),
    make('div', { class: 'wheel-box' }, make('div', { class: 'wheel-band', 'aria-hidden': 'true' }), dayWheel.col, monthWheel.col, yearWheel.col),
    note,
    make('div', { class: 'wheel-actions' },
      clearBtn,
      make('button', { type: 'button', class: 'btn btn-secondary', onclick: close }, 'Cancel'),
      make('button', { type: 'button', class: 'btn btn-primary', onclick: confirm }, 'Confirm')));
  const overlay = make('div', { class: 'wheel-overlay', onclick: (e) => { if (e.target === overlay) close(); } }, sheet);
  // Inside an open pop-up (<dialog>), the sheet must sit in it to be clickable.
  const host = display.closest('dialog[open]') || document.body;
  host.append(overlay);
  document.addEventListener('keydown', onKey, true);
  [dayWheel, monthWheel, yearWheel].forEach((w) => { w.fill(); w.show(); });
  dayWheel.col.focus({ preventScroll: true });
}

function setValue(input, display, iso) {
  input.value = iso;
  syncDisplay(input, display);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function syncDisplay(input, display) {
  display.textContent = input.value ? formatDate(input.value) : (input.placeholder || 'Select date');
  display.classList.toggle('wheel-empty', !input.value);
}

function enhanceDate(input) {
  if (input.dataset.wheel) return;
  input.dataset.wheel = '1';
  const display = make('button', {
    type: 'button', class: 'input wheel-display', 'aria-haspopup': 'dialog',
    'aria-label': input.getAttribute('aria-label') || null,
  });
  input.hidden = true;
  input.after(display);
  syncDisplay(input, display);
  display.addEventListener('click', () => openWheel(input, display));
  input.addEventListener('change', () => syncDisplay(input, display));
  input.addEventListener('input', () => syncDisplay(input, display));
  input.focus = () => display.focus(); // forms that focus a missing date focus the button instead
  if (input.id) {
    display.id = `${input.id}-picker`;
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label) label.addEventListener('click', (e) => { e.preventDefault(); openWheel(input, display); });
  }
}

/* ---------------- show / hide password ---------------- */

const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>';

function enhancePassword(input) {
  if (input.dataset.eye) return;
  input.dataset.eye = '1';
  const wrap = make('span', { class: 'pw-wrap' });
  input.before(wrap);
  wrap.append(input);
  const btn = make('button', { type: 'button', class: 'pw-eye', 'aria-label': 'Show password', title: 'Show password' });
  btn.innerHTML = EYE;
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = show ? EYE_OFF : EYE;
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    btn.title = btn.getAttribute('aria-label');
  });
  wrap.append(btn);
}

/* ---------------- apply everywhere ---------------- */

function enhance(root) {
  if (!root || !root.querySelectorAll) return;
  if (root.matches && root.matches('input[type=date]')) enhanceDate(root);
  if (root.matches && root.matches('input[type=password]')) enhancePassword(root);
  root.querySelectorAll('input[type=date]:not([data-wheel])').forEach(enhanceDate);
  root.querySelectorAll('input[type=password]:not([data-eye])').forEach(enhancePassword);
}

export function installControls() {
  enhance(document.body);
  new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => { if (n.nodeType === 1) enhance(n); })))
    .observe(document.body, { childList: true, subtree: true });
}
