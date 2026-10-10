// Integration tests for the MINDS admin prototype. Runs the app against a
// temporary isolated database and an ephemeral localhost port.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';

let tmpDir;
let dbPath;
let db;
let server;
let baseUrl;
let sessionCookie = null;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minds-prototype-test-'));
  dbPath = path.join(tmpDir, 'minds.sqlite');
  const created = createApp({ databasePath: dbPath });
  db = created.db;
  await new Promise((resolve) => {
    server = created.app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
  try {
    db.close();
  } catch {
    // already closed
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function call(method, apiPath, { body, cookie, origin, rawBody } = {}) {
  const headers = {};
  if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  const options = { method, headers };
  if (rawBody !== undefined) options.body = rawBody;
  else if (body !== undefined) options.body = JSON.stringify(body);
  const response = await fetch(`${baseUrl}/api${apiPath}`, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, json: payload, response };
}

function authCookie() {
  return `minds_session=${sessionCookie}`;
}

// ---------- health and first-run seed ----------

test('health endpoint is public', async () => {
  const { status, json } = await call('GET', '/health');
  assert.equal(status, 200);
  assert.deepEqual(json, { data: { status: 'ok' } });
});

test('first launch seeds demo records exactly once', async () => {
  const expected = {
    users: 1,
    volunteers: 3,
    trainees: 3,
    attendance_sessions: 1,
    attendance_records: 0,
    fundraisers: 1,
    products: 2,
    orders: 0,
    outings: 1,
    outing_assignments: 1,
    trips: 1,
    trip_participants: 1,
    trip_logistics: 1,
    trip_expenses: 0,
    house_visits: 1,
  };
  for (const [table, expectedCount] of Object.entries(expected)) {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
    assert.equal(
      row.n,
      expectedCount,
      `${table} should contain ${expectedCount} seeded rows, found ${row.n}`
    );
  }
});

// ---------- authentication ----------

test('protected route without a cookie returns 401', async () => {
  const { status, json } = await call('GET', '/dashboard');
  assert.equal(status, 401);
  assert.equal(json.error.code, 'UNAUTHORIZED');
});

test('unauthenticated mutations return 401', async () => {
  for (const [method, apiPath, body] of [
    ['POST', '/volunteers', { name: 'Nope' }],
    ['PATCH', '/volunteers/1', { name: 'Nope' }],
    ['POST', '/attendance/sessions/1/clock-in', { volunteerId: 1 }],
    ['POST', '/visits', { traineeId: 1, volunteerId: 1, visitDate: '2026-01-01' }],
  ]) {
    const { status } = await call(method, apiPath, { body });
    assert.equal(status, 401, `${method} ${apiPath} should be 401 without a session`);
  }
});

test('login rejects wrong credentials and missing fields', async () => {
  const wrongPassword = await call('POST', '/auth/login', {
    body: { username: 'admin', password: 'wrong' },
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal(wrongPassword.json.error.code, 'UNAUTHORIZED');

  const wrongUser = await call('POST', '/auth/login', {
    body: { username: 'nobody', password: 'MindsDemo123!' },
  });
  assert.equal(wrongUser.status, 401);

  const missingPassword = await call('POST', '/auth/login', {
    body: { username: 'admin' },
  });
  assert.equal(missingPassword.status, 400);
  assert.equal(missingPassword.json.error.code, 'VALIDATION_ERROR');

  const unknownField = await call('POST', '/auth/login', {
    body: { username: 'admin', password: 'MindsDemo123!', extra: 1 },
  });
  assert.equal(unknownField.status, 400);
});

test('login with demo credentials sets a protected cookie', async () => {
  const { status, json, response } = await call('POST', '/auth/login', {
    body: { username: 'admin', password: 'MindsDemo123!' },
  });
  assert.equal(status, 200);
  assert.deepEqual(json.data, { id: 1, username: 'admin', name: 'MINDS Demo Admin' });

  const setCookies = response.headers.getSetCookie();
  assert.equal(setCookies.length, 1);
  const cookie = setCookies[0];
  assert.match(cookie, /minds_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\//);
  sessionCookie = cookie.split(';')[0].split('=').slice(1).join('=');
  assert.ok(sessionCookie);
});

test('auth/me returns the current user', async () => {
  const { status, json } = await call('GET', '/auth/me', { cookie: authCookie() });
  assert.equal(status, 200);
  assert.equal(json.data.username, 'admin');
});

test('expired session returns 401 and is removed', async () => {
  const token = 'expired-session-token-for-tests';
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(
    tokenHash,
    1,
    new Date(Date.now() - 60_000).toISOString()
  );
  const { status, json } = await call('GET', '/auth/me', {
    cookie: `minds_session=${token}`,
  });
  assert.equal(status, 401);
  const remaining = db
    .prepare('SELECT COUNT(*) AS n FROM auth_sessions WHERE token_hash = ?')
    .get(tokenHash);
  assert.equal(remaining.n, 0, 'expired session should be deleted');
});

test('logout invalidates the session cookie', async () => {
  const { status, json, response } = await call('POST', '/auth/logout', {
    cookie: authCookie(),
  });
  assert.equal(status, 200);
  assert.deepEqual(json.data, { loggedOut: true });
  const clearCookie = response.headers.getSetCookie().join(' ');
  assert.match(clearCookie, /minds_session=;/);

  const afterLogout = await call('GET', '/auth/me', { cookie: authCookie() });
  assert.equal(afterLogout.status, 401);

  // sign in again for the remaining tests
  const relogin = await call('POST', '/auth/login', {
    body: { username: 'admin', password: 'MindsDemo123!' },
  });
  assert.equal(relogin.status, 200);
  sessionCookie = relogin.response.headers.getSetCookie()[0].split(';')[0].split('=').slice(1).join('=');
});

test('malformed JSON body returns 400', async () => {
  const { status, json } = await call('POST', '/auth/login', { rawBody: '{not json' });
  assert.equal(status, 400);
  assert.equal(json.error.code, 'VALIDATION_ERROR');
});

// ---------- origin protection ----------

test('mismatched Origin on mutations returns 403', async () => {
  const bad = await call('POST', '/volunteers', {
    body: { name: 'Cross Origin' },
    cookie: authCookie(),
    origin: 'http://evil.example',
  });
  assert.equal(bad.status, 403);
  assert.equal(bad.json.error.code, 'FORBIDDEN');

  const loginAttempt = await call('POST', '/auth/login', {
    body: { username: 'admin', password: 'MindsDemo123!' },
    origin: 'http://evil.example',
  });
  assert.equal(loginAttempt.status, 403);

  const good = await call('POST', '/volunteers', {
    body: { name: 'Same Origin Volunteer' },
    cookie: authCookie(),
    origin: baseUrl,
  });
  assert.equal(good.status, 201);

  // GET requests are not blocked by the Origin guard
  const getOk = await call('GET', '/volunteers', { cookie: authCookie(), origin: 'http://evil.example' });
  assert.equal(getOk.status, 200);
});

// ---------- volunteers and trainees ----------

test('volunteer create, list and update with validation', async () => {
  const created = await call('POST', '/volunteers', {
    body: { name: '  Test Volunteer  ', email: ' test@example.com ', phone: '' },
    cookie: authCookie(),
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.name, 'Test Volunteer');
  assert.equal(created.json.data.email, 'test@example.com');
  assert.equal(created.json.data.phone, '');
  const volunteerId = created.json.data.id;

  const listed = await call('GET', '/volunteers', { cookie: authCookie() });
  assert.equal(listed.status, 200);
  assert.ok(Array.isArray(listed.json.data));
  assert.ok(listed.json.data.some((volunteer) => volunteer.name === 'Test Volunteer'));

  const updated = await call('PATCH', `/volunteers/${volunteerId}`, {
    body: { name: 'Renamed Volunteer', phone: '+65 9123 4567' },
    cookie: authCookie(),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.data.name, 'Renamed Volunteer');
  assert.equal(updated.json.data.phone, '+65 9123 4567');

  // invalid updates
  const cases = [
    { body: {}, expected: 'empty update' },
    { body: { unknownField: 'x' }, expected: 'unknown field' },
    { body: { name: '   ' }, expected: 'blank name' },
    { body: { name: 'x'.repeat(201) }, expected: 'over-long name' },
    { body: { email: 'x'.repeat(201) }, expected: 'over-long email' },
  ];
  for (const testCase of cases) {
    const result = await call('PATCH', `/volunteers/${volunteerId}`, {
      body: testCase.body,
      cookie: authCookie(),
    });
    assert.equal(result.status, 400, `expected 400 for ${testCase.expected}`);
  }

  const badCreate = await call('POST', '/volunteers', {
    body: { email: 'only-email@example.com' },
    cookie: authCookie(),
  });
  assert.equal(badCreate.status, 400);

  const missing = await call('PATCH', '/volunteers/999999', {
    body: { name: 'Ghost' },
    cookie: authCookie(),
  });
  assert.equal(missing.status, 404);
});

test('trainee create and update with notes fields', async () => {
  const created = await call('POST', '/trainees', {
    body: {
      name: 'Test Trainee',
      caregiverName: 'Test Caregiver',
      supportNeeds: 'Needs visual schedules.',
    },
    cookie: authCookie(),
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.name, 'Test Trainee');
  assert.equal(created.json.data.caregiverName, 'Test Caregiver');
  assert.equal(created.json.data.medicalNotes, '');
  const traineeId = created.json.data.id;

  const updated = await call('PATCH', `/trainees/${traineeId}`, {
    body: { medicalNotes: 'Snapshot source A', dietaryNotes: 'Vegetarian' },
    cookie: authCookie(),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.data.medicalNotes, 'Snapshot source A');

  const blank = await call('POST', '/trainees', { body: { name: '' }, cookie: authCookie() });
  assert.equal(blank.status, 400);

  const overlong = await call('POST', '/trainees', {
    body: { name: 'T', supportNeeds: 'x'.repeat(5001) },
    cookie: authCookie(),
  });
  assert.equal(overlong.status, 400);

  // rename the seeded trainee 1 to prove shared-name changes persist
  const renamed = await call('PATCH', '/trainees/1', {
    body: { name: 'Demo Trainee A (renamed)' },
    cookie: authCookie(),
  });
  assert.equal(renamed.status, 200);
});

// ---------- attendance ----------

test('attendance session lifecycle with clock in/out and exact hours', async () => {
  const created = await call('POST', '/attendance/sessions', {
    body: { title: '  Saturday Programme  ', date: '2026-03-14', venue: ' Test Centre ' },
    cookie: authCookie(),
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.title, 'Saturday Programme');
  assert.equal(created.json.data.venue, 'Test Centre');
  const sessionId = created.json.data.id;

  const invalidDate = await call('POST', '/attendance/sessions', {
    body: { title: 'Bad', date: '2026-02-30' },
    cookie: authCookie(),
  });
  assert.equal(invalidDate.status, 400);

  const missingVolunteer = await call('POST', `/attendance/sessions/${sessionId}/clock-in`, {
    body: { volunteerId: 999999 },
    cookie: authCookie(),
  });
  assert.equal(missingVolunteer.status, 400);

  // volunteer 1: full cycle with known timestamps for exact assertions
  const clockIn = await call('POST', `/attendance/sessions/${sessionId}/clock-in`, {
    body: { volunteerId: 1 },
    cookie: authCookie(),
  });
  assert.equal(clockIn.status, 201);
  assert.equal(clockIn.json.data.volunteerId, 1);
  assert.equal(clockIn.json.data.volunteerName, 'Demo Volunteer A');
  assert.equal(clockIn.json.data.clockOut, null);
  assert.equal(clockIn.json.data.hours, null);
  const recordId = clockIn.json.data.id;

  const duplicate = await call('POST', `/attendance/sessions/${sessionId}/clock-in`, {
    body: { volunteerId: 1 },
    cookie: authCookie(),
  });
  assert.equal(duplicate.status, 409);

  // set a known clock-in time directly in the test database
  db.prepare('UPDATE attendance_records SET clock_in = ? WHERE id = ?').run(
    '2026-03-14T01:00:00.000Z',
    recordId
  );

  const clockOut = await call('POST', `/attendance/sessions/${sessionId}/clock-out`, {
    body: { volunteerId: 1 },
    cookie: authCookie(),
  });
  assert.equal(clockOut.status, 200);
  assert.ok(clockOut.json.data.clockOut);

  const repeatOut = await call('POST', `/attendance/sessions/${sessionId}/clock-out`, {
    body: { volunteerId: 1 },
    cookie: authCookie(),
  });
  assert.equal(repeatOut.status, 409);

  // set a known clock-out time: 1.5 hours later
  db.prepare('UPDATE attendance_records SET clock_out = ? WHERE id = ?').run(
    '2026-03-14T02:30:00.000Z',
    recordId
  );

  const detail = await call('GET', `/attendance/sessions/${sessionId}`, { cookie: authCookie() });
  assert.equal(detail.status, 200);
  const record = detail.json.data.records.find((row) => row.id === recordId);
  assert.equal(record.hours, 1.5);

  // volunteer 2 stays clocked in: open records are excluded from totals
  const openIn = await call('POST', `/attendance/sessions/${sessionId}/clock-in`, {
    body: { volunteerId: 2 },
    cookie: authCookie(),
  });
  assert.equal(openIn.status, 201);

  const noRecord = await call('POST', `/attendance/sessions/${sessionId}/clock-out`, {
    body: { volunteerId: 3 },
    cookie: authCookie(),
  });
  assert.equal(noRecord.status, 404);

  const summary = await call('GET', '/attendance/summary', { cookie: authCookie() });
  assert.equal(summary.status, 200);
  const byId = new Map(summary.json.data.map((row) => [row.volunteerId, row]));
  assert.equal(byId.get(1).hours, 1.5);
  assert.equal(byId.get(1).completedSessions, 1);
  assert.equal(byId.get(2).hours, 0);
  assert.equal(byId.get(2).completedSessions, 0);
  assert.equal(byId.get(3).hours, 0);
  // summary includes every volunteer, even with zero hours
  assert.equal(summary.json.data.length, (await call('GET', '/volunteers', { cookie: authCookie() })).json.data.length);
});

// ---------- fundraising ----------

test('fundraiser products with price validation', async () => {
  const negative = await call('POST', '/fundraisers/1/products', {
    body: { name: 'Bad', priceCents: -1 },
    cookie: authCookie(),
  });
  assert.equal(negative.status, 400);

  const fractional = await call('POST', '/fundraisers/1/products', {
    body: { name: 'Bad', priceCents: 5.5 },
    cookie: authCookie(),
  });
  assert.equal(fractional.status, 400);

  const stringPrice = await call('POST', '/fundraisers/1/products', {
    body: { name: 'Bad', priceCents: '500' },
    cookie: authCookie(),
  });
  assert.equal(stringPrice.status, 400);

  const ok = await call('POST', '/fundraisers/1/products', {
    body: { name: 'Demo Muffin', priceCents: 0 },
    cookie: authCookie(),
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.data.priceCents, 0);
});

test('order creation totals are computed by the server', async () => {
  const created = await call('POST', '/fundraisers/1/orders', {
    body: {
      customerName: '  Mdm Tan  ',
      customerContact: '+65 9123 9999',
      items: [
        { productId: 1, quantity: 1 },
        { productId: 2, quantity: 2 },
      ],
    },
    cookie: authCookie(),
  });
  assert.equal(created.status, 201);
  const order = created.json.data;
  assert.equal(order.customerName, 'Mdm Tan');
  assert.equal(order.totalCents, 2500); // 1 x 500 + 2 x 1000
  assert.equal(order.paymentStatus, 'unpaid');
  assert.equal(order.collectionStatus, 'pending');
  assert.equal(order.items.length, 2);
  const cookieItem = order.items.find((item) => item.productId === 1);
  assert.equal(cookieItem.productName, 'Demo Cookies');
  assert.equal(cookieItem.unitPriceCents, 500);
  const brownieItem = order.items.find((item) => item.productId === 2);
  assert.equal(brownieItem.quantity, 2);
  assert.equal(brownieItem.unitPriceCents, 1000);
  const orderId = order.id;

  // a product from another fundraiser is rejected
  const otherFundraiser = await call('POST', '/fundraisers', {
    body: { name: 'Other Sale', date: '2026-04-01' },
    cookie: authCookie(),
  });
  assert.equal(otherFundraiser.status, 201);
  const otherProduct = await call('POST', `/fundraisers/${otherFundraiser.json.data.id}/products`, {
    body: { name: 'Other Product', priceCents: 100 },
    cookie: authCookie(),
  });
  assert.equal(otherProduct.status, 201);
  const wrongFundraiser = await call('POST', '/fundraisers/1/orders', {
    body: {
      customerName: 'X',
      items: [{ productId: otherProduct.json.data.id, quantity: 1 }],
    },
    cookie: authCookie(),
  });
  assert.equal(wrongFundraiser.status, 400);

  const badCases = [
    { description: 'duplicate product ids', body: { customerName: 'X', items: [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 2 }] } },
    { description: 'zero quantity', body: { customerName: 'X', items: [{ productId: 1, quantity: 0 }] } },
    { description: 'fractional quantity', body: { customerName: 'X', items: [{ productId: 1, quantity: 1.5 }] } },
    { description: 'empty items', body: { customerName: 'X', items: [] } },
    { description: 'missing items', body: { customerName: 'X' } },
    { description: 'unknown product', body: { customerName: 'X', items: [{ productId: 999999, quantity: 1 }] } },
    { description: 'blank customer name', body: { customerName: '   ', items: [{ productId: 1, quantity: 1 }] } },
  ];
  for (const testCase of badCases) {
    const result = await call('POST', '/fundraisers/1/orders', {
      body: testCase.body,
      cookie: authCookie(),
    });
    assert.equal(result.status, 400, `expected 400 for ${testCase.description}`);
  }

  const detail = await call('GET', '/fundraisers/1', { cookie: authCookie() });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.data.totalSalesCents, 2500);
  assert.equal(detail.json.data.paidSalesCents, 0);

  // status updates persist
  const paid = await call('PATCH', `/orders/${orderId}`, {
    body: { paymentStatus: 'paid' },
    cookie: authCookie(),
  });
  assert.equal(paid.status, 200);
  assert.equal(paid.json.data.paymentStatus, 'paid');

  const collected = await call('PATCH', `/orders/${orderId}`, {
    body: { collectionStatus: 'collected' },
    cookie: authCookie(),
  });
  assert.equal(collected.status, 200);
  assert.equal(collected.json.data.collectionStatus, 'collected');

  const detailAfter = await call('GET', '/fundraisers/1', { cookie: authCookie() });
  assert.equal(detailAfter.json.data.paidSalesCents, 2500);
  assert.equal(
    detailAfter.json.data.orders.find((row) => row.id === orderId).collectionStatus,
    'collected'
  );

  const invalidEnum = await call('PATCH', `/orders/${orderId}`, {
    body: { paymentStatus: 'maybe' },
    cookie: authCookie(),
  });
  assert.equal(invalidEnum.status, 400);

  const emptyPatch = await call('PATCH', `/orders/${orderId}`, {
    body: {},
    cookie: authCookie(),
  });
  assert.equal(emptyPatch.status, 400);

  const missingOrder = await call('PATCH', '/orders/999999', {
    body: { paymentStatus: 'paid' },
    cookie: authCookie(),
  });
  assert.equal(missingOrder.status, 404);
});

// ---------- outings ----------

test('outing assignments enforce uniqueness and support edits', async () => {
  const created = await call('POST', '/outings', {
    body: { title: 'Test Outing', date: '2026-05-02', venue: 'Test Venue', notes: '  ' },
    cookie: authCookie(),
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.notes, '');
  const outingId = created.json.data.id;

  const assignment = await call('POST', `/outings/${outingId}/assignments`, {
    body: { traineeId: 1, volunteerId: 2, groupName: 'Group 1', busName: '' },
    cookie: authCookie(),
  });
  assert.equal(assignment.status, 201);
  assert.equal(assignment.json.data.traineeName, 'Demo Trainee A (renamed)');
  assert.equal(assignment.json.data.volunteerName, 'Demo Volunteer B');
  assert.equal(assignment.json.data.boarded, false);
  const assignmentId = assignment.json.data.id;

  const duplicate = await call('POST', `/outings/${outingId}/assignments`, {
    body: { traineeId: 1, volunteerId: 3 },
    cookie: authCookie(),
  });
  assert.equal(duplicate.status, 409);

  const missingTrainee = await call('POST', `/outings/${outingId}/assignments`, {
    body: { traineeId: 999999, volunteerId: 1 },
    cookie: authCookie(),
  });
  assert.equal(missingTrainee.status, 400);

  const edited = await call('PATCH', `/outing-assignments/${assignmentId}`, {
    body: { volunteerId: 3, groupName: 'Group 2', busName: 'Bus B', boarded: true },
    cookie: authCookie(),
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.data.volunteerName, 'Demo Volunteer C');
  assert.equal(edited.json.data.groupName, 'Group 2');
  assert.equal(edited.json.data.busName, 'Bus B');
  assert.equal(edited.json.data.boarded, true);

  const stringBoarded = await call('PATCH', `/outing-assignments/${assignmentId}`, {
    body: { boarded: 'true' },
    cookie: authCookie(),
  });
  assert.equal(stringBoarded.status, 400);

  const detail = await call('GET', `/outings/${outingId}`, { cookie: authCookie() });
  assert.equal(detail.status, 200);
  const persisted = detail.json.data.assignments.find((row) => row.id === assignmentId);
  assert.equal(persisted.boarded, true);
  assert.equal(persisted.busName, 'Bus B');

  const missingAssignment = await call('PATCH', '/outing-assignments/999999', {
    body: { boarded: true },
    cookie: authCookie(),
  });
  assert.equal(missingAssignment.status, 404);

  const missingOuting = await call('GET', '/outings/999999', { cookie: authCookie() });
  assert.equal(missingOuting.status, 404);
});

// ---------- trips ----------

test('trip validation and participant note snapshots', async () => {
  const badRange = await call('POST', '/trips', {
    body: { title: 'Bad', destination: 'X', startDate: '2026-06-10', endDate: '2026-06-09' },
    cookie: authCookie(),
  });
  assert.equal(badRange.status, 400);

  const created = await call('POST', '/trips', {
    body: {
      title: 'Test Trip',
      destination: 'Test City',
      startDate: '2026-06-10',
      endDate: '2026-06-15',
    },
    cookie: authCookie(),
  });
  assert.equal(created.status, 201);
  const tripId = created.json.data.id;

  // participant notes are copied from the trainee profile at add time
  const participant = await call('POST', `/trips/${tripId}/participants`, {
    body: { traineeId: 2, volunteerId: 1 },
    cookie: authCookie(),
  });
  assert.equal(participant.status, 201);
  assert.equal(participant.json.data.registrationStatus, 'pending');
  assert.equal(participant.json.data.medicalNotes, 'Mild asthma; keeps an inhaler in the day bag (demo).');
  assert.equal(participant.json.data.dietaryNotes, 'Avoids peanuts (demo).');
  const participantId = participant.json.data.id;

  const duplicate = await call('POST', `/trips/${tripId}/participants`, {
    body: { traineeId: 2, volunteerId: 2 },
    cookie: authCookie(),
  });
  assert.equal(duplicate.status, 409);

  // changing the shared profile later must not change the participant snapshot
  const profileChange = await call('PATCH', '/trainees/2', {
    body: { medicalNotes: 'Changed profile note', dietaryNotes: 'Changed dietary note' },
    cookie: authCookie(),
  });
  assert.equal(profileChange.status, 200);

  const editedParticipant = await call('PATCH', `/trip-participants/${participantId}`, {
    body: { registrationStatus: 'confirmed', medicalNotes: 'Trip-specific note', volunteerId: null },
    cookie: authCookie(),
  });
  assert.equal(editedParticipant.status, 200);
  assert.equal(editedParticipant.json.data.registrationStatus, 'confirmed');
  assert.equal(editedParticipant.json.data.medicalNotes, 'Trip-specific note');
  assert.equal(editedParticipant.json.data.volunteerId, null);

  const detail = await call('GET', `/trips/${tripId}`, { cookie: authCookie() });
  assert.equal(detail.status, 200);
  const storedParticipant = detail.json.data.participants.find((row) => row.id === participantId);
  assert.equal(storedParticipant.medicalNotes, 'Trip-specific note');
  assert.equal(storedParticipant.dietaryNotes, 'Avoids peanuts (demo).');
  assert.equal(storedParticipant.registrationStatus, 'confirmed');

  // logistics lifecycle
  const task = await call('POST', `/trips/${tripId}/logistics`, {
    body: { description: 'Book flights' },
    cookie: authCookie(),
  });
  assert.equal(task.status, 201);
  assert.equal(task.json.data.status, 'pending');
  const doneTask = await call('PATCH', `/trip-logistics/${task.json.data.id}`, {
    body: { status: 'done' },
    cookie: authCookie(),
  });
  assert.equal(doneTask.status, 200);
  assert.equal(doneTask.json.data.status, 'done');

  const badStatus = await call('PATCH', `/trip-logistics/${task.json.data.id}`, {
    body: { status: 'finished' },
    cookie: authCookie(),
  });
  assert.equal(badStatus.status, 400);

  // expenses and totals
  const expenseA = await call('POST', `/trips/${tripId}/expenses`, {
    body: { description: 'Coach rental', amountCents: 120050 },
    cookie: authCookie(),
  });
  assert.equal(expenseA.status, 201);
  const expenseB = await call('POST', `/trips/${tripId}/expenses`, {
    body: { description: 'Meals', amountCents: 25_550 },
    cookie: authCookie(),
  });
  assert.equal(expenseB.status, 201);

  const negativeExpense = await call('POST', `/trips/${tripId}/expenses`, {
    body: { description: 'Bad', amountCents: -5 },
    cookie: authCookie(),
  });
  assert.equal(negativeExpense.status, 400);

  const detailAfter = await call('GET', `/trips/${tripId}`, { cookie: authCookie() });
  assert.equal(detailAfter.json.data.totalExpenseCents, 145600);
  assert.equal(detailAfter.json.data.logistics.find((row) => row.id === task.json.data.id).status, 'done');

  const missingTrip = await call('GET', '/trips/999999', { cookie: authCookie() });
  assert.equal(missingTrip.status, 404);
});

// ---------- house visits ----------

test('house visit creation, filtering and ordering', async () => {
  const created = await call('POST', '/visits', {
    body: {
      traineeId: 3,
      volunteerId: 3,
      visitDate: '2026-02-10',
      familyNotes: ' Family is well. ',
      dailyLivingNotes: '',
      socialNotes: 'Sociable.',
      healthNotes: '',
      followUp: 'Call next week.',
    },
    cookie: authCookie(),
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.familyNotes, 'Family is well.');
  assert.equal(created.json.data.traineeName, 'Demo Trainee C');
  assert.equal(created.json.data.volunteerName, 'Demo Volunteer C');

  const sameDateVisit = await call('POST', '/visits', {
    body: { traineeId: 3, volunteerId: 1, visitDate: '2026-02-10' },
    cookie: authCookie(),
  });
  assert.equal(sameDateVisit.status, 201);

  const missingTrainee = await call('POST', '/visits', {
    body: { traineeId: 999999, volunteerId: 1, visitDate: '2026-02-10' },
    cookie: authCookie(),
  });
  assert.equal(missingTrainee.status, 400);

  const missingVolunteer = await call('POST', '/visits', {
    body: { traineeId: 1, visitDate: '2026-02-10' },
    cookie: authCookie(),
  });
  assert.equal(missingVolunteer.status, 400);

  const invalidDate = await call('POST', '/visits', {
    body: { traineeId: 1, volunteerId: 1, visitDate: '2026-02-30' },
    cookie: authCookie(),
  });
  assert.equal(invalidDate.status, 400);

  const filtered = await call('GET', '/visits?traineeId=3', { cookie: authCookie() });
  assert.equal(filtered.status, 200);
  assert.equal(filtered.json.data.length, 2);
  // same visit date: newest id first
  assert.ok(filtered.json.data[0].id > filtered.json.data[1].id);

  const otherFilter = await call('GET', '/visits?traineeId=1', { cookie: authCookie() });
  assert.equal(otherFilter.json.data.length, 0);

  const all = await call('GET', '/visits', { cookie: authCookie() });
  assert.equal(all.json.data.length, 3); // 1 seeded + 2 created
});

// ---------- second initialization ----------

test('second initialization preserves data and user changes', async () => {
  const volunteersBefore = (await call('GET', '/volunteers', { cookie: authCookie() })).json.data;
  const second = createApp({ databasePath: dbPath });
  try {
    const count = second.db.prepare('SELECT COUNT(*) AS n FROM volunteers').get().n;
    assert.equal(count, volunteersBefore.length, 'no duplicate seeding on second init');
    const users = second.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    assert.equal(users, 1);
    const renamed = second.db.prepare('SELECT name FROM trainees WHERE id = 1').get();
    assert.equal(renamed.name, 'Demo Trainee A (renamed)', 'user changes survive re-init');
    const visits = second.db.prepare('SELECT COUNT(*) AS n FROM house_visits').get().n;
    assert.equal(visits, 3);
  } finally {
    second.db.close();
  }
});

// ---------- dashboard and route fallbacks ----------

test('dashboard aggregates counts, hours and upcoming items', async () => {
  const { status, json } = await call('GET', '/dashboard', { cookie: authCookie() });
  assert.equal(status, 200);
  const data = json.data;
  assert.equal(data.counts.volunteers, volunteersCreated());
  assert.equal(data.counts.trainees, 4);
  assert.equal(data.counts.attendanceSessions, 2);
  assert.equal(data.counts.fundraisers, 2);
  assert.equal(data.counts.outings, 2);
  assert.equal(data.counts.trips, 2);
  assert.equal(data.counts.visits, 3);
  assert.equal(data.completedHours, 1.5);
  assert.ok(data.upcomingOutings.length >= 1);
  assert.ok(data.upcomingTrips.some((trip) => trip.destination === 'Demo City'));
});

function volunteersCreated() {
  // 3 seeded + Same Origin Volunteer + Test Volunteer = 5
  return 5;
}

test('unknown API routes return JSON 404', async () => {
  for (const method of ['GET', 'POST']) {
    const { status, json } = await call(method, '/definitely-not-a-route', {
      cookie: authCookie(),
      ...(method === 'POST' ? { body: {} } : {}),
    });
    assert.equal(status, 404);
    assert.equal(json.error.code, 'NOT_FOUND');
  }
});

test('non-API root serves the frontend shell', async () => {
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /MINDS Admin/);
  assert.match(html, /js\/app\.js/);
});
