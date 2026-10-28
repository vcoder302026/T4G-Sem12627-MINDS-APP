/**
 * Pairing.gs — volunteer types and how volunteers are paired with trainees.
 *
 * Three profiles:
 *   volunteer  new / ad hoc. An admin pairs them with a trainee for each session.
 *   regular    attended REGULAR_AFTER_SESSIONS sessions, or promoted by an admin.
 *              An admin can give a regular a fixed trainee ("regular pairing");
 *              it is applied every time they say they're coming, until changed.
 *   admin      any volunteer or regular with Role = admin also gets the Admin menu.
 *
 * Pairing rules (many to many, like the WERONE outing pairing page):
 *   - a volunteer can have several trainees per session (and a regular several
 *     fixed trainees);
 *   - a trainee can have several volunteers, ideally at least one regular.
 * A booking's Trainee ID cell lists its trainees ("T-0001, T-0004"), like the
 * session's "Trainees Attending" column; bookingTrainees_() reads it.
 */

/* ---------------- a booking's trainees ---------------- */

/** The trainee IDs on a booking (one or several). */
function bookingTraineeIds_(b) {
  return b ? parseIds_(b.traineeId) : [];
}

function hasTrainee_(b, traineeId) {
  return bookingTraineeIds_(b).indexOf(String(traineeId)) >= 0;
}

/** [{ id, name }] for a booking, with today's names (the stored names are the fallback). */
function bookingTrainees_(b) {
  const stored = String((b && b.traineeName) || '').split(/\s*,\s*/);
  const names = nameMaps_().trainees;
  return bookingTraineeIds_(b).map((id, i) => ({ id, name: names[id] || stored[i] || id }));
}

/** The booking cells for a list of trainees: { traineeId: 'T-0001, T-0004', traineeName: 'A, B' }. */
function traineeCells_(trainees) {
  return {
    traineeId: trainees.map((t) => String(t.id)).join(', '),
    traineeName: trainees.map((t) => t.name).join(', '),
  };
}

/** "A", "A and B", "A, B and C". */
function namesText_(names) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '';
}

/* ---------------- volunteer types ---------------- */

function volunteerType_(u) {
  return u && u.volunteerType === 'regular' ? 'regular' : 'volunteer';
}

/**
 * Admins are regular volunteers by default: called whenever someone becomes an
 * admin. Returns true if it changed them. An admin can still move them back by hand.
 */
function makeRegularAsAdmin_(u) {
  if (!u || volunteerType_(u) === 'regular') return false;
  table_('users').update(u, { volunteerType: 'regular', typeSetBy: 'Made an admin', typeSetAt: fmtDateTime_(now_()) });
  return true;
}

/** Distinct sessions a volunteer has finished (clocked out of). */
function sessionsAttended_(userId, attendanceRows) {
  const seen = {};
  (attendanceRows || table_('attendance').rows()).forEach((a) => {
    if (a.userId === userId && a.clockOut) seen[a.sessionId || a.attendanceId] = true;
  });
  return Object.keys(seen).length;
}

/**
 * Promotes a volunteer to regular once they've attended enough sessions.
 * Someone whose type an admin set by hand is left alone.
 */
function maybePromote_(userId) {
  const users = table_('users');
  const u = users.find((x) => x.userId === userId);
  if (!u || volunteerType_(u) === 'regular') return false;
  if (u.typeSetBy && !/^automatic/i.test(String(u.typeSetBy))) return false;
  if (sessionsAttended_(userId) < CONFIG.REGULAR_AFTER_SESSIONS) return false;
  users.update(u, { volunteerType: 'regular', typeSetBy: `Automatic (${CONFIG.REGULAR_AFTER_SESSIONS} sessions)`, typeSetAt: fmtDateTime_(now_()) });
  return true;
}

