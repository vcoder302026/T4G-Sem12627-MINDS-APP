// Tests for the October 2026 partner feedback: database links (Data Sources),
// the house-visit form responses as "trainee updates", what new and regular
// volunteers see, the Pairing List import, partner history, photos, guide
// pictures/PDFs and Google Contacts. Run: npm test

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { createGasRuntime } from '../dev/gas-harness.js';

const SHEET = 'sheet-1';
const VISITS = 'visits-book'; // a separate spreadsheet: MINDS's house-visit form responses
const TODAY = '2026-10-14';
const SCHOOL = 'MINDS Woodlands Gardens School';
const ADMIN_PW = 'Admin-Password-2026';
const at = (hhmm, day = TODAY) => `${day}T${hhmm}:00+08:00`;
const sheetLink = (id, gid) => `https://docs.google.com/spreadsheets/d/${id}/edit${gid === undefined ? '' : `#gid=${gid}`}`;

function ok(res) {
  assert.equal(res.ok, true, `expected ok, got ${JSON.stringify(res.error)}`);
  return res.data;
}
function fails(res, code) {
  assert.equal(res.ok, false, `expected ${code}, got ok`);
  assert.equal(res.error.code, code, res.error.message);
  return res.error;
}

// The partner's form format (fictional answers). Headers as in their sheet.
const H = {
  ts: 'Timestamp',
  date: 'Date of Visit',
  v1: 'Name of Attached Volunteer (1) - Full Name as per NRIC',
  v2: 'Name of Attached Volunteer (2) - Full Name as per NRIC',
  senior: 'Name of Senior Volunteer(s)',
  trainee: "Trainee's Full Name",
  nric: 'NRIC (Last 4 Alphanumeric. e.g. 123A)',
  address: 'Address',
  dob: 'Date of Birth (DD MMM YYYY)',
  blood: 'Blood Type',
  allergies: 'Allergies',
  obs: 'Observations',
};
const HEADERS = [H.ts, H.date, H.v1, H.v2, H.senior, H.trainee, H.nric, H.address, H.dob, H.blood, H.allergies, H.obs];

let rt;
let staff;
let vol; // a new volunteer
let reg; // a regular volunteer
const admin = (action, payload = {}) => rt.call(action, payload, staff.token, staff.adminToken);

function register(name, email, telegram) {
  const v = ok(rt.call('register', { name, email, telegram, password: 'password123', birthday: '2000-01-01', phone: '+65 9123 4567', consent: true }));
  ok(rt.call('acknowledgeGuide', {}, v.token));
  return v;
}
function linkUpdates() {
  return ok(admin('saveDataSource', { key: 'traineeUpdates', url: sheetLink(VISITS, 0) }));
}

beforeEach(() => {
  rt = createGasRuntime({ contactsAccount: 'vcoder302026@gmail.com' });
  rt.createSpreadsheet(SHEET, 'MINDS Volunteer Data');
  rt.fillTab(SHEET, 'Trainees', [
    ['Name', 'Gender', 'Communication', 'Medical Notes', 'Caregiver Name'],
    ['Alex Tan Wei Ming', 'Male', 'Verbal', 'Epilepsy plan on file', 'Mdm Tan'],
    ['Bea Lim', 'Female', 'Gestures', '', 'Mr Lim'],
    ['Chris Ng', 'Male', 'Verbal', 'Asthma inhaler', 'Mrs Ng'],
  ]);
  rt.createSpreadsheet(VISITS, 'House Visit Template Form (Responses)');
  rt.fillTab(VISITS, 'Form Responses 1', [
    HEADERS,
    ['2026-09-01 10:15:00', '2026-08-30', 'Ria Regular', '', 'Senior Sue', 'Alex Tan Wei Ming', '123A', 'Blk 1 Fictional Ave', '12 Mar 2005', 'O+', 'Peanuts', 'Settled well at home.'],
    ['2026-10-01 09:00:00', '2026-09-28', 'Ria Regular', 'Nina New', 'Senior Sue', 'alex tan wei ming', '123A', '', '12 Mar 2005', 'O+', '', 'Started a new routine chart.'],
    ['2026-10-02 09:00:00', '2026-10-01', 'Nobody Known', '', '', 'Bea Lim', '456B', 'Blk 2 Pretend Rd', '01 Jan 2006', 'A-', 'None', 'Enjoys drawing.'],
  ]);
  rt.props.set('SPREADSHEET_ID', SHEET);
  rt.setNow(at('09:00'));
  rt.run('setup');
  rt.props.set('NEW_ADMIN_PASSWORD', ADMIN_PW);
  rt.run('setAdminPassword');
  staff = register('Staff Lee', 'staff@example.com', 'staff_lee');
  staff.adminToken = ok(rt.call('adminUnlock', { password: ADMIN_PW }, staff.token)).adminToken;
  vol = register('Nina New', 'nina@example.com', 'nina_new');
  reg = register('Ria Regular', 'ria@example.com', 'ria_regular');
  ok(admin('updatePerson', { userId: reg.user.userId, volunteerType: 'regular' }));
});

