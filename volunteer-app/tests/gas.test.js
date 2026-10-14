// End-to-end tests of the Apps Script backend, run in Node against the
// in-memory spreadsheet in dev/gas-harness.js.  Run: npm test

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { createGasRuntime } from '../dev/gas-harness.js';

const SHEET = 'sheet-1';
const TODAY = '2026-10-14';
const at = (hhmm) => `${TODAY}T${hhmm}:00+08:00`;

function volunteerPayload(overrides = {}) {
  return {
    name: 'Vol One',
    birthday: '2001-05-06',
    email: 'v1@example.com',
    phone: '+65 9123 4567',
    telegram: '@vol_one',
    emergencyName: 'Parent One',
    emergencyPhone: '+65 8123 4567',
    emergencyRelation: 'Mother',
    password: 'password123',
    consent: true,
    ...overrides,
  };
}

function ok(res) {
  assert.equal(res.ok, true, `expected ok, got ${JSON.stringify(res.error)}`);
  return res.data;
}
function fails(res, code) {
  assert.equal(res.ok, false, `expected ${code}, got ok`);
  assert.equal(res.error.code, code, res.error.message);
  return res.error;
}

let rt;
let leader; // token
let vol; // { token, user }

beforeEach(() => {
  rt = createGasRuntime();
  rt.createSpreadsheet(SHEET, 'MINDS Volunteer Data');
  // An "existing" MINDS trainee list: different column order, extra columns, no ID column, a typed date.
  rt.fillTab(SHEET, 'Trainees', [
    ['Programme', 'Name', 'Interests', 'Date Joined', 'Medical Notes', 'Support Needs'],
    ['Day Activity', 'Alex Tan', 'Music, puzzles', '2024-03-01', 'Epilepsy plan on file', 'Needs verbal prompts'],
    ['Day Activity', 'Bea Lim', 'Drawing', '2023-07-15', '', ''],
  ]);
  rt.props.set('SPREADSHEET_ID', SHEET);
  rt.setNow(at('09:00'));
  rt.run('setup');

  ok(rt.call('register', volunteerPayload({ name: 'Leader Lee', email: 'leader@example.com', telegram: '' })));
  rt.props.set('FIRST_ADMIN_EMAIL', 'leader@example.com');
  rt.run('makeFirstAdmin');
  leader = ok(rt.call('login', { email: 'leader@example.com', password: 'password123' })).token;
  vol = ok(rt.call('register', volunteerPayload()));
});

function createSession(fields = {}) {
  return ok(rt.call('createSession', { title: 'Art & Craft', date: TODAY, startTime: '10:00', endTime: '12:00', venue: 'MINDS Clementi', capacity: 2, ...fields }, leader)).session;
}

describe('linking to an existing sheet', () => {
  test('setup keeps existing trainee columns and data, adds IDs and write-back columns only', () => {
    const [headers, ...rows] = rt.tab(SHEET, 'Trainees').dump();
    assert.deepEqual(headers.slice(0, 6), ['Programme', 'Name', 'Interests', 'Date Joined', 'Medical Notes', 'Support Needs']);
    assert.deepEqual(headers.slice(6), ['Trainee ID', 'Latest Volunteer Observation', 'Observation Updated']);
    assert.equal(rows[0][1], 'Alex Tan');
    assert.equal(rows[0][6], 'T-0001');
    assert.equal(rows[1][6], 'T-0002');
  });

  test('setup is safe to re-run and checkConfig changes nothing', () => {
    const before = JSON.stringify(rt.tab(SHEET, 'Trainees').dump());
    rt.run('setup');
    assert.match(rt.run('checkConfig'), /"Trainees" is ready/);
    assert.equal(JSON.stringify(rt.tab(SHEET, 'Trainees').dump()), before);
  });

  test('values stay exactly as typed in the sheet (no date/number auto-conversion)', () => {
    const row = rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'v1@example.com');
    assert.equal(row.Birthday, '2001-05-06');
    assert.equal(row.Phone.trim(), '+65 9123 4567');
    assert.equal(row.Telegram, 'vol_one');
    const auth = rt.tab(SHEET, '_Auth');
    assert.equal(auth.isSheetHidden(), true);
  });

  test('formula-like input is stored as text', () => {
    ok(rt.call('register', volunteerPayload({ email: 'x@example.com', name: '=HYPERLINK("http://evil")' })));
    const row = rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'x@example.com');
    assert.ok(!String(row['Full Name']).startsWith('#FORMULA'));
  });

  test('a volunteer already on the list is linked, not duplicated, when they register', () => {
    rt.fillTab(SHEET, 'Volunteers', [[], [], [], ['', 'Old Timer', '', 'old@example.com', '', '', '', '', '', 'admin']]);
    const res = ok(rt.call('register', volunteerPayload({ name: 'Old Timer', email: 'old@example.com' })));
    const matches = rt.records(SHEET, 'Volunteers').filter((r) => r.Email === 'old@example.com');
    assert.equal(matches.length, 1);
    assert.match(matches[0]['User ID'], /^U-/);
    assert.equal(res.user.role, 'volunteer', 'claiming a pre-listed row must not grant leader access');
    fails(rt.call('adminHome', {}, res.token), 'FORBIDDEN');
  });
});