/** Admin promotes a volunteer to regular, or moves a regular back to volunteer. */
function setVolunteerType_(p, admin) {
  onlyFields_(p, ['userId', 'volunteerType']);
  const users = table_('users');
  const target = users.find((u) => u.userId === id_(p.userId, 'User'));
  if (!target) throw err_.notFound('Volunteer not found.');
  const type = oneOf_(p.volunteerType, 'Volunteer type', ['volunteer', 'regular']);
  if (volunteerType_(target) === type) return { person: personOut_(target, true), message: `${target.name} is already ${type === 'regular' ? 'a regular' : 'a volunteer'}.` };
  users.update(target, { volunteerType: type, typeSetBy: admin.name, typeSetAt: fmtDateTime_(now_()) });
  let message = `${target.name} is now ${type === 'regular' ? 'a regular' : 'a volunteer'}.`;
  if (type === 'volunteer') {
    const ended = endStandingPairing_(target.userId, admin);
    if (ended) message += ` Their regular pairing with ${ended.traineeName} has ended.`;
  }
  const hasAccount = Boolean(table_('auth').find((a) => a.userId === target.userId));
  return { person: personOut_(target, hasAccount), message };
}

/* ---------------- regular (standing) pairings ---------------- */

const looseName_ = (s) => normHeader_(s).replace(/[^a-z0-9 ]/g, '');

/**
 * Active regular pairings with IDs filled in. Staff may paste pairs into the
 * Regular Pairings tab as plain names (like the outing sheet's pairing list):
 * a blank User ID / Trainee ID is matched by name, and a blank Status counts
 * as active. Each item keeps `row`, the sheet row, for updates.
 */
/** Every Regular Pairings row (active and ended), with IDs filled in from names where needed. */
function allPairingRows_() {
  if (DB_.cache.allPairingRows) return DB_.cache.allPairingRows;
  const users = table_('users').rows().filter((u) => u.userId);
  const trainees = traineeTable_().rows().filter((t) => t.id && t.name);
  const out = [];
  table_('pairings').rows().forEach((x) => {
    const u = x.userId ? users.find((y) => y.userId === x.userId)
      : users.find((y) => x.volunteerName && looseName_(y.name) === looseName_(x.volunteerName));
    const t = x.traineeId ? trainees.find((y) => String(y.id) === String(x.traineeId))
      : trainees.find((y) => x.traineeName && (looseName_(y.name) === looseName_(x.traineeName)
        || (y.preferredName && looseName_(y.preferredName) === looseName_(x.traineeName))));
    if (!u || !t) return;
    out.push({
      userId: u.userId, volunteerName: u.name, traineeId: String(t.id), traineeName: t.name,
      active: (x.status || 'active') === 'active',
      from: String(x.createdAt || '').slice(0, 10), to: String(x.endedAt || '').slice(0, 10), row: x,
    });
  });
  DB_.cache.allPairingRows = out;
  return out;
}

function standingRows_() {
  if (DB_.cache.standingRows) return DB_.cache.standingRows;
  const out = allPairingRows_().filter((x) => x.active);
  DB_.cache.standingRows = out;
  return out;
}

/** A regular's fixed trainees (active Regular Pairings rows), oldest first. */
function activeStandings_(userId) {
  return standingRows_().filter((x) => x.userId === userId);
}

/** The first fixed trainee, for screens that show one. */
function activeStanding_(userId) {
  return activeStandings_(userId)[0] || null;
}

function forgetPairingRows_() {
  delete DB_.cache.standingRows;
  delete DB_.cache.allPairingRows;
}

/** Ends one fixed pairing (or all of a regular's, without traineeId). Returns the ended rows. */
function endStandingPairing_(userId, admin, traineeId) {
  const ended = activeStandings_(userId).filter((x) => !traineeId || String(x.traineeId) === String(traineeId));
  ended.forEach((x) => table_('pairings').update(x.row, { status: 'ended', endedBy: admin.name, endedAt: fmtDateTime_(now_()) }));
  if (ended.length) forgetPairingRows_();
  return ended[0] || null;
}

