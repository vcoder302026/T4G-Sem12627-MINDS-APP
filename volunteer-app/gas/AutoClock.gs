/**
 * AutoClock.gs — automatic clock-out (31 Oct testing feedback).
 *
 * A volunteer who forgets to scan out leaves an open attendance record, and open
 * records count for no hours until an admin fixes them. Once an hour, an Apps
 * Script trigger runs autoClockOut(): every record still open
 * CONFIG.AUTO_CLOCK_OUT_AFTER_MINUTES after its session ended is clocked out at
 * the session's end time (or AUTO_CLOCK_OUT_DEFAULT_END when there is no session),
 * marked "Automatic (session end)" so admins can find it and correct the time
 * in Attendance as usual.
 *
 * Turn it on or off from the app: Admin → Settings → Advanced settings →
 * "Turn on automatic clock-out". (That creates the hourly trigger; it needs the
 * script.scriptapp permission in appsscript.json, so the account the app runs as
 * approves it once after this update is deployed.)
 */

const AUTO_CLOCK_BY = 'Automatic (session end)';

/** The trigger's entry point (no trailing underscore, so Apps Script can call it). */
function autoClockOut() {
  resetDbCache_();
  PEOPLE_CHANGED_ = false;
  TOUCHED_TABLES_ = {};
  IN_LOCK_ = false;
  TABLE_CACHE_ON_ = null;
  const out = withLock_(() => autoClockOutInternal_());
  bumpTouchedTables_();
  if (out.closed.length) {
    bumpDataVersion_(); // pages open on admins' phones pick up the new times
    if (PEOPLE_CHANGED_) bumpPeopleVersion_(); // someone became a regular
    try {
      logAdminAction_({ userId: '', name: 'Automatic' }, 'autoClockOut', {}, out);
    } catch (e) { console.error(e); }
  }
  console.log(out.report);
  return out.report;
}

/** Clocks out every overdue open record. Returns { closed, skipped, report }. Runs inside the lock. */
function autoClockOutInternal_() {
  const attendance = table_('attendance');
  const sessionById = byKey_(table_('sessions').rows(), 'sessionId');
  const now = now_();
  const graceMs = (Number(CONFIG.AUTO_CLOCK_OUT_AFTER_MINUTES) || 0) * 60000;
  const closed = [];
  const skipped = [];
  attendance.filter((a) => a.clockIn && !a.clockOut).forEach((a) => {
    const s = sessionById[a.sessionId];
    const endTime = (s && s.endTime) || CONFIG.AUTO_CLOCK_OUT_DEFAULT_END;
    const end = parseDateTime_(`${a.date} ${endTime}:00`);
    const clockIn = parseDateTime_(a.clockIn);
    if (!end || !clockIn) { skipped.push(a); return; }
    if (now.getTime() < end.getTime() + graceMs) return; // the session isn't over yet
    // Clocked in after the session ended: there's no sensible time to use, so an admin decides.
    if (end.getTime() <= clockIn.getTime()) { skipped.push(a); return; }
    attendance.update(a, {
      clockOut: fmtDateTime_(end),
      hours: hoursBetween_(clockIn, end),
      clockOutBy: AUTO_CLOCK_BY,
      method: a.method ? `${a.method} / Auto` : 'Auto',
    });
    maybePromote_(a.userId);
    closed.push(a);
  });
  const names = (rows) => rows.map((a) => `${a.volunteerName} (${a.date})`).join(', ');
  let report = closed.length
    ? `Clocked out ${closed.length} volunteer${closed.length === 1 ? '' : 's'} at their session's end time: ${names(closed)}.`
    : 'Nobody to clock out.';
  if (skipped.length) report += ` Left for an admin (clocked in after the session ended, or times unreadable): ${names(skipped)}.`;
  return { closed: closed.map((a) => a.attendanceId), skipped: skipped.map((a) => a.attendanceId), report };
}

/** Creates the hourly trigger (replacing any earlier one). Advanced settings → Turn on automatic clock-out. */
function installAutoClockOut_() {
  removeAutoClockOut_();
  ScriptApp.newTrigger('autoClockOut').timeBased().everyHours(1).create();
  // Close anything already overdue. Advanced settings already holds the lock (Main.gs), so call the inside directly.
  const now = autoClockOutInternal_().report;
  return `Automatic clock-out is on: every hour, volunteers still clocked in ${CONFIG.AUTO_CLOCK_OUT_AFTER_MINUTES} minutes after their session ends are clocked out at the session's end time. ${now}`;
}

/** Removes the hourly trigger. Advanced settings → Turn off automatic clock-out. */
function removeAutoClockOut_() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'autoClockOut') { ScriptApp.deleteTrigger(t); removed += 1; }
  });
  return removed ? 'Automatic clock-out is off.' : 'Automatic clock-out was already off.';
}
