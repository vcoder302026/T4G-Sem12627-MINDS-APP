/**
 * Dashboard.gs — the staff dashboard (web/admin/): overview, attendance
 * corrections, the volunteer hours report and adding volunteers.
 * The dashboard's other sections live in Fundraising.gs, Outings.gs, Trips.gs
 * and Visits.gs; adding and editing trainees is in Trainees.gs.
 *
 * Every action here is leaders-only (Main.gs → routes_). Records keep the
 * volunteer's and trainee's ID; names are looked up when a list is shown, so a
 * renamed person appears with their current name everywhere.
 */

/* ---------- shared helpers for the dashboard sections ---------- */

function has_(p, key) {
  return Object.prototype.hasOwnProperty.call(p, key);
}

/** Who changed a row and when, for the "Updated By / At" columns. */
function stamp_(admin) {
  return { updatedBy: admin.name, updatedAt: fmtDateTime_(now_()) };
}

/** Finds a row by its ID column or throws NOT_FOUND. */
function rowById_(key, idField, value, label) {
  const table = table_(key);
  const id = id_(value, label);
  const row = table.find((r) => r[idField] === id);
  if (!row) throw err_.notFound(`${label} not found.`);
  return { table, row };
}

/** Rejects an update that sends only the ID. */
function requireChanges_(p, idKey) {
  if (!Object.keys(p).some((k) => k !== idKey)) throw err_.validation('Nothing to update.');
}

/** Current names by ID: { users: {U-…: name}, trainees: {T-0001: name} }. */
function nameMaps_() {
  const users = {};
  table_('users').rows().forEach((u) => { if (u.userId) users[u.userId] = u.name; });
  const trainees = {};
  traineeTable_().rows().forEach((t) => { if (t.id) trainees[String(t.id)] = t.name; });
  return { users, trainees };
}

/** A volunteer chosen in a dashboard form. Blank → null when optional. */
function volunteerRef_(value, label, opts) {
  const o = opts || {};
  if ((value === '' || value === null || value === undefined) && o.optional) return null;
  const userId = id_(value, label);
  const user = table_('users').find((u) => u.userId === userId);
  if (!user) throw err_.validation(`${label} is not on the volunteer list.`);
  if (user.status === 'inactive') throw err_.validation(`${user.name} is deactivated. Reactivate them under Volunteers first.`);
  return user;
}

/** A trainee chosen in a dashboard form. */
function traineeRef_(value, label) {
  const trainee = traineeById_(str_(value, label, { required: true, max: 40 }));
  if (!trainee) throw err_.validation(`${label} is not on the trainee list.`);
  return trainee;
}

/** Choices for the dashboard's volunteer and trainee pickers. */
function pickLists_() {
  const volunteers = table_('users').rows()
    .filter((u) => u.userId && u.status !== 'inactive')
    .map((u) => ({ userId: u.userId, name: u.name, email: u.email, role: u.role === 'admin' ? 'admin' : 'volunteer', type: volunteerType_(u) }));
  return { volunteers: sortBy_(volunteers, (v) => String(v.name).toLowerCase()), trainees: traineeList_() };
}

/** Optional from/to dates (YYYY-MM-DD). Either may be blank. */
function dateRange_(p) {
  const from = date_(p.from, 'From date', { optional: true });
  const to = date_(p.to, 'To date', { optional: true });
  if (from && to && to < from) throw err_.validation('The "to" date must be on or after the "from" date.');
  return { from, to, contains: (d) => (!from || String(d) >= from) && (!to || String(d) <= to) };
}

const round2_ = (n) => Math.round(n * 100) / 100;
const sumHours_ = (rows) => round2_(rows.reduce((s, a) => s + (Number(a.hours) || 0), 0));

/* ---------- overview ---------- */

