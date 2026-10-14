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
    register: { auth: 'public', write: true, fn: register_ },
    login: { auth: 'public', fn: login_ },

    me: { auth: 'user', fn: me_ },
    changePassword: { auth: 'user', write: true, fn: changePassword_ },
    volunteerHome: { auth: 'user', fn: volunteerHome_ },
    bookSession: { auth: 'user', write: true, fn: bookSession_ },
    cancelBooking: { auth: 'user', write: true, fn: cancelBooking_ },
    submitFeedback: { auth: 'user', write: true, fn: submitFeedback_ },

    adminHome: { auth: 'admin', fn: adminHome_ },
    createSession: { auth: 'admin', write: true, fn: createSession_ },
    updateSession: { auth: 'admin', write: true, fn: updateSession_ },
    sessionDetail: { auth: 'admin', fn: sessionDetail_ },
    updateBooking: { auth: 'admin', write: true, fn: updateBooking_ },
    scan: { auth: 'admin', write: true, fn: scan_ },
    scanBatch: { auth: 'admin', write: true, fn: scanBatch_ },
    manualClock: { auth: 'admin', write: true, fn: manualClock_ },
    listPeople: { auth: 'admin', fn: listPeople_ },
    setRole: { auth: 'admin', write: true, fn: setRole_ },
    resetPassword: { auth: 'admin', write: true, fn: resetPassword_ },
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
    if (raw.length > 200000) throw err_.validation('Request is too large.');
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
    const payload = obj_(body.payload, 'Payload');

    let user = null;
    if (route.auth !== 'public') {
      user = requireUser_(body.token);
      if (route.auth === 'admin' && user.role !== 'admin') throw err_.forbidden();
    }
    const run = () => route.fn(payload, user);
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
