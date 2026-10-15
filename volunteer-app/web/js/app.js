// App shell: WERONE-style header (environment bar, refresh, 🌗, logout),
// segmented tabs per role, hash routing, on-phone caches and the offline scan queue.

import { call, isNetworkError, onUnauthorized, session, storage } from './api.js';
import { CONFIG } from './config.js';
import { el, icon, mount, toast } from './ui.js';
import { renderLogin, renderRegister } from './views/auth.js';
import * as C from './views/content.js';
import * as L from './views/leader.js';
import * as P from './views/profile.js';
import * as T from './views/trainees.js';
import * as V from './views/volunteer.js';

const view = document.getElementById('view');
const tabs = document.getElementById('tabs');
const tabList = document.getElementById('tabs-list');
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

const app = {
  get user() {
    return storage.get('minds.user');
  },
  get mode() {
    const u = this.user;
    if (!u || u.role !== 'admin') return 'volunteer';
    return storage.get('minds.mode', 'volunteer');
  },
  setMode(mode) {
    storage.set('minds.mode', mode);
    go(mode === 'leader' ? '#/today' : '#/home', true);
  },
  signedIn({ token, user }, message, next) {
    session.token = token;
    storage.set('minds.user', user);
    storage.remove('minds.vhome');
    storage.remove('minds.ahome');
    storage.remove('minds.guide');
    storage.set('minds.mode', user.role === 'admin' ? 'leader' : 'volunteer');
    go(next || (user.role === 'admin' ? '#/today' : '#/home'), true);
    if (message) toast(message);
  },
  /** After editing your own details: refresh every saved copy of "me". */
  updateUser(user) {
    const merged = { ...(app.user || {}), ...user };
    storage.set('minds.user', merged);
    const h = app.cachedHome();
    if (h) storage.set('minds.vhome', { ...h, user: { ...h.user, ...user } });
    renderChrome(currentRoute);
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
    if (h.user && (!u || u.role !== h.user.role || u.name !== h.user.name)) {
      storage.set('minds.user', h.user);
      if (u && u.role !== 'admin' && h.user.role === 'admin') {
        // Promoted while using the app: stay on the volunteer screens until they choose.
        storage.set('minds.mode', 'volunteer');
        toast("You're now a volunteer leader. Tap the home icon at the top to switch modes.");
      }
    }
    renderChrome(currentRoute); // refreshes the feedback badge (and tabs, if the role changed)
  },
  async fetchHome() {
    const h = await online(call('volunteerHome'));
    app.saveHome(h);
    return h;
  },

  // leader data
  cachedAdminHome: () => storage.get('minds.ahome'),
  saveAdminHome: (h) => storage.set('minds.ahome', h),
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
  cachedPeople: () => memory.people,
  cachePeople: (p) => { memory.people = p; },
  cachedPersonDetail: (id) => memory.persons[id] || null,
  cachePersonDetail: (id, d) => { memory.persons[id] = d; },
  /** After a leader edits someone: update the People list and that person's page. */
  updatePerson(person) {
    if (memory.people) memory.people = memory.people.map((p) => (p.userId === person.userId ? { ...p, ...person } : p));
    const d = memory.persons[person.userId];
    if (d) memory.persons[person.userId] = { ...d, person: { ...d.person, ...person } };
    memory.details = {}; // session pages show contact details
  },
  cachedTrainees: () => memory.trainees,
  cacheTrainees: (t) => { memory.trainees = t; },
  dropTrainees: () => { memory.trainees = null; },
  /** After adding or archiving a venue: keep every venue dropdown up to date. */
  updateVenues(venues) {
    const h = app.cachedAdminHome();
    if (h) app.saveAdminHome({ ...h, venues });
    Object.values(memory.details).forEach((d) => { d.venues = venues; });
  },

  // offline scan queue (leader phones)
  queuedScans: () => storage.get('minds.scanQueue', []),
  queueScan(item) {
    const id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random()}`;
    storage.set('minds.scanQueue', [...app.queuedScans(), { ...item, clientId: id }]);
    renderChrome(currentRoute);
  },
  async flushScans(manual = false) {
    if (flushing) return flushing;
    const queue = app.queuedScans();
    if (!queue.length || app.mode !== 'leader') return undefined;
    flushing = (async () => {
      try {
        const { results } = await online(call('scanBatch', { scans: queue }));
        const done = new Set(results.map((r) => r.clientId));
        storage.set('minds.scanQueue', app.queuedScans().filter((q) => !done.has(q.clientId)));
        results.forEach((r) => {
          if (r.ok) app.addRecentScan({ name: r.data.volunteer.name, outcome: r.data.outcome, time: 'uploaded' });
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
        renderChrome(currentRoute);
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
  toast('Your leader access has been removed.', 'warn');
  go('#/home', true);
}

/* ---------------- header and tabs ---------------- */

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

const TABS = {
  volunteer: [
    { key: 'home', href: '#/home', label: 'Home', icon: 'home', also: ['feedback', 'guide'] },
    { key: 'pass', href: '#/pass', label: 'QR pass', icon: 'qr' },
    { key: 'sessions', href: '#/sessions', label: 'Sessions', icon: 'calendar' },
    { key: 'me', href: '#/me', label: 'Me', icon: 'user', also: ['edit-me'] },
  ],
  leader: [
    { key: 'today', href: '#/today', label: 'Sessions', icon: 'calendar', also: ['session', 'new-session', 'review'] },
    { key: 'scan', href: '#/scan', label: 'Scan', icon: 'scan' },
    { key: 'people', href: '#/people', label: 'People', icon: 'users', also: ['person', 'trainee'] },
    { key: 'me', href: '#/me', label: 'Me', icon: 'user', also: ['edit-me', 'guide', 'guide-edit', 'venues'] },
  ],
};

let currentRoute = '';

function headerButton(label, iconName, onClick, extra = '') {
  return el('button', { type: 'button', class: `icon-btn ${extra}`, title: label, 'aria-label': label, onclick: onClick }, icon(iconName));
}

function renderChrome(name) {
  const signedIn = Boolean(session.token && app.user);
  const isAdmin = signedIn && app.user.role === 'admin';
  const mode = app.mode;

  mount(brandIcon, icon(mode === 'leader' && signedIn ? 'dashboard' : 'qr', 'size-6'));
  brandSub.textContent = !signedIn ? 'Volunteer portal' : mode === 'leader' ? 'Leader mode' : 'Volunteer';

  mount(headerActions,
    headerButton('Update app', 'refresh', (e) => updateApp(e.currentTarget)),
    el('button', { type: 'button', class: 'icon-btn text-xl', title: 'Toggle dark mode', 'aria-label': 'Toggle dark mode', onclick: toggleTheme }, '🌗'),
    isAdmin ? headerButton('Choose mode', 'home', () => go('#/mode')) : null,
    signedIn ? headerButton('Sign out', 'logout', () => app.signOut(), 'text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300') : null);

  tabs.hidden = !signedIn || name === 'mode';
  if (tabs.hidden) return;
  const home = app.cachedHome() || { pendingFeedback: [] };
  const badges = {
    home: home.pendingFeedback.length + (home.guideRead === false ? 1 : 0),
    scan: app.queuedScans().length,
    today: (app.cachedAdminHome() || {}).reviewCount || 0,
  };
  mount(tabList, TABS[mode].map((t) => {
    const active = t.key === name || (t.also || []).includes(name);
    return el('a', { href: t.href, class: 'seg-item', 'aria-current': active ? 'page' : null },
      icon(t.icon, 'size-5 sm:size-4'),
      t.label,
      badges[t.key] ? el('span', { class: 'absolute right-1 top-0.5 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold leading-4 text-white', 'aria-label': `${badges[t.key]} waiting` }, String(badges[t.key])) : null);
  }));
}

/* ---------------- routing ---------------- */

const ROUTES = {
  volunteer: {
    home: V.renderHome, pass: V.renderPass, sessions: V.renderSessions, me: V.renderMe, feedback: V.renderFeedback,
    guide: C.renderGuide, 'edit-me': P.renderEditMe,
  },
  leader: {
    today: L.renderToday, session: L.renderSession, 'new-session': L.renderNewSession, scan: L.renderScan, people: L.renderPeople,
    person: P.renderPerson, trainee: T.renderTrainee, review: T.renderReview,
    me: V.renderMe, 'edit-me': P.renderEditMe, guide: C.renderGuide, 'guide-edit': C.renderGuideEdit, venues: C.renderVenues,
  },
};

let renderId = 0;
let leaving = [];
let events = {};

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
  const [name = '', param] = location.hash.replace(/^#\/?/, '').split('/');
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
  if (name === 'mode' && app.user.role === 'admin') {
    currentRoute = name;
    renderChrome(name);
    L.renderMode(view, app);
    return;
  }
  const fn = ROUTES[app.mode][name];
  if (!fn) {
    go(app.mode === 'leader' ? '#/today' : '#/home');
    return;
  }
  currentRoute = name;
  renderChrome(name);
  Promise.resolve(fn(view, app, ctx, param ? decodeURIComponent(param) : undefined)).catch((err) => console.error(err));
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
route();
app.flushScans();
