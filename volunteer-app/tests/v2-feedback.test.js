// Tests for the changes after Mr Sadil's feedback on Version 2 (October 2026):
// many-to-many pairing (one volunteer with several trainees, and the reverse),
// how volunteers' notes are shared (all / regulars / selected volunteers /
// private), the notes filter in "What volunteers see", the registration form's
// extra questions, and drag-and-drop ordering of the guide. Run: npm test

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { beforeEach, describe, test } from 'node:test';
import { createGasRuntime } from '../dev/gas-harness.js';

const MOCK = JSON.parse(fs.readFileSync(new URL('./fixtures/house-visit-mock.json', import.meta.url), 'utf8'));
const MAIN = 'volunteer-sheet';
const TRAINEE_FILE = 'house-visit-file';
const TODAY = '2026-10-14';
const SCHOOL = 'MINDS Woodlands Gardens School';
const PW = 'password123';

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
let admin;
const call = (action, payload = {}, token = admin) => rt.call(action, payload, token);

function person(email, name, extra = {}) {
  const v = ok(rt.call('register', { name, email, password: PW, birthday: '2001-05-06', phone: '+65 9123 4567', telegram: 'vol_tg', consent: true, ...extra }));
  ok(rt.call('acknowledgeGuide', {}, v.token));
  return v;
}

function session(date = '2026-10-17') {
  return ok(call('createSession', { title: 'Regular session', date, startTime: '14:30', endTime: '17:30', venue: SCHOOL })).session.sessionId;
}

function come(v, sessionId) {
  return ok(rt.call('bookSession', { sessionId }, v.token)).home.upcoming.find((u) => u.session.sessionId === sessionId).bookingId;
}

beforeEach(() => {
  rt = createGasRuntime();
  rt.createSpreadsheet(MAIN, 'MINDS Volunteers');
  rt.createSpreadsheet(TRAINEE_FILE, '[Exp] House Visit Template Form (Responses)');
  const form = rt.fillTab(TRAINEE_FILE, 'Form Responses 1', [MOCK.headers, ...MOCK.rows]);
  rt.fillTab(TRAINEE_FILE, 'Map (Fixed)', MOCK.map);
  rt.props.set('SPREADSHEET_ID', MAIN);
  rt.props.set('TRAINEE_SPREADSHEET_ID', `https://docs.google.com/spreadsheets/d/${TRAINEE_FILE}/edit#gid=${form.getSheetId()}`);
  rt.setNow(`${TODAY}T09:00:00+08:00`);
  rt.run('setup');
  rt.evaluate("setAdminActionPassword_('admin-test-pass')");
  person('admin@example.com', 'Ada Admin');
  rt.props.set('FIRST_ADMIN_EMAIL', 'admin@example.com');
  rt.run('makeFirstAdmin');
  admin = ok(rt.call('login', { email: 'admin@example.com', password: PW })).token;
});

