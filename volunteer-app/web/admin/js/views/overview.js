// Section 1: Overview — headline numbers and what's coming up.

import { call } from '../../../js/api.js';
import { el, fmtTimes, mount } from '../../../js/ui.js';
import { dateRangeText, day, hours, load, pageHead, panel, plural, stat, statGrid, table } from '../kit.js';

export function renderOverview(root, app, ctx) {
  const host = el('div', {});
  mount(root, pageHead('Overview', `Signed in as ${app.user.name}. Everything here comes from the same Google Sheet as the phone app.`), host);
  return load(host, ctx, () => call('dashboardOverview'), (d) => {
    const c = d.counts;
    mount(host,
      statGrid(
        stat('Active volunteers', c.volunteers, { tone: 'indigo', sub: plural(c.leaders, 'leader'), href: '#/volunteers' }),
        stat('Active trainees', c.trainees, { tone: 'purple', href: '#/trainees' }),
        stat('Hours this month', hours(c.hoursThisMonth), { tone: 'emerald', sub: `${hours(c.hoursTotal)} in total`, href: '#/hours' }),
        stat('Sessions this month', c.sessionsThisMonth, { sub: c.onSiteNow ? `${c.onSiteNow} clocked in now` : 'No one clocked in now', href: '#/attendance' }),
        stat('Unpaid orders', c.unpaidOrders, { tone: c.unpaidOrders ? 'amber' : 'slate', sub: plural(c.openFundraisers, 'open fundraiser'), href: '#/fundraising' }),
        stat('House visits this month', c.visitsThisMonth, { href: '#/visits' })),

      c.pendingBookings || c.reviewCount
        ? el('div', { class: 'alert alert-info mt-4 flex flex-wrap items-center justify-between gap-3' },
          el('span', {}, [
            c.pendingBookings ? `${plural(c.pendingBookings, 'booking')} waiting for a leader to confirm` : '',
            c.reviewCount ? `${plural(c.reviewCount, 'volunteer note')} waiting for review` : '',
          ].filter(Boolean).join(' · ')),
          el('a', { href: app.phoneAppUrl, class: 'btn btn-secondary btn-sm' }, 'Open the phone app'))
        : null,

      el('div', { class: 'mt-6 grid gap-6 lg:grid-cols-2' },
        el('div', { class: 'lg:col-span-2' }, panel('Upcoming sessions', el('a', { href: '#/attendance', class: 'link text-sm' }, 'Attendance'),
          table([
            { label: 'Session', cell: (s) => el('span', {}, el('span', { class: 'block font-bold' }, s.title), el('span', { class: 'block text-xs muted' }, s.venue)) },
            { label: 'When', cell: (s) => el('span', {}, el('span', { class: 'block' }, day(s.date)), el('span', { class: 'block text-xs muted' }, fmtTimes(s))), class: 'whitespace-nowrap' },
            { label: 'Booked', cell: (s) => (s.capacity ? `${s.stats.booked}/${s.capacity}` : String(s.stats.booked)), class: 'text-right' },
          ], d.upcomingSessions, { empty: 'No sessions coming up. Leaders post them in the phone app.' }))),
        panel('Upcoming outings', el('a', { href: '#/outings', class: 'link text-sm' }, 'All outings'),
          table([
            { label: 'Outing', cell: (o) => el('span', {}, el('span', { class: 'block font-bold' }, o.title), el('span', { class: 'block text-xs muted' }, o.location)) },
            { label: 'Date', cell: (o) => day(o.date), class: 'whitespace-nowrap' },
            { label: 'Trainees', cell: (o) => String(o.assigned), class: 'text-right' },
          ], d.upcomingOutings, { empty: 'No outings planned.', href: (o) => `#/outing/${o.outingId}` })),
        panel('Upcoming trips', el('a', { href: '#/trips', class: 'link text-sm' }, 'All trips'),
          table([
            { label: 'Trip', cell: (t) => el('span', {}, el('span', { class: 'block font-bold' }, t.title), el('span', { class: 'block text-xs muted' }, t.destination)) },
            { label: 'Dates', cell: (t) => dateRangeText(t.startDate, t.endDate), class: 'whitespace-nowrap' },
            { label: 'Going', cell: (t) => String(t.participants), class: 'text-right' },
          ], d.upcomingTrips, { empty: 'No trips planned.', href: (t) => `#/trip/${t.tripId}` }))));
  });
}
