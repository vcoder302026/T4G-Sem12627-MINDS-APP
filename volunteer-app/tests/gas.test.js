// End-to-end tests of the Apps Script backend, run in Node against the
// in-memory spreadsheet in dev/gas-harness.js.  Run: npm test

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { createGasRuntime } from '../dev/gas-harness.js';

const SHEET = 'sheet-1';
const TODAY = '2026-10-14';
const SCHOOL = 'MINDS Woodlands Gardens School';
const at = (hhmm, day = TODAY) => `${day}T${hhmm}:00+08:00`;

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

/** Registers a volunteer who has already read the Volunteer Guide. */
function volunteer(email, name) {
  const v = ok(rt.call('register', volunteerPayload({ email, name })));
  ok(rt.call('acknowledgeGuide', {}, v.token));
  return v;
}

beforeEach(() => {
  rt = createGasRuntime();
  rt.createSpreadsheet(SHEET, 'MINDS Volunteer Data');
  // An "existing" MINDS trainee list: own column order, extra columns, no ID or Preferred Name column.
  rt.fillTab(SHEET, 'Trainees', [
    ['Programme', 'Name', 'Gender', 'Communication', 'Behaviours', 'Things to Take Note', 'Interests', 'Medical Notes', 'Support Needs', 'Active'],
    ['DAC', 'Alex Tan', 'Male', 'Verbal, short sentences', 'Likes routine', 'Gets anxious with loud noises', 'Music', 'Epilepsy plan on file', 'Needs verbal prompts', ''],
    ['DAC', 'Bea Lim', 'Female', 'Non-verbal, uses gestures', 'Friendly, likes high-fives', 'Allergic to peanuts: no snacks', 'Drawing', '', '', 'Yes'],
    ['DAC', 'Chris Ng', 'Male', 'Verbal', 'Very chatty', '', 'Football', '', '', ''],
    ['DAC', 'Dana Goh', 'Female', 'A few words + signs', '', '', 'Dancing', '', '', 'No'],
  ]);
  rt.props.set('SPREADSHEET_ID', SHEET);
  rt.setNow(at('09:00'));
  rt.run('setup');

  ok(rt.call('register', volunteerPayload({ name: 'Leader Lee', email: 'leader@example.com', telegram: '' })));
  rt.props.set('FIRST_ADMIN_EMAIL', 'leader@example.com');
  rt.run('makeFirstAdmin');
  leader = ok(rt.call('login', { email: 'leader@example.com', password: 'password123' })).token;
  vol = volunteer('v1@example.com', 'Vol One');
});

function createSession(fields = {}) {
  return ok(rt.call('createSession', { title: 'Art & Craft', date: TODAY, startTime: '10:00', endTime: '12:00', venue: SCHOOL, capacity: 3, ...fields }, leader)).session;
}
function book(sessionId, v = vol) {
  return ok(rt.call('bookSession', { sessionId }, v.token)).home.upcoming.find((u) => u.session.sessionId === sessionId).bookingId;
}
/** An admin pairs a booking with a trainee for that session. */
function confirm(bookingId, extra = {}) {
  return ok(rt.call('updateBooking', { bookingId, ...extra }, leader));
}
const PW = 'password123'; // every test account's password

