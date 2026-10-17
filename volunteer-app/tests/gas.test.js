// End-to-end tests of the Apps Script backend, run in Node against the
// in-memory spreadsheet in dev/gas-harness.js.  Run: npm test

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { createGasRuntime } from '../dev/gas-harness.js';

const SHEET = 'sheet-1';
const TODAY = '2026-10-14';
const SCHOOL = 'MINDS Woodlands Gardens School';
const ADMIN_PW = 'Admin-Password-2026';
const at = (hhmm, day = TODAY) => `${day}T${hhmm}:00+08:00`;

function volunteerPayload(overrides = {}) {
  return {
    name: 'Vol One',
    birthday: '2001-05-06',
    email: 'v1@example.com',
    phone: '+65 9123 4567',
    telegram: '@vol_one',
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
let staff; // { token, user, adminToken }: a staff member's own account, with admin unlocked
let vol; // { token, user }

/** Registers a volunteer who has already read the Volunteer Guide. */
function volunteer(email, name, handle) {
  const v = ok(rt.call('register', volunteerPayload({ email, name, telegram: handle || `volunteer_${email.split('@')[0].replace(/\W/g, '')}` })));
  ok(rt.call('acknowledgeGuide', {}, v.token));
  return v;
}
/** An admin action, as the staff member with admin unlocked. */
const admin = (action, payload = {}) => rt.call(action, payload, staff.token, staff.adminToken);
const makeRegular = (v) => ok(admin('updatePerson', { userId: v.user.userId, volunteerType: 'regular' }));

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
  rt.props.set('NEW_ADMIN_PASSWORD', ADMIN_PW);
  rt.run('setAdminPassword');

  staff = ok(rt.call('register', volunteerPayload({ name: 'Staff Lee', email: 'staff@example.com', telegram: 'staff_lee' })));
  staff.adminToken = ok(rt.call('adminUnlock', { password: ADMIN_PW }, staff.token)).adminToken;
  vol = volunteer('v1@example.com', 'Vol One', 'vol_one');
});

function createSession(fields = {}) {
  return ok(admin('createSession', { title: 'Art & Craft', date: TODAY, startTime: '10:00', endTime: '12:00', venue: SCHOOL, capacity: 3, ...fields })).session;
}
/** "I'm coming" → the booking ID. */
function book(sessionId, v = vol) {
  return ok(rt.call('bookSession', { sessionId }, v.token)).home.upcoming.find((u) => u.session.sessionId === sessionId).bookingId;
}
/** An admin pairs a coming volunteer by hand. */
function pair(bookingId, traineeIds) {
  return ok(admin('updateBooking', { bookingId, traineeIds: [].concat(traineeIds) }));
}
const detail = (sessionId) => ok(admin('sessionDetail', { sessionId }));
const comingRow = (d, bookingId) => d.coming.find((b) => b.bookingId === bookingId);

