/**
 * Pairs.gs — the Pairing List: standing volunteer ↔ trainee pairs.
 *
 * Mostly for regular volunteers, who always work with the same trainee(s).
 * Pairs go both ways: one volunteer can have several trainees and one trainee
 * several volunteers. When a volunteer says they're coming to a session, their
 * active pairs are used first (Trainees.gs → pickTrainees_).
 *
 * Admins add and end pairs in Admin → Pairing list, or import them from an
 * existing sheet of pairs, or from the house-visit form responses ("Name of
 * Attached Volunteer"). Ended pairs stay in the tab as history.
 *
 * Also here: a trainee's (or volunteer's) partner history, gathered from the
 * Pairing List, sessions, house visits, outings and trips.
 */

function activePairs_() {
  return memo_('activePairs', () => table_('pairs').rows().filter((x) => x.pairId && x.status !== 'ended' && x.userId && x.traineeId));
}

function pairOut_(x, names) {
  return {
    pairId: x.pairId,
    userId: x.userId,
    volunteerName: (names && names.users[x.userId]) || x.volunteerName,
    traineeId: String(x.traineeId),
    traineeName: (names && names.trainees[String(x.traineeId)]) || x.traineeName,
    since: x.since || '',
    notes: x.notes || '',
    status: x.status === 'ended' ? 'ended' : 'active',
    source: x.source || 'app',
    addedBy: x.addedBy || '',
    endedAt: x.endedAt || '',
  };
}

/** Active pairs for one volunteer or one trainee. */
function pairsFor_(o) {
  const names = nameMaps_();
  return activePairs_()
    .filter((x) => (!o.userId || x.userId === o.userId) && (!o.traineeId || String(x.traineeId) === String(o.traineeId)))
    .map((x) => pairOut_(x, names));
}

function listPairs_(p) {
  onlyFields_(p, ['showEnded']);
  const names = nameMaps_();
  const all = table_('pairs').rows().filter((x) => x.pairId && (p.showEnded === true || x.status !== 'ended'));
  const users = byKey_(table_('users').rows().filter((u) => u.userId), 'userId');
  const pairs = sortBy_(all.map((x) => pairOut_(x, names)), (x) => `${x.status}|${String(x.volunteerName).toLowerCase()}|${String(x.traineeName).toLowerCase()}`)
    .map((x) => Object.assign(x, { volunteerType: users[x.userId] ? volunteerTypeOf_(users[x.userId]).type : '' }));
  const active = pairs.filter((x) => x.status === 'active');
  const pairedTrainees = {};
  const pairedVolunteers = {};
  active.forEach((x) => { pairedTrainees[x.traineeId] = true; pairedVolunteers[x.userId] = true; });
  const options = pickLists_();
  return {
    pairs,
    options,
    counts: {
      pairs: active.length,
      volunteers: Object.keys(pairedVolunteers).length,
      trainees: Object.keys(pairedTrainees).length,
      traineesWithoutPair: options.trainees.filter((t) => !pairedTrainees[t.id]).length,
    },
    importFrom: {
      pairs: Boolean(sheetLocation_('pairs')),
      traineeUpdates: Boolean(sheetLocation_('traineeUpdates')),
    },
  };
}

function insertPair_(user, trainee, admin, notes, source) {
  const exists = activePairs_().find((x) => x.userId === user.userId && String(x.traineeId) === String(trainee.id));
  if (exists) return null;
  const row = table_('pairs').insert({
    pairId: newId_('PR'),
    userId: user.userId,
    volunteerName: user.name,
    traineeId: String(trainee.id),
    traineeName: trainee.name,
    since: todayStr_(),
    notes: notes || '',
    status: 'active',
    source: source || 'app',
    addedBy: admin.name,
    addedAt: fmtDateTime_(now_()),
  });
  delete DB_.memo.activePairs;
  return row;
}

