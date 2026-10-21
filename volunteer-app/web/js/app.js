// App shell: one app for everyone. Volunteers see Home, QR pass, Sessions and
// Me (regulars also see Trainees). Admins see the same, plus the Admin menu:
// no switching modes. On a computer the menu is a sidebar; on a phone it is
// the tab bar, and admin pages get a scrollable row of sub-pages.

import { call, isNetworkError, onUnauthorized, session, storage } from './api.js';
import { CONFIG } from './config.js';
import { el, mount, toast } from './ui.js';
import { icon } from '../admin/js/kit.js';
import { installQuickView } from './quickview.js';
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
  { key: 'overview', label: 'Dashboard', icon: 'dashboard', pages: [['overview', 'Overview'], ['log', 'Activity log']] },
  { key: 'today', label: 'Sessions', icon: 'calendar', also: ['session', 'new-session', 'scan', 'clock'] },
  { key: 'pairings', label: 'Pairing', icon: 'sparkle', pages: [['pairings', 'Sessions to pair'], ['pairings/regular', 'Regular pairings']], also: ['pair'] },
  { key: 'volunteers', label: 'Volunteers', icon: 'users', pages: [['volunteers', 'People'], ['attendance', 'Attendance'], ['hours', 'Hours']], also: ['volunteer'] },
  { key: 'trainees', label: 'Trainees', icon: 'heart', pages: [['trainees', 'Trainees'], ['review', 'Notes to review'], ['visibility', 'What volunteers see']], also: ['trainee'] },
  { key: 'guide-edit', label: 'Settings', icon: 'pencil', pages: [['guide-edit', 'Guide & projects'], ['venues', 'Venues']] },
  { key: 'fundraising', label: 'More', icon: 'list', note: 'Placeholders', pages: [['fundraising', 'Fundraising'], ['outings', 'Outings'], ['trips', 'Overseas trips'], ['visits', 'House visits']], also: ['fundraiser', 'outing', 'trip'] },
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
  admin: { fn: Ad.renderAdminHub, admin: true },
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
  fundraising: { fn: DF.renderFundraisers, admin: true },
  fundraiser: { fn: DF.renderFundraiser, admin: true },
  outings: { fn: DO.renderOutings, admin: true },
  outing: { fn: DO.renderOuting, admin: true },
  trips: { fn: DT.renderTrips, admin: true },
  trip: { fn: DT.renderTrip, admin: true },
  visits: { fn: DV.renderVisits, admin: true },
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
  return el('button', { type: 'button', class: `icon-btn ${extra}`, title: label, 'aria-label': label, onclick: onClick }, icon(iconName));
}

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

  mount(headerActions,
    headerButton('Update app', 'refresh', (e) => updateApp(e.currentTarget)),
    el('button', { type: 'button', class: 'icon-btn text-xl', title: 'Toggle dark mode', 'aria-label': 'Toggle dark mode', onclick: toggleTheme }, '🌗'),
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
    mount(subnav, ADMIN_SECTIONS.map((sec) => el('a', { href: `#/${sec.key}`, class: 'sub-link', 'aria-current': sec === section ? 'page' : null },
      icon(sec.icon, 'size-4'), sec.label, count(sec.key) ? ` (${count(sec.key)})` : '')));
    const activeLink = subnav.querySelector('[aria-current="page"]');
    if (activeLink) activeLink.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  // A section with several pages: its pages as tabs at the top (phones and computers).
  if (onTabbedPage) {
    mount(pagetabs, el('div', { class: 'seg', role: 'tablist' }, section.pages.map(([r, label]) => el('a', {
      href: `#/${r}`, class: 'seg-item', role: 'tab', 'aria-current': r === full ? 'page' : null,
    }, label, count(r) ? el('span', { class: 'ml-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-4 text-white' }, String(count(r))) : null))));
  }

  // Computers: the same items in a sidebar.
  const sideLink = (item) => el('a', { href: item.href || `#/${item.key}`, class: 'side-link', 'aria-current': (item.active !== undefined ? item.active : isActive(item, name)) ? 'page' : null },
    icon(item.icon, 'size-5'), item.label, count(item.key) ? el('span', { class: 'side-count' }, String(count(item.key))) : null);
  mount(sidebar,
    el('a', { href: '#/home', class: 'flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-5 dark:border-neutral-900' },
      el('span', { class: 'flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white' }, icon(admin ? 'dashboard' : 'qr', 'size-6')),
      el('span', { class: 'min-w-0' },
        el('span', { class: 'block truncate text-base font-extrabold leading-tight text-slate-900 dark:text-white' }, 'MINDS Volunteers'),
        el('span', { class: 'block truncate text-xs font-medium uppercase tracking-wider muted' }, brandSub.textContent))),
    el('nav', { class: 'side-scroll' },
      el('p', { class: 'side-group' }, 'My volunteering'),
      volunteerItems.map(sideLink),
      admin ? [el('p', { class: 'side-group' }, 'Admin'),
        ADMIN_SECTIONS.map((sec) => sideLink({ ...sec, active: sec === section }))] : null),
    el('div', { class: 'border-t border-slate-200 p-4 text-xs dark:border-neutral-900' },
      el('p', { class: 'truncate font-bold text-slate-900 dark:text-white' }, u.name),
      el('p', { class: 'truncate muted' }, u.email)));
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
route();
app.flushScans();
