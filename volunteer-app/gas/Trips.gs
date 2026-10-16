/**
 * Trips.gs — staff dashboard: overseas trips, participants, the logistics
 * checklist and expenses.
 *
 * When a trainee is registered for a trip, their medical and dietary notes
 * are copied onto the participant row. Later edits to the trainee's profile
 * do not change that copy, so each trip keeps what was agreed for it; staff
 * edit the trip copy on the trip page.
 */

const TRIP_STATUSES = ['planning', 'confirmed', 'done', 'cancelled'];
const PARTICIPANT_STATUSES = ['registered', 'confirmed', 'withdrawn'];

function tripOut_(t) {
  return {
    tripId: t.tripId,
    title: t.title,
    destination: t.destination || '',
    startDate: t.startDate,
    endDate: t.endDate,
    notes: t.notes || '',
    status: TRIP_STATUSES.indexOf(t.status) >= 0 ? t.status : 'planning',
  };
}

function participantOut_(x, names) {
  return {
    participantId: x.participantId,
    traineeId: String(x.traineeId),
    traineeName: names.trainees[String(x.traineeId)] || x.traineeName,
    userId: x.userId || '',
    volunteerName: x.userId ? names.users[x.userId] || x.volunteerName : '',
    status: PARTICIPANT_STATUSES.indexOf(x.status) >= 0 ? x.status : 'registered',
    medicalNotes: x.medicalNotes || '',
    dietaryNotes: x.dietaryNotes || '',
    notes: x.notes || '',
    registeredAt: x.registeredAt || '',
  };
}

function logisticsOut_(i) {
  return {
    itemId: i.itemId, description: i.description, dueDate: i.dueDate || '',
    status: i.status === 'done' ? 'done' : 'pending', doneBy: i.doneBy || '', doneAt: i.doneAt || '',
  };
}

function expenseOut_(e) {
  return { expenseId: e.expenseId, description: e.description, amountCents: toCents_(e.amount), date: e.date || '', paidBy: e.paidBy || '', createdBy: e.createdBy || '' };
}

function listTrips_() {
  const participants = table_('tripParticipants').rows();
  const logistics = table_('tripLogistics').rows();
  const expenses = table_('tripExpenses').rows();
  const trips = table_('trips').rows().filter((t) => t.tripId).map((t) => {
    const items = logistics.filter((i) => i.tripId === t.tripId);
    return Object.assign(tripOut_(t), {
      participants: participants.filter((x) => x.tripId === t.tripId && x.status !== 'withdrawn').length,
      logisticsDone: items.filter((i) => i.status === 'done').length,
      logisticsTotal: items.length,
      expensesCents: expenses.filter((e) => e.tripId === t.tripId).reduce((s, e) => s + toCents_(e.amount), 0),
    });
  });
  return { today: todayStr_(), trips: sortBy_(trips, (t) => t.startDate) };
}

function tripFields_(p, partial) {
  const out = {};
  if (!partial || has_(p, 'title')) out.title = str_(p.title, 'Trip name', { required: true });
  if (!partial || has_(p, 'destination')) out.destination = str_(p.destination, 'Destination', { required: true });
  if (!partial || has_(p, 'startDate')) out.startDate = date_(p.startDate, 'Start date');
  if (!partial || has_(p, 'endDate')) out.endDate = date_(p.endDate, 'End date');
  if (!partial || has_(p, 'notes')) out.notes = str_(p.notes, 'Notes', { max: LIMITS.NOTES });
  if (partial && has_(p, 'status')) out.status = oneOf_(p.status, 'Status', TRIP_STATUSES);
  return out;
}

const TRIP_FIELDS = ['title', 'destination', 'startDate', 'endDate', 'notes'];

function createTrip_(p, admin) {
  onlyFields_(p, TRIP_FIELDS);
  const fields = tripFields_(p, false);
  checkDateOrder_(fields.startDate, fields.endDate);
  const t = table_('trips').insert(Object.assign(fields, {
    tripId: newId_('TR'), status: 'planning', createdBy: admin.name, createdAt: fmtDateTime_(now_()),
  }));
  return Object.assign(tripDetail_({ tripId: t.tripId }), { message: `Created "${t.title}".` });
}

function updateTrip_(p) {
  onlyFields_(p, ['tripId', 'status'].concat(TRIP_FIELDS));
  requireChanges_(p, 'tripId');
  const { table, row } = rowById_('trips', 'tripId', p.tripId, 'Trip');
  const patch = tripFields_(p, true);
  checkDateOrder_(patch.startDate || row.startDate, patch.endDate || row.endDate);
  table.update(row, patch);
  if (patch.title) {
    const t = table_('tripParticipants');
    t.filter((x) => x.tripId === row.tripId).forEach((x) => t.update(x, { tripTitle: patch.title }));
  }
  return Object.assign(tripDetail_({ tripId: row.tripId }), { message: 'Trip saved.' });
}

function tripDetail_(p) {
  const { row: t } = rowById_('trips', 'tripId', p.tripId, 'Trip');
  const names = nameMaps_();
  const participants = sortBy_(table_('tripParticipants').filter((x) => x.tripId === t.tripId).map((x) => participantOut_(x, names)),
    (x) => `${x.status === 'withdrawn' ? 1 : 0}|${String(x.traineeName).toLowerCase()}`);
  const logistics = sortBy_(table_('tripLogistics').filter((i) => i.tripId === t.tripId),
    (i) => `${i.status === 'done' ? 1 : 0}|${i.dueDate || '9999'}|${i.createdAt}`).map(logisticsOut_);
  const expenses = sortBy_(table_('tripExpenses').filter((e) => e.tripId === t.tripId), (e) => `${e.date}|${e.createdAt}`).map(expenseOut_);
  const active = participants.filter((x) => x.status !== 'withdrawn');
  return {
    trip: tripOut_(t),
    participants,
    logistics,
    expenses,
    totals: {
      participants: active.length,
      confirmed: active.filter((x) => x.status === 'confirmed').length,
      unassigned: active.filter((x) => !x.userId).length,
      logisticsDone: logistics.filter((i) => i.status === 'done').length,
      logisticsTotal: logistics.length,
      expensesCents: expenses.reduce((s, e) => s + e.amountCents, 0),
    },
    options: pickLists_(),
  };
}

