/**
 * Admin.gs — admin actions on sessions, sign-ups and pairing for one session.
 * (People/roles are in Auth.gs and Profile.gs; volunteer types and regular
 * pairings in Pairing.gs; QR clocking in Attendance.gs; venues, projects and
 * the guide in Content.gs; trainee notes in Trainees.gs.)
 *
 * Volunteers don't need confirming: saying "I'm coming" puts them on the list.
 */

function sessionStats_(sessionId, bookings, attendance, today) {
  const active = bookings.filter((b) => b.sessionId === sessionId && b.status !== 'cancelled');
  const att = attendance.filter((a) => a.sessionId === sessionId);
  const attended = {};
  att.forEach((a) => { attended[a.bookingId] = true; });
  const past = today && active.length && active[0].sessionDate < today;
  return {
    booked: active.length, // "coming"
    paired: active.filter((b) => b.traineeId).length,
    unpaired: active.filter((b) => !b.traineeId).length,
    onSite: att.filter((a) => a.clockIn && !a.clockOut).length,
    done: att.filter((a) => a.clockOut).length,
    noShows: past ? active.filter((b) => !attended[b.bookingId]).length : 0,
  };
}

function adminHome_() {
  const today = todayStr_();
  const from = addDays_(today, -7);
  const bookings = table_('bookings').rows();
  const attendance = table_('attendance').rows();
  const sessions = sortBy_(
    table_('sessions').rows().filter((s) => s.date >= from && s.status !== 'cancelled'),
    (s) => `${s.date} ${s.startTime}`
  ).map((s) => Object.assign(sessionOut_(s), { stats: sessionStats_(s.sessionId, bookings, attendance, today) }));
  return {
    today,
    sessions,
    unpairedTotal: sessions.filter((s) => s.date >= today).reduce((n, s) => n + s.stats.unpaired, 0),
    sessionOptions: CONFIG.SESSION_OPTIONS,
    reviewCount: table_('feedback').filter((f) => f.noteStatus === 'pending' && f.traineeObservation).length,
    venues: activeVenues_(),
    projects: activeProjects_(),
    trainees: traineeList_(),
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
  if (has('title')) out.title = str_(p.title, 'Title', { required: true });
  if (has('date')) out.date = date_(p.date, 'Date');
  if (has('startTime')) out.startTime = time_(p.startTime, 'Start time');
  if (has('endTime')) out.endTime = time_(p.endTime, 'End time');
  if (has('venue')) out.venue = requireVenue_(str_(p.venue, 'Venue', { required: true }));
  if (has('project')) out.project = requireProjects_(p.project); // one or several
  if (has('capacity')) out.capacity = p.capacity === '' || p.capacity === null || p.capacity === undefined ? 0 : int_(p.capacity, 'Capacity', 0, 500);
  if (has('notes')) out.notes = str_(p.notes, 'Notes', { max: LIMITS.NOTES });
  if (has('traineeIds')) out.traineeIds = traineeIdsField_(p.traineeIds);
  if (partial && has('status')) out.status = oneOf_(p.status, 'Status', ['open', 'closed', 'cancelled']);
  return out;
}

const SESSION_FIELDS = ['title', 'date', 'startTime', 'endTime', 'venue', 'project', 'capacity', 'notes', 'traineeIds'];

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
  return { session: sessionOut_(s), home: adminHome_() };
}

/**
 * Adds the same session on several dates at once (e.g. every Saturday this
 * month). Each date succeeds or is skipped on its own: a date in the past, or
 * one that already has a session with the same name and start time.
 */
