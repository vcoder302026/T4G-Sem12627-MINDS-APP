// Staff dashboard shell: sign-in (volunteer leaders only), the section menu,
// hash routing and the header. It talks to the same Apps Script backend and
// Google Sheet as the phone app, and shares its sign-in on this browser.

import { call, onUnauthorized, session, storage } from '../../js/api.js';
import { CONFIG } from '../../js/config.js';
import { busy, el, field, formData, mount, toast } from '../../js/ui.js';
import { icon } from './kit.js';
import * as A from './views/attendance.js';
import * as F from './views/fundraising.js';
import * as O from './views/outings.js';
import * as Ov from './views/overview.js';
import * as P from './views/people.js';
import * as T from './views/trips.js';
import * as Vi from './views/visits.js';

const view = document.getElementById('view');
const sidebar = document.getElementById('sidebar');
const topnav = document.getElementById('topnav');
const crumb = document.getElementById('crumb');
const headerActions = document.getElementById('header-actions');

// The five sections. `also` lists detail pages that belong to a menu item.
const NAV = [
  { section: 'Overview & people', items: [
    { key: 'overview', label: 'Overview', icon: 'dashboard' },
    { key: 'attendance', label: 'Attendance', icon: 'clock' },
    { key: 'hours', label: 'Volunteer hours', icon: 'check' },
    { key: 'volunteers', label: 'Volunteers', icon: 'users', also: ['volunteer'] },
    { key: 'trainees', label: 'Trainees', icon: 'heart', also: ['trainee'] },
  ] },
  { section: 'Fundraising', items: [{ key: 'fundraising', label: 'Fundraisers', icon: 'coins', also: ['fundraiser'] }] },
  { section: 'Outings', items: [{ key: 'outings', label: 'Outings', icon: 'bus', also: ['outing'] }] },
  { section: 'Overseas trips', items: [{ key: 'trips', label: 'Trips', icon: 'plane', also: ['trip'] }] },
  { section: 'House visits', items: [{ key: 'visits', label: 'Visit records', icon: 'home' }] },
];

const ROUTES = {
  overview: Ov.renderOverview,
  attendance: A.renderAttendance,
  hours: A.renderHours,
  volunteers: P.renderVolunteers,
  volunteer: P.renderVolunteer,
  trainees: P.renderTrainees,
  trainee: P.renderTrainee,
  fundraising: F.renderFundraisers,
  fundraiser: F.renderFundraiser,
  outings: O.renderOutings,
  outing: O.renderOuting,
  trips: T.renderTrips,
  trip: T.renderTrip,
  visits: Vi.renderVisits,
};

const app = {
  get user() {
    return storage.get('minds.user');
  },
  signOut() {
    session.clear();
    route();
  },
  rerender() {
    route();
  },
  /** Link to the phone app (the folder above this one). */
  phoneAppUrl: new URL('../', location.href).href,
};

/* ---------------- header and menu ---------------- */

function toggleTheme() {
  const dark = !document.documentElement.classList.contains('dark');
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('light', !dark);
  try {
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  } catch {
    // ignore
  }
}

function headerButton(label, iconName, onClick, extra = '') {
  return el('button', { type: 'button', class: `icon-btn ${extra}`, title: label, 'aria-label': label, onclick: onClick }, icon(iconName));
}

function navLink(item, active, compact) {
  return el('a', {
    href: `#/${item.key}`,
    'aria-current': active ? 'page' : null,
    class: compact
      ? `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold whitespace-nowrap ${active ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-900'}`
      : `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold transition ${active ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white'}`,
  }, icon(item.icon, compact ? 'size-4' : 'size-5'), item.label);
}

function renderChrome(name) {
  const user = app.user;
  const signedIn = Boolean(session.token && user && user.role === 'admin');
  const isActive = (item) => item.key === name || (item.also || []).includes(name);
  mount(document.getElementById('brand-icon-top'), icon('dashboard', 'size-6'));

  mount(headerActions,
    signedIn ? el('a', { href: app.phoneAppUrl, class: 'btn btn-secondary btn-sm hidden sm:inline-flex', title: 'Open the phone app (sessions, scanning, notes to review)' }, icon('qr', 'size-4'), 'Phone app') : null,
    el('button', { type: 'button', class: 'icon-btn text-xl', title: 'Toggle dark mode', 'aria-label': 'Toggle dark mode', onclick: toggleTheme }, '🌗'),
    signedIn ? headerButton('Sign out', 'logout', () => app.signOut(), 'text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300') : null);

  const current = NAV.find((s) => s.items.some(isActive));
  crumb.textContent = signedIn && current ? current.section : '';

  sidebar.hidden = !signedIn;
  topnav.hidden = !signedIn;
  document.getElementById('shell').classList.toggle('lg:pl-64', signedIn);
  if (!signedIn) return;
  mount(sidebar,
    el('a', { href: '#/overview', class: 'flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-5 dark:border-neutral-900' },
      el('span', { class: 'flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' }, icon('dashboard', 'size-6')),
      el('span', {},
        el('span', { class: 'block text-base font-extrabold leading-tight text-slate-900 dark:text-white' }, 'MINDS Staff'),
        el('span', { class: 'block text-xs font-medium uppercase tracking-wider muted' }, 'Dashboard'))),
    el('nav', { class: 'flex-1 space-y-5 overflow-y-auto px-3 py-5' },
      NAV.map((s, i) => el('div', {},
        el('p', { class: 'mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500' }, `${i + 1}. ${s.section}`),
        el('div', { class: 'space-y-0.5' }, s.items.map((item) => navLink(item, isActive(item), false)))))),
    el('div', { class: 'border-t border-slate-200 p-4 text-xs dark:border-neutral-900' },
      el('p', { class: 'truncate font-bold text-slate-900 dark:text-white' }, user.name),
      el('p', { class: 'truncate muted' }, user.email)));
  mount(topnav, NAV.flatMap((s) => s.items).map((item) => navLink(item, isActive(item), true)));
}

