/**
 * Main.gs — the web app entry point (Deploy → Web app; Execute as: Me;
 * Who has access: Anyone).
 *
 * The PWA sends   POST { action, token, adminToken, payload }   as text/plain
 * (which avoids a CORS preflight that Apps Script cannot answer) and always gets
 *   { ok: true, data }   or   { ok: false, error: { code, message } }.
 * Apps Script cannot set HTTP status codes, so errors travel in the body.
 *
 * Access levels:
 *   public  anyone (register, sign in)
 *   user    any signed-in volunteer
 *   admin   a signed-in volunteer who has unlocked Admin with the shared MINDS
 *           admin password (AdminAccess.gs). Every admin change is written to
 *           the Admin Log tab with that person's name.
 */

function routes_() {
  // write: runs under a script lock so two phones scanning at the same moment
  // cannot both append to the same row. label: how an admin change reads in the Admin Log.
  const w = (fn, label, extra) => Object.assign({ auth: 'admin', write: true, fn, label }, extra || {});
  const r = (fn) => ({ auth: 'admin', fn });
  return {
    ping: { auth: 'public', fn: () => ({ status: 'ok', time: fmtDateTime_(now_()) }) },
    register: { auth: 'public', write: true, fn: register_ },
    login: { auth: 'public', fn: login_ },

    // every volunteer
    me: { auth: 'user', fn: me_ },
    changePassword: { auth: 'user', write: true, fn: changePassword_ },
    updateProfile: { auth: 'user', write: true, fn: updateProfile_ },
    volunteerHome: { auth: 'user', fn: volunteerHome_ },
    bookSession: { auth: 'user', write: true, fn: bookSession_ },
    signUpSessions: { auth: 'user', write: true, fn: signUpSessions_ },
    cancelBooking: { auth: 'user', write: true, fn: cancelBooking_ },
    submitFeedback: { auth: 'user', write: true, fn: submitFeedback_ },
    guide: { auth: 'user', fn: guide_ },
    acknowledgeGuide: { auth: 'user', write: true, fn: acknowledgeGuide_ },
    myTrainees: { auth: 'user', fn: volunteerTrainees_ },
    myTrainee: { auth: 'user', fn: volunteerTrainee_ },
    submitTraineeUpdate: { auth: 'user', write: true, fn: submitTraineeUpdate_ },
    getFile: { auth: 'user', fn: getFile_ },
    adminUnlock: { auth: 'user', write: true, fn: adminUnlock_ },
    adminStatus: { auth: 'user', fn: adminStatus_ },

    // admin: sessions, pairing and attendance
    adminHome: r(adminHome_),
    createSession: w(createSession_, 'Created a session'),
    updateSession: w(updateSession_, 'Edited a session'),
    sessionDetail: r(sessionDetail_),
    updateBooking: w(updateBooking_, 'Changed a pairing'),
    pairUnpaired: w(pairUnpaired_, 'Paired volunteers automatically'),
    scan: w(scan_, 'Scanned a QR pass'),
    scanBatch: w(scanBatch_, 'Uploaded offline scans'),
    manualClock: w(manualClock_, 'Clocked a volunteer in/out by hand'),
    listPairs: r(listPairs_),
    addPair: w(addPair_, 'Added a regular pair'),
    endPair: w(endPair_, 'Ended a regular pair'),
    importPairs: w(importPairs_, 'Imported pairs'),

    // admin: people
    listPeople: r(listPeople_),
    personDetail: r(personDetail_),
    updatePerson: w(updatePerson_, 'Edited a volunteer'),
    resetPassword: w(resetPassword_, 'Reset a volunteer\'s password'),
    createVolunteer: w(createVolunteer_, 'Added a volunteer'),
    syncContacts: w(syncContacts_, 'Synced Google Contacts'),

    // admin: trainees and notes
    listTrainees: r(listTrainees_),
    traineeDetail: r(traineeDetail_),
    addTraineeNote: w(addTraineeNote_, 'Added a trainee note'),
    setNoteStatus: w(setNoteStatus_, 'Showed/hid a trainee note'),
    reviewQueue: r(reviewQueue_),
    reviewObservation: w(reviewObservation_, 'Reviewed a volunteer note'),
    listTraineeRecords: r(listTraineeRecords_),
    traineeProfile: r(traineeProfile_),
    createTrainee: w(createTrainee_, 'Added a trainee'),
    updateTrainee: w(updateTrainee_, 'Edited a trainee'),
    uploadTraineePhoto: w(uploadTraineePhoto_, 'Uploaded a trainee photo', { upload: true }),
    removeTraineePhoto: w(removeTraineePhoto_, 'Removed a trainee photo'),
    listTraineeUpdates: r(listTraineeUpdates_),

    // admin: guide, venues, projects
    leaderContent: r(contentForLeaders_),
    listVenues: r(listVenues_),
    saveVenue: w(saveVenue_, 'Saved a venue'),
    saveProject: w(saveProject_, 'Saved a project'),
    saveGuideSection: w(saveGuideSection_, 'Edited the Volunteer Guide'),
    deleteGuideSection: w(deleteGuideSection_, 'Deleted a guide section'),
    moveContent: w(moveContent_, 'Reordered the guide/projects'),
    uploadGuideMedia: w(uploadGuideMedia_, 'Added a guide picture/PDF', { upload: true }),
    removeGuideMedia: w(removeGuideMedia_, 'Removed a guide picture/PDF'),

    // admin: settings and the admin log
    adminSettings: r(adminSettings_),
    changeAdminPassword: w(changeAdminPassword_, 'Changed the admin password'),
    adminSignOutAll: w(adminSignOutAll_, 'Signed out every admin device'),
    adminLock: w(adminLock_, 'Left admin'),
    saveDataSource: w(saveDataSource_, 'Changed a database link'),
    saveFieldAccess: w(saveFieldAccess_, 'Changed what volunteers see'),
    listAdminLog: r(listAdminLog_),

    // admin: overview, attendance, hours (Dashboard.gs)
    dashboardOverview: r(dashboardOverview_),
    listAttendance: r(listAttendance_),
    addAttendance: w(addAttendance_, 'Added attendance by hand'),
    updateAttendance: w(updateAttendance_, 'Fixed attendance times'),
    hoursReport: r(hoursReport_),
    // Fundraising.gs
    listFundraisers: r(listFundraisers_),
    fundraiserDetail: r(fundraiserDetail_),
    createFundraiser: w(createFundraiser_, 'Created a fundraiser'),
    updateFundraiser: w(updateFundraiser_, 'Edited a fundraiser'),
    saveProduct: w(saveProduct_, 'Saved a product'),
    createOrder: w(createOrder_, 'Took an order'),
    updateOrder: w(updateOrder_, 'Updated an order'),
    // Outings.gs
    listOutings: r(listOutings_),
    outingDetail: r(outingDetail_),
    createOuting: w(createOuting_, 'Created an outing'),
    updateOuting: w(updateOuting_, 'Edited an outing'),
    assignOutingTrainee: w(assignOutingTrainee_, 'Assigned an outing trainee'),
    updateOutingAssignment: w(updateOutingAssignment_, 'Updated an outing assignment'),
    // Trips.gs
    listTrips: r(listTrips_),
    tripDetail: r(tripDetail_),
    createTrip: w(createTrip_, 'Created a trip'),
    updateTrip: w(updateTrip_, 'Edited a trip'),
    addTripParticipant: w(addTripParticipant_, 'Added a trip participant'),
    updateTripParticipant: w(updateTripParticipant_, 'Updated a trip participant'),
    addTripLogistics: w(addTripLogistics_, 'Added a trip checklist item'),
    updateTripLogistics: w(updateTripLogistics_, 'Updated a trip checklist item'),
    addTripExpense: w(addTripExpense_, 'Added a trip expense'),
    // Visits.gs
    listVisits: r(listVisits_),
    createVisit: w(createVisit_, 'Recorded a house visit'),
  };
}