function dashboardOverview_() {
  const today = todayStr_();
  const month = today.slice(0, 7);
  const users = table_('users').rows().filter((u) => u.userId);
  const activeUsers = users.filter((u) => u.status !== 'inactive');
  const trainees = traineeTable_().rows().filter((t) => t.id && t.name);
  const attendance = table_('attendance').rows();
  const done = attendance.filter((a) => a.clockOut);
  const bookings = table_('bookings').rows();
  const sessions = table_('sessions').rows().filter((s) => s.status !== 'cancelled');
  const outings = table_('outings').rows().filter((o) => o.status !== 'cancelled');
  const trips = table_('trips').rows().filter((t) => t.status !== 'cancelled');
  const assignments = table_('outingAssignments').rows();
  const participants = table_('tripParticipants').rows().filter((x) => x.status !== 'withdrawn');
  const orders = table_('orders').rows();

  const upcomingSessions = sortBy_(sessions.filter((s) => s.date >= today), (s) => `${s.date} ${s.startTime}`).slice(0, 5)
    .map((s) => Object.assign(sessionOut_(s), { stats: sessionStats_(s.sessionId, bookings, attendance, today) }));
  const upcomingOutings = sortBy_(outings.filter((o) => o.date >= today), (o) => `${o.date} ${o.startTime}`).slice(0, 5)
    .map((o) => Object.assign(outingOut_(o), { assigned: assignments.filter((a) => a.outingId === o.outingId).length }));
  const upcomingTrips = sortBy_(trips.filter((t) => t.endDate >= today), (t) => t.startDate).slice(0, 5)
    .map((t) => Object.assign(tripOut_(t), { participants: participants.filter((x) => x.tripId === t.tripId).length }));

  return {
    today,
    counts: {
      volunteers: activeUsers.length,
      newVolunteers: activeUsers.filter((u) => volunteerType_(u) !== 'regular').length,
      regulars: activeUsers.filter((u) => volunteerType_(u) === 'regular').length,
      admins: activeUsers.filter((u) => u.role === 'admin').length,
      trainees: trainees.filter(isActiveTrainee_).length,
      sessionsThisMonth: sessions.filter((s) => String(s.date).slice(0, 7) === month).length,
      hoursThisMonth: sumHours_(done.filter((a) => String(a.date).slice(0, 7) === month)),
      hoursTotal: sumHours_(done),
      onSiteNow: attendance.filter((a) => a.date === today && a.clockIn && !a.clockOut).length,
      unpairedUpcoming: bookings.filter((b) => b.status !== 'cancelled' && !b.traineeId && String(b.sessionDate) >= today).length,
      traineesWithoutRegular: (() => {
        const withRegular = regularsByTrainee_();
        return trainees.filter((t) => isActiveTrainee_(t) && !withRegular[String(t.id)]).length;
      })(),
      reviewCount: table_('feedback').filter((f) => f.noteStatus === 'pending' && f.traineeObservation).length,
      openFundraisers: table_('fundraisers').filter((f) => f.status !== 'closed').length,
      unpaidOrders: orders.filter((o) => o.paymentStatus !== 'paid').length,
      visitsThisMonth: table_('houseVisits').filter((v) => String(v.date).slice(0, 7) === month).length,
    },
    upcomingSessions,
    upcomingOutings,
    upcomingTrips,
  };
}

/* ---------- attendance ---------- */

function attendanceRow_(a, names, sessionsById) {
  const s = sessionsById[a.sessionId] || {};
  return {
    attendanceId: a.attendanceId,
    sessionId: a.sessionId,
    sessionTitle: s.title || a.sessionTitle,
    venue: s.venue || '',
    date: a.date,
    userId: a.userId,
    volunteerName: names.users[a.userId] || a.volunteerName,
    clockIn: a.clockIn,
    clockOut: a.clockOut,
    hours: a.clockOut ? Number(a.hours) || 0 : null, // null = still in progress, not counted
    method: a.method,
    editedBy: a.editedBy || '',
    editedAt: a.editedAt || '',
  };
}

/** Attendance records in a date range, newest first, with the sessions in that range. */
function listAttendance_(p) {
  onlyFields_(p, ['from', 'to']);
  const range = dateRange_(p);
  const names = nameMaps_();
  const sessionsById = byKey_(table_('sessions').rows(), 'sessionId');
  const records = sortBy_(table_('attendance').filter((a) => a.attendanceId && range.contains(a.date)), (a) => `${a.date} ${a.clockIn}`)
    .reverse().map((a) => attendanceRow_(a, names, sessionsById));
  const sessions = sortBy_(table_('sessions').filter((s) => s.status !== 'cancelled' && range.contains(s.date)), (s) => `${s.date} ${s.startTime}`)
    .reverse().map(sessionOut_);
  const completed = records.filter((r) => r.hours !== null);
  return {
    today: todayStr_(),
    records,
    sessions,
    totals: { records: records.length, completed: completed.length, inProgress: records.length - completed.length, hours: sumHours_(completed) },
    volunteers: pickLists_().volunteers,
  };
}

/** "HH:mm" on a given date → Date (Singapore time). */
function timeOn_(dateStr, value, label) {
  const hhmm = time_(value, label);
  return parseDateTime_(`${dateStr} ${hhmm}:00`);
}

