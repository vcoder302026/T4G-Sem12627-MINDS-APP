// Tests for the staff dashboard's backend actions (Dashboard.gs, Fundraising.gs,
// Outings.gs, Trips.gs, Visits.gs and the trainee editing in Trainees.gs),
// run in Node against the in-memory spreadsheet. Run: npm test

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { createGasRuntime } from '../dev/gas-harness.js';

const SHEET = 'sheet-1';
const TODAY = '2026-10-14';
const YESTERDAY = '2026-10-13';
const SCHOOL = 'MINDS Woodlands Gardens School';
const at = (hhmm, day = TODAY) => `${day}T${hhmm}:00+08:00`;

function ok(res) {
  assert.equal(res.ok, true, `expected ok, got ${JSON.stringify(res.error)}`);
  return res.data;
}
function fails(res, code) {
  assert.equal(res.ok, false, `expected ${code}, got ok`);
  assert.equal(res.error.code, code, res.error.message);
  return res.error;
}

function volunteerPayload(overrides = {}) {
  return {
    name: 'Vol One', birthday: '2001-05-06', email: 'v1@example.com', phone: '+65 9123 4567', telegram: '',
    emergencyName: 'Parent One', emergencyPhone: '+65 8123 4567', emergencyRelation: 'Mother',
    password: 'password123', consent: true, ...overrides,
  };
}

let rt;
let leader; // token
let vol; // { token, user }
const call = (action, payload = {}, token = leader) => rt.call(action, payload, token);

beforeEach(() => {
  rt = createGasRuntime();
  rt.createSpreadsheet(SHEET, 'MINDS Volunteer Data');
  rt.fillTab(SHEET, 'Trainees', [
    ['Name', 'Gender', 'Medical Notes', 'Support Needs', 'Programme'],
    ['Alex Tan', 'Male', 'Epilepsy plan on file', 'Verbal prompts', 'DAC'],
    ['Bea Lim', 'Female', '', '', 'DAC'],
  ]);
  rt.props.set('SPREADSHEET_ID', SHEET);
  rt.setNow(at('09:00'));
  rt.run('setup');
  ok(rt.call('register', volunteerPayload({ name: 'Leader Lee', email: 'leader@example.com' })));
  rt.props.set('FIRST_ADMIN_EMAIL', 'leader@example.com');
  rt.run('makeFirstAdmin');
  leader = ok(rt.call('login', { email: 'leader@example.com', password: 'password123' })).token;
  vol = ok(rt.call('register', volunteerPayload()));
  ok(rt.call('acknowledgeGuide', {}, vol.token));
});

