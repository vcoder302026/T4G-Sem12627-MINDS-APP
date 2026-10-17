/**
 * TraineeUpdates.gs — what volunteers see about trainees, and trainee updates.
 *
 * WHAT VOLUNTEERS SEE (the "Trainee Field Access" tab, Admin → Settings)
 * One row per field, with Yes/blank for new and for regular volunteers:
 *   From = Trainee list     a column of the trainee list (Config.gs → TRAINEES)
 *   From = Trainee updates  a column of the house-visit form responses
 *   From = App              Photo, Notes from previous volunteers
 * A field with no row uses the starting values in Config.gs. Admins see everything.
 *
 * WHO SEES WHICH TRAINEE
 *   regular volunteers  every active trainee (an "info dump"), and can update any of them
 *   new volunteers      only the trainee(s) they are paired with (regular pairs, or a
 *                       session in the last two weeks or coming up), and can update those
 *
 * TRAINEE UPDATES (Data Sources → "traineeUpdates")
 * MINDS's house-visit form responses: one row per visit, several rows per
 * trainee, matched to the trainee list by the trainee's full name. A trainee's
 * current information is the newest non-blank answer for each question. A
 * volunteer's update is added as a NEW row in the same format (unchanged
 * answers carried over), so the sheet stays a complete history.
 */

const APP_FIELDS = { photo: 'Photo', notes: 'Notes from previous volunteers' };
const ACCESS_SOURCES = { trainee: 'Trainee list', update: 'Trainee updates', app: 'App' };

const isYes_ = (v) => v === true || /^(yes|y|true|x|✓)$/i.test(String(v || '').trim());

/* ---------- field access ---------- */

/** The starting value for a field that has no row in the Trainee Field Access tab. */
function defaultAccess_(source, label) {
  if (source === 'app') return { newSee: true, regularSee: true };
  if (source === 'trainee') {
    const t = CONFIG.TRAINEES;
    const key = Object.keys(t.columns).find((k) => t.columns[k] === label);
    const newSee = t.volunteerVisible.indexOf(key) >= 0;
    return { newSee, regularSee: newSee || (t.regularAlsoVisible || []).indexOf(key) >= 0 };
  }
  return { newSee: false, regularSee: false }; // house-visit answers: hidden until an admin allows them
}

/** { 'trainee|Gender': { newSee, regularSee, saved }, … } for every field that has a row. */
function fieldAccessMap_() {
  return memo_('fieldAccess', () => {
    const map = {};
    if (!spreadsheet_().getSheetByName(CONFIG.TABLES.fieldAccess.tab)) return map;
    const fromLabel = {};
    Object.keys(ACCESS_SOURCES).forEach((k) => { fromLabel[ACCESS_SOURCES[k].toLowerCase()] = k; });
    table_('fieldAccess').rows().forEach((r) => {
      const source = fromLabel[String(r.source || '').trim().toLowerCase()];
      if (!source || !r.field) return;
      map[`${source}|${r.field}`] = { newSee: isYes_(r.newSee), regularSee: isYes_(r.regularSee), saved: true };
    });
    return map;
  });
}

function canSee_(key, type) {
  const saved = fieldAccessMap_()[key];
  const [source, label] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
  const a = saved || defaultAccess_(source, label);
  return type === 'regular' ? a.regularSee : a.newSee;
}

/** Trainee-list fields that can be shown to volunteers (not the ID, name or active flag). */
function traineeInfoKeys_() {
  return Object.keys(CONFIG.TRAINEES.columns).filter((k) => ['id', 'name', 'active'].indexOf(k) === -1);
}

/** Every field an admin can allow, with its current setting. */
function fieldAccess_() {
  const map = fieldAccessMap_();
  const out = [];
  const add = (source, label) => {
    const key = `${source}|${label}`;
    const a = map[key] || defaultAccess_(source, label);
    out.push({ key, source, from: ACCESS_SOURCES[source], label, newSee: Boolean(a.newSee), regularSee: Boolean(a.regularSee) });
  };
  traineeInfoKeys_().forEach((k) => add('trainee', CONFIG.TRAINEES.columns[k]));
  add('app', APP_FIELDS.photo);
  add('app', APP_FIELDS.notes);
  const updates = traineeUpdates_();
  if (updates) updates.infoHeaders.forEach((h) => add('update', h));
  return { fields: out, updatesLinked: Boolean(updates), updatesError: DB_.memo.traineeUpdatesError || '' };
}

