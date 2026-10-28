// Drag and drop for phones and computers (pointer events: touch, pen and mouse).
//
//   pairDrag(root, onDrop)   the pairing board, as in the WERONE outing app's
//                            manual pairing page: drag a card sideways onto a
//                            card in the other column to pair them. Moving up
//                            and down still scrolls the column, a tap still opens
//                            the pick list, and press and hold still shows details.
//   sortable(list, onEnd)    the guide editor: drag a row by its handle (⠿) to
//                            reorder; with the keyboard, focus the handle and use
//                            the arrow keys.

const START_PX = 8; // movement before a drag starts (a smaller wobble is a tap)

/**
 * Cards are elements with data-dnd-role ("vol" or "tr") and data-dnd-key.
 * onDrop(source, target) gets { role, key, el } for each; only drops on the
 * other role count. Returns a function that removes the listeners.
 *
 * Touch uses touch events, as the outing app does: a move that starts more
 * sideways than up or down becomes a drag (and stops the page scrolling), any
 * other move scrolls as usual. The mouse uses pointer events.
 */
export function pairDrag(root, onDrop) {
  let drag = null;
  let suppressClickUntil = 0;

  const cardAt = (x, y) => {
    const node = document.elementFromPoint(x, y);
    return node && node.closest ? node.closest('[data-dnd-role]') : null;
  };
  const clear = () => root.querySelectorAll('.dnd-over').forEach((n) => n.classList.remove('dnd-over'));
  const place = (x, y) => {
    drag.ghost.style.transform = `translate3d(${x - drag.w / 2}px, ${y - drag.h / 2}px, 0) scale(1.04)`;
  };
  // Near the top or bottom of a scrolling column, scroll it so far cards can be reached.
  const autoScroll = (x, y) => {
    const card = cardAt(x, y);
    const list = card ? card.closest('.pb-list') : null;
    if (!list) return;
    const r = list.getBoundingClientRect();
    if (y < r.top + 48) list.scrollTop -= 12;
    else if (y > r.bottom - 48) list.scrollTop += 12;
  };

  const begin = (target, x, y, touch) => {
    if (drag) return;
    if (target.closest('button.pb-x, button.pb-add, input, select, textarea')) return; // the ✕ and + buttons work as buttons
    const card = target.closest('[data-dnd-role]');
    if (!card || !root.contains(card)) return;
    drag = { card, x, y, on: false, touch };
  };

  /** Returns true while dragging (the caller then stops the page scrolling). */
  const moveTo = (x, y) => {
    if (!drag) return false;
    if (!drag.on) {
      const dx = Math.abs(x - drag.x);
      const dy = Math.abs(y - drag.y);
      if (dx < START_PX && dy < START_PX) return false;
      if (drag.touch && dy >= dx) { drag = null; return false; } // up or down: let the column scroll
      const name = drag.card.querySelector('.pb-name') || drag.card;
      const r = name.getBoundingClientRect();
      drag.w = r.width;
      drag.h = r.height;
      drag.ghost = name.cloneNode(true);
      drag.ghost.classList.add('dnd-ghost');
      drag.ghost.style.width = `${r.width}px`;
      document.body.append(drag.ghost);
      drag.card.classList.add('dnd-source');
      drag.on = true;
      if (drag.touch && navigator.vibrate) navigator.vibrate(15);
    }
    drag.lx = x; // where the finger or pointer last was: the drop point
    drag.ly = y;
    place(x, y);
    autoScroll(x, y);
    const over = cardAt(x, y);
    clear();
    if (over && root.contains(over) && over.dataset.dndRole !== drag.card.dataset.dndRole) over.classList.add('dnd-over');
    return true;
  };

  const finish = (x, y, cancelled) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.on) return;
    d.ghost.remove();
    d.card.classList.remove('dnd-source');
    clear();
    suppressClickUntil = Date.now() + 400; // the click after a drag shouldn't open the pick list
    if (cancelled) return;
    const over = cardAt(d.lx === undefined ? x : d.lx, d.ly === undefined ? y : d.ly);
    if (!over || !root.contains(over) || over.dataset.dndRole === d.card.dataset.dndRole) return;
    onDrop({ role: d.card.dataset.dndRole, key: d.card.dataset.dndKey, el: d.card }, { role: over.dataset.dndRole, key: over.dataset.dndKey, el: over });
  };

  // Mouse (and pen): pointer events.
  const pDown = (e) => { if (e.pointerType !== 'touch' && e.button === 0) begin(e.target, e.clientX, e.clientY, false); };
  const pMove = (e) => { if (e.pointerType !== 'touch' && moveTo(e.clientX, e.clientY)) e.preventDefault(); };
  const pUp = (e) => { if (e.pointerType !== 'touch') finish(e.clientX, e.clientY, false); };
  // Touch: touch events, so a sideways drag can stop the page scrolling.
  const tStart = (e) => {
    if (e.touches.length !== 1) { finish(0, 0, true); return; }
    begin(e.target, e.touches[0].clientX, e.touches[0].clientY, true);
    // Touch events keep going to the touched element even if the board redraws and
    // removes it; there they no longer reach the document, so listen on it directly.
    const target = e.target;
    const onEnd = (ev) => { target.removeEventListener('touchend', onEnd); target.removeEventListener('touchcancel', onEnd); if (!target.isConnected) tEnd(ev); };
    target.addEventListener('touchend', onEnd);
    target.addEventListener('touchcancel', onEnd);
  };
  const tMove = (e) => { const t = e.touches[0]; if (t && moveTo(t.clientX, t.clientY) && e.cancelable) e.preventDefault(); };
  const tEnd = (e) => { const t = e.changedTouches[0]; finish(t ? t.clientX : 0, t ? t.clientY : 0, e.type === 'touchcancel'); };
  const click = (e) => {
    if (Date.now() < suppressClickUntil && root.contains(e.target)) { e.preventDefault(); e.stopPropagation(); }
  };

  root.addEventListener('pointerdown', pDown);
  document.addEventListener('pointermove', pMove);
  document.addEventListener('pointerup', pUp);
  root.addEventListener('touchstart', tStart, { passive: true });
  document.addEventListener('touchmove', tMove, { passive: false });
  document.addEventListener('touchend', tEnd);
  document.addEventListener('touchcancel', tEnd);
  document.addEventListener('click', click, true);
  const reset = () => finish(0, 0, true); // the app went to the background mid-drag
  document.addEventListener('visibilitychange', reset);
  return () => {
    finish(0, 0, true);
    document.removeEventListener('visibilitychange', reset);
    root.removeEventListener('pointerdown', pDown);
    document.removeEventListener('pointermove', pMove);
    document.removeEventListener('pointerup', pUp);
    root.removeEventListener('touchstart', tStart);
    document.removeEventListener('touchmove', tMove);
    document.removeEventListener('touchend', tEnd);
    document.removeEventListener('touchcancel', tEnd);
    document.removeEventListener('click', click, true);
  };
}

