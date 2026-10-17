// Admin: Attendance (fix and add records, no-shows per volunteer) and the volunteer hours report.

import { call } from '../../api.js';
import { badge, el, fmtTimes, fuzzyFilter, labelled, mount, searchBox, todaySG, toast } from '../../ui.js';
import {
  day, downloadCsv, field, formModal, hours, icon, load, pageHead, panel, plural, row, selectField, stat, statGrid, table, time,
  toolbar, volunteerPicker,
} from '../kit.js';

const addDays = (d, n) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/** From/To date inputs that call onChange({ from, to }). */
function rangeInputs(range, onChange) {
  const from = el('input', { type: 'date', class: 'input py-2', value: range.from, 'aria-label': 'From date' });
  const to = el('input', { type: 'date', class: 'input py-2', value: range.to, 'aria-label': 'To date' });
  const fire = () => onChange({ from: from.value, to: to.value });
  from.addEventListener('change', fire);
  to.addEventListener('change', fire);
  return [labelled('From', from), labelled('To', to)];
}

function methodBadge(r) {
  if (r.method === 'Dashboard') return badge('Added on dashboard', 'purple');
  return badge(r.method || '—', r.method && r.method.startsWith('QR') ? 'indigo' : 'slate');
}

/* ---------------- attendance ---------------- */

