#!/usr/bin/env node
/**
 * Load test for a deployed MINDS Volunteer app (Exp): many volunteers and admins at once.
 *
 *   cd volunteer-app
 *   node dev/load-test.mjs --url https://script.google.com/macros/s/…/exec
 *   node dev/load-test.mjs --url … --volunteers 100 --admins 10 --minutes 3
 *
 * Uses the mock Exp database's accounts (dev/make-exp-database.py): volunteers sign in with
 * VolunteerDemo123 (several sessions share an account when there are more volunteers than
 * accounts), admins with admin@example.com / AdminDemo123. Options: --volunteer-emails a,b,c, --admin-email,
 * --admin-password, --volunteer-password, --session <Session ID>, --poll <seconds> (5).
 *
 * What it does:
 *   - volunteers sign in (spread over 30 s), then open Home, the guide and their sessions every
 *     5–20 seconds, like people using the app;
 *   - admins keep one session's pairing board open, checking for changes every --poll seconds
 *     (as the app does), and each one pairs a volunteer with a trainee every 20–40 seconds, then
 *     undoes it. Each admin uses its own volunteer and trainee, so they don't clash;
 *   - it measures how long requests take, how many fail or were refused as "busy" (and retried),
 *     and how long each admin's change takes to show on every other admin's board.
 * At the end it removes every pairing it added, so the data is as before.
 * The results are printed and saved to load-test-results.json.
 */

import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((out, a, i, all) => {
  if (a.startsWith('--')) out.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return out;
}, []));
const URL = args.url;
if (!URL) { console.error('Usage: node dev/load-test.mjs --url <the app\'s /exec URL> [--volunteers 100] [--admins 10] [--minutes 3]'); process.exit(1); }
const VOLUNTEERS = Number(args.volunteers || 100);
const ADMINS = Number(args.admins || 10);
const MINUTES = Number(args.minutes || 3);
const POLL_S = Number(args.poll || 5);
const ADMIN = { email: args['admin-email'] || 'admin@example.com', password: args['admin-password'] || 'AdminDemo123' };
const VOL_PASSWORD = args['volunteer-password'] || 'VolunteerDemo123';
const FIRST = ['Aisha', 'Benjamin', 'Chloe', 'Daniel', 'Ethan', 'Farah', 'Grace', 'Hafiz', 'Isabel', 'Jun Wei', 'Kavya', 'Lucas',
  'Mei Ling', 'Nathan', 'Olivia', 'Priya', 'Qi Xuan', 'Rahul', 'Siti', 'Timothy', 'Umairah', 'Vanessa', 'Wei Jie', 'Xin Yi',
  'Yusuf', 'Zoe', 'Arjun', 'Bryan', 'Clara', 'Darren'];
const LAST = ['Tan', 'Lim', 'Ng', 'Wong', 'Koh', 'Rahman', 'Lee', 'Ismail', 'Goh', 'Chua', 'Nair', 'Teo', 'Ong', 'Chan', 'Yeo',
  'Menon', 'Ho', 'Kumar', 'Aziz', 'Low', 'Hassan', 'Seah', 'Toh', 'Liew', 'Abdullah', 'Quek', 'Pillai', 'Sim', 'Foo', 'Heng'];
const VOL_EMAILS = args['volunteer-emails'] ? args['volunteer-emails'].split(',') : ['volunteer@example.com', 'sam@example.com',
  ...FIRST.map((f, i) => `${f.toLowerCase().replace(/\s+/g, '')}.${LAST[i].toLowerCase()}@example.com`)];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const times = {};
const errors = {};
let busyRetries = 0;
const propagation = [];
const started = Date.now();
const endAt = started + MINUTES * 60000;
const note = (action, ms) => { (times[action] = times[action] || []).push(ms); };
const fail = (action, code) => { const k = `${action}: ${code}`; errors[k] = (errors[k] || 0) + 1; };

/** One request, as the app sends it; "busy" refusals are retried like the app does (up to 3 times). */
async function api(action, payload = {}, token = '') {
  const t0 = performance.now();
  for (let attempt = 0; ; attempt += 1) {
    let busy = false;
    let body = null;
    try {
      const res = await fetch(URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token, payload }), redirect: 'follow',
      });
      const text = await res.text();
      try { body = JSON.parse(text); } catch { busy = res.status === 429 || /too many|simultaneous|invoked too many|try again later/i.test(text.slice(0, 4000)); if (!busy) { fail(action, `not JSON (HTTP ${res.status})`); return null; } }
      if (body && !body.ok && body.error && body.error.code === 'BUSY') busy = true;
    } catch (e) {
      fail(action, `network: ${e.cause && e.cause.code ? e.cause.code : e.message}`);
      return null;
    }
    if (busy && attempt < 3) { busyRetries += 1; await sleep(700 * 2 ** attempt + Math.random() * 400); continue; }
    note(action, performance.now() - t0);
    if (busy) { fail(action, 'BUSY after 3 retries'); return null; }
    if (!body.ok) { fail(action, body.error ? body.error.code : 'error'); return null; }
    return body.data;
  }
}

async function volunteer(i) {
  await sleep(rand(0, 30000)); // people don't all open the app in the same second
  const login = await api('login', { email: VOL_EMAILS[i % VOL_EMAILS.length], password: VOL_PASSWORD });
  if (!login) return;
  while (Date.now() < endAt) {
    const r = Math.random();
    if (r < 0.6) await api('volunteerHome', {}, login.token);
    else if (r < 0.8) await api('me', {}, login.token);
    else await api('guide', {}, login.token);
    await sleep(rand(5000, 20000));
  }
}

// Changes made by admins, and which other admins have seen each one.
const changes = [];