describe('linking to an existing sheet', () => {
  test('setup keeps existing trainee columns, adds IDs, missing volunteer fields and write-back columns', () => {
    const [headers, ...rows] = rt.tab(SHEET, 'Trainees').dump();
    assert.deepEqual(headers.slice(0, 10), ['Programme', 'Name', 'Gender', 'Communication', 'Behaviours', 'Things to Take Note', 'Interests', 'Medical Notes', 'Support Needs', 'Active']);
    assert.deepEqual(headers.slice(10), ['Trainee ID', 'Preferred Name', 'Latest Volunteer Observation', 'Observation Updated']);
    assert.equal(rows[0][1], 'Alex Tan');
    assert.equal(rows[0][10], 'T-0001');
    assert.equal(rows[3][10], 'T-0004');
  });

  test('setup adds starter venue, guide and project once, and is safe to re-run', () => {
    rt.run('setup');
    assert.deepEqual(rt.records(SHEET, 'Venues').map((v) => v.Venue), [SCHOOL]);
    assert.equal(rt.records(SHEET, 'Volunteer Guide').length, 5);
    assert.equal(rt.records(SHEET, 'Projects').length, 1);
    const before = JSON.stringify(rt.tab(SHEET, 'Trainees').dump());
    assert.match(rt.run('checkConfig'), /"Trainees" is ready/);
    assert.equal(JSON.stringify(rt.tab(SHEET, 'Trainees').dump()), before);
  });

  test('values stay exactly as typed in the sheet (no date/number auto-conversion)', () => {
    const row = rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'v1@example.com');
    assert.equal(row.Birthday, '2001-05-06');
    assert.equal(row.Phone.trim(), '+65 9123 4567');
    assert.equal(row.Telegram, 'vol_one');
    assert.equal(rt.tab(SHEET, '_Auth').isSheetHidden(), true);
  });

  test('formula-like input is stored as text', () => {
    ok(rt.call('register', volunteerPayload({ email: 'x@example.com', name: '=HYPERLINK("http://evil")' })));
    const row = rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'x@example.com');
    assert.ok(!String(row['Full Name']).startsWith('#FORMULA'));
  });

  test('a volunteer already on the list is linked, not duplicated, and never inherits leader access', () => {
    rt.fillTab(SHEET, 'Volunteers', [[], [], [], ['', 'Old Timer', '', 'old@example.com', '', '', '', '', '', 'admin']]);
    const res = ok(rt.call('register', volunteerPayload({ name: 'Old Timer', email: 'old@example.com' })));
    const matches = rt.records(SHEET, 'Volunteers').filter((r) => r.Email === 'old@example.com');
    assert.equal(matches.length, 1);
    assert.match(matches[0]['User ID'], /^U-/);
    assert.equal(res.user.role, 'volunteer');
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
    for (const action of ['adminHome', 'scan', 'listTrainees', 'reviewQueue', 'saveVenue', 'saveGuideSection', 'setStandingPairing', 'setVolunteerType', 'listAdminLog', 'saveVisibility']) {
      fails(rt.call(action, {}, vol.token), 'FORBIDDEN');
    }
  });

  test('promotion takes effect immediately; removing an admin needs your password; last admin cannot be removed', () => {
    ok(rt.call('setRole', { userId: vol.user.userId, role: 'admin' }, leader));
    ok(rt.call('adminHome', {}, vol.token));
    const leaderId = ok(rt.call('me', {}, leader)).user.userId;
    fails(rt.call('setRole', { userId: leaderId, role: 'volunteer' }, leader), 'CONFLICT'); // not yourself
    fails(rt.call('setRole', { userId: leaderId, role: 'volunteer' }, vol.token), 'PASSWORD_REQUIRED');
    fails(rt.call('setRole', { userId: leaderId, role: 'volunteer', adminPassword: 'wrong-password' }, vol.token), 'PASSWORD_REQUIRED');
    ok(rt.call('setRole', { userId: leaderId, role: 'volunteer', adminPassword: PW }, vol.token));
    fails(rt.call('setRole', { userId: vol.user.userId, role: 'volunteer', adminPassword: PW }, vol.token), 'CONFLICT');
  });

  test('password reset gives a temp password and signs the volunteer out everywhere', () => {
    const { tempPassword } = ok(rt.call('resetPassword', { userId: vol.user.userId }, leader));
    fails(rt.call('me', {}, vol.token), 'UNAUTHORIZED');
    const fresh = ok(rt.call('login', { email: 'v1@example.com', password: tempPassword })).token;
    const changed = ok(rt.call('changePassword', { currentPassword: tempPassword, newPassword: 'brand-new-pass' }, fresh));
    ok(rt.call('me', {}, changed.token));
  });
});

describe('volunteer guide for new volunteers', () => {
  test('a new volunteer must read the guide before booking', () => {
    const s = createSession();
    const fresh = ok(rt.call('register', volunteerPayload({ email: 'new@example.com', name: 'New Person' })));
    assert.equal(ok(rt.call('volunteerHome', {}, fresh.token)).guideRead, false);
    fails(rt.call('bookSession', { sessionId: s.sessionId }, fresh.token), 'GUIDE_REQUIRED');
    const g = ok(rt.call('guide', {}, fresh.token));
    assert.deepEqual(g.sections.map((x) => x.title).slice(0, 3), ['Welcome to MINDS volunteering', 'What to wear', 'What we expect from you']);
    assert.equal(g.projects[0].venue, SCHOOL);
    const ack = ok(rt.call('acknowledgeGuide', {}, fresh.token));
    assert.equal(ack.home.guideRead, true);
    ok(rt.call('bookSession', { sessionId: s.sessionId }, fresh.token));
    assert.match(rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'new@example.com')['Guide Read At'], /^2026-10-14/);
  });

  test('leaders add, edit, reorder and delete guide sections', () => {
    let c = ok(rt.call('saveGuideSection', { title: 'Parking', body: '- Park at the side gate\n- Sign in at the guardhouse' }, leader));
    const added = c.sections.find((x) => x.title === 'Parking');
    assert.equal(c.sections[c.sections.length - 1].title, 'Parking');
    c = ok(rt.call('saveGuideSection', { sectionId: added.sectionId, title: 'Getting there', body: 'Take bus 911.' }, leader));
    c = ok(rt.call('moveContent', { kind: 'guide', id: added.sectionId, direction: 'up' }, leader));
    assert.equal(c.sections[c.sections.length - 2].title, 'Getting there');
    assert.equal(ok(rt.call('guide', {}, vol.token)).sections.some((x) => x.body === 'Take bus 911.'), true);
    c = ok(rt.call('deleteGuideSection', { sectionId: added.sectionId }, leader));
    assert.equal(c.sections.some((x) => x.title === 'Getting there'), false);
    assert.equal(c.sections.length, 5);
    fails(rt.call('saveGuideSection', { title: '', body: 'x' }, leader), 'VALIDATION_ERROR');
  });

  test('projects: add, archive, and link to sessions', () => {
    let c = ok(rt.call('saveProject', { name: 'Weekend outings', description: 'Trips around Singapore', schedule: 'Saturdays', venue: SCHOOL }, leader));
    const outing = c.projects.find((p) => p.name === 'Weekend outings');
    fails(rt.call('saveProject', { name: 'weekend OUTINGS' }, leader), 'CONFLICT');
    const s = createSession({ project: 'Weekend outings' });
    assert.equal(s.project, 'Weekend outings');
    fails(rt.call('createSession', { title: 'X', date: TODAY, startTime: '10:00', endTime: '11:00', venue: SCHOOL, project: 'Nope' }, leader), 'VALIDATION_ERROR');
    c = ok(rt.call('saveProject', { projectId: outing.projectId, status: 'archived' }, leader));
    assert.equal(ok(rt.call('guide', {}, vol.token)).projects.some((p) => p.name === 'Weekend outings'), false);
  });
});

