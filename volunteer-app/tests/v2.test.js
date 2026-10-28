// Tests for the October 2026 changes: trainees read from MINDS's House Visit
// form (separate file, linked by URL), what volunteers and regulars may see,
// trainee updates from volunteers, and the admin activity log. Run: npm test

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
let admin; // token
let setupReport;
const call = (action, payload = {}, token = admin) => rt.call(action, payload, token);

function person(email, name) {
  const v = ok(rt.call('register', {
    name, email, password: PW, birthday: '2001-05-06', phone: '+65 9123 4567', telegram: 'vol_tg',
    emergencyName: 'Parent', emergencyPhone: '+65 8123 4567', emergencyRelation: 'Mother', consent: true,
  }));
  ok(rt.call('acknowledgeGuide', {}, v.token));
  return v;
}

beforeEach(() => {
  rt = createGasRuntime();
  rt.createSpreadsheet(MAIN, 'MINDS Volunteers');
  rt.createSpreadsheet(TRAINEE_FILE, '[Exp] House Visit Template Form (Responses)');
  const form = rt.fillTab(TRAINEE_FILE, 'Form Responses 1', [MOCK.headers, ...MOCK.rows]);
  rt.fillTab(TRAINEE_FILE, 'Map (Fixed)', MOCK.map);
  rt.fillTab(TRAINEE_FILE, 'Lookup', [['Trainee’s Full Name', 'Project']]);
  // Both properties pasted as browser URLs; the trainee one points at the form's tab.
  rt.props.set('SPREADSHEET_ID', `https://docs.google.com/spreadsheets/d/${MAIN}/edit#gid=0`);
  rt.props.set('TRAINEE_SPREADSHEET_ID', `https://docs.google.com/spreadsheets/d/${TRAINEE_FILE}/edit#gid=${form.getSheetId()}`);
  rt.setNow(`${TODAY}T09:00:00+08:00`);
  setupReport = rt.run('setup');
  rt.evaluate("setAdminActionPassword_('admin-test-pass')");
  person('admin@example.com', 'Ada Admin');
  rt.props.set('FIRST_ADMIN_EMAIL', 'admin@example.com');
  rt.run('makeFirstAdmin');
  admin = ok(rt.call('login', { email: 'admin@example.com', password: PW })).token;
});

describe("trainees from the House Visit form's response sheet", () => {
  test('setup links the form by URL, adds IDs, and leaves its columns alone', () => {
    assert.match(setupReport, /Trainee sheet: "\[Exp\] House Visit Template Form \(Responses\)", tab "Form Responses 1"/);
    assert.match(setupReport, /Added IDs to 100 trainee\(s\)/);
    const sheet = rt.tab(TRAINEE_FILE, 'Form Responses 1');
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    assert.deepEqual(header.slice(0, MOCK.headers.length), MOCK.headers, 'existing form columns unchanged');
    const added = header.slice(MOCK.headers.length).filter(Boolean);
    assert.deepEqual(added, ['Trainee ID', 'Latest Volunteer Observation', 'Observation Updated']);
    const list = ok(call('listTrainees')).trainees;
    assert.equal(list.length, 100);
    const t1 = list.find((t) => t.id === 'T-0001');
    assert.equal(t1.name, 'Mock Trainee 1'); // "Trainee’s Full Name" with a curly apostrophe
    assert.equal(t1.gender, 'Male');
  });

  test("the admin profile groups every column into the form's sections", () => {
    const p = ok(call('traineeProfile', { traineeId: 'T-0002' }));
    const titles = p.sections.map((s) => s.title);
    for (const t of ["Trainee's Details", 'Emergency Contacts', 'Medical & Health', 'Abilities / Skills', "Volunteers' Observations"]) {
      assert.ok(titles.includes(t), `missing section ${t}`);
    }
    const details = p.sections.find((s) => s.title === "Trainee's Details").fields.map((f) => f.label);
    assert.ok(details.includes('Address') && details.includes('Blood Type'));
    const all = JSON.stringify(p.sections);
    assert.ok(!all.includes('Timestamp'), 'form bookkeeping is hidden');
    assert.ok(all.includes('Blk 218 Woodlands Drive'));
    assert.ok(all.includes('89912760'), 'phone numbers read as text, not 89912760.0');
  });
});