/* ---------------- sign-in ---------------- */

function renderSignIn(root) {
  const error = el('div', { class: 'alert alert-error', role: 'alert', hidden: true });
  const submit = el('button', { type: 'submit', class: 'btn btn-primary w-full' }, 'Sign in');
  const form = el('form', { novalidate: true, class: 'space-y-4' }, error,
    field('email', 'Email', { type: 'email', autocomplete: 'username', placeholder: 'you@example.com' }),
    field('password', 'Password', { type: 'password', autocomplete: 'current-password', placeholder: '••••••••' }),
    submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    error.hidden = true;
    const d = formData(form);
    if (!d.email || !form.password.value) {
      error.textContent = 'Enter your email and password.';
      error.hidden = false;
      return;
    }
    busy(submit, 'Signing in…', async () => {
      try {
        const res = await call('login', { email: d.email, password: form.password.value });
        session.token = res.token;
        storage.set('minds.user', res.user);
        storage.set('minds.mode', res.user.role === 'admin' ? 'leader' : 'volunteer');
        route();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    });
  });
  mount(root, el('div', { class: 'mx-auto mt-10 max-w-md' },
    el('div', { class: 'mb-6 text-center' },
      el('div', { class: 'mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' }, icon('dashboard', 'size-8')),
      el('h1', { class: 'text-3xl font-extrabold text-slate-900 dark:text-white' }, 'MINDS Staff Dashboard'),
      el('p', { class: 'mt-1 muted' }, 'Volunteers, trainees, hours, fundraising, outings, trips and house visits.')),
    el('div', { class: 'card p-6 shadow-md sm:p-8' }, form,
      el('p', { class: 'mt-4 text-center text-xs muted' }, 'Sign in with your volunteer leader account (the same one as the phone app).'))));
}

function renderLeadersOnly(root) {
  mount(root, el('div', { class: 'mx-auto mt-10 max-w-md card p-6 text-center' },
    el('h1', { class: 'text-xl font-extrabold' }, 'Leaders only'),
    el('p', { class: 'mt-2 muted' }, `${app.user.name}, the staff dashboard is for volunteer leaders. Use the phone app to book sessions and see your hours.`),
    el('div', { class: 'mt-5 flex justify-center gap-2' },
      el('a', { href: app.phoneAppUrl, class: 'btn btn-primary' }, 'Open the phone app'),
      el('button', { class: 'btn btn-secondary', onclick: () => app.signOut() }, 'Sign out'))));
}

/* ---------------- routing ---------------- */

let renderId = 0;
let checkedUser = false;

function route() {
  const id = ++renderId;
  const ctx = { alive: () => renderId === id };
  const [name = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const param = rest.length ? decodeURIComponent(rest.join('/')) : undefined;
  window.scrollTo(0, 0);

  if (!session.token || !app.user) {
    renderChrome('');
    renderSignIn(view);
    return;
  }
  if (app.user.role !== 'admin') {
    renderChrome('');
    renderLeadersOnly(view);
    return;
  }
  const fn = ROUTES[name];
  if (!fn) {
    location.replace('#/overview');
    return;
  }
  renderChrome(name);
  Promise.resolve(fn(view, app, ctx, param)).catch((err) => console.error(err));

  if (!checkedUser) {
    // Re-check the role once per page load, in case it changed since this browser signed in.
    checkedUser = true;
    call('me').then((res) => {
      storage.set('minds.user', res.user);
      if (res.user.role !== 'admin') route();
    }).catch(() => {});
  }
}

onUnauthorized(() => {
  session.clear();
  toast('Please sign in again.', 'warn');
  route();
});

if (CONFIG.ENV_LABEL) {
  const bar = document.getElementById('env-bar');
  bar.textContent = CONFIG.ENV_LABEL;
  bar.classList.add(CONFIG.ENVIRONMENT === 'Exp' ? 'bg-purple-600' : 'bg-red-600');
  bar.hidden = false;
}

window.addEventListener('hashchange', route);
route();
