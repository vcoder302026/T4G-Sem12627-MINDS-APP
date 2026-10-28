/**
 * Builds a mock VOLUNTEER database for the Exp environment, from the same demo the
 * local app uses (fictional people only), linked to MINDS's mock House Visit sheet:
 * Trainee IDs T-0001 = Mock Trainee 1 … in that sheet's row order.
 *
 *   node dev/make-exp-database.mjs <APP_SECRET> > /tmp/exp-db.json
 *
 * Passwords in the hidden _Auth tab are stored under <APP_SECRET>: set the same value as
 * the Exp project's APP_SECRET script property BEFORE running setup(), and the demo
 * accounts sign in with their demo passwords. Anything that points at the demo's
 * stand-in Google Drive or Contacts (photo / guide file IDs, contact IDs) is removed.
 */
import { createDemoRuntime } from './mock-server.js';

const secret = process.argv[2];
if (!secret || secret.length < 32) { console.error('Usage: node dev/make-exp-database.mjs <APP_SECRET, 32+ characters>'); process.exit(1); }
const rt = createDemoRuntime({ secret });

/* ---- 30 more fictional volunteers, so the pairing board can be tried with real numbers ---- */
const call = (action, payload, token) => {
  const res = rt.call(action, payload, token);
  if (!res.ok) throw new Error(`${action}: ${JSON.stringify(res.error)}`);
  return res.data;
};
const admin = call('login', { email: 'admin@example.com', password: 'AdminDemo123' });
const FIRST = ['Aisha', 'Benjamin', 'Chloe', 'Daniel', 'Ethan', 'Farah', 'Grace', 'Hafiz', 'Isabel', 'Jun Wei', 'Kavya', 'Lucas',
  'Mei Ling', 'Nathan', 'Olivia', 'Priya', 'Qi Xuan', 'Rahul', 'Siti', 'Timothy', 'Umairah', 'Vanessa', 'Wei Jie', 'Xin Yi',
  'Yusuf', 'Zoe', 'Arjun', 'Bryan', 'Clara', 'Darren'];
const LAST = ['Tan', 'Lim', 'Ng', 'Wong', 'Koh', 'Rahman', 'Lee', 'Ismail', 'Goh', 'Chua', 'Nair', 'Teo', 'Ong', 'Chan', 'Yeo',
  'Menon', 'Ho', 'Kumar', 'Aziz', 'Low', 'Hassan', 'Seah', 'Toh', 'Liew', 'Abdullah', 'Quek', 'Pillai', 'Sim', 'Foo', 'Heng'];
const PROJECTS = ['RSPID (WGS)', 'RSPID (WGS)', 'West End', 'RSPID (CTDC)', 'West End', 'RSPID (CTDC) Alumni', 'RSPID (WGS) Alumni'];
const extra = FIRST.map((first, i) => {
  const name = `${first} ${LAST[i]}`;
  const project = PROJECTS[i % PROJECTS.length];
  const rspid = project.startsWith('RSPID');
  const email = `${first.toLowerCase().replace(/\s+/g, '')}.${LAST[i].toLowerCase()}@example.com`;
  const phone = `+65 9${String(1000000 + i * 37731).slice(-7)}`;
  const v = call('register', {
    firstName: first, lastName: LAST[i], email, password: 'VolunteerDemo123', birthday: `${1998 + (i % 8)}-0${1 + (i % 9)}-1${i % 10}`, phone,
    telegram: i % 3 ? `${first.toLowerCase().replace(/\s+/g, '_')}_${LAST[i].toLowerCase()}` : '', consent: true,
    answers: {
      shortName: first, nric4: `${100 + i * 7}${String.fromCharCode(65 + (i % 26))}`, address: `Blk ${200 + i} Woodlands Ave ${1 + (i % 9)}, #0${1 + (i % 9)}-${10 + i}`,
      project, courseYear: rspid ? `${['MAE', 'EEE', 'CS', 'SSS', 'NBS'][i % 5]}, Y${1 + (i % 4)}` : '', matricNo: rspid ? `U23${String(10000 + i * 113).slice(-5)}${String.fromCharCode(65 + (i % 26))}` : '',
      schoolEmail: rspid ? `${first.toLowerCase().replace(/\s+/g, '')}${i}@e.ntu.edu.sg` : '', startYear: String(2022 + (i % 4)), shirtSize: ['S', 'M', 'L', 'XL', 'M'][i % 5],
      committee: i % 6 === 0 ? 'Logistics IC' : '', dietary: ['', '', 'Vegetarian', 'Halal', ''][i % 5], languages: ['English, Mandarin', 'English, Malay', 'English, Tamil', 'English'][i % 4],
      emergencyRelation: ['Mother', 'Father', 'Sibling', 'Guardian'][i % 4], emergencyPhone: `+65 8${String(2000000 + i * 51113).slice(-7)}`,
    },
  });
  call('acknowledgeGuide', {}, v.token);
  return { ...v, name, i };
});
// Four of them are regulars, each with a fixed trainee (Mock Trainee 11 to 14).
extra.slice(0, 4).forEach((v, k) => {
  call('setVolunteerType', { userId: v.user.userId, volunteerType: 'regular' }, admin.token);
  call('setStandingPairing', { userId: v.user.userId, addTraineeId: `T-${String(11 + k).padStart(4, '0')}` }, admin.token);
});
// Most say they're coming to the next two sessions, so the pairing board is busy.
const home = call('adminHome', {}, admin.token);
const sessions = home.sessions.filter((x) => x.date > home.today && x.status !== 'cancelled').slice(0, 2);
sessions.forEach((x) => call('updateSession', { sessionId: x.sessionId, capacity: 0 }, admin.token)); // 0 = no limit
extra.forEach((v) => {
  sessions.forEach((x, n) => { if ((v.i + n) % 5 !== 4) call('bookSession', { sessionId: x.sessionId }, v.token); });
});
const book = rt.tab('demo-sheet', 'Volunteers').getParent ? rt.tab('demo-sheet', 'Volunteers').getParent() : null;
const sheets = (book ? book.getSheets() : []).map((sh) => ({ name: sh.getName(), hidden: sh.isSheetHidden ? sh.isSheetHidden() : false, values: sh.getDataRange().getValues() }));
process.stdout.write(JSON.stringify(sheets));
