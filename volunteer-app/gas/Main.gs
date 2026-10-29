/**
 * Main.gs — the web app entry point (Deploy → Web app; Execute as: Me;
 * Who has access: Anyone).
 *
 * The PWA sends   POST { action, token, payload }   as text/plain (which
 * avoids a CORS preflight that Apps Script cannot answer) and always gets
 *   { ok: true, data }   or   { ok: false, error: { code, message } }.
 * Apps Script cannot set HTTP status codes, so errors travel in the body.
 */

function routes_() {
  // auth: public | user | admin.  write: runs under a script lock so two phones
  // scanning at the same moment cannot both append to the same row.
  return {
    ping: { auth: 'public', fn: () => ({ status: 'ok', time: fmtDateTime_(now_()) }) },
    registrationForm: { auth: 'public', fn: registrationForm_ }, // the questions on the sign-up form (Config.gs → REGISTRATION)
    register: { auth: 'public', write: true, fn: register_ },
    login: { auth: 'public', fn: login_ },

    me: { auth: 'user', fn: me_ },
    changePassword: { auth: 'user', write: true, fn: changePassword_ },
    updateProfile: { auth: 'user', write: true, fn: updateProfile_ },
    volunteerHome: { auth: 'user', fn: volunteerHome_ },
    bookSession: { auth: 'user', write: true, fn: bookSession_ },
    bookSessions: { auth: 'user', write: true, fn: bookSessions_ },
    cancelBooking: { auth: 'user', write: true, fn: cancelBooking_ },
    submitFeedback: { auth: 'user', write: true, fn: submitFeedback_ },
    guide: { auth: 'user', fn: guide_ },
    acknowledgeGuide: { auth: 'user', write: true, fn: acknowledgeGuide_ },
    // Trainee details for volunteers (TraineeInfo.gs): regulars see any trainee, volunteers their paired one
    traineeInfo: { auth: 'user', fn: traineeInfo_ },
    traineeDirectory: { auth: 'user', fn: traineeDirectory_ },
    submitTraineeUpdate: { auth: 'user', write: true, fn: submitTraineeUpdate_ },
    noteFile: { auth: 'user', fn: noteFile_ }, // a file attached to a note (NoteFiles.gs)
    changes: { auth: 'user', fn: changes_ }, // "has anything changed?" for live updates (Speed.gs)

    adminHome: { auth: 'admin', fn: adminHome_ },
    createSession: { auth: 'admin', write: true, fn: createSession_ },
    createSessions: { auth: 'admin', write: true, fn: createSessions_ }, // the same session on several dates
    updateSession: { auth: 'admin', write: true, fn: updateSession_ },
    sessionDetail: { auth: 'admin', fn: sessionDetail_ },
    updateBooking: { auth: 'admin', write: true, fn: updateBooking_ },
    addWalkIn: { auth: 'admin', write: true, fn: addWalkIn_ },
    scan: { auth: 'admin', write: true, fn: scan_ },
    scanBatch: { auth: 'admin', write: true, fn: scanBatch_ },
    manualClock: { auth: 'admin', write: true, fn: manualClock_ },
    listPeople: { auth: 'admin', fn: listPeople_ },
    setRole: { auth: 'admin', write: true, fn: setRole_ },
    personDetail: { auth: 'admin', fn: personDetail_ },
    updatePerson: { auth: 'admin', write: true, fn: updatePerson_ },
    resetPassword: { auth: 'admin', write: true, fn: resetPassword_ },
    // Volunteer types and regular pairings (Pairing.gs)
    setVolunteerType: { auth: 'admin', write: true, fn: setVolunteerType_ },
    listStandingPairings: { auth: 'admin', fn: listStandingPairings_ },
    setStandingPairing: { auth: 'admin', write: true, fn: setStandingPairing_ },
    changeAdminPassword: { auth: 'admin', write: true, fn: changeAdminPassword_ },
    maintenanceTasks: { auth: 'admin', fn: maintenanceTasks_ }, // Advanced Settings (Maintenance.gs)
    dataSources: { auth: 'admin', fn: dataSources_ }, // Settings → Google Sheets (DataSources.gs)
    searchSheets: { auth: 'admin', fn: searchSheets_ },
    connectDataSource: { auth: 'admin', write: true, fn: connectDataSource_ },
    createDataSource: { auth: 'admin', write: true, fn: createDataSource_ },
    unlinkDataSource: { auth: 'admin', write: true, fn: unlinkDataSource_ },
    runMaintenance: { auth: 'admin', write: true, fn: runMaintenance_ },
    syncContact: { auth: 'admin', write: true, fn: syncContactNow_ }, // save one volunteer to Google Contacts now
    pairingHistory: { auth: 'admin', fn: pairingHistory_ },
    // What volunteers see about trainees (TraineeInfo.gs) and the activity log (AdminLog.gs)
    visibilitySettings: { auth: 'admin', fn: visibilitySettings_ },
    saveVisibility: { auth: 'admin', write: true, fn: saveVisibility_ },
    setTraineePhoto: { auth: 'admin', write: true, fn: setTraineePhoto_ },
    listAdminLog: { auth: 'admin', fn: listAdminLog_ },

    listTrainees: { auth: 'admin', fn: listTrainees_ },
    traineeDetail: { auth: 'admin', fn: traineeDetail_ },
    addTraineeNote: { auth: 'admin', write: true, fn: addTraineeNote_ },
    setNoteStatus: { auth: 'admin', write: true, fn: setNoteStatus_ }, // older app versions; setNoteSharing replaces it
    setNoteSharing: { auth: 'admin', write: true, fn: setNoteSharing_ }, // all / regulars / selected volunteers / private
    reviewQueue: { auth: 'admin', fn: reviewQueue_ },
    reviewObservation: { auth: 'admin', write: true, fn: reviewObservation_ },

    leaderContent: { auth: 'admin', fn: contentForLeaders_ },
    listVenues: { auth: 'admin', fn: listVenues_ },
    saveVenue: { auth: 'admin', write: true, fn: saveVenue_ },
    saveProject: { auth: 'admin', write: true, fn: saveProject_ },
    saveGuideSection: { auth: 'admin', write: true, fn: saveGuideSection_ },
    deleteGuideSection: { auth: 'admin', write: true, fn: deleteGuideSection_ },
    addGuideFile: { auth: 'admin', write: true, fn: addGuideFile_ }, // infographic: upload, or a Google Drive link
    moveContent: { auth: 'admin', write: true, fn: moveContent_ },
    reorderContent: { auth: 'admin', write: true, fn: reorderContent_ }, // drag and drop: the whole new order

    // Staff dashboard (web/admin/). Overview, attendance, hours, volunteers: Dashboard.gs
    dashboardOverview: { auth: 'admin', fn: dashboardOverview_ },
    listAttendance: { auth: 'admin', fn: listAttendance_ },
    addAttendance: { auth: 'admin', write: true, fn: addAttendance_ },
    updateAttendance: { auth: 'admin', write: true, fn: updateAttendance_ },
    hoursReport: { auth: 'admin', fn: hoursReport_ },
    createVolunteer: { auth: 'admin', write: true, fn: createVolunteer_ },
    // Trainees.gs
    listTraineeRecords: { auth: 'admin', fn: listTraineeRecords_ },
    traineeProfile: { auth: 'admin', fn: traineeProfile_ },
    createTrainee: { auth: 'admin', write: true, fn: createTrainee_ },
    updateTrainee: { auth: 'admin', write: true, fn: updateTrainee_ },
    // Fundraising.gs
    listFundraisers: { auth: 'admin', fn: listFundraisers_ },
    fundraiserDetail: { auth: 'admin', fn: fundraiserDetail_ },
    createFundraiser: { auth: 'admin', write: true, fn: createFundraiser_ },
    updateFundraiser: { auth: 'admin', write: true, fn: updateFundraiser_ },
    saveProduct: { auth: 'admin', write: true, fn: saveProduct_ },
    createOrder: { auth: 'admin', write: true, fn: createOrder_ },
    updateOrder: { auth: 'admin', write: true, fn: updateOrder_ },
    // Outings.gs
    listOutings: { auth: 'admin', fn: listOutings_ },
    outingDetail: { auth: 'admin', fn: outingDetail_ },
    createOuting: { auth: 'admin', write: true, fn: createOuting_ },
    updateOuting: { auth: 'admin', write: true, fn: updateOuting_ },
    assignOutingTrainee: { auth: 'admin', write: true, fn: assignOutingTrainee_ },
    updateOutingAssignment: { auth: 'admin', write: true, fn: updateOutingAssignment_ },
    // Trips.gs
    listTrips: { auth: 'admin', fn: listTrips_ },
    tripDetail: { auth: 'admin', fn: tripDetail_ },
    createTrip: { auth: 'admin', write: true, fn: createTrip_ },
    updateTrip: { auth: 'admin', write: true, fn: updateTrip_ },
    addTripParticipant: { auth: 'admin', write: true, fn: addTripParticipant_ },
    updateTripParticipant: { auth: 'admin', write: true, fn: updateTripParticipant_ },
    addTripLogistics: { auth: 'admin', write: true, fn: addTripLogistics_ },
    updateTripLogistics: { auth: 'admin', write: true, fn: updateTripLogistics_ },
    addTripExpense: { auth: 'admin', write: true, fn: addTripExpense_ },
    // Visits.gs
    listVisits: { auth: 'admin', fn: listVisits_ },
    houseVisitForm: { auth: 'admin', fn: houseVisitForm_ }, // the House Visit Form, prefilled (Visits.gs)
    createVisit: { auth: 'admin', write: true, fn: createVisit_ },
  };
}

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
    // Uploads (a guide infographic, sent as base64) may be large; everything else is small.
    if (raw.length > 15000000) throw err_.validation('Request is too large.');
    let body;
    try {
      body = JSON.parse(raw);
    } catch (parseError) {
      throw err_.validation('Request is not valid JSON.');
    }
    if (!body || typeof body !== 'object' || typeof body.action !== 'string') throw err_.validation('Missing action.');
    // Uploads: guide files, and files attached to notes and updates (NoteFiles.gs).
    const uploads = ['addGuideFile', 'setTraineePhoto', 'submitTraineeUpdate', 'submitFeedback', 'addTraineeNote'];
    if (uploads.indexOf(body.action) === -1 && raw.length > 200000) throw err_.validation('Request is too large.');
    const routes = routes_();
    if (!Object.prototype.hasOwnProperty.call(routes, body.action)) throw err_.notFound(`Unknown action "${body.action}".`);
    const route = routes[body.action];
    const payload = obj_(body.payload, 'Payload');

    let user = null;
    if (route.auth !== 'public') {
      user = requireUser_(body.token);
      if (route.auth === 'admin' && user.role !== 'admin') throw err_.forbidden();
    }
    const run = () => {
      const out = route.fn(payload, user);
      // New or edited volunteers go to Google Contacts when CONTACTS_SYNC is on (Contacts.gs). Never fails the request.
      const contactUserId = contactSyncTarget_(body.action, payload, user, out);
      if (contactUserId) {
        const contact = syncContactSafe_(contactUserId);
        if (contact && out && typeof out === 'object') out.contact = contact;
      }
      // Every change an admin makes goes in the Admin Activity Log (AdminLog.gs), in the same lock.
      if (route.auth === 'admin' && route.write) logAdminAction_(user, body.action, payload, out);
      return out;
    };
    // Admin pages that look the same for every admin come from the cache until something changes (Speed.gs).
    const shared = route.write ? '' : sharedReadKey_(body.action, payload, user);
    if (shared) return { ok: true, data: cachedForVersion_(shared, () => applyDisplayNames_(body.action, run())) };
    const data = route.write ? withLock_(run) : run();
    if (route.write) bumpDataVersion_(); // every save makes cached copies out of date
    return { ok: true, data: applyDisplayNames_(body.action, data) }; // short names (DisplayNames.gs)
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