function createSessions_(p, admin) {
  onlyFields_(p, ['dates'].concat(SESSION_FIELDS.filter((k) => k !== 'date')));
  if (!Array.isArray(p.dates) || !p.dates.length || p.dates.length > 31) throw err_.validation('Choose between 1 and 31 dates.');
  const fields = sessionFields_(Object.assign({}, p, { date: p.dates[0] }), false);
  delete fields.date;
  if (fields.endTime <= fields.startTime) throw err_.validation('End time must be after start time.');
  const sessions = table_('sessions');
  const earliest = addDays_(todayStr_(), -1);
  const created = [];
  const skipped = [];
  const seen = {};
  p.dates.forEach((raw) => {
    const date = date_(raw, 'Date');
    if (seen[date]) return;
    seen[date] = true;
    if (date < earliest) { skipped.push({ date, reason: 'in the past' }); return; }
    if (sessions.find((s) => s.date === date && s.title === fields.title && s.startTime === fields.startTime && s.status !== 'cancelled')) {
      skipped.push({ date, reason: 'already has this session' });
      return;
    }
    const s = sessions.insert(Object.assign({}, fields, {
      sessionId: newId_('S'), date, status: 'open', createdBy: admin.name, createdAt: fmtDateTime_(now_()),
    }));
    created.push(sessionOut_(s));
  });
  let message = created.length ? `Added ${created.length} session${created.length === 1 ? '' : 's'}. Volunteers can sign up now.` : 'No sessions were added.';
  if (skipped.length) message += ` Skipped ${skipped.map((x) => `${x.date} (${x.reason})`).join(', ')}.`;
  return { created, skipped, message, home: adminHome_() };
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
  if (rest.project !== undefined && parseProjects_(Array.isArray(rest.project) ? rest.project.join(',') : rest.project).join(', ') === parseProjects_(s.project).join(', ')) {
    delete rest.project; // unchanged: archived projects can stay on an existing session
  }
  const patch = sessionFields_(rest, true);
  const start = patch.startTime || s.startTime;
  const end = patch.endTime || s.endTime;
  if (end <= start) throw err_.validation('End time must be after start time.');
  sessions.update(s, patch);
  // keep the readable copies on booking rows in step
  if (patch.title || patch.date) {
    const bookings = table_('bookings');
    bookings.filter((b) => b.sessionId === s.sessionId).forEach((b) => {
      bookings.update(b, { sessionTitle: s.title, sessionDate: s.date });
    });
  }
  return { detail: sessionDetail_({ sessionId: s.sessionId }) };
}

function sessionDetail_(p) {
  const sessionId = id_(p.sessionId, 'Session');
  const s = table_('sessions').find((x) => x.sessionId === sessionId);
  if (!s) throw err_.notFound('Session not found.');
  const users = byKey_(table_('users').rows(), 'userId');
  const allBookings = table_('bookings').rows();
  const attendance = table_('attendance').rows();
  const attByBooking = byKey_(attendance.filter((a) => a.sessionId === sessionId), 'bookingId');
  const feedbackByBooking = byKey_(table_('feedback').rows().filter((f) => f.sessionId === sessionId), 'bookingId');
  const regulars = regularsByTrainee_();
  const today = todayStr_();
  const order = { confirmed: 0, pending: 0, cancelled: 2 };
  const bookings = sortBy_(
    allBookings.filter((b) => b.sessionId === sessionId),
    (b) => `${order[b.status] === undefined ? 3 : order[b.status]}${String(b.volunteerName).toLowerCase()}`
  ).map((b) => {
    const u = users[b.userId] || {};
    const a = attByBooking[b.bookingId];
    const fixed = activeStandings_(b.userId);
    const trainees = bookingTrainees_(b);
    return {
      bookingId: b.bookingId,
      status: b.status === 'pending' ? 'confirmed' : b.status, // older sign-ups waited for a leader; now everyone listed is coming
      walkIn: b.walkIn === 'Yes',
      bookedAt: b.bookedAt,
      volunteer: {
        userId: b.userId,
        name: u.name || b.volunteerName,
        type: volunteerType_(u),
        isAdmin: u.role === 'admin',
        phone: u.phone || '',
        telegram: u.telegram || '',
        standingTrainees: fixed.map((x) => ({ id: String(x.traineeId), name: x.traineeName })),
      },
      trainees,
      trainee: trainees[0] || null, // the first, for older screens
      pairing: trainees.length ? (b.pairing === 'standing' ? 'standing' : 'manual') : '',
      attendance: a ? attendanceOut_(a) : null,
      noShow: s.date < today && b.status !== 'cancelled' && !a,
      feedbackGiven: Boolean(feedbackByBooking[b.bookingId]),
    };
  });
  return {
    today,
    session: sessionOut_(s),
    stats: sessionStats_(sessionId, allBookings, attendance, today),
    bookings,
    trainees: traineeList_().map((t) => Object.assign({}, t, { regulars: (regulars[t.id] || []).map((r) => r.userId) })),
    history: pairHistoryFor_(bookings.map((b) => b.volunteer.userId)), // who has been with whom before
    venues: activeVenues_(),
    projects: activeProjects_(),
  };
}

