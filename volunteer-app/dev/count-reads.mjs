#!/usr/bin/env node
/**
 * How many whole-tab reads each request makes (on Apps Script each costs roughly 0.5–1 s),
 * with the copies of the tabs off (before Version 4.3) and on. Uses the demo data.
 *   node dev/count-reads.mjs
 */
import { createDemoRuntime } from './mock-server.js';

const ACTIONS = [
  ['volunteerHome', 'volunteer'], ['me', 'volunteer'], ['guide', 'volunteer'], ['traineeInfo', 'regular'], ['changes', 'admin'],
  ['adminHome', 'admin'], ['sessionDetail', 'admin'], ['updateBooking', 'admin'],
];

function measure(cacheOn) {
  const rt = createDemoRuntime();
  rt.props.set('TABLE_CACHE', cacheOn ? 'on' : 'off');
  const admin = rt.call('login', { email: 'admin@example.com', password: 'AdminDemo123' }).data.token;
  const vol = rt.call('login', { email: 'volunteer@example.com', password: 'VolunteerDemo123' }).data.token;
  const regular = rt.call('login', { email: 'regular@example.com', password: 'RegularDemo123' }).data.token;
  const home = rt.call('adminHome', {}, admin).data;
  const sessionId = home.sessions.find((s) => s.date >= home.today).sessionId;
  const detail = rt.call('sessionDetail', { sessionId }, admin).data;
  const booking = detail.bookings[0];
  const taken = new Set(detail.bookings.flatMap((b) => (b.trainees || []).map((t) => t.id)));
  const trainee = rt.call('listTrainees', {}, admin).data.trainees.find((t) => !taken.has(t.id)).id;
  let add = true;
  const out = {};
  for (const [action, who] of ACTIONS) {
    const token = who === 'admin' ? admin : who === 'regular' ? regular : vol;
    const payload = action === 'traineeInfo' ? { traineeId: 'T-0001' } : action === 'sessionDetail' ? { sessionId }
      : action === 'updateBooking' ? (add ? { bookingId: booking.bookingId, addTraineeId: trainee } : { bookingId: booking.bookingId, removeTraineeId: trainee })
        : {};
    rt.call(action, payload, token); // warm up, as after the app has been used for a while
    if (action === 'updateBooking') { add = !add; payload.addTraineeId ? (delete payload.addTraineeId, payload.removeTraineeId = trainee) : (delete payload.removeTraineeId, payload.addTraineeId = trainee); }
    globalThis.__sheetReads = 0;
    const res = rt.call(action, payload, token);
    out[action] = res.ok ? globalThis.__sheetReads : `error ${res.error.code}`;
  }
  return out;
}

const before = measure(false);
const after = measure(true);
console.table(Object.keys(before).map((a) => ({ request: a, 'tab reads before': before[a], 'tab reads now': after[a] })));