describe('database links (Admin → Settings → Databases)', () => {
  test('the volunteer list can live in another spreadsheet, chosen by a link to one tab', () => {
    const other = rt.createSpreadsheet('people-book', 'MINDS People');
    other.insertSheet('Notes');
    rt.fillTab('people-book', 'Volunteer details', [['User ID', 'Full Name', 'Email', 'Telegram', 'Status']]);
    const gid = other.getSheetByName('Volunteer details').getSheetId();
    const res = ok(admin('saveDataSource', { key: 'volunteers', url: sheetLink('people-book', gid) }));
    assert.match(res.message, /"MINDS People" → tab "Volunteer details", 0 rows/);
    // New registrations now go to the linked tab; the password hashes stay in the main sheet.
    ok(rt.call('register', { name: 'Linked Person', email: 'linked@example.com', telegram: 'linked_person', password: 'password123', birthday: '2000-01-01', phone: '+65 9123 4567', consent: true }));
    assert.equal(rt.records('people-book', 'Volunteer details')[0]['Full Name'], 'Linked Person');
    assert.ok(!rt.records(SHEET, 'Volunteers').some((r) => r.Email === 'linked@example.com'));
    assert.equal(rt.records(SHEET, '_Auth').length, 4);
    assert.match(rt.records(SHEET, 'Admin Log').find((r) => r.Action === 'Changed a database link').Details, /MINDS People/);
  });

  test('bad links are refused and not saved', () => {
    fails(admin('saveDataSource', { key: 'trainees', url: 'https://example.com/sheet' }), 'VALIDATION_ERROR');
    fails(admin('saveDataSource', { key: 'trainees', url: sheetLink('no-such-book') }), 'VALIDATION_ERROR');
    fails(admin('saveDataSource', { key: 'trainees', url: sheetLink(VISITS, 0) }), 'VALIDATION_ERROR'); // no "Name" column there
    fails(admin('saveDataSource', { key: 'traineeUpdates', url: sheetLink(VISITS, 999) }), 'VALIDATION_ERROR'); // no such tab
    fails(admin('saveDataSource', { key: 'nonsense', url: '' }), 'VALIDATION_ERROR');
    const dbs = ok(admin('adminSettings')).databases;
    assert.equal(dbs.find((d) => d.key === 'trainees').url, '');
    assert.match(dbs.find((d) => d.key === 'trainees').status, /^Default: "MINDS Volunteer Data" → tab "Trainees", 3 rows/);
    assert.equal(dbs.find((d) => d.key === 'traineeUpdates').status, 'Not linked (optional)');
  });

  test('the trainee list can be linked by URL instead of TRAINEE_SPREADSHEET_ID', () => {
    rt.createSpreadsheet('trainee-book', 'Trainee master list');
    rt.fillTab('trainee-book', 'Sheet1', [['Trainee ID', 'Name', 'Gender'], ['T-0100', 'Dana Goh', 'Female']]);
    ok(admin('saveDataSource', { key: 'trainees', url: sheetLink('trainee-book'), tab: 'Sheet1' }));
    assert.deepEqual(ok(admin('listTrainees')).trainees.map((t) => t.name), ['Dana Goh']);
  });
});

