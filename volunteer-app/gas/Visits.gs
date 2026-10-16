/**
 * Visits.gs — staff dashboard: house visit records.
 *
 * Visit history is add-only: a record is never edited or removed, so the
 * history stays a true account of each visit. Newest visits are listed first.
 */

const VISIT_OBSERVATIONS = ['family', 'dailyLiving', 'social', 'health'];

function visitOut_(v, names) {
  return {
    visitId: v.visitId,
    traineeId: String(v.traineeId),
    traineeName: names.trainees[String(v.traineeId)] || v.traineeName,
    userId: v.userId,
    volunteerName: names.users[v.userId] || v.volunteerName,
    date: v.date,
    family: v.family || '',
    dailyLiving: v.dailyLiving || '',
    social: v.social || '',
    health: v.health || '',
    followUp: v.followUp || '',
    createdBy: v.createdBy || '',
    createdAt: v.createdAt || '',
  };
}

/** All visits (or one trainee's), newest first. */
function listVisits_(p) {
  onlyFields_(p, ['traineeId']);
  const traineeId = p.traineeId ? str_(p.traineeId, 'Trainee', { max: 40 }) : '';
  const names = nameMaps_();
  const rows = table_('houseVisits').filter((v) => v.visitId && (!traineeId || String(v.traineeId) === traineeId));
  const visits = sortBy_(rows, (v) => `${v.date}|${v.createdAt}|${String(v._row).padStart(6, '0')}`).reverse().map((v) => visitOut_(v, names));
  return { visits, options: pickLists_() };
}

function createVisit_(p, admin) {
  onlyFields_(p, ['traineeId', 'userId', 'date'].concat(VISIT_OBSERVATIONS, ['followUp']));
  const trainee = traineeRef_(p.traineeId, 'Trainee');
  const user = volunteerRef_(p.userId, 'Volunteer');
  const date = date_(p.date, 'Visit date');
  if (date > todayStr_()) throw err_.validation('The visit date cannot be in the future.');
  const labels = { family: 'Family', dailyLiving: 'Daily living', social: 'Social', health: 'Health', followUp: 'Follow-up' };
  const text = {};
  VISIT_OBSERVATIONS.concat(['followUp']).forEach((k) => { text[k] = str_(p[k], labels[k], { max: LIMITS.NOTES }); });
  if (!VISIT_OBSERVATIONS.some((k) => text[k])) throw err_.validation('Write at least one observation (family, daily living, social or health).');
  table_('houseVisits').insert(Object.assign({
    visitId: newId_('HV'), traineeId: String(trainee.id), traineeName: trainee.name,
    userId: user.userId, volunteerName: user.name, date,
    createdBy: admin.name, createdAt: fmtDateTime_(now_()),
  }, text));
  return Object.assign(listVisits_({}), { message: `Visit to ${trainee.name} recorded.` });
}
