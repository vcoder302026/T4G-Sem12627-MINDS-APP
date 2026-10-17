// App shell: one app for everyone. Every volunteer (MINDS staff included) has
// the same volunteer screens; the Admin menu appears after typing the shared
// MINDS admin password, on this device, for a few hours.
//
// One layout that adapts to the screen: on phones the menu is tabs under the
// header (and admin sections are a scrollable row of chips); from lg (1024 px)
// it is a sidebar. Same pages and the same information either way.

import { call, isNetworkError, onAdminRequired, onUnauthorized, session, storage } from './api.js';
import { CONFIG } from './config.js';
import { busy, el, icon as baseIcon, modal, mount, toast } from './ui.js';
import { icon } from './admin/kit.js';
import * as A from './admin/views/attendance.js';
import * as F from './admin/views/fundraising.js';
import * as O from './admin/views/outings.js';
import * as Ov from './admin/views/overview.js';
import * as AP from './admin/views/pairs.js';
import * as Pe from './admin/views/people.js';
import * as AS from './admin/views/sessions.js';
import * as ASet from './admin/views/settings.js';
import * as Tr from './admin/views/trips.js';
import * as Vi from './admin/views/visits.js';
import { renderLogin, renderRegister } from './views/auth.js';
import * as C from './views/content.js';
import * as P from './views/profile.js';
import * as T from './views/trainees.js';
import * as V from './views/volunteer.js';

const view = document.getElementById('view');
const shell = document.getElementById('shell');
const sidebar = document.getElementById('sidebar');
const tabs = document.getElementById('tabs');
const tabList = document.getElementById('tabs-list');
const subnav = document.getElementById('subnav');
const headerRow = document.getElementById('header-row');
const headerActions = document.getElementById('header-actions');
const brand = document.getElementById('brand');
const brandIcon = document.getElementById('brand-icon');
const brandSub = document.getElementById('brand-sub');
const crumb = document.getElementById('crumb');
const envBar = document.getElementById('env-bar');
const offlineBar = document.getElementById('offline-bar');

const memory = { details: {}, trainees: null };
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

/* ---------------- menus ---------------- */

const VOLUNTEER_NAV = [
  { key: 'home', label: 'Home', icon: 'home', also: ['feedback', 'guide'] },
  { key: 'pass', label: 'QR pass', short: 'Pass', icon: 'qr' },
  { key: 'schedule', label: 'Schedule', icon: 'calendar' },
  { key: 'trainees', label: 'Trainees', icon: 'heart', also: ['trainee', 'update'] },
  { key: 'me', label: 'Me', icon: 'user', also: ['edit-me'] },
];

const ADMIN_NAV = [
  { group: 'Admin', items: [
    { key: 'admin', label: 'Overview', icon: 'dashboard' },
    { key: 'admin/sessions', label: 'Sessions & pairing', short: 'Sessions', icon: 'calendar', also: ['admin/session', 'admin/new-session'] },
    { key: 'admin/scan', label: 'Scan & clock in', short: 'Scan', icon: 'scan', also: ['admin/clock'] },
    { key: 'admin/pairs', label: 'Pairing list', short: 'Pairs', icon: 'pair' },
    { key: 'admin/volunteers', label: 'Volunteers', icon: 'users', also: ['admin/volunteer'] },
    { key: 'admin/trainees', label: 'Trainees', icon: 'heart', also: ['admin/trainee'] },
    { key: 'admin/attendance', label: 'Attendance & no-shows', short: 'Attendance', icon: 'clock' },
    { key: 'admin/hours', label: 'Volunteer hours', short: 'Hours', icon: 'check' },
    { key: 'admin/review', label: 'Notes to review', short: 'Notes', icon: 'inbox' },
    { key: 'admin/guide', label: 'Guide & venues', short: 'Guide', icon: 'book', also: ['admin/venues'] },
  ] },
  { group: 'Other modules', items: [
    { key: 'admin/fundraising', label: 'Fundraising', icon: 'coins', also: ['admin/fundraiser'] },
    { key: 'admin/outings', label: 'Outings', icon: 'bus', also: ['admin/outing'] },
    { key: 'admin/trips', label: 'Overseas trips', short: 'Trips', icon: 'plane', also: ['admin/trip'] },
    { key: 'admin/visits', label: 'House visits', short: 'Visits', icon: 'home' },
  ] },
  { group: 'Settings', items: [
    { key: 'admin/settings', label: 'Settings', icon: 'settings' },
    { key: 'admin/log', label: 'Activity log', short: 'Log', icon: 'history' },
  ] },
];
const ADMIN_ITEMS = ADMIN_NAV.flatMap((g) => g.items);