function startStandingPairing_(user, trainee, admin) {
  table_('pairings').insert({
    pairingId: newId_('P'),
    userId: user.userId,
    volunteerName: user.name,
    traineeId: String(trainee.id),
    traineeName: trainee.name,
    status: 'active',
    createdBy: admin.name,
    createdAt: fmtDateTime_(now_()),
  });
  forgetPairingRows_();
}

/**
 * Admin changes a regular's fixed trainees. A regular can have several.
 *   { userId, addTraineeId }     adds one (drag and drop, "+ Trainee")
 *   { userId, removeTraineeId }  removes one (the small ✕)
 *   { userId, traineeId }        replaces them all with one ('' removes them all)
 * Their upcoming bookings that followed the fixed pairing (or had none) follow
 * the change; pairings an admin set by hand for a particular session are left alone.
 */
function setStandingPairing_(p, admin) {
  onlyFields_(p, ['userId', 'traineeId', 'addTraineeId', 'removeTraineeId']);
  const user = table_('users').find((u) => u.userId === id_(p.userId, 'User'));
  if (!user || user.status === 'inactive') throw err_.notFound('Volunteer not found.');
  const has = (k) => Object.prototype.hasOwnProperty.call(p, k);
  const ops = ['traineeId', 'addTraineeId', 'removeTraineeId'].filter(has);
  if (ops.length !== 1) throw err_.validation('Send one of traineeId, addTraineeId or removeTraineeId.');
  const op = ops[0];
  const value = p[op] === null || p[op] === undefined ? '' : p[op];
  const activeTrainee = () => {
    if (volunteerType_(user) !== 'regular') {
      throw err_.conflict(`${user.name} is a volunteer, not a regular. Make them a regular first, or pair them for a single session.`);
    }
    const t = traineeById_(str_(value, 'Trainee', { required: true, max: 40 }));
    if (!t || !isActiveTrainee_(t)) throw err_.validation('Choose an active trainee.');
    return t;
  };
  const current = activeStandings_(user.userId);
  const isCurrent = (id) => current.some((x) => String(x.traineeId) === String(id));
  let message;
  if (op === 'addTraineeId') {
    const trainee = activeTrainee();
    if (isCurrent(trainee.id)) return Object.assign(standingBoard_(), { message: `${user.name} is already paired with ${trainee.name}.` });
    startStandingPairing_(user, trainee, admin);
    message = `${user.name} is now ${trainee.name}'s regular volunteer.`;
  } else if (op === 'removeTraineeId') {
    const id = str_(value, 'Trainee', { required: true, max: 40 });
    const ended = endStandingPairing_(user.userId, admin, id);
    if (!ended) return Object.assign(standingBoard_(), { message: `${user.name} isn't paired with that trainee.` });
    message = `${user.name} is no longer ${ended.traineeName}'s regular volunteer.`;
  } else if (value === '') {
    if (!current.length) return Object.assign(standingBoard_(), { message: `${user.name} has no regular trainee.` });
    endStandingPairing_(user.userId, admin);
    message = `${user.name}'s regular pairing has been removed.`;
  } else {
    const trainee = activeTrainee();
    if (current.length === 1 && isCurrent(trainee.id)) {
      return Object.assign(standingBoard_(), { message: `${user.name} is already paired with ${trainee.name}.` });
    }
    current.filter((x) => String(x.traineeId) !== String(trainee.id)).forEach((x) => endStandingPairing_(user.userId, admin, x.traineeId));
    if (!isCurrent(trainee.id)) startStandingPairing_(user, trainee, admin);
    message = `${user.name} is now ${trainee.name}'s regular volunteer.`;
  }
  const moved = followStanding_(user);
  if (moved) message += ` Updated ${moved} upcoming session${moved === 1 ? '' : 's'}.`;
  return Object.assign(standingBoard_(), { message });
}