function addPair_(p, admin) {
  onlyFields_(p, ['userId', 'traineeId', 'notes']);
  const user = volunteerRef_(p.userId, 'Volunteer'); // Dashboard.gs
  const trainee = traineeRef_(p.traineeId, 'Trainee');
  const notes = str_(p.notes, 'Notes', { max: 500 });
  if (!insertPair_(user, trainee, admin, notes, 'app')) throw err_.conflict(`${user.name} and ${trainee.name} are already a pair.`);
  const others = activePairs_().filter((x) => String(x.traineeId) === String(trainee.id) && x.userId !== user.userId).length;
  return Object.assign(listPairs_({ showEnded: true }), {
    message: `${user.name} and ${trainee.name} are now a regular pair.${others ? ` ${trainee.name} has ${others + 1} regular volunteers.` : ''}`,
  });
}

function endPair_(p, admin) {
  onlyFields_(p, ['pairId']);
  const { table, row } = rowById_('pairs', 'pairId', p.pairId, 'Pair');
  if (row.status === 'ended') throw err_.conflict('This pair has already ended.');
  table.update(row, { status: 'ended', endedBy: admin.name, endedAt: fmtDateTime_(now_()) });
  delete DB_.memo.activePairs;
  return Object.assign(listPairs_({ showEnded: true }), { message: `${row.volunteerName} and ${row.traineeName} are no longer a regular pair (kept as history).` });
}

/* ---------- import ---------- */

/** First header in `candidates` that the sheet has (case-insensitive) → column index, or -1. */
function headerIndex_(headers, candidates) {
  const lower = headers.map((h) => String(h).trim().toLowerCase());
  for (let i = 0; i < candidates.length; i++) {
    const at = lower.indexOf(String(candidates[i]).toLowerCase());
    if (at >= 0) return at;
  }
  return -1;
}

/** Reads a whole tab as { headers, rows: [[…]] } with values converted like Table does. */
function readSheet_(loc) {
  const sheet = loc.ss.getSheetByName(loc.tab);
  if (!sheet) throw err_.config(`The "${loc.tab}" tab was not found. Check the link in Admin → Settings → Databases.`);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const values = lastRow && lastCol ? sheet.getRange(1, 1, lastRow, lastCol).getValues() : [[]];
  const tz = loc.ss.getSpreadsheetTimeZone() || CONFIG.TIMEZONE;
  const headers = (values[0] || []).map((h) => String(h).trim());
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    if (values[r].every((v) => v === '' || v === null)) continue;
    const line = values[r].map((v) => cellToValue_(v, false, tz));
    line._row = r + 1;
    rows.push(line);
  }
  return { sheet, headers, rows };
}

/**
 * Imports pairs into the Pairing List:
 *   from: 'pairs'           the linked pairs sheet (volunteer email or name + trainee ID or name)
 *   from: 'traineeUpdates'  the house-visit form responses: each trainee's latest attached volunteer(s)
 * People are matched by email, or by full name; anyone not found is listed, not added.
 */