const ROUTES = {
  // everyone
  home: V.renderHome,
  pass: V.renderPass,
  schedule: V.renderSchedule,
  trainees: T.renderMyTrainees,
  trainee: T.renderMyTrainee,
  update: T.renderTraineeUpdate,
  me: V.renderMe,
  'edit-me': P.renderEditMe,
  feedback: V.renderFeedback,
  guide: C.renderGuide,
  // admin
  admin: Ov.renderOverview,
  'admin/sessions': AS.renderSessions,
  'admin/session': AS.renderSession,
  'admin/new-session': AS.renderNewSession,
  'admin/scan': AS.renderScan,
  'admin/clock': AS.renderClock,
  'admin/pairs': AP.renderPairs,
  'admin/volunteers': Pe.renderVolunteers,
  'admin/volunteer': Pe.renderVolunteer,
  'admin/trainees': Pe.renderTrainees,
  'admin/trainee': Pe.renderTrainee,
  'admin/attendance': A.renderAttendance,
  'admin/hours': A.renderHours,
  'admin/review': T.renderReview,
  'admin/guide': C.renderGuideEdit,
  'admin/venues': C.renderVenues,
  'admin/fundraising': F.renderFundraisers,
  'admin/fundraiser': F.renderFundraiser,
  'admin/outings': O.renderOutings,
  'admin/outing': O.renderOuting,
  'admin/trips': Tr.renderTrips,
  'admin/trip': Tr.renderTrip,
  'admin/visits': Vi.renderVisits,
  'admin/settings': ASet.renderSettings,
  'admin/log': ASet.renderLog,
};

// Old links (the separate leader mode and the old staff dashboard) still work.
const ALIASES = {
  sessions: 'schedule', today: 'admin/sessions', people: 'admin/volunteers', mode: 'admin', review: 'admin/review',
  'guide-edit': 'admin/guide', venues: 'admin/venues', scan: 'admin/scan', overview: 'admin',
};

/* ---------------- the app object the screens use ---------------- */

