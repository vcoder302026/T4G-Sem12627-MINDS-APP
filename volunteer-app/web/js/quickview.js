// Press and hold (or right-click) any volunteer or trainee name, anywhere in
// the app, for a quick card: a volunteer's Telegram, phone and regular trainee
// (admins only), or a trainee's photo and key details (anyone allowed to see
// that trainee). Pages only mark names; one listener handles them all.
//
//   personName(name, userId)    a volunteer's name
//   traineeName(name, id)       a trainee's name
//   asPerson(node, userId)      make any element (e.g. a pairing card) a volunteer target
//   asTrainee(node, id)         same, for a trainee

import { call } from './api.js';
import {
  badge, el, errorBlock, hvLabel, icon, likertView, loading, modal, mount, traineeAvatar, typeBadges,
} from './ui.js';

export function asPerson(node, userId) {
  if (userId) node.dataset.person = userId;
  return node;
}

export function asTrainee(node, traineeId) {
  if (traineeId) node.dataset.trainee = traineeId;
  return node;
}

/** A volunteer's name that opens their quick card. `cls` styles the text. */
export function personName(name, userId, cls = '') {
  if (!userId) return el('span', { class: cls }, name);
  return asPerson(el('span', { class: `qv ${cls}` }, name), userId);
}

/** A trainee's name that opens their quick card. */
export function traineeName(name, traineeId, cls = '') {
  if (!traineeId) return el('span', { class: cls }, name);
  return asTrainee(el('span', { class: `qv ${cls}` }, name), traineeId);
}

const cache = new Map(); // key → { at, data }
async function cached(key, fetcher) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.data;
  const data = await fetcher();
  cache.set(key, { at: Date.now(), data });
  return data;
}

function openLink(href, text, close) {
  const a = el('a', { href, class: 'btn btn-secondary btn-sm w-full' }, text);
  a.addEventListener('click', () => close());
  return a;
}

function personCard(userId) {
  const body = el('div', {}, loading('Loading…'));
  const m = modal('Volunteer', body);
  cached(`p:${userId}`, () => call('personDetail', { userId })).then((d) => {
    const p = d.person;
    m.el.querySelector('h2').textContent = p.fullName || p.name; // the full name
    // label: what a screen reader (and the hover tooltip) says, when the text alone isn't enough.
    const link = (href, iconName, text, label) => el('a', {
      href, target: href.startsWith('http') ? '_blank' : null, rel: 'noopener', title: label || null, 'aria-label': label || null,
      class: 'pick-row font-bold text-indigo-700 dark:text-indigo-300',
    }, icon(iconName, 'size-5'), text);
    mount(body, el('div', { class: 'space-y-2' },
      el('div', { class: 'flex flex-wrap gap-1.5' }, typeBadges(p), p.status === 'inactive' ? badge('Deactivated', 'red') : null),
      p.telegram ? link(`https://t.me/${p.telegram}`, 'send', `@${p.telegram}`, `Message @${p.telegram} on Telegram`) : el('p', { class: 'text-sm muted' }, 'No Telegram handle saved.'),
      p.phone ? link(`tel:${p.phone.replace(/\s/g, '')}`, 'phone', p.phone) : null,
      (d.regularTrainees || []).length ? el('p', { class: 'text-sm' }, d.regularTrainees.length > 1 ? 'Regular trainees: ' : 'Regular trainee: ',
        d.regularTrainees.map((t, i) => [i ? ', ' : '', traineeName(t.name, t.id, 'font-bold')])) : null,
      el('p', { class: 'text-sm muted' }, `${d.stats.sessions} session${d.stats.sessions === 1 ? '' : 's'}, ${d.stats.hours} h${d.stats.noShows ? `, ${d.stats.noShows} no-show${d.stats.noShows === 1 ? '' : 's'}` : ''}`),
      openLink(`#/volunteer/${userId}`, 'Open full profile', m.close)));
  }).catch((err) => mount(body, errorBlock(err)));
}

function traineeCard(traineeId, isAdmin) {
  const body = el('div', {}, loading('Loading…'));
  const m = modal('Trainee', body);
  cached(`t:${traineeId}`, () => call('traineeInfo', { traineeId })).then((d) => {
    const t = d.trainee;
    m.el.querySelector('h2').textContent = t.fullName || t.name; // the full name
    mount(body, el('div', { class: 'space-y-3' },
      el('div', { class: 'flex items-center gap-3' },
        traineeAvatar(t, 'lg'),
        // Full name is the title; beside the photo, short name, gender and spoken language.
        el('dl', { class: 'qv-facts min-w-0 text-sm' },
          el('dt', {}, 'Short name'), el('dd', {}, t.preferredName || '—'),
          el('dt', {}, 'Gender'), el('dd', {}, t.gender || '—'),
          el('dt', {}, 'Language'), el('dd', {}, t.language || '—'))),
      // Labels shortened the way the House Visit form shows them (the question, then its guide).
      d.summary && d.summary.length ? el('dl', { class: 'space-y-2 text-sm' }, d.summary.map((f) => el('div', {},
        el('dt', { class: 'font-bold text-slate-700 dark:text-neutral-200' }, hvLabel(f.label).label),
        el('dd', { class: 'whitespace-pre-line text-slate-600 dark:text-neutral-400' }, likertView(f) || f.value)))) : null,
      d.notes && d.notes.length ? el('div', { class: 'well p-3 text-sm' },
        el('p', { class: 'text-xs font-bold uppercase tracking-wider muted' }, `Latest note${d.notes.length > 1 ? ` (of ${d.notes.length})` : ''}`),
        el('p', { class: 'mt-1 whitespace-pre-line' }, d.notes[0].note),
        el('p', { class: 'mt-1 text-xs muted' }, d.notes[0].author || '')) : null,
      openLink(isAdmin ? `#/trainee/${encodeURIComponent(traineeId)}` : `#/info/${encodeURIComponent(traineeId)}`, 'Open full profile', m.close)));
  }).catch((err) => mount(body, errorBlock(err)));
}

/**
 * One listener for the whole app. A volunteer's details are for admins only, so
 * for everyone else volunteer names are plain text.
 */
export function installQuickView(app) {
  let timer = null;
  let start = null;
  let swallowClickUntil = 0;
  const targetOf = (node) => {
    const t = node && node.closest ? node.closest('[data-person], [data-trainee]') : null;
    if (!t) return null;
    if (t.dataset.person && !app.isAdmin) return null;
    return t;
  };
  const open = (t) => {
    swallowClickUntil = Date.now() + 800;
    if (navigator.vibrate) navigator.vibrate(20);
    if (t.dataset.person) personCard(t.dataset.person);
    else traineeCard(t.dataset.trainee, app.isAdmin);
  };
  const cancel = () => { clearTimeout(timer); timer = null; };
  document.addEventListener('pointerdown', (e) => {
    const t = targetOf(e.target);
    cancel();
    if (!t || e.button > 0) return;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => { timer = null; open(t); }, 500);
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
  }, true);
  ['pointerup', 'pointercancel', 'scroll'].forEach((type) => document.addEventListener(type, cancel, true));
  window.addEventListener('app:leave', cancel);
  document.addEventListener('contextmenu', (e) => {
    const t = targetOf(e.target);
    if (!t) return;
    e.preventDefault();
    if (Date.now() > swallowClickUntil) open(t); // a long press already opened it
  }, true);
  // The click that ends a long press shouldn't also follow a link or open a pop-up.
  document.addEventListener('click', (e) => {
    if (Date.now() < swallowClickUntil && targetOf(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}