function saveFieldAccess_(p, admin) {
  onlyFields_(p, ['fields']);
  if (!Array.isArray(p.fields) || !p.fields.length || p.fields.length > 300) throw err_.validation('Send the fields to save.');
  const allowed = byKey_(fieldAccess_().fields, 'key');
  const def = CONFIG.TABLES.fieldAccess;
  ensureTab_(spreadsheet_(), def.tab, Object.keys(def.columns).map((k) => def.columns[k]), {});
  const table = table_('fieldAccess');
  let changed = 0;
  p.fields.forEach((item) => {
    const f = obj_(item, 'Field');
    const key = str_(f.key, 'Field', { required: true, max: 300 });
    const known = allowed[key];
    if (!known) throw err_.validation(`"${key.split('|').pop()}" is not a trainee field.`);
    const rec = { newSee: f.newSee === true ? 'Yes' : '', regularSee: f.regularSee === true ? 'Yes' : '' };
    const row = table.find((r) => r.field === known.label && String(r.source).toLowerCase() === known.from.toLowerCase());
    if (row) {
      if (isYes_(row.newSee) !== (rec.newSee === 'Yes') || isYes_(row.regularSee) !== (rec.regularSee === 'Yes')) {
        table.update(row, Object.assign(rec, stamp_(admin)));
        changed += 1;
      }
    } else if (known.newSee !== (rec.newSee === 'Yes') || known.regularSee !== (rec.regularSee === 'Yes')) {
      table.insert(Object.assign({ field: known.label, source: known.from }, rec, stamp_(admin)));
      changed += 1;
    }
  });
  delete DB_.memo.fieldAccess;
  return Object.assign(fieldAccess_(), { message: changed ? `Saved ${changed} change${changed === 1 ? '' : 's'} to what volunteers see.` : 'No changes to save.' });
}

/** Called by setup(): writes the starting values so admins can see and change them in the sheet too. */
function seedFieldAccess_() {
  resetDbCache_();
  const table = table_('fieldAccess');
  if (table.rows().length) return [];
  const stampNow = { updatedBy: 'setup', updatedAt: fmtDateTime_(now_()) };
  const add = (source, label) => {
    const a = defaultAccess_(source, label);
    table.insert(Object.assign({ field: label, source: ACCESS_SOURCES[source], newSee: a.newSee ? 'Yes' : '', regularSee: a.regularSee ? 'Yes' : '' }, stampNow));
  };
  traineeInfoKeys_().forEach((k) => add('trainee', CONFIG.TRAINEES.columns[k]));
  add('app', APP_FIELDS.photo);
  add('app', APP_FIELDS.notes);
  return ['Added the starting "what volunteers see" settings (Trainee Field Access tab).'];
}

/* ---------- reading the house-visit form responses ---------- */

/**
 * The linked trainee-updates sheet, read once per request:
 * { loc, sheet, headers, infoHeaders, index, rows: [{ traineeName, volunteer1, volunteer2,
 *   seniorVolunteers, visitDate, timestamp, sortKey, values: { header: value }, _row }] }
 * null when not linked, or when the link is broken (the reason is kept for admins).
 */