export function renderAttendance(root, app, ctx) {
  const today = todaySG();
  let range = { from: addDays(today, -30), to: today };
  let data = null;
  let query = '';
  let sessionFilter = '';
  const host = el('div', {});
  const listHost = el('div', {});

  const editRecord = (r) => formModal(`Fix times: ${r.volunteerName}`, [
    el('p', { class: 'text-sm muted' }, `${r.sessionTitle}, ${day(r.date)}. Hours are worked out again from these times.`),
    row(field('clockIn', 'Clock in', { type: 'time', value: time(r.clockIn), required: true }),
      field('clockOut', 'Clock out', { type: 'time', value: time(r.clockOut), hint: r.date === today ? 'Leave blank if they are still there.' : undefined })),
  ], 'Save times', async (d) => {
    const res = await call('updateAttendance', { attendanceId: r.attendanceId, clockIn: d.clockIn, clockOut: d.clockOut });
    toast(res.message);
    refresh();
  });

  const addRecord = () => {
    const pastSessions = data.sessions.filter((s) => s.date <= today);
    if (!pastSessions.length) {
      toast('There are no sessions up to today in this date range. Change the dates first.', 'warn');
      return;
    }
    // Default to the latest session that has already ended (sessions are newest first).
    const nowHHMM = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const ended = pastSessions.find((s) => s.date < today || s.endTime <= nowHHMM) || pastSessions[0];
    formModal('Add attendance by hand', [
      el('p', { class: 'text-sm muted' }, 'For a volunteer who came but was never scanned. If they had not said they were coming, they are added as a walk-in.'),
      selectField('sessionId', 'Session', pastSessions.map((s) => ({ value: s.sessionId, label: `${s.date} · ${s.title} (${fmtTimes(s)})` })), ended.sessionId),
      volunteerPicker(data.volunteers),
      row(field('clockIn', 'Clock in', { type: 'time', required: true }), field('clockOut', 'Clock out', { type: 'time', required: true })),
    ], 'Add record', async (d) => {
      const res = await call('addAttendance', d);
      toast(res.message);
      refresh();
    });
  };

  const drawList = () => {
    if (!data) return;
    let rows = sessionFilter ? data.records.filter((r) => r.sessionId === sessionFilter) : data.records;
    rows = fuzzyFilter(rows, query, (r) => [r.volunteerName, r.sessionTitle, r.venue]);
    mount(listHost, table([
      { label: 'Date', cell: (r) => day(r.date), class: 'whitespace-nowrap' },
      { label: 'Session', cell: (r) => el('span', {}, el('span', { class: 'block font-bold' }, r.sessionTitle), el('span', { class: 'block text-xs muted' }, r.venue)) },
      { label: 'Volunteer', cell: (r) => el('a', { href: `#/admin/volunteer/${r.userId}`, class: 'link' }, r.volunteerName) },
      { label: 'In', cell: (r) => time(r.clockIn) },
      { label: 'Out', cell: (r) => time(r.clockOut) },
      { label: 'Hours', cell: (r) => (r.hours === null ? badge('In progress', 'amber') : hours(r.hours)), class: 'whitespace-nowrap' },
      { label: 'How', cell: (r) => el('span', {}, methodBadge(r), r.editedBy ? el('span', { class: 'mt-1 block text-xs muted' }, `Edited by ${r.editedBy}`) : null) },
      { label: '', cell: (r) => el('button', { class: 'btn btn-secondary btn-sm', onclick: () => editRecord(r) }, icon('pencil', 'size-4'), 'Fix'), class: 'text-right' },
    ], rows, { empty: data.records.length ? 'No records match.' : 'No attendance in this date range.' }));
  };

  const draw = (d) => {
    data = d;
    const sessionSelect = el('select', { class: 'input py-2', 'aria-label': 'Session' },
      el('option', { value: '' }, 'All sessions'),
      d.sessions.map((s) => el('option', { value: s.sessionId, selected: s.sessionId === sessionFilter }, `${s.date} · ${s.title}`)));
    sessionSelect.addEventListener('change', () => { sessionFilter = sessionSelect.value; drawList(); });
    mount(host,
      statGrid(
        stat('Records', d.totals.records),
        stat('Completed', d.totals.completed, { tone: 'emerald' }),
        stat('In progress', d.totals.inProgress, { tone: d.totals.inProgress ? 'amber' : 'slate', sub: 'Not counted in hours yet' }),
        stat('Hours', hours(d.totals.hours), { tone: 'indigo' }),
        stat('No-shows', d.totals.noShows, { tone: d.totals.noShows ? 'red' : 'slate', sub: 'Said they were coming, never clocked in' })),
      el('div', { class: 'mt-6' }, panel('Attendance records',
        el('button', { class: 'btn btn-primary btn-sm', onclick: addRecord }, icon('plus', 'size-4'), 'Add by hand'),
        toolbar(...rangeInputs(range, (r) => { range = r; refresh(); }),
          labelled('Session', sessionSelect),
          el('div', { class: 'min-w-56 flex-1' }, labelled('Search', searchBox('Volunteer, session or venue', (q) => { query = q; drawList(); })))),
        listHost)),
      el('div', { class: 'mt-6 grid gap-6 lg:grid-cols-2' },
        panel(`No-shows per volunteer (${d.noShowsByVolunteer.length})`, null, table([
          { label: 'Volunteer', cell: (v) => el('a', { href: `#/admin/volunteer/${v.userId}`, class: 'link' }, v.volunteerName) },
          { label: 'In this range', cell: (v) => badge(String(v.count), 'red'), class: 'text-right' },
          { label: 'All time', cell: (v) => String(v.total), class: 'text-right' },
          { label: 'Last', cell: (v) => day(v.last), class: 'whitespace-nowrap' },
        ], d.noShowsByVolunteer, { empty: 'No no-shows in this date range.' })),
        panel('Missed sessions', null, table([
          { label: 'Date', cell: (x) => day(x.date), class: 'whitespace-nowrap' },
          { label: 'Session', cell: (x) => x.sessionTitle },
          { label: 'Volunteer', cell: (x) => el('a', { href: `#/admin/volunteer/${x.userId}`, class: 'link' }, x.volunteerName) },
        ], d.noShows, { empty: 'Everyone who said they were coming turned up.' }))));
    drawList();
  };

  const refresh = () => load(host, ctx, () => call('listAttendance', range), draw);
  mount(root, pageHead('Attendance & no-shows', 'Every clock-in and clock-out. Fix a missed scan, add someone who was never scanned, and see who said they were coming but did not.'), host);
  return refresh();
}

/* ---------------- hours report ---------------- */

