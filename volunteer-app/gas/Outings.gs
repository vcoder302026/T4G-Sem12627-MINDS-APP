/**
 * Outings.gs — staff dashboard: outings, who looks after which trainee, and
 * the boarding check on the day.
 *
 * Each trainee can be assigned once per outing, to one volunteer, with
 * optional group and bus labels. "Boarded" is ticked on the day.
 */

function outingOut_(o) {
  return {
    outingId: o.outingId,
    title: o.title,
    date: o.date,
    startTime: o.startTime || '',
    location: o.location || '',
    notes: o.notes || '',
    status: ['done', 'cancelled'].indexOf(o.status) >= 0 ? o.status : 'planned',
  };
}

function assignmentOut_(a, names) {
  return {
    assignmentId: a.assignmentId,
    outingId: a.outingId,
    traineeId: String(a.traineeId),
    traineeName: names.trainees[String(a.traineeId)] || a.traineeName,
    userId: a.userId,
    volunteerName: names.users[a.userId] || a.volunteerName,
    group: a.group || '',
    bus: a.bus || '',
    boarded: a.boarded === 'Yes',
    boardedAt: a.boardedAt || '',
  };
}

function listOutings_() {
  const assignments = table_('outingAssignments').rows();
  const outings = table_('outings').rows().filter((o) => o.outingId).map((o) => {
    const mine = assignments.filter((a) => a.outingId === o.outingId);
    return Object.assign(outingOut_(o), { assigned: mine.length, boarded: mine.filter((a) => a.boarded === 'Yes').length });
  });
  return { today: todayStr_(), outings: sortBy_(outings, (o) => `${o.date} ${o.startTime}`) };
}

function outingFields_(p, partial) {
  const out = {};
  if (!partial || has_(p, 'title')) out.title = str_(p.title, 'Outing name', { required: true });
  if (!partial || has_(p, 'date')) out.date = date_(p.date, 'Date');
  if (!partial || has_(p, 'startTime')) out.startTime = time_(p.startTime, 'Start time', { optional: true });
  if (!partial || has_(p, 'location')) out.location = str_(p.location, 'Location', { required: true });
  if (!partial || has_(p, 'notes')) out.notes = str_(p.notes, 'Notes', { max: LIMITS.NOTES });
  if (partial && has_(p, 'status')) out.status = oneOf_(p.status, 'Status', ['planned', 'done', 'cancelled']);
  return out;
}

const OUTING_FIELDS = ['title', 'date', 'startTime', 'location', 'notes'];

function createOuting_(p, admin) {
  onlyFields_(p, OUTING_FIELDS);
  const o = table_('outings').insert(Object.assign(outingFields_(p, false), {
    outingId: newId_('OT'), status: 'planned', createdBy: admin.name, createdAt: fmtDateTime_(now_()),
  }));
  return Object.assign(outingDetail_({ outingId: o.outingId }), { message: `Created "${o.title}".` });
}

function updateOuting_(p) {
  onlyFields_(p, ['outingId', 'status'].concat(OUTING_FIELDS));
  requireChanges_(p, 'outingId');
  const { table, row } = rowById_('outings', 'outingId', p.outingId, 'Outing');
  const patch = outingFields_(p, true);
  table.update(row, patch);
  if (patch.title) {
    const t = table_('outingAssignments');
    t.filter((a) => a.outingId === row.outingId).forEach((a) => t.update(a, { outingTitle: patch.title }));
  }
  return Object.assign(outingDetail_({ outingId: row.outingId }), { message: 'Outing saved.' });
}

function outingDetail_(p) {
  const { row: o } = rowById_('outings', 'outingId', p.outingId, 'Outing');
  const names = nameMaps_();
  const assignments = sortBy_(table_('outingAssignments').filter((a) => a.outingId === o.outingId).map((a) => assignmentOut_(a, names)),
    (a) => `${a.group.toLowerCase()}|${a.bus.toLowerCase()}|${String(a.traineeName).toLowerCase()}`);
  return {
    outing: outingOut_(o),
    assignments,
    counts: { assigned: assignments.length, boarded: assignments.filter((a) => a.boarded).length },
    options: pickLists_(),
  };
}

function groupLabel_(value, label) {
  return str_(value, label, { max: 50 });
}

/** Assigns a trainee to a volunteer for this outing (once per trainee). */
function assignOutingTrainee_(p, admin) {
  onlyFields_(p, ['outingId', 'traineeId', 'userId', 'group', 'bus']);
  const { row: o } = rowById_('outings', 'outingId', p.outingId, 'Outing');
  if (o.status === 'cancelled') throw err_.validation('This outing was cancelled.');
  const trainee = traineeRef_(p.traineeId, 'Trainee');
  const user = volunteerRef_(p.userId, 'Volunteer');
  const assignments = table_('outingAssignments');
  if (assignments.find((a) => a.outingId === o.outingId && String(a.traineeId) === String(trainee.id))) {
    throw err_.conflict(`${trainee.name} is already assigned on this outing. Change their row instead.`);
  }
  assignments.insert(Object.assign({
    assignmentId: newId_('OA'), outingId: o.outingId, outingTitle: o.title,
    traineeId: String(trainee.id), traineeName: trainee.name, userId: user.userId, volunteerName: user.name,
    group: groupLabel_(p.group, 'Group'), bus: groupLabel_(p.bus, 'Bus'), boarded: '',
  }, stamp_(admin)));
  return Object.assign(outingDetail_({ outingId: o.outingId }), { message: `${trainee.name} is with ${user.name}.` });
}

/** Change the volunteer, group or bus, or tick boarded. */
function updateOutingAssignment_(p, admin) {
  onlyFields_(p, ['assignmentId', 'userId', 'group', 'bus', 'boarded']);
  requireChanges_(p, 'assignmentId');
  const { table, row } = rowById_('outingAssignments', 'assignmentId', p.assignmentId, 'Assignment');
  const patch = stamp_(admin);
  if (has_(p, 'userId')) {
    const user = volunteerRef_(p.userId, 'Volunteer');
    Object.assign(patch, { userId: user.userId, volunteerName: user.name });
  }
  if (has_(p, 'group')) patch.group = groupLabel_(p.group, 'Group');
  if (has_(p, 'bus')) patch.bus = groupLabel_(p.bus, 'Bus');
  if (has_(p, 'boarded')) {
    if (typeof p.boarded !== 'boolean') throw err_.validation('Boarded must be true or false.');
    Object.assign(patch, { boarded: p.boarded ? 'Yes' : '', boardedAt: p.boarded ? fmtDateTime_(now_()) : '' });
  }
  table.update(row, patch);
  return Object.assign(outingDetail_({ outingId: row.outingId }), { message: 'Saved.' });
}