const app = {
  get user() {
    return storage.get('minds.user');
  },
  /** True while admin is unlocked on this device. */
  get isAdmin() {
    return Boolean(session.token && session.admin);
  },
  get adminUntil() {
    return session.admin ? String(session.admin.expiresAt).slice(11, 16) : '';
  },
  signedIn({ token, user }, message, next) {
    session.token = token;
    session.admin = null;
    storage.set('minds.user', user);
    ['minds.vhome', 'minds.ahome', 'minds.guide'].forEach((k) => storage.remove(k));
    go(next || '#/home', true);
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
    if (session.admin) call('adminLock').catch(() => {});
    session.clear();
    memory.details = {};
    memory.trainees = null;
    go('#/login', true);
  },

  /* admin access */
  openUnlock: (next) => openUnlock(next),
  setAdmin(res) {
    session.admin = { token: res.adminToken, expiresAt: res.expiresAt, userId: app.user.userId };
    renderChrome(currentRoute);
  },
  async lockAdmin() {
    try {
      await call('adminLock');
    } catch {
      // leaving admin works offline too
    }
    session.admin = null;
    storage.remove('minds.ahome');
    memory.details = {};
    toast('You have left admin on this device.');
    go('#/home', true);
  },

  /* volunteer data */
  cachedHome: () => storage.get('minds.vhome'),
  saveHome(h) {
    storage.set('minds.vhome', h);
    const u = app.user;
    if (h.user && u && (u.name !== h.user.name || u.type !== h.user.type)) {
      if (u.type === 'new' && h.user.type === 'regular') toast(`You're now a regular volunteer. Thank you for ${h.user.completedSessions} sessions!`);
      storage.set('minds.user', { ...u, ...h.user });
    }
    renderChrome(currentRoute); // refreshes the badges
  },
  async fetchHome() {
    const h = await online(call('volunteerHome'));
    app.saveHome(h);
    return h;
  },

  /* admin data */
  cachedAdminHome: () => storage.get('minds.ahome'),
  saveAdminHome(h) {
    storage.set('minds.ahome', h);
    renderChrome(currentRoute);
  },
  dropAdminHome: () => storage.remove('minds.ahome'),
  async fetchAdminHome() {
    const h = await online(call('adminHome'));
    app.saveAdminHome(h);
    return h;
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

  /* offline scan queue (admin phones) */
  queuedScans: () => storage.get('minds.scanQueue', []),
  queueScan(item) {
    const id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random()}`;
    storage.set('minds.scanQueue', [...app.queuedScans(), { ...item, clientId: id }]);
    renderChrome(currentRoute);
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

/* ---------------- admin unlock ---------------- */

function openUnlock(next) {
  const input = el('input', { id: 'admin-password', type: 'password', class: 'input', autocomplete: 'off', placeholder: 'MINDS admin password' });
  const error = el('div', { class: 'alert alert-error', role: 'alert', hidden: true });
  const submit = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, baseIcon('unlock'), 'Open admin');
  const form = el('form', { class: 'space-y-4', novalidate: true },
    el('p', { class: 'text-sm' }, 'Admin is for MINDS staff: sessions and pairing, scanning passes, volunteers, trainees, records and settings.'),
    el('p', { class: 'text-sm muted' }, `Type the shared MINDS admin password. Admin stays open on this device for ${12} hours. Every change is recorded with your name (${app.user ? app.user.name : ''}).`),
    error,
    el('div', {}, el('label', { class: 'label', for: 'admin-password' }, 'Admin password'), input),
    submit);
  const dlg = modal('Open admin', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    error.hidden = true;
    if (!input.value) { input.focus(); return; }
    busy(submit, 'Checking…', async () => {
      try {
        const res = await call('adminUnlock', { password: input.value });
        app.setAdmin(res);
        dlg.close();
        toast('Admin is open on this device.');
        go(next || '#/admin', true);
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        input.select();
      }
    });
  });
}

function renderLocked(root, next) {
  mount(root, el('div', { class: 'mx-auto mt-6 max-w-md card p-6 text-center' },
    el('span', { class: 'mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300' }, baseIcon('lock', 'size-7')),
    el('h1', { class: 'text-xl font-extrabold text-slate-900 dark:text-white' }, 'Admin is locked'),
    el('p', { class: 'mt-2 text-sm muted' }, 'This page is for MINDS staff. Type the shared admin password to open it on this device.'),
    el('button', { class: 'btn btn-primary mt-5 w-full', onclick: () => openUnlock(next) }, baseIcon('unlock'), 'Open admin'),
    el('a', { href: '#/home', class: 'btn btn-secondary mt-3 w-full' }, 'Back to my volunteering')));
}

/* ---------------- header, sidebar, tabs ---------------- */

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
const isAdminRoute = (name) => name === 'admin' || name.startsWith('admin/');
const isActive = (item, name) => item.key === name || (item.also || []).includes(name);

function headerButton(label, iconName, onClick, extra = '') {
  return el('button', { type: 'button', class: `icon-btn ${extra}`, title: label, 'aria-label': label, onclick: onClick }, baseIcon(iconName));
}

function badgeCounts() {
  const home = app.cachedHome() || { pendingFeedback: [] };
  const a = app.cachedAdminHome() || {};
  const c = {
    home: (home.pendingFeedback || []).length + (home.guideRead === false ? 1 : 0),
    'admin/scan': app.queuedScans().length,
    'admin/review': a.reviewCount || 0,
    'admin/sessions': a.unpairedTotal || 0,
  };
  c.adminTab = app.isAdmin ? c['admin/scan'] + c['admin/review'] + c['admin/sessions'] : 0;
  return c;
}

const countPill = (n, extra = '') => (n ? el('span', { class: `min-w-5 rounded-full bg-amber-500 px-1.5 text-center text-[11px] font-bold leading-5 text-white ${extra}`, 'aria-label': `${n} waiting` }, String(n)) : null);

function sideLink(item, name, counts) {
  const active = item.key === 'admin' ? name === 'admin' : isActive(item, name);
  return el('a', {
    href: `#/${item.key}`,
    'aria-current': active ? 'page' : null,
    class: `flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm font-bold transition ${active ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white'}`,
  }, icon(item.icon, 'size-5'), el('span', { class: 'min-w-0 flex-1 truncate' }, item.label), countPill(counts[item.key]));
}

