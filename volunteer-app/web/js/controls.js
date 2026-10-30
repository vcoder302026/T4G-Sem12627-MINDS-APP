// Form controls shared with MINDS's other apps, applied to every screen
// automatically (a MutationObserver), so pages keep using plain inputs:
//
//   <input type="date">      → left as the browser's own calendar (MINDS asked for it, as in
//                              the outing app). enhanceDate (the House Visit "Rolodex"
//                              picker) is kept below in case it's wanted again:
//                              day / month / year wheels, Cancel and Confirm.
//                              The real input stays (hidden) and keeps its value,
//                              min, max and events, so forms read it as before.
//   <select>                 → the app's own list sheet (✓ on the current option,
//                              search for long lists), the same on every phone
//   <input type="time">      → an HH · MM wheel, like the template's Rolodex
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

  const close = () => { if (!overlay.isConnected) return; overlay.remove(); document.removeEventListener('keydown', onKey, true); if (display.isConnected) display.focus({ preventScroll: true }); };
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
  window.addEventListener('hashchange', close, { once: true }); // Back, or any page change, closes it
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

/* ---------------- date boxes on iPhone and iPad ---------------- */

// Safari on iPhone and iPad shows an empty date box as blank (other browsers show the date
// format), so an empty one says "Any date" (a filter) or "Choose a date" (a form) until a date is
// picked. Only on those devices: elsewhere the box is left exactly as it is.
const IOS_SAFARI = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('-webkit-touch-callout', 'none');

