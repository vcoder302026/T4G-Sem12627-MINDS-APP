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

const SHARED_READS_ = ['listTrainees', 'listPeople', 'listStandingPairings', 'sessionDetail', 'traineeProfile', 'reviewQueue', 'listVisits', 'pairingHistory'];
const CACHE_SECONDS_ = 120;
const MAX_CACHED_CHARS_ = 90000; // CacheService keeps up to 100 KB a value

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

/** A value cached for this data version, or computed and cached. */
function cachedForVersion_(name, compute) {
  const c = cache_();
  if (!c) return compute();
  const key = `${name}:${dataVersion_()}`;
  const hit = c.get(key);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* recompute */ }
  }
  const value = compute();
  try {
    const text = JSON.stringify(value);
    if (text.length <= MAX_CACHED_CHARS_) c.put(key, text, CACHE_SECONDS_);
  } catch (e) {
    // too big or not storable: just don't cache
  }
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

