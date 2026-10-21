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
 * Pairing rules:
 *   - a volunteer has one trainee per session (one fixed trainee if regular);
 *   - a trainee can have several volunteers, ideally at least one regular.
 */

/* ---------------- volunteer types ---------------- */

function volunteerType_(u) {
  return u && u.volunteerType === 'regular' ? 'regular' : 'volunteer';
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
  let message = `${target.name} is now ${type === 'regular' ? 'a regular volunteer' : 'a volunteer (ad hoc)'}.`;
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
function standingRows_() {
  if (DB_.cache.standingRows) return DB_.cache.standingRows;
  const users = table_('users').rows().filter((u) => u.userId);
  const trainees = traineeTable_().rows().filter((t) => t.id && t.name);
  const out = [];
  table_('pairings').rows().forEach((x) => {
    if ((x.status || 'active') !== 'active') return;
    const u = x.userId ? users.find((y) => y.userId === x.userId)
      : users.find((y) => x.volunteerName && looseName_(y.name) === looseName_(x.volunteerName));
    const t = x.traineeId ? trainees.find((y) => String(y.id) === String(x.traineeId))
      : trainees.find((y) => x.traineeName && (looseName_(y.name) === looseName_(x.traineeName)
        || (y.preferredName && looseName_(y.preferredName) === looseName_(x.traineeName))));
    if (!u || !t) return;
    out.push({ userId: u.userId, volunteerName: u.name, traineeId: String(t.id), traineeName: t.name, row: x });
  });
  DB_.cache.standingRows = out;
  return out;
}

function activeStanding_(userId) {
  return standingRows_().find((x) => x.userId === userId) || null;
}

function endStandingPairing_(userId, admin) {
  const current = activeStanding_(userId);
  if (!current) return null;
  table_('pairings').update(current.row, { status: 'ended', endedBy: admin.name, endedAt: fmtDateTime_(now_()) });
  delete DB_.cache.standingRows;
  return current;
}

/**
 * Admin sets (or clears, with traineeId '') a regular's fixed trainee.
 * Their upcoming bookings that used the old fixed trainee follow the change;
 * pairings an admin set by hand for a particular session are left alone.
 */
function setStandingPairing_(p, admin) {
  onlyFields_(p, ['userId', 'traineeId']);
  const user = table_('users').find((u) => u.userId === id_(p.userId, 'User'));
  if (!user || user.status === 'inactive') throw err_.notFound('Volunteer not found.');
  const clearing = p.traineeId === '' || p.traineeId === null || p.traineeId === undefined;
  let trainee = null;
  if (!clearing) {
    if (volunteerType_(user) !== 'regular') {
      throw err_.conflict(`${user.name} is a volunteer (ad hoc). Make them a regular first, or pair them for a single session.`);
    }
    trainee = traineeById_(str_(p.traineeId, 'Trainee', { required: true, max: 40 }));
    if (!trainee || !isActiveTrainee_(trainee)) throw err_.validation('Choose an active trainee.');
  }
  const current = activeStanding_(user.userId);
  if (current && trainee && String(current.traineeId) === String(trainee.id)) {
    return Object.assign(standingBoard_(), { message: `${user.name} is already paired with ${trainee.name}.` });
  }
  if (current) endStandingPairing_(user.userId, admin);
  if (trainee) {
    delete DB_.cache.standingRows;
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
  }
  // Upcoming bookings that followed the old fixed pairing (or had none) follow the new one.
  const bookings = table_('bookings');
  const today = todayStr_();
  let moved = 0;
  bookings.filter((b) => b.userId === user.userId && b.status !== 'cancelled' && String(b.sessionDate) >= today
    && (b.pairing === 'standing' || !b.traineeId)).forEach((b) => {
    if (table_('attendance').find((a) => a.bookingId === b.bookingId)) return; // already on site: leave it
    bookings.update(b, trainee
      ? { traineeId: String(trainee.id), traineeName: trainee.name, pairing: 'standing' }
      : { traineeId: '', traineeName: '', pairing: '' });
    moved += 1;
  });
  let message = trainee ? `${user.name} is now ${trainee.name}'s regular volunteer.` : `${user.name}'s regular pairing has been removed.`;
  if (moved) message += ` Updated ${moved} upcoming session${moved === 1 ? '' : 's'}.`;
  return Object.assign(standingBoard_(), { message });
}

/** Everything the "Regular pairings" board needs. */
function standingBoard_() {
  delete DB_.cache.standingRows;
  const active = standingRows_();
  const byUser = byKey_(active, 'userId');
  const regulars = table_('users').rows()
    .filter((u) => u.userId && u.status !== 'inactive' && volunteerType_(u) === 'regular')
    .map((u) => {
      const pair = byUser[u.userId];
      return {
        userId: u.userId, name: u.name, phone: u.phone || '', telegram: u.telegram || '', isAdmin: u.role === 'admin',
        traineeId: pair ? String(pair.traineeId) : '', traineeName: pair ? pair.traineeName : '',
      };
    });
  const regularsByTrainee = {};
  active.forEach((x) => { (regularsByTrainee[String(x.traineeId)] = regularsByTrainee[String(x.traineeId)] || []).push(x.userId); });
  const trainees = traineeList_().map((t) => Object.assign({}, t, { regulars: regularsByTrainee[t.id] || [] }));
  return {
    regulars: sortBy_(regulars, (r) => String(r.name).toLowerCase()),
    trainees,
    counts: {
      regulars: regulars.length,
      unpairedRegulars: regulars.filter((r) => !r.traineeId).length,
      traineesWithoutRegular: trainees.filter((t) => !t.regulars.length).length,
    },
  };
}

function listStandingPairings_() {
  return standingBoard_();
}

/* ---------------- pairing a booking ---------------- */

/**
 * When someone says they're coming: a regular with a fixed trainee is paired
 * straight away; everyone else waits for an admin. Returns the trainee or null.
 */
function applyStanding_(booking, user) {
  if (!CONFIG.APPLY_STANDING_PAIRINGS || booking.traineeId) return null;
  if (volunteerType_(user) !== 'regular') return null;
  const pair = activeStanding_(user.userId);
  if (!pair) return null;
  const trainee = traineeById_(pair.traineeId);
  if (!trainee || !isActiveTrainee_(trainee)) return null;
  table_('bookings').update(booking, { traineeId: String(trainee.id), traineeName: trainee.name, pairing: 'standing' });
  return trainee;
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
  const trainee = applyStanding_(booking, user);
  return { session: s, booking, trainee };
}

function guideCheck_(user) {
  if (CONFIG.REQUIRE_GUIDE_BEFORE_BOOKING && !user.guideReadAt) {
    throw new AppError('GUIDE_REQUIRED', 'Please read the Volunteer Guide before signing up for your first session.');
  }
}

function comingMessage_(r, user) {
  if (r.trainee) return `You're coming to ${r.session.title}! You'll be with ${r.trainee.name}, your regular trainee.`;
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
      return { sessionId, ok: true, title: r.session.title, trainee: r.trainee ? r.trainee.name : '' };
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
  const trainee = applyStanding_(booking, user);
  return {
    detail: sessionDetail_({ sessionId: session.sessionId }),
    bookingId: booking.bookingId,
    message: `${user.name} added as a walk-in${trainee ? `, with ${trainee.name}` : ''}.`,
  };
}