describe('what volunteers and regulars can see', () => {
  let vol;
  let reg;
  let sessionId;
  beforeEach(() => {
    vol = person('vol@example.com', 'Val Volunteer');
    reg = person('reg@example.com', 'Rex Regular');
    ok(call('setVolunteerType', { userId: reg.user.userId, volunteerType: 'regular' }));
    sessionId = ok(call('createSession', { title: 'House visit', date: '2026-10-17', startTime: '10:00', endTime: '12:00', venue: SCHOOL })).session.sessionId;
    const booking = ok(rt.call('bookSession', { sessionId }, vol.token)).home.upcoming[0].bookingId;
    ok(call('updateBooking', { bookingId: booking, traineeId: 'T-0001' }));
  });

  // What the person sees: the sections, plus gender beside the photo (no longer repeated in a section).
  const labels = (info) => info.sections.flatMap((s) => s.fields.map((f) => f.label)).concat(info.trainee.gender ? ['Gender'] : []);

  test('an ad hoc volunteer sees only the default details of their paired trainee', () => {
    const info = ok(rt.call('traineeInfo', { traineeId: 'T-0001' }, vol.token));
    assert.equal(info.access, 'volunteer');
    const seen = labels(info);
    assert.ok(seen.includes('Gender'));
    assert.ok(seen.some((l) => /Sing-along/.test(l)) === false);
    assert.ok(info.sections.some((s) => s.title === 'Abilities / Skills'));
    for (const hidden of ['Address', 'NRIC (Last 4 Alphanumeric. e.g. 123A)', 'Blood Type', 'Date of Birth (DD MMM YYYY)']) {
      assert.ok(!seen.includes(hidden), `${hidden} must not reach ad hoc volunteers`);
    }
    fails(rt.call('traineeInfo', { traineeId: 'T-0002' }, vol.token), 'FORBIDDEN');
  });
  test('beside the photo: short name, gender and language only if volunteers may see them; not repeated below', () => {
    ok(call('saveVisibility', { audience: 'volunteer', fields: ['Race'] }));
    const info = ok(rt.call('traineeInfo', { traineeId: 'T-0001' }, vol.token));
    assert.equal(info.trainee.gender, '', 'gender is hidden when volunteers may not see it');
    assert.equal(info.trainee.preferredName, '');
    const full = ok(call('traineeInfo', { traineeId: 'T-0001' }));
    assert.ok(full.trainee.gender, 'admins see it');
    const all = full.sections.flatMap((x) => x.fields.map((f) => f.label));
    assert.ok(!all.includes('Gender') && !all.some((l) => /Short Name/i.test(l)), 'not repeated in the sections');
    fails(rt.call('traineeDirectory', {}, vol.token), 'FORBIDDEN');
    // The card on their upcoming session uses the same rules.
    const card = ok(rt.call('volunteerHome', {}, vol.token)).upcoming[0].trainee;
    assert.ok(!JSON.stringify(card).includes('Blk 443'));
  });

  test('a regular can browse every trainee and see every detail', () => {
    const dir = ok(rt.call('traineeDirectory', {}, reg.token));
    assert.equal(dir.trainees.length, 100);
    const info = ok(rt.call('traineeInfo', { traineeId: 'T-0042' }, reg.token));
    assert.equal(info.access, 'regular');
    assert.ok(labels(info).includes('Address'));
  });

  test('admins change the default, give one trainee its own settings, reset it, or make it the default', () => {
    fails(call('saveVisibility', { audience: 'volunteer', fields: ['Not a column'] }), 'VALIDATION_ERROR');
    ok(call('saveVisibility', { audience: 'volunteer', fields: ['Gender'] }));
    assert.deepEqual(labels(ok(rt.call('traineeInfo', { traineeId: 'T-0001' }, vol.token))), ['Gender']);

    const own = ok(call('saveVisibility', { audience: 'volunteer', traineeId: 'T-0001', fields: ['Gender', 'Blood Type'] }));
    assert.equal(own.audiences.volunteer.isDefault, false);
    assert.deepEqual(labels(ok(rt.call('traineeInfo', { traineeId: 'T-0001' }, vol.token))).sort(), ['Blood Type', 'Gender']);
    ok(call('saveVisibility', { audience: 'volunteer', traineeId: 'T-0001', reset: true }));
    assert.deepEqual(labels(ok(rt.call('traineeInfo', { traineeId: 'T-0001' }, vol.token))), ['Gender']);

    ok(call('saveVisibility', { audience: 'volunteer', traineeId: 'T-0001', fields: ['Gender', 'Race'], makeDefault: true }));
    const settings = ok(call('visibilitySettings', {}));
    assert.deepEqual(settings.audiences.volunteer.fields.filter((k) => !k.startsWith('notes:')).sort(), ['gender', 'race']);
    assert.ok(rt.records(MAIN, 'App Settings').some((r) => r.Setting === 'visibility.volunteer'));

    ok(call('saveVisibility', { audience: 'regular', fields: ['Gender', 'Address'] }));
    assert.deepEqual(labels(ok(rt.call('traineeInfo', { traineeId: 'T-0042' }, reg.token))).sort(), ['Address', 'Gender']);
  });

  test('volunteers send updates about their trainee; an admin reviews them first', () => {
    const res = ok(rt.call('submitTraineeUpdate', { traineeId: 'T-0001', note: 'Enjoyed the sing-along today.' }, vol.token));
    assert.match(res.message, /An admin will review/);
    fails(rt.call('submitTraineeUpdate', { traineeId: 'T-0002', note: 'x' }, vol.token), 'FORBIDDEN');
    ok(rt.call('submitTraineeUpdate', { traineeId: 'T-0099', note: 'Regulars can update anyone.' }, reg.token));
    const queue = ok(call('reviewQueue')).items;
    assert.deepEqual(queue.map((q) => q.traineeName), ['Mock Trainee 1', 'Mock Trainee 99']);
    ok(call('reviewObservation', { feedbackId: queue[0].feedbackId, decision: 'share' }));
    const info = ok(rt.call('traineeInfo', { traineeId: 'T-0001' }, vol.token));
    assert.equal(info.notes[0].note, 'Enjoyed the sing-along today.');
  });
});

