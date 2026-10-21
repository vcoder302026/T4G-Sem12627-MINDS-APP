/**
 * Attendance.gs — QR clock-in / clock-out.
 *
 * A volunteer's QR code is   MINDS1.<userId>.<yyyymmdd>.<signature>
 * The signature is an HMAC with APP_SECRET, so codes cannot be forged or
 * edited, and each code only works on its own date. Phones pre-load codes for
 * upcoming session days, so the QR still shows with no signal at the venue.
 *
 * One scan toggles: no open record → clock in; open record → clock out.
 * A second scan within MIN_MINUTES_BEFORE_CLOCK_OUT is ignored, so a camera
 * that reads the same code twice does not clock someone straight back out.
 * Every write lands in the Attendance tab immediately, with hours worked out.
 */

function parseQr_(code) {
  if (typeof code !== 'string' || !code.trim()) throw err_.validation('No QR code received.');
  const parts = code.trim().split('.');
  if (parts.length !== 4 || parts[0] !== 'MINDS1' || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^\d{8}$/.test(parts[2])) {
    throw err_.validation('This is not a MINDS volunteer QR code.');
  }
  if (!safeEqual_(parts[3], sign_(`qr|${parts[1]}|${parts[2]}`).slice(0, 22))) {
    throw err_.validation('This QR code is not valid. Ask the volunteer to reopen their app.');
  }
  const ymd = parts[2];
  return { userId: parts[1], date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}` };
}

/** Offline scans carry the time they were taken; online scans use server time. */
function scanTime_(scannedAt) {
  const now = now_();
  if (!scannedAt) return { when: now, offline: false };
  const d = new Date(scannedAt);
  if (isNaN(d.getTime())) throw err_.validation('Scan time is not valid.');
  if (d.getTime() > now.getTime() + 5 * 60000) throw err_.validation('Scan time is in the future. Check the phone clock.');
  if (now.getTime() - d.getTime() > CONFIG.OFFLINE_SCAN_MAX_AGE_HOURS * 3600000) {
    throw err_.validation('This offline scan is too old to record. Enter it in the Attendance tab instead.');
  }
  return { when: d, offline: now.getTime() - d.getTime() > 60000 };
}

function scan_(p, admin) {
  onlyFields_(p, ['code', 'sessionId', 'scannedAt', 'walkIn']);
  const qr = parseQr_(p.code);
  const t = scanTime_(p.scannedAt);
  const day = fmtDate_(t.when);
  if (qr.date !== day) {
    throw err_.validation(`This QR code is for ${qr.date}. Ask the volunteer to reopen the app to get today's code.`);
  }
  const user = table_('users').find((u) => u.userId === qr.userId);
  if (!user || user.status === 'inactive') throw err_.notFound('This volunteer account is not active.');
  return clock_(user, {
    day,
    when: t.when,
    sessionId: p.sessionId ? id_(p.sessionId, 'Session') : '',
    walkIn: p.walkIn === true,
    admin,
    method: t.offline ? 'QR (offline)' : 'QR',
    ignoreQuickRepeat: true,
  });
}

/** Uploads scans queued while the leader's phone was offline, oldest first. */
function scanBatch_(p, admin) {
  onlyFields_(p, ['scans']);
  if (!Array.isArray(p.scans) || p.scans.length > 200) throw err_.validation('Send between 1 and 200 scans.');
  const results = p.scans.map((item) => {
    const scan = obj_(item, 'Scan');
    const clientId = str_(scan.clientId, 'Client id', { max: 60 });
    const payload = Object.assign({}, scan);
    delete payload.clientId;
    try {
      return { clientId, ok: true, data: scan_(payload, admin) };
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      return { clientId, ok: false, error: { code: e.code, message: e.message } };
    }
  });
  return { results };
}

/** Fallback when a volunteer's phone is flat: the leader taps the booking instead. */
function manualClock_(p, admin) {
  onlyFields_(p, ['bookingId']);
  const booking = table_('bookings').find((b) => b.bookingId === id_(p.bookingId, 'Booking'));
  if (!booking || booking.status === 'cancelled') throw err_.notFound('Booking not found.');
  const user = table_('users').find((u) => u.userId === booking.userId);
  if (!user) throw err_.notFound('Volunteer not found.');
  const session = table_('sessions').find((s) => s.sessionId === booking.sessionId);
  const day = todayStr_();
  if (!session || session.date !== day) {
    throw err_.conflict('Manual clocking only works on the day of the session. Correct past times in the Attendance tab.');
  }
  const result = clock_(user, {
    day,
    when: now_(),
    sessionId: session.sessionId,
    bookingId: booking.bookingId,
    admin,
    method: 'Manual',
    ignoreQuickRepeat: false,
  });
  if (result.outcome === 'already-out') throw err_.conflict(`${user.name} has already clocked out of this session.`);
  return Object.assign(result, { detail: sessionDetail_({ sessionId: session.sessionId }) });
}

