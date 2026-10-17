/**
 * Util.gs — errors, validation, time and ID helpers shared by every action.
 * Validation limits follow the Node prototype (200-char names, 5000-char notes).
 */

class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const err_ = {
  validation: (m) => new AppError('VALIDATION_ERROR', m),
  unauthorized: (m) => new AppError('UNAUTHORIZED', m || 'Please sign in again.'),
  forbidden: (m) => new AppError('FORBIDDEN', m || 'Only MINDS admins can do that.'),
  notFound: (m) => new AppError('NOT_FOUND', m),
  conflict: (m) => new AppError('CONFLICT', m),
  config: (m) => new AppError('CONFIG_ERROR', m),
};

const LIMITS = { NAME: 200, NOTES: 5000, SHORT: 100 };

/* ---------- validation ---------- */

function obj_(value, label) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw err_.validation(`${label || 'Request'} must be an object.`);
  return value;
}

function onlyFields_(payload, allowed) {
  Object.keys(payload).forEach((key) => {
    if (allowed.indexOf(key) === -1) throw err_.validation(`Unknown field "${key}".`);
  });
}

function str_(value, label, opts) {
  const o = opts || {};
  const max = o.max || LIMITS.NAME;
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' && typeof value !== 'number') throw err_.validation(`${label} must be text.`);
  const s = String(value).trim();
  if (o.required && !s) throw err_.validation(`${label} is required.`);
  if (s.length > max) throw err_.validation(`${label} must be at most ${max} characters.`);
  return s;
}

function id_(value, label) {
  const s = str_(value, label, { required: true, max: 40 });
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw err_.validation(`${label} is not valid.`);
  return s;
}

function isDate_(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function date_(value, label, opts) {
  const s = str_(value, label, { required: !(opts && opts.optional), max: 10 });
  if (!s) return '';
  if (!isDate_(s)) throw err_.validation(`${label} must be a valid date (YYYY-MM-DD).`);
  return s;
}

function time_(value, label, opts) {
  const s = str_(value, label, { required: !(opts && opts.optional), max: 5 });
  if (!s) return '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw err_.validation(`${label} must be a time like 09:30.`);
  return s;
}

function int_(value, label, min, max) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw err_.validation(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

function oneOf_(value, label, options) {
  if (options.indexOf(value) === -1) throw err_.validation(`${label} must be one of: ${options.join(', ')}.`);
  return value;
}

function email_(value) {
  const s = str_(value, 'Email', { required: true, max: LIMITS.NAME }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw err_.validation('Email address is not valid.');
  return s;
}

function phone_(value, label, opts) {
  const s = str_(value, label, { required: !(opts && opts.optional), max: 30 });
  if (!s) return '';
  if (!/^\+?[\d\s-]{8,20}$/.test(s)) throw err_.validation(`${label} must be a phone number, e.g. +65 9123 4567.`);
  return s;
}

function telegram_(value, opts) {
  const s = str_(value, 'Telegram handle', { max: 40 }).replace(/^@/, '');
  if (!s && opts && opts.required) throw err_.validation('Telegram handle is required. MINDS admins use it to reach you.');
  if (!s) return '';
  if (!/^[A-Za-z0-9_]{5,32}$/.test(s)) throw err_.validation('Telegram handle should be 5–32 letters, numbers or underscores.');
  return s; // stored without "@" (a leading @ would need formula-escaping in Sheets)
}

/**
 * Money in SGD, e.g. 5.5 or "5.50" → 550 (whole cents). Sums are done in cents,
 * so 0.1 + 0.2 never turns into 0.30000000000000004. The sheet shows dollars.
 */
function cents_(value, label, opts) {
  const o = opts || {};
  const s = typeof value === 'number' ? String(value) : str_(value, label, { required: true, max: 12 }).replace(/^\$|^SGD\s*/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw err_.validation(`${label} must be an amount in dollars, e.g. 5.50.`);
  const c = Math.round(Number(s) * 100);
  if (c < (o.min === undefined ? 0 : o.min) || c > 10000000) throw err_.validation(`${label} must be between $${((o.min || 0) / 100).toFixed(2)} and $100,000.`);
  return c;
}
/** Cents → dollars for the sheet (5.5 shows as 5.5; the app formats it as $5.50). */
const dollars_ = (c) => Math.round(c) / 100;
/** Sheet dollars → cents. */
const toCents_ = (d) => Math.round((Number(d) || 0) * 100);

/* ---------- time (all stored as readable Singapore time) ---------- */

function now_() {
  return new Date(); // the local test harness swaps this out to simulate time passing
}
function fmtDate_(d) {
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
}
function fmtDateTime_(d) {
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}
function parseDateTime_(s) {
  if (!s) return null;
  const d = new Date(String(s).trim().replace(' ', 'T') + CONFIG.TZ_OFFSET);
  return isNaN(d.getTime()) ? null : d;
}
function todayStr_() {
  return fmtDate_(now_());
}
/** "2026-10-14" → "Wed 14 Oct" (for messages). */
function niceDate_(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return String(dateStr || '');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

function addDays_(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function hoursBetween_(start, end) {
  return Math.round(((end.getTime() - start.getTime()) / 3600000) * 100) / 100;
}

/* ---------- ids and crypto ---------- */

function newId_(prefix) {
  return `${prefix}-${Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function b64url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function secret_() {
  const secret = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_SECRET);
  if (!secret) throw err_.config('APP_SECRET is missing. Run setup() in the Apps Script editor first.');
  return secret;
}

function sign_(message) {
  return b64url_(Utilities.computeHmacSha256Signature(message, secret_()));
}

function safeEqual_(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Lower-case, single-spaced, letters and digits only: for matching names typed in different sheets. */
function normName_(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function byKey_(rows, key) {
  const map = {};
  rows.forEach((r) => { map[r[key]] = r; });
  return map;
}

function sortBy_(rows, fn) {
  return rows.slice().sort((a, b) => {
    const x = fn(a);
    const y = fn(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