describe('admin activity log', () => {
  test('every admin change is recorded in plain English; passwords never are', () => {
    const v = person('vol@example.com', 'Val Volunteer');
    const second = person('second@example.com', 'Sam Second');
    ok(call('setRole', { userId: second.user.userId, role: 'admin', adminPassword: 'admin-test-pass' }));
    const second2 = ok(rt.call('login', { email: 'second@example.com', password: PW })).token;
    ok(call('setVolunteerType', { userId: v.user.userId, volunteerType: 'regular' }));
    ok(call('setStandingPairing', { userId: v.user.userId, traineeId: 'T-0003' }));
    const s = ok(call('createSession', { title: 'Outing prep', date: TODAY, startTime: '10:00', endTime: '11:00', venue: SCHOOL })).session;
    ok(call('setRole', { userId: second.user.userId, role: 'volunteer', adminPassword: 'admin-test-pass' }, admin));
    ok(call('listAdminLog', {}, admin));
    fails(rt.call('listAdminLog', {}, v.token), 'FORBIDDEN');
    fails(rt.call('listAdminLog', {}, second2), 'FORBIDDEN'); // no longer an admin

    const log = ok(call('listAdminLog', {})).entries;
    const lines = log.map((e) => `${e.adminName}: ${e.action}: ${e.summary}`);
    assert.deepEqual(lines, [
      'Ada Admin: Changed admin access: Sam Second → not an admin',
      `Ada Admin: Created a session: Outing prep on ${TODAY}`,
      'Ada Admin: Changed a regular pairing: Val Volunteer ↔ Mock Trainee 3',
      'Ada Admin: Changed a volunteer type: Val Volunteer → regular',
      'Ada Admin: Changed admin access: Sam Second → admin',
      'Apps Script editor: Made the first admin: Ada Admin',
    ]);
    assert.ok(s.sessionId);
    const sheet = JSON.stringify(rt.records(MAIN, 'Admin Activity Log'));
    assert.ok(!sheet.includes(PW), 'passwords are never logged');
    const filtered = ok(call('listAdminLog', { query: 'pairing' })).entries;
    assert.equal(filtered.length, 1);
  });
});

