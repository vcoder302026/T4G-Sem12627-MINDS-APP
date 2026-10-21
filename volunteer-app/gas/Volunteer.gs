/**
 * Volunteer.gs — everything a volunteer does.
 *
 * Apps Script calls take ~1–2 s each, so the volunteer app loads its whole
 * screen state in ONE call (volunteerHome) and every volunteer action returns
 * the refreshed state, instead of making a second round trip.
 */

function sessionOut_(s) {
  const venue = s.venue ? venueByName_(s.venue) : null;
  return {
    sessionId: s.sessionId,
    title: s.title,
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
  const feedbackByBooking = byKey_(table_('feedback').rows().filter((f) => f.userId === user.userId), 'bookingId');

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
      status: 'confirmed', // "coming" (older rows may still say pending)
      walkIn: b.walkIn === 'Yes',
      session: sessionOut_(sessionById[b.sessionId]),
      trainee: b.traineeId ? traineeForVolunteer_(b.traineeId, user) : null,
      pairing: b.traineeId ? (b.pairing === 'standing' ? 'standing' : 'manual') : '',
      attendance: a ? attendanceOut_(a) : null,
      canCancel: !a,
    };
  });

  const openSessions = sortBy_(sessions.filter((s) => s.status === 'open' && s.date >= today), when).map((s) => {
    const cap = Number(s.capacity) || 0;
    const booking = mineBySession[s.sessionId];
    return Object.assign(sessionOut_(s), {
      spotsLeft: cap ? Math.max(0, cap - (taken[s.sessionId] || 0)) : null,
      myBookingId: booking ? booking.bookingId : null,
      myStatus: booking ? 'confirmed' : null,
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

  const type = volunteerType_(user);
  const fixed = type === 'regular' ? activeStanding_(user.userId) : null;
  const attended = sessionsAttended_(user.userId, attendance);
  return {
    user: publicUser_(user),
    today,
    guideRead: Boolean(user.guideReadAt),
    volunteerType: type,
    regularTrainee: fixed ? { id: String(fixed.traineeId), name: fixed.traineeName } : null,
    progress: { attended, needed: CONFIG.REGULAR_AFTER_SESSIONS },
    upcoming,
    openSessions,
    pendingFeedback,
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

/** "I'm coming" for one session (Pairing.gs has the rules and bookSessions_ for several). */
function bookSession_(p, user) {
  onlyFields_(p, ['sessionId']);
  const sessionId = id_(p.sessionId, 'Session');
  guideCheck_(user);
  const r = comeToSession_(sessionId, user);
  return { message: comingMessage_(r, user), trainee: r.trainee ? r.trainee.name : '', home: volunteerHome_({}, user) };
}

function cancelBooking_(p, user) {
  onlyFields_(p, ['bookingId']);
  const booking = ownBooking_(p.bookingId, user);
  if (booking.status === 'cancelled') throw err_.conflict('This booking is already cancelled.');
  if (table_('attendance').find((a) => a.bookingId === booking.bookingId)) {
    throw err_.conflict('You have already clocked in for this session, so it cannot be cancelled.');
  }
  const s = table_('sessions').find((x) => x.sessionId === booking.sessionId);
  if (s && s.date < todayStr_()) throw err_.conflict('Past sessions cannot be changed.');
  table_('bookings').update(booking, {
    status: 'cancelled', traineeId: '', traineeName: '', pairing: '', decidedBy: `${user.name} (self)`, decidedAt: fmtDateTime_(now_()),
  });
  return { message: `OK, you're no longer coming to ${booking.sessionTitle}.`, home: volunteerHome_({}, user) };
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
