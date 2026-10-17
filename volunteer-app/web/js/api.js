// Talks to the Apps Script web app.
// Requests are POSTed as text/plain: that is a "simple" CORS request, so the
// browser skips the preflight that Apps Script cannot answer. Apps Script then
// redirects to googleusercontent.com, which fetch follows automatically.

import { CONFIG } from './config.js';

const TOKEN_KEY = 'minds.token';

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or blocked; the app still works online
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

export const session = {
  get token() {
    return storage.get(TOKEN_KEY);
  },
  set token(value) {
    storage.set(TOKEN_KEY, value);
  },
  /**
   * Admin access on this device (after typing the shared MINDS admin password):
   * { token, expiresAt, userId }. Only valid for the person who unlocked it.
   */
  get admin() {
    const a = storage.get('minds.admin');
    const u = storage.get('minds.user');
    if (!a || !u || a.userId !== u.userId) return null;
    const exp = Date.parse(String(a.expiresAt).replace(' ', 'T') + '+08:00');
    return exp > Date.now() ? a : null;
  },
  set admin(value) {
    if (value) storage.set('minds.admin', value);
    else storage.remove('minds.admin');
  },
  clear() {
    ['minds.token', 'minds.user', 'minds.vhome', 'minds.ahome', 'minds.mode', 'minds.guide', 'minds.admin', 'minds.trainees'].forEach((k) => storage.remove(k));
  },
};

let unauthorizedHandler = () => {};
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}
let adminRequiredHandler = () => {};
/** Called when the server says the admin session has ended (expired, or the password changed). */
export function onAdminRequired(handler) {
  adminRequiredHandler = handler;
}

export const isNetworkError = (err) => err instanceof ApiError && err.code === 'NETWORK_ERROR';

export async function call(action, payload = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: session.token, adminToken: session.admin ? session.admin.token : undefined, payload }),
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', navigator.onLine === false
      ? "You're offline. Try again when you have signal."
      : "Couldn't reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new ApiError('BAD_RESPONSE', 'The server sent an unexpected reply. If this keeps happening, tell a MINDS admin.');
  }
  if (!body || body.ok !== true) {
    const error = new ApiError(body?.error?.code || 'UNKNOWN', body?.error?.message || 'Something went wrong.');
    if (error.code === 'UNAUTHORIZED' && action !== 'login') unauthorizedHandler(error);
    if (error.code === 'ADMIN_REQUIRED') adminRequiredHandler(error);
    throw error;
  }
  return body.data;
}