function importPairs_(p, admin) {
  onlyFields_(p, ['from']);
  const from = oneOf_(p.from, 'Import from', ['pairs', 'traineeUpdates']);
  const users = table_('users').rows().filter((u) => u.userId && u.status !== 'inactive');
  const byEmail = {};
  const byName = {};
  users.forEach((u) => { byEmail[String(u.email).toLowerCase()] = u; byName[normName_(u.name)] = u; });
  const trainees = traineeTable_().rows().filter((t) => t.id && t.name);
  const tById = byKey_(trainees.map((t) => Object.assign({ key: String(t.id) }, t)), 'key');
  const tByName = {};
  trainees.forEach((t) => { tByName[normName_(t.name)] = t; });

  const wanted = []; // { volunteer: text, trainee: text, user, trainee }
  if (from === 'pairs') {
    const loc = sheetLocation_('pairs');
    if (!loc) throw err_.validation('Link the pairs sheet first (Admin → Settings → Databases → Existing pairs).');
    const sheet = readSheet_(loc);
    const c = CONFIG.PAIRS_IMPORT;
    const iEmail = headerIndex_(sheet.headers, c.volunteerEmail);
    const iVName = headerIndex_(sheet.headers, c.volunteerName);
    const iTId = headerIndex_(sheet.headers, c.traineeId);
    const iTName = headerIndex_(sheet.headers, c.traineeName);
    if ((iEmail < 0 && iVName < 0) || (iTId < 0 && iTName < 0)) {
      throw err_.validation(`The pairs sheet needs a volunteer column (${c.volunteerEmail.concat(c.volunteerName).join(' / ')}) and a trainee column (${c.traineeId.concat(c.traineeName).join(' / ')}).`);
    }
    sheet.rows.forEach((line) => {
      const vText = iEmail >= 0 && line[iEmail] ? line[iEmail] : iVName >= 0 ? line[iVName] : '';
      const tText = iTId >= 0 && line[iTId] ? line[iTId] : iTName >= 0 ? line[iTName] : '';
      if (!vText || !tText) return;
      wanted.push({
        volunteer: vText,
        trainee: tText,
        user: byEmail[String(vText).toLowerCase()] || byName[normName_(vText)],
        t: tById[String(tText)] || tByName[normName_(tText)],
      });
    });
  } else {
    const updates = traineeUpdates_(); // TraineeUpdates.gs
    if (!updates) throw err_.validation('Link the trainee updates sheet first (Admin → Settings → Databases).');
    const latest = {};
    updates.rows.forEach((r) => {
      const k = normName_(r.traineeName);
      if (k && (!latest[k] || r.sortKey >= latest[k].sortKey)) latest[k] = r;
    });
    Object.keys(latest).forEach((k) => {
      const r = latest[k];
      [r.volunteer1, r.volunteer2].filter(Boolean).forEach((v) => {
        wanted.push({ volunteer: v, trainee: r.traineeName, user: byName[normName_(v)], t: tByName[k] });
      });
    });
  }

  let added = 0;
  let already = 0;
  const unmatched = [];
  wanted.forEach((w) => {
    if (!w.user || !w.t) {
      unmatched.push(`${w.volunteer} – ${w.trainee}${!w.user ? ' (volunteer not found)' : ' (trainee not found)'}`);
      return;
    }
    if (insertPair_(w.user, w.t, admin, '', 'imported')) added += 1;
    else already += 1;
  });
  const parts = [`Imported ${added} pair${added === 1 ? '' : 's'}`];
  if (already) parts.push(`${already} already on the list`);
  if (unmatched.length) parts.push(`${unmatched.length} not matched`);
  return Object.assign(listPairs_({ showEnded: true }), { imported: { added, already, unmatched: unmatched.slice(0, 50) }, message: `${parts.join(', ')}.` });
}

/* ---------- partner history ---------- */

/** what: regular (active pair) | pastPair (ended pair) | sessions | visits | outings | trips */
function addPartner_(map, key, name, userId, what, date) {
  if (!key) return;
  const x = map[key] || (map[key] = { key, name, userId: userId || '', regular: false, pastPair: false, sessions: 0, visits: 0, outings: 0, trips: 0, first: '', last: '' });
  if (userId && !x.userId) x.userId = userId;
  if (what === 'regular' || what === 'pastPair') x[what] = true;
  else x[what] += 1;
  if (date) {
    if (!x.first || date < x.first) x.first = date;
    if (!x.last || date > x.last) x.last = date;
  }
}

/** Regular pairs first, then the most recent. */
function partnersOut_(map) {
  return sortBy_(Object.keys(map).map((k) => map[k]), (x) => `${x.regular ? 0 : 1}|${String(99999999 - Number(String(x.last || '0').replace(/-/g, ''))).padStart(8, '0')}|${String(x.name).toLowerCase()}`);
}

