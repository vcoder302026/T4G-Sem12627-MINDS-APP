// Application shell: session bootstrap, hash routing and login/logout.

import { api, setUnauthorizedHandler } from './api.js';
import { el, errorNotice, loadingState } from './ui.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderTrainees, renderVolunteers } from './modules/directory.js';
import { renderAttendanceDetail, renderAttendanceList } from './modules/attendance.js';
import { renderFundraiserDetail, renderFundraiserList } from './modules/fundraising.js';
import { renderOutingDetail, renderOutingList } from './modules/outings.js';
import { renderTripDetail, renderTripList } from './modules/trips.js';
import { renderVisits } from './modules/visits.js';

const routes = [
  { pattern: /^\/dashboard$/, render: renderDashboard, nav: 'dashboard' },
  { pattern: /^\/volunteers$/, render: renderVolunteers, nav: 'volunteers' },
  { pattern: /^\/trainees$/, render: renderTrainees, nav: 'trainees' },
  { pattern: /^\/attendance$/, render: renderAttendanceList, nav: 'attendance' },
  { pattern: /^\/attendance\/(\d+)$/, render: renderAttendanceDetail, nav: 'attendance' },
  { pattern: /^\/fundraising$/, render: renderFundraiserList, nav: 'fundraising' },
  { pattern: /^\/fundraising\/(\d+)$/, render: renderFundraiserDetail, nav: 'fundraising' },
  { pattern: /^\/outings$/, render: renderOutingList, nav: 'outings' },
  { pattern: /^\/outings\/(\d+)$/, render: renderOutingDetail, nav: 'outings' },
  { pattern: /^\/trips$/, render: renderTripList, nav: 'trips' },
  { pattern: /^\/trips\/(\d+)$/, render: renderTripDetail, nav: 'trips' },
  { pattern: /^\/visits$/, render: renderVisits, nav: 'visits' },
];

let currentUser = null;

const loginView = document.getElementById('login-view');
const shellView = document.getElementById('shell');
const view = document.getElementById('view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginSubmit = document.getElementById('login-submit');
const userNameLabel = document.getElementById('user-name');
const logoutButton = document.getElementById('logout-btn');

function showLogin(message) {
  currentUser = null;
  shellView.hidden = true;
  loginView.hidden = false;
  loginError.hidden = !message;
  loginError.textContent = message || '';
  document.getElementById('login-username').focus();
}

function showShell() {
  loginView.hidden = true;
  shellView.hidden = false;
  userNameLabel.textContent = currentUser ? currentUser.name : '';
}

function navigate(path) {
  if (`#${path}` === location.hash) {
    handleRoute();
  } else {
    location.hash = `#${path}`;
  }
}

function parseHash() {
  const raw = (location.hash || '').replace(/^#/, '');
  let path = raw.startsWith('/') ? raw : `/${raw}`;
  if (path === '/') path = '/dashboard';
  for (const route of routes) {
    const match = path.match(route.pattern);
    if (match) {
      return { route, id: match[1] ? Number(match[1]) : null };
    }
  }
  return null;
}

function setActiveNav(navKey) {
  for (const link of document.querySelectorAll('.nav a')) {
    link.classList.toggle('active', link.dataset.nav === navKey);
  }
}

async function handleRoute() {
  if (!currentUser) return;
  const parsed = parseHash();
  if (!parsed) {
    location.replace('#/dashboard');
    return;
  }
  setActiveNav(parsed.route.nav);
  view.replaceChildren(loadingState());
  try {
    const ctx = { id: parsed.id, navigate, user: currentUser };
    await parsed.route.render(view, ctx);
  } catch (err) {
    view.replaceChildren();
    if (err && err.status === 401) return; // login screen already shown by the api wrapper
    const head = el('h1', {}, 'Something went wrong');
    view.append(head, errorNotice(err));
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  loginSubmit.disabled = true;
  loginSubmit.textContent = 'Signing in…';
  try {
    const data = await api.post('/api/auth/login', {
      username: document.getElementById('login-username').value,
      password: document.getElementById('login-password').value,
    });
    currentUser = data;
    showShell();
    document.getElementById('login-password').value = '';
    if (!location.hash || location.hash === '#/' || location.hash === '#') {
      location.replace('#/dashboard');
    }
    await handleRoute();
  } catch (err) {
    loginError.hidden = false;
    loginError.textContent = err.message;
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Sign in';
  }
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    await api.post('/api/auth/logout');
  } catch {
    // clearing the local session is enough for the prototype
  } finally {
    logoutButton.disabled = false;
  }
  view.replaceChildren();
  showLogin();
});

window.addEventListener('hashchange', handleRoute);

async function boot() {
  setUnauthorizedHandler(() => {
    view.replaceChildren();
    showLogin('Your session has expired. Sign in again.');
  });
  try {
    currentUser = await api.get('/api/auth/me');
  } catch (err) {
    if (err.status === 401) {
      showLogin();
    } else {
      showLogin(`Could not reach the server: ${err.message}`);
    }
    return;
  }
  showShell();
  if (!location.hash || location.hash === '#' || location.hash === '#/') {
    location.replace('#/dashboard');
  }
  await handleRoute();
}

boot();