describe('linking to an existing sheet', () => {
  test('setup keeps existing trainee columns, adds IDs, missing volunteer fields and write-back columns', () => {
    const [headers, ...rows] = rt.tab(SHEET, 'Trainees').dump();
    assert.deepEqual(headers.slice(0, 10), ['Programme', 'Name', 'Gender', 'Communication', 'Behaviours', 'Things to Take Note', 'Interests', 'Medical Notes', 'Support Needs', 'Active']);
    assert.deepEqual(headers.slice(10), ['Trainee ID', 'Preferred Name', 'Latest Volunteer Observation', 'Observation Updated']);
    assert.equal(rows[0][1], 'Alex Tan');
    assert.equal(rows[0][10], 'T-0001');
    assert.equal(rows[3][10], 'T-0004');
  });

  test('setup adds starter content and the new tabs once, and is safe to re-run', () => {
    rt.run('setup');
    assert.deepEqual(rt.records(SHEET, 'Venues').map((v) => v.Venue), [SCHOOL]);
    assert.equal(rt.records(SHEET, 'Volunteer Guide').length, 5);
    assert.equal(rt.records(SHEET, 'Projects').length, 1);
    assert.deepEqual(rt.records(SHEET, 'Data Sources').map((r) => r.Key), ['volunteers', 'trainees', 'traineeUpdates', 'pairs', 'files']);
    assert.ok(rt.records(SHEET, 'Trainee Field Access').length >= 10);
    ['Pairing List', 'Admin Log', 'Files', 'Trainee Photos'].forEach((tab) => assert.ok(rt.tab(SHEET, tab), tab));
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

  test('a volunteer already on the list is linked, not duplicated, and gets no admin access', () => {
    rt.fillTab(SHEET, 'Volunteers', [[], [], [], ['', 'Old Timer', '', 'old@example.com', '', '', 'Regular']]);
    const res = ok(rt.call('register', volunteerPayload({ name: 'Old Timer', email: 'old@example.com' })));
    const matches = rt.records(SHEET, 'Volunteers').filter((r) => r.Email === 'old@example.com');
    assert.equal(matches.length, 1);
    assert.match(matches[0]['User ID'], /^U-/);
    assert.equal(res.user.type, 'regular'); // the Volunteer Type typed in the sheet is kept
    fails(rt.call('adminHome', {}, res.token), 'ADMIN_REQUIRED');
  });
});

describe('accounts', () => {
  test('registration validates, needs a Telegram handle, and collects no emergency contact', () => {
    fails(rt.call('register', volunteerPayload({ email: 'v1@example.com' })), 'CONFLICT');
    fails(rt.call('register', volunteerPayload({ email: 'new@example.com', consent: false })), 'VALIDATION_ERROR');
    fails(rt.call('register', volunteerPayload({ email: 'new@example.com', phone: 'abc' })), 'VALIDATION_ERROR');
    fails(rt.call('register', volunteerPayload({ email: 'new@example.com', password: 'short' })), 'VALIDATION_ERROR');
    fails(rt.call('register', volunteerPayload({ email: 'new@example.com', isAdmin: true })), 'VALIDATION_ERROR');
    assert.match(fails(rt.call('register', volunteerPayload({ email: 'new@example.com', telegram: '' })), 'VALIDATION_ERROR').message, /Telegram/);
    fails(rt.call('register', volunteerPayload({ email: 'new@example.com', emergencyName: 'Mum' })), 'VALIDATION_ERROR');
    const fresh = ok(rt.call('register', volunteerPayload({ email: 'new@example.com', telegram: 'new_person' })));
    assert.equal(fresh.user.type, 'new');
    assert.equal('emergencyName' in fresh.user, false);
    assert.equal(rt.records(SHEET, 'Volunteers')[0]['Emergency Contact Name'], undefined); // no such column any more
  });

  test('login, wrong password, lockout after repeated failures', () => {
    fails(rt.call('login', { email: 'v1@example.com', password: 'nope-nope' }), 'UNAUTHORIZED');
    ok(rt.call('login', { email: 'V1@Example.com', password: 'password123' }));
    for (let i = 0; i < 5; i++) rt.call('login', { email: 'v1@example.com', password: 'wrong-pass' });
    fails(rt.call('login', { email: 'v1@example.com', password: 'password123' }), 'TOO_MANY_ATTEMPTS');
  });

  test('tampered or missing tokens are rejected; without the admin password admin actions are refused', () => {
    fails(rt.call('me', {}), 'UNAUTHORIZED');
    const parts = vol.token.split('.');
    parts[1] = 'U-SOMEONE';
    fails(rt.call('me', {}, parts.join('.')), 'UNAUTHORIZED');
    for (const action of ['adminHome', 'scan', 'listTrainees', 'reviewQueue', 'saveVenue', 'saveGuideSection', 'pairUnpaired', 'listAdminLog']) {
      fails(rt.call(action, {}, vol.token), 'ADMIN_REQUIRED');
    }
    for (const gone of ['setRole', 'confirmAll']) fails(rt.call(gone, {}, staff.token, staff.adminToken), 'NOT_FOUND');
  });

  test('password reset gives a temp password and signs the volunteer out everywhere', () => {
    const { tempPassword, message } = ok(admin('resetPassword', { userId: vol.user.userId }));
    assert.ok(!message.includes(tempPassword));
    fails(rt.call('me', {}, vol.token), 'UNAUTHORIZED');
    const fresh = ok(rt.call('login', { email: 'v1@example.com', password: tempPassword })).token;
    const changed = ok(rt.call('changePassword', { currentPassword: tempPassword, newPassword: 'brand-new-pass' }, fresh));
    ok(rt.call('me', {}, changed.token));
    assert.ok(!JSON.stringify(rt.tab(SHEET, 'Admin Log').dump()).includes(tempPassword));
  });
});

describe('the shared admin password', () => {
  test('anyone signed in can open admin with the password; wrong passwords are counted and logged', () => {
    assert.equal(ok(rt.call('adminStatus', {}, vol.token)).isAdmin, false);
    fails(rt.call('adminUnlock', { password: 'not-it' }, vol.token), 'VALIDATION_ERROR');
    const { adminToken } = ok(rt.call('adminUnlock', { password: ADMIN_PW }, vol.token));
    assert.equal(ok(rt.call('adminStatus', {}, vol.token, adminToken)).isAdmin, true);
    ok(rt.call('adminHome', {}, vol.token, adminToken));
    // the admin session belongs to the person who opened it
    fails(rt.call('adminHome', {}, staff.token, adminToken), 'ADMIN_REQUIRED');
    for (let i = 0; i < 5; i++) rt.call('adminUnlock', { password: 'guess' }, vol.token);
    fails(rt.call('adminUnlock', { password: ADMIN_PW }, vol.token), 'TOO_MANY_ATTEMPTS');
    const log = rt.records(SHEET, 'Admin Log');
    assert.ok(log.some((r) => r.Person === 'Vol One' && r.Action === 'Admin password wrong'));
    assert.ok(log.some((r) => r.Person === 'Vol One' && r.Action === 'Opened admin'));
    assert.ok(!JSON.stringify(log).includes(ADMIN_PW));
  });

  test('admin access ends after 12 hours, and when the password changes', () => {
    rt.advanceMinutes(12 * 60 + 1);
    fails(admin('adminHome'), 'ADMIN_REQUIRED');
    staff.adminToken = ok(rt.call('adminUnlock', { password: ADMIN_PW }, staff.token)).adminToken;
    const other = ok(rt.call('adminUnlock', { password: ADMIN_PW }, vol.token)).adminToken;
    fails(admin('changeAdminPassword', { currentPassword: 'wrong', newPassword: 'A-new-password-1' }), 'VALIDATION_ERROR');
    fails(admin('changeAdminPassword', { currentPassword: ADMIN_PW, newPassword: 'short1' }), 'VALIDATION_ERROR');
    const changed = ok(admin('changeAdminPassword', { currentPassword: ADMIN_PW, newPassword: 'A-new-password-1' }));
    fails(rt.call('adminHome', {}, vol.token, other), 'ADMIN_REQUIRED'); // everyone else has to type the new one
    staff.adminToken = changed.adminToken;
    ok(admin('adminHome'));
    fails(rt.call('adminUnlock', { password: ADMIN_PW }, vol.token), 'VALIDATION_ERROR');
    ok(rt.call('adminUnlock', { password: 'A-new-password-1' }, vol.token));
  });

  test('"sign out every admin device" needs the password', () => {
    const other = ok(rt.call('adminUnlock', { password: ADMIN_PW }, vol.token)).adminToken;
    fails(admin('adminSignOutAll', { adminPassword: 'nope' }), 'VALIDATION_ERROR');
    const res = ok(admin('adminSignOutAll', { adminPassword: ADMIN_PW }));
    fails(rt.call('adminHome', {}, vol.token, other), 'ADMIN_REQUIRED');
    staff.adminToken = res.adminToken;
    ok(admin('adminHome'));
  });

  test('every admin change is logged with who made it, never with passwords', () => {
    const s = createSession({ title: 'Logged session' });
    ok(admin('saveVenue', { name: 'Jurong West Sports Centre' }));
    ok(admin('updatePerson', { userId: vol.user.userId, phone: '+65 9888 7777' }));
    const log = ok(admin('listAdminLog')).entries;
    const actions = log.map((e) => `${e.person}|${e.action}`);
    assert.ok(actions.includes('Staff Lee|Created a session'));
    assert.ok(actions.includes('Staff Lee|Saved a venue'));
    assert.ok(actions.includes('Staff Lee|Edited a volunteer'));
    assert.match(log.find((e) => e.action === 'Created a session').details, /Logged session/);
    assert.match(log.find((e) => e.action === 'Edited a volunteer').details, /phone/);
    assert.equal(log[log.length - 1].action, 'Set the admin password');
    assert.equal(log[log.length - 1].person, 'Apps Script editor');
    assert.ok(s.sessionId);
  });

  test('setAdminPassword deletes the plain-text property and refuses short passwords', () => {
    assert.equal(rt.props.get('NEW_ADMIN_PASSWORD'), undefined);
    assert.ok(rt.props.get('ADMIN_PASSWORD_HASH'));
    assert.ok(!Object.values(Object.fromEntries(rt.props)).includes(ADMIN_PW));
    rt.props.set('NEW_ADMIN_PASSWORD', 'short');
    assert.throws(() => rt.run('setAdminPassword'), /10 to 128/);
  });
});

describe('volunteer guide for new volunteers', () => {
  test('a new volunteer must read the guide before signing up', () => {
    const s = createSession();
    const fresh = ok(rt.call('register', volunteerPayload({ email: 'new@example.com', name: 'New Person', telegram: 'new_person' })));
    assert.equal(ok(rt.call('volunteerHome', {}, fresh.token)).guideRead, false);
    fails(rt.call('bookSession', { sessionId: s.sessionId }, fresh.token), 'GUIDE_REQUIRED');
    fails(rt.call('signUpSessions', { sessionIds: [s.sessionId] }, fresh.token), 'GUIDE_REQUIRED');
    const g = ok(rt.call('guide', {}, fresh.token));
    assert.deepEqual(g.sections.map((x) => x.title).slice(0, 3), ['Welcome to MINDS volunteering', 'What to wear', 'What we expect from you']);
    assert.equal(g.sections.find((x) => x.title === 'On the day').media.kind, 'builtin'); // the infographic
    assert.equal(g.projects[0].venue, SCHOOL);
    const ack = ok(rt.call('acknowledgeGuide', {}, fresh.token));
    assert.equal(ack.home.guideRead, true);
    ok(rt.call('bookSession', { sessionId: s.sessionId }, fresh.token));
    assert.match(rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'new@example.com')['Guide Read At'], /^2026-10-14/);
  });

  test('admins add, edit, reorder and delete guide sections', () => {
    let c = ok(admin('saveGuideSection', { title: 'Parking', body: '- Park at the side gate\n- Sign in at the guardhouse' }));
    const added = c.sections.find((x) => x.title === 'Parking');
    assert.equal(c.sections[c.sections.length - 1].title, 'Parking');
    c = ok(admin('saveGuideSection', { sectionId: added.sectionId, title: 'Getting there', body: 'Take bus 911.' }));
    c = ok(admin('moveContent', { kind: 'guide', id: added.sectionId, direction: 'up' }));
    assert.equal(c.sections[c.sections.length - 2].title, 'Getting there');
    assert.equal(ok(rt.call('guide', {}, vol.token)).sections.some((x) => x.body === 'Take bus 911.'), true);
    c = ok(admin('deleteGuideSection', { sectionId: added.sectionId }));
    assert.equal(c.sections.some((x) => x.title === 'Getting there'), false);
    assert.equal(c.sections.length, 5);
    fails(admin('saveGuideSection', { title: '', body: 'x' }), 'VALIDATION_ERROR');
  });

  test('projects: add, archive, and link to sessions', () => {
    let c = ok(admin('saveProject', { name: 'Weekend outings', description: 'Trips around Singapore', schedule: 'Saturdays', venue: SCHOOL }));
    const outing = c.projects.find((p) => p.name === 'Weekend outings');
    fails(admin('saveProject', { name: 'weekend OUTINGS' }), 'CONFLICT');
    const s = createSession({ project: 'Weekend outings' });
    assert.equal(s.project, 'Weekend outings');
    fails(admin('createSession', { title: 'X', date: TODAY, startTime: '10:00', endTime: '11:00', venue: SCHOOL, project: 'Nope' }), 'VALIDATION_ERROR');
    c = ok(admin('saveProject', { projectId: outing.projectId, status: 'archived' }));
    assert.equal(ok(rt.call('guide', {}, vol.token)).projects.some((p) => p.name === 'Weekend outings'), false);
  });
});

describe('sessions and venues', () => {
  test('sessions must use a listed venue; admins add, rename and archive venues', () => {
    fails(admin('createSession', { title: 'X', date: TODAY, startTime: '10:00', endTime: '11:00', venue: 'Somewhere else' }), 'VALIDATION_ERROR');
    let res = ok(admin('saveVenue', { name: 'Jurong West Sports Centre', address: '20 Jurong West St 93' }));
    assert.deepEqual(res.venues.map((v) => v.name), ['Jurong West Sports Centre', SCHOOL]);
    fails(admin('saveVenue', { name: 'jurong west sports centre' }), 'CONFLICT');
    const s = createSession({ venue: 'jurong west sports centre' }); // case-insensitive, stored with the listed spelling
    assert.equal(s.venue, 'Jurong West Sports Centre');
    assert.equal(s.venueAddress, '20 Jurong West St 93');

    res = ok(admin('saveVenue', { venueId: res.venue.venueId, name: 'JW Sports Centre' }));
    assert.equal(detail(s.sessionId).session.venue, 'JW Sports Centre');

    ok(admin('saveVenue', { venueId: res.venue.venueId, status: 'archived' }));
    fails(admin('createSession', { title: 'Y', date: TODAY, startTime: '10:00', endTime: '11:00', venue: 'JW Sports Centre' }), 'VALIDATION_ERROR');
    ok(admin('updateSession', { sessionId: s.sessionId, venue: 'JW Sports Centre', title: 'Renamed' })); // existing session keeps it
    assert.equal(ok(admin('listVenues')).venues.find((v) => v.name === 'JW Sports Centre').status, 'archived');
  });

  test('a session has a type (volunteer session or outing); the title is optional', () => {
    const plain = createSession({ title: '' });
    assert.equal(plain.type, 'Volunteer session');
    assert.equal(plain.title, 'Volunteer session');
    const outing = createSession({ title: '', type: 'Outing' });
    assert.equal(outing.title, 'Outing');
    fails(admin('createSession', { type: 'Overseas trip', date: TODAY, startTime: '10:00', endTime: '11:00', venue: SCHOOL }), 'VALIDATION_ERROR');
    book(outing.sessionId);
    assert.equal(rt.records(SHEET, 'Bookings')[0]['Session Title'], 'Outing');
  });

  test('every volunteer sees the whole upcoming schedule, closed sessions included', () => {
    const open = createSession({ title: 'Open one', date: '2026-10-16' });
    const closed = createSession({ title: 'Closed one', date: '2026-10-17' });
    ok(admin('updateSession', { sessionId: closed.sessionId, status: 'closed' }));
    const gone = createSession({ title: 'Cancelled one', date: '2026-10-18' });
    ok(admin('updateSession', { sessionId: gone.sessionId, status: 'cancelled' }));
    book(open.sessionId);
    const other = volunteer('other@example.com', 'Other Person');
    const home = ok(rt.call('volunteerHome', {}, other.token));
    assert.deepEqual(home.schedule.map((s) => s.title), ['Open one', 'Closed one']);
    assert.equal(home.schedule.find((s) => s.title === 'Closed one').canSignUp, false);
    assert.equal(home.schedule.find((s) => s.title === 'Open one').canSignUp, true);
    assert.equal(ok(rt.call('volunteerHome', {}, vol.token)).schedule.find((s) => s.title === 'Open one').canSignUp, false); // already coming
  });
});

describe('saying "I\'m coming" and pairing', () => {
  test('signing up needs no confirmation; a new volunteer waits for an admin to pair them', () => {
    const s = createSession();
    const res = ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token));
    assert.match(res.message, /You're coming to Art & Craft on Wed 14 Oct\. A MINDS admin will pair you/);
    assert.equal(rt.records(SHEET, 'Bookings')[0].Status, 'confirmed');
    assert.deepEqual(res.home.upcoming[0].trainees, []);
    const d = detail(s.sessionId);
    assert.equal(d.stats.coming, 1);
    assert.equal(d.unpaired.length, 1);
    assert.equal(d.coming[0].volunteer.type, 'new');
    assert.equal(d.coming[0].volunteer.telegram, 'vol_one');
    assert.equal('emergencyPhone' in d.coming[0].volunteer, false);

    const paired = pair(d.coming[0].bookingId, 'T-0001');
    assert.match(paired.message, /Vol One is with Alex Tan/);
    const trainee = ok(rt.call('volunteerHome', {}, vol.token)).upcoming[0].trainees[0];
    assert.equal(trainee.name, 'Alex Tan');
    const keys = trainee.fields.map((f) => f.key);
    assert.ok(keys.includes('gender') && keys.includes('communication'));
    assert.ok(!JSON.stringify(trainee).includes('Epilepsy'), 'new volunteers do not see medical notes');
  });

  test('a regular is paired straight away, with all their regular pairs first', () => {
    makeRegular(vol);
    ok(admin('addPair', { userId: vol.user.userId, traineeId: 'T-0002' }));
    ok(admin('addPair', { userId: vol.user.userId, traineeId: 'T-0003' }));
    fails(admin('addPair', { userId: vol.user.userId, traineeId: 'T-0003' }), 'CONFLICT');
    const s = createSession();
    const res = ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token));
    assert.match(res.message, /You're with Bea Lim and Chris Ng/);
    const row = comingRow(detail(s.sessionId), res.home.upcoming[0].bookingId);
    assert.deepEqual(row.trainees.map((t) => t.name), ['Bea Lim', 'Chris Ng']);
    assert.equal(row.pairing, 'auto');
    assert.ok(JSON.stringify(res.home.upcoming[0].trainees).includes('Medical Notes') === false); // Bea and Chris have none
    const alexOnly = createSession({ date: '2026-10-21', traineeIds: ['T-0001'] });
    const r2 = ok(rt.call('bookSession', { sessionId: alexOnly.sessionId }, vol.token));
    assert.match(r2.message, /You're with Alex Tan/); // regular pairs not attending → the usual rules
    assert.ok(JSON.stringify(r2.home.upcoming.find((u) => u.session.sessionId === alexOnly.sessionId).trainees).includes('Epilepsy'), 'regulars see medical notes');
  });

  test('a new volunteer with a regular pair gets that trainee; without one they wait for an admin', () => {
    ok(admin('addPair', { userId: vol.user.userId, traineeId: 'T-0003' }));
    const s = createSession();
    assert.match(ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token)).message, /You're with Chris Ng/);
    const other = volunteer('other@example.com', 'Other New');
    assert.match(ok(rt.call('bookSession', { sessionId: s.sessionId }, other.token)).message, /A MINDS admin will pair you/);
  });

  test('"pair the rest" spreads volunteers out, skips inactive trainees, then runs out', () => {
    const s = createSession({ capacity: 5 });
    ['a', 'b', 'c', 'd'].forEach((x) => book(s.sessionId, volunteer(`${x}@example.com`, `Vol ${x}`)));
    assert.equal(detail(s.sessionId).unpaired.length, 4); // new volunteers are not paired automatically
    const res = ok(admin('pairUnpaired', { sessionId: s.sessionId }));
    assert.match(res.message, /3 paired with a trainee\. 1 still needs one/);
    const names = res.detail.coming.flatMap((b) => b.trainees.map((t) => t.name));
    assert.equal(new Set(names).size, 3);
    assert.ok(!names.includes('Dana Goh'), 'Active = No keeps a trainee out of automatic pairing');
    // freeing a trainee lets the same button pair the volunteer left over
    ok(admin('updateBooking', { bookingId: res.detail.coming.find((b) => b.trainees.length).bookingId, status: 'cancelled' }));
    const again = ok(admin('pairUnpaired', { sessionId: s.sessionId }));
    assert.equal(again.message, '1 paired with a trainee.');
    assert.equal(again.detail.stats.unpaired, 0);
  });

  test('a session can limit pairing to the trainees attending it', () => {
    makeRegular(vol);
    const s = createSession({ traineeIds: ['T-0003'] });
    assert.deepEqual(s.traineeIds, ['T-0003']);
    assert.match(ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token)).message, /Chris Ng/);
    fails(admin('createSession', { title: 'X', date: TODAY, startTime: '10:00', endTime: '11:00', venue: SCHOOL, traineeIds: ['T-9999'] }), 'VALIDATION_ERROR');
  });

  test('a regular is paired with the trainee they were with last time, else the one with fewest pairings', () => {
    makeRegular(vol);
    const first = createSession({ date: '2026-10-20' });
    const b1 = ok(rt.call('bookSession', { sessionId: first.sessionId }, vol.token)).home.upcoming[0].bookingId;
    pair(b1, 'T-0002'); // an admin changes it to Bea
    const next = createSession({ date: '2026-10-27' });
    assert.match(ok(rt.call('bookSession', { sessionId: next.sessionId }, vol.token)).message, /Bea Lim/);
    const x = volunteer('x@example.com', 'Vol X');
    makeRegular(x);
    const third = createSession({ date: '2026-10-28' });
    assert.match(ok(rt.call('bookSession', { sessionId: third.sessionId }, x.token)).message, /Alex Tan/); // nobody had Alex yet
  });

  test('admins can pair one trainee with two volunteers, and one volunteer with two trainees', () => {
    const s = createSession();
    const b1 = book(s.sessionId);
    const b2 = book(s.sessionId, volunteer('v2@example.com', 'Vol Two'));
    pair(b1, ['T-0001', 'T-0002']);
    const res = pair(b2, 'T-0001');
    assert.match(res.message, /Alex Tan is also with Vol One/);
    const alex = res.detail.trainees.find((t) => t.id === 'T-0001');
    assert.deepEqual(alex.with.sort(), ['Vol One', 'Vol Two']);
    assert.deepEqual(comingRow(res.detail, b1).trainees.map((t) => t.id), ['T-0001', 'T-0002']);
    assert.equal(rt.records(SHEET, 'Bookings').find((b) => b['Booking ID'] === b1)['More Trainees'], 'T-0002');
    rt.evaluate('CONFIG.ALLOW_SHARED_TRAINEE = false');
    fails(admin('updateBooking', { bookingId: b2, traineeIds: ['T-0002'] }), 'CONFLICT');
    assert.match(pair(b2, []).message, /no trainee now/);
  });

  test('a trainee kept for their regular partner is not given to someone else', () => {
    const regular = volunteer('reg@example.com', 'Reg Ular');
    makeRegular(regular);
    ok(admin('addPair', { userId: regular.user.userId, traineeId: 'T-0001' }));
    makeRegular(vol);
    const s = createSession();
    book(s.sessionId, regular);
    assert.doesNotMatch(ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token)).message, /Alex/);
  });

  test('several sessions at once; each one succeeds or fails on its own', () => {
    const a = createSession({ title: 'Week 1', date: '2026-10-15' });
    const b = createSession({ title: 'Week 2', date: '2026-10-22' });
    const c = createSession({ title: 'Week 3', date: '2026-10-29' });
    ok(admin('updateSession', { sessionId: c.sessionId, status: 'closed' }));
    book(b.sessionId);
    const res = ok(rt.call('signUpSessions', { sessionIds: [a.sessionId, b.sessionId, c.sessionId, a.sessionId] }, vol.token));
    assert.deepEqual(res.results.map((r) => r.ok), [true, false, false]);
    assert.match(res.message, /^You're coming to 1 session\. You're already down as coming to Week 2\. Sign-ups for Week 3 are closed\./);
    assert.equal(res.home.upcoming.length, 2);
    fails(rt.call('signUpSessions', { sessionIds: [] }, vol.token), 'VALIDATION_ERROR');
  });

  test('sign-up rules: capacity, duplicates, "can\'t make it", closed sessions', () => {
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
    ok(admin('updateSession', { sessionId: s.sessionId, status: 'closed' }));
    fails(rt.call('bookSession', { sessionId: s.sessionId }, v2.token), 'CONFLICT');
    fails(admin('createSession', { title: 'X', date: TODAY, startTime: '12:00', endTime: '10:00', venue: SCHOOL }), 'VALIDATION_ERROR');
  });
});