function enhanceDateHint(input) {
  if (!IOS_SAFARI || input.dataset.hint || input.hidden) return;
  input.dataset.hint = '1';
  const wrap = make('span', { class: 'date-wrap' });
  const hint = make('span', { class: 'date-ph', 'aria-hidden': 'true' });
  hint.textContent = input.getAttribute('data-empty') || (input.closest('form') ? 'Choose a date' : 'Any date');
  input.before(wrap);
  wrap.append(input, hint);
  const sync = () => wrap.classList.toggle('is-empty', !input.value);
  input.addEventListener('input', sync);
  input.addEventListener('change', sync);
  sync();
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

/* ---------------- dropdowns (<select>) as a list sheet ---------------- */
// Phones (and Chrome's phone emulator) draw native dropdowns differently, some
// as a tiny box in a corner. This shows every <select> as the app's own list:
// a sheet with the options, a ✓ on the current one, and a search box for long
// lists, opening right below the box. The real <select> stays (hidden) with its value and events.

const nativeSelectValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const nativeSelectIndex = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

function openList(select, display) {
  const opts = [...select.options].filter((o) => !o.hidden);
  const labelEl = select.id ? document.querySelector(`label[for="${CSS.escape(select.id)}"]`) : null;
  const title = (labelEl && labelEl.textContent.trim()) || select.getAttribute('aria-label') || 'Choose';
  let close = () => { if (!pop.isConnected) return; pop.remove(); document.removeEventListener('keydown', onKey, true); if (display.isConnected) display.focus({ preventScroll: true }); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  const choose = (value) => {
    nativeSelectValue.set.call(select, value);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  };
  const list = make('div', { class: 'list-rows', role: 'listbox', 'aria-label': title });
  const draw = (q = '') => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = opts.filter((o) => words.every((w) => o.text.toLowerCase().includes(w)));
    list.replaceChildren(...shown.map((o) => {
      const on = o.value === select.value;
      return make('button', {
        type: 'button', class: `list-row${on ? ' list-on' : ''}`, role: 'option', 'aria-selected': String(on), disabled: o.disabled || null,
        onclick: () => choose(o.value),
      }, make('span', { class: 'list-tick', 'aria-hidden': 'true' }, on ? '✓' : ''), make('span', { class: 'list-text' }, o.text));
    }));
    if (!shown.length) list.append(make('p', { class: 'list-empty' }, 'No matches.'));
  };
  const search = opts.length > 8 ? make('input', { type: 'search', class: 'input search-input list-search', placeholder: 'Search…', 'aria-label': `Search: ${title}` }) : null;
  if (search) search.addEventListener('input', () => { draw(search.value); place(); });
  // A dropdown right below the box (or just above it when there's no room below),
  // the same width as the box. No layer covers the page: a tap or swipe anywhere
  // else closes it and still does what it would have done (scrolling never stops).
  const pop = make('div', { class: 'list-pop', role: 'dialog', 'aria-label': title }, search, list);
  const place = () => {
    if (!pop.isConnected) return;
    if (!display.isConnected) { close(); return; } // the page redrew under it
    const r = display.getBoundingClientRect();
    const gap = 6;
    const edge = 8;
    const below = window.innerHeight - r.bottom - gap - edge;
    const above = r.top - gap - edge;
    pop.style.left = `${Math.max(edge, r.left)}px`;
    pop.style.width = `${Math.min(r.width, window.innerWidth - 2 * edge)}px`;
    const natural = Math.min(pop.scrollHeight, 360);
    const down = below >= natural || below >= above;
    pop.style.maxHeight = `${Math.max(120, Math.min(360, down ? below : above))}px`;
    if (down) { pop.style.top = `${r.bottom + gap}px`; pop.style.bottom = ''; } else { pop.style.bottom = `${window.innerHeight - r.top + gap}px`; pop.style.top = ''; }
  };
  const replace = () => place();
  const outside = (e) => { if (!pop.contains(e.target) && !display.contains(e.target)) close(); };
  const onPage = () => close();
  const cleanup = () => {
    window.removeEventListener('scroll', replace, true);
    window.removeEventListener('resize', replace);
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('hashchange', onPage);
  };
  const baseClose = close;
  close = () => { cleanup(); baseClose(); };
  (display.closest('dialog[open]') || document.body).append(pop);
  document.addEventListener('pointerdown', outside, true); // never prevented: the tap / swipe goes on as normal
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', onPage); // Back, or any page change, closes it
  window.addEventListener('scroll', replace, true); // follows the box if the page scrolls
  window.addEventListener('resize', replace); // e.g. the phone keyboard opening for the search box
  display.listPop = pop; // the box knows its open list (a second tap doesn't open another)
  draw();
  place();
  const current = list.querySelector('.list-on');
  if (current) current.scrollIntoView({ block: 'nearest' });
  (search || current || list.querySelector('.list-row'))?.focus({ preventScroll: true });
}

function enhanceSelect(select) {
  if (select.dataset.list || select.multiple || select.size > 1) return;
  select.dataset.list = '1';
  const display = make('button', {
    type: 'button', class: `${select.className} select-display`, 'aria-haspopup': 'listbox',
    'aria-label': select.getAttribute('aria-label') || null,
  });
  const sync = () => {
    const o = select.options[nativeSelectIndex.get.call(select)];
    display.replaceChildren(make('span', { class: 'select-text' }, o ? o.text : ''), make('span', { class: 'select-chev', 'aria-hidden': 'true' }));
    display.disabled = select.disabled;
  };
  // Code that sets the value directly (select.value = …) updates the button too.
  Object.defineProperty(select, 'value', { configurable: true, get() { return nativeSelectValue.get.call(this); }, set(v) { nativeSelectValue.set.call(this, v); sync(); } });
  Object.defineProperty(select, 'selectedIndex', { configurable: true, get() { return nativeSelectIndex.get.call(this); }, set(v) { nativeSelectIndex.set.call(this, v); sync(); } });
  select.addEventListener('change', sync);
  new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected', 'disabled'] });
  select.hidden = true;
  select.after(display);
  display.addEventListener('click', () => { if (display.listPop && display.listPop.isConnected) return; openList(select, display); });
  select.focus = () => display.focus();
  if (select.id) {
    display.id = `${select.id}-picker`;
    const label = document.querySelector(`label[for="${CSS.escape(select.id)}"]`);
    if (label) label.addEventListener('click', (e) => { e.preventDefault(); openList(select, display); });
  }
  sync();
}

/* ---------------- time wheel (HH · MM), like the template's Rolodex ---------------- */

/** "14:30" → "2:30 pm". */
function formatTime(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(v || '');
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

function openTimeWheel(input, display) {
  const m = /^(\d{1,2}):(\d{2})/.exec(input.value || '') || [null, '14', '30'];
  const sel = { h: Number(m[1]), m: Number(m[2]) };
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
  if (minutes.indexOf(sel.m) === -1) { minutes.push(sel.m); minutes.sort((a, b) => a - b); }
  const close = () => { if (!overlay.isConnected) return; overlay.remove(); document.removeEventListener('keydown', onKey, true); if (display.isConnected) display.focus({ preventScroll: true }); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  const column = (key, values, text, label) => {
    const col = make('div', { class: 'wheel-col', role: 'listbox', 'aria-label': label, tabindex: '0' },
      make('div', { class: 'wheel-pad' }),
      values.map((v, i) => make('div', { class: 'wheel-item', 'data-value': v, onclick: () => col.scrollTo({ top: i * ROW, behavior: 'smooth' }) }, text(v))),
      make('div', { class: 'wheel-pad' }));
    const mark = () => col.querySelectorAll('.wheel-item').forEach((n) => n.classList.toggle('wheel-on', Number(n.dataset.value) === sel[key]));
    let timer = null;
    let last = -1;
    col.addEventListener('scroll', () => {
      const row = Math.round(col.scrollTop / ROW);
      if (last !== -1 && row !== last && navigator.vibrate) navigator.vibrate(10);
      last = row;
      clearTimeout(timer);
      timer = setTimeout(() => { sel[key] = values[Math.max(0, Math.min(values.length - 1, row))]; mark(); }, 80);
    }, { passive: true });
    col.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      col.scrollBy({ top: e.key === 'ArrowDown' ? ROW : -ROW, behavior: 'smooth' });
    });
    return { col, show: () => { col.scrollTop = Math.max(0, values.indexOf(sel[key])) * ROW; mark(); } };
  };
  const hours = column('h', Array.from({ length: 24 }, (_, i) => i), (v) => `${v % 12 || 12} ${v < 12 ? 'am' : 'pm'}`, 'Hour');
  const mins = column('m', minutes, (v) => pad(v), 'Minutes');
  const set = (v) => {
    input.value = v;
    syncTime(input, display);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  };
  const clearBtn = input.required ? null : make('button', { type: 'button', class: 'btn btn-secondary', onclick: () => set('') }, 'Clear');
  const sheet = make('div', { class: 'wheel-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Select time' },
    make('div', { class: 'wheel-head' },
      make('h3', { class: 'wheel-title' }, 'Select time'),
      make('button', { type: 'button', class: 'wheel-x', 'aria-label': 'Close', onclick: close }, '✕')),
    make('div', { class: 'wheel-box' }, make('div', { class: 'wheel-band', 'aria-hidden': 'true' }), hours.col, mins.col),
    make('div', { class: 'wheel-actions' },
      clearBtn,
      make('button', { type: 'button', class: 'btn btn-secondary', onclick: close }, 'Cancel'),
      make('button', { type: 'button', class: 'btn btn-primary', onclick: () => set(`${pad(sel.h)}:${pad(sel.m)}`) }, 'Confirm')));
  const overlay = make('div', { class: 'wheel-overlay', onclick: (e) => { if (e.target === overlay) close(); } }, sheet);
  (display.closest('dialog[open]') || document.body).append(overlay);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', close, { once: true }); // Back, or any page change, closes it
  hours.show();
  mins.show();
  hours.col.focus({ preventScroll: true });
}

function syncTime(input, display) {
  display.textContent = input.value ? formatTime(input.value) : (input.placeholder || 'Select time');
  display.classList.toggle('wheel-empty', !input.value);
}

function enhanceTime(input) {
  if (input.dataset.wheel) return;
  input.dataset.wheel = '1';
  const display = make('button', { type: 'button', class: 'input wheel-display', 'aria-haspopup': 'dialog', 'aria-label': input.getAttribute('aria-label') || null });
  input.hidden = true;
  input.after(display);
  syncTime(input, display);
  display.addEventListener('click', () => openTimeWheel(input, display));
  input.addEventListener('change', () => syncTime(input, display));
  input.addEventListener('input', () => syncTime(input, display));
  input.focus = () => display.focus();
  if (input.id) {
    display.id = `${input.id}-picker`;
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label) label.addEventListener('click', (e) => { e.preventDefault(); openTimeWheel(input, display); });
  }
}

/* ---------------- apply everywhere ---------------- */

function enhance(root) {
  if (!root || !root.querySelectorAll) return;
  if (root.matches && root.matches('input[type=password]')) enhancePassword(root);
  if (root.matches && root.matches('input[type=time]')) enhanceTime(root);
  if (root.matches && root.matches('select')) enhanceSelect(root);
  root.querySelectorAll('input[type=time]:not([data-wheel])').forEach(enhanceTime);
  root.querySelectorAll('input[type=password]:not([data-eye])').forEach(enhancePassword);
  root.querySelectorAll('select:not([data-list])').forEach(enhanceSelect);
  if (root.matches && root.matches('input[type=date]')) enhanceDateHint(root);
  root.querySelectorAll('input[type=date]:not([data-hint])').forEach(enhanceDateHint);
}

export function installControls() {
  enhance(document.body);
  new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => { if (n.nodeType === 1) enhance(n); })))
    .observe(document.body, { childList: true, subtree: true });
}
