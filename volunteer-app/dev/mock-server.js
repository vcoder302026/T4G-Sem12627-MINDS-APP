// Local development server: serves web/ and answers POST /api by running the
// real Apps Script code (gas/*.gs) against an in-memory demo spreadsheet.
//
//   npm run dev               → http://localhost:5173 (one app: volunteer screens + the Admin menu)
//   http://localhost:5173/__sheet     what the "Google Sheets" contain right now
//   http://localhost:5173/__contacts  the Google Contacts the app has added (simulated)
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
const MAX_BODY = 10 * 1024 * 1024; // uploads (photos, PDFs) arrive as base64 in the request

export const DEMO = {
  staff: { email: 'staff@example.com', password: 'StaffDemo123' }, // a MINDS staff member's own account
  volunteer: { email: 'volunteer@example.com', password: 'VolunteerDemo123' }, // Vera: a regular volunteer
  newVolunteer: { email: 'sam@example.com', password: 'VolunteerDemo123' }, // Sam: a new volunteer
  adminPassword: 'AdminDemo123', // the shared MINDS admin password
  contactsAccount: 'vcoder302026@gmail.com', // the Google account whose contacts the app fills (simulated here)
};

// MINDS's house-visit form responses (headers as in their sheet, answers fictional).
const VISIT_HEADERS = [
  'Timestamp', 'Date of Visit', 'Name of Attached Volunteer (1) - Full Name as per NRIC', 'Name of Attached Volunteer (2) - Full Name as per NRIC',
  'Name of Senior Volunteer(s)', "Trainee's Full Name", 'NRIC (Last 4 Alphanumeric. e.g. 123A)', 'Address', 'Date of Birth (DD MMM YYYY)',
  'Blood Type', 'Allergies', 'Medication', 'Mobility', 'Living Arrangement', 'Observations', 'Follow-up Needed',
];

