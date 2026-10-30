/**
 * Speed (Version 4.1). Apps Script reads Google Sheets slowly, so the app keeps short-lived copies
 * of what many people read, in Apps Script's own cache (CacheService):
 *   - a DATA VERSION, changed by every save; anything cached belongs to one version, so after a
 *     change nobody gets old data;
 *   - admin pages that look the same for every admin (SHARED_READS_), for up to 2 minutes;
 *   - the short-name lists (DisplayNames.gs).
 * Pages also ask "has anything changed?" (the cheap `changes` action) to refresh themselves:
 * a pairing changed by one admin shows on another admin's board within about 10 seconds.
 * Edits typed straight into the sheet, or a new Google Form response, show within 2 minutes.
 */

const SHARED_READS_ = ['adminHome', 'listTrainees', 'listPeople', 'listStandingPairings', 'sessionDetail', 'traineeProfile', 'reviewQueue', 'listVisits', 'pairingHistory'];
const CACHE_SECONDS_ = 120;
const MAX_CACHED_CHARS_ = 900000; // bigger answers aren't cached (kept in pieces: putBig_)

function cache_() {
  try {
    return CacheService.getScriptCache();
  } catch (e) {
    return null;
  }
}

/** The current data version (a new one is made if the cache forgot it). */
function dataVersion_() {
  const c = cache_();
  if (!c) return 'none';
  let v = c.get('data-version');
  if (!v) {
    v = `${Date.now()}`;
    c.put('data-version', v, 21600);
  }
  return v;
}

/** Called after every successful save: everything cached before it is no longer used. */
function bumpDataVersion_() {
  const c = cache_();
  if (c) c.put('data-version', `${Date.now()}${Math.random().toString(36).slice(2, 6)}`, 21600);
}

/** A short, stable text for a cache key. */
function hashText_(s) {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = (h1 * 33) ^ ch;
    h2 = (h2 * 33) ^ ch;
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

/**
 * Values bigger than one cache entry (100 KB, counted in bytes) are kept in pieces of 30,000
 * characters: at most ~90 KB even when every character takes 3 bytes (e.g. Chinese text).
 */
const PIECE_CHARS_ = 30000;

function putBig_(c, key, text, seconds) {
  const n = Math.ceil(text.length / PIECE_CHARS_) || 1;
  for (let i = 0; i < n; i++) c.put(`${key}#${i}`, text.slice(i * PIECE_CHARS_, (i + 1) * PIECE_CHARS_), seconds);
  c.put(key, String(n), seconds); // last, so a half-written value is never read
}

function getBig_(c, key) {
  const n = Number(c.get(key) || 0);
  if (!n) return null;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const part = c.get(`${key}#${i}`);
    if (part === null) return null;
    parts.push(part);
  }
  return parts.join('');
}

/** A value cached for this data version, or computed and cached. */
function cachedForVersion_(name, compute) {
  const c = cache_();
  if (!c) return compute();
  const key = `${name}:${dataVersion_()}`;
  const hit = getBig_(c, key);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* recompute */ }
  }
  // Ten admins asking at once: the first builds it, the others wait briefly for that copy.
  const building = `building:${key}`;
  if (c.get(building)) {
    for (let i = 0; i < 16; i++) {
      Utilities.sleep(250);
      const ready = getBig_(c, key);
      if (ready) {
        try { return JSON.parse(ready); } catch (e) { break; }
      }
    }
  }
  c.put(building, '1', 20);
  let value;
  try {
    value = compute();
    const text = JSON.stringify(value);
    if (text.length <= MAX_CACHED_CHARS_) putBig_(c, key, text, CACHE_SECONDS_);
  } catch (e) {
    if (value === undefined) { c.remove(building); throw e; }
    // too big or not storable: just don't cache
  }
  c.remove(building);
  return value;
}

/** For admin pages that look the same for every admin: the cached response, or null. */
function sharedReadKey_(action, payload, user) {
  if (SHARED_READS_.indexOf(action) === -1 || !user || user.role !== 'admin') return '';
  return `read:${action}:${hashText_(JSON.stringify(payload || {}))}`;
}

/** "Has anything changed?" Pages call this every few seconds; it doesn't touch the sheets. */
function changes_() {
  return { version: dataVersion_() };
}

/* ---------- who's signed in, remembered for reads ---------- */

// Set when this request wrote to the Volunteers or sign-in tab (Db.gs): any save that changes
// someone (a profile edit, becoming a regular after 10 sessions, a password change…) makes the
// remembered sign-ins out of date.
let PEOPLE_CHANGED_ = false;

function peopleVersion_() {
  const c = cache_();
  if (!c) return 'none';
  let v = c.get('people-version');
  if (!v) { v = `${Date.now()}`; c.put('people-version', v, 21600); }
  return v;
}

function bumpPeopleVersion_() {
  const c = cache_();
  if (c) c.put('people-version', `${Date.now()}${Math.random().toString(36).slice(2, 6)}`, 21600);
}