describe('accounts and roles', () => {
  test('registration validates and rejects duplicates', () => {
    fails(rt.call('register', volunteerPayload({ email: 'v1@example.com' })), 'CONFLICT');
    fails(rt.call('register', volunteerPayload({ email: 'new@example.com', consent: false })), 'VALIDATION_ERROR');
    fails(rt.call('register', volunteerPayload({ email: 'new@example.com', phone: 'abc' })), 'VALIDATION_ERROR');
    fails(rt.call('register', volunteerPayload({ email: 'new@example.com', password: 'short' })), 'VALIDATION_ERROR');
    fails(rt.call('register', volunteerPayload({ email: 'new@example.com', isAdmin: true })), 'VALIDATION_ERROR');
  });

  test('login, wrong password, lockout after repeated failures', () => {
    fails(rt.call('login', { email: 'v1@example.com', password: 'nope-nope' }), 'UNAUTHORIZED');
    ok(rt.call('login', { email: 'V1@Example.com', password: 'password123' }));
    for (let i = 0; i < 5; i++) rt.call('login', { email: 'v1@example.com', password: 'wrong-pass' });
    fails(rt.call('login', { email: 'v1@example.com', password: 'password123' }), 'TOO_MANY_ATTEMPTS');
  });

  test('tampered or missing tokens are rejected; volunteers cannot use leader actions', () => {
    fails(rt.call('me', {}), 'UNAUTHORIZED');
    const parts = vol.token.split('.');
    parts[1] = 'U-SOMEONE';
    fails(rt.call('me', {}, parts.join('.')), 'UNAUTHORIZED');
    fails(rt.call('adminHome', {}, vol.token), 'FORBIDDEN');
    fails(rt.call('scan', { code: 'x' }, vol.token), 'FORBIDDEN');
  });

  test('promotion takes effect immediately; last leader cannot be removed', () => {
    ok(rt.call('setRole', { userId: vol.user.userId, role: 'admin' }, leader));
    ok(rt.call('adminHome', {}, vol.token));
    const leaderId = ok(rt.call('me', {}, leader)).user.userId;
    fails(rt.call('setRole', { userId: leaderId, role: 'volunteer' }, leader), 'CONFLICT'); // self
    ok(rt.call('setRole', { userId: leaderId, role: 'volunteer' }, vol.token));
    fails(rt.call('setRole', { userId: vol.user.userId, role: 'volunteer' }, vol.token), 'CONFLICT'); // last one
  });

  test('password reset gives a temp password and signs the volunteer out everywhere', () => {
    const { tempPassword } = ok(rt.call('resetPassword', { userId: vol.user.userId }, leader));
    fails(rt.call('me', {}, vol.token), 'UNAUTHORIZED');
    const fresh = ok(rt.call('login', { email: 'v1@example.com', password: tempPassword })).token;
    const changed = ok(rt.call('changePassword', { currentPassword: tempPassword, newPassword: 'brand-new-pass' }, fresh));
    ok(rt.call('me', {}, changed.token));
  });
});

