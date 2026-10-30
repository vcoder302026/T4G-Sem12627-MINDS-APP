// App shell: one app for everyone. Volunteers see Home, QR pass, Sessions and
// Me (regulars also see Trainees). Admins see the same, plus the Admin menu:
// no switching modes. On a computer the menu is a sidebar; on a phone it is
// the tab bar, and admin pages get a scrollable row of sub-pages.

import { call, isNetworkError, onUnauthorized, session, storage } from './api.js';
import { CONFIG } from './config.js';
import {
  el, modal, mount, sgPhone, toast,
} from './ui.js';
import { icon } from '../admin/js/kit.js';
import { installQuickView } from './quickview.js';
import { installControls } from './controls.js';
import { renderLogin, renderRegister } from './views/auth.js';
import * as Ad from './views/admin.js';
import * as C from './views/content.js';
import * as L from './views/leader.js';
import * as Pa from './views/pairing.js';
import * as P from './views/profile.js';
import * as T from './views/trainees.js';
import * as V from './views/volunteer.js';
import * as DA from '../admin/js/views/attendance.js';
import * as DF from '../admin/js/views/fundraising.js';
import * as DO from '../admin/js/views/outings.js';
import * as DOv from '../admin/js/views/overview.js';
import * as DP from '../admin/js/views/people.js';
import * as DT from '../admin/js/views/trips.js';
import * as DV from '../admin/js/views/visits.js';

const view = document.getElementById('view');
const sidebar = document.getElementById('sidebar');
const tabs = document.getElementById('tabs');
const tabList = document.getElementById('tabs-list');
const subnav = document.getElementById('subnav');
const pagetabs = document.getElementById('pagetabs');
const headerActions = document.getElementById('header-actions');
const brandIcon = document.getElementById('brand-icon');
const brandSub = document.getElementById('brand-sub');
const envBar = document.getElementById('env-bar');
const offlineBar = document.getElementById('offline-bar');

const memory = { details: {}, people: null, persons: {}, trainees: null };
let flushing = null;

function setOffline(isOffline) {
  offlineBar.hidden = !isOffline;
}

async function online(promise) {
  try {
    const out = await promise;
    setOffline(false);
    return out;
  } catch (err) {
    if (isNetworkError(err)) setOffline(true);
    throw err;
  }
}

const isAdmin = (u) => Boolean(u && u.role === 'admin');
const isRegular = (u) => Boolean(u && u.volunteerType === 'regular');

