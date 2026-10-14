// App shell: sign-in state, role-based tabs, hash routing, on-phone caches
// and the offline scan queue.

import { call, isNetworkError, onUnauthorized, session, storage } from './api.js';
import { el, icon, toast } from './ui.js';
import { renderLogin, renderRegister } from './views/auth.js';
import * as L from './views/leader.js';
import * as V from './views/volunteer.js';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const tabList = document.getElementById('tabbar-list');
const topbar = document.getElementById('topbar');
const modeChip = document.getElementById('topbar-mode');
const offlineBar = document.getElementById('offline-bar');

const memory = { details: {}, people: null };
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
    return storage.get('minds.mode', 'leader');
  },
  setMode(mode) {
    storage.set('minds.mode', mode);
    go(mode === 'leader' ? '#/today' : '#/home', true);
  },
  signedIn({ token, user }, message) {
    session.token = token;
    storage.set('minds.user', user);
    storage.remove('minds.vhome');
    storage.remove('minds.ahome');
    go(user.role === 'admin' ? '#/today' : '#/home', true);
    if (message) toast(message);
  },
  setToken(token) {
    session.token = token;
  },
  signOut() {
    session.clear();
    memory.details = {};
    memory.people = null;
    go('#/login', true);
  },

  // volunteer data
  cachedHome: () => storage.get('minds.vhome'),
  saveHome(h) {
    storage.set('minds.vhome', h);
    const u = app.user;
    if (h.user && (!u || u.role !== h.user.role || u.name !== h.user.name)) storage.set('minds.user', h.user);
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

/* ---------------- chrome ---------------- */

const TABS = {
  volunteer: [
    { key: 'home', href: '#/home', label: 'Home', icon: 'home' },
    { key: 'pass', href: '#/pass', label: 'My pass', icon: 'pass' },
    { key: 'sessions', href: '#/sessions', label: 'Sessions', icon: 'calendar' },
    { key: 'me', href: '#/me', label: 'Me', icon: 'user' },
  ],
  leader: [
    { key: 'today', href: '#/today', label: 'Sessions', icon: 'calendar', also: ['session', 'new-session'] },
    { key: 'scan', href: '#/scan', label: 'Scan', icon: 'scan' },
    { key: 'people', href: '#/people', label: 'People', icon: 'people' },
    { key: 'me', href: '#/me', label: 'Me', icon: 'user' },
  ],
};

let currentRoute = '';

function renderChrome(name) {
  const signedIn = Boolean(session.token && app.user);
  tabbar.hidden = !signedIn;
  topbar.hidden = !signedIn;
  if (!signedIn) return;
  const mode = app.mode;
  modeChip.hidden = mode !== 'leader';
  const badges = {
    home: (app.cachedHome() || { pendingFeedback: [] }).pendingFeedback.length,
    scan: app.queuedScans().length,
  };
  tabList.replaceChildren(...TABS[mode].map((t) => {
    const active = t.key === name || (t.also || []).includes(name);
    return el('li', {},
      el('a', {
        href: t.href,
        class: `relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-bold ${active ? 'text-go' : 'text-ink-soft'}`,
        'aria-current': active ? 'page' : null,
      },
      el('span', { class: `rounded-full px-4 py-1 ${active ? 'bg-go-tint' : ''}` }, icon(t.icon, 'size-6')),
      t.label,
      badges[t.key] ? el('span', { class: 'absolute right-[calc(50%-1.6rem)] top-1.5 min-w-5 rounded-full bg-strap px-1 text-center text-[11px] leading-5 text-ink', 'aria-label': `${badges[t.key]} waiting` }, String(badges[t.key])) : null));
  }));
}

/* ---------------- routing ---------------- */

const ROUTES = {
  volunteer: { home: V.renderHome, pass: V.renderPass, sessions: V.renderSessions, me: V.renderMe, feedback: V.renderFeedback },
  leader: { today: L.renderToday, session: L.renderSession, 'new-session': L.renderNewSession, scan: L.renderScan, people: L.renderPeople, me: V.renderMe },
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
  const table = ROUTES[app.mode];
  const fn = table[name];
  if (!fn) {
    go(app.mode === 'leader' ? '#/today' : '#/home');
    return;
  }
  currentRoute = name;
  renderChrome(name);
  window.scrollTo(0, 0);
  Promise.resolve(fn(view, app, ctx, param ? decodeURIComponent(param) : undefined)).catch((err) => console.error(err));
}

onUnauthorized(() => {
  session.clear();
  toast('Please sign in again.', 'warn');
  go('#/login', true);
});

window.addEventListener('hashchange', route);
window.addEventListener('online', () => {
  setOffline(false);
  app.flushScans();
});
window.addEventListener('offline', () => setOffline(true));
setInterval(() => { if (navigator.onLine !== false) app.flushScans(); }, 30000);

if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

setOffline(navigator.onLine === false);
route();
app.flushScans();