describe('infographics in the Volunteer Guide', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64'); // a tiny PNG header

  test('an admin uploads an image; it goes to a shared Drive folder and shows at the top of the guide', () => {
    const res = ok(call('addGuideFile', { title: 'Your first session', body: 'Read this first.', fileName: 'day-plan.png', mimeType: 'image/png', data: `data:image/png;base64,${PNG}` }));
    assert.match(res.message, /Image added to the guide/);
    const first = res.sections[0];
    assert.equal(first.kind, 'image');
    assert.equal(first.title, 'Your first session');
    assert.match(first.imageUrl, /^https:\/\/drive\.google\.com\/thumbnail\?id=/);
    const file = rt.drive.files.get(first.fileId);
    assert.equal(file.sharing, 'ANYONE_WITH_LINK', 'volunteers do not sign in to Google, so the file is link-shared');
    const folderId = rt.props.get('GUIDE_FOLDER_ID');
    assert.equal(file.parent, folderId);
    assert.equal(rt.drive.folders.get(folderId).name, 'MINDS Volunteer App – Guide infographics');

    // A volunteer reading the guide gets the infographic first, then the text sections.
    const v = person('vol@example.com', 'Val Volunteer');
    const guide = ok(rt.call('guide', {}, v.token));
    assert.deepEqual(guide.sections.slice(0, 2).map((g) => g.kind), ['image', 'text']);
    fails(rt.call('addGuideFile', { fileName: 'x.png', mimeType: 'image/png', data: PNG }, v.token), 'FORBIDDEN');

    // A second upload uses the same folder; "bottom" puts it last.
    const again = ok(call('addGuideFile', { fileName: 'map.jpg', mimeType: 'image/jpeg', data: PNG, position: 'bottom' }));
    assert.equal(again.sections[again.sections.length - 1].fileName, 'map.jpg');
    assert.equal(rt.drive.folders.size, 1);
  });

  test('a PDF picked from Google Drive by its share link', () => {
    const file = rt.drive.addFile('Volunteer briefing.pdf', 'application/pdf');
    const res = ok(call('addGuideFile', { driveUrl: `https://drive.google.com/file/d/${file.id}/view?usp=sharing` }));
    const item = res.sections[0];
    assert.equal(item.kind, 'pdf');
    assert.equal(item.fileName, 'Volunteer briefing.pdf');
    assert.match(item.previewUrl, /\/preview$/);
    assert.equal(file.sharing, 'ANYONE_WITH_LINK');
    // "Open with" style links work too
    const f2 = rt.drive.addFile('Poster.jpg', 'image/jpeg');
    assert.equal(ok(call('addGuideFile', { driveUrl: `https://drive.google.com/open?id=${f2.id}` })).sections[0].kind, 'image');
  });

  test('wrong file types, bad links, files the app cannot open, and files too big are refused', () => {
    fails(call('addGuideFile', { fileName: 'notes.txt', mimeType: 'text/plain', data: PNG }), 'VALIDATION_ERROR');
    fails(call('addGuideFile', { driveUrl: 'https://example.com/picture.png' }), 'VALIDATION_ERROR');
    fails(call('addGuideFile', { driveUrl: 'https://drive.google.com/file/d/1NotARealFileIdAtAll123/view' }), 'VALIDATION_ERROR');
    const doc = rt.drive.addFile('Notes', 'application/vnd.google-apps.document');
    fails(call('addGuideFile', { driveUrl: `https://drive.google.com/file/d/${doc.id}/view` }), 'VALIDATION_ERROR');
    rt.evaluate('CONFIG.GUIDE_FILES.maxMb = 0.000001');
    const err = fails(call('addGuideFile', { fileName: 'big.png', mimeType: 'image/png', data: PNG }), 'VALIDATION_ERROR');
    assert.match(err.message, /too big/);
  });

  test('a file whose sharing is blocked is still added, with a warning', () => {
    const file = rt.drive.addFile('Locked.pdf', 'application/pdf');
    file.blockSharing = true;
    const res = ok(call('addGuideFile', { driveUrl: file.id }));
    assert.match(res.message, /may not be able to see it/);
  });

  test('admins edit the heading and caption, replace the file, reorder and remove an infographic', () => {
    const added = ok(call('addGuideFile', { fileName: 'old.png', mimeType: 'image/png', data: PNG }));
    const id = added.sections[0].sectionId;
    // heading and caption are optional for an infographic
    const edited = ok(call('saveGuideSection', { sectionId: id, title: 'On the day', body: '' }));
    assert.equal(edited.sections[0].title, 'On the day');
    const pdf = rt.drive.addFile('New plan.pdf', 'application/pdf');
    const replaced = ok(call('addGuideFile', { sectionId: id, driveUrl: pdf.id }));
    assert.match(replaced.message, /PDF replaced/);
    assert.equal(replaced.sections[0].kind, 'pdf');
    assert.equal(replaced.sections[0].title, 'On the day', 'replacing the file keeps the heading');
    const moved = ok(call('moveContent', { kind: 'guide', id, direction: 'down' }));
    assert.equal(moved.sections[1].sectionId, id);
    const left = ok(call('deleteGuideSection', { sectionId: id }));
    assert.ok(!left.sections.some((g) => g.sectionId === id));
    assert.ok(rt.drive.files.has(pdf.id), 'the file itself stays in Google Drive');
    const log = ok(call('listAdminLog', { query: 'infographic' })).entries;
    assert.equal(log.length, 2);
  });
});