/**
 * Staff correct a record's times, e.g. a volunteer who forgot to scan out.
 * Hours are worked out again from the two times. Leaving clock-out blank keeps
 * the record open ("In progress"), which is only allowed on the day itself.
 */
function updateAttendance_(p, admin) {
  onlyFields_(p, ['attendanceId', 'clockIn', 'clockOut']);
  const { table, row } = rowById_('attendance', 'attendanceId', p.attendanceId, 'Attendance record');
  const clockIn = timeOn_(row.date, p.clockIn, 'Clock-in time');
  const outText = str_(p.clockOut, 'Clock-out time', { max: 5 });
  const patch = { clockIn: fmtDateTime_(clockIn), editedBy: admin.name, editedAt: fmtDateTime_(now_()) };
  if (outText) {
    const clockOut = timeOn_(row.date, outText, 'Clock-out time');
    if (clockOut.getTime() <= clockIn.getTime()) throw err_.validation('Clock-out must be after clock-in.');
    if (clockOut.getTime() > now_().getTime()) throw err_.validation('Clock-out cannot be in the future.');
    Object.assign(patch, { clockOut: fmtDateTime_(clockOut), hours: hoursBetween_(clockIn, clockOut) });
    if (!row.clockOutBy) patch.clockOutBy = admin.name;
  } else {
    if (row.date !== todayStr_()) throw err_.validation('Enter a clock-out time. Only today\'s records can be left in progress.');
    Object.assign(patch, { clockOut: '', hours: '' });
  }
  if (clockIn.getTime() > now_().getTime()) throw err_.validation('Clock-in cannot be in the future.');
  table.update(row, patch);
  if (patch.clockOut) maybePromote_(row.userId);
  return { record: attendanceRow_(row, nameMaps_(), byKey_(table_('sessions').rows(), 'sessionId')), message: 'Attendance updated.' };
}

/**
 * Staff record attendance for someone who never scanned (e.g. a past session).
 * Uses the volunteer's booking for that session, or adds a confirmed one.
 */
function addAttendance_(p, admin) {
  onlyFields_(p, ['sessionId', 'userId', 'clockIn', 'clockOut']);
  const { row: session } = rowById_('sessions', 'sessionId', p.sessionId, 'Session');
  if (session.status === 'cancelled') throw err_.validation('This session was cancelled.');
  if (session.date > todayStr_()) throw err_.validation('You can only record attendance for today or earlier.');
  const user = volunteerRef_(p.userId, 'Volunteer');
  const clockIn = timeOn_(session.date, p.clockIn, 'Clock-in time');
  const clockOut = timeOn_(session.date, p.clockOut, 'Clock-out time');
  if (clockOut.getTime() <= clockIn.getTime()) throw err_.validation('Clock-out must be after clock-in.');
  if (clockOut.getTime() > now_().getTime()) throw err_.validation('Clock-out cannot be in the future.');
  const attendance = table_('attendance');
  if (attendance.find((a) => a.sessionId === session.sessionId && a.userId === user.userId)) {
    throw err_.conflict(`${user.name} already has attendance for this session. Edit that record instead.`);
  }
  const bookings = table_('bookings');
  let booking = bookings.find((b) => b.sessionId === session.sessionId && b.userId === user.userId && b.status !== 'cancelled');
  const stampNow = fmtDateTime_(now_());
  if (!booking) {
    booking = bookings.insert({
      bookingId: newId_('B'), sessionId: session.sessionId, sessionDate: session.date, sessionTitle: session.title,
      userId: user.userId, volunteerName: user.name, status: 'confirmed', walkIn: 'Yes',
      bookedAt: stampNow, decidedBy: admin.name, decidedAt: stampNow,
    });
  } else if (booking.status === 'pending') {
    bookings.update(booking, { status: 'confirmed', decidedBy: admin.name, decidedAt: stampNow });
  }
  const record = attendance.insert({
    attendanceId: newId_('A'), sessionId: session.sessionId, bookingId: booking.bookingId, userId: user.userId,
    volunteerName: user.name, sessionTitle: session.title, date: session.date,
    clockIn: fmtDateTime_(clockIn), clockOut: fmtDateTime_(clockOut), hours: hoursBetween_(clockIn, clockOut),
    clockInBy: admin.name, clockOutBy: admin.name, method: 'Dashboard', editedBy: admin.name, editedAt: stampNow,
  });
  const promoted = maybePromote_(user.userId);
  return {
    record: attendanceRow_(record, nameMaps_(), byKey_(table_('sessions').rows(), 'sessionId')),
    message: `Recorded ${record.hours} h for ${user.name}.${promoted ? ` ${user.name} is now a regular volunteer.` : ''}`,
  };
}

