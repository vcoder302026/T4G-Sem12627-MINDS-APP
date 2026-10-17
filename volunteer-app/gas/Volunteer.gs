/**
 * Volunteer.gs — everything a volunteer does.
 *
 * Signing up is just "I'm coming": there is no confirmation step. Regular
 * volunteers are paired with a trainee straight away (their regular pairs
 * first); new volunteers are paired by an admin. Volunteers can mark several
 * sessions at once (signUpSessions), and everyone sees every upcoming session
 * (the Schedule), so they can share it with trainees' caregivers.
 *
 * Apps Script calls take ~1–2 s each, so the volunteer app loads its whole
 * screen state in ONE call (volunteerHome) and every volunteer action returns
 * the refreshed state, instead of making a second round trip.
 */

/** A session's display name: its title, else its type. */
function sessionTitle_(s) {
  return String(s.title || s.type || 'Volunteer session');
}

function sessionOut_(s) {
  const venue = s.venue ? venueByName_(s.venue) : null;
  return {
    sessionId: s.sessionId,
    type: s.type || CONFIG.SESSION_TYPES[0],
    title: sessionTitle_(s),
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    venue: s.venue,
    venueAddress: venue ? venue.address : '',
    project: s.project || '',
    capacity: Number(s.capacity) || 0,
    notes: s.notes,
    traineeIds: parseIds_(s.traineeIds),
    status: s.status || 'open',
  };
}

function attendanceOut_(a) {
  return {
    attendanceId: a.attendanceId,
    sessionId: a.sessionId,
    sessionTitle: a.sessionTitle,
    date: a.date,
    clockIn: a.clockIn,
    clockOut: a.clockOut,
    hours: a.clockOut ? Number(a.hours) || 0 : null,
    method: a.method,
  };
}

/** Every trainee on a booking: the main one, then "More Trainees". */
function bookingTraineeIds_(b) {
  const ids = [];
  [String(b.traineeId || '')].concat(parseIds_(b.moreTrainees)).forEach((id) => {
    if (id && ids.indexOf(id) === -1) ids.push(id);
  });
  return ids;
}

function qrCode_(userId, dateStr) {
  const ymd = dateStr.replace(/-/g, '');
  return `MINDS1.${userId}.${ymd}.${sign_(`qr|${userId}|${ymd}`).slice(0, 22)}`;
}