describe('trainee updates (the house-visit form responses)', () => {
  test('a trainee\'s current info is the newest answer per question, matched by full name', () => {
    linkUpdates();
    const p = ok(admin('traineeProfile', { traineeId: 'T-0001' }));
    assert.equal(p.updates.count, 2);
    assert.equal(p.updates.lastVisit, '2026-09-28');
    const f = Object.fromEntries(p.updates.fields.map((x) => [x.label, x.value]));
    assert.equal(f[H.obs], 'Started a new routine chart.');
    assert.equal(f[H.allergies], 'Peanuts'); // blank in the newer response, so the older answer stands
    assert.equal(f[H.address], 'Blk 1 Fictional Ave');
    const list = ok(admin('listTraineeUpdates'));
    assert.equal(list.total, 3);
    assert.equal(list.rows[0].traineeName, 'Bea Lim');
    assert.equal(list.rows[0].traineeId, 'T-0002');
  });

  test('admins choose what new and regular volunteers see; nothing from the form is shown until allowed', () => {
    linkUpdates();
    let access = ok(admin('adminSettings')).fieldAccess;
    assert.ok(access.updatesLinked);
    const obs = access.fields.find((x) => x.key === `update|${H.obs}`);
    assert.deepEqual([obs.newSee, obs.regularSee], [false, false]);
    const medical = access.fields.find((x) => x.key === 'trainee|Medical Notes');
    assert.deepEqual([medical.newSee, medical.regularSee], [false, true]);

    // regulars can see every trainee (an "info dump"); new volunteers only their own
    let t = ok(rt.call('myTrainee', { traineeId: 'T-0001' }, reg.token)).trainee;
    assert.ok(t.fields.some((x) => x.label === 'Medical Notes'));
    assert.equal(t.updateFields.length, 0);
    fails(rt.call('myTrainee', { traineeId: 'T-0001' }, vol.token), 'NOT_FOUND');
    assert.equal(ok(rt.call('myTrainees', {}, vol.token)).trainees.length, 0);
    assert.equal(ok(rt.call('myTrainees', {}, reg.token)).trainees.length, 3);

    access = ok(admin('saveFieldAccess', { fields: [
      { key: `update|${H.obs}`, newSee: true, regularSee: true },
      { key: `update|${H.allergies}`, newSee: true, regularSee: true },
      { key: `update|${H.blood}`, newSee: false, regularSee: true },
      { key: 'trainee|Caregiver Name', newSee: false, regularSee: true },
    ] }));
    assert.match(access.message, /Saved 4 changes/);
    fails(admin('saveFieldAccess', { fields: [{ key: 'update|Made up', newSee: true }] }), 'VALIDATION_ERROR');
    t = ok(rt.call('myTrainee', { traineeId: 'T-0001' }, reg.token)).trainee;
    assert.deepEqual(t.updateFields.map((x) => x.label).sort(), [H.allergies, H.blood, H.obs].sort());
    assert.ok(t.fields.some((x) => x.label === 'Caregiver Name'));
    assert.ok(!JSON.stringify(t).includes('123A'), 'the NRIC stays hidden');

    // a new volunteer paired for a session sees their trainee, with the new-volunteer fields only
    const s = ok(admin('createSession', { date: TODAY, startTime: '10:00', endTime: '12:00', venue: SCHOOL })).session;
    const bookingId = ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token)).home.upcoming[0].bookingId;
    ok(admin('updateBooking', { bookingId, traineeIds: ['T-0001'] }));
    const mine = ok(rt.call('myTrainee', { traineeId: 'T-0001' }, vol.token)).trainee;
    assert.deepEqual(mine.updateFields.map((x) => x.label).sort(), [H.allergies, H.obs].sort());
    assert.ok(!mine.fields.some((x) => x.label === 'Medical Notes'));
    assert.equal(ok(rt.call('myTrainees', {}, vol.token)).trainees[0].pairedBecause, `session on ${TODAY}`);
  });

  test('a volunteer\'s update is a new row in the same form format, carrying over unchanged answers', () => {
    linkUpdates();
    ok(admin('saveFieldAccess', { fields: [{ key: `update|${H.obs}`, newSee: true, regularSee: true }, { key: `update|${H.allergies}`, newSee: false, regularSee: true }] }));
    const res = ok(rt.call('submitTraineeUpdate', {
      traineeId: 'T-0001', visitDate: '2026-10-13', changes: { [H.obs]: 'Now helps set the table.', [H.allergies]: 'Peanuts' },
    }, reg.token));
    assert.match(res.message, /updated 1 answer for Alex Tan Wei Ming/); // the allergy answer did not change
    const rows = rt.records(VISITS, 'Form Responses 1');
    assert.equal(rows.length, 4);
    const last = rows[3];
    assert.equal(last[H.v1], 'Ria Regular');
    assert.equal(last[H.trainee], 'alex tan wei ming'); // the name as last typed in their sheet
    assert.equal(last[H.obs], 'Now helps set the table.');
    assert.equal(last[H.nric], '123A'); // carried over, though volunteers never see it
    assert.equal(last[H.address], 'Blk 1 Fictional Ave');
    const isDate = (v) => Object.prototype.toString.call(v) === '[object Date]'; // (a Date from the Apps Script sandbox)
    assert.ok(isDate(last[H.ts]) && isDate(last[H.date])); // real dates, like the form writes
    assert.equal(ok(admin('traineeProfile', { traineeId: 'T-0001' })).updates.fields.find((f) => f.label === H.obs).value, 'Now helps set the table.');

    fails(rt.call('submitTraineeUpdate', { traineeId: 'T-0001', changes: { [H.nric]: '999Z' } }, reg.token), 'VALIDATION_ERROR'); // not allowed
    fails(rt.call('submitTraineeUpdate', { traineeId: 'T-0001', changes: { [H.allergies]: 'Shellfish' } }, vol.token), 'NOT_FOUND'); // not paired
    fails(rt.call('submitTraineeUpdate', { traineeId: 'T-0001', changes: {} }, reg.token), 'VALIDATION_ERROR');
    fails(rt.call('submitTraineeUpdate', { traineeId: 'T-0001', visitDate: '2026-12-01', note: 'x' }, reg.token), 'VALIDATION_ERROR');
  });

  test('a note with an update waits for an admin, like session feedback', () => {
    const res = ok(rt.call('submitTraineeUpdate', { traineeId: 'T-0003', note: 'Chris asked to join football.' }, reg.token));
    assert.match(res.message, /sent your note to the admins/);
    const [item] = ok(admin('reviewQueue')).items;
    assert.equal(item.type, 'Trainee update');
    assert.equal(item.traineeName, 'Chris Ng');
    ok(admin('reviewObservation', { feedbackId: item.feedbackId, decision: 'share' }));
    assert.equal(ok(rt.call('myTrainee', { traineeId: 'T-0003' }, reg.token)).trainee.notes[0].note, 'Chris asked to join football.');
  });

  test('a broken link never stops volunteers using the app', () => {
    linkUpdates();
    rt.tab(VISITS, 'Form Responses 1').set(1, 6, 'Renamed column');
    ok(rt.call('volunteerHome', {}, reg.token));
    assert.equal(ok(rt.call('myTrainees', {}, reg.token)).updatesLinked, false);
    assert.match(ok(admin('listTraineeUpdates')).error, /Trainee's Full Name/);
  });
});