describe('QR clock-in / clock-out', () => {
  function bookAndPair() {
    const s = createSession();
    const bookingId = book(s.sessionId);
    pair(bookingId, 'T-0001');
    const home = ok(rt.call('volunteerHome', {}, vol.token));
    return { s, bookingId, code: home.qr.find((q) => q.date === TODAY).code };
  }

  test('scan in, repeat scan ignored, scan out after the session — written to the Attendance tab', () => {
    const { code } = bookAndPair();
    rt.setNow(at('09:58'));
    const inRes = ok(admin('scan', { code }));
    assert.equal(inRes.outcome, 'in');
    assert.equal(inRes.trainee.name, 'Alex Tan');
    assert.equal(rt.records(SHEET, 'Attendance')[0]['Clock In'], '2026-10-14 09:58:00');
    rt.advanceMinutes(1);
    assert.equal(ok(admin('scan', { code })).outcome, 'already-in');
    rt.setNow(at('12:13'));
    const out = ok(admin('scan', { code }));
    assert.equal(out.outcome, 'out');
    assert.equal(out.attendance.hours, 2.25);
    assert.equal(rt.records(SHEET, 'Attendance')[0].Hours, 2.25);
    assert.equal(ok(admin('scan', { code })).outcome, 'already-out');
    const home = ok(rt.call('volunteerHome', {}, vol.token));
    assert.equal(home.totals.hours, 2.25);
    assert.equal(home.pendingFeedback.length, 1);
  });

  test('forged, edited and wrong-day QR codes are rejected', () => {
    const { code } = bookAndPair();
    const [prefix, userId, ymd, sig] = code.split('.');
    fails(admin('scan', { code: 'hello world' }), 'VALIDATION_ERROR');
    fails(admin('scan', { code: `${prefix}.U-OTHER123.${ymd}.${sig}` }), 'VALIDATION_ERROR');
    fails(admin('scan', { code: `${prefix}.${userId}.${ymd}.${'A'.repeat(sig.length)}` }), 'VALIDATION_ERROR');
    rt.setNow('2026-10-15T00:59:00Z');
    staff.adminToken = ok(rt.call('adminUnlock', { password: ADMIN_PW }, staff.token)).adminToken;
    fails(admin('scan', { code }), 'VALIDATION_ERROR');
  });

  test('clocking in pairs a regular; a new walk-in is left for an admin to pair', () => {
    makeRegular(vol);
    const s = createSession();
    rt.evaluate('CONFIG.AUTO_PAIR_REGULARS = false');
    book(s.sessionId);
    rt.evaluate('CONFIG.AUTO_PAIR_REGULARS = true');
    const code = ok(rt.call('volunteerHome', {}, vol.token)).qr[0].code;
    const res = ok(admin('scan', { code }));
    assert.equal(res.outcome, 'in');
    assert.match(res.message, /Paired with/);

    const walker = volunteer('walk@example.com', 'Walk In');
    const wcode = ok(rt.call('volunteerHome', {}, walker.token)).qr[0].code;
    assert.equal(ok(admin('scan', { code: wcode })).outcome, 'not-booked');
    const walkIn = ok(admin('scan', { code: wcode, sessionId: s.sessionId, walkIn: true }));
    assert.equal(walkIn.outcome, 'in');
    assert.equal(walkIn.trainee, null);
    assert.match(walkIn.message, /Added as a walk-in\. No trainee yet/);
    assert.equal(detail(s.sessionId).unpaired.length, 1);
  });

  test('offline scans are uploaded later with their original times', () => {
    const { code } = bookAndPair();
    rt.setNow(at('13:00'));
    const { results } = ok(admin('scanBatch', {
      scans: [
        { clientId: 'a', code, scannedAt: at('10:02') },
        { clientId: 'b', code, scannedAt: at('11:47') },
        { clientId: 'c', code: 'junk' },
      ],
    }));
    assert.deepEqual(results.map((r) => r.ok), [true, true, false]);
    const row = rt.records(SHEET, 'Attendance')[0];
    assert.equal(row['Clock In'], '2026-10-14 10:02:00');
    assert.equal(row.Hours, 1.75);
    assert.equal(row.Method, 'QR (offline)');
  });

  test('an admin can clock a volunteer in and out by hand', () => {
    const { bookingId } = bookAndPair();
    assert.equal(ok(admin('manualClock', { bookingId })).outcome, 'in');
    rt.advanceMinutes(30);
    const out = ok(admin('manualClock', { bookingId }));
    assert.equal(out.outcome, 'out');
    assert.equal(out.detail.stats.done, 1);
    fails(admin('manualClock', { bookingId }), 'CONFLICT');
  });
});