const app = {
  get user() {
    return storage.get('minds.user');
  },
  get isAdmin() {
    return isAdmin(this.user);
  },
  get isRegular() {
    return isRegular(this.user);
  },
  signedIn({ token, user }, message, next) {
    session.token = token;
    storage.set('minds.user', user);
    storage.remove('minds.vhome');
    storage.remove('minds.ahome');
    storage.remove('minds.guide');
    storage.remove('minds.mode'); // left over from the old "choose mode" screen
    go(next || '#/home', true);
    if (message) toast(message);
  },
  /** After editing your own details: refresh every saved copy of "me". */
  updateUser(user) {
    const merged = { ...(app.user || {}), ...user };
    storage.set('minds.user', merged);
    const h = app.cachedHome();
    if (h) storage.set('minds.vhome', { ...h, user: { ...h.user, ...user } });
    renderChrome(currentRoute, currentFull);
  },
  setToken(token) {
    session.token = token;
  },
  signOut() {
    session.clear();
    memory.details = {};
    memory.people = null;
    memory.persons = {};
    memory.trainees = null;
    go('#/login', true);
  },

  // volunteer data
  cachedHome: () => storage.get('minds.vhome'),
  saveHome(h) {
    storage.set('minds.vhome', h);
    const u = app.user;
    if (h.user && (!u || u.role !== h.user.role || u.name !== h.user.name || u.volunteerType !== h.user.volunteerType)) {
      storage.set('minds.user', h.user);
      if (u && !isAdmin(u) && isAdmin(h.user)) toast('You now have admin access: see the Admin menu.');
      if (u && !isRegular(u) && isRegular(h.user)) toast("You're now a regular volunteer. Thank you!");
      if (u && isAdmin(u) && !isAdmin(h.user)) demoted();
    }
    renderChrome(currentRoute, currentFull); // refreshes badges (and the menu, if the role changed)
  },
  async fetchHome() {
    const h = await online(call('volunteerHome'));
    app.saveHome(h);
    return h;
  },

  // admin data
  cachedAdminHome: () => storage.get('minds.ahome'),
  saveAdminHome: (h) => { storage.set('minds.ahome', h); renderChrome(currentRoute, currentFull); },
  dropAdminHome: () => storage.remove('minds.ahome'),
  async fetchAdminHome() {
    try {
      const h = await online(call('adminHome'));
      app.saveAdminHome(h);
      return h;
    } catch (err) {
      if (err.code === 'FORBIDDEN') demoted();
      throw err;
    }
  },
  cachedDetail: (id) => memory.details[id] || null,
  cacheDetail: (id, d) => { memory.details[id] = d; },
  cachedTrainees: () => memory.trainees,
  cacheTrainees: (t) => { memory.trainees = t; },
  dropTrainees: () => { memory.trainees = null; },
  /** After adding or archiving a venue: keep every venue dropdown up to date. */
  updateVenues(venues) {
    const h = app.cachedAdminHome();
    if (h) storage.set('minds.ahome', { ...h, venues });
    Object.values(memory.details).forEach((d) => { d.venues = venues; });
  },

  // offline scan queue (admin phones)
  queuedScans: () => storage.get('minds.scanQueue', []),
  queueScan(item) {
    const id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random()}`;
    storage.set('minds.scanQueue', [...app.queuedScans(), { ...item, clientId: id }]);
    renderChrome(currentRoute, currentFull);
  },
  async flushScans(manual = false) {
    if (flushing) return flushing;
    const queue = app.queuedScans();
    if (!queue.length || !app.isAdmin) return undefined;
    flushing = (async () => {
      try {
        const { results } = await online(call('scanBatch', { scans: queue }));
        const done = new Set(results.map((r) => r.clientId));
        storage.set('minds.scanQueue', app.queuedScans().filter((q) => !done.has(q.clientId)));
        results.forEach((r) => {
          if (r.ok) app.addRecentScan({ name: r.data.volunteer.name, userId: r.data.volunteer.userId, outcome: r.data.outcome, time: 'uploaded' });
        });
        const failed = results.filter((r) => !r.ok);
        toast(failed.length
          ? `${results.length - failed.length} offline scan(s) uploaded. ${failed.length} could not be saved: ${failed[0].error.message}`
          : `${results.length} offline scan${results.length === 1 ? '' : 's'} uploaded.`, failed.length ? 'warn' : 'ok');
        app.dropAdminHome();
      } catch (err) {
        if (manual) toast(err.message, 'error');
      } finally {
        flushing = null;
        renderChrome(currentRoute, currentFull);
        emit('scans-changed');
      }
    })();
    return flushing;
  },
  recentScans: () => storage.get('minds.recentScans', []),
  addRecentScan(item) {
    storage.set('minds.recentScans', [item, ...app.recentScans()].slice(0, 12));
  },

  go: (hash) => go(hash),
  rerender: () => route(),
};

function demoted() {
  const u = app.user;
  if (u) storage.set('minds.user', { ...u, role: 'volunteer' });
  toast('Your admin access has been removed.', 'warn');
  go('#/home', true);
}

/* ---------------- menu ---------------- */

// `also` lists detail pages that belong to a menu item.
const VOLUNTEER_ITEMS = [
  { key: 'home', label: 'Home', icon: 'home', also: ['feedback', 'guide'] },
  { key: 'pass', label: 'QR pass', icon: 'qr' },
  { key: 'sessions', label: 'Sessions', icon: 'calendar' },
  { key: 'directory', label: 'Trainees', icon: 'heart', also: ['info'], when: (u) => isRegular(u) && !isAdmin(u) },
  { key: 'me', label: 'Me', icon: 'user', also: ['edit-me'] },
];
// The Admin menu: a few sections; a section with several pages shows them as
// tabs at the top (`pages`: [route, label]). `also` lists detail pages.
const ADMIN_SECTIONS = [
  // The Admin home (Create New Session, Session Management, Records, Upcoming Sessions) is the
  // Dashboard's first page, so it's in the sidebar and the admin row, one click from anywhere.
  { key: 'admin', label: 'Dashboard', icon: 'dashboard', pages: [['admin', 'Home'], ['overview', 'Overview'], ['log', 'Activity log']] },
  { key: 'today', label: 'All sessions', icon: 'calendar', also: ['session', 'new-session', 'scan', 'clock'] },
  { key: 'pairings', label: 'Pairing', icon: 'sparkle', pages: [['pairings', 'Sessions to pair'], ['pairings/regular', 'Regular pairings'], ['pairings/history', 'History']], also: ['pair'] },
  { key: 'volunteers', label: 'Volunteers', icon: 'users', pages: [['volunteers', 'People'], ['attendance', 'Attendance'], ['hours', 'Hours']], also: ['volunteer'] },
  { key: 'trainees', label: 'Trainees', icon: 'heart', pages: [['trainees', 'Trainees'], ['review', 'Notes to review'], ['visibility', 'What volunteers see']], also: ['trainee', 'trainee-new'] },
  { key: 'guide-edit', label: 'Settings', icon: 'pencil', pages: [['guide-edit', 'Guide & projects'], ['venues', 'Venues'], ['admin-password', 'Admin password'], ['sheets', 'Google Sheets'], ['advanced', 'Advanced settings']] },
  { key: 'fundraising', label: 'More', icon: 'list', note: 'Placeholders', pages: [['fundraising', 'Fundraising'], ['outings', 'Outings'], ['trips', 'Overseas trips'], ['visits', 'House visits']], also: ['fundraiser', 'outing', 'trip', 'visit-new'] },
];
const sectionRoutes = (sec) => [sec.key, ...(sec.pages || []).map(([r]) => r.split('/')[0]), ...(sec.also || [])];
const sectionOf = (name) => ADMIN_SECTIONS.find((sec) => sectionRoutes(sec).includes(name)) || null;


const ROUTES = {
  // everyone
  home: { fn: V.renderHome },
  pass: { fn: V.renderPass },
  sessions: { fn: V.renderSessions },
  me: { fn: V.renderMe },
  feedback: { fn: V.renderFeedback },
  guide: { fn: C.renderGuide },
  'edit-me': { fn: P.renderEditMe },
  info: { fn: T.renderTraineeInfo }, // a trainee's page for volunteers and regulars
  directory: { fn: T.renderDirectory }, // regulars: every trainee
  // admins
  admin: { fn: Ad.renderAdminHub, admin: true, title: 'Dashboard' },
  overview: { fn: DOv.renderOverview, admin: true },
  today: { fn: L.renderToday, admin: true },
  session: { fn: L.renderSession, admin: true },
  'new-session': { fn: L.renderNewSession, admin: true },
  pair: { fn: Pa.renderSessionPairing, admin: true },
  pairings: { fn: Pa.renderStandingPairings, admin: true },
  scan: { fn: L.renderScan, admin: true, narrow: true },
  clock: { fn: L.renderClock, admin: true },
  volunteers: { fn: DP.renderVolunteers, admin: true },
  volunteer: { fn: DP.renderVolunteer, admin: true },
  trainees: { fn: DP.renderTrainees, admin: true },
  trainee: { fn: DP.renderTrainee, admin: true },
  visibility: { fn: Ad.renderVisibility, admin: true },
  attendance: { fn: DA.renderAttendance, admin: true },
  hours: { fn: DA.renderHours, admin: true },
  review: { fn: T.renderReview, admin: true, narrow: true },
  log: { fn: Ad.renderActivityLog, admin: true },
  'guide-edit': { fn: C.renderGuideEdit, admin: true, narrow: true },
  venues: { fn: C.renderVenues, admin: true, narrow: true },
  'admin-password': { fn: Ad.renderAdminPassword, admin: true, narrow: true },
  advanced: { fn: Ad.renderAdvanced, admin: true, narrow: true },
  sheets: { fn: Ad.renderSheets, admin: true, narrow: true },
  fundraising: { fn: DF.renderFundraisers, admin: true },
  fundraiser: { fn: DF.renderFundraiser, admin: true },
  outings: { fn: DO.renderOutings, admin: true },
  outing: { fn: DO.renderOuting, admin: true },
  trips: { fn: DT.renderTrips, admin: true },
  trip: { fn: DT.renderTrip, admin: true },
  visits: { fn: DV.renderVisits, admin: true },
  'visit-new': { fn: DV.renderVisitForm, admin: true, title: 'New visit' },
  'trainee-new': { fn: DV.renderNewTrainee, admin: true, title: 'Add a trainee' },
};

function toggleTheme() {
  const dark = !document.documentElement.classList.contains('dark');
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('light', !dark);
  try {
    localStorage.setItem('theme', dark ? 'dark' : 'light'); // plain value, read by the early script in index.html
  } catch {
    // ignore
  }
}

/** "Update app" (as in the other WERONE apps): fetch the newest version, then reload. */
async function updateApp(btn) {
  btn.disabled = true;
  btn.querySelector('svg')?.classList.add('animate-spin');
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.update();
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('minds-volunteers-')).map((k) => caches.delete(k)));
    }
  } catch {
    // reload anyway
  }
  location.reload();
}

let currentRoute = '';
let currentFull = '';

function headerButton(label, iconName, onClick, extra = '') {
  return el('button', { type: 'button', class: `nav-sq ${extra}`, title: label, 'aria-label': label, onclick: onClick }, icon(iconName, 'size-4'));
}

/* ---------------- header: ← back and the page title ---------------- */

const navContext = document.getElementById('nav-context');
const navTitle = document.getElementById('nav-title');
const navBack = document.getElementById('nav-back');
const brandLink = document.querySelector('.brand-link');
mount(navBack, icon('back', 'size-4'));
// How many pages deep the person is in the app (kept on each history entry), so
// ← can go back to the page they actually came from.
let navDepth = history.state && typeof history.state.depth === 'number' ? history.state.depth : 0;
let replacingNext = false;
if (!history.state || typeof history.state.depth !== 'number') history.replaceState({ depth: navDepth }, '');
window.addEventListener('hashchange', () => {
  if (history.state && typeof history.state.depth === 'number') navDepth = history.state.depth; // Back / Forward
  else {
    navDepth = replacingNext ? navDepth : navDepth + 1;
    replacingNext = false;
    history.replaceState({ depth: navDepth }, '');
  }
});
/** Goes to a page instead of the current one (no extra step for ← to go back through). */
function replaceWith(hash) {
  replacingNext = true;
  location.replace(hash);
}

navBack.addEventListener('click', () => {
  // Back to the page they came from (e.g. Home or Sessions); opened fresh from a
  // link, there's none, so go up (the page's own back link) or Home.
  if (navDepth > 0) { history.back(); return; }
  const link = view.querySelector('a.back-link');
  go(link ? link.getAttribute('href') : '#/home');
});

/** The page's title goes in the header (and its own big title is hidden, so it isn't shown twice). */
function syncHeaderTitle(fallback) {
  const h1 = view.querySelector('h1.page-title');
  if (h1) h1.classList.add('title-in-header');
  navTitle.textContent = h1 ? h1.textContent.trim() : fallback;
}
new MutationObserver(() => { if (!navContext.hidden) syncHeaderTitle(navTitle.dataset.fallback || ''); })
  .observe(view, { childList: true, subtree: true });

const isActive = (item, name) => item.key === name || (item.also || []).includes(name);

function counts() {
  const home = app.cachedHome() || { pendingFeedback: [] };
  const a = app.cachedAdminHome() || {};
  return {
    home: (home.pendingFeedback || []).length + (home.guideRead === false ? 1 : 0),
    today: app.queuedScans().length, // offline scans waiting to upload
    review: a.reviewCount || 0,
    trainees: a.reviewCount || 0,
    pairings: a.unpairedTotal || 0,
  };
}

function renderChrome(name, full = name) {
  const u = app.user;
  const signedIn = Boolean(session.token && u);
  const admin = signedIn && isAdmin(u);
  const adminRoute = Boolean(ROUTES[name] && ROUTES[name].admin);
  document.body.classList.toggle('has-sidebar', signedIn);
  document.body.classList.toggle('wide', signedIn && adminRoute && !ROUTES[name].narrow);

  mount(brandIcon, icon(admin ? 'dashboard' : 'qr', 'size-6'));
  brandSub.textContent = !signedIn ? 'Volunteer portal'
    : [admin ? 'Admin' : null, isRegular(u) ? 'Regular' : 'Volunteer'].filter(Boolean).join(' · ');

  // Signed in: ← back and the page title instead of the app name.
  navContext.hidden = !signedIn;
  brandLink.hidden = signedIn;
  navBack.hidden = name === 'home';
  const fallback = (ROUTES[name] && ROUTES[name].title) || (sectionOf(name) || {}).label
    || (VOLUNTEER_ITEMS.find((t) => t.key === name || (t.also || []).includes(name)) || {}).label || 'MINDS Volunteers';
  navTitle.dataset.fallback = fallback;
  if (signedIn) syncHeaderTitle(fallback);

  mount(headerActions,
    headerButton('Update app', 'refresh', (e) => updateApp(e.currentTarget)),
    el('button', { type: 'button', class: 'nav-sq', title: 'Toggle dark mode', 'aria-label': 'Toggle dark mode', onclick: toggleTheme }, '🌗'),
    // Home, as in MINDS's standard header (refresh · theme · home), then sign out at the far right.
    signedIn ? headerButton('Home', 'home', () => go('#/home')) : null,
    signedIn ? headerButton('Sign out', 'logout', () => app.signOut(), 'text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300') : null);

  tabs.hidden = !signedIn;
  subnav.hidden = !(admin && adminRoute);
  const section = admin && adminRoute ? sectionOf(name) : null;
  const onTabbedPage = Boolean(section && section.pages && section.pages.some(([r]) => r === full));
  pagetabs.hidden = !onTabbedPage;
  if (!signedIn) {
    mount(sidebar);
    return;
  }
  const n = counts();
  const volunteerItems = VOLUNTEER_ITEMS.filter((t) => !t.when || t.when(u));
  const count = (key) => n[key] || 0;

  // Phones: one tab per volunteer page, plus "Admin" for admins.
  const tabItems = admin ? [...volunteerItems, { key: 'admin', label: 'Admin', icon: 'shield', href: '#/admin' }] : volunteerItems;
  mount(tabList, tabItems.map((t) => {
    const active = t.key === 'admin' ? adminRoute : isActive(t, name);
    const badge = t.key === 'admin' ? count('review') + count('pairings') + count('today') : count(t.key);
    return el('a', { href: t.href || `#/${t.key}`, class: 'seg-item', 'aria-current': active ? 'page' : null },
      icon(t.icon, 'size-5 sm:size-4'),
      t.label,
      badge ? el('span', { class: 'absolute right-1 top-0.5 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold leading-4 text-white', 'aria-label': `${badge} waiting` }, String(badge)) : null);
  }));
  // Phones, on admin pages: the admin sections as a scrollable row.
  if (!subnav.hidden) {
    // "All pages" first: every admin page, grouped by section, one tap away (Version 4).
    const allPages = el('button', { type: 'button', class: 'sub-link sub-all', 'aria-haspopup': 'dialog' }, icon('apps', 'size-4'), 'All pages');
    allPages.addEventListener('click', () => openAdminMenu(count));
    mount(subnav, allPages, ADMIN_SECTIONS.map((sec) => el('a', { href: `#/${sec.key}`, class: 'sub-link', 'aria-current': sec === section ? 'page' : null },
      icon(sec.icon, 'size-4'), sec.label, count(sec.key) ? ` (${count(sec.key)})` : '')));
    const activeLink = subnav.querySelector('[aria-current="page"]');
    if (activeLink) activeLink.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  // A section with several pages: its pages as tabs at the top (phones and computers).
  if (onTabbedPage) {
    mount(pagetabs, el('div', { class: 'seg', role: 'tablist' }, section.pages.map(([r, label]) => el('a', {
      href: `#/${r}`, class: 'seg-item', role: 'tab', 'aria-current': r === full ? 'page' : null,
    }, label, count(r) ? el('span', { class: 'tab-count' }, String(count(r))) : null))));
  }

  // Computers: the same items in a sidebar.
  const sideLink = (item) => el('a', { href: item.href || `#/${item.key}`, class: 'side-link', title: item.label, 'aria-current': (item.active !== undefined ? item.active : isActive(item, name)) ? 'page' : null },
    icon(item.icon, 'size-5'), el('span', { class: 'side-text' }, item.label), count(item.key) ? el('span', { class: 'side-count' }, String(count(item.key))) : null);
  // Design update: computers can shrink the sidebar to icons (remembered on this device).
  const mini = el('button', { type: 'button', class: 'side-mini-btn', title: 'Shrink or expand menu', 'aria-label': 'Shrink or expand menu' }, icon('chevron', 'size-4'));
  mini.addEventListener('click', () => {
    const on = !document.body.classList.contains('side-mini');
    document.body.classList.toggle('side-mini', on);
    try { localStorage.setItem('minds.sideMini', on ? '1' : ''); } catch { /* ignore */ }
  });
  try { document.body.classList.toggle('side-mini', localStorage.getItem('minds.sideMini') === '1'); } catch { /* ignore */ }
  mount(sidebar, mini,
    el('a', { href: '#/home', class: 'side-brand flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 px-5 dark:border-neutral-900' },
      el('span', { class: 'flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white' }, icon(admin ? 'dashboard' : 'qr', 'size-6')),
      el('span', { class: 'side-text min-w-0' },
        el('span', { class: 'block truncate text-base font-extrabold leading-tight text-slate-900 dark:text-white' }, 'MINDS Volunteers'),
        el('span', { class: 'block truncate text-xs font-medium uppercase tracking-wider muted' }, brandSub.textContent))),
    el('nav', { class: 'side-scroll' },
      el('p', { class: 'side-group' }, 'My volunteering'),
      volunteerItems.map(sideLink),
      admin ? [el('p', { class: 'side-group' }, 'Admin'),
        el('button', { type: 'button', class: 'side-link w-full', title: 'All pages', 'aria-label': 'All pages', 'aria-haspopup': 'dialog', onclick: () => openAdminMenu(count) },
          icon('apps', 'size-5'), el('span', { class: 'side-text' }, 'All pages')),
        // A section's pages are the tabs at the top of the page (not repeated here).
        ADMIN_SECTIONS.map((sec) => sideLink({ ...sec, active: sec === section }))] : null),
    el('div', { class: 'side-foot border-t border-slate-200 p-4 text-xs dark:border-neutral-900' },
      el('p', { class: 'truncate font-bold text-slate-900 dark:text-white' }, u.name),
      el('p', { class: 'truncate muted' }, u.email)));
}