function traineeUpdates_() {
  return memo_('traineeUpdates', () => {
    try {
      const loc = sheetLocation_('traineeUpdates');
      if (!loc) return null;
      const data = readSheet_(loc); // Pairs.gs
      const c = CONFIG.TRAINEE_UPDATES;
      const meta = ['timestamp', 'visitDate', 'volunteer1', 'volunteer2', 'seniorVolunteers', 'traineeName'];
      const index = {};
      meta.forEach((k) => { index[k] = headerIndex_(data.headers, [c[k]]); });
      if (index.traineeName < 0) throw err_.config(`The trainee updates sheet has no "${c.traineeName}" column. Check the link (it should point at the form responses tab).`);
      const metaCols = meta.map((k) => index[k]).filter((i) => i >= 0);
      const infoHeaders = data.headers.filter((h, i) => h && metaCols.indexOf(i) === -1);
      const at = (line, k) => (index[k] >= 0 ? String(line[index[k]] || '') : '');
      const rows = data.rows.map((line) => {
        const values = {};
        data.headers.forEach((h, i) => { if (h && metaCols.indexOf(i) === -1) values[h] = line[i] === undefined ? '' : String(line[i]); });
        const timestamp = at(line, 'timestamp');
        return {
          _row: line._row,
          timestamp,
          visitDate: at(line, 'visitDate').slice(0, 10) || timestamp.slice(0, 10),
          volunteer1: at(line, 'volunteer1'),
          volunteer2: at(line, 'volunteer2'),
          seniorVolunteers: at(line, 'seniorVolunteers'),
          traineeName: at(line, 'traineeName'),
          sortKey: `${timestamp}|${String(line._row).padStart(7, '0')}`,
          values,
        };
      }).filter((r) => r.traineeName);
      DB_.memo.traineeUpdatesError = '';
      return { loc, sheet: data.sheet, headers: data.headers, infoHeaders, index, rows };
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      DB_.memo.traineeUpdatesError = e.message; // volunteers' screens keep working without it
      return null;
    }
  });
}

/** A trainee's house-visit answers: the newest non-blank answer per question, plus the history. */
function traineeUpdatesFor_(traineeRow) {
  const updates = traineeUpdates_();
  if (!updates) return { linked: false, error: DB_.memo.traineeUpdatesError || '', count: 0, fields: [], history: [] };
  const key = normName_(traineeRow.name);
  const mine = sortBy_(updates.rows.filter((r) => normName_(r.traineeName) === key), (r) => r.sortKey).reverse();
  const latest = {};
  mine.forEach((r) => {
    updates.infoHeaders.forEach((h) => {
      if (!(h in latest) && String(r.values[h] || '').trim()) latest[h] = { value: r.values[h], date: r.visitDate };
    });
  });
  return {
    linked: true,
    error: '',
    count: mine.length,
    lastVisit: mine.length ? mine[0].visitDate : '',
    fields: updates.infoHeaders.filter((h) => latest[h]).map((h) => ({ label: h, value: latest[h].value, date: latest[h].date })),
    history: mine.slice(0, 20).map((r) => ({
      timestamp: r.timestamp,
      visitDate: r.visitDate,
      volunteers: [r.volunteer1, r.volunteer2].filter(Boolean),
      seniorVolunteers: r.seniorVolunteers,
      answers: updates.infoHeaders.filter((h) => String(r.values[h] || '').trim()).map((h) => ({ label: h, value: r.values[h] })),
    })),
  };
}

/** Admin → House visits: every form response, newest first. */
function listTraineeUpdates_(p) {
  onlyFields_(p, ['limit']);
  const updates = traineeUpdates_();
  if (!updates) return { linked: false, error: DB_.memo.traineeUpdatesError || '', rows: [] };
  const byName = {};
  traineeTable_().rows().forEach((t) => { if (t.id) byName[normName_(t.name)] = String(t.id); });
  const limit = p.limit === undefined ? 200 : int_(p.limit, 'Limit', 1, 2000);
  const rows = sortBy_(updates.rows, (r) => r.sortKey).reverse().slice(0, limit).map((r) => ({
    timestamp: r.timestamp,
    visitDate: r.visitDate,
    traineeName: r.traineeName,
    traineeId: byName[normName_(r.traineeName)] || '',
    volunteers: [r.volunteer1, r.volunteer2].filter(Boolean),
    seniorVolunteers: r.seniorVolunteers,
    answers: updates.infoHeaders.filter((h) => String(r.values[h] || '').trim()).map((h) => ({ label: h, value: r.values[h] })),
  }));
  return { linked: true, error: '', tab: updates.loc.tab, total: updates.rows.length, rows };
}