function volunteerHome_(p, user) {
  const today = todayStr_();
  const sessions = table_('sessions').rows();
  const sessionById = byKey_(sessions, 'sessionId');
  const allBookings = table_('bookings').rows();
  const mine = allBookings.filter((b) => b.userId === user.userId && b.status !== 'cancelled');
  const mineBySession = byKey_(mine, 'sessionId');
  const attendance = table_('attendance').rows().filter((a) => a.userId === user.userId);
  const attByBooking = byKey_(attendance.filter((a) => a.bookingId), 'bookingId');
  const feedbackByBooking = byKey_(table_('feedback').rows().filter((f) => f.userId === user.userId && f.bookingId), 'bookingId');

  const taken = {};
  allBookings.forEach((b) => {
    if (b.status !== 'cancelled') taken[b.sessionId] = (taken[b.sessionId] || 0) + 1;
  });
  const when = (s) => `${s.date} ${s.startTime}`;

  const upcoming = sortBy_(
    mine.filter((b) => sessionById[b.sessionId] && sessionById[b.sessionId].date >= today && sessionById[b.sessionId].status !== 'cancelled'),
    (b) => when(sessionById[b.sessionId])
  ).map((b) => {
    const a = attByBooking[b.bookingId];
    return {
      bookingId: b.bookingId,
      walkIn: b.walkIn === 'Yes',
      session: sessionOut_(sessionById[b.sessionId]),
      trainees: bookingTraineeIds_(b).map((id) => traineeForVolunteer_(id, user)).filter(Boolean), // TraineeUpdates.gs
      attendance: a ? attendanceOut_(a) : null,
      canCancel: !a,
    };
  });

  // The Schedule: every upcoming session, for everyone (closed ones too, so it can be shared as is).
  const schedule = sortBy_(sessions.filter((s) => s.sessionId && s.status !== 'cancelled' && s.date >= today), when).map((s) => {
    const cap = Number(s.capacity) || 0;
    const booking = mineBySession[s.sessionId];
    const spotsLeft = cap ? Math.max(0, cap - (taken[s.sessionId] || 0)) : null;
    return Object.assign(sessionOut_(s), {
      spotsLeft,
      myBookingId: booking ? booking.bookingId : null,
      canSignUp: !booking && s.status === 'open' && spotsLeft !== 0,
    });
  });

  const feedbackFrom = addDays_(today, -CONFIG.FEEDBACK_WINDOW_DAYS);
  const bookingById = byKey_(mine, 'bookingId');
  const pendingFeedback = sortBy_(
    attendance.filter((a) => a.clockOut && a.bookingId && a.date >= feedbackFrom && !feedbackByBooking[a.bookingId]),
    (a) => a.clockOut
  ).reverse().map((a) => ({
    bookingId: a.bookingId,
    sessionTitle: a.sessionTitle,
    date: a.date,
    traineeName: bookingById[a.bookingId] ? bookingById[a.bookingId].traineeName : '',
  }));

  const completed = attendance.filter((a) => a.clockOut);
  const totalHours = completed.reduce((sum, a) => sum + (Number(a.hours) || 0), 0);

  const qrDates = [today];
  const qrUntil = addDays_(today, CONFIG.QR_DAYS_AHEAD);
  upcoming.forEach((u) => {
    if (u.session.date <= qrUntil && qrDates.indexOf(u.session.date) === -1) qrDates.push(u.session.date);
  });

  return {
    user: publicUser_(user),
    today,
    guideRead: Boolean(user.guideReadAt),
    regularAfter: CONFIG.REGULAR_AFTER_SESSIONS,
    upcoming,
    schedule,
    pendingFeedback,
    myPairs: pairsFor_({ userId: user.userId }).map((x) => ({ traineeId: x.traineeId, traineeName: x.traineeName })),
    history: sortBy_(completed, (a) => a.clockIn).reverse().slice(0, 30).map(attendanceOut_),
    totals: { hours: Math.round(totalHours * 100) / 100, sessions: completed.length },
    qr: qrDates.map((d) => ({ date: d, code: qrCode_(user.userId, d) })),
  };
}

function ownBooking_(bookingId, user) {
  const booking = table_('bookings').find((b) => b.bookingId === id_(bookingId, 'Booking'));
  if (!booking || booking.userId !== user.userId) throw err_.notFound('Booking not found.');
  return booking;
}

/**
 * "I'm coming" for one session. Writes a confirmed booking (no admin
 * confirmation). Regulars are paired straight away. Returns { booking, paired, message }.
 */
function comeToSession_(sessionId, user) {
  if (CONFIG.REQUIRE_GUIDE_BEFORE_BOOKING && !user.guideReadAt) {
    throw new AppError('GUIDE_REQUIRED', 'Please read the Volunteer Guide before signing up for your first session.');
  }
  const s = table_('sessions').find((x) => x.sessionId === sessionId);
  if (!s || s.status === 'cancelled') throw err_.notFound('Session not found.');
  const title = sessionTitle_(s);
  if (s.status !== 'open') throw err_.conflict(`Sign-ups for ${title} are closed.`);
  if (s.date < todayStr_()) throw err_.conflict(`${title} has already happened.`);
  const bookings = table_('bookings');
  const active = bookings.filter((b) => b.sessionId === sessionId && b.status !== 'cancelled');
  if (active.some((b) => b.userId === user.userId)) throw err_.conflict(`You're already down as coming to ${title}.`);
  const cap = Number(s.capacity) || 0;
  if (cap && active.length >= cap) throw err_.conflict(`Sorry, ${title} is full.`);
  const booking = bookings.insert({
    bookingId: newId_('B'),
    sessionId,
    sessionDate: s.date,
    sessionTitle: title,
    userId: user.userId,
    volunteerName: user.name,
    status: 'confirmed',
    bookedAt: fmtDateTime_(now_()),
  });
  const paired = autoPair_(booking, s, user); // Trainees.gs: only regulars, unless AUTO_PAIR_NEW
  let message = `You're coming to ${title} on ${niceDate_(s.date)}.`;
  if (paired) message += ` You're with ${paired.traineeNames}.`;
  else if (!isRegular_(user)) message += ' A MINDS admin will pair you with a trainee before the day.';
  return { booking, paired, message };
}