/** Every volunteer a trainee has been with: regular pairs, sessions, house visits, outings, trips. */
function partnersOfTrainee_(row) {
  const id = String(row.id);
  const names = nameMaps_();
  const byName = {};
  table_('users').rows().forEach((u) => { if (u.userId) byName[normName_(u.name)] = u; });
  const map = {};
  table_('pairs').rows().filter((x) => x.pairId && String(x.traineeId) === id)
    .forEach((x) => addPartner_(map, x.userId, names.users[x.userId] || x.volunteerName, x.userId, x.status === 'ended' ? 'pastPair' : 'regular', x.since));
  table_('bookings').rows().filter((b) => b.status !== 'cancelled' && b.sessionDate <= todayStr_() && bookingTraineeIds_(b).indexOf(id) >= 0)
    .forEach((b) => addPartner_(map, b.userId, names.users[b.userId] || b.volunteerName, b.userId, 'sessions', b.sessionDate));
  table_('houseVisits').rows().filter((v) => String(v.traineeId) === id)
    .forEach((v) => addPartner_(map, v.userId, names.users[v.userId] || v.volunteerName, v.userId, 'visits', v.date));
  const updates = traineeUpdates_();
  if (updates) {
    updates.rows.filter((r) => normName_(r.traineeName) === normName_(row.name)).forEach((r) => {
      [r.volunteer1, r.volunteer2].filter(Boolean).forEach((v) => {
        const u = byName[normName_(v)];
        addPartner_(map, u ? u.userId : `name:${normName_(v)}`, u ? u.name : v, u ? u.userId : '', 'visits', r.visitDate);
      });
    });
  }
  table_('outingAssignments').rows().filter((a) => String(a.traineeId) === id && a.userId)
    .forEach((a) => addPartner_(map, a.userId, names.users[a.userId] || a.volunteerName, a.userId, 'outings', ''));
  table_('tripParticipants').rows().filter((x) => String(x.traineeId) === id && x.userId && x.status !== 'withdrawn')
    .forEach((x) => addPartner_(map, x.userId, names.users[x.userId] || x.volunteerName, x.userId, 'trips', ''));
  return partnersOut_(map);
}

/** Every trainee a volunteer has been with (same sources, the other way round). */
function partnersOfVolunteer_(user) {
  const names = nameMaps_();
  const tByName = {};
  traineeTable_().rows().forEach((t) => { if (t.id) tByName[normName_(t.name)] = t; });
  const map = {};
  const add = (traineeId, fallbackName, what, date) => addPartner_(map, traineeId, names.trainees[traineeId] || fallbackName, '', what, date);
  table_('pairs').rows().filter((x) => x.pairId && x.userId === user.userId)
    .forEach((x) => add(String(x.traineeId), x.traineeName, x.status === 'ended' ? 'pastPair' : 'regular', x.since));
  table_('bookings').rows().filter((b) => b.userId === user.userId && b.status !== 'cancelled' && b.sessionDate <= todayStr_())
    .forEach((b) => bookingTraineeIds_(b).forEach((k) => add(k, b.traineeName, 'sessions', b.sessionDate)));
  table_('houseVisits').rows().filter((v) => v.userId === user.userId)
    .forEach((v) => add(String(v.traineeId), v.traineeName, 'visits', v.date));
  const updates = traineeUpdates_();
  if (updates) {
    const me = normName_(user.name);
    updates.rows.filter((r) => normName_(r.volunteer1) === me || normName_(r.volunteer2) === me).forEach((r) => {
      const t = tByName[normName_(r.traineeName)];
      add(t ? String(t.id) : `name:${normName_(r.traineeName)}`, t ? t.name : r.traineeName, 'visits', r.visitDate);
    });
  }
  table_('outingAssignments').rows().filter((a) => a.userId === user.userId)
    .forEach((a) => add(String(a.traineeId), a.traineeName, 'outings', ''));
  table_('tripParticipants').rows().filter((x) => x.userId === user.userId && x.status !== 'withdrawn')
    .forEach((x) => add(String(x.traineeId), x.traineeName, 'trips', ''));
  return partnersOut_(map).map((x) => Object.assign(x, { traineeId: /^name:/.test(x.key) ? '' : x.key }));
}