describe('sessions, booking and trainee pairing', () => {
  test('book → capacity → cancel → confirm with trainee → volunteer sees only allowed trainee fields', () => {
    const s = createSession();
    const home = ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token)).home;
    assert.equal(home.upcoming[0].status, 'pending');
    fails(rt.call('bookSession', { sessionId: s.sessionId }, vol.token), 'CONFLICT');

    const v2 = ok(rt.call('register', volunteerPayload({ email: 'v2@example.com', name: 'Vol Two' })));
    const v3 = ok(rt.call('register', volunteerPayload({ email: 'v3@example.com', name: 'Vol Three' })));
    ok(rt.call('bookSession', { sessionId: s.sessionId }, v2.token));
    fails(rt.call('bookSession', { sessionId: s.sessionId }, v3.token), 'CONFLICT'); // full (capacity 2)
    const b2 = ok(rt.call('volunteerHome', {}, v2.token)).upcoming[0].bookingId;
    ok(rt.call('cancelBooking', { bookingId: b2 }, v2.token));
    ok(rt.call('bookSession', { sessionId: s.sessionId }, v3.token)); // spot freed

    const bookingId = home.upcoming[0].bookingId;
    const detail = ok(rt.call('updateBooking', { bookingId, status: 'confirmed', traineeId: 'T-0001' }, leader)).detail;
    assert.equal(detail.bookings.find((b) => b.bookingId === bookingId).trainee.name, 'Alex Tan');
    assert.equal(detail.trainees.length, 2);

    const v3Booking = detail.bookings.find((b) => b.volunteer.name === 'Vol Three').bookingId;
    fails(rt.call('updateBooking', { bookingId: v3Booking, traineeId: 'T-0001' }, leader), 'CONFLICT'); // already paired

    const trainee = ok(rt.call('volunteerHome', {}, vol.token)).upcoming[0].trainee;
    assert.equal(trainee.name, 'Alex Tan');
    const labels = trainee.fields.map((f) => f.label);
    assert.deepEqual(labels, ['Interests', 'Support Needs']);
    assert.ok(!JSON.stringify(trainee).includes('Epilepsy'), 'medical notes must not reach volunteers');
  });

  test('another volunteer cannot cancel my booking', () => {
    const s = createSession();
    const bookingId = ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token)).home.upcoming[0].bookingId;
    const other = ok(rt.call('register', volunteerPayload({ email: 'v9@example.com' })));
    fails(rt.call('cancelBooking', { bookingId }, other.token), 'NOT_FOUND');
  });

  test('session validation', () => {
    fails(rt.call('createSession', { title: 'X', date: TODAY, startTime: '12:00', endTime: '10:00' }, leader), 'VALIDATION_ERROR');
    fails(rt.call('createSession', { title: 'X', date: '2026-02-30', startTime: '10:00', endTime: '11:00' }, leader), 'VALIDATION_ERROR');
    const s = createSession();
    ok(rt.call('updateSession', { sessionId: s.sessionId, status: 'closed' }, leader));
    fails(rt.call('bookSession', { sessionId: s.sessionId }, vol.token), 'CONFLICT');
  });
});

describe('QR clock-in / clock-out', () => {
  function bookAndConfirm() {
    const s = createSession();
    const bookingId = ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token)).home.upcoming[0].bookingId;
    ok(rt.call('updateBooking', { bookingId, status: 'confirmed', traineeId: 'T-0001' }, leader));
    const home = ok(rt.call('volunteerHome', {}, vol.token));
    return { s, bookingId, code: home.qr.find((q) => q.date === TODAY).code };
  }

  test('scan in, repeat scan ignored, scan out after the session — written to the Attendance tab', () => {
    const { code } = bookAndConfirm();
    rt.setNow(at('09:58'));
    const inRes = ok(rt.call('scan', { code }, leader));
    assert.equal(inRes.outcome, 'in');
    assert.equal(inRes.trainee.name, 'Alex Tan');
    let row = rt.records(SHEET, 'Attendance')[0];
    assert.equal(row['Clock In'], '2026-10-14 09:58:00');
    assert.equal(row['Clocked In By'], 'Leader Lee');

    rt.advanceMinutes(1);
    assert.equal(ok(rt.call('scan', { code }, leader)).outcome, 'already-in');

    rt.setNow(at('12:13'));
    const out = ok(rt.call('scan', { code }, leader));
    assert.equal(out.outcome, 'out');
    assert.equal(out.attendance.hours, 2.25);
    row = rt.records(SHEET, 'Attendance')[0];
    assert.equal(row['Clock Out'], '2026-10-14 12:13:00');
    assert.equal(row.Hours, 2.25);

    assert.equal(ok(rt.call('scan', { code }, leader)).outcome, 'already-out');
    const home = ok(rt.call('volunteerHome', {}, vol.token));
    assert.equal(home.totals.hours, 2.25);
    assert.equal(home.pendingFeedback.length, 1);
  });

  test('forged, edited and wrong-day QR codes are rejected', () => {
    const { code } = bookAndConfirm();
    const [prefix, userId, ymd, sig] = code.split('.');
    fails(rt.call('scan', { code: 'hello world' }, leader), 'VALIDATION_ERROR');
    fails(rt.call('scan', { code: `${prefix}.U-OTHER123.${ymd}.${sig}` }, leader), 'VALIDATION_ERROR');
    fails(rt.call('scan', { code: `${prefix}.${userId}.${ymd}.${'A'.repeat(sig.length)}` }, leader), 'VALIDATION_ERROR');
    rt.setNow('2026-10-15T02:00:00Z');
    fails(rt.call('scan', { code }, leader), 'VALIDATION_ERROR'); // yesterday's code
  });

  test('pending booking is auto-confirmed on scan; unbooked volunteer needs walk-in', () => {
    const s = createSession();
    ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token));
    const code = ok(rt.call('volunteerHome', {}, vol.token)).qr[0].code;
    const res = ok(rt.call('scan', { code }, leader));
    assert.equal(res.outcome, 'in');
    assert.match(res.message, /confirmed/);

    const walker = ok(rt.call('register', volunteerPayload({ email: 'walk@example.com', name: 'Walk In' })));
    const wcode = ok(rt.call('volunteerHome', {}, walker.token)).qr[0].code;
    assert.equal(ok(rt.call('scan', { code: wcode }, leader)).outcome, 'not-booked');
    const walkIn = ok(rt.call('scan', { code: wcode, sessionId: s.sessionId, walkIn: true }, leader));
    assert.equal(walkIn.outcome, 'in');
    assert.equal(rt.records(SHEET, 'Bookings').find((b) => b['Volunteer Name'] === 'Walk In')['Walk-in'], 'Yes');
  });

  test('offline scans are uploaded later with their original times', () => {
    const { code } = bookAndConfirm();
    rt.setNow(at('13:00'));
    const { results } = ok(rt.call('scanBatch', {
      scans: [
        { clientId: 'a', code, scannedAt: at('10:02') },
        { clientId: 'b', code, scannedAt: at('11:47') },
        { clientId: 'c', code: 'junk' },
      ],
    }, leader));
    assert.deepEqual(results.map((r) => r.ok), [true, true, false]);
    const row = rt.records(SHEET, 'Attendance')[0];
    assert.equal(row['Clock In'], '2026-10-14 10:02:00');
    assert.equal(row.Hours, 1.75);
    assert.equal(row.Method, 'QR (offline)');
  });

  test('leader can clock a volunteer in/out manually when their phone is flat', () => {
    const { bookingId } = bookAndConfirm();
    assert.equal(ok(rt.call('manualClock', { bookingId }, leader)).outcome, 'in');
    rt.advanceMinutes(30);
    const out = ok(rt.call('manualClock', { bookingId }, leader));
    assert.equal(out.outcome, 'out');
    assert.equal(out.detail.stats.done, 1);
    fails(rt.call('manualClock', { bookingId }, leader), 'CONFLICT');
  });
});