describe('the Pairing List', () => {
  test('pairs are many-to-many; ending one keeps it as history', () => {
    ok(admin('addPair', { userId: reg.user.userId, traineeId: 'T-0001' }));
    ok(admin('addPair', { userId: reg.user.userId, traineeId: 'T-0002' }));
    const res = ok(admin('addPair', { userId: vol.user.userId, traineeId: 'T-0001', notes: 'Shadowing Ria' }));
    assert.match(res.message, /Alex Tan Wei Ming has 2 regular volunteers/);
    assert.deepEqual(res.counts, { pairs: 3, volunteers: 2, trainees: 2, traineesWithoutPair: 1 });
    const p = res.pairs.find((x) => x.userId === vol.user.userId);
    const ended = ok(admin('endPair', { pairId: p.pairId }));
    assert.equal(ended.counts.pairs, 2);
    fails(admin('endPair', { pairId: p.pairId }), 'CONFLICT');
    assert.equal(ok(admin('listPairs', { showEnded: true })).pairs.find((x) => x.pairId === p.pairId).status, 'ended');
    assert.equal(rt.records(SHEET, 'Pairing List').length, 3);
    assert.deepEqual(ok(rt.call('volunteerHome', {}, reg.token)).myPairs.map((x) => x.traineeName), ['Alex Tan Wei Ming', 'Bea Lim']);
  });

  test('pairs can be imported from the house-visit responses and from an existing pairs sheet', () => {
    linkUpdates();
    let res = ok(admin('importPairs', { from: 'traineeUpdates' }));
    // Alex's latest visit: Ria + Nina (both match); Bea's: "Nobody Known" (no such volunteer)
    assert.equal(res.imported.added, 2);
    assert.deepEqual(res.imported.unmatched, ['Nobody Known – Bea Lim (volunteer not found)']);
    res = ok(admin('importPairs', { from: 'traineeUpdates' }));
    assert.equal(res.imported.already, 2);

    rt.createSpreadsheet('pairs-book', 'Outing app pairs');
    rt.fillTab('pairs-book', 'Pairs', [['Volunteer Email', 'Trainee'], ['ria@example.com', 'Chris Ng'], ['ria@example.com', 'Somebody Else']]);
    ok(admin('saveDataSource', { key: 'pairs', url: sheetLink('pairs-book') }));
    res = ok(admin('importPairs', { from: 'pairs' }));
    assert.equal(res.imported.added, 1);
    assert.match(res.message, /Imported 1 pair, 1 not matched/);
    assert.equal(res.pairs.filter((x) => x.source === 'imported').length, 3);
  });

  test('a trainee\'s page lists everyone they have been with', () => {
    linkUpdates();
    ok(admin('addPair', { userId: reg.user.userId, traineeId: 'T-0001' }));
    rt.setNow(at('08:00', '2026-10-13'));
    staff.adminToken = ok(rt.call('adminUnlock', { password: ADMIN_PW }, staff.token)).adminToken;
    const s = ok(admin('createSession', { date: '2026-10-13', startTime: '10:00', endTime: '12:00', venue: SCHOOL })).session;
    const bookingId = ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token)).home.upcoming[0].bookingId;
    ok(admin('updateBooking', { bookingId, traineeIds: ['T-0001'] }));
    rt.setNow(at('09:00'));
    staff.adminToken = ok(rt.call('adminUnlock', { password: ADMIN_PW }, staff.token)).adminToken;
    const partners = ok(admin('traineeProfile', { traineeId: 'T-0001' })).partners;
    const byName = Object.fromEntries(partners.map((x) => [x.name, x]));
    assert.equal(partners[0].name, 'Ria Regular'); // the regular pair first
    assert.equal(byName['Ria Regular'].regular, true);
    assert.equal(byName['Ria Regular'].visits, 2);
    assert.equal(byName['Nina New'].sessions, 1);
    assert.equal(byName['Nina New'].visits, 1);
    const mine = ok(admin('personDetail', { userId: vol.user.userId })).partners;
    assert.equal(mine[0].traineeId, 'T-0001');
  });
});