function bookSession_(p, user) {
  onlyFields_(p, ['sessionId']);
  const res = comeToSession_(id_(p.sessionId, 'Session'), user);
  return { message: res.message, home: volunteerHome_({}, user) };
}

/** Several sessions at once (e.g. all four this month). Each one succeeds or fails on its own. */
function signUpSessions_(p, user) {
  onlyFields_(p, ['sessionIds']);
  if (!Array.isArray(p.sessionIds) || !p.sessionIds.length || p.sessionIds.length > 31) throw err_.validation('Choose between 1 and 31 sessions.');
  const ids = [];
  p.sessionIds.forEach((x) => { const id = id_(x, 'Session'); if (ids.indexOf(id) === -1) ids.push(id); });
  const results = ids.map((sessionId) => {
    try {
      const res = comeToSession_(sessionId, user);
      return { sessionId, ok: true, message: res.message };
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      if (e.code === 'GUIDE_REQUIRED') throw e;
      return { sessionId, ok: false, message: e.message };
    }
  });
  const okCount = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  let message = okCount ? `You're coming to ${okCount} session${okCount === 1 ? '' : 's'}.` : 'No sessions were added.';
  if (failed.length) message += ` ${failed.map((f) => f.message).join(' ')}`;
  return { results, message, home: volunteerHome_({}, user) };
}

function cancelBooking_(p, user) {
  onlyFields_(p, ['bookingId']);
  const booking = ownBooking_(p.bookingId, user);
  if (booking.status === 'cancelled') throw err_.conflict('You have already said you can\'t make it.');
  if (table_('attendance').find((a) => a.bookingId === booking.bookingId)) {
    throw err_.conflict('You have already clocked in for this session, so it cannot be cancelled.');
  }
  const s = table_('sessions').find((x) => x.sessionId === booking.sessionId);
  if (s && s.date < todayStr_()) throw err_.conflict('Past sessions cannot be cancelled.');
  table_('bookings').update(booking, {
    status: 'cancelled', traineeId: '', traineeName: '', moreTrainees: '', pairing: '',
    decidedBy: `${user.name} (self)`, decidedAt: fmtDateTime_(now_()),
  });
  return { message: 'Okay, you\'re no longer down for that session.', home: volunteerHome_({}, user) };
}

function submitFeedback_(p, user) {
  onlyFields_(p, ['bookingId', 'rating', 'sessionFeedback', 'traineeObservation']);
  const booking = ownBooking_(p.bookingId, user);
  const att = table_('attendance').find((a) => a.bookingId === booking.bookingId && a.clockOut);
  if (!att) throw err_.conflict('You can give feedback once you have been clocked out.');
  const feedback = table_('feedback');
  if (feedback.find((f) => f.bookingId === booking.bookingId)) throw err_.conflict('Feedback for this session was already submitted. Thank you!');
  const rating = p.rating === undefined || p.rating === null || p.rating === '' ? '' : int_(p.rating, 'Rating', 1, 5);
  const sessionFeedback = str_(p.sessionFeedback, 'Session feedback', { max: LIMITS.NOTES });
  const traineeObservation = str_(p.traineeObservation, 'Trainee observation', { max: LIMITS.NOTES });
  if (rating === '' && !sessionFeedback && !traineeObservation) throw err_.validation('Add a rating or a comment before submitting.');

  const shareNow = Boolean(traineeObservation && booking.traineeId && CONFIG.AUTO_SHARE_OBSERVATIONS);
  const fb = feedback.insert({
    feedbackId: newId_('F'),
    type: 'Session feedback',
    sessionId: booking.sessionId,
    bookingId: booking.bookingId,
    userId: user.userId,
    volunteerName: user.name,
    traineeId: booking.traineeId,
    traineeName: booking.traineeName,
    date: att.date,
    rating,
    sessionFeedback,
    traineeObservation,
    noteStatus: traineeObservation && booking.traineeId ? (shareNow ? 'shared' : 'pending') : 'none',
    submittedAt: fmtDateTime_(now_()),
  });
  if (shareNow) {
    const trainee = traineeById_(booking.traineeId);
    if (trainee) addNote_(trainee, traineeObservation, user.name, 'Volunteer feedback', 'automatic', fb.feedbackId, att.date);
  }
  return {
    message: 'Thank you for your feedback!',
    noteStatus: fb.noteStatus,
    home: volunteerHome_({}, user),
  };
}