describe('dashboard access and setup', () => {
  test('volunteers are blocked from every dashboard action', () => {
    const actions = ['dashboardOverview', 'listAttendance', 'addAttendance', 'updateAttendance', 'hoursReport', 'createVolunteer',
      'listTraineeRecords', 'traineeProfile', 'createTrainee', 'updateTrainee', 'listFundraisers', 'fundraiserDetail',
      'createFundraiser', 'updateFundraiser', 'saveProduct', 'createOrder', 'updateOrder', 'listOutings', 'outingDetail',
      'createOuting', 'updateOuting', 'assignOutingTrainee', 'updateOutingAssignment', 'listTrips', 'tripDetail', 'createTrip',
      'updateTrip', 'addTripParticipant', 'updateTripParticipant', 'addTripLogistics', 'updateTripLogistics', 'addTripExpense',
      'listVisits', 'createVisit'];
    actions.forEach((a) => {
      fails(rt.call(a, {}, vol.token), 'FORBIDDEN');
      fails(rt.call(a, {}), 'UNAUTHORIZED');
    });
  });

  test('setup creates the dashboard tabs and leaves the trainee tab alone', () => {
    ['Fundraisers', 'Products', 'Orders', 'Order Items', 'Outings', 'Outing Assignments', 'Trips',
      'Trip Participants', 'Trip Logistics', 'Trip Expenses', 'House Visits'].forEach((tab) => assert.ok(rt.tab(SHEET, tab), tab));
    const before = JSON.stringify(rt.tab(SHEET, 'Trainees').dump());
    rt.run('setup');
    assert.equal(JSON.stringify(rt.tab(SHEET, 'Trainees').dump()), before);
  });

  test('overview counts people, hours and upcoming events', () => {
    const o = ok(call('dashboardOverview'));
    assert.equal(o.counts.volunteers, 2); // everyone active, admins included
    assert.equal(o.counts.newVolunteers, 2);
    assert.equal(o.counts.regulars, 0);
    assert.equal(o.counts.admins, 1);
    assert.equal(o.counts.trainees, 2);
    assert.equal(o.counts.traineesWithoutRegular, 2);
    ok(call('setVolunteerType', { userId: vol.user.userId, volunteerType: 'regular' }));
    ok(call('setStandingPairing', { userId: vol.user.userId, traineeId: 'T-0001' }));
    const counts = ok(call('dashboardOverview')).counts;
    assert.deepEqual([counts.newVolunteers, counts.regulars, counts.traineesWithoutRegular], [1, 1, 1]);
    assert.equal(o.counts.hoursTotal, 0);
    ok(call('createOuting', { title: 'Zoo', date: '2026-10-20', location: 'Singapore Zoo' }));
    ok(call('createTrip', { title: 'Bangkok', destination: 'Thailand', startDate: '2026-12-01', endDate: '2026-12-05' }));
    const o2 = ok(call('dashboardOverview'));
    assert.equal(o2.upcomingOutings.length, 1);
    assert.equal(o2.upcomingTrips[0].title, 'Bangkok');
  });
});

describe('volunteers and trainees', () => {
  test('staff add a volunteer who can sign in with the temporary password', () => {
    const res = ok(call('createVolunteer', { name: 'New Person', email: 'New@Example.com', phone: '+65 9000 1111' }));
    assert.match(res.tempPassword, /^minds-\w{4}-\w{4}$/);
    assert.equal(res.person.hasAccount, true);
    const login = ok(rt.call('login', { email: 'new@example.com', password: res.tempPassword }));
    assert.equal(login.user.role, 'volunteer');
    fails(call('createVolunteer', { name: 'Dup', email: 'new@example.com' }), 'CONFLICT');
    fails(call('createVolunteer', { name: '', email: 'x@example.com' }), 'VALIDATION_ERROR');
  });

  test('a volunteer added without a login can register later and is linked, not duplicated', () => {
    const res = ok(call('createVolunteer', { name: 'Listed Only', email: 'listed@example.com', createLogin: false }));
    assert.equal(res.tempPassword, '');
    ok(rt.call('register', volunteerPayload({ name: 'Listed Only', email: 'listed@example.com' })));
    assert.equal(rt.records(SHEET, 'Volunteers').filter((r) => r.Email === 'listed@example.com').length, 1);
  });

  test('staff add a trainee with the next ID; missing columns are added only when filled in', () => {
    const res = ok(call('createTrainee', { name: 'Chris Ng', gender: 'Male', dietaryNotes: 'Halal', caregiverPhone: '91234567' }));
    assert.equal(res.trainee.id, 'T-0003');
    const [headers] = rt.tab(SHEET, 'Trainees').dump();
    assert.deepEqual(headers.slice(0, 5), ['Name', 'Gender', 'Medical Notes', 'Support Needs', 'Programme']); // untouched
    assert.ok(headers.includes('Dietary Notes'));
    assert.ok(headers.includes('Caregiver Phone'));
    assert.ok(!headers.includes('Caregiver Name')); // not filled in, so not added
    assert.ok(!headers.includes('Active'));
    const row = rt.records(SHEET, 'Trainees').find((r) => r.Name === 'Chris Ng');
    assert.equal(row.Programme, ''); // unknown columns left alone
    assert.equal(row['Dietary Notes'], 'Halal');
    assert.equal(String(row['Caregiver Phone']), '91234567');
    fails(call('createTrainee', { name: '  ' }), 'VALIDATION_ERROR');
    fails(call('createTrainee', { name: 'X', nickname: 'y' }), 'VALIDATION_ERROR');
  });

  test('editing a trainee writes only the changed cells and keeps other columns', () => {
    const res = ok(call('updateTrainee', { traineeId: 'T-0001', supportNeeds: 'Visual schedule', active: false }));
    assert.equal(res.trainee.active, false);
    const row = rt.records(SHEET, 'Trainees').find((r) => r['Trainee ID'] === 'T-0001');
    assert.equal(row['Support Needs'], 'Visual schedule');
    assert.equal(row['Medical Notes'], 'Epilepsy plan on file');
    assert.equal(row.Programme, 'DAC');
    assert.equal(row.Active, 'No');
    fails(call('updateTrainee', { traineeId: 'T-9999', name: 'Nobody' }), 'NOT_FOUND');
    fails(call('updateTrainee', { traineeId: 'T-0001' }), 'VALIDATION_ERROR');
    assert.equal(ok(call('listTraineeRecords')).trainees.length, 2);
  });
});