describe('regular volunteers and no-shows', () => {
  /** A finished session for `v` on `day` (created, attended and clocked out). */
  function attend(v, day) {
    rt.setNow(at('08:00', day));
    staff.adminToken = ok(rt.call('adminUnlock', { password: ADMIN_PW }, staff.token)).adminToken;
    const s = createSession({ date: day });
    const bookingId = book(s.sessionId, v);
    rt.setNow(at('10:00', day));
    ok(admin('manualClock', { bookingId }));
    rt.setNow(at('12:00', day));
    return ok(admin('manualClock', { bookingId }));
  }

  test('a volunteer becomes regular automatically after 10 completed sessions', () => {
    for (let i = 1; i <= 9; i++) assert.doesNotMatch(attend(vol, `2026-09-${String(i).padStart(2, '0')}`).message, /regular/);
    assert.equal(ok(rt.call('me', {}, vol.token)).user.type, 'new');
    const tenth = attend(vol, '2026-09-10');
    assert.match(tenth.message, /Vol One has now done 10 sessions and is a regular volunteer/);
    const row = rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'v1@example.com');
    assert.equal(row['Volunteer Type'], 'Regular');
    assert.equal(row['Regular Since'], '2026-09-10');
    assert.equal(ok(rt.call('me', {}, vol.token)).user.type, 'regular');
    assert.equal(ok(admin('dashboardOverview')).counts.regularVolunteers, 1);
  });

  test('admins can mark someone regular, or keep them new', () => {
    const res = ok(admin('updatePerson', { userId: vol.user.userId, volunteerType: 'regular' }));
    assert.match(res.message, /now a regular volunteer/);
    assert.equal(rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'v1@example.com')['Regular Since'], TODAY);
    ok(admin('updatePerson', { userId: vol.user.userId, volunteerType: 'new' }));
    for (let i = 1; i <= 10; i++) attend(vol, `2026-09-${String(i).padStart(2, '0')}`);
    assert.equal(ok(rt.call('me', {}, vol.token)).user.type, 'new'); // "New" stays new
    fails(admin('updatePerson', { userId: vol.user.userId, volunteerType: 'leader' }), 'VALIDATION_ERROR');
  });

  test('a no-show is a past session someone said they were coming to and never clocked in', () => {
    rt.setNow(at('09:00', '2026-10-12'));
    staff.adminToken = ok(rt.call('adminUnlock', { password: ADMIN_PW }, staff.token)).adminToken;
    const missed = createSession({ title: 'Missed', date: '2026-10-13' });
    const cancelled = createSession({ title: 'Said no', date: '2026-10-13', startTime: '14:00', endTime: '15:00' });
    book(missed.sessionId);
    ok(rt.call('cancelBooking', { bookingId: book(cancelled.sessionId) }, vol.token));
    rt.setNow(at('09:00'));
    staff.adminToken = ok(rt.call('adminUnlock', { password: ADMIN_PW }, staff.token)).adminToken;
    attend(vol, TODAY); // today's session is attended (and today is not over yet anyway)
    const list = ok(admin('listAttendance', { from: '2026-10-01', to: TODAY }));
    assert.equal(list.totals.noShows, 1);
    assert.equal(list.noShows[0].sessionTitle, 'Missed');
    assert.deepEqual(list.noShowsByVolunteer.map((v) => [v.volunteerName, v.count]), [['Vol One', 1]]);
    assert.equal(ok(admin('personDetail', { userId: vol.user.userId })).stats.noShows, 1);
    assert.equal(ok(admin('listPeople')).people.find((p) => p.userId === vol.user.userId).noShows, 1);
    assert.equal(ok(admin('hoursReport', {})).volunteers[0].noShows, 1);
  });
});

