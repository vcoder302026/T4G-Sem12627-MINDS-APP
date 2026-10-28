// Admin → Dashboard: headline numbers, what needs attention and what's coming up.

import { call } from '../../../js/api.js';
import { el, fmtTimes, mount } from '../../../js/ui.js';
import { dateRangeText, day, hours, load, pageHead, panel, plural, stat, statGrid, table } from '../kit.js';

export function renderOverview(root, app, ctx) {
  const host = el('div', {});
  mount(root, pageHead('Dashboard', ''), host);
  return load(host, ctx, () => call('dashboardOverview'), (d) => {
    const c = d.counts;
    mount(host,
      statGrid(
        stat('New volunteers', c.newVolunteers, { tone: 'indigo', sub: `${plural(c.volunteers, 'volunteer')} in all, ${plural(c.admins, 'admin')}`, href: '#/volunteers' }),
        stat('Regular volunteers', c.regulars, { tone: 'emerald', href: '#/volunteers' }),
        stat('Active trainees', c.trainees, { tone: 'purple', sub: c.traineesWithoutRegular ? `${c.traineesWithoutRegular} without a regular` : 'All have a regular', href: '#/trainees' }),
        stat('Hours this month', hours(c.hoursThisMonth), { tone: 'emerald', sub: `${hours(c.hoursTotal)} in total`, href: '#/hours' }),
        stat('Sessions this month', c.sessionsThisMonth, { sub: c.onSiteNow ? `${c.onSiteNow} clocked in now` : 'No one clocked in now', href: '#/attendance' }),
        stat('To pair', c.unpairedUpcoming, { tone: c.unpairedUpcoming ? 'amber' : 'slate', sub: 'Volunteers coming soon without a trainee', href: '#/pairings' })),

      c.unpairedUpcoming || c.reviewCount
        ? el('div', { class: 'alert alert-info mt-4 flex flex-wrap items-center gap-3' },
          c.unpairedUpcoming ? el('a', { href: '#/pairings', class: 'link' }, `${plural(c.unpairedUpcoming, 'volunteer')} to pair`) : null,
          c.reviewCount ? el('a', { href: '#/review', class: 'link' }, `${plural(c.reviewCount, 'volunteer note')} to review`) : null)
        : null,

      el('div', { class: 'mt-6 grid gap-6 lg:grid-cols-2' },
        el('div', { class: 'lg:col-span-2' }, panel("Who's coming", el('a', { href: '#/today', class: 'link text-sm' }, 'All sessions'),
          table([
            { label: 'Session', cell: (s) => el('span', {}, el('span', { class: 'block font-bold' }, s.title), el('span', { class: 'block text-xs muted' }, s.venue)) },
            { label: 'When', cell: (s) => el('span', {}, el('span', { class: 'block' }, day(s.date)), el('span', { class: 'block text-xs muted' }, fmtTimes(s))), class: 'whitespace-nowrap' },
            { label: 'Coming', cell: (s) => (s.capacity ? `${s.stats.booked}/${s.capacity}` : String(s.stats.booked)), class: 'text-right' },
            { label: 'To pair', cell: (s) => (s.stats.unpaired ? el('a', { href: `#/pair/${s.sessionId}`, class: 'link' }, String(s.stats.unpaired)) : '0'), class: 'text-right' },
          ], d.upcomingSessions, { empty: 'No sessions coming up.', href: (s) => `#/session/${s.sessionId}` }))),
        panel('Upcoming outings (placeholder)', el('a', { href: '#/outings', class: 'link text-sm' }, 'All outings'),
          table([
            { label: 'Outing', cell: (o) => el('span', {}, el('span', { class: 'block font-bold' }, o.title), el('span', { class: 'block text-xs muted' }, o.location)) },
            { label: 'Date', cell: (o) => day(o.date), class: 'whitespace-nowrap' },
            { label: 'Trainees', cell: (o) => String(o.assigned), class: 'text-right' },
          ], d.upcomingOutings, { empty: 'No outings planned.', href: (o) => `#/outing/${o.outingId}` })),
        panel('Upcoming trips (placeholder)', el('a', { href: '#/trips', class: 'link text-sm' }, 'All trips'),
          table([
            { label: 'Trip', cell: (t) => el('span', {}, el('span', { class: 'block font-bold' }, t.title), el('span', { class: 'block text-xs muted' }, t.destination)) },
            { label: 'Dates', cell: (t) => dateRangeText(t.startDate, t.endDate), class: 'whitespace-nowrap' },
            { label: 'Going', cell: (t) => String(t.participants), class: 'text-right' },
          ], d.upcomingTrips, { empty: 'No trips planned.', href: (t) => `#/trip/${t.tripId}` }))));
  });
}