/** Adds a volunteer's update as a new form-response row, carrying over every unchanged answer. */
function appendTraineeUpdate_(trainee, user, changes, visitDate) {
  const updates = traineeUpdates_();
  const { sheet, headers, index } = updates;
  const key = normName_(trainee.name);
  const mine = sortBy_(updates.rows.filter((r) => normName_(r.traineeName) === key), (r) => r.sortKey).reverse();
  const out = headers.map(() => '');
  headers.forEach((h, i) => {
    if (!h || Object.keys(index).some((k) => index[k] === i)) return;
    if (Object.prototype.hasOwnProperty.call(changes, h)) out[i] = changes[h];
    else {
      const prev = mine.find((r) => String(r.values[h] || '').trim());
      out[i] = prev ? prev.values[h] : '';
    }
  });
  if (index.volunteer1 >= 0) out[index.volunteer1] = user.name;
  if (index.traineeName >= 0) out[index.traineeName] = mine.length ? mine[0].traineeName : trainee.name;
  const rowNum = sheet.getLastRow() + 1;
  if (rowNum > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 50);
  const width = headers.length;
  sheet.getRange(rowNum, 1, 1, width).setNumberFormat('@');
  const cells = out.map((v) => valueToCell_(v));
  const dated = [];
  if (index.timestamp >= 0) {
    cells[index.timestamp] = now_();
    dated.push([index.timestamp, 'yyyy-mm-dd hh:mm:ss']);
  }
  if (index.visitDate >= 0) {
    cells[index.visitDate] = parseDateTime_(`${visitDate} 00:00:00`);
    dated.push([index.visitDate, 'dd mmm yyyy']);
  }
  dated.forEach(([i, fmt]) => sheet.getRange(rowNum, i + 1).setNumberFormat(fmt));
  sheet.getRange(rowNum, 1, 1, width).setValues([cells]);
  delete DB_.memo.traineeUpdates;
}

/* ---------- what a volunteer sees ---------- */

/** A trainee as this volunteer may see them (new and regular volunteers see different fields). */
function traineeForVolunteer_(id, user) {
  const row = traineeById_(id);
  if (!row) return null;
  const type = volunteerTypeOf_(user).type;
  const labels = CONFIG.TRAINEES.columns;
  const fields = traineeInfoKeys_()
    .filter((key) => row[key] !== '' && row[key] !== undefined && canSee_(`trainee|${labels[key]}`, type))
    .map((key) => ({ key, label: labels[key], value: String(row[key]) }));
  const upd = traineeUpdatesFor_(row);
  return {
    id: String(row.id),
    name: row.name,
    fields,
    updateFields: upd.fields.filter((f) => canSee_(`update|${f.label}`, type)),
    lastVisit: upd.lastVisit || '',
    notes: canSee_(`app|${APP_FIELDS.notes}`, type) ? sharedNotes_(row.id, CONFIG.NOTES_SHOWN_TO_VOLUNTEERS) : [],
    photoFileId: canSee_(`app|${APP_FIELDS.photo}`, type) ? traineePhotoId_(String(row.id)) : '',
    viewerType: type,
  };
}

/** Trainees a new volunteer is paired with: regular pairs, and sessions from two weeks ago onwards. */
function pairedTraineeIds_(user) {
  const ids = {};
  pairsFor_({ userId: user.userId }).forEach((x) => { ids[x.traineeId] = 'regular pair'; });
  const from = addDays_(todayStr_(), -CONFIG.FEEDBACK_WINDOW_DAYS);
  table_('bookings').rows().filter((b) => b.userId === user.userId && b.status !== 'cancelled' && String(b.sessionDate) >= from)
    .forEach((b) => bookingTraineeIds_(b).forEach((id) => { if (!ids[id]) ids[id] = `session on ${b.sessionDate}`; }));
  return ids;
}

function canViewTrainee_(user, traineeId) {
  const row = traineeById_(traineeId);
  if (!row) return null;
  if (isRegular_(user)) return isActiveTrainee_(row) || pairedTraineeIds_(user)[String(row.id)] ? row : null;
  return pairedTraineeIds_(user)[String(row.id)] ? row : null;
}

function volunteerTrainees_(p, user) {
  onlyFields_(p, []);
  const type = volunteerTypeOf_(user).type;
  const paired = pairedTraineeIds_(user);
  const photoOk = canSee_(`app|${APP_FIELDS.photo}`, type);
  const rows = traineeTable_().rows().filter((r) => r.id && r.name
    && (paired[String(r.id)] || (type === 'regular' && isActiveTrainee_(r))));
  const trainees = sortBy_(rows, (r) => `${paired[String(r.id)] ? 0 : 1}${String(r.name).toLowerCase()}`).map((r) => ({
    id: String(r.id),
    name: r.name,
    preferredName: canSee_(`trainee|${CONFIG.TRAINEES.columns.preferredName}`, type) ? r.preferredName || '' : '',
    pairedBecause: paired[String(r.id)] || '',
    photoFileId: photoOk ? traineePhotoId_(String(r.id)) : '',
  }));
  return { type, trainees, updatesLinked: Boolean(traineeUpdates_()), regularAfter: CONFIG.REGULAR_AFTER_SESSIONS };
}