function renderSidebar(name, counts) {
  const u = app.user;
  const group = (title, items) => el('div', {},
    el('p', { class: 'mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500' }, title),
    el('div', { class: 'space-y-0.5' }, items.map((item) => sideLink(item, name, counts))));
  mount(sidebar,
    el('a', { href: '#/home', class: 'flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-5 dark:border-neutral-900' },
      el('span', { class: 'flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' }, baseIcon(app.isAdmin ? 'dashboard' : 'qr', 'size-6')),
      el('span', {},
        el('span', { class: 'block text-base font-extrabold leading-tight text-slate-900 dark:text-white' }, 'MINDS Volunteers'),
        el('span', { class: 'block text-xs font-medium uppercase tracking-wider muted' }, app.isAdmin ? 'Admin open' : 'Volunteer'))),
    el('nav', { class: 'flex-1 space-y-4 overflow-y-auto px-3 py-4' },
      group('My volunteering', VOLUNTEER_NAV),
      app.isAdmin
        ? ADMIN_NAV.map((g) => group(g.group, g.items))
        : el('div', { class: 'well mx-1 p-4 text-sm' },
          el('p', { class: 'font-bold text-slate-900 dark:text-white' }, 'MINDS staff?'),
          el('p', { class: 'mt-1 muted' }, 'Admin features open with the shared admin password.'),
          el('button', { class: 'btn btn-secondary btn-sm mt-3 w-full', onclick: () => openUnlock() }, baseIcon('lock', 'size-4'), 'Open admin'))),
    el('div', { class: 'border-t border-slate-200 p-4 text-xs dark:border-neutral-900' },
      el('p', { class: 'truncate font-bold text-slate-900 dark:text-white' }, u.name),
      el('p', { class: 'truncate muted' }, u.email),
      app.isAdmin ? el('div', { class: 'mt-2 flex items-center justify-between gap-2' },
        el('span', { class: 'muted' }, `Admin open until ${app.adminUntil}`),
        el('button', { class: 'font-bold text-red-600 hover:underline dark:text-red-400', onclick: () => app.lockAdmin() }, 'Leave admin')) : null));
}