export function renderHours(root, app, ctx) {
  const today = todaySG();
  let range = { from: `${today.slice(0, 4)}-01-01`, to: today };
  let data = null;
  let query = '';
  const host = el('div', {});
  const listHost = el('div', {});
  const rangeName = () => [range.from || 'start', range.to || 'today'].join('_to_');

  const exportSummary = () => downloadCsv(`volunteer-hours_${rangeName()}.csv`,
    ['Name', 'Email', 'Phone', 'Type', 'Status', 'Sessions', 'Hours', 'No-shows', 'First session', 'Last session'],
    data.volunteers.map((v) => [v.name, v.email, v.phone, v.type, v.status, v.sessions, v.hours, v.noShows, v.firstDate, v.lastDate]));
  const exportDetail = () => downloadCsv(`attendance-detail_${rangeName()}.csv`,
    ['Date', 'Volunteer', 'Session', 'Venue', 'Clock in', 'Clock out', 'Hours', 'Method', 'Edited by'],
    data.records.map((r) => [r.date, r.volunteerName, r.sessionTitle, r.venue, time(r.clockIn), time(r.clockOut), r.hours, r.method, r.editedBy]));

  const drawList = () => {
    if (!data) return;
    const rows = fuzzyFilter(data.volunteers, query, (v) => [v.name, v.email, v.phone]);
    mount(listHost, table([
      { label: 'Volunteer', cell: (v) => el('span', {}, el('span', { class: 'block font-bold' }, v.name), el('span', { class: 'block text-xs muted' }, v.email)) },
      { label: 'Sessions', cell: (v) => String(v.sessions), class: 'text-right' },
      { label: 'Hours', cell: (v) => el('span', { class: 'font-extrabold text-indigo-600 dark:text-indigo-400' }, hours(v.hours)), class: 'text-right whitespace-nowrap' },
      { label: 'No-shows', cell: (v) => (v.noShows ? badge(String(v.noShows), 'red') : '0'), class: 'text-right' },
      { label: 'First', cell: (v) => day(v.firstDate), class: 'whitespace-nowrap' },
      { label: 'Last', cell: (v) => day(v.lastDate), class: 'whitespace-nowrap' },
      { label: '', cell: (v) => (v.status === 'inactive' ? badge('Deactivated', 'red') : '') },
    ], rows, { empty: data.volunteers.length ? 'No one matches that search.' : 'No completed hours in this date range.', href: (v) => `#/admin/volunteer/${v.userId}` }));
  };

  const draw = (d) => {
    data = d;
    const csv = !d.records.length ? null : [
      el('button', { class: 'btn btn-secondary btn-sm', onclick: exportSummary }, icon('download', 'size-4'), 'Export totals (CSV)'),
      el('button', { class: 'btn btn-secondary btn-sm', onclick: exportDetail }, icon('download', 'size-4'), 'Export every record (CSV)'),
    ];
    mount(host,
      statGrid(
        stat('Volunteers with hours', d.totals.volunteers, { tone: 'indigo' }),
        stat('Sessions completed', d.totals.sessions),
        stat('Total hours', hours(d.totals.hours), { tone: 'emerald' })),
      el('div', { class: 'mt-6' }, panel(`Hours per volunteer${d.from || d.to ? '' : ' (all time)'}`, csv,
        toolbar(...rangeInputs(range, (r) => { range = r; refresh(); }),
          el('div', { class: 'flex gap-2' },
            el('button', { class: 'btn btn-secondary btn-sm', onclick: () => { range = { from: `${today.slice(0, 7)}-01`, to: today }; refresh(); } }, 'This month'),
            el('button', { class: 'btn btn-secondary btn-sm', onclick: () => { range = { from: `${today.slice(0, 4)}-01-01`, to: today }; refresh(); } }, 'This year'),
            el('button', { class: 'btn btn-secondary btn-sm', onclick: () => { range = { from: '', to: '' }; refresh(); } }, 'All time')),
          el('div', { class: 'min-w-56 flex-1' }, labelled('Search', searchBox('Name, email or phone', (q) => { query = q; drawList(); })))),
        listHost)),
      el('p', { class: 'mt-3 text-xs muted' }, `Only completed records count. ${plural(d.records.length, 'record')} in this range.`));
    drawList();
  };

  const refresh = () => load(host, ctx, () => call('hoursReport', range), draw);
  mount(root, pageHead('Volunteer hours', 'Completed hours per volunteer for any date range, ready to export for certificates and reports.'), host);
  return refresh();
}