/** Every admin page, grouped by section, as one big list (phones: "All pages"). */
function openAdminMenu(count) {
  const m = modal('Admin pages', el('nav', { class: 'admin-menu', 'aria-label': 'All admin pages' },
    ADMIN_SECTIONS.map((sec) => el('section', {},
      el('h3', { class: 'admin-menu-head' }, icon(sec.icon, 'size-4'), sec.label),
      el('div', { class: 'admin-menu-grid' }, (sec.pages && sec.pages.length ? sec.pages : [[sec.key, sec.label]]).map(([r, label]) => el('a', {
        href: `#/${r}`, class: 'admin-menu-link',
      }, label, count(r) ? el('span', { class: 'tab-count' }, String(count(r))) : null)))))));
  m.el.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => m.close()));
}

/* ---------------- routing ---------------- */

let renderId = 0;
let leaving = [];
let events = {};
let checkedUser = false;

function emit(name) {
  if (events[name]) events[name]();
}

function go(hash, force = false) {
  if (location.hash === hash && force) route();
  else location.hash = hash;
}

function route() {
  // A pop-up belongs to the page it was opened on. Anything left on top of the
  // page (pop-ups, list sheets, date/time wheels, a dragged card) would block
  // taps and scrolling on the next page, so it all goes, and scrolling is unlocked.
  document.querySelectorAll('dialog[open]').forEach((d) => { try { d.close(); } catch { /* ignore */ } });
  document.querySelectorAll('.wheel-overlay, .list-pop, .dnd-ghost').forEach((n) => n.remove());
  document.querySelectorAll('.dnd-source, .dnd-over').forEach((n) => n.classList.remove('dnd-source', 'dnd-over'));
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  window.dispatchEvent(new Event('app:leave')); // e.g. a pending press-and-hold (quickview.js)
  leaving.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  leaving = [];
  events = {};
  const id = ++renderId;
  const ctx = {
    alive: () => renderId === id,
    onLeave: (fn) => leaving.push(fn),
    onEvent: (name, fn) => { events[name] = fn; },
  };
  const [name = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const param = rest.length ? decodeURIComponent(rest.join('/')) : undefined;
  window.scrollTo(0, 0);

  if (!session.token || !app.user) {
    currentRoute = name;
    renderChrome(name);
    if (name === 'register') renderRegister(view, app);
    else {
      if (name !== 'login') history.replaceState(null, '', '#/login');
      renderLogin(view, app);
    }
    return;
  }
  // Admins opening a trainee from the volunteer screens (Home, Sessions) go straight
  // to the admin trainee page, where they can edit; ← still goes back where they were.
  if (name === 'info' && app.isAdmin && param) {
    replaceWith(`#/trainee/${encodeURIComponent(param)}`);
    return;
  }
  const r = ROUTES[name];
  if (!r || (r.admin && !app.isAdmin)) {
    go('#/home');
    return;
  }
  currentRoute = name;
  currentFull = [name, ...rest].join('/');
  renderChrome(name, currentFull);
  Promise.resolve(r.fn(view, app, ctx, param)).catch((err) => console.error(err));

  if (!checkedUser) {
    // Once per page load: pick up a role or type change made since this phone signed in.
    checkedUser = true;
    call('me').then((res) => {
      const u = app.user;
      storage.set('minds.user', res.user);
      if (u && isAdmin(u) && !isAdmin(res.user)) demoted();
      else renderChrome(currentRoute, currentFull);
    }).catch(() => {});
    if (app.isAdmin) app.fetchAdminHome().catch(() => {}); // fills the admin badges
  }
}

onUnauthorized(() => {
  session.clear();
  toast('Please sign in again.', 'warn');
  go('#/login', true);
});

// Environment bar, same colours as the other WERONE apps.
if (CONFIG.ENV_LABEL) {
  envBar.textContent = CONFIG.ENV_LABEL;
  envBar.classList.add(CONFIG.ENVIRONMENT === 'Exp' ? 'bg-purple-600' : 'bg-red-600');
  envBar.hidden = false;
}

window.addEventListener('hashchange', route);
window.addEventListener('online', () => {
  setOffline(false);
  app.flushScans();
});
window.addEventListener('offline', () => setOffline(true));
setInterval(() => { if (navigator.onLine !== false) app.flushScans(); }, 30000);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

setOffline(navigator.onLine === false);
installQuickView(app);
installControls(); // wheel date picker and password eye, as in MINDS's other apps
// Phone boxes tidy themselves to "+65 91234567" when you leave them; emails to lowercase.
document.addEventListener('focusout', (e) => {
  const t = e.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.name === 'phone' || t.name === 'emergencyPhone') {
    const n = sgPhone(t.value);
    if (n) t.value = n;
  } else if (t.type === 'email' && t.value) {
    t.value = t.value.trim().toLowerCase();
  }
}, true);
route();
app.flushScans();