describe('trainee photos', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');

  test('admins add, change and remove a photo; volunteers who can open the trainee see it', () => {
    const before = ok(call('traineeProfile', { traineeId: 'T-0001' }));
    assert.equal(before.trainee.photoUrl, '', 'no photo yet: the app shows a placeholder');
    const added = ok(call('setTraineePhoto', { traineeId: 'T-0001', fileName: 'mock1.jpg', mimeType: 'image/jpeg', data: PNG }));
    assert.match(added.message, /Added Mock Trainee 1's photo/);
    assert.match(added.trainee.photoUrl, /thumbnail\?id=/);
    const fileId = rt.records(MAIN, 'Trainee Photos')[0]['Drive File ID'];
    assert.equal(rt.drive.files.get(fileId).sharing, 'ANYONE_WITH_LINK');
    assert.equal(rt.drive.folders.get(rt.props.get('PHOTO_FOLDER_ID')).name, 'MINDS Volunteer App – Trainee photos');
    assert.ok(ok(call('listTrainees')).trainees.find((t) => t.id === 'T-0001').photoUrl);

    // the paired volunteer sees it on their session and on the trainee page
    const v = person('vol@example.com', 'Val Volunteer');
    const s = ok(call('createSession', { title: 'Art', date: '2026-10-17', startTime: '10:00', endTime: '12:00', venue: SCHOOL })).session;
    const b = ok(rt.call('bookSession', { sessionId: s.sessionId }, v.token)).home.upcoming[0].bookingId;
    ok(call('updateBooking', { bookingId: b, traineeId: 'T-0001' }));
    assert.ok(ok(rt.call('volunteerHome', {}, v.token)).upcoming[0].trainee.photoUrl);
    assert.ok(ok(rt.call('traineeInfo', { traineeId: 'T-0001' }, v.token)).trainee.photoUrl);
    fails(rt.call('setTraineePhoto', { traineeId: 'T-0001', remove: true }, v.token), 'FORBIDDEN');

    // change it from Google Drive, then remove it
    const fromDrive = rt.drive.addFile('portrait.png', 'image/png');
    ok(call('setTraineePhoto', { traineeId: 'T-0001', driveUrl: `https://drive.google.com/file/d/${fromDrive.id}/view` }));
    assert.equal(rt.records(MAIN, 'Trainee Photos').length, 1, 'one photo per trainee');
    fails(call('setTraineePhoto', { traineeId: 'T-0001', fileName: 'plan.pdf', mimeType: 'application/pdf', data: PNG }), 'VALIDATION_ERROR');
    const removed = ok(call('setTraineePhoto', { traineeId: 'T-0001', remove: true }));
    assert.equal(removed.trainee.photoUrl, '');
    assert.ok(rt.drive.files.has(fromDrive.id), 'the file stays in Google Drive');
    assert.equal(ok(call('listAdminLog', { query: 'photo' })).entries.length, 3);
  });

  test("the form's list of attached volunteers is not shown anywhere", () => {
    const p = ok(call('traineeProfile', { traineeId: 'T-0002' }));
    assert.ok(!p.sections.some((s) => s.title === "Volunteers' Details"));
    assert.ok(!JSON.stringify(p.sections).includes('Name of Attached Volunteer'));
    const settings = ok(call('visibilitySettings', {}));
    assert.ok(!settings.sections.some((s) => s.title === "Volunteers' Details"));
  });
});