describe('venues', () => {
  test('sessions must use a listed venue; leaders add, rename and archive venues', () => {
    fails(rt.call('createSession', { title: 'X', date: TODAY, startTime: '10:00', endTime: '11:00', venue: 'Somewhere else' }, leader), 'VALIDATION_ERROR');
    let res = ok(rt.call('saveVenue', { name: 'Jurong West Sports Centre', address: '20 Jurong West St 93' }, leader));
    assert.deepEqual(res.venues.map((v) => v.name), ['Jurong West Sports Centre', SCHOOL]);
    fails(rt.call('saveVenue', { name: 'jurong west sports centre' }, leader), 'CONFLICT');
    const s = createSession({ venue: 'jurong west sports centre' }); // case-insensitive, stored with the listed spelling
    assert.equal(s.venue, 'Jurong West Sports Centre');
    assert.equal(s.venueAddress, '20 Jurong West St 93');

    res = ok(rt.call('saveVenue', { venueId: res.venue.venueId, name: 'JW Sports Centre' }, leader));
    const detail = ok(rt.call('sessionDetail', { sessionId: s.sessionId }, leader));
    assert.equal(detail.session.venue, 'JW Sports Centre');

    ok(rt.call('saveVenue', { venueId: res.venue.venueId, status: 'archived' }, leader));
    fails(rt.call('createSession', { title: 'Y', date: TODAY, startTime: '10:00', endTime: '11:00', venue: 'JW Sports Centre' }, leader), 'VALIDATION_ERROR');
    ok(rt.call('updateSession', { sessionId: s.sessionId, venue: 'JW Sports Centre', title: 'Renamed' }, leader)); // existing session keeps it
    assert.equal(ok(rt.call('listVenues', {}, leader)).venues.find((v) => v.name === 'JW Sports Centre').status, 'archived');
  });
});