/**
 * An admin changes who a volunteer is with for one session, or takes them off
 * the list (status 'cancelled'). Pairing is many to many: a volunteer can have
 * several trainees and a trainee several volunteers.
 *   addTraineeId      adds a trainee (drag and drop, "+ Trainee")
 *   removeTraineeId   removes one (the small ✕)
 *   traineeId         replaces them all with one; '' unpairs them
 */
function updateBooking_(p, admin) {
  onlyFields_(p, ['bookingId', 'status', 'traineeId', 'addTraineeId', 'removeTraineeId']);
  const bookings = table_('bookings');
  const booking = bookings.find((b) => b.bookingId === id_(p.bookingId, 'Booking'));
  if (!booking) throw err_.notFound('Booking not found.');
  const patch = {};
  let message = 'Saved.';

  const has = (k) => Object.prototype.hasOwnProperty.call(p, k);
  const pairOps = ['traineeId', 'addTraineeId', 'removeTraineeId'].filter(has);
  if (pairOps.length > 1) throw err_.validation('Send one of traineeId, addTraineeId or removeTraineeId.');
  if (pairOps.length) {
    if (booking.status === 'cancelled') throw err_.conflict(`${booking.volunteerName} is no longer coming to this session.`);
    const op = pairOps[0];
    const current = bookingTrainees_(booking);
    const findTrainee = (value) => {
      const trainee = traineeById_(str_(value, 'Trainee', { required: true, max: 40 }));
      if (!trainee) throw err_.validation('Trainee not found in the trainee list.');
      if (!CONFIG.ALLOW_SHARED_TRAINEE) {
        const other = bookings.find((b) => b.sessionId === booking.sessionId && b.bookingId !== booking.bookingId &&
          b.status !== 'cancelled' && hasTrainee_(b, trainee.id));
        if (other) throw err_.conflict(`${trainee.name} is already paired with ${other.volunteerName} for this session.`);
      }
      return { id: String(trainee.id), name: trainee.name };
    };
    let next;
    if (op === 'addTraineeId') {
      const t = findTrainee(p.addTraineeId);
      if (current.some((x) => x.id === t.id)) throw err_.conflict(`${booking.volunteerName} is already paired with ${t.name}.`);
      next = current.concat([t]);
      message = `${booking.volunteerName} is paired with ${namesText_(next.map((x) => x.name))}.`;
    } else if (op === 'removeTraineeId') {
      const id = str_(p.removeTraineeId, 'Trainee', { required: true, max: 40 });
      const gone = current.find((x) => x.id === id);
      if (!gone) throw err_.conflict(`${booking.volunteerName} isn't paired with that trainee.`);
      next = current.filter((x) => x.id !== id);
      message = next.length ? `${booking.volunteerName} is no longer with ${gone.name}.` : `${booking.volunteerName} is now unpaired.`;
    } else if (p.traineeId === '' || p.traineeId === null) {
      next = [];
      message = `${booking.volunteerName} is now unpaired.`;
    } else {
      next = [findTrainee(p.traineeId)];
      message = `${booking.volunteerName} is paired with ${next[0].name}.`;
    }
    Object.assign(patch, next.length ? Object.assign(traineeCells_(next), { pairing: 'manual' }) : { traineeId: '', traineeName: '', pairing: '' });
  }

  if (Object.prototype.hasOwnProperty.call(p, 'status')) {
    const status = oneOf_(p.status, 'Status', ['confirmed', 'cancelled']);
    if (status === 'cancelled' && table_('attendance').find((a) => a.bookingId === booking.bookingId)) {
      throw err_.conflict('This volunteer has already clocked in, so they cannot be removed from the session.');
    }
    if (status !== booking.status) {
      Object.assign(patch, { status, decidedBy: admin.name, decidedAt: fmtDateTime_(now_()) });
      message = status === 'cancelled' ? `${booking.volunteerName} was taken off the list.` : `${booking.volunteerName} is back on the list.`;
    }
    if (status === 'cancelled') Object.assign(patch, { traineeId: '', traineeName: '', pairing: '' });
  }

  if (!Object.keys(patch).length) throw err_.validation('Nothing to update.');
  bookings.update(booking, patch);
  if (patch.status === 'confirmed') {
    const user = table_('users').find((u) => u.userId === booking.userId);
    if (user) applyStanding_(booking, user);
  }
  return { detail: sessionDetail_({ sessionId: booking.sessionId }), message };
}
