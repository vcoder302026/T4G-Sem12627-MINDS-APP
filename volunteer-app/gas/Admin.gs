/**
 * Admin.gs — admin actions on sessions and pairing.
 * (People are in Auth.gs/Profile.gs; QR clocking is in Attendance.gs; the
 * Pairing List is in Pairs.gs; venues, projects and the guide are in
 * Content.gs; trainee notes in Trainees.gs.)
 *
 * There is no booking confirmation: volunteers say they're coming. Admins see
 * who is coming, who still needs a trainee (new / ad-hoc volunteers), and pair
 * them by hand: one volunteer can have several trainees and one trainee
 * several volunteers.
 */

function sessionStats_(sessionId, bookings, attendance) {
  const coming = bookings.filter((b) => b.sessionId === sessionId && b.status !== 'cancelled');
  const att = attendance.filter((a) => a.sessionId === sessionId);
  return {
    coming: coming.length,
    unpaired: coming.filter((b) => !b.traineeId).length,
    onSite: att.filter((a) => a.clockIn && !a.clockOut).length,
    done: att.filter((a) => a.clockOut).length,
  };
}

function adminHome_() {
  const today = todayStr_();
  const from = addDays_(today, -7);
  const bookings = table_('bookings').rows();
  const attendance = table_('attendance').rows();
  const sessions = sortBy_(
    table_('sessions').rows().filter((s) => s.sessionId && s.date >= from && s.status !== 'cancelled'),
    (s) => `${s.date} ${s.startTime}`
  ).map((s) => Object.assign(sessionOut_(s), { stats: sessionStats_(s.sessionId, bookings, attendance) }));
  return {
    today,
    sessions,
    unpairedTotal: sessions.filter((s) => s.date >= today).reduce((n, s) => n + s.stats.unpaired, 0),
    reviewCount: table_('feedback').filter((f) => f.noteStatus === 'pending' && f.traineeObservation).length,
    venues: activeVenues_(),
    projects: activeProjects_(),
    trainees: traineeList_(),
    sessionTypes: CONFIG.SESSION_TYPES,
  };
}

function traineeIdsField_(value) {
  const ids = Array.isArray(value) ? value.map(String) : parseIds_(value);
  if (ids.length > 200) throw err_.validation('Too many trainees selected.');
  ids.forEach((id) => {
    if (!traineeById_(id)) throw err_.validation(`Trainee ${id} is not on the trainee list.`);
  });
  return ids.join(', ');
}

function sessionFields_(p, partial) {
  const out = {};
  const has = (k) => !partial || Object.prototype.hasOwnProperty.call(p, k);
  if (has('type')) out.type = p.type === undefined || p.type === '' ? CONFIG.SESSION_TYPES[0] : oneOf_(p.type, 'Type', CONFIG.SESSION_TYPES);
  if (has('title')) out.title = str_(p.title, 'Title'); // optional: blank shows the type
  if (has('date')) out.date = date_(p.date, 'Date');
  if (has('startTime')) out.startTime = time_(p.startTime, 'Start time');
  if (has('endTime')) out.endTime = time_(p.endTime, 'End time');
  if (has('venue')) out.venue = requireVenue_(str_(p.venue, 'Venue', { required: true }));
  if (has('project')) out.project = requireProject_(str_(p.project, 'Project'));
  if (has('capacity')) out.capacity = p.capacity === '' || p.capacity === null || p.capacity === undefined ? 0 : int_(p.capacity, 'Capacity', 0, 500);
  if (has('notes')) out.notes = str_(p.notes, 'Notes', { max: LIMITS.NOTES });
  if (has('traineeIds')) out.traineeIds = traineeIdsField_(p.traineeIds);
  if (partial && has('status')) out.status = oneOf_(p.status, 'Status', ['open', 'closed', 'cancelled']);
  return out;
}

const SESSION_FIELDS = ['type', 'title', 'date', 'startTime', 'endTime', 'venue', 'project', 'capacity', 'notes', 'traineeIds'];

function createSession_(p, admin) {
  onlyFields_(p, SESSION_FIELDS);
  const fields = sessionFields_(p, false);
  if (fields.endTime <= fields.startTime) throw err_.validation('End time must be after start time.');
  if (fields.date < addDays_(todayStr_(), -1)) throw err_.validation('Sessions cannot be created in the past.');
  const s = table_('sessions').insert(Object.assign(fields, {
    sessionId: newId_('S'),
    status: 'open',
    createdBy: admin.name,
    createdAt: fmtDateTime_(now_()),
  }));
  return { session: sessionOut_(s), home: adminHome_(), message: `Added ${sessionTitle_(s)} on ${niceDate_(s.date)}.` };
}