describe('the House Visit Form (Admin → House visits)', () => {
  const allFields = (form) => form.sections.flatMap((s) => s.fields);
  const find = (form, re) => allFields(form).find((f) => re.test(f.label));

  test('asks the trainee sheet\'s questions, in its sections, prefilled for a trainee', () => {
    const blank = ok(call('houseVisitForm', {}));
    const titles = blank.sections.map((s) => s.title);
    assert.ok(titles.indexOf('General Details') < titles.indexOf("Trainee's Details"), titles.join(' | '));
    assert.ok(titles.includes('Medical & Health') && titles.includes("Volunteers' Observations"), titles.join(' | '));
    assert.ok(!find(blank, /^Timestamp$/), 'form bookkeeping is not a question');
    const mobility = find(blank, /^Select the MOBILITY level/);
    assert.equal(mobility.type, 'likert');
    assert.deepEqual(mobility.likert, { left: 'Need support to walk and can be clumsy', right: 'Agile and stable' });
    assert.equal(find(blank, /^Date of Visit/).type, 'date');
    assert.equal(find(blank, /^Project$/).type, 'project');
    assert.equal(find(blank, /^Blood Type/).type, 'text');
    assert.equal(find(blank, /^Current Health Condition/).type, 'textarea');

    const t1 = ok(call('houseVisitForm', { traineeId: 'T-0001' }));
    assert.equal(t1.trainee.id, 'T-0001');
    assert.equal(find(t1, /^Trainee’s Full Name/).value, MOCK.rows[0][MOCK.headers.indexOf('Trainee’s Full Name')]);
    assert.match(find(t1, /^Date of Birth/).value, /^\d{4}-\d{2}-\d{2}$|^$/);
    fails(call('houseVisitForm', { traineeId: 'T-9999' }), 'NOT_FOUND');
  });

  test('saving keeps a visit record and updates only what changed in the trainee sheet', () => {
    const form = ok(call('houseVisitForm', { traineeId: 'T-0002' }));
    const answers = Object.fromEntries(allFields(form).map((f) => [f.key, f.value]));
    const health = find(form, /^Current Health Condition/);
    const mobility = find(form, /^Select the MOBILITY level/);
    const visitDate = find(form, /^Date of Visit/);
    answers[health.key] = 'Recovering well from a cold.';
    answers[mobility.key] = '4';
    answers[visitDate.key] = '2026-10-10';
    fails(call('houseVisitForm', {}, null), 'UNAUTHORIZED');
    fails(call('createVisit', { traineeId: 'T-0002', answers: { ...answers, [mobility.key]: '7' } }), 'VALIDATION_ERROR');
    fails(call('createVisit', { traineeId: 'T-0002', answers: { nonsense: 'x' } }), 'VALIDATION_ERROR');
    fails(call('createVisit', { traineeId: 'T-0002', answers: { ...answers, [visitDate.key]: '2027-01-01' } }), 'VALIDATION_ERROR');
    const res = ok(call('createVisit', { traineeId: 'T-0002', answers }));
    assert.match(res.message, /Visit to .* recorded\. Updated 3 of their details\./);
    const v = res.visits[0];
    assert.equal(v.date, '2026-10-10');
    const shown = v.sections.flatMap((s) => s.fields);
    assert.ok(shown.some((f) => /^Current Health Condition/.test(f.label) && f.value === 'Recovering well from a cold.'));
    assert.ok(shown.some((f) => f.type === 'likert' && f.value === '4'));
    // the trainee sheet has the new answers
    const row = rt.records(TRAINEE_FILE, 'Form Responses 1').find((r) => r['Trainee ID'] === 'T-0002');
    assert.equal(row[health.label], 'Recovering well from a cold.');
    // the visit record has one column per question
    const rec = rt.records(MAIN, 'House Visits').find((r) => r['Visit ID'] === v.visitId);
    assert.equal(rec[health.label], 'Recovering well from a cold.');
    // "don't update the trainee" leaves the trainee sheet alone
    answers[health.key] = 'Only in the visit record.';
    const res2 = ok(call('createVisit', { traineeId: 'T-0002', answers, updateTrainee: false }));
    assert.doesNotMatch(res2.message, /Updated/);
    assert.equal(rt.records(TRAINEE_FILE, 'Form Responses 1').find((r) => r['Trainee ID'] === 'T-0002')[health.label], 'Recovering well from a cold.');
    assert.equal(ok(call('listVisits', { traineeId: 'T-0002' })).visits.length, 2);
  });
});