describe('attendance and hours', () => {
  function pastSession() {
    rt.setNow(at('09:00', YESTERDAY));
    const s = ok(call('createSession', { title: 'Music', date: YESTERDAY, startTime: '10:00', endTime: '12:00', venue: SCHOOL })).session;
    rt.setNow(at('09:00'));
    return s;
  }

  test('staff add attendance for a past session; hours come from the times', () => {
    const s = pastSession();
    const res = ok(call('addAttendance', { sessionId: s.sessionId, userId: vol.user.userId, clockIn: '10:00', clockOut: '11:30' }));
    assert.equal(res.record.hours, 1.5);
    assert.equal(res.record.method, 'Dashboard');
    const booking = rt.records(SHEET, 'Bookings').find((b) => b['Session ID'] === s.sessionId);
    assert.equal(booking.Status, 'confirmed');
    fails(call('addAttendance', { sessionId: s.sessionId, userId: vol.user.userId, clockIn: '10:00', clockOut: '11:00' }), 'CONFLICT');
    fails(call('addAttendance', { sessionId: s.sessionId, userId: 'U-NOPE', clockIn: '10:00', clockOut: '11:00' }), 'VALIDATION_ERROR');
  });

  test('fixing a missed clock-out recalculates hours and records who edited it', () => {
    const s = ok(call('createSession', { title: 'Art', date: TODAY, startTime: '10:00', endTime: '12:00', venue: SCHOOL })).session;
    const bookingId = ok(rt.call('bookSession', { sessionId: s.sessionId }, vol.token)).home.upcoming[0].bookingId;
    rt.setNow(at('10:00'));
    ok(call('manualClock', { bookingId }));
    const list = ok(call('listAttendance', { from: TODAY, to: TODAY }));
    assert.equal(list.totals.inProgress, 1);
    assert.equal(list.records[0].hours, null);
    rt.setNow(at('15:00'));
    const res = ok(call('updateAttendance', { attendanceId: list.records[0].attendanceId, clockIn: '10:15', clockOut: '12:00' }));
    assert.equal(res.record.hours, 1.75);
    assert.equal(res.record.editedBy, 'Leader Lee');
    fails(call('updateAttendance', { attendanceId: list.records[0].attendanceId, clockIn: '12:00', clockOut: '11:00' }), 'VALIDATION_ERROR');
    fails(call('updateAttendance', { attendanceId: list.records[0].attendanceId, clockIn: '10:00', clockOut: '16:00' }), 'VALIDATION_ERROR');
    fails(call('updateAttendance', { attendanceId: 'A-NOPE', clockIn: '10:00', clockOut: '11:00' }), 'NOT_FOUND');
  });

  test('hours report totals per volunteer and filters by date', () => {
    const s = pastSession();
    ok(call('addAttendance', { sessionId: s.sessionId, userId: vol.user.userId, clockIn: '10:00', clockOut: '12:00' }));
    const all = ok(call('hoursReport', {}));
    assert.equal(all.totals.hours, 2);
    assert.equal(all.volunteers[0].name, 'Vol One');
    assert.equal(all.volunteers[0].sessions, 1);
    assert.equal(all.records.length, 1);
    assert.equal(ok(call('hoursReport', { from: TODAY })).totals.hours, 0);
    fails(call('hoursReport', { from: TODAY, to: YESTERDAY }), 'VALIDATION_ERROR');
  });
});