describe('photos and guide files', () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]).toString('base64');
  const PDF = Buffer.from('%PDF-1.4\n% fictional test file\n').toString('base64');

  test('an admin uploads a trainee photo; regulars see it, new volunteers only for their own trainee', () => {
    fails(admin('uploadTraineePhoto', { traineeId: 'T-0001', name: 'alex.png', mimeType: 'image/jpeg', data: PNG }), 'VALIDATION_ERROR'); // not really a JPEG
    fails(admin('uploadTraineePhoto', { traineeId: 'T-0001', name: 'alex.pdf', mimeType: 'application/pdf', data: PDF }), 'VALIDATION_ERROR');
    const up = ok(admin('uploadTraineePhoto', { traineeId: 'T-0001', name: 'alex.png', mimeType: 'image/png', data: PNG }));
    assert.match(up.photoFileId, /^FL-/);
    assert.equal(rt.records(SHEET, 'Files')[0]['Used For'], 'trainee-photo:T-0001');
    const fileId = ok(rt.call('myTrainees', {}, reg.token)).trainees.find((t) => t.id === 'T-0001').photoFileId;
    assert.equal(ok(rt.call('getFile', { fileId }, reg.token)).data, PNG);
    fails(rt.call('getFile', { fileId }, vol.token), 'NOT_FOUND');
    // replacing the photo removes the old file
    const second = ok(admin('uploadTraineePhoto', { traineeId: 'T-0001', name: 'alex2.png', mimeType: 'image/png', data: PNG }));
    fails(rt.call('getFile', { fileId }, reg.token), 'NOT_FOUND');
    assert.equal(rt.records(SHEET, 'Trainee Photos').length, 1);
    ok(admin('saveFieldAccess', { fields: [{ key: 'app|Photo', newSee: true, regularSee: false }] }));
    fails(rt.call('getFile', { fileId: second.photoFileId }, reg.token), 'NOT_FOUND');
    ok(admin('removeTraineePhoto', { traineeId: 'T-0001' }));
    assert.equal(ok(admin('traineeProfile', { traineeId: 'T-0001' })).photoFileId, '');
  });

  test('guide sections can show a picture or a PDF instead of text', () => {
    const day = ok(admin('leaderContent')).sections.find((s) => s.title === 'On the day');
    assert.equal(day.media.src, 'img/on-the-day.svg');
    const res = ok(admin('uploadGuideMedia', { sectionId: day.sectionId, name: 'on-the-day.pdf', mimeType: 'application/pdf', data: PDF }));
    const media = res.sections.find((s) => s.sectionId === day.sectionId).media;
    assert.equal(media.kind, 'pdf');
    const g = ok(rt.call('guide', {}, vol.token)).sections.find((s) => s.title === 'On the day');
    assert.equal(ok(rt.call('getFile', { fileId: g.media.fileId }, vol.token)).mimeType, 'application/pdf');
    ok(admin('removeGuideMedia', { sectionId: day.sectionId }));
    assert.equal(ok(rt.call('guide', {}, vol.token)).sections.find((s) => s.title === 'On the day').media, null);
    ok(admin('saveGuideSection', { sectionId: day.sectionId, title: 'On the day', body: '', useInfographic: true }));
    assert.equal(ok(rt.call('guide', {}, vol.token)).sections.find((s) => s.title === 'On the day').media.kind, 'builtin');
    fails(admin('uploadGuideMedia', { sectionId: day.sectionId, name: 'x.png', mimeType: 'image/png', data: 'not base64!' }), 'VALIDATION_ERROR');
  });
});