describe('feedback updates the trainee record', () => {
  test('feedback is logged and the latest observation is copied to the trainee row', () => {
    const s = createSession();
    const bookingId = ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token)).home.upcoming[0].bookingId;
    fails(rt.call('submitFeedback', { bookingId, rating: 5 }, vol.token), 'CONFLICT'); // not clocked out yet
    ok(rt.call('updateBooking', { bookingId, status: 'confirmed', traineeId: 'T-0001' }, leader));
    ok(rt.call('manualClock', { bookingId }, leader));
    rt.advanceMinutes(90);
    ok(rt.call('manualClock', { bookingId }, leader));

    const res = ok(rt.call('submitFeedback', {
      bookingId,
      rating: 4,
      sessionFeedback: 'Good energy today.',
      traineeObservation: 'Alex joined the group song without prompting.',
    }, vol.token));
    assert.equal(res.traineeUpdated, true);
    assert.equal(res.home.pendingFeedback.length, 0);
    fails(rt.call('submitFeedback', { bookingId, rating: 3 }, vol.token), 'CONFLICT');

    const fb = rt.records(SHEET, 'Feedback')[0];
    assert.equal(fb['Trainee Name'], 'Alex Tan');
    assert.equal(fb['Session Rating (1-5)'], 4);
    const trainee = rt.records(SHEET, 'Trainees').find((t) => t.Name === 'Alex Tan');
    assert.match(trainee['Latest Volunteer Observation'], /joined the group song/);
    assert.equal(trainee['Observation Updated'], TODAY);
    assert.equal(trainee['Medical Notes'], 'Epilepsy plan on file'); // untouched
  });
});

describe('request handling', () => {
  test('unknown actions, bad JSON and unknown fields are rejected cleanly', () => {
    fails(rt.call('dropTables', {}), 'NOT_FOUND');
    fails(rt.call('__proto__', {}), 'NOT_FOUND');
    fails(rt.callRaw('{not json'), 'VALIDATION_ERROR');
    fails(rt.call('bookSession', { sessionId: 'S-1', extra: 1 }, vol.token), 'VALIDATION_ERROR');
  });

  test('missing SPREADSHEET_ID gives a clear config error', () => {
    rt.props.delete('SPREADSHEET_ID');
    const fresh = createGasRuntime();
    fails(fresh.call('login', { email: 'a@example.com', password: 'whatever1' }), 'CONFIG_ERROR');
  });
});