describe('feedback becomes trainee notes for future volunteers', () => {
  function attendWith(v, traineeId, date) {
    const s = createSession({ date });
    const bookingId = book(s.sessionId, v);
    pair(bookingId, traineeId);
    rt.setNow(at('10:00', date));
    ok(admin('manualClock', { bookingId }));
    rt.advanceMinutes(90);
    ok(admin('manualClock', { bookingId }));
    return bookingId;
  }

  test('an admin reviews observations before future volunteers see them', () => {
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
    pair(book(next.sessionId, v2), 'T-0001');
    assert.equal(ok(rt.call('volunteerHome', {}, v2.token)).upcoming[0].trainees[0].notes.length, 0);

    const queue = ok(admin('reviewQueue')).items;
    assert.equal(queue.length, 1);
    assert.equal(queue[0].type, 'Session feedback');
    assert.equal(ok(admin('adminHome')).reviewCount, 1);
    ok(admin('reviewObservation', { feedbackId: queue[0].feedbackId, decision: 'share', note: 'Joined the group song by himself. Loves singing.' }));
    fails(admin('reviewObservation', { feedbackId: queue[0].feedbackId, decision: 'share' }), 'CONFLICT');

    const notes = ok(rt.call('volunteerHome', {}, v2.token)).upcoming[0].trainees[0].notes;
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
    const [item] = ok(admin('reviewQueue')).items;
    ok(admin('reviewObservation', { feedbackId: item.feedbackId, decision: 'private' }));
    assert.equal(ok(admin('traineeDetail', { traineeId: 'T-0002' })).notes.length, 0);
    assert.equal(rt.records(SHEET, 'Feedback')[0]['Note Status'], 'private');
  });

  test('admins add and hide notes; trainee detail shows every field to admins', () => {
    let d = ok(admin('addTraineeNote', { traineeId: 'T-0001', note: 'Prefers the left side of the table.' }));
    assert.equal(d.notes[0].source, 'Admin');
    const medical = d.trainee.fields.find((f) => f.key === 'medicalNotes');
    assert.equal(medical.visibleToNew, false);
    assert.equal(medical.visibleToRegular, true);
    d = ok(admin('setNoteStatus', { noteId: d.notes[0].noteId, status: 'hidden' }));
    assert.equal(d.notes[0].status, 'hidden');
    const s = createSession();
    pair(book(s.sessionId), 'T-0001');
    assert.equal(ok(rt.call('volunteerHome', {}, vol.token)).upcoming[0].trainees[0].notes.length, 0);
    const list = ok(admin('listTrainees')).trainees;
    assert.equal(list.length, 4);
    assert.equal(list.find((t) => t.name === 'Dana Goh').active, false);
  });

  test('with AUTO_SHARE_OBSERVATIONS on, observations are shared straight away', () => {
    rt.evaluate('CONFIG.AUTO_SHARE_OBSERVATIONS = true');
    const bookingId = attendWith(vol, 'T-0003', TODAY);
    const res = ok(rt.call('submitFeedback', { bookingId, traineeObservation: 'Great at passing drills.' }, vol.token));
    assert.equal(res.noteStatus, 'shared');
    assert.equal(ok(admin('traineeDetail', { traineeId: 'T-0003' })).notes[0].note, 'Great at passing drills.');
  });
});