const MAX_REQUEST_CHARS = 200000;

function doGet() {
  return json_({ ok: true, data: { status: 'ok', app: 'MINDS Volunteer API' } });
}

function doPost(e) {
  return json_(handle_(e));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(e) {
  resetDbCache_();
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw) throw err_.validation('Empty request.');
    if (raw.length > uploadMaxChars_()) throw err_.validation('Request is too large.');
    let body;
    try {
      body = JSON.parse(raw);
    } catch (parseError) {
      throw err_.validation('Request is not valid JSON.');
    }
    if (!body || typeof body !== 'object' || typeof body.action !== 'string') throw err_.validation('Missing action.');
    const routes = routes_();
    if (!Object.prototype.hasOwnProperty.call(routes, body.action)) throw err_.notFound(`Unknown action "${body.action}".`);
    const route = routes[body.action];
    if (!route.upload && raw.length > MAX_REQUEST_CHARS) throw err_.validation('Request is too large.');
    const payload = obj_(body.payload, 'Payload');

    let user = null;
    const ctx = { isAdmin: false };
    if (route.auth !== 'public') {
      user = requireUser_(body.token);
      ctx.isAdmin = adminSessionValid_(body.adminToken, user);
      if (route.auth === 'admin' && !ctx.isAdmin) {
        throw new AppError('ADMIN_REQUIRED', body.adminToken
          ? 'Your admin access has ended. Enter the MINDS admin password again.'
          : 'Enter the MINDS admin password to use admin features.');
      }
    }
    const run = () => {
      const out = route.fn(payload, user, ctx);
      if (route.auth === 'admin' && route.write) logAdmin_(user, route.label || body.action, logDetails_(payload, out));
      return out;
    };
    return { ok: true, data: route.write ? withLock_(run) : run() };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: { code: error.code, message: error.message } };
    console.error(error && error.stack ? error.stack : error);
    return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server. Please try again.' } };
  }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new AppError('BUSY', 'The system is busy. Please try again in a moment.');
  try {
    resetDbCache_(); // re-read inside the lock so checks (capacity, duplicates) see the latest rows
    const out = fn();
    SpreadsheetApp.flush();
    return out;
  } finally {
    lock.releaseLock();
  }
}

/** Uploads are sent as base64 (4 characters per 3 bytes) plus a little JSON. */
function uploadMaxChars_() {
  return Math.ceil(CONFIG.UPLOAD_MAX_MB * 1024 * 1024 * 4 / 3) + 20000;
}

/**
 * What goes in the Admin Log's Details column: the result's message, plus the
 * IDs the change was about. Never passwords or other free text from the request.
 */
function logDetails_(payload, out) {
  const ids = Object.keys(payload || {})
    .filter((k) => /Id$/.test(k) || ['status', 'decision', 'kind', 'direction', 'key'].indexOf(k) >= 0)
    .filter((k) => typeof payload[k] === 'string' || typeof payload[k] === 'number')
    .map((k) => `${k}: ${String(payload[k]).slice(0, 60)}`);
  const message = out && typeof out.message === 'string' ? out.message : '';
  return [message, ids.length ? `(${ids.join(', ')})` : ''].filter(Boolean).join(' ').slice(0, 1000);
}