/* ---------- hours report ---------- */

/** Completed hours per volunteer in a date range, plus each record (for CSV export). */
function hoursReport_(p) {
  onlyFields_(p, ['from', 'to']);
  const range = dateRange_(p);
  const names = nameMaps_();
  const users = byKey_(table_('users').rows().filter((u) => u.userId), 'userId');
  const sessionsById = byKey_(table_('sessions').rows(), 'sessionId');
  const done = sortBy_(table_('attendance').filter((a) => a.clockOut && range.contains(a.date)), (a) => `${a.date} ${a.clockIn}`);
  const per = {};
  done.forEach((a) => {
    const u = users[a.userId] || {};
    const r = per[a.userId] || (per[a.userId] = {
      userId: a.userId, name: names.users[a.userId] || a.volunteerName, email: u.email || '', phone: u.phone || '',
      status: u.status === 'inactive' ? 'inactive' : 'active', sessions: 0, hours: 0, firstDate: a.date, lastDate: a.date,
    });
    r.sessions += 1;
    r.hours = round2_(r.hours + (Number(a.hours) || 0));
    r.lastDate = a.date;
  });
  const volunteers = sortBy_(Object.keys(per).map((k) => per[k]), (r) => String(r.name).toLowerCase());
  return {
    from: range.from,
    to: range.to,
    volunteers,
    records: done.map((a) => attendanceRow_(a, names, sessionsById)),
    totals: { volunteers: volunteers.length, sessions: done.length, hours: sumHours_(done) },
  };
}

/* ---------- volunteers ---------- */

/** Readable temporary password, e.g. "minds-7k2p-9xq4"; the volunteer changes it under Me. */
function tempPassword_() {
  const raw = Utilities.getUuid().replace(/-/g, '').toLowerCase();
  return `minds-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

/**
 * Staff add a volunteer. With createLogin (the default) they get a temporary
 * password to pass on; without it the person is only listed, and can register
 * in the app later with the same email (Auth.gs → register_ links the row).
 */
function createVolunteer_(p, admin) {
  onlyFields_(p, PROFILE_FIELDS.concat(['role', 'createLogin', 'adminPassword']));
  const rec = {
    name: str_(p.name, 'Full name', { required: true, max: LIMITS.SHORT }),
    email: email_(p.email),
    phone: sgPhone_(p.phone, 'Phone', { optional: true }),
    birthday: date_(p.birthday, 'Birthday', { optional: true }),
    telegram: telegram_(p.telegram),
    emergencyName: str_(p.emergencyName, 'Emergency contact name', { max: LIMITS.SHORT }),
    emergencyPhone: sgPhone_(p.emergencyPhone, 'Emergency contact phone', { optional: true }),
    emergencyRelation: str_(p.emergencyRelation, 'Relationship', { max: 50 }),
  };
  if (rec.birthday && rec.birthday > todayStr_()) throw err_.validation('Birthday cannot be in the future.');
  const role = p.role === undefined || p.role === '' ? 'volunteer' : oneOf_(p.role, 'Role', ['volunteer', 'admin']);
  if (role === 'admin') checkAdminPassword_(admin, p.adminPassword, 'Enter the admin password to add someone as an admin.');
  const createLogin = p.createLogin !== false;
  const users = table_('users');
  if (users.find((u) => String(u.email).trim().toLowerCase() === rec.email)) {
    throw err_.conflict('Someone with this email is already on the volunteer list.');
  }
  const user = users.insert(Object.assign(rec, {
    userId: newId_('U'), role, volunteerType: role === 'admin' ? 'regular' : 'volunteer', typeSetBy: role === 'admin' ? 'Made an admin' : '', status: 'active', createdAt: fmtDateTime_(now_()),
  }, stamp_(admin)));
  let tempPassword = '';
  if (createLogin) {
    tempPassword = tempPassword_();
    setPassword_(user.userId, tempPassword);
  }
  return {
    person: personOut_(user, createLogin),
    tempPassword,
    message: createLogin
      ? `${user.name} added. Give them their temporary password; they can change it under Me.`
      : `${user.name} added. They can register in the app with ${user.email} to get a login.`,
  };
}
