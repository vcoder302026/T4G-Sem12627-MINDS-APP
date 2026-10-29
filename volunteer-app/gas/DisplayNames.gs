/**
 * Names in the app (Version 4): volunteers and trainees are shown by their SHORT NAME, in
 * alphanumeric order. When two volunteers (or two trainees) share a short name, those two are
 * shown by their full name instead. Someone without a short name is shown by their full name.
 *
 * Applied once to every response (Main.gs → handle_), so each screen doesn't need to know:
 *   - an object with a person's ID and name gets the display name in `name` (or
 *     `volunteerName`, `traineeName`, `adminName`, …), and the original in `fullName`
 *     (`volunteerFullName`, …), so searches and page titles can still use it;
 *   - a list of people (or trainees) is sorted by the display name, unless it's in date order
 *     (its items have a date, a session, a note, …).
 * Responses that feed edit forms keep the real Full Name (DISPLAY_NAME_EXEMPT_).
 */

const DISPLAY_NAME_EXEMPT_ = ['me', 'login', 'register', 'personDetail', 'updatePerson', 'updateProfile', 'createVolunteer'];
const DATED_KEYS_ = ['date', 'timestamp', 'at', 'sessionId', 'noteId', 'visitId', 'clockIn'];

/** userId / traineeId → the name to show. */
function displayNameMaps_() {
  const pick = (rows, idOf, fullOf, shortOf) => {
    const count = {};
    rows.forEach((r) => { const s = shortOf(r).toLowerCase(); if (s) count[s] = (count[s] || 0) + 1; });
    const map = {};
    rows.forEach((r) => {
      const short = shortOf(r);
      map[idOf(r)] = short && count[short.toLowerCase()] === 1 ? short : fullOf(r);
    });
    return map;
  };
  const users = table_('users').rows();
  const active = users.filter((u) => u.status !== 'inactive');
  const userMap = pick(active, (u) => String(u.userId), (u) => String(u.name || '').trim(), (u) => String(u.shortName || '').trim());
  users.forEach((u) => { if (!(String(u.userId) in userMap)) userMap[String(u.userId)] = String(u.name || '').trim(); });
  let traineeMap = {};
  try {
    const trainees = traineeTable_().rows().filter((t) => t.id);
    traineeMap = pick(trainees, (t) => String(t.id), (t) => String(t.name || '').trim(), (t) => String(t.preferredName || '').trim());
  } catch (e) {
    // no trainee sheet yet (before setup): leave trainee names as they are
  }
  return { user: userMap, trainee: traineeMap };
}

function applyDisplayNames_(action, data) {
  if (!data || typeof data !== 'object' || DISPLAY_NAME_EXEMPT_.indexOf(action) >= 0) return data;
  let maps = null;
  const get = () => maps || (maps = displayNameMaps_());
  const kindOf = (id) => (/^U-/.test(id) ? 'user' : /^T-\d+/.test(id) ? 'trainee' : '');
  const rename = (o, idKey, nameKey) => {
    const id = String(o[idKey] || '');
    const kind = kindOf(id);
    if (!kind || typeof o[nameKey] !== 'string') return false;
    const shown = get()[kind][id];
    if (!shown || shown === o[nameKey]) return true;
    const fullKey = nameKey === 'name' ? 'fullName' : nameKey.replace(/Name$/, 'FullName');
    if (o[fullKey] === undefined) o[fullKey] = o[nameKey];
    o[nameKey] = shown;
    return true;
  };
  const personLike = (o) => o && typeof o === 'object' && !Array.isArray(o)
    && ((o.userId && typeof o.name === 'string') || (/^T-\d+/.test(String(o.id || '')) && typeof o.name === 'string')
      || (o.userId && typeof o.volunteerName === 'string') || (o.traineeId && typeof o.traineeName === 'string' && !o.userId));
  const sortName = (o) => String(o.name || o.volunteerName || o.traineeName || '');
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 12) return;
    if (Array.isArray(node)) {
      node.forEach((x) => walk(x, depth + 1));
      if (node.length > 1 && node.every(personLike) && !node.some((o) => DATED_KEYS_.some((k) => o[k] !== undefined && o[k] !== ''))) {
        node.sort((a, b) => sortName(a).localeCompare(sortName(b), 'en', { numeric: true, sensitivity: 'base' }));
      }
      return;
    }
    if (node.userId !== undefined && node.name !== undefined) rename(node, 'userId', 'name');
    else if (node.id !== undefined && node.name !== undefined) rename(node, 'id', 'name');
    Object.keys(node).forEach((k) => {
      const m = /^(.*)Id$/.exec(k);
      if (m && m[1]) rename(node, k, `${m[1]}Name`);
    });
    if (node.userId !== undefined && node.volunteerName !== undefined) rename(node, 'userId', 'volunteerName');
    Object.keys(node).forEach((k) => walk(node[k], depth + 1));
  };
  walk(data, 0);
  return data;
}
