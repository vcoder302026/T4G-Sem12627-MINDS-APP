// Local development server: serves web/ and answers POST /api by running the
// real Apps Script code (gas/*.gs) against an in-memory demo spreadsheet.
//
//   npm run dev            → http://localhost:5173
//   http://localhost:5173/admin/    the staff dashboard (same backend and sheet)
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
  leader: { email: 'leader@example.com', password: 'LeaderDemo123' },
  volunteer: { email: 'volunteer@example.com', password: 'VolunteerDemo123' },
};

export function createDemoRuntime() {
  const rt = createGasRuntime();
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
  rt.run('setup'); // also adds the starter venue (MINDS Woodlands Gardens School), guide and project

  const reg = (name, email, password, extra = {}) => rt.call('register', {
    name, email, password, birthday: '2000-01-15', phone: '+65 9000 0000', telegram: '',
    emergencyName: 'Demo Contact', emergencyPhone: '+65 8000 0000', emergencyRelation: 'Parent', consent: true, ...extra,
  });
  reg('Leader Lee', DEMO.leader.email, DEMO.leader.password);
  rt.props.set('FIRST_ADMIN_EMAIL', DEMO.leader.email);
  rt.run('makeFirstAdmin');
  const vera = reg('Vera Volunteer', DEMO.volunteer.email, DEMO.volunteer.password, { telegram: 'vera_volunteers' }).data;
  const sam = reg('Sam Siva', 'sam@example.com', 'VolunteerDemo123', { phone: '+65 9111 2222' }).data;
  // Both demo volunteers have read the Volunteer Guide; a newly registered account has not.
  rt.call('acknowledgeGuide', {}, vera.token);
  rt.call('acknowledgeGuide', {}, sam.token);

  const leader = rt.call('login', DEMO.leader).data.token;
  const SCHOOL = 'MINDS Woodlands Gardens School';
  const PROJECT = 'School activity support';
  const today = rt.context.todayStr_();
  const day = (n) => rt.context.addDays_(today, n);
  const mk = (title, date, startTime, endTime, capacity, notes = '', extra = {}) =>
    rt.call('createSession', { title, date, startTime, endTime, venue: SCHOOL, project: PROJECT, capacity, notes, ...extra }, leader).data.session;
  const bookingOf = (res, sessionId) => res.data.home.upcoming.find((u) => u.session.sessionId === sessionId).bookingId;

  // Yesterday: Vera with Alex and Sam with Bea, both finished and gave feedback.
  const yesterday = day(-1);
  rt.setNow(`${yesterday}T09:00:00+08:00`);
  const past = mk('Music & movement', yesterday, '10:00', '12:00', 4);
  const pv = bookingOf(rt.call('bookSession', { sessionId: past.sessionId }, vera.token), past.sessionId);
  const ps = bookingOf(rt.call('bookSession', { sessionId: past.sessionId }, sam.token), past.sessionId);
  rt.call('updateBooking', { bookingId: pv, status: 'confirmed', traineeId: 'T-0001' }, leader);
  rt.call('updateBooking', { bookingId: ps, status: 'confirmed', traineeId: 'T-0002' }, leader);
  rt.setNow(`${yesterday}T10:00:00+08:00`);
  rt.call('manualClock', { bookingId: pv }, leader);
  rt.call('manualClock', { bookingId: ps }, leader);
  rt.setNow(`${yesterday}T12:00:00+08:00`);
  rt.call('manualClock', { bookingId: pv }, leader);
  rt.call('manualClock', { bookingId: ps }, leader);
  rt.call('submitFeedback', {
    bookingId: pv, rating: 4, sessionFeedback: 'Good session, the playlist worked well.',
    traineeObservation: 'Alex was calmer when I showed him the picture card for the next activity before we moved on. He loved the drumming.',
  }, vera.token);
  rt.call('submitFeedback', {
    bookingId: ps, rating: 5, sessionFeedback: '',
    traineeObservation: 'Bea points to the picture cards to choose colours. Give her two choices at a time.',
  }, sam.token);
  rt.setNow(null);

  // A leader shares Sam's observation (it becomes a note for future volunteers); Vera's waits for review.
  const queue = rt.call('reviewQueue', {}, leader).data.items;
  const samNote = queue.find((q) => q.volunteerName === 'Sam Siva');
  rt.call('reviewObservation', { feedbackId: samNote.feedbackId, decision: 'share' }, leader);
  rt.call('addTraineeNote', { traineeId: 'T-0001', note: 'Uses a picture schedule. Show the next activity card before changing activity.' }, leader);

  // Today and coming up.
  const art = mk('Art & Craft', today, '10:00', '12:00', 6, 'Aprons provided. Wear covered shoes.');
  mk('Sports & games', today, '14:00', '16:00', 4, 'Meet at the school hall.');
  const baking = mk('Baking: banana muffins', day(3), '09:30', '11:30', 5);
  mk('Sports carnival helpers', day(7), '08:00', '13:00', 20, 'Bring a water bottle and cap.', { traineeIds: ['T-0003', 'T-0004'] });

  // Vera is confirmed and paired automatically (with Alex: they were paired before).
  const b1 = bookingOf(rt.call('bookSession', { sessionId: art.sessionId }, vera.token), art.sessionId);
  rt.call('updateBooking', { bookingId: b1, status: 'confirmed' }, leader);
  rt.call('bookSession', { sessionId: baking.sessionId }, vera.token);
  rt.call('bookSession', { sessionId: art.sessionId }, sam.token); // pending: try "Confirm all & pair trainees"

  // Staff dashboard (/admin/): a fundraiser, an outing, an overseas trip and house visits.
  const fr = rt.call('createFundraiser', { name: 'Charity bake sale', description: 'Cookies, cards and bags made by trainees.', startDate: day(-7), endDate: day(14) }, leader).data.fundraiser;
  [['Chocolate chip cookies (box of 6)', '5.50'], ['Greeting cards (set of 4)', '8'], ['Handmade tote bag', '12']]
    .forEach(([name, price]) => rt.call('saveProduct', { fundraiserId: fr.fundraiserId, name, price }, leader));
  const products = rt.call('fundraiserDetail', { fundraiserId: fr.fundraiserId }, leader).data.products;
  const pid = (start) => products.find((x) => x.name.startsWith(start)).productId;
  const order = (customerName, customerContact, items, paymentStatus) => rt.call('createOrder', {
    fundraiserId: fr.fundraiserId, customerName, customerContact, paymentStatus,
    items: items.map(([start, quantity]) => ({ productId: pid(start), quantity })),
  }, leader).data;
  const first = order('Mdm Rachel Lee', '+65 9222 3333', [['Chocolate', 2], ['Handmade', 1]], 'paid');
  rt.call('updateOrder', { orderId: first.orderId, collectionStatus: 'collected' }, leader);
  order('Mr Daniel Wong', 'daniel@example.com', [['Greeting', 3]], 'unpaid');
  order('Office pre-order (Level 5)', '', [['Chocolate', 10], ['Greeting', 2]], 'paid');

  const zoo = rt.call('createOuting', { title: 'Zoo outing', date: day(5), startTime: '09:00', location: 'Singapore Zoo', notes: 'Meet at the school gate at 08:30. Bring a cap.' }, leader).data.outing;
  [['T-0001', vera, 'A', '1'], ['T-0002', sam, 'A', '1'], ['T-0003', vera, 'B', '2']].forEach(([traineeId, v, group, bus]) =>
    rt.call('assignOutingTrainee', { outingId: zoo.outingId, traineeId, userId: v.user.userId, group, bus }, leader));

  const trip = rt.call('createTrip', { title: 'Bangkok cultural exchange', destination: 'Bangkok, Thailand', startDate: day(45), endDate: day(49), notes: 'Partner school visit and city tour.' }, leader).data.trip;
  rt.call('addTripParticipant', { tripId: trip.tripId, traineeId: 'T-0001', userId: vera.user.userId }, leader);
  rt.call('addTripParticipant', { tripId: trip.tripId, traineeId: 'T-0004', notes: 'Needs a wheelchair-accessible room.' }, leader);
  const flights = rt.call('addTripLogistics', { tripId: trip.tripId, description: 'Book flights', dueDate: day(10) }, leader).data.logistics[0];
  rt.call('updateTripLogistics', { itemId: flights.itemId, status: 'done' }, leader);
  rt.call('addTripLogistics', { tripId: trip.tripId, description: 'Collect passport copies from caregivers', dueDate: day(20) }, leader);
  rt.call('addTripLogistics', { tripId: trip.tripId, description: 'Buy travel insurance', dueDate: day(30) }, leader);
  rt.call('addTripExpense', { tripId: trip.tripId, description: 'Flights deposit', amount: '1200', date: day(-2), paidBy: 'MINDS office' }, leader);
  rt.call('addTripExpense', { tripId: trip.tripId, description: 'Hotel deposit', amount: '450.50', date: day(-1), paidBy: 'MINDS office' }, leader);

  rt.call('createVisit', {
    traineeId: 'T-0001', userId: vera.user.userId, date: day(-20),
    family: 'Mum is managing well; grandmother now lives with them.', dailyLiving: 'Dresses himself; needs reminders to drink water.',
    social: 'Enjoys the Saturday music group.', health: 'No seizures this month.', followUp: 'Share the picture schedule with the family.',
  }, leader);
  rt.call('createVisit', {
    traineeId: 'T-0002', userId: sam.user.userId, date: day(-3),
    family: 'Dad works night shifts; aunt helps in the afternoons.', social: 'Wants to join an art class.',
    followUp: 'Send details of the community art class to Mr Lim.',
  }, leader);
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

function sheetPage(rt) {
  const book = rt.spreadsheet('demo-sheet');
  const tabs = book.getSheets().map((sheet) => {
    const rows = sheet.dump();
    const [head = [], ...body] = rows;
    return `<h2>${escapeHtml(sheet.getName())}${sheet.isSheetHidden() ? ' <small>(hidden)</small>' : ''}</h2>
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
    if (url.pathname === '/__sheet') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(sheetPage(rt));
    }
    // Folders serve their index.html, like GitHub Pages (so /admin/ opens the staff dashboard).
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
    console.log(`  Leader:    ${DEMO.leader.email} / ${DEMO.leader.password}`);
    console.log(`  Volunteer: ${DEMO.volunteer.email} / ${DEMO.volunteer.password}`);
    console.log(`  Staff dashboard: http://localhost:${port}/admin/`);
    console.log(`  Sheet view: http://localhost:${port}/__sheet`);
  });
  return { server, rt };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startMockServer();