/** Upcoming bookings that follow a regular's fixed trainees (or have none) get the current list. */
function followStanding_(user) {
  const trainees = activeStandings_(user.userId).map((x) => traineeById_(x.traineeId)).filter((t) => t && isActiveTrainee_(t));
  const cells = trainees.length ? Object.assign(traineeCells_(trainees), { pairing: 'standing' }) : { traineeId: '', traineeName: '', pairing: '' };
  const bookings = table_('bookings');
  const today = todayStr_();
  let moved = 0;
  bookings.filter((b) => b.userId === user.userId && b.status !== 'cancelled' && String(b.sessionDate) >= today
    && (b.pairing === 'standing' || !b.traineeId)).forEach((b) => {
    if (table_('attendance').find((a) => a.bookingId === b.bookingId)) return; // already on site: leave it
    if (String(b.traineeId || '') === cells.traineeId) return;
    bookings.update(b, cells);
    moved += 1;
  });
  return moved;
}

/** Everything the "Regular pairings" board needs. */
function standingBoard_() {
  delete DB_.cache.standingRows;
  delete DB_.cache.allPairingRows;
  const active = standingRows_();
  const regulars = table_('users').rows()
    .filter((u) => u.userId && u.status !== 'inactive' && volunteerType_(u) === 'regular')
    .map((u) => {
      const pairs = active.filter((x) => x.userId === u.userId);
      return {
        userId: u.userId, name: u.name, phone: u.phone || '', telegram: u.telegram || '', isAdmin: u.role === 'admin', project: u.project || '',
        trainees: pairs.map((x) => ({ id: String(x.traineeId), name: x.traineeName })),
        traineeId: pairs.length ? String(pairs[0].traineeId) : '', // the first, for older screens
        traineeName: pairs.map((x) => x.traineeName).join(', '),
      };
    });
  const regularsByTrainee = {};
  active.forEach((x) => { (regularsByTrainee[String(x.traineeId)] = regularsByTrainee[String(x.traineeId)] || []).push(x.userId); });
  const trainees = traineeList_().map((t) => Object.assign({}, t, { regulars: regularsByTrainee[t.id] || [] }));
  const ids = regulars.map((r) => r.userId);
  return {
    regulars: sortBy_(regulars, (r) => String(r.name).toLowerCase()),
    trainees,
    history: pairHistoryFor_(ids), // for choosing someone new, or someone they know
    counts: {
      regulars: regulars.length,
      unpairedRegulars: regulars.filter((r) => !r.trainees.length).length,
      traineesWithoutRegular: trainees.filter((t) => !t.regulars.length).length,
    },
  };
}

function listStandingPairings_() {
  return standingBoard_();
}

/* ---------------- pairing a booking ---------------- */

/**
 * When someone says they're coming: a regular with fixed trainees is paired
 * with them straight away; everyone else waits for an admin.
 * Returns the trainees (an array, empty if none).
 */
function applyStanding_(booking, user) {
  if (!CONFIG.APPLY_STANDING_PAIRINGS || booking.traineeId) return [];
  if (volunteerType_(user) !== 'regular') return [];
  const trainees = activeStandings_(user.userId).map((x) => traineeById_(x.traineeId)).filter((t) => t && isActiveTrainee_(t));
  if (!trainees.length) return [];
  table_('bookings').update(booking, Object.assign(traineeCells_(trainees), { pairing: 'standing' }));
  return trainees;
}