function rememberedUser_(userId, tokenVersion) {
  const c = cache_();
  if (!c) return null;
  const hit = c.get(`who:${userId}:${tokenVersion}:${peopleVersion_()}`);
  if (!hit) return null;
  try { return JSON.parse(hit); } catch (e) { return null; }
}

function rememberUser_(user, tokenVersion) {
  const c = cache_();
  if (!c) return;
  try { c.put(`who:${user.userId}:${tokenVersion}:${peopleVersion_()}`, JSON.stringify(user), 300); } catch (e) { /* fine */ }
}

/** "Has anything changed?", and if so (and asked for) the page's new data in the same request. */
function changesWithData_(p, user) {
  onlyFields_(p, ['since', 'watch']);
  const version = dataVersion_();
  const out = { version };
  if (!p.watch || p.since === undefined || String(p.since) === version) return out;
  const w = obj_(p.watch, 'Watch');
  const action = String(w.action || '');
  const payload = w.payload && typeof w.payload === 'object' ? w.payload : {};
  const key = sharedReadKey_(action, payload, user);
  if (!key) return out; // only admin pages that are the same for every admin
  out.data = cachedForVersion_(key, () => applyDisplayNames_(action, routes_()[action].fn(payload, user)));
  return out;
}

/* ---------- copies of the tabs (Version 4.3) ---------- */
// Reading a tab from Google Sheets takes 0.5–1 s; from the cache, a few hundredths of a second.
// Each tab has a version that changes when the app writes to it, so a copy is never used after
// a change made in the app. Edits typed into the sheet, or a new Google Form response, show
// within TABLE_SECONDS_. Turn it off with the script property TABLE_CACHE = off.

const TABLE_SECONDS_ = 60;
let IN_LOCK_ = false;          // inside a save: always read the sheet itself
let TOUCHED_TABLES_ = {};      // tabs written in this request
let TABLE_CACHE_ON_ = null;

function tableCacheOn_() {
  if (TABLE_CACHE_ON_ === null) {
    TABLE_CACHE_ON_ = String(PropertiesService.getScriptProperties().getProperty('TABLE_CACHE') || 'on').toLowerCase() !== 'off';
  }
  return TABLE_CACHE_ON_;
}

/** 'trainees:new' and 'trainees:visit' are the trainee tab too. */
function tableName_(cacheKey) {
  return /^trainees/.test(cacheKey) ? 'trainees' : cacheKey;
}

function tableVersion_(name) {
  const c = cache_();
  if (!c) return 'none';
  let v = c.get(`tv:${name}`);
  if (!v) { v = `${Date.now()}`; c.put(`tv:${name}`, v, 21600); }
  return v;
}

/** After a request wrote to tabs: their copies are out of date. */
function bumpTouchedTables_() {
  const c = cache_();
  const names = Object.keys(TOUCHED_TABLES_);
  TOUCHED_TABLES_ = {};
  if (!c || !names.length) return;
  const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  names.forEach((n) => c.put(`tv:${n}`, stamp, 21600));
}

/** Every copy out of date at once (setup, editor functions). */
function bumpAllTables_() {
  const c = cache_();
  if (c) c.put('tv-epoch', `${Date.now()}`, 21600);
}

function snapshotKey_(cacheKey) {
  const c = cache_();
  return `tbl:${tableName_(cacheKey)}:${tableVersion_(tableName_(cacheKey))}:${(c && c.get('tv-epoch')) || '0'}:${cacheKey}`;
}

function readTableSnapshot_(cacheKey) {
  if (!tableCacheOn_()) return null;
  const c = cache_();
  if (!c) return null;
  try {
    const text = getBig_(c, snapshotKey_(cacheKey));
    if (!text) return null;
    const snap = JSON.parse(text);
    snap.values = snap.values.map((row) => row.map((v) => (v && typeof v === 'object' && '$d' in v ? new Date(v.$d) : v)));
    return snap;
  } catch (e) {
    return null;
  }
}

function writeTableSnapshot_(cacheKey, values, tz) {
  if (!tableCacheOn_()) return;
  const c = cache_();
  if (!c) return;
  try {
    const text = JSON.stringify({ tz, values: values.map((row) => row.map((v) => (Object.prototype.toString.call(v) === '[object Date]' ? { $d: v.getTime() } : v))) });
    if (text.length > 4000000) return; // very large tabs are read from the sheet
    putBig_(c, snapshotKey_(cacheKey), text, TABLE_SECONDS_);
  } catch (e) {
    // the cache is full or unavailable: read from the sheet next time
  }
}

/** A trainee looked up from the recent copy, even during a save (only their ID and name are used). */
function traineeFromCopy_(id) {
  const was = IN_LOCK_;
  IN_LOCK_ = false;
  try {
    return traineeById_(id);
  } finally {
    IN_LOCK_ = was;
  }
}

/** Functions run from the Apps Script editor (setup, …) read the sheets themselves, not copies. */
function freshReads_(fn) {
  const was = IN_LOCK_;
  IN_LOCK_ = true;
  try {
    return fn();
  } finally {
    IN_LOCK_ = was;
  }
}