function updateSession_(p) {
  onlyFields_(p, ['sessionId', 'status'].concat(SESSION_FIELDS));
  const sessions = table_('sessions');
  const s = sessions.find((x) => x.sessionId === id_(p.sessionId, 'Session'));
  if (!s) throw err_.notFound('Session not found.');
  const rest = Object.assign({}, p);
  delete rest.sessionId;
  if (!Object.keys(rest).length) throw err_.validation('Nothing to update.');
  if (rest.venue === s.venue) delete rest.venue; // an archived venue can stay on an existing session
  const patch = sessionFields_(rest, true);
  const start = patch.startTime || s.startTime;
  const end = patch.endTime || s.endTime;
  if (end <= start) throw err_.validation('End time must be after start time.');
  sessions.update(s, patch);
  // keep the readable copies on booking rows in step
  if ('title' in patch || 'type' in patch || patch.date) {
    const bookings = table_('bookings');
    bookings.filter((b) => b.sessionId === s.sessionId).forEach((b) => {
      bookings.update(b, { sessionTitle: sessionTitle_(s), sessionDate: s.date });
    });
  }
  return { detail: sessionDetail_({ sessionId: s.sessionId }), message: `Saved ${sessionTitle_(s)}.` };
}

/** Who is coming and who they are with. Contact details are included for the press-and-hold card. */
function sessionDetail_(p) {
  const sessionId = id_(p.sessionId, 'Session');
  const s = table_('sessions').find((x) => x.sessionId === sessionId);
  if (!s) throw err_.notFound('Session not found.');
  const users = byKey_(table_('users').rows(), 'userId');
  const names = nameMaps_();
  const allBookings = table_('bookings').rows();
  const attendance = table_('attendance').rows();
  const attByBooking = byKey_(attendance.filter((a) => a.sessionId === sessionId), 'bookingId');
  const feedbackByBooking = byKey_(table_('feedback').rows().filter((f) => f.sessionId === sessionId && f.bookingId), 'bookingId');
  const pairs = activePairs_();
  const misses = noShowsByUser_(); // Dashboard.gs
  const mine = allBookings.filter((b) => b.sessionId === sessionId);
  const coming = sortBy_(mine.filter((b) => b.status !== 'cancelled'), (b) => `${b.traineeId ? 1 : 0}${String(b.volunteerName).toLowerCase()}`).map((b) => {
    const u = users[b.userId] || {};
    const a = attByBooking[b.bookingId];
    const t = u.userId ? volunteerTypeOf_(u) : { type: 'new', completed: 0 };
    return {
      bookingId: b.bookingId,
      walkIn: b.walkIn === 'Yes',
      bookedAt: b.bookedAt,
      volunteer: {
        userId: b.userId,
        name: u.name || b.volunteerName,
        phone: u.phone || '',
        telegram: u.telegram || '',
        email: u.email || '',
        type: t.type,
        completedSessions: t.completed,
        noShows: (misses[b.userId] || []).length,
        regularTrainees: pairs.filter((x) => x.userId === b.userId).map((x) => names.trainees[String(x.traineeId)] || x.traineeName),
      },
      trainees: bookingTraineeIds_(b).map((id) => ({ id, name: names.trainees[id] || (id === String(b.traineeId) ? b.traineeName : id) })),
      pairing: b.pairing || (b.traineeId ? 'manual' : ''),
      attendance: a ? attendanceOut_(a) : null,
      feedbackGiven: Boolean(feedbackByBooking[b.bookingId]),
    };
  });
  const withWhom = {};
  coming.forEach((b) => b.trainees.forEach((t) => { (withWhom[t.id] = withWhom[t.id] || []).push(b.volunteer.name); }));
  return {
    today: todayStr_(),
    session: sessionOut_(s),
    stats: sessionStats_(sessionId, allBookings, attendance),
    coming,
    unpaired: coming.filter((b) => !b.trainees.length).map((b) => b.bookingId),
    cancelled: mine.filter((b) => b.status === 'cancelled').map((b) => ({ bookingId: b.bookingId, name: names.users[b.userId] || b.volunteerName })),
    trainees: traineeList_().map((t) => Object.assign(t, { with: withWhom[t.id] || [] })),
    venues: activeVenues_(),
    projects: activeProjects_(),
    sessionTypes: CONFIG.SESSION_TYPES,
    allowShared: CONFIG.ALLOW_SHARED_TRAINEE,
  };
}

