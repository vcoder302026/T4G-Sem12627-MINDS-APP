// Admin overview: headline numbers (new and regular volunteers, hours,
// unpaired volunteers, no-shows…) and what's coming up. On phones it starts
// with the admin menu as tiles; on computers the sidebar has the menu.

import { call } from '../../api.js';
import { el, fmtTimes, mount } from '../../ui.js';
import { dateRangeText, day, hours, icon, load, pageHead, panel, plural, stat, statGrid, table } from '../kit.js';

const TILES = [
  ['admin/sessions', 'Sessions & pairing', 'calendar'],
  ['admin/scan', 'Scan & clock in', 'scan'],
  ['admin/pairs', 'Pairing list', 'pair'],
  ['admin/volunteers', 'Volunteers', 'users'],
  ['admin/trainees', 'Trainees', 'heart'],
  ['admin/attendance', 'Attendance & no-shows', 'clock'],
  ['admin/hours', 'Volunteer hours', 'check'],
  ['admin/review', 'Notes to review', 'inbox'],
  ['admin/guide', 'Guide & venues', 'book'],
  ['admin/fundraising', 'Fundraising', 'coins'],
  ['admin/outings', 'Outings', 'bus'],
  ['admin/trips', 'Overseas trips', 'plane'],
  ['admin/visits', 'House visits', 'home'],
  ['admin/settings', 'Settings', 'settings'],
  ['admin/log', 'Activity log', 'history'],
];

export function renderOverview(root, app, ctx) {
  const host = el('div', {});
  const tiles = el('div', { class: 'mb-6 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:hidden' }, TILES.map(([href, label, ic]) => el('a', {
    href: `#/${href}`, class: 'card flex flex-col items-center gap-1.5 p-3 text-center text-xs font-bold text-slate-700 hover:border-indigo-300 dark:text-neutral-200',
  }, el('span', { class: 'flex size-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300' }, icon(ic, 'size-5')), label)));
  mount(root, pageHead('Admin overview', `Admin is open for ${app.user.name} until ${app.adminUntil}. Everything here comes from the same Google Sheet.`), tiles, host);
  return load(host, ctx, () => call('dashboardOverview'), (d) => {
    const c = d.counts;
    mount(host,
      statGrid(
        stat('Active volunteers', c.volunteers, { tone: 'indigo', sub: `${c.regularVolunteers} regular · ${c.newVolunteers} new`, href: '#/admin/volunteers' }),
        stat('New this month', c.newThisMonth, { tone: 'purple', sub: `Regular after ${d.regularAfter} sessions`, href: '#/admin/volunteers' }),
        stat('Need a trainee', c.unpairedThisWeek, { tone: c.unpairedThisWeek ? 'amber' : 'slate', sub: 'Coming in the next 7 days, not paired', href: '#/admin/sessions' }),
        stat('No-shows this month', c.noShowsThisMonth, { tone: c.noShowsThisMonth ? 'red' : 'slate', href: '#/admin/attendance' }),
        stat('Hours this month', hours(c.hoursThisMonth), { tone: 'emerald', sub: `${hours(c.hoursTotal)} in total`, href: '#/admin/hours' }),
        stat('Sessions this month', c.sessionsThisMonth, { sub: c.onSiteNow ? `${c.onSiteNow} clocked in now` : 'No one clocked in now', href: '#/admin/sessions' })),
      el('div', { class: 'mt-3' }, statGrid(
        stat('Active trainees', c.trainees, { tone: 'purple', href: '#/admin/trainees' }),
        stat('Notes to review', c.reviewCount, { tone: c.reviewCount ? 'amber' : 'slate', href: '#/admin/review' }),
        stat('Unpaid orders', c.unpaidOrders, { tone: c.unpaidOrders ? 'amber' : 'slate', sub: plural(c.openFundraisers, 'open fundraiser'), href: '#/admin/fundraising' }),
        stat('House visits this month', c.visitsThisMonth, { href: '#/admin/visits' }))),

      el('div', { class: 'mt-6 grid gap-6 lg:grid-cols-2' },
        el('div', { class: 'lg:col-span-2' }, panel('Upcoming sessions', el('a', { href: '#/admin/sessions', class: 'link text-sm' }, 'Sessions & pairing'),
          table([
            { label: 'Session', cell: (s) => el('span', {}, el('span', { class: 'block font-bold' }, s.title), el('span', { class: 'block text-xs muted' }, [s.type !== 'Volunteer session' ? s.type : '', s.venue].filter(Boolean).join(' · '))) },
            { label: 'When', cell: (s) => el('span', {}, el('span', { class: 'block' }, day(s.date)), el('span', { class: 'block text-xs muted' }, fmtTimes(s))), class: 'whitespace-nowrap' },
            { label: 'Coming', cell: (s) => (s.capacity ? `${s.stats.coming} of ${s.capacity}` : String(s.stats.coming)), class: 'text-right' },
            { label: 'Need a trainee', cell: (s) => (s.stats.unpaired ? el('span', { class: 'font-bold text-amber-600 dark:text-amber-400' }, String(s.stats.unpaired)) : '0'), class: 'text-right' },
          ], d.upcomingSessions, { empty: 'No sessions coming up. Add one under Sessions & pairing.', href: (s) => `#/admin/session/${s.sessionId}` }))),
        panel('Upcoming outings', el('a', { href: '#/admin/outings', class: 'link text-sm' }, 'All outings'),
          table([
            { label: 'Outing', cell: (o) => el('span', {}, el('span', { class: 'block font-bold' }, o.title), el('span', { class: 'block text-xs muted' }, o.location)) },
            { label: 'Date', cell: (o) => day(o.date), class: 'whitespace-nowrap' },
            { label: 'Trainees', cell: (o) => String(o.assigned), class: 'text-right' },
          ], d.upcomingOutings, { empty: 'No outings planned.', href: (o) => `#/admin/outing/${o.outingId}` })),
        panel('Upcoming trips', el('a', { href: '#/admin/trips', class: 'link text-sm' }, 'All trips'),
          table([
            { label: 'Trip', cell: (t) => el('span', {}, el('span', { class: 'block font-bold' }, t.title), el('span', { class: 'block text-xs muted' }, t.destination)) },
            { label: 'Dates', cell: (t) => dateRangeText(t.startDate, t.endDate), class: 'whitespace-nowrap' },
            { label: 'Going', cell: (t) => String(t.participants), class: 'text-right' },
          ], d.upcomingTrips, { empty: 'No trips planned.', href: (t) => `#/admin/trip/${t.tripId}` }))));
  });
}