function volunteerTrainee_(p, user) {
  onlyFields_(p, ['traineeId']);
  const row = canViewTrainee_(user, str_(p.traineeId, 'Trainee', { required: true, max: 40 }));
  if (!row) throw err_.notFound('You can see a trainee\'s details once you are paired with them.');
  const t = traineeForVolunteer_(String(row.id), user);
  const updates = traineeUpdates_();
  const current = byKey_(t.updateFields, 'label');
  const editable = updates
    ? updates.infoHeaders.filter((h) => canSee_(`update|${h}`, t.viewerType)).map((h) => ({ label: h, value: current[h] ? current[h].value : '' }))
    : [];
  return { trainee: t, editable, updatesLinked: Boolean(updates), pairedBecause: pairedTraineeIds_(user)[String(row.id)] || '' };
}

/**
 * A volunteer updates a trainee:
 *   changes  { "<question>": "new answer" } → a new row in the house-visit responses
 *   note     an observation → waits for an admin (Notes to review), like session feedback
 */
function submitTraineeUpdate_(p, user) {
  onlyFields_(p, ['traineeId', 'visitDate', 'changes', 'note']);
  const row = canViewTrainee_(user, str_(p.traineeId, 'Trainee', { required: true, max: 40 }));
  if (!row) throw err_.notFound('You can update a trainee once you are paired with them.');
  const type = volunteerTypeOf_(user).type;
  const changesIn = obj_(p.changes, 'Changes');
  const note = str_(p.note, 'Note', { max: LIMITS.NOTES });
  const visitDate = p.visitDate ? date_(p.visitDate, 'Date of visit') : todayStr_();
  if (visitDate > todayStr_()) throw err_.validation('The date cannot be in the future.');

  const updates = traineeUpdates_();
  const changes = {};
  Object.keys(changesIn).forEach((label) => {
    if (!updates || updates.infoHeaders.indexOf(label) === -1) throw err_.validation(`"${label}" is not one of the trainee update questions.`);
    if (!canSee_(`update|${label}`, type)) throw err_.validation(`You can't change "${label}". Ask a MINDS admin.`);
    changes[label] = str_(changesIn[label], label, { max: LIMITS.NOTES });
  });
  // Only answers that actually change count.
  const current = byKey_(traineeUpdatesFor_(row).fields, 'label');
  Object.keys(changes).forEach((label) => {
    if (String((current[label] || {}).value || '').trim() === changes[label]) delete changes[label];
  });
  if (!Object.keys(changes).length && !note) throw err_.validation('Change an answer or write a note first.');

  const done = [];
  if (Object.keys(changes).length) {
    appendTraineeUpdate_(row, user, changes, visitDate);
    done.push(`updated ${Object.keys(changes).length} answer${Object.keys(changes).length === 1 ? '' : 's'}`);
  }
  if (note) {
    const shareNow = CONFIG.AUTO_SHARE_OBSERVATIONS;
    const fb = table_('feedback').insert({
      feedbackId: newId_('F'),
      type: 'Trainee update',
      userId: user.userId,
      volunteerName: user.name,
      traineeId: String(row.id),
      traineeName: row.name,
      date: visitDate,
      traineeObservation: note,
      noteStatus: shareNow ? 'shared' : 'pending',
      submittedAt: fmtDateTime_(now_()),
    });
    if (shareNow) addNote_(row, note, user.name, 'Volunteer update', 'automatic', fb.feedbackId, visitDate);
    done.push(shareNow ? 'added your note' : 'sent your note to the admins');
  }
  return Object.assign(volunteerTrainee_({ traineeId: String(row.id) }, user), {
    message: `Thanks! You ${done.join(' and ')} for ${row.name}.`,
  });
}
