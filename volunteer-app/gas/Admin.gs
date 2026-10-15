/**
 * Admin.gs — volunteer leader actions: sessions, bookings and trainee pairing.
 * (People/roles are in Auth.gs; QR clocking is in Attendance.gs; venues,
 * projects and the guide are in Content.gs; trainee notes in Trainees.gs.)
 */

function sessionStats_(sessionId, bookings, attendance) {
  const active = bookings.filter((b) => b.sessionId === sessionId && b.status !== 'cancelled');
  const att = attendance.filter((a) => a.sessionId === sessionId);
  return {
    booked: active.length,
    pending: active.filter((b) => b.status === 'pending').length,
    confirmed: active.filter((b) => b.status === 'confirmed').length,
    unpaired: active.filter((b) => b.status === 'confirmed' && !b.traineeId).length,
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
    table_('sessions').rows().filter((s) => s.date >= from && s.status !== 'cancelled'),
    (s) => `${s.date} ${s.startTime}`
  ).map((s) => Object.assign(sessionOut_(s), { stats: sessionStats_(s.sessionId, bookings, attendance) }));
  return {
    today,
    sessions,
    pendingTotal: sessions.filter((s) => s.date >= today).reduce((n, s) => n + s.stats.pending, 0),
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
  if (has('project')) out.project = requireProject_(str_(p.project, 'Project'));
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
  const order = { pending: 0, confirmed: 1, cancelled: 2 };
  const bookings = sortBy_(
    allBookings.filter((b) => b.sessionId === sessionId),
    (b) => `${order[b.status] === undefined ? 3 : order[b.status]}${String(b.volunteerName).toLowerCase()}`
  ).map((b) => {
    const u = users[b.userId] || {};
    const a = attByBooking[b.bookingId];
    return {
      bookingId: b.bookingId,
      status: b.status,
      walkIn: b.walkIn === 'Yes',
      bookedAt: b.bookedAt,
      volunteer: {
        userId: b.userId,
        name: u.name || b.volunteerName,
        phone: u.phone || '',
        telegram: u.telegram || '',
        emergencyName: u.emergencyName || '',
        emergencyPhone: u.emergencyPhone || '',
        emergencyRelation: u.emergencyRelation || '',
      },
      trainee: b.traineeId ? { id: String(b.traineeId), name: b.traineeName } : null,
      pairing: b.pairing || (b.traineeId ? 'manual' : ''),
      attendance: a ? attendanceOut_(a) : null,
      feedbackGiven: Boolean(feedbackByBooking[b.bookingId]),
    };
  });
  return {
    today: todayStr_(),
    session: sessionOut_(s),
    stats: sessionStats_(sessionId, allBookings, attendance),
    bookings,
    trainees: traineeList_(),
    venues: activeVenues_(),
    projects: activeProjects_(),
  };
}

/**
 * Confirm / cancel a booking and pair (or re-pair) the volunteer with a trainee.
 * Confirming without choosing a trainee pairs one automatically (Trainees.gs → pickTrainee_).
 */
function updateBooking_(p, admin) {
  onlyFields_(p, ['bookingId', 'status', 'traineeId']);
  const bookings = table_('bookings');
  const booking = bookings.find((b) => b.bookingId === id_(p.bookingId, 'Booking'));
  if (!booking) throw err_.notFound('Booking not found.');
  const session = table_('sessions').find((s) => s.sessionId === booking.sessionId);
  const patch = {};
  const traineeGiven = Object.prototype.hasOwnProperty.call(p, 'traineeId');

  if (traineeGiven) {
    if (p.traineeId === '' || p.traineeId === null) {
      patch.traineeId = '';
      patch.traineeName = '';
      patch.pairing = '';
    } else {
      const trainee = traineeById_(str_(p.traineeId, 'Trainee', { required: true, max: 40 }));
      if (!trainee) throw err_.validation('Trainee not found in the trainee list.');
      if (!CONFIG.ALLOW_SHARED_TRAINEE) {
        const other = bookings.find((b) => b.sessionId === booking.sessionId && b.bookingId !== booking.bookingId &&
          b.status !== 'cancelled' && String(b.traineeId) === String(trainee.id));
        if (other) throw err_.conflict(`${trainee.name} is already paired with ${other.volunteerName} for this session.`);
      }
      patch.traineeId = String(trainee.id);
      patch.traineeName = trainee.name;
      patch.pairing = 'manual';
    }
  }

  if (Object.prototype.hasOwnProperty.call(p, 'status')) {
    const status = oneOf_(p.status, 'Status', ['pending', 'confirmed', 'cancelled']);
    if (status === 'cancelled' && table_('attendance').find((a) => a.bookingId === booking.bookingId)) {
      throw err_.conflict('This volunteer has already clocked in, so the booking cannot be cancelled.');
    }
    if (status !== booking.status) {
      patch.status = status;
      patch.decidedBy = admin.name;
      patch.decidedAt = fmtDateTime_(now_());
    }
    if (status === 'cancelled') {
      patch.traineeId = '';
      patch.traineeName = '';
      patch.pairing = '';
    }
  }

  if (!Object.keys(patch).length) throw err_.validation('Nothing to update.');
  bookings.update(booking, patch);
  const paired = booking.status === 'confirmed' && !traineeGiven && session ? autoPair_(booking, session) : null;
  return {
    detail: sessionDetail_({ sessionId: booking.sessionId }),
    paired,
    message: pairingMessage_(booking, paired),
  };
}

function pairingMessage_(booking, paired) {
  if (booking.status !== 'confirmed') return booking.status === 'cancelled' ? `${booking.volunteerName}'s booking was removed.` : 'Saved.';
  if (paired) return `${booking.volunteerName} confirmed and paired with ${paired.traineeName} (${paired.reason}).`;
  if (booking.traineeId) return `${booking.volunteerName} confirmed with ${booking.traineeName}.`;
  return `${booking.volunteerName} confirmed. No free trainee to pair: choose one, or add trainees to the session.`;
}

/**
 * One tap: confirm every pending booking in a session and pair each volunteer,
 * and pair anyone already confirmed who still has no trainee.
 */
function confirmAll_(p, admin) {
  onlyFields_(p, ['sessionId']);
  const sessionId = id_(p.sessionId, 'Session');
  const session = table_('sessions').find((s) => s.sessionId === sessionId);
  if (!session) throw err_.notFound('Session not found.');
  const bookings = table_('bookings');
  const open = sortBy_(bookings.filter((b) => b.sessionId === sessionId
    && (b.status === 'pending' || (b.status === 'confirmed' && !b.traineeId))), (b) => b.bookedAt);
  let confirmed = 0;
  let paired = 0;
  open.forEach((b) => {
    if (b.status === 'pending') {
      bookings.update(b, { status: 'confirmed', decidedBy: admin.name, decidedAt: fmtDateTime_(now_()) });
      confirmed += 1;
    }
    if (autoPair_(b, session)) paired += 1;
  });
  const stillUnpaired = bookings.filter((b) => b.sessionId === sessionId && b.status === 'confirmed' && !b.traineeId).length;
  const parts = [];
  if (confirmed) parts.push(`${confirmed} confirmed`);
  parts.push(`${paired} paired with a trainee`);
  if (stillUnpaired) parts.push(`${stillUnpaired} still need${stillUnpaired === 1 ? 's' : ''} a trainee`);
  return {
    detail: sessionDetail_({ sessionId }),
    message: open.length ? `${parts.join(', ')}.` : 'Everyone is already confirmed and paired.',
  };
}