describe('pairing is many to many', () => {
  let vol;
  let vol2;
  beforeEach(() => {
    vol = person('vol@example.com', 'Val Volunteer');
    vol2 = person('vol2@example.com', 'Vic Volunteer');
  });

  test('one volunteer with several trainees for a session; the small ✕ removes one', () => {
    const s = session();
    const b = come(vol, s);
    ok(call('updateBooking', { bookingId: b, addTraineeId: 'T-0001' }));
    let res = ok(call('updateBooking', { bookingId: b, addTraineeId: 'T-0002' }));
    assert.match(res.message, /paired with Mock Trainee 1 and Mock Trainee 2/);
    fails(call('updateBooking', { bookingId: b, addTraineeId: 'T-0002' }), 'CONFLICT');
    fails(call('updateBooking', { bookingId: b, addTraineeId: 'T-0003', removeTraineeId: 'T-0001' }), 'VALIDATION_ERROR');
    const row = rt.records(MAIN, 'Bookings').find((r) => r['Booking ID'] === b);
    assert.equal(row['Trainee ID'], 'T-0001, T-0002', 'the sheet lists both, like "Trainees Attending"');
    assert.equal(row['Trainee Name'], 'Mock Trainee 1, Mock Trainee 2');

    const detail = res.detail.bookings.find((x) => x.bookingId === b);
    assert.deepEqual(detail.trainees.map((t) => t.id), ['T-0001', 'T-0002']);
    assert.equal(res.detail.stats.unpaired, 0);

    // The volunteer sees both on Home and may open both trainees' details.
    const home = ok(rt.call('volunteerHome', {}, vol.token));
    assert.deepEqual(home.upcoming[0].trainees.map((t) => t.name), ['Mock Trainee 1', 'Mock Trainee 2']);
    ok(rt.call('traineeInfo', { traineeId: 'T-0002' }, vol.token));

    res = ok(call('updateBooking', { bookingId: b, removeTraineeId: 'T-0001' }));
    assert.deepEqual(res.detail.bookings.find((x) => x.bookingId === b).trainees.map((t) => t.id), ['T-0002']);
    fails(rt.call('traineeInfo', { traineeId: 'T-0001' }, vol.token), 'FORBIDDEN');
    res = ok(call('updateBooking', { bookingId: b, removeTraineeId: 'T-0002' }));
    assert.match(res.message, /now unpaired/);
    assert.equal(res.detail.stats.unpaired, 1);

    // Older app versions: traineeId replaces them all.
    ok(call('updateBooking', { bookingId: b, addTraineeId: 'T-0003' }));
    ok(call('updateBooking', { bookingId: b, addTraineeId: 'T-0004' }));
    res = ok(call('updateBooking', { bookingId: b, traineeId: 'T-0005' }));
    assert.deepEqual(res.detail.bookings.find((x) => x.bookingId === b).trainees.map((t) => t.id), ['T-0005']);
  });

  test('one trainee with several volunteers; the activity log says what changed', () => {
    const s = session();
    const a = come(vol, s);
    const b = come(vol2, s);
    ok(call('updateBooking', { bookingId: a, addTraineeId: 'T-0001' }));
    const res = ok(call('updateBooking', { bookingId: b, addTraineeId: 'T-0001' }));
    const withT1 = res.detail.bookings.filter((x) => x.trainees.some((t) => t.id === 'T-0001'));
    assert.equal(withT1.length, 2);
    ok(call('updateBooking', { bookingId: b, removeTraineeId: 'T-0001' }));
    const log = ok(call('listAdminLog')).entries.map((e) => e.summary);
    assert.ok(log.some((x) => /Unpaired Vic Volunteer.*from Mock Trainee 1/.test(x)), log.join('\n'));
  });

  test('feedback asks about each trainee; each note is reviewed on its own; history counts both', () => {
    const s = session(TODAY);
    const b = come(vol, s);
    ok(call('updateBooking', { bookingId: b, addTraineeId: 'T-0001' }));
    ok(call('updateBooking', { bookingId: b, addTraineeId: 'T-0002' }));
    rt.setNow(`${TODAY}T14:30:00+08:00`);
    ok(call('manualClock', { bookingId: b }));
    rt.setNow(`${TODAY}T17:30:00+08:00`);
    ok(call('manualClock', { bookingId: b }));
    const pending = ok(rt.call('volunteerHome', {}, vol.token)).pendingFeedback[0];
    assert.deepEqual(pending.trainees.map((t) => t.id), ['T-0001', 'T-0002']);
    fails(rt.call('submitFeedback', { bookingId: b, observations: [{ traineeId: 'T-0009', note: 'x' }] }, vol.token), 'VALIDATION_ERROR');
    ok(rt.call('submitFeedback', {
      bookingId: b, rating: 5,
      observations: [{ traineeId: 'T-0001', note: 'Loved the drums.' }, { traineeId: 'T-0002', note: 'Needed a quiet corner at 4 pm.' }],
    }, vol.token));
    const queue = ok(call('reviewQueue')).items;
    assert.deepEqual(queue.map((q) => [q.traineeName, q.kind]), [['Mock Trainee 1', 'session'], ['Mock Trainee 2', 'session']]);
    const history = ok(call('pairingHistory')).pairs.filter((x) => x.userId === vol.user.userId);
    assert.deepEqual(history.map((x) => x.traineeId).sort(), ['T-0001', 'T-0002']);
  });

  test('a regular can have several fixed trainees; their sessions follow every change', () => {
    ok(call('setVolunteerType', { userId: vol.user.userId, volunteerType: 'regular' }));
    ok(call('setStandingPairing', { userId: vol.user.userId, addTraineeId: 'T-0001' }));
    let board = ok(call('setStandingPairing', { userId: vol.user.userId, addTraineeId: 'T-0002' }));
    const me = board.regulars.find((r) => r.userId === vol.user.userId);
    assert.deepEqual(me.trainees.map((t) => t.id), ['T-0001', 'T-0002']);
    assert.equal(board.counts.unpairedRegulars, 1, 'only Ada (admins are regulars) is still unpaired');

    const s = session();
    const res = ok(rt.call('bookSession', { sessionId: s }, vol.token));
    assert.match(res.message, /Mock Trainee 1 and Mock Trainee 2, your regular trainees/);
    const home = res.home;
    assert.deepEqual(home.upcoming[0].trainees.map((t) => t.id), ['T-0001', 'T-0002']);
    assert.deepEqual(home.regularTrainees.map((t) => t.id), ['T-0001', 'T-0002']);

    board = ok(call('setStandingPairing', { userId: vol.user.userId, removeTraineeId: 'T-0001' }));
    assert.match(board.message, /no longer Mock Trainee 1's regular volunteer. Updated 1 upcoming session/);
    assert.deepEqual(ok(rt.call('volunteerHome', {}, vol.token)).upcoming[0].trainees.map((t) => t.id), ['T-0002']);
    const rows = rt.records(MAIN, 'Regular Pairings');
    assert.deepEqual(rows.map((r) => [r['Trainee ID'], r.Status]), [['T-0001', 'ended'], ['T-0002', 'active']]);

    // traineeId (older app versions) replaces them all; '' removes them all.
    ok(call('setStandingPairing', { userId: vol.user.userId, addTraineeId: 'T-0003' }));
    board = ok(call('setStandingPairing', { userId: vol.user.userId, traineeId: 'T-0004' }));
    assert.deepEqual(board.regulars.find((r) => r.userId === vol.user.userId).trainees.map((t) => t.id), ['T-0004']);
    board = ok(call('setStandingPairing', { userId: vol.user.userId, traineeId: '' }));
    assert.equal(board.regulars.find((r) => r.userId === vol.user.userId).trainees.length, 0);
    assert.equal(ok(rt.call('volunteerHome', {}, vol.token)).upcoming[0].trainees.length, 0);
    fails(call('setStandingPairing', { userId: vol2.user.userId, addTraineeId: 'T-0001' }), 'CONFLICT'); // still ad hoc
  });
});

describe('how a volunteer note is shared', () => {
  let vol;
  let other;
  let reg;
  beforeEach(() => {
    vol = person('vol@example.com', 'Val Volunteer');
    other = person('other@example.com', 'Oli Other');
    reg = person('reg@example.com', 'Rex Regular');
    ok(call('setVolunteerType', { userId: reg.user.userId, volunteerType: 'regular' }));
    const s = session();
    ok(call('updateBooking', { bookingId: come(vol, s), addTraineeId: 'T-0001' }));
    ok(call('updateBooking', { bookingId: come(other, s), addTraineeId: 'T-0001' }));
  });

  const seen = (v) => ok(rt.call('traineeInfo', { traineeId: 'T-0001' }, v.token)).notes.map((n) => n.note);
  const review = (note, extra) => {
    ok(rt.call('submitTraineeUpdate', { traineeId: 'T-0001', note }, vol.token));
    const item = ok(call('reviewQueue')).items.find((i) => i.observation === note);
    assert.equal(item.kind, 'update');
    return ok(call('reviewObservation', { feedbackId: item.feedbackId, ...extra }));
  };

  test('all future volunteers, regulars only, selected volunteers, or private', () => {
    const q = ok(call('reviewQueue'));
    assert.deepEqual(q.audiences.map((a) => a.key), ['all', 'regular', 'selected', 'private']);
    assert.ok(q.volunteers.some((v) => v.name === 'Oli Other'));

    review('For everyone.', { audience: 'all' });
    review('Regulars only.', { audience: 'regular' });
    ok(rt.call('submitTraineeUpdate', { traineeId: 'T-0001', note: 'Picked.' }, vol.token));
    const picked = ok(call('reviewQueue')).items[0].feedbackId;
    fails(call('reviewObservation', { feedbackId: picked, audience: 'selected' }), 'VALIDATION_ERROR'); // nobody picked
    const res = ok(call('reviewObservation', { feedbackId: picked, audience: 'selected', userIds: [other.user.userId] }));
    assert.match(res.message, /shared with the volunteers you picked/);
    review('Admins only.', { audience: 'private' });

    assert.deepEqual(seen(vol).sort(), ['For everyone.']);
    assert.deepEqual(seen(other).sort(), ['For everyone.', 'Picked.']);
    assert.deepEqual(seen(reg).sort(), ['For everyone.', 'Regulars only.']);
    const all = ok(call('traineeDetail', { traineeId: 'T-0001' })).notes;
    assert.equal(all.length, 4, 'admins see every note, private ones too');
    assert.deepEqual(all.find((n) => n.note === 'Picked.').sharedWith.map((x) => x.name), ['Oli Other']);
    const sheet = rt.records(MAIN, 'Trainee Notes').find((r) => r.Note === 'Picked.');
    assert.equal(sheet['Shared With'], 'selected');
    assert.equal(sheet['Shared With (Names)'], 'Oli Other');
    assert.equal(sheet.Source, 'Volunteer update');
  });

  test('admins share a note with more people later, or make it private again', () => {
    review('Started a part-time job.', { audience: 'private' });
    const note = ok(call('traineeDetail', { traineeId: 'T-0001' })).notes[0];
    assert.equal(seen(vol).length, 0);
    let res = ok(call('setNoteSharing', { noteId: note.noteId, audience: 'selected', userIds: [vol.user.userId, other.user.userId] }));
    assert.equal(res.notes[0].sharedWith.length, 2);
    assert.equal(seen(vol).length, 1);
    assert.equal(seen(reg).length, 0);
    res = ok(call('setNoteSharing', { noteId: note.noteId, audience: 'all' }));
    assert.equal(seen(reg).length, 1);
    fails(call('setNoteSharing', { noteId: note.noteId, audience: 'everyone' }), 'VALIDATION_ERROR');
    ok(call('setNoteStatus', { noteId: note.noteId, status: 'hidden' })); // older app versions
    assert.equal(seen(reg).length, 0);
    assert.equal(ok(call('traineeDetail', { traineeId: 'T-0001' })).notes[0].audience, 'private');
  });

  test('admins add a note for regulars only', () => {
    ok(call('addTraineeNote', { traineeId: 'T-0001', note: 'Caregiver prefers calls after 6 pm.', audience: 'regular' }));
    assert.equal(seen(vol).length, 0);
    assert.deepEqual(seen(reg), ['Caregiver prefers calls after 6 pm.']);
  });

  test('"What volunteers see" also filters notes, by who wrote them', () => {
    review('From a volunteer.', { audience: 'all' });
    ok(call('addTraineeNote', { traineeId: 'T-0001', note: 'From an admin.' }));
    let v = ok(call('visibilitySettings'));
    const notesSection = v.sections.find((s) => s.notes);
    assert.deepEqual(notesSection.fields.map((f) => f.key), ['notes:volunteer', 'notes:admin']);
    assert.ok(v.audiences.volunteer.fields.includes('notes:volunteer'), 'shown until an admin unticks it');

    const keep = v.audiences.volunteer.fields.filter((k) => k !== 'notes:volunteer');
    ok(call('saveVisibility', { audience: 'volunteer', fields: keep }));
    assert.deepEqual(seen(vol), ['From an admin.']);
    assert.equal(seen(reg).length, 2, 'regulars have their own setting');
    // Per trainee, like the details.
    ok(call('saveVisibility', { audience: 'regular', traineeId: 'T-0001', fields: ['gender', 'notes:volunteer'] }));
    assert.deepEqual(seen(reg), ['From a volunteer.']);
    v = ok(call('visibilitySettings', { traineeId: 'T-0001' }));
    assert.ok(!v.audiences.regular.fields.includes('notes:admin'));
  });
});

describe('the registration form follows MINDS\'s Google Form', () => {
  const answers = {
    shortName: 'Nia', nric4: '567b', address: 'Blk 1 Woodlands Ave 1, #01-01', project: 'West End', startYear: '2025', shirtSize: 'M',
    emergencyRelation: 'Mother', emergencyPhone: '9123 4567',
  };

  test('the questions come from Config.gs, in the form\'s order', () => {
    const form = ok(rt.call('registrationForm', {}));
    assert.deepEqual(form.fields.map((f) => f.key), ['shortName', 'nric4', 'address', 'project', 'courseYear', 'matricNo', 'schoolEmail',
      'startYear', 'shirtSize', 'committee', 'dietary', 'languages', 'emergencyRelation', 'emergencyPhone']);
    assert.deepEqual(form.fields.find((f) => f.key === 'project').options, ['RSPID (CTDC)', 'RSPID (WGS)', 'West End', 'RSPID (CTDC) Alumni', 'RSPID (WGS) Alumni']);
    assert.deepEqual(form.fields.find((f) => f.key === 'matricNo').showIf, { key: 'project', startsWith: 'RSPID' });
    assert.equal(form.fields.find((f) => f.key === 'nric4').private, true);
  });

  test('answers are checked and saved in their own columns', () => {
    const base = { name: 'Nia New', email: 'nia@example.com', password: PW, birthday: '2003-02-03', phone: '+65 9876 5432', consent: true };
    fails(rt.call('register', { ...base, answers: { ...answers, shortName: '' } }), 'VALIDATION_ERROR');
    fails(rt.call('register', { ...base, answers: { ...answers, shirtSize: 'Huge' } }), 'VALIDATION_ERROR');
    fails(rt.call('register', { ...base, answers: { ...answers, favouriteColour: 'blue' } }), 'VALIDATION_ERROR');
    const v = ok(rt.call('register', { ...base, answers: { ...answers, matricNo: 'U123', courseYear: 'MAE, Y2' } }));
    const row = rt.records(MAIN, 'Volunteers').find((r) => r.Email === 'nia@example.com');
    assert.equal(row['Short Name'], 'Nia');
    assert.equal(row['NRIC (Last 4)'], '567B');
    assert.equal(row.Project, 'West End');
    assert.equal(row['Emergency Contact Phone'].trim(), '+65 91234567');
    assert.equal(row['Matriculation Number'], '', 'RSPID-only questions are cleared for a West End volunteer');
    assert.equal(row['Course and Year'], '');
    assert.equal(v.user.shortName, 'Nia');
    assert.ok(!v.user.answers.some((a) => a.key === 'matricNo'), 'not shown when they do not apply');

    const res = ok(rt.call('updateProfile', { answers: { shirtSize: 'L' } }, v.token));
    assert.match(res.message, /t-shirt size/i);
    fails(rt.call('updateProfile', { answers: { emergencyPhone: '' } }, v.token), 'VALIDATION_ERROR');
    assert.equal(ok(call('personDetail', { userId: v.user.userId })).person.answers.find((a) => a.key === 'shirtSize').value, 'L');
  });
});

describe('drag and drop in the guide editor', () => {
  test('the new order is saved in one go; a stale list is refused', () => {
    const c = ok(call('leaderContent'));
    const ids = c.sections.map((s) => s.sectionId);
    assert.ok(ids.length >= 2);
    const reversed = ids.slice().reverse();
    const after = ok(call('reorderContent', { kind: 'guide', ids: reversed }));
    assert.deepEqual(after.sections.map((s) => s.sectionId), reversed);
    fails(call('reorderContent', { kind: 'guide', ids: reversed.slice(1) }), 'CONFLICT');
    fails(call('reorderContent', { kind: 'guide', ids: [reversed[0], ...reversed.slice(0, -1)] }), 'CONFLICT');
    const projects = c.projects.filter((p) => p.status !== 'archived').map((p) => p.projectId);
    const moved = ok(call('reorderContent', { kind: 'projects', ids: projects.slice().reverse() }));
    assert.deepEqual(moved.projects.filter((p) => p.status !== 'archived').map((p) => p.projectId), projects.slice().reverse());
  });
});
