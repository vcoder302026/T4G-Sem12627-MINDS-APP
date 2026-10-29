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
  rt.evaluate(`setAdminActionPassword_('${ADMIN_PW}')`); // a known admin password for the tests

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
const ADMIN_PW = 'admin-test-pass'; // the shared admin password (AdminPassword.gs)

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
    assert.deepEqual(rt.records(SHEET, 'Projects').map((p) => p.Project), ['RSPID (CTDC)', 'RSPID (WGS)', 'West End']);
    const before = JSON.stringify(rt.tab(SHEET, 'Trainees').dump());
    assert.match(rt.run('checkConfig'), /"Trainees" is ready/);
    assert.equal(JSON.stringify(rt.tab(SHEET, 'Trainees').dump()), before);
  });

  test('values stay exactly as typed in the sheet (no date/number auto-conversion)', () => {
    const row = rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'v1@example.com');
    assert.equal(row.Birthday, '2001-05-06');
    assert.equal(row.Phone.trim(), '+65 91234567'); // stored as +65 and 8 digits, still text
    assert.equal(row.Telegram, 'vol_one');
    assert.equal(rt.tab(SHEET, '_Auth').isSheetHidden(), true);
  });

  test('formula-like input is stored as text', () => {
    ok(rt.call('register', volunteerPayload({ email: 'x@example.com', name: '=HYPERLINK("http://evil")' })));
    const row = rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'x@example.com');
    assert.ok(!String(row['Full Name']).startsWith('#FORMULA'));
  });

  test('a volunteer already on the list is linked, not duplicated, and never inherits leader access', () => {
    rt.tab(SHEET, 'Volunteers').getRange(4, 1, 1, 10).setValues([['', 'Old Timer', '', 'old@example.com', '', '', '', '', '', 'admin']]); // a row added by hand
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

  test('making and removing admins both need the admin password; promotion takes effect immediately; last admin cannot be removed', () => {
    fails(rt.call('setRole', { userId: vol.user.userId, role: 'admin' }, leader), 'PASSWORD_REQUIRED');
    fails(rt.call('setRole', { userId: vol.user.userId, role: 'admin', adminPassword: PW }, leader), 'PASSWORD_REQUIRED');
    ok(rt.call('setRole', { userId: vol.user.userId, role: 'admin', adminPassword: ADMIN_PW }, leader));
    ok(rt.call('adminHome', {}, vol.token));
    const leaderId = ok(rt.call('me', {}, leader)).user.userId;
    fails(rt.call('setRole', { userId: leaderId, role: 'volunteer' }, leader), 'CONFLICT'); // not yourself
    fails(rt.call('setRole', { userId: leaderId, role: 'volunteer' }, vol.token), 'PASSWORD_REQUIRED');
    fails(rt.call('setRole', { userId: leaderId, role: 'volunteer', adminPassword: 'wrong-password' }, vol.token), 'PASSWORD_REQUIRED');
    fails(rt.call('setRole', { userId: leaderId, role: 'volunteer', adminPassword: PW }, vol.token), 'PASSWORD_REQUIRED'); // a sign-in password isn't it
    ok(rt.call('setRole', { userId: leaderId, role: 'volunteer', adminPassword: ADMIN_PW }, vol.token));
    fails(rt.call('setRole', { userId: vol.user.userId, role: 'volunteer', adminPassword: ADMIN_PW }, vol.token), 'CONFLICT');
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
    assert.equal(g.projects.find((p) => p.name === 'West End').venue, SCHOOL);
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
    fails(rt.call('saveProject', { name: 'A, B' }, leader), 'VALIDATION_ERROR');
    // A session can be for several projects
    const both = createSession({ project: ['West End', 'RSPID (WGS)'] });
    assert.deepEqual(both.projects, ['West End', 'RSPID (WGS)']);
    assert.equal(rt.records(SHEET, 'Sessions').find((r) => r['Session ID'] === both.sessionId).Project,
      'West End, RSPID (WGS)');
    const one = ok(rt.call('updateSession', { sessionId: both.sessionId, project: ['West End'] }, leader));
    assert.deepEqual(one.detail.session.projects, ['West End']);
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
    const onHome = ok(rt.call('volunteerHome', {}, vol.token)).upcoming[0].trainee;
    assert.equal(onHome.name, 'Alex Tan');
    assert.equal(onHome.fields, undefined, 'Home shows the name and photo only; details come on request');
    const trainee = ok(rt.call('traineeInfo', { traineeId: 'T-0001' }, vol.token));
    const labels = trainee.sections.flatMap((x) => x.fields.map((f) => f.label));
    assert.ok(trainee.trainee.gender && labels.includes('Communication'), 'gender beside the photo; the rest in sections');
    assert.ok(!labels.includes('Gender'), 'gender is not repeated in a section');
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
    assert.equal(home.regularTrainee.name, 'Bea Lim', 'shown once, in full, at the top of Home');
    assert.equal(home.regularTrainee.id, 'T-0002');
    assert.equal(home.progress, undefined, 'progress to regular is not shown to volunteers');

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
    assert.ok(!ok(rt.call('listStandingPairings', {}, leader)).regulars.some((r) => r.userId === vol.user.userId), 'no longer on the regulars board');
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
    assert.equal(ok(rt.call('listStandingPairings', {}, leader)).regulars.find((r) => r.userId === vol.user.userId).traineeName, 'Chris Ng');
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

  test('history shows the trainee for each past session; ad hoc volunteers can open details for 14 days', () => {
    const s = createSession();
    const b = book(s.sessionId);
    confirm(b, { traineeId: 'T-0002' });
    rt.setNow(at('10:00'));
    ok(rt.call('manualClock', { bookingId: b }, leader));
    rt.setNow(at('12:00'));
    ok(rt.call('manualClock', { bookingId: b }, leader));
    assert.deepEqual(ok(rt.call('volunteerHome', {}, vol.token)).history[0].trainee, { id: 'T-0002', name: 'Bea Lim', canView: true });
    rt.setNow(at('09:00', '2026-11-07')); // three weeks later
    const later = ok(rt.call('volunteerHome', {}, vol.token)).history[0].trainee;
    assert.equal(later.name, 'Bea Lim', 'the name is still shown');
    assert.equal(later.canView, false, '...but an ad hoc volunteer can no longer open the details');
    fails(rt.call('traineeInfo', { traineeId: 'T-0002' }, vol.token), 'FORBIDDEN');
    asRegular(vol);
    assert.equal(ok(rt.call('volunteerHome', {}, vol.token)).history[0].trainee.canView, true, 'regulars can open any trainee');
  });

  test('admins see pairing history: sessions together, and each regular\'s trainees over time', () => {
    const attendWith = (date, traineeId) => {
      rt.setNow(at('09:00', date));
      const s = createSession({ date });
      const bk = book(s.sessionId);
      confirm(bk, { traineeId });
      rt.setNow(at('10:00', date));
      ok(rt.call('manualClock', { bookingId: bk }, leader));
      rt.setNow(at('12:00', date));
      ok(rt.call('manualClock', { bookingId: bk }, leader));
      return s;
    };
    attendWith('2026-10-14', 'T-0001');
    attendWith('2026-10-15', 'T-0001');
    attendWith('2026-10-16', 'T-0002');
    // a sign-up that didn't happen doesn't count
    rt.setNow(at('09:00', '2026-10-17'));
    const missed = createSession({ date: '2026-10-17' });
    confirm(book(missed.sessionId), { traineeId: 'T-0003' });
    rt.setNow(at('09:00', '2026-10-18'));

    asRegular(vol);
    ok(rt.call('setStandingPairing', { userId: vol.user.userId, traineeId: 'T-0001' }, leader));
    rt.setNow(at('09:00', '2026-10-25'));
    ok(rt.call('setStandingPairing', { userId: vol.user.userId, traineeId: 'T-0003' }, leader)); // rotate to someone new

    const h = ok(rt.call('pairingHistory', {}, leader));
    const pairs = h.pairs.map((x) => `${x.traineeName}:${x.sessions}:${x.last}`);
    assert.deepEqual(pairs, ['Bea Lim:1:2026-10-16', 'Alex Tan:2:2026-10-15']);
    assert.deepEqual(h.regularPeriods.map((x) => `${x.traineeName}:${x.from}:${x.to || 'now'}`),
      ['Alex Tan:2026-10-18:2026-10-25', 'Chris Ng:2026-10-25:now']);

    // the boards carry the same history for the pick lists
    const board = ok(rt.call('listStandingPairings', {}, leader)).history[vol.user.userId];
    assert.deepEqual(board['T-0001'], { sessions: 2, last: '2026-10-15', regularFrom: '2026-10-18', regularTo: '2026-10-25' });
    assert.equal(board['T-0003'].regularNow, true);
    assert.equal(board['T-0004'], undefined, 'never together: "New for them"');
    const next = createSession({ date: '2026-10-28' });
    book(next.sessionId);
    assert.equal(ok(rt.call('sessionDetail', { sessionId: next.sessionId }, leader)).history[vol.user.userId]['T-0002'].sessions, 1);
    const person = ok(rt.call('personDetail', { userId: vol.user.userId }, leader));
    assert.deepEqual(person.regularHistory.map((x) => `${x.traineeName}:${x.active}`), ['Chris Ng:true', 'Alex Tan:false']);
    fails(rt.call('pairingHistory', {}, vol.token), 'FORBIDDEN');
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
    assert.deepEqual(home.history[0].trainee, { id: 'T-0001', name: 'Alex Tan', canView: true }, 'past sessions show who they were with');
    const person = ok(rt.call('personDetail', { userId: vol.user.userId }, leader));
    assert.equal(person.recent[0].traineeName, 'Alex Tan');
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
    assert.equal(ok(rt.call('traineeInfo', { traineeId: 'T-0001' }, v2.token)).notes.length, 0);

    const queue = ok(rt.call('reviewQueue', {}, leader)).items;
    assert.equal(queue.length, 1);
    assert.equal(ok(rt.call('adminHome', {}, leader)).reviewCount, 1);
    ok(rt.call('reviewObservation', { feedbackId: queue[0].feedbackId, decision: 'share', note: 'Joined the group song by himself. Loves singing.' }, leader));
    fails(rt.call('reviewObservation', { feedbackId: queue[0].feedbackId, decision: 'share' }, leader), 'CONFLICT');

    const notes = ok(rt.call('traineeInfo', { traineeId: 'T-0001' }, v2.token)).notes;
    assert.equal(notes.length, 1);
    assert.equal(notes[0].note, 'Joined the group song by himself. Loves singing.');
    assert.equal(notes[0].author, 'Vol'); // first name only
    const trainee = rt.records(SHEET, 'Trainees').find((t) => t.Name === 'Alex Tan');
    assert.match(trainee['Latest Volunteer Observation'], /Loves singing/);
    assert.equal(trainee['Medical Notes'], 'Epilepsy plan on file');
    assert.equal(rt.records(SHEET, 'Feedback')[0]['Note Status'], 'shared');
  });

  test('observations kept private never reach volunteers, but are kept for admins', () => {
    const bookingId = attendWith(vol, 'T-0002', TODAY);
    ok(rt.call('submitFeedback', { bookingId, traineeObservation: 'Private worry about home situation.' }, vol.token));
    const [item] = ok(rt.call('reviewQueue', {}, leader)).items;
    ok(rt.call('reviewObservation', { feedbackId: item.feedbackId, decision: 'private' }, leader));
    const notes = ok(rt.call('traineeDetail', { traineeId: 'T-0002' }, leader)).notes;
    assert.equal(notes.length, 1, 'kept on the profile instead of being thrown away');
    assert.equal(notes[0].audience, 'private');
    assert.equal(rt.records(SHEET, 'Feedback')[0]['Note Status'], 'private');
    assert.equal(rt.records(SHEET, 'Trainee Notes')[0]['Shared With'], 'private');
    assert.equal(ok(rt.call('traineeInfo', { traineeId: 'T-0002' }, vol.token)).notes.length, 0);
  });

  test('leaders add and hide notes; trainee detail shows everything to leaders only', () => {
    let d = ok(rt.call('addTraineeNote', { traineeId: 'T-0001', note: 'Prefers the left side of the table.' }, leader));
    assert.equal(d.notes[0].source, 'Leader');
    assert.ok(d.trainee.fields.some((f) => f.key === 'medicalNotes' && !f.visibleToVolunteers));
    d = ok(rt.call('setNoteStatus', { noteId: d.notes[0].noteId, status: 'hidden' }, leader));
    assert.equal(d.notes[0].status, 'hidden');
    const s = createSession();
    confirm(book(s.sessionId), { traineeId: 'T-0001' });
    assert.equal(ok(rt.call('traineeInfo', { traineeId: 'T-0001' }, vol.token)).notes.length, 0);
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
    assert.equal(row.Phone.trim(), '+65 90001111');
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
    fails(rt.call('updatePerson', { userId, role: 'admin' }, leader), 'PASSWORD_REQUIRED');
    const res = ok(rt.call('updatePerson', { userId, phone: '+65 9888 7777', emergencyPhone: '+65 6123 4567', role: 'admin', adminPassword: ADMIN_PW }, leader));
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
    assert.match(ok(rt.call('updatePerson', { userId, role: 'volunteer', adminPassword: ADMIN_PW }, leader)).message, /no longer an admin/);
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
    ok(rt.call('updatePerson', { userId: vol.user.userId, role: 'admin', adminPassword: ADMIN_PW }, leader));
    const leaderId = ok(rt.call('me', {}, leader)).user.userId;
    fails(rt.call('updatePerson', { userId: leaderId, status: 'inactive' }, vol.token), 'PASSWORD_REQUIRED');
    ok(rt.call('updatePerson', { userId: leaderId, status: 'inactive', adminPassword: ADMIN_PW }, vol.token));
    fails(rt.call('updatePerson', { userId: vol.user.userId, status: 'inactive', adminPassword: ADMIN_PW }, vol.token), 'CONFLICT');
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

describe('adding sessions', () => {
  test('the form defaults come from Config.gs: Regular session, 2:30 to 5:30 pm, Woodlands', () => {
    const o = ok(rt.call('adminHome', {}, leader)).sessionOptions;
    assert.deepEqual(o.titles, ['Regular session']);
    assert.deepEqual(o.projects, ['West End', 'RSPID (WGS)']);
    assert.deepEqual(o.times[0], { label: '2:30 pm – 5:30 pm', startTime: '14:30', endTime: '17:30' });
    assert.equal(o.venue, SCHOOL);
  });

  test('setup adds the default projects to an existing Projects tab, keeping what is there', () => {
    rt.fillTab(SHEET, 'Projects', [['Project ID', 'Project', 'Status'], ['P-OLD', 'School activity support', 'active']]);
    const report = rt.run('setup');
    assert.match(report, /Added project\(s\): RSPID \(CTDC\), RSPID \(WGS\), West End/);
    const names = rt.records(SHEET, 'Projects').map((p) => p.Project);
    assert.deepEqual(names.sort(), ['RSPID (CTDC)', 'RSPID (WGS)', 'School activity support', 'West End']);
  });

  test('the same session on several dates at once; past and duplicate dates are skipped', () => {
    const base = { title: 'Regular session', startTime: '14:30', endTime: '17:30', venue: SCHOOL };
    const res = ok(rt.call('createSessions', { ...base, dates: ['2026-10-17', '2026-10-24', '2026-10-24', '2026-10-01'] }, leader));
    assert.deepEqual(res.created.map((s) => s.date), ['2026-10-17', '2026-10-24']);
    assert.match(res.message, /Added 2 sessions.*Skipped 2026-10-01 \(in the past\)/);
    const again = ok(rt.call('createSessions', { ...base, dates: ['2026-10-17', '2026-10-31'] }, leader));
    assert.deepEqual(again.created.map((s) => s.date), ['2026-10-31']);
    assert.match(again.message, /2026-10-17 \(already has this session\)/);
    assert.equal(rt.records(SHEET, 'Sessions').filter((s) => s.Title === 'Regular session').length, 3);
    fails(rt.call('createSessions', { ...base, dates: [] }, leader), 'VALIDATION_ERROR');
    fails(rt.call('createSessions', { ...base, endTime: '14:00', dates: ['2026-10-17'] }, leader), 'VALIDATION_ERROR');
    fails(rt.call('createSessions', { ...base, dates: ['2026-10-17'] }, vol.token), 'FORBIDDEN');
  });
});


describe('admins are regular volunteers by default', () => {
  test('every way of becoming an admin makes them a regular; setup() fixes existing admins', () => {
    assert.equal(ok(rt.call('me', {}, leader)).user.volunteerType, 'regular', 'the first admin (makeFirstAdmin)');
    const res = ok(rt.call('updatePerson', { userId: vol.user.userId, role: 'admin', adminPassword: ADMIN_PW }, leader));
    assert.match(res.message, /now a regular too/);
    assert.equal(rt.records(SHEET, 'Volunteers').find((r) => r['User ID'] === vol.user.userId)['Type Set By'], 'Made an admin');
    const sam = volunteer('sam@example.com', 'Sam Ong');
    ok(rt.call('setRole', { userId: sam.user.userId, role: 'admin', adminPassword: ADMIN_PW }, leader));
    assert.equal(ok(rt.call('me', {}, sam.token)).user.volunteerType, 'regular');
    const added = ok(rt.call('createVolunteer', { name: 'New Admin', email: 'na@example.com', phone: '+65 9000 2222', role: 'admin', adminPassword: ADMIN_PW }, leader));
    assert.equal(added.person.volunteerType, 'regular');
    // Losing admin access doesn't undo it; an admin can move them back by hand, and setup() respects that.
    ok(rt.call('setRole', { userId: sam.user.userId, role: 'volunteer', adminPassword: ADMIN_PW }, leader));
    assert.equal(ok(rt.call('me', {}, sam.token)).user.volunteerType, 'regular');
    ok(rt.call('setVolunteerType', { userId: vol.user.userId, volunteerType: 'volunteer' }, leader));
    // An admin from before this rule (type "volunteer", not set by anyone) is fixed by setup()
    const row = rt.records(SHEET, 'Volunteers').findIndex((r) => r['User ID'] === sam.user.userId);
    ok(rt.call('setRole', { userId: sam.user.userId, role: 'admin', adminPassword: ADMIN_PW }, leader));
    const tab = rt.tab(SHEET, 'Volunteers');
    const header = tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0];
    tab.getRange(row + 2, header.indexOf('Volunteer Type') + 1).setValue('volunteer');
    tab.getRange(row + 2, header.indexOf('Type Set By') + 1).setValue('');
    rt.run('setup');
    const after = rt.records(SHEET, 'Volunteers');
    assert.equal(after.find((r) => r['User ID'] === sam.user.userId)['Volunteer Type'], 'regular', 'setup() made the old admin a regular');
    assert.equal(after.find((r) => r['User ID'] === vol.user.userId)['Volunteer Type'], 'volunteer', 'a deliberate choice is kept');
  });
});

describe('the admin password (separate from sign-in passwords)', () => {
  test('every change to who is an admin needs it: make, remove, deactivate, reactivate, add as admin', () => {
    const userId = vol.user.userId;
    const need = (payload) => fails(rt.call('updatePerson', { userId, ...payload }, leader), 'PASSWORD_REQUIRED');
    const pw = { adminPassword: ADMIN_PW };
    need({ role: 'admin' });
    ok(rt.call('updatePerson', { userId, role: 'admin', ...pw }, leader));
    need({ status: 'inactive' });
    ok(rt.call('updatePerson', { userId, status: 'inactive', ...pw }, leader));
    need({ status: 'active' }); // reactivating an admin gives admin access back
    ok(rt.call('updatePerson', { userId, status: 'active', ...pw }, leader));
    need({ role: 'volunteer' });
    ok(rt.call('updatePerson', { userId, role: 'volunteer', ...pw }, leader));
    // Changes that don't touch admin access don't ask for it
    ok(rt.call('updatePerson', { userId, status: 'inactive' }, leader));
    ok(rt.call('updatePerson', { userId, status: 'active', phone: '+65 9000 1111' }, leader));
    // Adding a new person with admin access (Volunteers → Add volunteer)
    const add = { name: 'New Admin', email: 'na@example.com', phone: '+65 9000 2222', role: 'admin' };
    fails(rt.call('createVolunteer', add, leader), 'PASSWORD_REQUIRED');
    assert.equal(ok(rt.call('createVolunteer', { ...add, ...pw }, leader)).person.role, 'admin');
    ok(rt.call('createVolunteer', { name: 'Plain Vol', email: 'pv@example.com', phone: '+65 9000 3333' }, leader));
  });

  test('setup() creates one, shows it once, and it works', () => {
    const fresh = createGasRuntime();
    fresh.createSpreadsheet('s2');
    fresh.fillTab('s2', 'Trainees', [['Name'], ['Alex Tan']]);
    fresh.props.set('SPREADSHEET_ID', 's2');
    assert.match(fresh.run('checkConfig'), /Would create the admin password/);
    const report = fresh.run('setup');
    const generated = /ADMIN PASSWORD: (admin-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})/.exec(report)[1];
    assert.ok(!/ADMIN PASSWORD/.test(fresh.run('setup')), 'shown only the first time');
    assert.ok(!JSON.stringify([...fresh.props.entries()]).includes(generated), 'only a hash is stored');
    const a = fresh.call('register', volunteerPayload({ email: 'a@example.com', name: 'Admin A' })).data;
    const b = fresh.call('register', volunteerPayload({ email: 'b@example.com', name: 'Admin B' })).data;
    fresh.props.set('FIRST_ADMIN_EMAIL', 'a@example.com');
    fresh.run('makeFirstAdmin');
    assert.equal(fresh.call('setRole', { userId: b.user.userId, role: 'admin', adminPassword: generated }, a.token).ok, true);
    assert.equal(fresh.call('setRole', { userId: b.user.userId, role: 'volunteer', adminPassword: generated }, a.token).ok, true);
  });

  test('an admin changes it with the current one and a new one; the old one stops working', () => {
    fails(rt.call('changeAdminPassword', { currentPassword: 'nope-nope', newPassword: 'new-admin-pass' }, leader), 'PASSWORD_REQUIRED');
    fails(rt.call('changeAdminPassword', { currentPassword: ADMIN_PW, newPassword: 'short' }, leader), 'VALIDATION_ERROR');
    fails(rt.call('changeAdminPassword', { currentPassword: ADMIN_PW, newPassword: ADMIN_PW }, leader), 'VALIDATION_ERROR');
    fails(rt.call('changeAdminPassword', { currentPassword: ADMIN_PW, newPassword: 'new-admin-pass' }, vol.token), 'FORBIDDEN');
    assert.match(ok(rt.call('changeAdminPassword', { currentPassword: ADMIN_PW, newPassword: 'new-admin-pass' }, leader)).message, /Admin password changed/);
    ok(rt.call('setRole', { userId: vol.user.userId, role: 'admin', adminPassword: 'new-admin-pass' }, leader));
    fails(rt.call('setRole', { userId: vol.user.userId, role: 'volunteer', adminPassword: ADMIN_PW }, leader), 'PASSWORD_REQUIRED');
    ok(rt.call('setRole', { userId: vol.user.userId, role: 'volunteer', adminPassword: 'new-admin-pass' }, leader));
    const log = JSON.stringify(rt.records(SHEET, 'Admin Activity Log'));
    assert.match(log, /Changed the admin password/);
    assert.ok(!log.includes('new-admin-pass') && !log.includes(ADMIN_PW), 'never logged');
  });

  test('5 wrong tries lock it for 15 minutes; resetAdminPassword() makes a new one', () => {
    ok(rt.call('setRole', { userId: vol.user.userId, role: 'admin', adminPassword: ADMIN_PW }, leader));
    for (let i = 0; i < 5; i += 1) fails(rt.call('setRole', { userId: vol.user.userId, role: 'volunteer', adminPassword: `wrong-${i}` }, leader), 'PASSWORD_REQUIRED');
    fails(rt.call('setRole', { userId: vol.user.userId, role: 'volunteer', adminPassword: ADMIN_PW }, leader), 'TOO_MANY_ATTEMPTS');
    const text = rt.run('resetAdminPassword');
    const fresh = /ADMIN PASSWORD: (admin-[a-z0-9-]+)/.exec(text)[1];
    assert.match(JSON.stringify(rt.records(SHEET, 'Admin Activity Log')), /Reset the admin password/);
    // the lock is per admin: the other admin can use the new password straight away
    const leaderId = ok(rt.call('me', {}, leader)).user.userId;
    ok(rt.call('setRole', { userId: leaderId, role: 'volunteer', adminPassword: fresh }, vol.token));
  });
});

describe('phone and email checks', () => {
  test('phones are Singapore numbers: +65 and 8 digits, stored as "+65 91234567"', () => {
    const reg = (phone, i) => rt.call('register', volunteerPayload({ email: `p${i}@example.com`, phone }));
    ['+65 9123 4567', '+6591234567', '91234567', '9123-4567', '65 91234567'].forEach((phone, i) => {
      assert.equal(ok(reg(phone, i)).user.phone, '+65 91234567', phone);
    });
    ['9123456', '912345678', '+60 12345678', '+65 9123 456', '+1 4155550000', 'abc'].forEach((phone, i) => {
      const e = fails(reg(phone, i + 10), 'VALIDATION_ERROR');
      assert.match(e.message, /\+65 followed by 8 digits/, phone);
    });
    fails(rt.call('register', volunteerPayload({ email: 'x1@example.com', emergencyPhone: '1234' })), 'VALIDATION_ERROR');
    fails(rt.call('updateProfile', { phone: '+65 1234' }, vol.token), 'VALIDATION_ERROR');
    assert.equal(ok(rt.call('updateProfile', { phone: '8123 4567' }, vol.token)).user.phone, '+65 81234567');
    fails(rt.call('createVolunteer', { name: 'X', email: 'x2@example.com', phone: '12345' }, leader), 'VALIDATION_ERROR');
  });

  test('registering needs no emergency contact (details sent by older app versions are still accepted)', () => {
    const payload = volunteerPayload({ email: 'noemergency@example.com' });
    delete payload.emergencyName;
    delete payload.emergencyPhone;
    delete payload.emergencyRelation;
    const res = ok(rt.call('register', payload));
    assert.equal(res.user.emergencyName, '');
    ok(rt.call('updateProfile', { phone: '9333 2222' }, res.token)); // editing details doesn't ask for one either
    const old = ok(rt.call('register', volunteerPayload({ email: 'olderapp@example.com' })));
    assert.equal(old.user.emergencyPhone, '+65 81234567');
  });

  test('emails must look like name@domain.tld', () => {
    ['name@example.com', 'first.last+minds@mail.example.sg', 'A_B-c@sub.domain.com.sg'].forEach((email, i) => {
      assert.equal(ok(rt.call('register', volunteerPayload({ email, phone: `+65 9000 000${i}` }))).user.email, email.toLowerCase());
    });
    ['plainaddress', 'a@b', 'a@b.c', 'a b@example.com', 'a@@example.com', '.a@example.com', 'a.@example.com',
      'a..b@example.com', 'a@-example.com', 'a@example..com', 'a@exam_ple.com', 'a@example.c0m'].forEach((email) => {
      fails(rt.call('register', volunteerPayload({ email })), 'VALIDATION_ERROR');
    });
  });
});

describe('Google Contacts sync', () => {
  const contacts = () => [...rt.contacts.people.values()];
  const turnOn = (label = 'MINDS Volunteers (Exp)') => {
    rt.props.set('CONTACTS_SYNC', 'on');
    rt.props.set('CONTACTS_LABEL', label);
  };

  test('off by default: nothing is sent to Google', () => {
    volunteer('off@example.com', 'Off Person');
    assert.equal(contacts().length, 0);
    assert.equal(rt.contacts.state.calls.length, 0);
    fails(rt.call('syncContact', { userId: vol.user.userId }, leader), 'CONFLICT');
  });

  test('registering saves a contact: name, email, phone, Telegram in the notes, the label', () => {
    turnOn();
    const res = ok(rt.call('register', volunteerPayload({ name: 'Nora Tan', email: 'nora@example.com', phone: '9123 4567', telegram: '@nora_tan' })));
    assert.equal(res.contact.status, 'saved');
    const [c] = contacts();
    assert.equal(c.names[0].givenName, 'Nora Tan_[Nora Tan]', 'no short name or project: the full name stands in for the short name');
    assert.equal(c.emailAddresses[0].value, 'nora@example.com');
    assert.equal(c.phoneNumbers[0].value, '91234567', 'the 8-digit number');
    assert.match(c.biographies[0].value, /^Telegram: @nora_tan\nEmergency contact: \+65 81234567 \(Mother\)\nMINDS volunteer/);
    const group = [...rt.contacts.groups.values()].find((g) => g.name === 'MINDS Volunteers (Exp)');
    assert.ok(group, 'the label is created');
    assert.equal(c.memberships[0].contactGroupMembership.contactGroupResourceName, group.resourceName);
    const row = rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'nora@example.com');
    assert.equal(row['Google Contact ID'], c.resourceName);
    assert.match(row['Google Contact'], /^Saved /);
  });

  test('an admin adding a volunteer saves one too; edits update the same contact', () => {
    turnOn();
    const added = ok(rt.call('createVolunteer', { name: 'Omar Lee', email: 'omar@example.com', phone: '+6581234567', telegram: 'omar_lee' }, leader));
    assert.equal(added.contact.status, 'saved');
    assert.equal(contacts().length, 1);
    ok(rt.call('updatePerson', { userId: added.person.userId, phone: '8765 4321', telegram: 'omar_l2' }, leader));
    assert.equal(contacts().length, 1, 'no duplicate');
    assert.equal(contacts()[0].phoneNumbers[0].value, '87654321');
    assert.match(contacts()[0].biographies[0].value, /@omar_l2/);
    // The birthday is in the contact too
    ok(rt.call('updatePerson', { userId: added.person.userId, birthday: '2001-02-03' }, leader));
    assert.deepEqual(contacts()[0].birthdays[0].date, { year: 2001, month: 2, day: 3 });
    // Changes that aren't contact details don't call Google
    const calls = rt.contacts.state.calls.length;
    ok(rt.call('updatePerson', { userId: added.person.userId, emergencyName: 'Aunt May' }, leader));
    assert.equal(rt.contacts.state.calls.length, calls);
    // A volunteer editing their own phone updates their contact too
    ok(rt.call('syncContact', { userId: vol.user.userId }, leader));
    ok(rt.call('updateProfile', { phone: '9000 1111' }, vol.token));
    assert.equal(contacts().find((c) => c.emailAddresses[0].value === 'v1@example.com').phoneNumbers[0].value, '90001111');
  });

  test('if Google fails, the volunteer is still saved and the row says why; it can be retried', () => {
    turnOn();
    rt.contacts.state.failWith = 'Quota exceeded';
    const res = ok(rt.call('register', volunteerPayload({ email: 'fail@example.com' })));
    assert.equal(res.contact.status, 'failed');
    assert.match(rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'fail@example.com')['Google Contact'], /^Failed .*Quota exceeded/);
    rt.contacts.state.failWith = '';
    const retry = ok(rt.call('syncContact', { userId: res.user.userId }, leader));
    assert.match(retry.message, /Saved .* in Google Contacts/);
    assert.equal(retry.contact.saved, true);
    // Deleted in Google Contacts? Saving again creates it again.
    rt.contacts.people.clear();
    ok(rt.call('syncContact', { userId: res.user.userId }, leader));
    assert.equal(contacts().length, 1);
  });

  test('without the People API service added, registration works and says what to do', () => {
    turnOn();
    rt.evaluate('People = undefined');
    const res = ok(rt.call('register', volunteerPayload({ email: 'nopeople@example.com' })));
    assert.equal(res.contact.status, 'failed');
    assert.match(res.contact.message, /Services \(\+\) → People API/);
    assert.match(rt.run('testContactsAccess'), /Problem: The People API service is not added/);
  });

  test('syncAllContacts() saves existing volunteers once; testContactsAccess() reports OK', () => {
    turnOn('MINDS Volunteers');
    assert.match(rt.run('testContactsAccess'), /OK: contacts will be saved/);
    assert.match(rt.run('syncAllContacts'), /updated 0 and added 2 volunteer\(s\)/); // the admin and Vol One
    // Running it again updates everyone's contact in place (e.g. to a new name format): no duplicates.
    const first = [...rt.contacts.people.values()][0];
    first.names = [{ givenName: 'Old Format (Name)' }];
    assert.match(rt.run('syncAllContacts'), /updated 2 and added 0 volunteer\(s\)/);
    assert.equal(rt.contacts.people.size, 2, 'no duplicates');
    assert.ok(![...rt.contacts.people.values()].some((c) => c.names[0].givenName === 'Old Format (Name)'), 'the old name is replaced');
    assert.equal(contacts().length, 2);
  });
});

describe('Version 3: registration checks, deactivation, project names', () => {
  const formAnswers = (more = {}) => ({
    shortName: 'Mei', nric4: '123A', address: 'Blk 2 Woodlands Ave 2', project: 'RSPID (WGS)', startYear: '2024', shirtSize: 'S',
    emergencyRelation: 'Father', emergencyPhone: '+65 9876 5432', ...more,
  });
  const reg = (email, answers) => rt.call('register', volunteerPayload({ email, answers }));

  test('formats: NRIC last 4, year, emergency number, school email, matric number', () => {
    [['nric4', '1234'], ['nric4', '12AB'], ['nric4', 'S1234567A'], ['startYear', '24'], ['startYear', '2099'], ['startYear', 'abcd'],
      ['emergencyPhone', '1234'], ['schoolEmail', 'mei@ntu'], ['matricNo', 'U-12']].forEach(([key, value], i) => {
      fails(reg(`bad${i}@example.com`, formAnswers({ [key]: value })), 'VALIDATION_ERROR');
    });
    const ok1 = ok(reg('mei@example.com', formAnswers({ nric4: ' 123a ', matricNo: 'u2312345a', schoolEmail: 'MEI001@E.NTU.EDU.SG', courseYear: 'MAE, Y2' })));
    const row = rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'mei@example.com');
    assert.equal(row['NRIC (Last 4)'], '123A');
    assert.equal(row['Matriculation Number'], 'U2312345A');
    assert.equal(row['School Email'], 'mei001@e.ntu.edu.sg');
    assert.ok(ok1.user.answers.some((a) => a.key === 'matricNo' && a.private), 'RSPID questions shown for RSPID volunteers; matric is private');
    // Moving to West End clears the RSPID-only answers
    ok(rt.call('updateProfile', { answers: { project: 'West End' } }, ok1.token));
    const after = rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'mei@example.com');
    assert.deepEqual([after['Matriculation Number'], after['School Email'], after['Course and Year']], ['', '', '']);
  });

  test('required: short name, NRIC, address, project, start year, T-shirt, emergency contact', () => {
    ['shortName', 'nric4', 'address', 'project', 'startYear', 'shirtSize', 'emergencyRelation', 'emergencyPhone'].forEach((key, i) => {
      const e = fails(reg(`req${i}@example.com`, formAnswers({ [key]: '' })), 'VALIDATION_ERROR');
      assert.match(e.message, /Please answer/, key);
    });
  });

  test('deactivating someone takes them off upcoming sessions; their history is kept', () => {
    const s1 = createSession({ date: '2026-10-17' });
    const s2 = createSession({ date: '2026-10-24' });
    book(s1.sessionId);
    book(s2.sessionId);
    const past = createSession({ date: TODAY });
    const b = book(past.sessionId);
    rt.setNow(at('10:00'));
    ok(rt.call('manualClock', { bookingId: b }, leader));
    rt.setNow(at('12:00'));
    ok(rt.call('manualClock', { bookingId: b }, leader));
    rt.setNow(at('09:00', '2026-10-15'));
    const res = ok(rt.call('updatePerson', { userId: vol.user.userId, status: 'inactive' }, leader));
    assert.match(res.message, /Taken off 2 upcoming sessions/);
    const rows = rt.records(SHEET, 'Bookings').filter((r) => r['User ID'] === vol.user.userId);
    assert.deepEqual(rows.map((r) => r.Status).sort(), ['cancelled', 'cancelled', 'confirmed'], 'the past one is kept as it was');
    assert.equal(rt.records(SHEET, 'Attendance').filter((r) => r['User ID'] === vol.user.userId).length, 1, 'hours are kept');
    assert.equal(ok(rt.call('sessionDetail', { sessionId: s2.sessionId }, leader)).stats.booked, 0);
  });

  test('setup renames the projects to the form\'s names, in sessions too, once', () => {
    rt.fillTab(SHEET, 'Projects', [['Project ID', 'Project', 'Status'],
      ['P-1', 'West End (WE)', 'active'], ['P-2', 'Regular Service Project for the Intellectually Disabled (RSPID)', 'active']]);
    rt.run('setup');
    const s = createSession();
    const tab = rt.tab(SHEET, 'Sessions');
    const header = tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0];
    tab.getRange(2, header.indexOf('Project') + 1).setValue('West End (WE), Regular Service Project for the Intellectually Disabled (RSPID)');
    rt.fillTab(SHEET, 'Projects', [['Project ID', 'Project', 'Status'],
      ['P-1', 'West End (WE)', 'active'], ['P-2', 'Regular Service Project for the Intellectually Disabled (RSPID)', 'active']]);
    const report = rt.run('setup');
    assert.match(report, /Renamed project\(s\) "West End \(WE\)" → "West End".*updated 1 session/);
    assert.deepEqual(rt.records(SHEET, 'Projects').filter((p) => p.Status !== 'archived').map((p) => p.Project).sort(), ['RSPID (CTDC)', 'RSPID (WGS)', 'West End']);
    assert.equal(rt.records(SHEET, 'Sessions').find((r) => r['Session ID'] === s.sessionId).Project, 'West End, RSPID (WGS)');
    assert.ok(!/Renamed project/.test(rt.run('setup')), 'nothing to do the second time');
  });

  test('Google Contacts: first name "Short Name_[Full Name]_Project", birthday, 8-digit phone; project and emergency contact in the notes', () => {
    rt.props.set('CONTACTS_SYNC', 'on');
    const res = ok(rt.call('register', volunteerPayload({ name: 'Tan Mei Ling', email: 'meiling@example.com', phone: '+65 9123 4567', birthday: '2003-04-05', answers: formAnswers() })));
    const c = [...rt.contacts.people.values()][0];
    assert.deepEqual(c.names[0], { givenName: 'Mei_[Tan Mei Ling]_RSPID (WGS)' }, 'first name only');
    assert.deepEqual(c.birthdays[0].date, { year: 2003, month: 4, day: 5 });
    assert.equal(c.phoneNumbers[0].value, '91234567');
    assert.match(c.biographies[0].value, /Project: RSPID \(WGS\)\nEmergency contact: \+65 98765432 \(Father\)/);
    assert.match(c.biographies[0].value, /MINDS volunteer\.$/, 'ends with "MINDS volunteer."');
    assert.ok(!c.biographies[0].value.includes('123A') && !c.biographies[0].value.includes('Woodlands Ave'), 'no NRIC or address in contacts');
    // Editing the full name updates the contact.
    ok(rt.call('updateProfile', { name: 'Tan Mei-Ling' }, res.token));
    assert.equal([...rt.contacts.people.values()][0].names[0].givenName, 'Mei_[Tan Mei-Ling]_RSPID (WGS)');
  });
});