describe('fundraising', () => {
  function setupFundraiser() {
    const f = ok(call('createFundraiser', { name: 'Charity bake sale' })).fundraiser;
    let d = ok(call('saveProduct', { fundraiserId: f.fundraiserId, name: 'Cookies', price: '5.50' }));
    d = ok(call('saveProduct', { fundraiserId: f.fundraiserId, name: 'Tote bag', price: 12 }));
    const [cookies, tote] = ['Cookies', 'Tote bag'].map((n) => d.products.find((x) => x.name === n));
    return { f, cookies, tote };
  }

  test('order totals come from stored prices, in cents', () => {
    const { f, cookies, tote } = setupFundraiser();
    assert.equal(cookies.priceCents, 550);
    const d = ok(call('createOrder', {
      fundraiserId: f.fundraiserId, customerName: 'Mdm Tan',
      items: [{ productId: cookies.productId, quantity: 3 }, { productId: tote.productId, quantity: 1 }],
    }));
    assert.equal(d.orders[0].totalCents, 2850);
    assert.equal(d.sales.totalCents, 2850);
    assert.equal(d.sales.paidCents, 0);
    const row = rt.records(SHEET, 'Orders')[0];
    assert.equal(row['Total (SGD)'], 28.5);
    assert.equal(row.Items, '3 × Cookies, 1 × Tote bag');
    assert.equal(rt.records(SHEET, 'Order Items').length, 2);
  });

  test('bad orders are rejected and nothing is written', () => {
    const { f, cookies } = setupFundraiser();
    const other = ok(call('createFundraiser', { name: 'Other' })).fundraiser;
    const otherProduct = ok(call('saveProduct', { fundraiserId: other.fundraiserId, name: 'Pen', price: 1 })).products[0];
    const base = { fundraiserId: f.fundraiserId, customerName: 'A' };
    fails(call('createOrder', { ...base, items: [] }), 'VALIDATION_ERROR');
    fails(call('createOrder', { ...base, items: [{ productId: otherProduct.productId, quantity: 1 }] }), 'VALIDATION_ERROR');
    fails(call('createOrder', { ...base, items: [{ productId: cookies.productId, quantity: 1 }, { productId: cookies.productId, quantity: 2 }] }), 'VALIDATION_ERROR');
    fails(call('createOrder', { ...base, items: [{ productId: cookies.productId, quantity: 0 }] }), 'VALIDATION_ERROR');
    fails(call('createOrder', { ...base, items: [{ productId: cookies.productId, quantity: 1.5 }] }), 'VALIDATION_ERROR');
    fails(call('createOrder', { ...base, items: [{ productId: cookies.productId, quantity: 1, price: 0 }] }), 'VALIDATION_ERROR');
    fails(call('createOrder', { ...base, customerName: '', items: [{ productId: cookies.productId, quantity: 1 }] }), 'VALIDATION_ERROR');
    assert.equal(rt.records(SHEET, 'Orders').length, 0);
    assert.equal(rt.records(SHEET, 'Order Items').length, 0);
    fails(call('saveProduct', { fundraiserId: f.fundraiserId, name: 'Cake', price: '1.234' }), 'VALIDATION_ERROR');
    fails(call('saveProduct', { fundraiserId: f.fundraiserId, name: 'cookies', price: 1 }), 'CONFLICT');
  });

  test('paid and collected status; price changes do not alter past orders', () => {
    const { f, cookies } = setupFundraiser();
    const d = ok(call('createOrder', { fundraiserId: f.fundraiserId, customerName: 'B', items: [{ productId: cookies.productId, quantity: 2 }] }));
    const after = ok(call('updateOrder', { orderId: d.orders[0].orderId, paymentStatus: 'paid', collectionStatus: 'collected' }));
    assert.equal(after.sales.paidCents, 1100);
    assert.equal(after.orders[0].collectionStatus, 'collected');
    const repriced = ok(call('saveProduct', { productId: cookies.productId, price: '6' }));
    assert.equal(repriced.orders[0].totalCents, 1100);
    fails(call('updateOrder', { orderId: d.orders[0].orderId, paymentStatus: 'free' }), 'VALIDATION_ERROR');
    ok(call('updateFundraiser', { fundraiserId: f.fundraiserId, status: 'closed' }));
    fails(call('createOrder', { fundraiserId: f.fundraiserId, customerName: 'C', items: [{ productId: cookies.productId, quantity: 1 }] }), 'VALIDATION_ERROR');
    assert.equal(ok(call('listFundraisers')).fundraisers[0].sales.totalCents, 1100);
  });
});