export function createDemoRuntime() {
  const rt = createGasRuntime({ contactsAccount: DEMO.contactsAccount });
  rt.createSpreadsheet('demo-sheet', 'MINDS Volunteer Data (local demo)');
  // Stands in for the partner's existing trainee list. Fictional people only.
  rt.fillTab('demo-sheet', 'Trainees', [
    ['Name', 'Preferred Name', 'Gender', 'Programme', 'Communication', 'Behaviours', 'Things to Take Note', 'Interests', 'Support Needs', 'Medical Notes', 'Caregiver Name', 'Caregiver Phone', 'Active', 'Dietary Notes'],
    ['Alex Tan Wei Ming', 'Alex', 'Male', 'Day Activity Centre', 'Verbal: short sentences, speak slowly', 'Likes routine; may walk away when tired', 'Gets anxious with loud noises: offer ear muffs', 'Music, jigsaw puzzles, trains', 'Reminders to drink water', 'Epilepsy care plan on file', 'Mdm Tan', '91234567', 'Yes', 'No beef'],
    ['Bea Lim', 'Bea', 'Female', 'Day Activity Centre', 'Non-verbal: uses gestures and picture cards', 'Friendly, loves high-fives', 'Allergic to peanuts: no outside snacks', 'Drawing, K-pop', 'Hand-over-hand help with scissors', '', 'Mr Lim', '92345678', 'Yes', 'Peanut allergy'],
    ['Chris Ng', '', 'Male', 'Employment Development', 'Verbal, very chatty', 'Enjoys being given jobs', '', 'Football, cooking', '', 'Asthma inhaler in bag', 'Mrs Ng', '93456789', 'Yes', 'Halal'],
    ['Dana Goh', 'Dana', 'Female', 'Day Activity Centre', 'A few words plus some sign language', 'Shy at first; warms up with music', 'Wheelchair user: check the room layout first', 'Dancing, colouring', 'Wheelchair user', '', 'Ms Goh', '94567890', 'Yes', ''],
    ['Evan Lee', '', 'Male', 'Day Activity Centre', 'Verbal', '', '', 'Lego', '', '', 'Mr Lee', '95678901', 'No', ''],
  ]);
  rt.props.set('SPREADSHEET_ID', 'demo-sheet');
  rt.run('setup'); // also adds the starter venue, guide (with the "On the day" infographic), project and settings
  rt.props.set('NEW_ADMIN_PASSWORD', DEMO.adminPassword);
  rt.run('setAdminPassword');

  // A separate spreadsheet: MINDS's house-visit form responses (the "trainee updates" database).
  const today = rt.context.todayStr_();
  const day = (n) => rt.context.addDays_(today, n);
  rt.createSpreadsheet('demo-house-visits', 'Mock Data - [Exp] House Visit Template Form (Responses)');
  rt.fillTab('demo-house-visits', 'Form Responses 1', [
    VISIT_HEADERS,
    [`${day(-75)} 19:02:11`, day(-76), 'Vera Volunteer', '', 'Mdm Rosalind Teo', 'Alex Tan Wei Ming', '123A', 'Blk 101 Fictional Ave 1, #05-01', '12 Mar 2005', 'O+', 'Peanuts (mild)', 'Anti-seizure tablets, morning and night', 'Walks independently', 'Lives with mum and grandmother', 'Settled; enjoys the train set at home.', 'No'],
    [`${day(-12)} 20:15:40`, day(-13), 'Vera Volunteer', 'Priya Nair', 'Mdm Rosalind Teo', 'Alex Tan Wei Ming', '123A', '', '12 Mar 2005', 'O+', '', '', '', '', 'Started a picture routine chart; calmer in the mornings.', 'Share the chart with the school'],
    [`${day(-30)} 18:40:05`, day(-30), 'Priya Nair', '', 'Mr Daniel Koh', 'Bea Lim', '456B', 'Blk 22 Pretend Road, #11-30', '01 Jan 2006', 'A-', 'Peanuts (severe, carries EpiPen)', '', 'Walks independently', 'Lives with dad; aunt helps in the afternoons', 'Loves drawing; points to picture cards to choose.', 'No'],
    [`${day(-20)} 19:55:00`, day(-21), 'Vera Volunteer', '', 'Mr Daniel Koh', 'Chris Ng', '789C', 'Blk 7 Example Street, #02-14', '23 Aug 2003', 'B+', 'None', 'Inhaler when needed', 'Walks independently', 'Lives with parents and sister', 'Proud of his new part-time job at a café.', 'No'],
    [`${day(-40)} 17:20:30`, day(-41), 'Former Volunteer Ong', '', 'Mdm Rosalind Teo', 'Dana Goh', '321D', 'Blk 55 Sample Crescent, #08-08', '05 May 2007', 'AB+', 'None', '', 'Wheelchair user; needs help on ramps', 'Lives with mum', 'Enjoys dancing to music in her wheelchair.', 'Check the lift at the block is repaired'],
  ]);

  const reg = (name, email, password, telegram, extra = {}) => rt.call('register', {
    name, email, password, birthday: '2000-01-15', phone: '+65 9000 0000', telegram, consent: true, ...extra,
  }).data;
  const staff = reg('Sarah Yeo', DEMO.staff.email, DEMO.staff.password, 'sarah_yeo_minds', { phone: '+65 9333 4444' });
  const vera = reg('Vera Volunteer', DEMO.volunteer.email, DEMO.volunteer.password, 'vera_volunteers');
  const sam = reg('Sam Siva', DEMO.newVolunteer.email, DEMO.newVolunteer.password, 'sam_siva', { phone: '+65 9111 2222' });
  const priya = reg('Priya Nair', 'priya@example.com', 'VolunteerDemo123', 'priya_nair', { phone: '+65 9555 6666' });
  [staff, vera, sam, priya].forEach((v) => rt.call('acknowledgeGuide', {}, v.token)); // a newly registered account has not read it
  const adminToken = () => rt.call('adminUnlock', { password: DEMO.adminPassword }, staff.token).data.adminToken;
  let at = adminToken();
  const admin = (action, payload) => rt.call(action, payload, staff.token, at);
  const SCHOOL = 'MINDS Woodlands Gardens School';
  const PROJECT = 'School activity support';
  const mk = (title, date, startTime, endTime, capacity, notes = '', extra = {}) =>
    admin('createSession', { title, date, startTime, endTime, venue: SCHOOL, project: PROJECT, capacity, notes, ...extra }).data.session;
  const bookingOf = (res, sessionId) => res.data.home.upcoming.find((u) => u.session.sessionId === sessionId).bookingId;

  // Databases: the house-visit responses are linked (Settings → Databases), and some answers are shared with volunteers.
  admin('saveDataSource', { key: 'traineeUpdates', url: 'https://docs.google.com/spreadsheets/d/demo-house-visits/edit#gid=0' });
  admin('saveFieldAccess', { fields: [
    { key: 'update|Allergies', newSee: true, regularSee: true },
    { key: 'update|Observations', newSee: true, regularSee: true },
    { key: 'update|Medication', newSee: false, regularSee: true },
    { key: 'update|Mobility', newSee: false, regularSee: true },
    { key: 'update|Living Arrangement', newSee: false, regularSee: true },
  ] });
  // Vera has volunteered with MINDS for years (before the app): an admin marks her regular.
  admin('updatePerson', { userId: vera.user.userId, volunteerType: 'regular' });
  // The Pairing List, imported from the house-visit responses (Dana's past volunteer is not in the app).
  admin('importPairs', { from: 'traineeUpdates' });
  // Photos of the fictional trainees (simple drawings, not real people).
  ['T-0001', 'T-0002', 'T-0003', 'T-0004'].forEach((traineeId) => {
    const file = path.join(here, 'demo-photos', `${traineeId}.png`);
    if (fs.existsSync(file)) admin('uploadTraineePhoto', { traineeId, name: `${traineeId}.png`, mimeType: 'image/png', data: fs.readFileSync(file).toString('base64') });
  });

  // Priya: 9 sessions with Bea over the past weeks. Her 10th (today) makes her a regular.
  for (let i = 9; i >= 1; i--) {
    const d = day(-7 * i - 2);
    rt.setNow(`${d}T08:00:00+08:00`);
    at = adminToken();
    const s = mk('Saturday club', d, '09:00', '11:00', 10);
    const b = bookingOf(rt.call('bookSession', { sessionId: s.sessionId }, priya.token), s.sessionId);
    rt.setNow(`${d}T09:00:00+08:00`);
    admin('manualClock', { bookingId: b });
    rt.setNow(`${d}T11:00:00+08:00`);
    admin('manualClock', { bookingId: b });
  }

  // Yesterday: Vera (regular: paired automatically with her regular trainees) and Sam (new: an admin paired him
  // with Bea) came and gave feedback. Priya said she was coming but did not: a no-show.
  const yesterday = day(-1);
  rt.setNow(`${yesterday}T08:00:00+08:00`);
  at = adminToken();
  const past = mk('Music & movement', yesterday, '10:00', '12:00', 6);
  const pv = bookingOf(rt.call('bookSession', { sessionId: past.sessionId }, vera.token), past.sessionId);
  const ps = bookingOf(rt.call('bookSession', { sessionId: past.sessionId }, sam.token), past.sessionId);
  rt.call('bookSession', { sessionId: past.sessionId }, priya.token);
  admin('updateBooking', { bookingId: ps, traineeIds: ['T-0004'] });
  rt.setNow(`${yesterday}T10:00:00+08:00`);
  admin('manualClock', { bookingId: pv });
  admin('manualClock', { bookingId: ps });
  rt.setNow(`${yesterday}T12:00:00+08:00`);
  admin('manualClock', { bookingId: pv });
  admin('manualClock', { bookingId: ps });
  rt.call('submitFeedback', {
    bookingId: pv, rating: 4, sessionFeedback: 'Good session, the playlist worked well.',
    traineeObservation: 'Alex was calmer when I showed him the picture card for the next activity before we moved on. He loved the drumming.',
  }, vera.token);
  rt.call('submitFeedback', {
    bookingId: ps, rating: 5, sessionFeedback: '',
    traineeObservation: 'Dana danced along to every song. Give her a minute to settle in a new room before starting.',
  }, sam.token);
  rt.setNow(null);
  at = adminToken();

  // An admin shares Sam's observation (it becomes a note for future volunteers); Vera's waits for review.
  const queue = admin('reviewQueue', {}).data.items;
  const samNote = queue.find((q) => q.volunteerName === 'Sam Siva');
  admin('reviewObservation', { feedbackId: samNote.feedbackId, decision: 'share' });
  admin('addTraineeNote', { traineeId: 'T-0001', note: 'Uses a picture schedule. Show the next activity card before changing activity.' });
  // Vera (regular) updates Chris after a visit: a new row in the house-visit responses, plus a note for review.
  rt.call('submitTraineeUpdate', {
    traineeId: 'T-0003', visitDate: day(-2), changes: { Observations: 'Wants to bake for the charity sale; practising muffins at home.' },
    note: 'Chris asked if he can help hand out snacks at the next session.',
  }, vera.token);

  // Today and coming up.
  const art = mk('Art & Craft', today, '10:00', '12:00', 8, 'Aprons provided. Wear covered shoes.');
  mk('', today, '14:00', '16:00', 6, 'Meet at the school hall.'); // no title: shows its type, "Volunteer session"
  const baking = mk('Baking: banana muffins', day(3), '09:30', '11:30', 5);
  const carnival = mk('Sports carnival helpers', day(7), '08:00', '13:00', 20, 'Bring a water bottle and cap.', { traineeIds: ['T-0003', 'T-0004'] });
  mk('Botanic Gardens walk', day(10), '09:00', '12:00', 12, 'Meet at the Tanglin Gate.', { type: 'Outing' });
  const closed = mk('Lunar New Year craft', day(14), '10:00', '12:00', 4);
  admin('updateSession', { sessionId: closed.sessionId, status: 'closed' });

  // Vera says she's coming to today's Art & Craft: paired with both her regular trainees (Alex and Chris).
  rt.call('bookSession', { sessionId: art.sessionId }, vera.token);
  rt.call('bookSession', { sessionId: baking.sessionId }, vera.token);
  // Priya (her regular pair is Bea) and Sam (new: waits for an admin to pair him) are coming today too.
  rt.call('bookSession', { sessionId: art.sessionId }, priya.token);
  rt.call('bookSession', { sessionId: art.sessionId }, sam.token);
  // Sam marks two sessions at once.
  rt.call('signUpSessions', { sessionIds: [baking.sessionId, carnival.sessionId] }, sam.token);

  // The other admin modules: a fundraiser, an outing, an overseas trip and house visits recorded in the app.
  const fr = admin('createFundraiser', { name: 'Charity bake sale', description: 'Cookies, cards and bags made by trainees.', startDate: day(-7), endDate: day(14) }).data.fundraiser;
  [['Chocolate chip cookies (box of 6)', '5.50'], ['Greeting cards (set of 4)', '8'], ['Handmade tote bag', '12']]
    .forEach(([name, price]) => admin('saveProduct', { fundraiserId: fr.fundraiserId, name, price }));
  const products = admin('fundraiserDetail', { fundraiserId: fr.fundraiserId }).data.products;
  const pid = (start) => products.find((x) => x.name.startsWith(start)).productId;
  const order = (customerName, customerContact, items, paymentStatus) => admin('createOrder', {
    fundraiserId: fr.fundraiserId, customerName, customerContact, paymentStatus,
    items: items.map(([start, quantity]) => ({ productId: pid(start), quantity })),
  }).data;
  const first = order('Mdm Rachel Lee', '+65 9222 3333', [['Chocolate', 2], ['Handmade', 1]], 'paid');
  admin('updateOrder', { orderId: first.orderId, collectionStatus: 'collected' });
  order('Mr Daniel Wong', 'daniel@example.com', [['Greeting', 3]], 'unpaid');
  order('Office pre-order (Level 5)', '', [['Chocolate', 10], ['Greeting', 2]], 'paid');

  const zoo = admin('createOuting', { title: 'Zoo outing', date: day(5), startTime: '09:00', location: 'Singapore Zoo', notes: 'Meet at the school gate at 08:30. Bring a cap.' }).data.outing;
  [['T-0001', vera, 'A', '1'], ['T-0002', priya, 'A', '1'], ['T-0003', vera, 'B', '2']].forEach(([traineeId, v, group, bus]) =>
    admin('assignOutingTrainee', { outingId: zoo.outingId, traineeId, userId: v.user.userId, group, bus }));

  const trip = admin('createTrip', { title: 'Bangkok cultural exchange', destination: 'Bangkok, Thailand', startDate: day(45), endDate: day(49), notes: 'Partner school visit and city tour.' }).data.trip;
  admin('addTripParticipant', { tripId: trip.tripId, traineeId: 'T-0001', userId: vera.user.userId });
  admin('addTripParticipant', { tripId: trip.tripId, traineeId: 'T-0004', notes: 'Needs a wheelchair-accessible room.' });
  const flights = admin('addTripLogistics', { tripId: trip.tripId, description: 'Book flights', dueDate: day(10) }).data.logistics[0];
  admin('updateTripLogistics', { itemId: flights.itemId, status: 'done' });
  admin('addTripLogistics', { tripId: trip.tripId, description: 'Collect passport copies from caregivers', dueDate: day(20) });
  admin('addTripLogistics', { tripId: trip.tripId, description: 'Buy travel insurance', dueDate: day(30) });
  admin('addTripExpense', { tripId: trip.tripId, description: 'Flights deposit', amount: '1200', date: day(-2), paidBy: 'MINDS office' });
  admin('addTripExpense', { tripId: trip.tripId, description: 'Hotel deposit', amount: '450.50', date: day(-1), paidBy: 'MINDS office' });

  admin('createVisit', {
    traineeId: 'T-0001', userId: vera.user.userId, date: day(-20),
    family: 'Mum is managing well; grandmother now lives with them.', dailyLiving: 'Dresses himself; needs reminders to drink water.',
    social: 'Enjoys the Saturday music group.', health: 'No seizures this month.', followUp: 'Share the picture schedule with the family.',
  });
  admin('createVisit', {
    traineeId: 'T-0002', userId: sam.user.userId, date: day(-3),
    family: 'Dad works night shifts; aunt helps in the afternoons.', social: 'Wants to join an art class.',
    followUp: 'Send details of the community art class to Mr Lim.',
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
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
};

const escapeHtml = (v) => String(v instanceof Date ? v.toISOString() : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const page = (title, body) => `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>${escapeHtml(title)}</title>
  <style>body{font:13px system-ui;margin:16px}table{border-collapse:collapse;margin-bottom:24px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef}td{white-space:pre-line}h1{font-size:20px}</style>
  ${body}`;

function sheetPage(rt) {
  const books = [['demo-sheet', 'Main spreadsheet'], ['demo-house-visits', 'A separate spreadsheet, linked in Admin → Settings → Databases']];
  return page('Local sheets', `<h1>Local stand-in for the Google Sheets</h1><p>Refreshes every 5 s. This is what the Apps Script backend has written.</p>${books.map(([id, note]) => {
    const book = rt.spreadsheet(id);
    return `<h1>${escapeHtml(book.getName())} <small>(${escapeHtml(note)})</small></h1>${book.getSheets().map((sheet) => {
      const [head = [], ...body] = sheet.dump();
      return `<h2>${escapeHtml(sheet.getName())}${sheet.isSheetHidden() ? ' <small>(hidden)</small>' : ''} <small>gid=${sheet.getSheetId()}</small></h2>
        <table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }).join('')}`;
  }).join('')}`);
}

function contactsPage(rt) {
  const people = [...rt.contacts.contacts.values()];
  const rows = people.map((p) => `<tr><td>${escapeHtml((p.names[0] || {}).givenName || '')}</td><td>${escapeHtml((p.emailAddresses[0] || {}).value || '')}</td>
    <td>${escapeHtml((p.phoneNumbers[0] || {}).value || '')}</td><td>${escapeHtml(p.memberships.join(', '))}</td><td>${escapeHtml((p.biographies[0] || {}).value || '')}</td><td>${escapeHtml(p.resourceName)}</td></tr>`).join('');
  return page('Simulated Google Contacts', `<h1>Google Contacts of ${escapeHtml(rt.contacts.accountEmail)} (simulated)</h1>
    <p>When the app is deployed from that Google account, each new volunteer is added to its contacts like this, with their Telegram handle in the notes. Refreshes every 5 s.</p>
    <table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Label</th><th>Notes</th><th>Contact ID</th></tr></thead><tbody>${rows}</tbody></table>`);
}

export function startMockServer({ port = PORT, latency = LATENCY_MS, quiet = false } = {}) {
  const rt = createDemoRuntime();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/api') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > MAX_BODY) req.destroy();
      });
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
    if (url.pathname === '/__sheet') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(sheetPage(rt));
    }
    if (url.pathname === '/__contacts') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(contactsPage(rt));
    }
    // Folders serve their index.html, like GitHub Pages (old /admin/ links redirect into the app).
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
    console.log(`  MINDS staff:       ${DEMO.staff.email} / ${DEMO.staff.password}  (then Me → Admin, password ${DEMO.adminPassword})`);
    console.log(`  Regular volunteer: ${DEMO.volunteer.email} / ${DEMO.volunteer.password}`);
    console.log(`  New volunteer:     ${DEMO.newVolunteer.email} / ${DEMO.newVolunteer.password}`);
    console.log(`  Sheet view:    http://localhost:${port}/__sheet`);
    console.log(`  Contacts view: http://localhost:${port}/__contacts  (simulated Google Contacts of ${DEMO.contactsAccount})`);
  });
  return { server, rt };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startMockServer();
