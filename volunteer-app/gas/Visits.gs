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
    sections: v.sections || [], // the House Visit Form's answers, by section
  };
}

/** All visits (or one trainee's), newest first. */
function listVisits_(p) {
  onlyFields_(p, ['traineeId']);
  const traineeId = p.traineeId ? str_(p.traineeId, 'Trainee', { max: 40 }) : '';
  const names = nameMaps_();
  const table = table_('houseVisits');
  const rows = table.filter((v) => v.visitId && (!traineeId || String(v.traineeId) === traineeId));
  const answers = visitAnswers_(table);
  const visits = sortBy_(rows, (v) => `${v.date}|${v.createdAt}|${String(v._row).padStart(6, '0')}`).reverse()
    .map((v) => visitOut_(Object.assign({}, v, { sections: answers(v) }), names));
  return { visits, options: pickLists_() };
}

function createVisit_(p, admin) {
  if (p && p.answers !== undefined) return createFormVisit_(p, admin); // the House Visit Form (below)
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

/* ---------------- the House Visit Form ---------------- */

/** How a question is answered: likert (1–5), date, project, text (one line) or textarea. */
function visitQuestionType_(header) {
  const h = String(header);
  if (/^select the .*(level|ability)/i.test(h)) return 'likert';
  if (/^(date of|date\b)/i.test(h.trim())) return 'date';
  if (/^project$/i.test(h.trim())) return 'project';
  return HOUSE_VISIT.shortAnswers.test(h.replace(/\(.*$/, '')) ? 'text' : 'textarea';
}

function likertEnds_(header) {
  const m = HOUSE_VISIT.likert.find((l) => new RegExp(l.match, 'i').test(header));
  return m ? { left: m.left, right: m.right } : { left: '1', right: '5' };
}

/** The form's questions: the trainee sheet's columns, in its sections (Map (Fixed) tab). */
function visitFormSections_() {
  if (DB_.cache.visitForm) return DB_.cache.visitForm;
  const table = traineeTable_();
  const skip = [normHeader_(table.header('id'))]
    .concat(HOUSE_VISIT.skipHeaders, CONFIG.TRAINEES.hiddenHeaders || [], Object.keys(CONFIG.TRAINEES.writeBack || {}).map((k) => CONFIG.TRAINEES.writeBack[k]))
    .map(normHeader_);
  const map = sectionMap_();
  const groups = {};
  table.allHeaders().forEach((h) => {
    if (skip.indexOf(h.norm) >= 0) return;
    const title = map.bySection[h.norm] || 'Other details';
    const type = visitQuestionType_(h.header);
    (groups[title] = groups[title] || []).push(Object.assign({ key: h.norm, header: h.header, index: h.index, type },
      type === 'likert' ? { likert: likertEnds_(h.header) } : {}));
  });
  const order = formSectionOrder_(map.order.filter((t) => groups[t]).concat(Object.keys(groups).filter((t) => map.order.indexOf(t) === -1)));
  DB_.cache.visitForm = order.map((title) => ({ title, fields: groups[title] }));
  return DB_.cache.visitForm;
}

/** A date cell as YYYY-MM-DD for the form (sheets often hold "1969-11-02 13:26:30" or "2 Nov 1969"). */
function formDate_(value) {
  const s = String(value || '').trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (iso) return iso[1];
  const d = s ? new Date(s) : null;
  return d && !isNaN(d.getTime()) ? Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd') : '';
}

/** Admin → House visits → New visit: the questions, prefilled with the trainee's current answers. */
function houseVisitForm_(p) {
  onlyFields_(p, ['traineeId']);
  const table = traineeTable_();
  const row = p.traineeId ? table.find((r) => String(r.id) === String(p.traineeId)) : null;
  if (p.traineeId && !row) throw err_.notFound('Trainee not found.');
  const projects = projectRows_().filter((x) => x.status !== 'archived').map((x) => x.name);
  const sections = visitFormSections_().map((s) => ({
    title: s.title,
    fields: s.fields.map((f) => {
      let value = row ? String(table.rawValue(row, f.index) || '') : '';
      if (f.type === 'date') value = /^date of visit/i.test(f.header.trim()) ? todayStr_() : formDate_(value); // a new visit is today
      if (f.type === 'likert' && !/^[1-5]$/.test(value)) value = '';
      const out = { key: f.key, label: f.header, type: f.type, value };
      if (f.likert) out.likert = f.likert;
      if (f.type === 'project') out.options = projects.concat(value && projects.indexOf(value) === -1 ? [value] : []);
      return out;
    }),
  }));
  return { trainee: row ? { id: String(row.id), name: row.name } : null, sections, options: pickLists_() };
}

const VISIT_BASE_KEYS_ = ['visitId', 'traineeId', 'traineeName', 'userId', 'volunteerName', 'date', 'family', 'dailyLiving', 'social', 'health', 'followUp', 'createdBy', 'createdAt'];

/**
 * Saves a House Visit Form: a new row in House Visits (one column per question;
 * history is add-only), and, unless updateTrainee is false, the changed answers
 * into the trainee's row in the trainee sheet, as a form response would.
 */
function createFormVisit_(p, admin) {
  onlyFields_(p, ['traineeId', 'answers', 'updateTrainee']);
  const trainee = traineeRef_(p.traineeId, 'Trainee');
  const a = obj_(p.answers, 'Answers');
  const fields = [];
  visitFormSections_().forEach((s) => s.fields.forEach((f) => fields.push(f)));
  const byKey = {};
  fields.forEach((f) => { byKey[f.key] = f; });
  Object.keys(a).forEach((k) => { if (!byKey[k]) throw err_.validation(`Unknown question "${k}".`); });
  const answers = {};
  fields.forEach((f) => {
    if (!Object.prototype.hasOwnProperty.call(a, f.key)) return;
    let v = str_(a[f.key], f.header.slice(0, 60), { max: LIMITS.NOTES });
    if (v && f.type === 'likert' && !/^[1-5]$/.test(v)) throw err_.validation(`${f.header.slice(0, 60)}: choose 1 to 5.`);
    if (v && f.type === 'date') v = date_(v, f.header.slice(0, 60));
    answers[f.key] = v;
  });
  if (!Object.keys(answers).some((k) => answers[k])) throw err_.validation('Fill in at least one answer.');
  const visitDateField = fields.find((f) => f.type === 'date' && /^date of visit/i.test(f.header.trim()));
  const date = (visitDateField && answers[visitDateField.key]) || todayStr_();
  if (date > todayStr_()) throw err_.validation('The visit date cannot be in the future.');

  // 1. The visit record: base columns, then one column per question (added as needed).
  const def = CONFIG.TABLES.houseVisits;
  const cols = Object.assign({}, def.columns);
  fields.forEach((f, i) => { cols[`q${i}`] = f.header; });
  ensureTab_(bookFor_(def), def.tab, Object.keys(cols).map((k) => cols[k]));
  const visits = new Table(bookFor_(def), def.tab, cols, [], 'app:houseVisits');
  const rec = { visitId: newId_('HV'), traineeId: String(trainee.id), traineeName: trainee.name, date, createdBy: admin.name, createdAt: fmtDateTime_(now_()) };
  fields.forEach((f, i) => { if (answers[f.key] !== undefined) rec[`q${i}`] = answers[f.key]; });
  visits.insert(rec);

  // 2. The trainee's details: only what changed.
  let updated = 0;
  if (p.updateTrainee !== false) {
    const tcols = { id: traineeTable_().header('id') };
    fields.forEach((f, i) => { tcols[`q${i}`] = f.header; });
    const tt = new Table(traineeSpreadsheet_(), traineeTabName_(), tcols, [], 'trainees:visit');
    const row = tt.find((r) => String(r.id) === String(trainee.id));
    const patch = {};
    fields.forEach((f, i) => {
      if (answers[f.key] === undefined) return;
      const current = f.type === 'date' ? formDate_(row[`q${i}`]) : String(row[`q${i}`] === undefined ? '' : row[`q${i}`]);
      if (current !== answers[f.key]) patch[`q${i}`] = answers[f.key];
    });
    updated = Object.keys(patch).length;
    if (updated) tt.update(row, patch);
  }
  resetDbCache_();
  return Object.assign(listVisits_({}), {
    message: `Visit to ${trainee.name} recorded.${p.updateTrainee === false ? '' : updated ? ` Updated ${updated} of their details.` : ' Their details were already up to date.'}`,
  });
}

/** For listVisits_: a visit's form answers, grouped by section (empty for visits saved before the form). */
function visitAnswers_(table) {
  const base = VISIT_BASE_KEYS_.map((k) => normHeader_(CONFIG.TABLES.houseVisits.columns[k]));
  const headers = table.allHeaders().filter((h) => base.indexOf(h.norm) === -1);
  if (!headers.length) return () => [];
  let sections = [];
  try { sections = visitFormSections_(); } catch (e) { sections = []; }
  const where = {};
  sections.forEach((s) => s.fields.forEach((f) => { where[f.key] = { title: s.title, type: f.type, likert: f.likert }; }));
  const order = sections.map((s) => s.title);
  return (v) => {
    const groups = {};
    headers.forEach((h) => {
      const value = displayValue_(table.rawValue(v, h.index));
      if (!value) return;
      const w = where[h.norm] || { title: 'Other details', type: visitQuestionType_(h.header) };
      (groups[w.title] = groups[w.title] || []).push(Object.assign({ label: h.header, value, type: w.type }, w.likert ? { likert: w.likert } : {}));
    });
    return order.filter((t) => groups[t]).concat(Object.keys(groups).filter((t) => order.indexOf(t) === -1)).map((title) => ({ title, fields: groups[title] }));
  };
}