describe('outings', () => {
  test('each trainee is assigned once; boarded count updates', () => {
    const d = ok(call('createOuting', { title: 'Zoo trip', date: '2026-10-20', startTime: '09:00', location: 'Singapore Zoo' }));
    const outingId = d.outing.outingId;
    ok(call('assignOutingTrainee', { outingId, traineeId: 'T-0001', userId: vol.user.userId, group: 'A', bus: '1' }));
    const d2 = ok(call('assignOutingTrainee', { outingId, traineeId: 'T-0002', userId: vol.user.userId, group: 'A', bus: '1' }));
    assert.deepEqual(d2.counts, { assigned: 2, boarded: 0 });
    fails(call('assignOutingTrainee', { outingId, traineeId: 'T-0001', userId: vol.user.userId }), 'CONFLICT');
    fails(call('assignOutingTrainee', { outingId, traineeId: 'T-0404', userId: vol.user.userId }), 'VALIDATION_ERROR');
    const a = d2.assignments.find((x) => x.traineeId === 'T-0001');
    const d3 = ok(call('updateOutingAssignment', { assignmentId: a.assignmentId, boarded: true, group: 'B' }));
    assert.deepEqual(d3.counts, { assigned: 2, boarded: 1 });
    assert.equal(d3.assignments.find((x) => x.traineeId === 'T-0001').group, 'B');
    fails(call('updateOutingAssignment', { assignmentId: a.assignmentId, boarded: 'yes' }), 'VALIDATION_ERROR');
    fails(call('createOuting', { title: 'No date', location: 'X' }), 'VALIDATION_ERROR');
    assert.equal(ok(call('listOutings')).outings[0].boarded, 1);
  });
});