describe('Google Contacts', () => {
  test('a new volunteer is added to the admin account\'s contacts, with their Telegram in the notes', () => {
    assert.equal(rt.contacts.accountEmail, 'vcoder302026@gmail.com');
    const contacts = [...rt.contacts.contacts.values()];
    const nina = contacts.find((c) => c.names[0].givenName === 'Nina New');
    assert.match(nina.biographies[0].value, /^Telegram: @nina_new/);
    assert.equal(nina.emailAddresses[0].value, 'nina@example.com');
    assert.deepEqual(nina.memberships, ['MINDS Volunteers']);
    assert.match(rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'nina@example.com')['Google Contact'], /^people\/c\d+$/);

    ok(rt.call('updateProfile', { telegram: 'nina_renamed', phone: '+65 9000 2222' }, vol.token));
    const updated = rt.contacts.contacts.get(nina.resourceName);
    assert.match(updated.biographies[0].value, /@nina_renamed/);
    assert.equal(updated.phoneNumbers[0].value, '+65 9000 2222');
    assert.equal(rt.contacts.contacts.size, 3); // updated, not duplicated
    const status = ok(admin('adminSettings')).contacts;
    assert.deepEqual([status.synced, status.notSynced], [3, 0]);
  });

  test('without the People API the registration still works, and admins can sync later', () => {
    const off = createGasRuntime({ people: false });
    off.createSpreadsheet(SHEET, 'MINDS');
    off.fillTab(SHEET, 'Trainees', [['Name'], ['Alex']]);
    off.props.set('SPREADSHEET_ID', SHEET);
    off.run('setup');
    ok(off.call('register', { name: 'No Contacts', email: 'nc@example.com', telegram: 'no_contacts', password: 'password123', birthday: '2000-01-01', phone: '+65 9123 4567', consent: true }));
    assert.match(off.records(SHEET, 'Volunteers')[0]['Google Contact'], /^Not synced/);

    rt.contacts.contacts.clear();
    ok(admin('updatePerson', { userId: vol.user.userId, name: 'Nina New-Name' })); // its old contact is gone → error
    assert.match(rt.records(SHEET, 'Volunteers').find((r) => r.Email === 'nina@example.com')['Google Contact'], /^Error:/);
    const res = ok(admin('syncContacts', {}));
    assert.match(res.message, /Google Contacts: 1 added/);
    assert.equal(res.contacts.synced, 3);
  });
});