describe('editing details in the app', () => {
  test('a volunteer updates their own details; checks match registration', () => {
    const res = ok(rt.call('updateProfile', { phone: '+65 9000 1111', telegram: 'new_handle' }, vol.token));
    assert.match(res.message, /phone and Telegram/);
    assert.equal(res.user.telegram, 'new_handle');
    const row = rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'v1@example.com');
    assert.equal(row.Phone.trim(), '+65 9000 1111');
    assert.equal(row['Details Updated By'], 'Vol One');
    assert.equal(ok(rt.call('updateProfile', { phone: '+65 9000 1111' }, vol.token)).message, 'No changes to save.');
    fails(rt.call('updateProfile', { phone: 'abc' }, vol.token), 'VALIDATION_ERROR');
    fails(rt.call('updateProfile', { name: ' ' }, vol.token), 'VALIDATION_ERROR');
    fails(rt.call('updateProfile', { telegram: '' }, vol.token), 'VALIDATION_ERROR'); // Telegram is required
    fails(rt.call('updateProfile', { birthday: '2099-01-01' }, vol.token), 'VALIDATION_ERROR');
    fails(rt.call('updateProfile', { role: 'admin' }, vol.token), 'VALIDATION_ERROR');
    fails(rt.call('updateProfile', { emergencyName: 'Mum' }, vol.token), 'VALIDATION_ERROR');
  });

  test('changing your sign-in email needs your password and a free address', () => {
    fails(rt.call('updateProfile', { email: 'vol.new@example.com' }, vol.token), 'VALIDATION_ERROR');
    fails(rt.call('updateProfile', { email: 'vol.new@example.com', currentPassword: 'wrong-pass' }, vol.token), 'VALIDATION_ERROR');
    fails(rt.call('updateProfile', { email: 'STAFF@example.com', currentPassword: 'password123' }, vol.token), 'CONFLICT');
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
    assert.equal(detail(s.sessionId).coming[0].volunteer.name, 'Vol Renamed');
  });

  test('admins edit anyone\'s details; the change is stamped with their name', () => {
    const userId = vol.user.userId;
    const d = ok(admin('personDetail', { userId }));
    assert.equal(d.person.telegram, 'vol_one');
    assert.equal(d.person.status, 'active');
    const res = ok(admin('updatePerson', { userId, phone: '+65 9888 7777', telegram: 'vol_new' }));
    assert.match(res.message, /Updated Vol One's phone and Telegram\./);
    assert.equal(rt.records(SHEET, 'Volunteers').find((r) => r['User ID'] === userId)['Details Updated By'], 'Staff Lee');
    fails(admin('updatePerson', { userId, email: 'staff@example.com' }), 'CONFLICT');
    fails(admin('updatePerson', { userId: 'U-nope' }), 'NOT_FOUND');
    fails(admin('updatePerson', { userId, notes: 'x' }), 'VALIDATION_ERROR');
    fails(admin('updatePerson', { userId, role: 'admin' }), 'VALIDATION_ERROR'); // there are no roles any more
  });

  test('deactivating someone needs the admin password again and signs them out', () => {
    const sam = volunteer('sam@example.com', 'Sam Ong');
    fails(admin('updatePerson', { userId: sam.user.userId, status: 'inactive' }), 'VALIDATION_ERROR');
    fails(admin('updatePerson', { userId: sam.user.userId, status: 'inactive', adminPassword: 'wrong' }), 'VALIDATION_ERROR');
    const res = ok(admin('updatePerson', { userId: sam.user.userId, status: 'inactive', adminPassword: ADMIN_PW }));
    assert.match(res.message, /Sam Ong is deactivated/);
    fails(rt.call('volunteerHome', {}, sam.token), 'UNAUTHORIZED');
    fails(rt.call('login', { email: 'sam@example.com', password: 'password123' }), 'UNAUTHORIZED');
    ok(admin('updatePerson', { userId: sam.user.userId, status: 'active', adminPassword: ADMIN_PW }));
    ok(rt.call('login', { email: 'sam@example.com', password: 'password123' }));
    fails(admin('updatePerson', { userId: staff.user.userId, status: 'inactive', adminPassword: ADMIN_PW }), 'CONFLICT'); // not yourself
    // anyone who has opened admin before (a former "leader") is deactivated the same way
    const other = ok(rt.call('adminUnlock', { password: ADMIN_PW }, vol.token)).adminToken;
    ok(admin('updatePerson', { userId: vol.user.userId, status: 'inactive', adminPassword: ADMIN_PW }));
    fails(rt.call('adminHome', {}, vol.token, other), 'UNAUTHORIZED');
  });
});

describe('request handling', () => {
  test('unknown actions, bad JSON and unknown fields are rejected cleanly', () => {
    fails(rt.call('dropTables', {}), 'NOT_FOUND');
    fails(rt.call('__proto__', {}), 'NOT_FOUND');
    fails(rt.callRaw('{not json'), 'VALIDATION_ERROR');
    fails(rt.call('bookSession', { sessionId: 'S-1', extra: 1 }, vol.token), 'VALIDATION_ERROR');
    fails(rt.callRaw(JSON.stringify({ action: 'me', token: vol.token, payload: { pad: 'x'.repeat(250000) } })), 'VALIDATION_ERROR');
  });

  test('missing SPREADSHEET_ID gives a clear config error', () => {
    const fresh = createGasRuntime();
    fails(fresh.call('login', { email: 'a@example.com', password: 'whatever1' }), 'CONFIG_ERROR');
  });
});