/**
 * Pair a coming volunteer by hand, or remove them from the session.
 *   traineeIds: ['T-0001', 'T-0004']  every trainee they look after (first = main); [] = no trainee
 *   traineeId:  'T-0001' | ''         the same with one trainee
 *   status:     'cancelled'           remove from the session (not after they clocked in)
 */
function updateBooking_(p, admin) {
  onlyFields_(p, ['bookingId', 'status', 'traineeId', 'traineeIds']);
  const bookings = table_('bookings');
  const booking = bookings.find((b) => b.bookingId === id_(p.bookingId, 'Booking'));
  if (!booking) throw err_.notFound('Booking not found.');
  const patch = {};
  let ids = null;
  if (Array.isArray(p.traineeIds)) ids = p.traineeIds.map((x) => str_(x, 'Trainee', { required: true, max: 40 }));
  else if (Object.prototype.hasOwnProperty.call(p, 'traineeId')) ids = p.traineeId === '' || p.traineeId === null ? [] : [str_(p.traineeId, 'Trainee', { required: true, max: 40 })];

  const shared = [];
  if (ids) {
    if (ids.length > 10) throw err_.validation('Choose up to 10 trainees for one volunteer.');
    const unique = ids.filter((id, i) => ids.indexOf(id) === i);
    const trainees = unique.map((id) => {
      const t = traineeById_(id);
      if (!t) throw err_.validation(`${id} is not on the trainee list.`);
      return t;
    });
    trainees.forEach((t) => {
      const other = bookings.find((b) => b.sessionId === booking.sessionId && b.bookingId !== booking.bookingId
        && b.status !== 'cancelled' && bookingTraineeIds_(b).indexOf(String(t.id)) >= 0);
      if (other) {
        if (!CONFIG.ALLOW_SHARED_TRAINEE) throw err_.conflict(`${t.name} is already with ${other.volunteerName} in this session.`);
        shared.push(`${t.name} is also with ${other.volunteerName}`);
      }
    });
    Object.assign(patch, {
      traineeId: trainees.length ? String(trainees[0].id) : '',
      traineeName: trainees.length ? trainees[0].name : '',
      moreTrainees: trainees.slice(1).map((t) => String(t.id)).join(', '),
      pairing: trainees.length ? 'manual' : '',
    });
  }

  if (Object.prototype.hasOwnProperty.call(p, 'status')) {
    const status = oneOf_(p.status, 'Status', ['confirmed', 'cancelled']);
    if (status === 'cancelled' && table_('attendance').find((a) => a.bookingId === booking.bookingId)) {
      throw err_.conflict('This volunteer has already clocked in, so they cannot be removed.');
    }
    if (status !== booking.status) Object.assign(patch, { status });
    if (status === 'cancelled') Object.assign(patch, { traineeId: '', traineeName: '', moreTrainees: '', pairing: '' });
  }
  if (!Object.keys(patch).length) throw err_.validation('Nothing to update.');
  Object.assign(patch, { decidedBy: admin.name, decidedAt: fmtDateTime_(now_()) });
  bookings.update(booking, patch);

  let message;
  const names = bookingTraineeIds_(booking).map((id) => (traineeById_(id) || {}).name || id);
  if (booking.status === 'cancelled') message = `${booking.volunteerName} was removed from the session.`;
  else if (names.length) message = `${booking.volunteerName} is with ${names.join(' and ')}.${shared.length ? ` (${shared.join('; ')}.)` : ''}`;
  else message = `${booking.volunteerName} has no trainee now.`;
  return { detail: sessionDetail_({ sessionId: booking.sessionId }), message };
}

/** "Pair the rest automatically": every coming volunteer without a trainee, new ones included. */
function pairUnpaired_(p) {
  onlyFields_(p, ['sessionId']);
  const sessionId = id_(p.sessionId, 'Session');
  const session = table_('sessions').find((s) => s.sessionId === sessionId);
  if (!session) throw err_.notFound('Session not found.');
  const bookings = table_('bookings');
  const open = sortBy_(bookings.filter((b) => b.sessionId === sessionId && b.status !== 'cancelled' && !b.traineeId), (b) => b.bookedAt);
  let paired = 0;
  open.forEach((b) => { if (autoPair_(b, session, null, { force: true })) paired += 1; });
  const still = open.length - paired;
  let message = 'Everyone coming already has a trainee.';
  if (open.length) message = `${paired} paired with a trainee.${still ? ` ${still} still need${still === 1 ? 's' : ''} one: there are no free trainees left.` : ''}`;
  return { detail: sessionDetail_({ sessionId }), message };
}
