// Local development server: serves web/ and answers POST /api by running the
// real Apps Script code (gas/*.gs) against an in-memory demo spreadsheet.
//
//   npm run dev            → http://localhost:5173
//   http://localhost:5173/__sheet   shows what the "Google Sheet" contains right now
//
// Data lives in memory and resets when the server restarts.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGasRuntime } from './gas-harness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.join(here, '..', 'web');
const PORT = Number(process.env.PORT || 5173);
const LATENCY_MS = Number(process.env.MOCK_LATENCY_MS ?? 400); // Apps Script is not instant; feel it locally

export const DEMO = {
  admin: { email: 'admin@example.com', password: 'AdminDemo123' },
  adminPassword: 'admin-demo-2026', // the shared admin password (to make or remove an admin)
  regular: { email: 'regular@example.com', password: 'RegularDemo123' },
  volunteer: { email: 'volunteer@example.com', password: 'VolunteerDemo123' },
};

// MINDS's mock House Visit form responses (100 fictional trainees), from tests/fixtures.
const HOUSE_VISIT = JSON.parse(fs.readFileSync(path.join(here, '..', 'tests', 'fixtures', 'house-visit-mock.json'), 'utf8'));

export function createDemoRuntime() {
  const rt = createGasRuntime();
  rt.createSpreadsheet('demo-sheet', 'MINDS Volunteer Data (local demo)');
  // Trainees live in their own file, the House Visit form's response sheet,
  // linked by URL like in production. Fictional people only.
  rt.createSpreadsheet('house-visit-sheet', '[Exp] House Visit Template Form (Responses)');
  const form = rt.fillTab('house-visit-sheet', 'Form Responses 1', [HOUSE_VISIT.headers, ...HOUSE_VISIT.rows]);
  rt.fillTab('house-visit-sheet', 'Map (Fixed)', HOUSE_VISIT.map);
  rt.props.set('SPREADSHEET_ID', 'demo-sheet');
  rt.props.set('TRAINEE_SPREADSHEET_ID', `https://docs.google.com/spreadsheets/d/house-visit-sheet/edit#gid=${form.getSheetId()}`);
  rt.run('setup'); // adds Trainee IDs (T-0001 = Mock Trainee 1, …), the starter venue, guide and project
  rt.evaluate(`setAdminActionPassword_('${DEMO.adminPassword}')`); // a known one for the demo (setup() made a random one)
  // Google Contacts sync on, into a stand-in for Google Contacts: see http://localhost:5173/__contacts
  rt.props.set('CONTACTS_SYNC', 'on');
  rt.props.set('CONTACTS_LABEL', 'MINDS Volunteers (local demo)');
  // Guide infographics live in Google Drive in production. Locally, the in-memory
  // "Drive" serves them at /__drive/<id> (see the server below).
  rt.evaluate("guideFileLinks_ = function (fileId) { const u = '/__drive/' + encodeURIComponent(fileId); return { imageUrl: u, previewUrl: u, openUrl: u }; };");
  rt.evaluate("driveImageUrl_ = function (fileId) { return '/__drive/' + encodeURIComponent(fileId); };");

  const reg = (name, email, password, extra = {}) => rt.call('register', {
    name, email, password, birthday: '2000-01-15', phone: '+65 9000 0000', telegram: '',
    emergencyName: 'Demo Contact', emergencyPhone: '+65 8000 0000', emergencyRelation: 'Parent', consent: true, ...extra,
  }).data;
  const ada = reg('Ada Admin', DEMO.admin.email, DEMO.admin.password, { telegram: 'ada_admin' });
  rt.call('acknowledgeGuide', {}, ada.token);
  rt.props.set('FIRST_ADMIN_EMAIL', DEMO.admin.email);
  rt.run('makeFirstAdmin');
  const admin = rt.call('login', DEMO.admin).data.token;
  const call = (action, payload) => {
    const res = rt.call(action, payload, admin);
    if (!res.ok) throw new Error(`${action}: ${res.error.message}`);
    return res.data;
  };
  // Illustrated stand-in photos for two trainees (the others show the placeholder).
  [['T-0001', 'demo-trainee-1.png'], ['T-0003', 'demo-trainee-3.png']].forEach(([traineeId, file]) => call('setTraineePhoto', {
    traineeId, fileName: file, mimeType: 'image/png', data: fs.readFileSync(path.join(here, file)).toString('base64'),
  }));
  // A sample infographic at the top of the Volunteer Guide (admins add their own under Admin → Guide & projects).
  call('addGuideFile', {
    fileName: 'Your first session.png', mimeType: 'image/png', position: 'top',
    data: fs.readFileSync(path.join(here, 'demo-infographic.png')).toString('base64'),
    body: 'A sample infographic. Admins can replace it with MINDS\'s own picture or PDF.',
  });
  const rex = reg('Rex Regular', DEMO.regular.email, DEMO.regular.password, { telegram: 'rex_regular', phone: '+65 9333 4444' });
  const rina = reg('Rina Regular', 'rina@example.com', 'RegularDemo123', { telegram: 'rina_r' });
  const vera = reg('Vera Volunteer', DEMO.volunteer.email, DEMO.volunteer.password, { telegram: 'vera_volunteers' });
  const sam = reg('Sam Siva', 'sam@example.com', 'VolunteerDemo123', { phone: '+65 9111 2222', telegram: 'sam_siva' });
  // Everyone in the demo has read the Volunteer Guide; a newly registered account has not.
  [rex, rina, vera, sam].forEach((v) => rt.call('acknowledgeGuide', {}, v.token));

  const SCHOOL = 'MINDS Woodlands Gardens School';
  const PROJECT = ['West End (WE)', 'Regular Service Project for the Intellectually Disabled (RSPID)'];
  const today = rt.context.todayStr_();
  const day = (n) => rt.context.addDays_(today, n);
  const mk = (title, date, startTime, endTime, capacity, notes = '', extra = {}) =>
    call('createSession', { title, date, startTime, endTime, venue: SCHOOL, project: PROJECT, capacity, notes, ...extra }).session;
  const come = (v, sessionId) => rt.call('bookSession', { sessionId }, v.token).data.home.upcoming.find((u) => u.session.sessionId === sessionId).bookingId;
  const attend = (date, title, people) => {
    rt.setNow(`${date}T09:00:00+08:00`);
    const s = mk(title, date, '14:30', '17:30', 10);
    const ids = people.map(([v, traineeId]) => {
      const b = come(v, s.sessionId);
      if (traineeId) call('updateBooking', { bookingId: b, traineeId });
      return b;
    });
    rt.setNow(`${date}T14:30:00+08:00`);
    ids.forEach((b) => call('manualClock', { bookingId: b }));
    rt.setNow(`${date}T17:30:00+08:00`);
    ids.forEach((b) => call('manualClock', { bookingId: b }));
    rt.setNow(null);
    return { s, ids };
  };

  // Regulars: Rex and Rina were promoted by an admin and each has a fixed trainee.
  [rex, rina].forEach((v) => call('setVolunteerType', { userId: v.user.userId, volunteerType: 'regular' }));
  // Rex was with Mock Trainee 5 for a few weeks, then an admin rotated him (see Pairing → History).
  rt.setNow(`${day(-40)}T09:00:00+08:00`);
  call('setStandingPairing', { userId: rex.user.userId, traineeId: 'T-0005' });
  rt.setNow(null);
  call('setStandingPairing', { userId: rina.user.userId, traineeId: 'T-0002' });

  // History: Sam has attended 8 sessions plus yesterday's (9), so clocking him out today makes him a regular automatically.
  for (let i = 8; i >= 1; i -= 1) {
    attend(day(-7 * i - 1), 'Regular session', [[sam, 'T-0004'], ...(i <= 2 ? [[vera, 'T-0003']] : []), ...(i >= 3 && i <= 5 ? [[rex, null]] : [])]);
  }
  rt.setNow(`${day(-12)}T09:00:00+08:00`);
  call('setStandingPairing', { userId: rex.user.userId, traineeId: 'T-0001' }); // rotated to a new trainee
  rt.setNow(null);

  // Yesterday: everyone gave feedback; Vera's note waits for an admin.
  const { ids: [samB, veraB] } = attend(day(-1), 'Regular session', [[sam, 'T-0004'], [vera, 'T-0003'], [rex, null]]);
  rt.call('submitFeedback', {
    bookingId: veraB, rating: 4, sessionFeedback: 'Good session, the playlist worked well.',
    traineeObservation: 'Was calmer when I showed the picture card for the next activity before we moved on. Loved the drumming.',
  }, vera.token);
  rt.call('submitFeedback', { bookingId: samB, rating: 5, traineeObservation: 'Points to picture cards to choose colours. Give two choices at a time.' }, sam.token);
  const queue = call('reviewQueue', {}).items;
  call('reviewObservation', { feedbackId: queue.find((q) => q.volunteerName === 'Sam Siva').feedbackId, decision: 'share' });
  call('addTraineeNote', { traineeId: 'T-0001', note: 'Uses a picture schedule. Show the next activity card before changing activity.' });
  rt.call('submitTraineeUpdate', { traineeId: 'T-0010', note: 'Met at the void deck on Saturday: has started a part-time job and is proud of it.' }, rex.token);

  // Today and coming up. Regulars are paired with their fixed trainee as soon as they say they're coming.
  // Sessions are "Regular session", 2:30 to 5:30 pm at Woodlands (Config.gs → SESSION_OPTIONS).
  const art = mk('Regular session', today, '14:30', '17:30', 8, 'Wear covered shoes.');
  const baking = mk('Regular session', day(3), '14:30', '17:30', 8);
  mk('Regular session', day(10), '14:30', '17:30', 8);
  const carnival = mk('Sports carnival helpers', day(7), '08:00', '13:00', 20, 'Bring a water bottle and cap.', { traineeIds: ['T-0001', 'T-0002', 'T-0003', 'T-0004', 'T-0005'] });
  come(rex, art.sessionId);
  const veraArt = come(vera, art.sessionId);
  call('updateBooking', { bookingId: veraArt, traineeId: 'T-0003' }); // an admin paired Vera
  come(sam, art.sessionId); // still to pair: try Admin → Pairing
  rt.call('bookSessions', { sessionIds: [baking.sessionId, carnival.sessionId] }, rina.token);
  rt.call('bookSessions', { sessionIds: [baking.sessionId, carnival.sessionId] }, vera.token);
  come(rex, carnival.sessionId);

  // Placeholders from Version 1 (fundraising, outings, trips, house visits), with the mock trainees.
  const fr = call('createFundraiser', { name: 'Charity bake sale', description: 'Cookies, cards and bags made by trainees.', startDate: day(-7), endDate: day(14) }).fundraiser;
  [['Chocolate chip cookies (box of 6)', '5.50'], ['Greeting cards (set of 4)', '8'], ['Handmade tote bag', '12']]
    .forEach(([name, price]) => call('saveProduct', { fundraiserId: fr.fundraiserId, name, price }));
  const products = call('fundraiserDetail', { fundraiserId: fr.fundraiserId }).products;
  const pid = (startText) => products.find((x) => x.name.startsWith(startText)).productId;
  const order = (customerName, customerContact, items, paymentStatus) => call('createOrder', {
    fundraiserId: fr.fundraiserId, customerName, customerContact, paymentStatus,
    items: items.map(([startText, quantity]) => ({ productId: pid(startText), quantity })),
  });
  const first = order('Mdm Rachel Lee', '+65 9222 3333', [['Chocolate', 2], ['Handmade', 1]], 'paid');
  call('updateOrder', { orderId: first.orderId, collectionStatus: 'collected' });
  order('Mr Daniel Wong', 'daniel@example.com', [['Greeting', 3]], 'unpaid');

  const zoo = call('createOuting', { title: 'Zoo outing', date: day(5), startTime: '09:00', location: 'Singapore Zoo', notes: 'Meet at the school gate at 08:30. Bring a cap.' }).outing;
  [['T-0001', rex, 'A', '1'], ['T-0002', rina, 'A', '1'], ['T-0003', vera, 'B', '2']].forEach(([traineeId, v, group, bus]) =>
    call('assignOutingTrainee', { outingId: zoo.outingId, traineeId, userId: v.user.userId, group, bus }));
  const trip = call('createTrip', { title: 'Bangkok cultural exchange', destination: 'Bangkok, Thailand', startDate: day(45), endDate: day(49), notes: 'Partner school visit and city tour.' }).trip;
  call('addTripParticipant', { tripId: trip.tripId, traineeId: 'T-0001', userId: rex.user.userId });
  call('addTripLogistics', { tripId: trip.tripId, description: 'Collect passport copies from caregivers', dueDate: day(20) });
  call('createVisit', {
    traineeId: 'T-0001', userId: rex.user.userId, date: day(-20),
    family: 'Mum is managing well.', dailyLiving: 'Dresses himself; needs reminders to drink water.',
    social: 'Enjoys the Saturday music group.', followUp: 'Share the picture schedule with the family.',
  });
  return rt;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const escapeHtml = (v) => String(v instanceof Date ? v.toISOString() : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** What the app has saved to "Google Contacts" (the local stand-in), like contacts.google.com would show. */
function contactsPage(rt) {
  const groups = Object.fromEntries([...rt.contacts.groups.values()].map((g) => [g.resourceName, g.name]));
  const rows = [...rt.contacts.people.values()].map((c) => `<tr>
    <td>${escapeHtml((c.names[0] || {}).unstructuredName || '')}</td>
    <td>${escapeHtml(c.emailAddresses.map((x) => x.value).join(', '))}</td>
    <td>${escapeHtml(c.phoneNumbers.map((x) => x.value).join(', '))}</td>
    <td style="white-space:pre-line">${escapeHtml((c.biographies[0] || {}).value || '')}</td>
    <td>${escapeHtml(c.memberships.map((m) => groups[m.contactGroupMembership.contactGroupResourceName] || '').join(', '))}</td>
    <td><code>${escapeHtml(c.resourceName)}</code></td></tr>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>Google Contacts (local stand-in)</title>
<style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f3f4f6}</style>
<h1>Google Contacts (local stand-in)</h1>
<p>What the app would save in the Google account it runs as. Register a volunteer, or add one as an admin, then refresh this page.
In Exp and production these go to the real Google Contacts instead.</p>
<table><tr><th>Name</th><th>Email</th><th>Phone</th><th>Notes</th><th>Label</th><th>ID</th></tr>${rows || '<tr><td colspan="6">No contacts yet.</td></tr>'}</table>`;
}

function sheetPage(rt) {
  const sheets = ['demo-sheet', 'house-visit-sheet'].flatMap((id) => rt.spreadsheet(id).getSheets());
  const tabs = sheets.map((sheet) => {
    const rows = sheet.dump();
    const [head = [], ...body] = rows;
    return `<h2>${escapeHtml(sheet.getParent().getName())} → ${escapeHtml(sheet.getName())}${sheet.isSheetHidden() ? ' <small>(hidden)</small>' : ''}</h2>
      <table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  });
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>Local sheet</title>
    <style>body{font:13px system-ui;margin:16px}table{border-collapse:collapse;margin-bottom:24px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#eef}</style>
    <h1>Local stand-in for the Google Sheet</h1><p>Refreshes every 5 s. This is what the Apps Script backend has written.</p>${tabs.join('')}`;
}

export function startMockServer({ port = PORT, latency = LATENCY_MS, quiet = false } = {}) {
  const rt = createDemoRuntime();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/api') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        setTimeout(() => {
          const out = rt.callRaw(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(out));
        }, latency);
      });
      return;
    }
    if (url.pathname === '/__advance') {
      // Dev/testing only: move the backend clock forward, e.g. /__advance?minutes=120
      rt.advanceMinutes(Number(url.searchParams.get('minutes') || 60));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ now: rt.context.fmtDateTime_(rt.context.now_()) }));
    }
    if (url.pathname.startsWith('/__drive/')) {
      // Local stand-in for a guide infographic shared from Google Drive.
      const file = rt.drive.files.get(decodeURIComponent(url.pathname.slice('/__drive/'.length)));
      if (!file) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }
      res.writeHead(200, { 'Content-Type': file.mime, 'Cache-Control': 'no-store' });
      return res.end(Buffer.from(file.bytes.map((b) => (b < 0 ? b + 256 : b))));
    }
    if (url.pathname === '/__contacts') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(contactsPage(rt));
    }
    if (url.pathname === '/__sheet') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(sheetPage(rt));
    }
    // Folders serve their index.html, like GitHub Pages.
    const rel = decodeURIComponent(url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname);
    const file = path.normalize(path.join(WEB_DIR, rel));
    if (!file.startsWith(WEB_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  server.listen(port, () => {
    if (quiet) return;
    console.log(`MINDS Volunteer app (local mock) → http://localhost:${port}`);
    console.log(`  Admin:     ${DEMO.admin.email} / ${DEMO.admin.password}`);
    console.log(`  Regular:   ${DEMO.regular.email} / ${DEMO.regular.password}`);
    console.log(`  Volunteer: ${DEMO.volunteer.email} / ${DEMO.volunteer.password}`);
    console.log(`  Admin password (to make or remove an admin): ${DEMO.adminPassword}`);
    console.log(`  Google Contacts (stand-in): http://localhost:${port}/__contacts`);
    console.log(`  Sheet view: http://localhost:${port}/__sheet`);
  });
  return { server, rt };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startMockServer();