/**
 * Reorders the children of `list` that have data-sort-id, dragged by their
 * [data-sort-handle]. onEnd(ids) gets the new order when it changed.
 */
export function sortable(list, onEnd) {
  let drag = null;
  const items = () => [...list.querySelectorAll(':scope > [data-sort-id]')];
  const order = () => items().map((n) => n.dataset.sortId);

  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-sort-handle]');
    if (!handle || e.button > 0) return;
    const item = handle.closest('[data-sort-id]');
    if (!item || item.parentElement !== list) return;
    e.preventDefault();
    drag = { item, id: e.pointerId, before: order().join('|') };
    item.classList.add('sort-dragging');
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
  });
  list.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    // Put the row before the first other row whose middle is below the pointer.
    const others = items().filter((n) => n !== drag.item);
    const next = others.find((n) => { const r = n.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (next) { if (drag.item.nextElementSibling !== next) list.insertBefore(drag.item, next); }
    else if (list.lastElementChild !== drag.item) list.append(drag.item);
    // Near the top or bottom of the screen, scroll so far rows can be reached.
    if (e.clientY < 60) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
  });
  const finish = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.item.classList.remove('sort-dragging');
    const changed = order().join('|') !== drag.before;
    drag = null;
    if (changed) onEnd(order());
  };
  list.addEventListener('pointerup', finish);
  list.addEventListener('pointercancel', finish);
  // Keyboard: arrow keys on a focused handle move the row by one.
  list.addEventListener('keydown', (e) => {
    const handle = e.target.closest('[data-sort-handle]');
    if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const item = handle.closest('[data-sort-id]');
    e.preventDefault();
    const sibling = e.key === 'ArrowUp' ? item.previousElementSibling : item.nextElementSibling;
    if (!sibling || !sibling.dataset.sortId) return;
    if (e.key === 'ArrowUp') list.insertBefore(item, sibling);
    else list.insertBefore(sibling, item);
    handle.focus();
    onEnd(order());
  });
}