/** Records "I'm coming" for one session. Shared by bookSession and bookSessions. */
function comeToSession_(sessionId, user) {
  const s = table_('sessions').find((x) => x.sessionId === sessionId);
  if (!s || s.status === 'cancelled') throw err_.notFound('Session not found.');
  if (s.status !== 'open') throw err_.conflict(`Sign-ups for ${s.title} are closed.`);
  if (s.date < todayStr_()) throw err_.conflict(`${s.title} has already happened.`);
  const bookings = table_('bookings');
  const active = bookings.filter((b) => b.sessionId === sessionId && b.status !== 'cancelled');
  if (active.some((b) => b.userId === user.userId)) throw err_.conflict(`You're already coming to ${s.title}.`);
  const cap = Number(s.capacity) || 0;
  if (cap && active.length >= cap) throw err_.conflict(`Sorry, ${s.title} is full.`);
  const stampNow = fmtDateTime_(now_());
  const booking = bookings.insert({
    bookingId: newId_('B'),
    sessionId,
    sessionDate: s.date,
    sessionTitle: s.title,
    userId: user.userId,
    volunteerName: user.name,
    status: 'confirmed',
    bookedAt: stampNow,
    decidedBy: `${user.name} (self)`,
    decidedAt: stampNow,
  });
  const trainees = applyStanding_(booking, user);
  return { session: s, booking, trainees };
}

function guideCheck_(user) {
  if (CONFIG.REQUIRE_GUIDE_BEFORE_BOOKING && !user.guideReadAt) {
    throw new AppError('GUIDE_REQUIRED', 'Please read the Volunteer Guide before signing up for your first session.');
  }
}

function comingMessage_(r, user) {
  if (r.trainees.length) {
    return `You're coming to ${r.session.title}! You'll be with ${namesText_(r.trainees.map((t) => t.name))}, your regular trainee${r.trainees.length > 1 ? 's' : ''}.`;
  }
  return volunteerType_(user) === 'regular'
    ? `You're coming to ${r.session.title}! An admin will pair you with a trainee.`
    : `You're coming to ${r.session.title}! An admin will pair you with a trainee before the session.`;
}

/** Several sessions at once ("I'm coming to all of these"). Each one succeeds or fails on its own. */
function bookSessions_(p, user) {
  onlyFields_(p, ['sessionIds']);
  if (!Array.isArray(p.sessionIds) || !p.sessionIds.length || p.sessionIds.length > 20) {
    throw err_.validation('Choose between 1 and 20 sessions.');
  }
  guideCheck_(user);
  const ids = [];
  p.sessionIds.forEach((x) => { const id = id_(x, 'Session'); if (ids.indexOf(id) === -1) ids.push(id); });
  const results = ids.map((sessionId) => {
    try {
      const r = comeToSession_(sessionId, user);
      return { sessionId, ok: true, title: r.session.title, trainee: namesText_(r.trainees.map((t) => t.name)) };
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      return { sessionId, ok: false, message: e.message };
    }
  });
  const okCount = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  let message = okCount ? `You're coming to ${okCount} session${okCount === 1 ? '' : 's'}.` : 'No sessions were added.';
  if (failed.length) message += ` ${failed.map((f) => f.message).join(' ')}`;
  return { results, message, home: volunteerHome_({}, user) };
}

/* ---------------- admin: pair someone for one session ---------------- */

/** An admin adds a volunteer who turned up without signing up (for the clock-in page). */
function addWalkIn_(p, admin) {
  onlyFields_(p, ['sessionId', 'userId']);
  const { row: session } = rowById_('sessions', 'sessionId', p.sessionId, 'Session');
  if (session.status === 'cancelled') throw err_.validation('This session was cancelled.');
  const user = volunteerRef_(p.userId, 'Volunteer');
  const bookings = table_('bookings');
  const existing = bookings.find((b) => b.sessionId === session.sessionId && b.userId === user.userId && b.status !== 'cancelled');
  if (existing) throw err_.conflict(`${user.name} is already on the list for this session.`);
  const stampNow = fmtDateTime_(now_());
  const booking = bookings.insert({
    bookingId: newId_('B'), sessionId: session.sessionId, sessionDate: session.date, sessionTitle: session.title,
    userId: user.userId, volunteerName: user.name, status: 'confirmed', walkIn: 'Yes',
    bookedAt: stampNow, decidedBy: admin.name, decidedAt: stampNow,
  });
  const trainees = applyStanding_(booking, user);
  return {
    detail: sessionDetail_({ sessionId: session.sessionId }),
    bookingId: booking.bookingId,
    message: `${user.name} added as a walk-in${trainees.length ? `, with ${namesText_(trainees.map((t) => t.name))}` : ''}.`,
  };
}