function renderChrome(name) {
  const signedIn = Boolean(session.token && app.user);
  const admin = signedIn && app.isAdmin;
  const adminPage = isAdminRoute(name);
  const counts = signedIn ? badgeCounts() : {};

  // layout: wide pages for admin, a phone-width column for volunteer pages
  view.className = `mx-auto px-4 pb-28 pt-5 ${adminPage ? 'max-w-7xl sm:px-6 lg:px-8' : 'max-w-2xl'}`;
  headerRow.className = `mx-auto flex h-16 items-center justify-between gap-2 px-4 ${adminPage ? 'max-w-7xl sm:px-6' : 'max-w-2xl'} ${signedIn ? 'lg:max-w-none lg:px-8' : ''}`;
  shell.classList.toggle('lg:pl-64', signedIn);
  sidebar.classList.toggle('lg:flex', signedIn);
  brand.classList.toggle('lg:hidden', signedIn);
  crumb.classList.toggle('lg:block', signedIn);

  mount(brandIcon, baseIcon(adminPage ? 'dashboard' : 'qr', 'size-6'));
  brandSub.textContent = !signedIn ? 'Volunteer portal' : adminPage ? 'Admin' : 'Volunteer';
  const item = adminPage ? ADMIN_ITEMS.find((i) => (i.key === 'admin' ? name === 'admin' : isActive(i, name))) : VOLUNTEER_NAV.find((i) => isActive(i, name));
  crumb.textContent = signedIn && item ? `${adminPage ? 'Admin · ' : ''}${item.label}` : '';

  mount(headerActions,
    headerButton('Update app', 'refresh', (e) => updateApp(e.currentTarget)),
    el('button', { type: 'button', class: 'icon-btn text-xl', title: 'Toggle dark mode', 'aria-label': 'Toggle dark mode', onclick: toggleTheme }, '🌗'),
    admin ? headerButton(`Leave admin (open until ${app.adminUntil})`, 'lock', () => app.lockAdmin(), 'text-indigo-600 dark:text-indigo-400') : null,
    signedIn ? headerButton('Sign out', 'logout', () => app.signOut(), 'text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300') : null);

  if (signedIn) renderSidebar(name, counts);

  tabs.hidden = !signedIn;
  tabs.className = `mx-auto px-4 pb-3 lg:hidden ${adminPage ? 'max-w-7xl sm:px-6' : 'max-w-2xl'}`;
  if (signedIn) {
    const items = admin ? [...VOLUNTEER_NAV, { key: 'admin', badge: 'adminTab', label: 'Admin', icon: 'dashboard', also: ADMIN_ITEMS.map((i) => i.key).concat(ADMIN_ITEMS.flatMap((i) => i.also || [])) }] : VOLUNTEER_NAV;
    mount(tabList, items.map((t) => {
      const n = counts[t.badge || t.key];
      return el('a', { href: `#/${t.key}`, class: 'seg-item', 'aria-current': isActive(t, name) ? 'page' : null },
        baseIcon(t.icon, 'size-5 sm:size-4'),
        el('span', { class: admin ? 'max-[380px]:text-[10px]' : '' }, t.short || t.label),
        n ? el('span', { class: 'absolute right-0.5 top-0.5 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold leading-4 text-white', 'aria-label': `${n} waiting` }, String(n)) : null);
    }));
  }

  // phones: the admin sections as a scrollable row of chips under the tabs
  subnav.hidden = !(signedIn && admin && adminPage);
  if (!subnav.hidden) {
    subnav.className = 'mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6 lg:hidden';
    mount(subnav, ADMIN_ITEMS.map((i) => {
      const active = i.key === 'admin' ? name === 'admin' : isActive(i, name);
      return el('a', {
        href: `#/${i.key}`,
        'aria-current': active ? 'page' : null,
        class: `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold whitespace-nowrap ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-neutral-900 dark:text-neutral-300'}`,
      }, icon(i.icon, 'size-4'), i.short || i.label, countPill(counts[i.key], 'ml-0.5'));
    }));
    const on = subnav.querySelector('[aria-current="page"]');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
}

/* ---------------- routing ---------------- */

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

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'admin') return { name: parts.length > 1 ? `admin/${parts[1]}` : 'admin', param: parts[2] };
  return { name: parts[0] || '', param: parts[1] };
}

function route() {
  leaving.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  leaving = [];
  events = {};
  const id = ++renderId;
  const ctx = {
    alive: () => renderId === id,
    onLeave: (fn) => leaving.push(fn),
    onEvent: (n, fn) => { events[n] = fn; },
  };
  let { name, param } = parseHash();
  window.scrollTo(0, 0);

  if (!session.token || !app.user) {
    currentRoute = name;
    renderChrome('');
    if (name === 'register') renderRegister(view, app);
    else {
      if (name !== 'login') history.replaceState(null, '', '#/login');
      renderLogin(view, app);
    }
    return;
  }
  if (ALIASES[name]) {
    location.replace(`#/${ALIASES[name]}${param ? `/${encodeURIComponent(param)}` : ''}`);
    return;
  }
  const fn = ROUTES[name];
  if (!fn) {
    go('#/home');
    return;
  }
  currentRoute = name;
  renderChrome(name);
  if (isAdminRoute(name) && !app.isAdmin) {
    renderLocked(view, location.hash);
    return;
  }
  Promise.resolve(fn(view, app, ctx, param)).catch((err) => console.error(err));
}

onUnauthorized(() => {
  session.clear();
  toast('Please sign in again.', 'warn');
  go('#/login', true);
});

onAdminRequired(() => {
  if (!session.admin) return;
  session.admin = null;
  storage.remove('minds.ahome');
  toast('Admin access has ended on this device. Type the admin password to open it again.', 'warn');
  setTimeout(() => route(), 0);
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
// Admin ends by itself after its time is up: refresh the menu when that happens.
setInterval(() => { if (storage.get('minds.admin') && !session.admin) { storage.remove('minds.admin'); route(); } }, 60000);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

setOffline(navigator.onLine === false);
route();
app.flushScans();