function minutesOfDay_(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function clock_(user, o) {
  const attendance = table_('attendance');
  const bookings = table_('bookings');
  const sessionById = byKey_(table_('sessions').rows(), 'sessionId');
  const today = attendance.filter((a) => a.userId === user.userId && a.date === o.day);

  // 1) An open record today → clock OUT.
  const openAny = today.find((a) => a.clockIn && !a.clockOut);
  if (openAny && o.sessionId && openAny.sessionId !== o.sessionId) {
    const other = sessionById[openAny.sessionId];
    throw err_.conflict(`${user.name} is still clocked in to "${other ? other.title : 'another session'}". Clock them out there first.`);
  }
  if (openAny) {
    const clockIn = parseDateTime_(openAny.clockIn);
    const minutes = (o.when.getTime() - clockIn.getTime()) / 60000;
    if (minutes < 0) throw err_.validation('Clock-out time is before the clock-in time.');
    const booking = bookings.find((b) => b.bookingId === openAny.bookingId);
    if (o.ignoreQuickRepeat && minutes < CONFIG.MIN_MINUTES_BEFORE_CLOCK_OUT) {
      return clockResult_('already-in', user, sessionById[openAny.sessionId], openAny, booking,
        `Already clocked in at ${openAny.clockIn.slice(11, 16)}. Scan again at the end of the session to clock out.`);
    }
    attendance.update(openAny, {
      clockOut: fmtDateTime_(o.when),
      hours: hoursBetween_(clockIn, o.when),
      clockOutBy: o.admin.name,
      method: openAny.method && openAny.method !== o.method ? `${openAny.method} / ${o.method}` : o.method,
    });
    const promoted = maybePromote_(user.userId);
    return clockResult_('out', user, sessionById[openAny.sessionId], openAny, booking,
      `${openAny.hours} h recorded (in at ${openAny.clockIn.slice(11, 16)}, out at ${openAny.clockOut.slice(11, 16)}).` +
      (promoted ? ` ${user.name} has now attended ${CONFIG.REGULAR_AFTER_SESSIONS} sessions and is a regular volunteer!` : ''));
  }

  // 2) Otherwise → clock IN against today's booking.
  const doneSessions = {};
  today.forEach((a) => { if (a.clockOut) doneSessions[a.sessionId] = a; });
  let candidates = bookings.filter((b) => {
    const s = sessionById[b.sessionId];
    return b.userId === user.userId && b.status !== 'cancelled' && s && s.date === o.day &&
      (!o.sessionId || b.sessionId === o.sessionId) &&
      (!o.bookingId || b.bookingId === o.bookingId) &&
      !doneSessions[b.sessionId];
  });

  if (!candidates.length) {
    const finished = today.filter((a) => a.clockOut && (!o.sessionId || a.sessionId === o.sessionId));
    if (finished.length && !o.walkIn) {
      const last = sortBy_(finished, (a) => a.clockOut).pop();
      return clockResult_('already-out', user, sessionById[last.sessionId], last, bookings.find((b) => b.bookingId === last.bookingId),
        `Already clocked out at ${last.clockOut.slice(11, 16)}.`);
    }
    if (!o.walkIn) {
      return clockResult_('not-booked', user, o.sessionId ? sessionById[o.sessionId] : null, null, null,
        `${user.name} has no booking for ${o.sessionId ? 'this session' : 'any session today'}.`);
    }
    const s = sessionById[o.sessionId];
    if (!s || s.date !== o.day) throw err_.validation('Pick today\'s session on the scanner before adding a walk-in.');
    candidates = [bookings.insert({
      bookingId: newId_('B'),
      sessionId: s.sessionId,
      sessionDate: s.date,
      sessionTitle: s.title,
      userId: user.userId,
      volunteerName: user.name,
      status: 'confirmed',
      walkIn: 'Yes',
      bookedAt: fmtDateTime_(now_()),
      decidedBy: o.admin.name,
      decidedAt: fmtDateTime_(now_()),
    })];
  }

  // Prefer a confirmed booking, then the session starting closest to now.
  const nowMinutes = minutesOfDay_(Utilities.formatDate(o.when, CONFIG.TIMEZONE, 'HH:mm'));
  candidates.sort((a, b) =>
    (a.status === 'confirmed' ? 0 : 1) - (b.status === 'confirmed' ? 0 : 1) ||
    Math.abs(minutesOfDay_(sessionById[a.sessionId].startTime) - nowMinutes) -
    Math.abs(minutesOfDay_(sessionById[b.sessionId].startTime) - nowMinutes));
  const booking = candidates[0];
  const session = sessionById[booking.sessionId];
  let note = '';
  if (booking.status === 'pending') {
    bookings.update(booking, { status: 'confirmed', decidedBy: o.admin.name, decidedAt: fmtDateTime_(now_()) });
  }
  const paired = applyStanding_(booking, user);
  if (paired) note += ` Paired with ${paired.name} (their regular trainee).`;
  else if (!booking.traineeId) note += ' Not paired with a trainee yet: pair them on the pairing board.';
  const record = attendance.insert({
    attendanceId: newId_('A'),
    sessionId: session.sessionId,
    bookingId: booking.bookingId,
    userId: user.userId,
    volunteerName: user.name,
    sessionTitle: session.title,
    date: o.day,
    clockIn: fmtDateTime_(o.when),
    clockInBy: o.admin.name,
    method: o.method,
  });
  return clockResult_('in', user, session, record, booking,
    `Clocked in at ${record.clockIn.slice(11, 16)}.${booking.walkIn === 'Yes' ? ' Added as a walk-in.' : ''}${note}`);
}

function clockResult_(outcome, user, session, record, booking, message) {
  return {
    outcome, // in | out | already-in | already-out | not-booked
    message,
    volunteer: { userId: user.userId, name: user.name },
    session: session ? { sessionId: session.sessionId, title: session.title, startTime: session.startTime, endTime: session.endTime } : null,
    attendance: record ? attendanceOut_(record) : null,
    trainee: booking && booking.traineeName ? { name: booking.traineeName } : null,
  };
}