function seeBoard(d, me, state) {
  if (!d) return;
  const now = Date.now();
  changes.forEach((c) => {
    if (c.by === me || c.seen.has(me) || c.doneAt === null) return;
    const b = (d.bookings || []).find((x) => x.bookingId === c.bookingId);
    const has = Boolean(b && (b.trainees || []).some((t) => t.id === c.traineeId));
    if (has === c.added) { c.seen.add(me); propagation.push(now - c.doneAt); }
  });
  state.board = d;
}

async function adminBoard(token, sessionId, me, state) {
  seeBoard(await api('sessionDetail', { sessionId }, token), me, state);
}

async function admin(i, sessionId, plan) {
  await sleep(rand(0, 5000));
  const login = await api('login', ADMIN);
  if (!login) return;
  const token = login.token;
  const state = {};
  await api('adminHome', {}, token);
  await adminBoard(token, sessionId, i, state);
  let version = (await api('changes', {}, token) || {}).version;
  let nextChange = Date.now() + rand(20000, 40000);
  let paired = false;
  while (Date.now() < endAt) {
    await sleep(POLL_S * 1000);
    // As the app does: the check sends the new board when something changed (one request).
    const res = await api('changes', { since: version, watch: { action: 'sessionDetail', payload: { sessionId } } }, token) || {};
    if (res.version && res.version !== version) {
      version = res.version;
      if (res.data) seeBoard(res.data, i, state); else await adminBoard(token, sessionId, i, state);
    }
    if (plan && Date.now() >= nextChange) {
      const change = { by: i, bookingId: plan.bookingId, traineeId: plan.traineeId, added: !paired, doneAt: null, seen: new Set() };
      changes.push(change);
      const ok = await api('updateBooking', paired ? { bookingId: plan.bookingId, removeTraineeId: plan.traineeId } : { bookingId: plan.bookingId, addTraineeId: plan.traineeId }, token);
      if (ok) { change.doneAt = Date.now(); paired = !paired; if (ok.detail) seeBoard(ok.detail, i, state); } else changes.pop();
      nextChange = Date.now() + rand(20000, 40000);
    }
  }
  if (plan && paired) await api('updateBooking', { bookingId: plan.bookingId, removeTraineeId: plan.traineeId }, token); // put it back
}

const pct = (list, p) => { if (!list.length) return null; const s = [...list].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const sec = (ms) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`);

(async () => {
  console.log(`Load test: ${VOLUNTEERS} volunteers and ${ADMINS} admins for ${MINUTES} min against ${URL}`);
  const boss = await api('login', ADMIN);
  if (!boss) { console.error('Could not sign in as the admin. Check --admin-email / --admin-password.'); process.exit(1); }
  // The session the admins pair on: --session, or the next session with enough people coming.
  let sessionId = args.session;
  let detail = null;
  if (!sessionId) {
    const home = await api('adminHome', {}, boss.token);
    for (const s of (home.sessions || []).filter((x) => x.date >= home.today)) {
      const d = await api('sessionDetail', { sessionId: s.sessionId }, boss.token);
      if (d && (d.bookings || []).length >= ADMINS) { sessionId = s.sessionId; detail = d; break; }
    }
  } else detail = await api('sessionDetail', { sessionId }, boss.token);
  if (!sessionId || !detail) { console.error('No upcoming session with enough people coming. Pass --session <Session ID>.'); process.exit(1); }
  const trainees = (await api('listTrainees', {}, boss.token)).trainees.map((t) => t.id);
  const taken = new Set((detail.bookings || []).flatMap((b) => (b.trainees || []).map((t) => t.id)));
  const free = trainees.filter((id) => !taken.has(id)).reverse(); // trainees not paired in this session
  const plans = (detail.bookings || []).slice(0, ADMINS).map((b, i) => (free[i] ? { bookingId: b.bookingId, traineeId: free[i] } : null));
  console.log(`Pairing on "${detail.session ? detail.session.title : sessionId}" (${(detail.bookings || []).length} coming). Running…`);

  await Promise.all([
    ...Array.from({ length: VOLUNTEERS }, (_, i) => volunteer(i)),
    ...Array.from({ length: ADMINS }, (_, i) => admin(i, sessionId, plans[i])),
  ]);

  const rows = Object.keys(times).sort().map((a) => ({ action: a, requests: times[a].length, median: pct(times[a], 50), p95: pct(times[a], 95), slowest: Math.max(...times[a]) }));
  const total = rows.reduce((n, r) => n + r.requests, 0);
  const failed = Object.values(errors).reduce((n, x) => n + x, 0);
  console.log('\nRequest times (including any busy retries):');
  console.table(rows.map((r) => ({ action: r.action, requests: r.requests, median: sec(r.median), '95%': sec(r.p95), slowest: sec(r.slowest) })));
  console.log(`Requests: ${total}, failed: ${failed} (${total ? ((failed / total) * 100).toFixed(1) : 0}%), refused as busy and retried: ${busyRetries}`);
  if (failed) console.log('Failures:', errors);
  const expected = changes.filter((c) => c.doneAt !== null).length * Math.max(0, ADMINS - 1);
  console.log(`\nPairing changes: ${changes.filter((c) => c.doneAt !== null).length}. Seen on other admins' boards: ${propagation.length} of ${expected}`);
  console.log(`Time for a change to show on another admin's board: median ${sec(pct(propagation, 50))}, 95% ${sec(pct(propagation, 95))}, slowest ${sec(propagation.length ? Math.max(...propagation) : null)}`);
  fs.writeFileSync('load-test-results.json', JSON.stringify({ url: URL, volunteers: VOLUNTEERS, admins: ADMINS, minutes: MINUTES, pollSeconds: POLL_S, rows, errors, busyRetries, propagation }, null, 2));
  console.log('\nSaved to load-test-results.json');
})();
