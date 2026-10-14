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
  leader: { email: 'leader@example.com', password: 'LeaderDemo123' },
  volunteer: { email: 'volunteer@example.com', password: 'VolunteerDemo123' },
};

export function createDemoRuntime() {
  const rt = createGasRuntime();
  rt.createSpreadsheet('demo-sheet', 'MINDS Volunteer Data (local demo)');
  // Stands in for the partner's existing trainee list (fictional people).
  rt.fillTab('demo-sheet', 'Trainees', [
    ['Name', 'Preferred Name', 'Programme', 'Interests', 'Communication Tips', 'Support Needs', 'Medical Notes', 'Caregiver Name', 'Caregiver Phone'],
    ['Alex Tan Wei Ming', 'Alex', 'Day Activity Centre', 'Music, jigsaw puzzles, trains', 'Speak slowly; short sentences. Likes high-fives.', 'Needs reminders to drink water', 'Epilepsy care plan on file', 'Mdm Tan', '91234567'],
    ['Bea Lim', 'Bea', 'Day Activity Centre', 'Drawing, K-pop', 'Prefers pictures to words', 'Gets anxious in loud rooms', '', 'Mr Lim', '92345678'],
    ['Chris Ng', '', 'Employment Development', 'Football, cooking', 'Chatty; enjoys being given jobs', '', 'Asthma inhaler in bag', 'Mrs Ng', '93456789'],
    ['Dana Goh', 'Dana', 'Day Activity Centre', 'Dancing, colouring', 'Uses some sign language', 'Wheelchair user', '', 'Ms Goh', '94567890'],
  ]);
  rt.props.set('SPREADSHEET_ID', 'demo-sheet');
  rt.run('setup');

  const reg = (name, email, password) => rt.call('register', {
    name, email, password, birthday: '2000-01-15', phone: '+65 9000 0000', telegram: '',
    emergencyName: 'Demo Contact', emergencyPhone: '+65 8000 0000', emergencyRelation: 'Parent', consent: true,
  });
  reg('Leader Lee', DEMO.leader.email, DEMO.leader.password);
  rt.props.set('FIRST_ADMIN_EMAIL', DEMO.leader.email);
  rt.run('makeFirstAdmin');
  const volunteer = reg('Vera Volunteer', DEMO.volunteer.email, DEMO.volunteer.password).data;
  reg('Sam Siva', 'sam@example.com', 'VolunteerDemo123');

  const leader = rt.call('login', DEMO.leader).data.token;
  const today = rt.context.todayStr_();
  const day = (n) => rt.context.addDays_(today, n);
  const mk = (title, date, startTime, endTime, venue, capacity, notes = '') =>
    rt.call('createSession', { title, date, startTime, endTime, venue, capacity, notes }, leader).data.session;
  const art = mk('Art & Craft', today, '10:00', '12:00', 'MINDS Clementi DAC', 6, 'Aprons provided. Wear covered shoes.');
  mk('Bowling buddies', today, '14:00', '16:00', 'Superbowl Jurong', 4);
  const baking = mk('Baking: banana muffins', day(3), '09:30', '11:30', 'MINDS Clementi DAC', 5);
  mk('Sports carnival helpers', day(7), '08:00', '13:00', 'Jurong West Sports Centre', 20, 'Bring a water bottle and cap.');

  const b1 = rt.call('bookSession', { sessionId: art.sessionId }, volunteer.token).data.home.upcoming[0].bookingId;
  rt.call('updateBooking', { bookingId: b1, status: 'confirmed', traineeId: 'T-0001' }, leader);
  rt.call('bookSession', { sessionId: baking.sessionId }, volunteer.token);
  const sam = rt.call('login', { email: 'sam@example.com', password: 'VolunteerDemo123' }).data.token;
  rt.call('bookSession', { sessionId: art.sessionId }, sam);
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
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
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
    console.log(`  Sheet view: http://localhost:${port}/__sheet`);
  });
  return { server, rt };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startMockServer();