describe('dates from the trainee sheet read like dates', () => {
  test('form timestamps and ISO dates show as "29 Dec 2025"', () => {
    assert.equal(rt.evaluate("displayValue_('2025-12-29 20:26:09')"), '29 Dec 2025');
    assert.equal(rt.evaluate("displayValue_('2026-01-05')"), '5 Jan 2026');
    assert.equal(rt.evaluate("displayValue_('Not a date 2025-12-29')"), 'Not a date 2025-12-29');
    const p = ok(call('traineeProfile', { traineeId: 'T-0001' }));
    const values = JSON.stringify(p);
    assert.doesNotMatch(values, /"\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}/, 'no raw timestamps on the trainee page');
  });
});

describe('Start New Blank Visit (a trainee not in the sheet yet)', () => {
  test('the blank form adds the trainee with the next ID and records the visit', () => {
    const blank = ok(call('houseVisitForm', {}));
    const fields = blank.sections.flatMap((s) => s.fields);
    const nameF = fields.find((f) => /^Trainee’s Full Name/.test(f.label));
    const genderF = fields.find((f) => /^Gender/.test(f.label));
    assert.equal(nameF.value, '');
    fails(call('createVisit', { newTrainee: true, answers: { [genderF.key]: 'Female' } }), 'VALIDATION_ERROR'); // no name
    const before = rt.records(TRAINEE_FILE, 'Form Responses 1').length;
    const res = ok(call('createVisit', { newTrainee: true, answers: { [nameF.key]: 'Nadia New', [genderF.key]: 'Female' } }));
    assert.match(res.message, /Nadia New added as T-0101, and the visit recorded\./);
    const rows = rt.records(TRAINEE_FILE, 'Form Responses 1');
    assert.equal(rows.length, before + 1);
    const row = rows.find((r) => r['Trainee ID'] === 'T-0101');
    assert.equal(row['Trainee’s Full Name'], 'Nadia New');
    assert.equal(row.Gender, 'Female');
    assert.equal(res.visits[0].traineeId, 'T-0101');
    assert.ok(ok(call('listTrainees', {})).trainees.some((t) => t.name === 'Nadia New'));
  });
});