describe('signing up and pairing (volunteers, regulars, admins)', () => {
  const asRegular = (v) => ok(rt.call('setVolunteerType', { userId: v.user.userId, volunteerType: 'regular' }, leader));

  test("saying I'm coming puts a volunteer on the list straight away; an admin pairs them", () => {
    const s = createSession();
    const res = ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token));
    assert.match(res.message, /An admin will pair you/);
    const u = res.home.upcoming[0];
    assert.equal(u.status, 'confirmed');
    assert.equal(u.trainee, null);
    assert.equal(res.home.volunteerType, 'volunteer');
    const detail = ok(rt.call('sessionDetail', { sessionId: s.sessionId }, leader));
    assert.equal(detail.stats.booked, 1);
    assert.equal(detail.stats.unpaired, 1);
    assert.equal(detail.bookings[0].volunteer.type, 'volunteer');
    assert.equal(detail.bookings[0].volunteer.emergencyPhone, undefined, 'emergency contacts are not sent to the session page');

    const paired = confirm(u.bookingId, { traineeId: 'T-0001' });
    assert.equal(paired.detail.bookings[0].pairing, 'manual');
    const trainee = ok(rt.call('volunteerHome', {}, vol.token)).upcoming[0].trainee;
    assert.equal(trainee.name, 'Alex Tan');
    const labels = trainee.fields.map((f) => f.label);
    assert.ok(labels.includes('Gender') && labels.includes('Communication'));
    assert.ok(!JSON.stringify(trainee).includes('Epilepsy'), 'medical notes must not reach ad hoc volunteers');
  });

  test('a trainee can have several volunteers; each volunteer has one trainee per session', () => {
    const s = createSession({ capacity: 5 });
    const b1 = book(s.sessionId);
    const b2 = book(s.sessionId, volunteer('v2@example.com', 'Vol Two'));
    confirm(b1, { traineeId: 'T-0001' });
    const both = confirm(b2, { traineeId: 'T-0001' }).detail;
    assert.deepEqual(both.bookings.map((b) => b.trainee.id), ['T-0001', 'T-0001']);
    const moved = confirm(b2, { traineeId: 'T-0002' }).detail;
    assert.equal(moved.bookings.find((b) => b.bookingId === b2).trainee.name, 'Bea Lim');
    const cleared = confirm(b2, { traineeId: '' }).detail;
    assert.equal(cleared.stats.unpaired, 1);
    fails(rt.call('updateBooking', { bookingId: b1, traineeId: 'T-9999' }, leader), 'VALIDATION_ERROR');
  });

  test("a regular's fixed trainee is applied every time they come, until an admin changes it", () => {
    fails(rt.call('setStandingPairing', { userId: vol.user.userId, traineeId: 'T-0002' }, leader), 'CONFLICT'); // not a regular yet
    asRegular(vol);
    fails(rt.call('setStandingPairing', { userId: vol.user.userId, traineeId: 'T-0004' }, leader), 'VALIDATION_ERROR'); // Dana: Active = No
    const board = ok(rt.call('setStandingPairing', { userId: vol.user.userId, traineeId: 'T-0002' }, leader));
    assert.match(board.message, /Vol One is now Bea Lim's regular volunteer/);
    assert.deepEqual(board.trainees.find((t) => t.id === 'T-0002').regulars, [vol.user.userId]);
    assert.equal(board.counts.traineesWithoutRegular, 2); // Alex and Chris (Dana is inactive)

    const s1 = createSession({ date: '2026-10-20' });
    const s2 = createSession({ date: '2026-10-27' });
    const first = ok(rt.call('bookSession', { sessionId: s1.sessionId }, vol.token));
    assert.match(first.message, /You'll be with Bea Lim, your regular trainee/);
    const b2 = book(s2.sessionId);
    const home = ok(rt.call('volunteerHome', {}, vol.token));
    assert.deepEqual(home.upcoming.map((u) => [u.trainee.name, u.pairing]), [['Bea Lim', 'standing'], ['Bea Lim', 'standing']]);
    assert.deepEqual(home.regularTrainee, { id: 'T-0002', name: 'Bea Lim' });

    confirm(b2, { traineeId: 'T-0001' }); // an admin's choice for one session...
    const changed = ok(rt.call('setStandingPairing', { userId: vol.user.userId, traineeId: 'T-0003' }, leader));
    assert.match(changed.message, /Updated 1 upcoming session/);
    const after = ok(rt.call('volunteerHome', {}, vol.token)).upcoming.map((u) => u.trainee.name);
    assert.deepEqual(after, ['Chris Ng', 'Alex Tan'], '...is kept; the fixed pairing follows the change');
    const ended = rt.records(SHEET, 'Regular Pairings');
    assert.deepEqual(ended.map((r) => r.Status), ['ended', 'active']);
  });

  test('regulars without a fixed trainee are paired by an admin; moving back to volunteer ends the pairing', () => {
    asRegular(vol);
    const s = createSession();
    assert.match(ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token)).message, /An admin will pair you/);
    ok(rt.call('setStandingPairing', { userId: vol.user.userId, traineeId: 'T-0001' }, leader));
    assert.equal(ok(rt.call('volunteerHome', {}, vol.token)).upcoming[0].trainee.name, 'Alex Tan', 'unpaired upcoming sessions pick up the new pairing');
    const res = ok(rt.call('setVolunteerType', { userId: vol.user.userId, volunteerType: 'volunteer' }, leader));
    assert.match(res.message, /regular pairing with Alex Tan has ended/);
    assert.equal(ok(rt.call('listStandingPairings', {}, leader)).regulars.length, 0);
  });

  test('pairs pasted into the Regular Pairings tab as plain names are used', () => {
    asRegular(vol);
    rt.fillTab(SHEET, 'Regular Pairings', [
      ['Pairing ID', 'User ID', 'Volunteer Name', 'Trainee ID', 'Trainee Name', 'Status'],
      ['', '', 'vol one', '', 'Chris Ng', ''],
    ]);
    const s = createSession();
    ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token));
    assert.equal(ok(rt.call('volunteerHome', {}, vol.token)).upcoming[0].trainee.name, 'Chris Ng');
    assert.equal(ok(rt.call('listStandingPairings', {}, leader)).regulars[0].traineeName, 'Chris Ng');
  });

  test(`volunteers become regulars after ${10} sessions, unless an admin set their type`, () => {
    const keepAdHoc = volunteer('adhoc@example.com', 'Ad Hoc');
    ok(rt.call('setVolunteerType', { userId: keepAdHoc.user.userId, volunteerType: 'regular' }, leader));
    ok(rt.call('setVolunteerType', { userId: keepAdHoc.user.userId, volunteerType: 'volunteer' }, leader));
    let last;
    for (let i = 0; i < 10; i += 1) {
      const date = `2026-10-${String(14 + i).padStart(2, '0')}`;
      rt.setNow(at('09:00', date));
      const s = createSession({ date, capacity: 5 });
      for (const v of [vol, keepAdHoc]) {
        const b = book(s.sessionId, v);
        rt.setNow(at('10:00', date));
        ok(rt.call('manualClock', { bookingId: b }, leader));
        rt.setNow(at('12:00', date));
        last = ok(rt.call('manualClock', { bookingId: b }, leader));
        rt.setNow(at('09:00', date));
      }
      const home = ok(rt.call('volunteerHome', {}, vol.token));
      assert.equal(home.volunteerType, i < 9 ? 'volunteer' : 'regular', `after ${i + 1} sessions`);
    }
    assert.equal(ok(rt.call('volunteerHome', {}, keepAdHoc.token)).volunteerType, 'volunteer', "an admin's choice is kept");
    assert.ok(last);
    const row = rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'v1@example.com');
    assert.equal(row['Volunteer Type'], 'regular');
    assert.match(row['Type Set By'], /Automatic/);
  });

  test('several sessions at once; each succeeds or fails on its own', () => {
    const a = createSession({ date: '2026-10-20', capacity: 1 });
    const b = createSession({ date: '2026-10-21' });
    const c = createSession({ date: '2026-10-22' });
    book(a.sessionId, volunteer('v2@example.com', 'Vol Two')); // a is now full
    const res = ok(rt.call('bookSessions', { sessionIds: [a.sessionId, b.sessionId, c.sessionId] }, vol.token));
    assert.deepEqual(res.results.map((r) => r.ok), [false, true, true]);
    assert.match(res.message, /You're coming to 2 sessions\. Sorry, Art & Craft is full\./);
    assert.equal(res.home.upcoming.length, 2);
    const fresh = ok(rt.call('register', volunteerPayload({ email: 'new@example.com' })));
    fails(rt.call('bookSessions', { sessionIds: [b.sessionId] }, fresh.token), 'GUIDE_REQUIRED');
    fails(rt.call('bookSessions', { sessionIds: [] }, vol.token), 'VALIDATION_ERROR');
  });

  test('a session can list the trainees attending', () => {
    const s = createSession({ traineeIds: ['T-0003'] });
    assert.deepEqual(s.traineeIds, ['T-0003']);
    fails(rt.call('createSession', { title: 'X', date: TODAY, startTime: '10:00', endTime: '11:00', venue: SCHOOL, traineeIds: ['T-9999'] }, leader), 'VALIDATION_ERROR');
  });

  test('sign-up rules: capacity, duplicates, cancelling, closed sessions', () => {
    const s = createSession({ capacity: 2 });
    book(s.sessionId);
    fails(rt.call('bookSession', { sessionId: s.sessionId }, vol.token), 'CONFLICT');
    const v2 = volunteer('v2@example.com', 'Vol Two');
    const v3 = volunteer('v3@example.com', 'Vol Three');
    const b2 = book(s.sessionId, v2);
    fails(rt.call('bookSession', { sessionId: s.sessionId }, v3.token), 'CONFLICT');
    fails(rt.call('cancelBooking', { bookingId: b2 }, vol.token), 'NOT_FOUND'); // not yours
    ok(rt.call('cancelBooking', { bookingId: b2 }, v2.token));
    book(s.sessionId, v3);
    ok(rt.call('updateSession', { sessionId: s.sessionId, status: 'closed' }, leader));
    fails(rt.call('bookSession', { sessionId: s.sessionId }, v2.token), 'CONFLICT');
    fails(rt.call('createSession', { title: 'X', date: TODAY, startTime: '12:00', endTime: '10:00', venue: SCHOOL }, leader), 'VALIDATION_ERROR');
  });
});

