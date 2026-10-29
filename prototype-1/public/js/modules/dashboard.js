// Dashboard: module cards, directory links, counts, completed hours and
// upcoming outings and trips.

import { api } from '../api.js';
import {
  el,
  emptyState,
  errorNotice,
  formatDate,
  formatHours,
  loadingState,
} from '../ui.js';

const MODULES = [
  {
    href: '#/attendance',
    title: 'Attendance',
    description: 'Sessions, manual clock in/out and volunteer hours.',
  },
  {
    href: '#/fundraising',
    title: 'Fundraising',
    description: 'Products, orders, payment and collection status.',
  },
  {
    href: '#/outings',
    title: 'Outings',
    description: 'Trainee/volunteer assignments, groups, buses and boarding.',
  },
  {
    href: '#/trips',
    title: 'Overseas Trips',
    description: 'Participants, medical/dietary notes, logistics and expenses.',
  },
  {
    href: '#/visits',
    title: 'House Visits',
    description: 'Home visit observations with append-only history.',
  },
];

const DIRECTORIES = [
  {
    href: '#/volunteers',
    title: 'Volunteers',
    description: 'Shared volunteer directory.',
  },
  {
    href: '#/trainees',
    title: 'Trainees',
    description: 'Shared trainee directory with caregiver and support details.',
  },
];

export async function renderDashboard(view, { user, navigate }) {
  view.appendChild(el('h1', {}, 'Dashboard'));
  view.appendChild(el('p', { class: 'muted' }, `Signed in as ${user.name}. Local demo data only.`));

  view.replaceChildren(loadingState());
  let data;
  try {
    data = await api.get('/api/dashboard');
  } catch (err) {
    view.replaceChildren();
    view.appendChild(errorNotice(err));
    return;
  }

  view.replaceChildren(
    el('h1', {}, 'Dashboard'),
    el('p', { class: 'muted' }, `Signed in as ${user.name}. Local demo data only.`)
  );

  // module cards
  const moduleCards = el('div', { class: 'grid-cards' });
  for (const module of MODULES) {
    moduleCards.appendChild(
      el(
        'a',
        { class: 'module-card', href: module.href },
        el('h3', {}, module.title),
        el('p', {}, module.description)
      )
    );
  }
  view.appendChild(el('h2', {}, 'Modules'));
  view.appendChild(moduleCards);

  const directoryCards = el('div', { class: 'grid-cards' });
  for (const directory of DIRECTORIES) {
    directoryCards.appendChild(
      el(
        'a',
        { class: 'module-card', href: directory.href },
        el('h3', {}, directory.title),
        el('p', {}, directory.description)
      )
    );
  }
  view.appendChild(el('h2', {}, 'Directories'));
  view.appendChild(directoryCards);

  // counts
  const stats = [
    ['Volunteers', data.counts.volunteers],
    ['Trainees', data.counts.trainees],
    ['Attendance sessions', data.counts.attendanceSessions],
    ['Fundraisers', data.counts.fundraisers],
    ['Outings', data.counts.outings],
    ['Trips', data.counts.trips],
    ['House visits', data.counts.visits],
    ['Completed volunteer hours', formatHours(data.completedHours)],
  ];
  const statCards = el('div', { class: 'grid-cards' });
  for (const [label, value] of stats) {
    statCards.appendChild(
      el(
        'div',
        { class: 'stat-card' },
        el('div', { class: 'stat-value' }, String(value)),
        el('div', { class: 'stat-label' }, label)
      )
    );
  }
  view.appendChild(el('h2', {}, 'Overview'));
  view.appendChild(statCards);

  // upcoming
  view.appendChild(el('h2', {}, 'Upcoming outings'));
  if (data.upcomingOutings.length === 0) {
    view.appendChild(emptyState('No upcoming outings.'));
  } else {
    view.appendChild(
      el(
        'ul',
        {},
        ...data.upcomingOutings.map((outing) =>
          el(
            'li',
            {},
            el('a', { href: `#/outings/${outing.id}` }, outing.title),
            ` — ${formatDate(outing.date)}${outing.venue ? ` • ${outing.venue}` : ''}`
          )
        )
      )
    );
  }

  view.appendChild(el('h2', {}, 'Upcoming trips'));
  if (data.upcomingTrips.length === 0) {
    view.appendChild(emptyState('No upcoming trips.'));
  } else {
    view.appendChild(
      el(
        'ul',
        {},
        ...data.upcomingTrips.map((trip) =>
          el(
            'li',
            {},
            el('a', { href: `#/trips/${trip.id}` }, trip.title),
            ` — ${trip.destination} • ${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`
          )
        )
      )
    );
  }
}