/** Registers a trainee for a trip and copies their medical and dietary notes. */
function addTripParticipant_(p, admin) {
  onlyFields_(p, ['tripId', 'traineeId', 'userId', 'notes']);
  const { row: t } = rowById_('trips', 'tripId', p.tripId, 'Trip');
  if (t.status === 'cancelled') throw err_.validation('This trip was cancelled.');
  const trainee = traineeRef_(p.traineeId, 'Trainee');
  const user = volunteerRef_(p.userId, 'Volunteer', { optional: true });
  const participants = table_('tripParticipants');
  const existing = participants.find((x) => x.tripId === t.tripId && String(x.traineeId) === String(trainee.id));
  if (existing) {
    throw err_.conflict(existing.status === 'withdrawn'
      ? `${trainee.name} was withdrawn from this trip. Change their status back instead.`
      : `${trainee.name} is already on this trip.`);
  }
  participants.insert(Object.assign({
    participantId: newId_('TP'), tripId: t.tripId, tripTitle: t.title,
    traineeId: String(trainee.id), traineeName: trainee.name,
    userId: user ? user.userId : '', volunteerName: user ? user.name : '',
    status: 'registered',
    medicalNotes: String(trainee.medicalNotes || ''),
    dietaryNotes: String(trainee.dietaryNotes || ''),
    notes: str_(p.notes, 'Notes', { max: LIMITS.NOTES }),
    registeredBy: admin.name, registeredAt: fmtDateTime_(now_()),
  }, stamp_(admin)));
  return Object.assign(tripDetail_({ tripId: t.tripId }), { message: `${trainee.name} registered.` });
}

/** Volunteer ('' = unassigned), status, and the trip's own notes and medical/dietary copy. */
function updateTripParticipant_(p, admin) {
  onlyFields_(p, ['participantId', 'userId', 'status', 'notes', 'medicalNotes', 'dietaryNotes']);
  requireChanges_(p, 'participantId');
  const { table, row } = rowById_('tripParticipants', 'participantId', p.participantId, 'Participant');
  const patch = stamp_(admin);
  if (has_(p, 'userId')) {
    const user = volunteerRef_(p.userId, 'Volunteer', { optional: true });
    Object.assign(patch, { userId: user ? user.userId : '', volunteerName: user ? user.name : '' });
  }
  if (has_(p, 'status')) patch.status = oneOf_(p.status, 'Status', PARTICIPANT_STATUSES);
  if (has_(p, 'notes')) patch.notes = str_(p.notes, 'Notes', { max: LIMITS.NOTES });
  if (has_(p, 'medicalNotes')) patch.medicalNotes = str_(p.medicalNotes, 'Medical notes', { max: LIMITS.NOTES });
  if (has_(p, 'dietaryNotes')) patch.dietaryNotes = str_(p.dietaryNotes, 'Dietary notes', { max: LIMITS.NOTES });
  table.update(row, patch);
  return Object.assign(tripDetail_({ tripId: row.tripId }), { message: 'Saved.' });
}

function addTripLogistics_(p, admin) {
  onlyFields_(p, ['tripId', 'description', 'dueDate']);
  const { row: t } = rowById_('trips', 'tripId', p.tripId, 'Trip');
  table_('tripLogistics').insert({
    itemId: newId_('TL'), tripId: t.tripId,
    description: str_(p.description, 'Checklist item', { required: true }),
    dueDate: date_(p.dueDate, 'Due date', { optional: true }),
    status: 'pending', createdBy: admin.name, createdAt: fmtDateTime_(now_()),
  });
  return Object.assign(tripDetail_({ tripId: t.tripId }), { message: 'Added to the checklist.' });
}

function updateTripLogistics_(p, admin) {
  onlyFields_(p, ['itemId', 'status']);
  const { table, row } = rowById_('tripLogistics', 'itemId', p.itemId, 'Checklist item');
  const status = oneOf_(p.status, 'Status', ['pending', 'done']);
  table.update(row, status === 'done'
    ? { status, doneBy: admin.name, doneAt: fmtDateTime_(now_()) }
    : { status, doneBy: '', doneAt: '' });
  return Object.assign(tripDetail_({ tripId: row.tripId }), { message: status === 'done' ? 'Marked done.' : 'Marked pending.' });
}

function addTripExpense_(p, admin) {
  onlyFields_(p, ['tripId', 'description', 'amount', 'date', 'paidBy']);
  const { row: t } = rowById_('trips', 'tripId', p.tripId, 'Trip');
  const amountCents = cents_(p.amount, 'Amount', { min: 1 });
  table_('tripExpenses').insert({
    expenseId: newId_('TE'), tripId: t.tripId,
    description: str_(p.description, 'Expense', { required: true }),
    amount: dollars_(amountCents),
    date: date_(p.date, 'Date', { optional: true }),
    paidBy: str_(p.paidBy, 'Paid by', { max: LIMITS.SHORT }),
    createdBy: admin.name, createdAt: fmtDateTime_(now_()),
  });
  return Object.assign(tripDetail_({ tripId: t.tripId }), { message: 'Expense added.' });
}