describe('QR clock-in / clock-out', () => {
  function bookAndConfirm() {
    const s = createSession();
    const bookingId = book(s.sessionId);
    confirm(bookingId, { traineeId: 'T-0001' });
    const home = ok(rt.call('volunteerHome', {}, vol.token));
    return { s, bookingId, code: home.qr.find((q) => q.date === TODAY).code };
  }

  test('scan in, repeat scan ignored, scan out after the session — written to the Attendance tab', () => {
    const { code } = bookAndConfirm();
    rt.setNow(at('09:58'));
    const inRes = ok(rt.call('scan', { code }, leader));
    assert.equal(inRes.outcome, 'in');
    assert.equal(inRes.trainee.name, 'Alex Tan');
    assert.equal(rt.records(SHEET, 'Attendance')[0]['Clock In'], '2026-10-14 09:58:00');
    rt.advanceMinutes(1);
    assert.equal(ok(rt.call('scan', { code }, leader)).outcome, 'already-in');
    rt.setNow(at('12:13'));
    const out = ok(rt.call('scan', { code }, leader));
    assert.equal(out.outcome, 'out');
    assert.equal(out.attendance.hours, 2.25);
    assert.equal(rt.records(SHEET, 'Attendance')[0].Hours, 2.25);
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
    fails(rt.call('scan', { code }, leader), 'VALIDATION_ERROR');
  });

  test("scanning someone who isn't paired yet says so; a regular walk-in gets their fixed trainee", () => {
    const s = createSession();
    book(s.sessionId);
    const code = ok(rt.call('volunteerHome', {}, vol.token)).qr[0].code;
    const res = ok(rt.call('scan', { code }, leader));
    assert.equal(res.outcome, 'in');
    assert.match(res.message, /Not paired with a trainee yet/);
    assert.equal(res.trainee, null);

    const walker = volunteer('walk@example.com', 'Walk In');
    ok(rt.call('setVolunteerType', { userId: walker.user.userId, volunteerType: 'regular' }, leader));
    ok(rt.call('setStandingPairing', { userId: walker.user.userId, traineeId: 'T-0003' }, leader));
    const wcode = ok(rt.call('volunteerHome', {}, walker.token)).qr[0].code;
    assert.equal(ok(rt.call('scan', { code: wcode }, leader)).outcome, 'not-booked');
    const walkIn = ok(rt.call('scan', { code: wcode, sessionId: s.sessionId, walkIn: true }, leader));
    assert.equal(walkIn.outcome, 'in');
    assert.equal(walkIn.trainee.name, 'Chris Ng');
  });

  test('admins add a walk-in from the clock-in page and clock them in by hand', () => {
    const s = createSession();
    const walker = volunteer('walk@example.com', 'Walk In');
    const res = ok(rt.call('addWalkIn', { sessionId: s.sessionId, userId: walker.user.userId }, leader));
    assert.match(res.message, /added as a walk-in/);
    fails(rt.call('addWalkIn', { sessionId: s.sessionId, userId: walker.user.userId }, leader), 'CONFLICT');
    assert.equal(ok(rt.call('manualClock', { bookingId: res.bookingId }, leader)).outcome, 'in');
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

describe('feedback becomes trainee notes for future volunteers', () => {
  function attendWith(v, traineeId, date) {
    const s = createSession({ date });
    const bookingId = book(s.sessionId, v);
    confirm(bookingId, { traineeId });
    rt.setNow(at('10:00', date));
    ok(rt.call('manualClock', { bookingId }, leader));
    rt.advanceMinutes(90);
    ok(rt.call('manualClock', { bookingId }, leader));
    return bookingId;
  }

  test('a leader reviews observations before future volunteers see them', () => {
    const bookingId = attendWith(vol, 'T-0001', TODAY);
    fails(rt.call('submitFeedback', { bookingId: 'B-NOPE' }, vol.token), 'NOT_FOUND');
    const res = ok(rt.call('submitFeedback', {
      bookingId, rating: 4, sessionFeedback: 'Good energy today.', traineeObservation: 'Alex joined the group song without prompting.',
    }, vol.token));
    assert.equal(res.noteStatus, 'pending');
    assert.equal(res.home.pendingFeedback.length, 0);
    fails(rt.call('submitFeedback', { bookingId, rating: 3 }, vol.token), 'CONFLICT');

    // Not shared yet: the next volunteer paired with Alex sees no notes.
    const v2 = volunteer('v2@example.com', 'Vol Two');
    const next = createSession({ date: '2026-10-21' });
    confirm(book(next.sessionId, v2), { traineeId: 'T-0001' });
    assert.equal(ok(rt.call('volunteerHome', {}, v2.token)).upcoming[0].trainee.notes.length, 0);

    const queue = ok(rt.call('reviewQueue', {}, leader)).items;
    assert.equal(queue.length, 1);
    assert.equal(ok(rt.call('adminHome', {}, leader)).reviewCount, 1);
    ok(rt.call('reviewObservation', { feedbackId: queue[0].feedbackId, decision: 'share', note: 'Joined the group song by himself. Loves singing.' }, leader));
    fails(rt.call('reviewObservation', { feedbackId: queue[0].feedbackId, decision: 'share' }, leader), 'CONFLICT');

    const notes = ok(rt.call('volunteerHome', {}, v2.token)).upcoming[0].trainee.notes;
    assert.equal(notes.length, 1);
    assert.equal(notes[0].note, 'Joined the group song by himself. Loves singing.');
    assert.equal(notes[0].author, 'Vol'); // first name only
    const trainee = rt.records(SHEET, 'Trainees').find((t) => t.Name === 'Alex Tan');
    assert.match(trainee['Latest Volunteer Observation'], /Loves singing/);
    assert.equal(trainee['Medical Notes'], 'Epilepsy plan on file');
    assert.equal(rt.records(SHEET, 'Feedback')[0]['Note Status'], 'shared');
  });

  test('observations kept private never reach volunteers', () => {
    const bookingId = attendWith(vol, 'T-0002', TODAY);
    ok(rt.call('submitFeedback', { bookingId, traineeObservation: 'Private worry about home situation.' }, vol.token));
    const [item] = ok(rt.call('reviewQueue', {}, leader)).items;
    ok(rt.call('reviewObservation', { feedbackId: item.feedbackId, decision: 'private' }, leader));
    assert.equal(ok(rt.call('traineeDetail', { traineeId: 'T-0002' }, leader)).notes.length, 0);
    assert.equal(rt.records(SHEET, 'Feedback')[0]['Note Status'], 'private');
  });

  test('leaders add and hide notes; trainee detail shows everything to leaders only', () => {
    let d = ok(rt.call('addTraineeNote', { traineeId: 'T-0001', note: 'Prefers the left side of the table.' }, leader));
    assert.equal(d.notes[0].source, 'Leader');
    assert.ok(d.trainee.fields.some((f) => f.key === 'medicalNotes' && !f.visibleToVolunteers));
    d = ok(rt.call('setNoteStatus', { noteId: d.notes[0].noteId, status: 'hidden' }, leader));
    assert.equal(d.notes[0].status, 'hidden');
    const s = createSession();
    confirm(book(s.sessionId), { traineeId: 'T-0001' });
    assert.equal(ok(rt.call('volunteerHome', {}, vol.token)).upcoming[0].trainee.notes.length, 0);
    const list = ok(rt.call('listTrainees', {}, leader)).trainees;
    assert.equal(list.length, 4);
    assert.equal(list.find((t) => t.name === 'Dana Goh').active, false);
  });

  test('with AUTO_SHARE_OBSERVATIONS on, observations are shared straight away', () => {
    rt.evaluate('CONFIG.AUTO_SHARE_OBSERVATIONS = true');
    const bookingId = attendWith(vol, 'T-0003', TODAY);
    const res = ok(rt.call('submitFeedback', { bookingId, traineeObservation: 'Great at passing drills.' }, vol.token));
    assert.equal(res.noteStatus, 'shared');
    assert.equal(ok(rt.call('traineeDetail', { traineeId: 'T-0003' }, leader)).notes[0].note, 'Great at passing drills.');
  });
});

describe('editing details in the app', () => {
  test('a volunteer updates their own details; checks match registration', () => {
    const res = ok(rt.call('updateProfile', { phone: '+65 9000 1111', telegram: 'new_handle', emergencyName: 'Parent Two', emergencyRelation: 'Father' }, vol.token));
    assert.match(res.message, /phone, Telegram, emergency contact and relationship/);
    assert.equal(res.user.telegram, 'new_handle');
    const row = rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'v1@example.com');
    assert.equal(row.Phone.trim(), '+65 9000 1111');
    assert.equal(row['Emergency Contact Name'], 'Parent Two');
    assert.equal(row['Details Updated By'], 'Vol One');
    assert.equal(ok(rt.call('updateProfile', { phone: '+65 9000 1111' }, vol.token)).message, 'No changes to save.');
    fails(rt.call('updateProfile', { phone: 'abc' }, vol.token), 'VALIDATION_ERROR');
    fails(rt.call('updateProfile', { name: ' ' }, vol.token), 'VALIDATION_ERROR');
    fails(rt.call('updateProfile', { birthday: '2099-01-01' }, vol.token), 'VALIDATION_ERROR');
    fails(rt.call('updateProfile', { role: 'admin' }, vol.token), 'VALIDATION_ERROR'); // cannot promote yourself
  });

  test('changing your sign-in email needs your password and a free address', () => {
    fails(rt.call('updateProfile', { email: 'vol.new@example.com' }, vol.token), 'VALIDATION_ERROR');
    fails(rt.call('updateProfile', { email: 'vol.new@example.com', currentPassword: 'wrong-pass' }, vol.token), 'VALIDATION_ERROR');
    fails(rt.call('updateProfile', { email: 'LEADER@example.com', currentPassword: 'password123' }, vol.token), 'CONFLICT');
    const res = ok(rt.call('updateProfile', { email: 'Vol.New@example.com', currentPassword: 'password123' }, vol.token));
    assert.match(res.message, /vol\.new@example\.com/);
    ok(rt.call('login', { email: 'vol.new@example.com', password: 'password123' }));
    fails(rt.call('login', { email: 'v1@example.com', password: 'password123' }), 'UNAUTHORIZED');
    ok(rt.call('volunteerHome', {}, vol.token)); // still signed in on this phone
  });

  test('a new name shows on upcoming bookings; past attendance keeps the old name', () => {
    const s = createSession();
    const bookingId = book(s.sessionId);
    ok(rt.call('updateProfile', { name: 'Vol Renamed' }, vol.token));
    assert.equal(rt.records(SHEET, 'Bookings').find((b) => b['Booking ID'] === bookingId)['Volunteer Name'], 'Vol Renamed');
    const detail = ok(rt.call('sessionDetail', { sessionId: s.sessionId }, leader));
    assert.equal(detail.bookings[0].volunteer.name, 'Vol Renamed');
  });

  test('leaders edit volunteers and other leaders, including role and status', () => {
    const userId = vol.user.userId;
    const d = ok(rt.call('personDetail', { userId }, leader));
    assert.equal(d.person.emergencyName, 'Parent One');
    assert.equal(d.person.status, 'active');
    const res = ok(rt.call('updatePerson', { userId, phone: '+65 9888 7777', emergencyPhone: '+65 6123 4567', role: 'admin' }, leader));
    assert.match(res.message, /Updated Vol One's phone and emergency phone\. Vol One is now an admin\./);
    assert.equal(rt.records(SHEET, 'Volunteers').find((r) => r['User ID'] === userId)['Details Updated By'], 'Leader Lee');
    ok(rt.call('adminHome', {}, vol.token)); // promotion applies straight away

    // the promoted leader edits the first leader's details
    const leaderId = ok(rt.call('me', {}, leader)).user.userId;
    ok(rt.call('updatePerson', { userId: leaderId, telegram: 'leader_lee' }, vol.token));
    assert.equal(ok(rt.call('me', {}, leader)).user.telegram, 'leader_lee');

    fails(rt.call('updatePerson', { userId, email: 'leader@example.com' }, leader), 'CONFLICT');
    fails(rt.call('updatePerson', { userId: leaderId, status: 'inactive' }, leader), 'CONFLICT'); // not yourself
    fails(rt.call('updatePerson', { userId: leaderId, role: 'volunteer' }, leader), 'CONFLICT');
    fails(rt.call('updatePerson', { userId, role: 'volunteer' }, leader), 'PASSWORD_REQUIRED'); // removing an admin
    assert.match(ok(rt.call('updatePerson', { userId, role: 'volunteer', adminPassword: PW }, leader)).message, /no longer an admin/);
    fails(rt.call('updatePerson', { userId: 'U-nope' }, leader), 'NOT_FOUND');
    fails(rt.call('updatePerson', { userId, notes: 'x' }, leader), 'VALIDATION_ERROR');
  });

  test('deactivating signs the person out; the last active leader is protected', () => {
    const sam = volunteer('sam@example.com', 'Sam Ong');
    const res = ok(rt.call('updatePerson', { userId: sam.user.userId, status: 'inactive' }, leader));
    assert.match(res.message, /Sam Ong is deactivated/);
    fails(rt.call('volunteerHome', {}, sam.token), 'UNAUTHORIZED');
    fails(rt.call('login', { email: 'sam@example.com', password: 'password123' }), 'UNAUTHORIZED');
    ok(rt.call('updatePerson', { userId: sam.user.userId, status: 'active' }, leader));
    ok(rt.call('login', { email: 'sam@example.com', password: 'password123' }));

    // two leaders: one can deactivate the other, but not the last one left
    ok(rt.call('updatePerson', { userId: vol.user.userId, role: 'admin' }, leader));
    const leaderId = ok(rt.call('me', {}, leader)).user.userId;
    fails(rt.call('updatePerson', { userId: leaderId, status: 'inactive' }, vol.token), 'PASSWORD_REQUIRED');
    ok(rt.call('updatePerson', { userId: leaderId, status: 'inactive', adminPassword: PW }, vol.token));
    fails(rt.call('updatePerson', { userId: vol.user.userId, status: 'inactive', adminPassword: PW }, vol.token), 'CONFLICT');
    fails(rt.call('updatePerson', { userId: sam.user.userId, phone: '+65 9111 2222' }, sam.token), 'FORBIDDEN');
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
    const fresh = createGasRuntime();
    fails(fresh.call('login', { email: 'a@example.com', password: 'whatever1' }), 'CONFIG_ERROR');
  });
});