describe('Advanced Settings (one-time functions from the app)', () => {
  test('admins list and run them; ones that change data need the admin password; all are logged', () => {
    const list = ok(rt.call('maintenanceTasks', {}, leader)).tasks.map((t) => `${t.key}:${t.changesData}`);
    assert.deepEqual(list, ['checkConfig:false', 'setup:true', 'syncAllContacts:true']);
    assert.match(ok(rt.call('runMaintenance', { task: 'checkConfig' }, leader)).report, /Main sheet/);
    fails(rt.call('runMaintenance', { task: 'setup' }, leader), 'PASSWORD_REQUIRED');
    const res = ok(rt.call('runMaintenance', { task: 'setup', adminPassword: ADMIN_PW }, leader));
    assert.match(res.message, /Run setup: done/);
    fails(rt.call('runMaintenance', { task: 'syncAllContacts', adminPassword: ADMIN_PW }, leader), 'CONFLICT'); // sync is off
    rt.props.set('CONTACTS_SYNC', 'on');
    assert.match(ok(rt.call('runMaintenance', { task: 'syncAllContacts', adminPassword: ADMIN_PW }, leader)).report, /added 2 volunteer/);
    fails(rt.call('runMaintenance', { task: 'deleteEverything', adminPassword: ADMIN_PW }, leader), 'VALIDATION_ERROR');
    fails(rt.call('runMaintenance', { task: 'checkConfig' }, vol.token), 'FORBIDDEN');
    const log = JSON.stringify(rt.records(SHEET, 'Admin Activity Log'));
    assert.match(log, /Ran an Advanced Settings function.*Run setup/);
    assert.ok(!log.includes(ADMIN_PW));
  });
});