/* ---------------- pairing history (admins) ---------------- */

/**
 * Who has been with whom: sessions a volunteer attended (clocked in) paired
 * with a trainee, counted per pair. Sign-ups that didn't happen don't count.
 */
function pairStats_() {
  if (DB_.cache.pairStats) return DB_.cache.pairStats;
  const attended = {};
  table_('attendance').rows().forEach((a) => { if (a.bookingId && a.clockIn) attended[a.bookingId] = true; });
  const map = {};
  table_('bookings').rows().forEach((b) => {
    if (b.status === 'cancelled' || !b.traineeId || !attended[b.bookingId]) return;
    bookingTrainees_(b).forEach((t) => {
      const key = `${b.userId}|${t.id}`;
      const s = map[key] || (map[key] = { userId: b.userId, traineeId: t.id, traineeName: t.name, volunteerName: b.volunteerName, sessions: 0, first: '', last: '' });
      s.sessions += 1;
      const d = String(b.sessionDate);
      if (!s.first || d < s.first) s.first = d;
      if (d > s.last) { s.last = d; s.traineeName = t.name; }
    });
  });
  DB_.cache.pairStats = map;
  return map;
}

/**
 * For pairing screens: { userId: { traineeId: { sessions, last, regularFrom, regularTo, regularNow } } }
 * for the given volunteers: sessions together and any time as their regular trainee.
 */
function pairHistoryFor_(userIds) {
  const want = {};
  userIds.forEach((id) => { want[id] = {}; });
  const stats = pairStats_();
  Object.keys(stats).forEach((k) => {
    const s = stats[k];
    if (want[s.userId]) want[s.userId][s.traineeId] = { sessions: s.sessions, last: s.last };
  });
  allPairingRows_().forEach((x) => {
    if (!want[x.userId]) return;
    const h = want[x.userId][x.traineeId] || (want[x.userId][x.traineeId] = { sessions: 0, last: '' });
    h.regularFrom = h.regularFrom && h.regularFrom < x.from ? h.regularFrom : x.from;
    h.regularTo = x.active ? '' : (x.to > (h.regularTo || '') ? x.to : h.regularTo || '');
    if (x.active) h.regularNow = true;
  });
  return want;
}

/** Admin → Pairing → History: every pair that has worked together, and each regular's trainees over time. */
function pairingHistory_(p) {
  onlyFields_(p, []);
  const names = nameMaps_();
  const users = byKey_(table_('users').rows().filter((u) => u.userId), 'userId');
  const stats = pairStats_();
  const regularNow = {};
  standingRows_().forEach((x) => { regularNow[`${x.userId}|${x.traineeId}`] = true; });
  const pairs = Object.keys(stats).map((k) => {
    const s = stats[k];
    return {
      userId: s.userId, volunteerName: names.users[s.userId] || s.volunteerName, type: volunteerType_(users[s.userId]),
      traineeId: s.traineeId, traineeName: names.trainees[s.traineeId] || s.traineeName,
      sessions: s.sessions, first: s.first, last: s.last, regularNow: Boolean(regularNow[k]),
    };
  });
  const periods = allPairingRows_().map((x) => ({
    userId: x.userId, volunteerName: x.volunteerName, traineeId: x.traineeId, traineeName: x.traineeName,
    from: x.from, to: x.active ? '' : x.to, active: x.active,
    sessions: (stats[`${x.userId}|${x.traineeId}`] || {}).sessions || 0,
  }));
  return {
    pairs: sortBy_(pairs, (x) => `${x.last}`).reverse(),
    regularPeriods: sortBy_(periods, (x) => `${String(x.volunteerName).toLowerCase()}|${x.from}`),
  };
}