describe('overseas trips', () => {
  test('date range is checked', () => {
    fails(call('createTrip', { title: 'T', destination: 'D', startDate: '2026-12-05', endDate: '2026-12-01' }), 'VALIDATION_ERROR');
  });

  test('participant medical/dietary notes are copied and stay put after a profile edit', () => {
    ok(call('updateTrainee', { traineeId: 'T-0001', dietaryNotes: 'No beef' }));
    const t = ok(call('createTrip', { title: 'Bangkok', destination: 'Thailand', startDate: '2026-12-01', endDate: '2026-12-05' })).trip;
    let d = ok(call('addTripParticipant', { tripId: t.tripId, traineeId: 'T-0001' }));
    const x = d.participants[0];
    assert.equal(x.medicalNotes, 'Epilepsy plan on file');
    assert.equal(x.dietaryNotes, 'No beef');
    assert.equal(x.userId, '');
    assert.equal(d.totals.unassigned, 1);
    ok(call('updateTrainee', { traineeId: 'T-0001', medicalNotes: 'Changed later' }));
    d = ok(call('tripDetail', { tripId: t.tripId }));
    assert.equal(d.participants[0].medicalNotes, 'Epilepsy plan on file');
    fails(call('addTripParticipant', { tripId: t.tripId, traineeId: 'T-0001' }), 'CONFLICT');
    d = ok(call('updateTripParticipant', { participantId: x.participantId, userId: vol.user.userId, status: 'confirmed' }));
    assert.equal(d.participants[0].volunteerName, 'Vol One');
    assert.equal(d.totals.confirmed, 1);
    fails(call('updateTripParticipant', { participantId: x.participantId, status: 'gone' }), 'VALIDATION_ERROR');
  });

  test('logistics checklist and expenses with a running total', () => {
    const t = ok(call('createTrip', { title: 'Bangkok', destination: 'Thailand', startDate: '2026-12-01', endDate: '2026-12-05' })).trip;
    let d = ok(call('addTripLogistics', { tripId: t.tripId, description: 'Book flights', dueDate: '2026-11-01' }));
    d = ok(call('updateTripLogistics', { itemId: d.logistics[0].itemId, status: 'done' }));
    assert.equal(d.totals.logisticsDone, 1);
    assert.equal(d.logistics[0].doneBy, 'Leader Lee');
    ok(call('addTripExpense', { tripId: t.tripId, description: 'Flights', amount: '1200.10' }));
    d = ok(call('addTripExpense', { tripId: t.tripId, description: 'Hotel', amount: 0.2 }));
    assert.equal(d.totals.expensesCents, 120030);
    fails(call('addTripExpense', { tripId: t.tripId, description: 'Free', amount: 0 }), 'VALIDATION_ERROR');
    fails(call('addTripExpense', { tripId: t.tripId, description: '', amount: 5 }), 'VALIDATION_ERROR');
  });
});

describe('house visits', () => {
  test('history is newest first, filters by trainee and shows on the trainee profile', () => {
    ok(call('createVisit', { traineeId: 'T-0001', userId: vol.user.userId, date: '2026-10-01', family: 'Mum well', followUp: 'Call in a month' }));
    ok(call('createVisit', { traineeId: 'T-0002', userId: vol.user.userId, date: '2026-10-10', health: 'Good' }));
    ok(call('createVisit', { traineeId: 'T-0001', userId: vol.user.userId, date: '2026-10-10', social: 'Joined a club' }));
    const all = ok(call('listVisits', {})).visits;
    assert.deepEqual(all.map((v) => v.date), ['2026-10-10', '2026-10-10', '2026-10-01']);
    assert.equal(all[0].traineeId, 'T-0001'); // same date: the one recorded later comes first
    const alex = ok(call('listVisits', { traineeId: 'T-0001' })).visits;
    assert.equal(alex.length, 2);
    assert.equal(ok(call('traineeProfile', { traineeId: 'T-0001' })).visits.length, 2);
    fails(call('createVisit', { traineeId: 'T-0001', userId: vol.user.userId, date: '2026-10-01' }), 'VALIDATION_ERROR');
    fails(call('createVisit', { traineeId: 'T-0001', userId: vol.user.userId, date: '2026-12-01', family: 'x' }), 'VALIDATION_ERROR');
    fails(call('createVisit', { traineeId: 'T-0001', date: '2026-10-01', family: 'x' }), 'VALIDATION_ERROR');
  });

  test('a renamed trainee shows the new name in visit history', () => {
    ok(call('createVisit', { traineeId: 'T-0002', userId: vol.user.userId, date: '2026-10-10', health: 'Good' }));
    ok(call('updateTrainee', { traineeId: 'T-0002', name: 'Bea Lim Hui' }));
    assert.equal(ok(call('listVisits', {})).visits[0].traineeName, 'Bea Lim Hui');
  });
});