describe('Settings → Google Sheets (link the databases from the app)', () => {
  const pw = { adminPassword: ADMIN_PW };
  test('lists the two databases: volunteers, and trainees & house visits (one spreadsheet)', () => {
    const d = ok(rt.call('dataSources', {}, leader)).sources;
    assert.deepEqual(d.map((s) => s.key), ['volunteers', 'trainees']);
    assert.equal(d[0].linked.id, SHEET);
    assert.equal(d[0].check.ok, true);
    fails(rt.call('dataSources', {}, vol.token), 'FORBIDDEN');
  });

  test('search Google Drive, then link a trainee sheet by its URL; the app checks it first', () => {
    const other = rt.createSpreadsheet('trainee-book', 'MINDS Trainee List 2027');
    rt.fillTab('trainee-book', 'Form Responses 1', [['Trainee’s Full Name', 'Gender'], ['Kim Lee', 'Female']]);
    rt.fillTab('trainee-book', 'Notes', [['Something'], ['x']]);
    const found = ok(rt.call('searchSheets', { query: 'trainee list' }, leader)).results;
    assert.deepEqual(found.map((f) => f.name), ['MINDS Trainee List 2027']);
    fails(rt.call('connectDataSource', { source: 'trainees', ref: other.getUrl() }, leader), 'PASSWORD_REQUIRED');
    const res = ok(rt.call('connectDataSource', { source: 'trainees', ref: other.getUrl(), ...pw }, leader));
    assert.match(res.message, /Linked "MINDS Trainee List 2027" as the trainee & house visit database/);
    assert.equal(res.sources[1].linked.tab, 'Form Responses 1', 'finds the tab with the name column');
    assert.match(rt.props.get('TRAINEE_SPREADSHEET_ID'), /trainee-book\/edit#gid=\d+/);
    assert.deepEqual(ok(rt.call('listTrainees', {}, leader)).trainees.map((t) => t.name), ['Kim Lee']);
    // a sheet without a name column, or one the app can't open, is refused
    rt.createSpreadsheet('empty-book', 'Empty');
    rt.fillTab('empty-book', 'Sheet1', [['Hello']]);
    assert.match(fails(rt.call('connectDataSource', { source: 'trainees', ref: 'empty-book', ...pw }, leader), 'VALIDATION_ERROR').message, /missing: a tab with a "Name"/);
    fails(rt.call('connectDataSource', { source: 'trainees', ref: 'https://docs.google.com/spreadsheets/d/nope/edit', ...pw }, leader), 'VALIDATION_ERROR');
  });

  test('the volunteer database: a sheet without your account is refused; "Create new sheet" copies the current one', () => {
    rt.createSpreadsheet('stranger', 'Someone else');
    fails(rt.call('connectDataSource', { source: 'volunteers', ref: 'stranger', ...pw }, leader), 'VALIDATION_ERROR'); // no app tabs at all
    const res = ok(rt.call('createDataSource', { source: 'volunteers', name: 'MINDS Volunteers (copy)', ...pw }, leader));
    assert.match(res.message, /Created "MINDS Volunteers \(copy\)"/);
    assert.notEqual(rt.props.get('SPREADSHEET_ID'), SHEET);
    assert.equal(ok(rt.call('me', {}, leader)).user.role, 'admin', 'still signed in: the copy has everyone\'s sign-ins');
    assert.equal(res.sources[0].linked.name, 'MINDS Volunteers (copy)');
    // link the original back: it has this admin's account, so it's allowed
    ok(rt.call('connectDataSource', { source: 'volunteers', ref: SHEET, ...pw }, leader));
    assert.match(rt.props.get('SPREADSHEET_ID'), new RegExp(SHEET));
  });

  test('house visits are kept in the trainee spreadsheet: there is no separate house visit database', () => {
    fails(rt.call('createDataSource', { source: 'visits', ...pw }, leader), 'VALIDATION_ERROR');
  });
});

describe('Version 4: short names in the app', () => {
  let rt, admin;
  beforeEach(() => {
    rt = createGasRuntime();
    rt.createSpreadsheet(SHEET, 'Main');
    rt.props.set('SPREADSHEET_ID', SHEET);
    rt.fillTab(SHEET, 'Trainees', [['Trainee ID', 'Name'], ['T-0001', 'Alpha One']]);
    rt.run('setup');
    rt.props.set('FIRST_ADMIN_EMAIL', 'boss@example.com');
    ok(rt.call('register', volunteerPayload({ name: 'Boss Person', email: 'boss@example.com' })));
    rt.run('makeFirstAdmin');
    admin = ok(rt.call('login', { email: 'boss@example.com', password: 'password123' })).token;
  });
  const join = (name, email, shortName) => ok(rt.call('register', volunteerPayload({
    name, email,
    answers: { shortName, nric4: '123A', address: 'Blk 1', project: 'West End', startYear: '2024', shirtSize: 'M', emergencyRelation: 'Mother', emergencyPhone: '+65 9876 5432' },
  })));


  test('short names, full names for a clash, alphanumeric order; full name kept alongside', () => {
    join('Tan Wei Jie', 'wj1@example.com', 'Wei Jie');
    join('Lim Wei Jie', 'wj2@example.com', 'Wei Jie');
    join('Koh Ben', 'ben@example.com', 'Ben');
    join('Ng Ali', 'ali10@example.com', 'Ali 10');
    join('Ong Ali', 'ali2@example.com', 'Ali 2');
    const people = ok(rt.call('listPeople', {}, admin)).people;
    const names = people.map((p) => p.name);
    assert.deepEqual(names.filter((n) => n !== 'Boss Person'), ['Ali 2', 'Ali 10', 'Ben', 'Lim Wei Jie', 'Tan Wei Jie'],
      'short names in alphanumeric order ("Ali 2" before "Ali 10"); the two "Wei Jie"s show their full names');
    const ben = people.find((p) => p.name === 'Ben');
    assert.equal(ben.fullName, 'Koh Ben', 'the full name comes along, for searches and titles');
    // Edit forms keep the real Full Name.
    const detail = ok(rt.call('personDetail', { userId: ben.userId }, admin)).person;
    assert.equal(detail.name, 'Koh Ben');
  });
});

describe('Version 4: files attached to notes', () => {
  let rt, admin;
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  beforeEach(() => {
    rt = createGasRuntime();
    rt.createSpreadsheet(SHEET, 'Main');
    rt.props.set('SPREADSHEET_ID', SHEET);
    rt.fillTab(SHEET, 'Trainees', [['Trainee ID', 'Name'], ['T-0001', 'Alpha One']]);
    rt.run('setup');
    rt.props.set('FIRST_ADMIN_EMAIL', 'boss@example.com');
    ok(rt.call('register', volunteerPayload({ name: 'Boss Person', email: 'boss@example.com' })));
    rt.run('makeFirstAdmin');
    admin = ok(rt.call('login', { email: 'boss@example.com', password: 'password123' })).token;
  });
  const regular = (email) => {
    const v = ok(rt.call('register', volunteerPayload({ name: email.split('@')[0], email })));
    ok(rt.call('setVolunteerType', { userId: v.user.userId, volunteerType: 'regular' }, admin));
    return v;
  };

  test('a photo with an update: private Drive file, opened only by people who may read the note', () => {
    const rex = regular('rex@example.com');
    const rina = regular('rina@example.com');
    ok(rt.call('submitTraineeUpdate', { traineeId: 'T-0001', note: 'Loved the music today.', files: [{ fileName: 'music.png', mimeType: 'image/png', data: PNG }] }, rex.token));
    const item = ok(rt.call('reviewQueue', {}, admin)).items[0];
    assert.equal(item.attachments.length, 1);
    assert.equal(item.attachments[0].name, 'music.png');
    const fileId = item.attachments[0].id;
    // Waiting for review: the author can open it, other volunteers can't.
    assert.equal(ok(rt.call('noteFile', { feedbackId: item.feedbackId, fileId }, rex.token)).data, PNG);
    fails(rt.call('noteFile', { feedbackId: item.feedbackId, fileId }, rina.token), 'FORBIDDEN');
    // Shared with all volunteers: the note keeps the file, and Rina can open it.
    ok(rt.call('reviewObservation', { feedbackId: item.feedbackId, audience: 'all' }, admin));
    const notes = ok(rt.call('traineeInfo', { traineeId: 'T-0001' }, rina.token)).notes;
    const note = notes.find((n) => n.note === 'Loved the music today.');
    assert.equal(note.attachments[0].id, fileId);
    const file = ok(rt.call('noteFile', { noteId: note.noteId, fileId }, rina.token));
    assert.equal(file.mimeType, 'image/png');
    assert.equal(file.data, PNG);
    // Made private: only admins.
    ok(rt.call('setNoteSharing', { noteId: note.noteId, audience: 'private' }, admin));
    fails(rt.call('noteFile', { noteId: note.noteId, fileId }, rina.token), 'FORBIDDEN');
    ok(rt.call('noteFile', { noteId: note.noteId, fileId }, admin));
    // The Drive file was never shared by link.
    const driveFile = rt.drive.files.get(fileId);
    assert.equal(driveFile.sharing, 'PRIVATE');
  });

  test('limits: three files, 10 MB together, no programs', () => {
    const rex = regular('rex@example.com');
    const f = { fileName: 'a.png', mimeType: 'image/png', data: PNG };
    fails(rt.call('submitTraineeUpdate', { traineeId: 'T-0001', note: 'x', files: [f, f, f, f] }, rex.token), 'VALIDATION_ERROR');
    fails(rt.call('submitTraineeUpdate', { traineeId: 'T-0001', note: 'x', files: [{ fileName: 'run.exe', mimeType: 'application/x-msdownload', data: PNG }] }, rex.token), 'VALIDATION_ERROR');
  });
});
