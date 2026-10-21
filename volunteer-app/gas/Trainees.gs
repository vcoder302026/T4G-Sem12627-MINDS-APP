/**
 * Trainees.gs — the existing trainee list, trainee notes and automatic pairing.
 *
 * The phone app never adds, removes or reorders trainees. It reads the columns
 * mapped in Config.gs → TRAINEES and writes only the Trainee ID and the two
 * write-back columns. Notes that future volunteers read live in the separate
 * "Trainee Notes" tab.
 *
 * The staff dashboard can add a trainee (a new row at the bottom) and edit the
 * mapped columns of a row, cell by cell. It never deletes or reorders rows and
 * never touches columns it does not know about. A mapped column the tab lacks
 * is added (at the right) the first time someone fills it in.
 */

function isActiveTrainee_(row) {
  return !/^(no|n|false|inactive|left)$/i.test(String(row.active || '').trim());
}

/** Short list for leaders' pickers (fuzzy search happens on the phone). */
function traineeList_() {
  const list = traineeTable_().rows()
    .filter((r) => r.id && r.name && isActiveTrainee_(r))
    .map((r) => ({ id: String(r.id), name: r.name, preferredName: r.preferredName || '', gender: r.gender || '' }));
  return sortBy_(list, (t) => natKey_(t.name));
}

function traineeById_(id) {
  if (!id) return null;
  return traineeTable_().find((r) => String(r.id) === String(id));
}

function sharedNotes_(traineeId, limit) {
  const notes = table_('traineeNotes').filter((n) => String(n.traineeId) === String(traineeId) && n.status !== 'hidden');
  const sorted = sortBy_(notes, (n) => `${n.date} ${n.addedAt}`).reverse();
  return (limit ? sorted.slice(0, limit) : sorted).map((n) => ({
    noteId: n.noteId,
    date: n.date,
    note: n.note,
    author: String(n.author || '').split(/\s+/)[0], // first name only for volunteers
    source: n.source,
  }));
}

/** Everything about a trainee, for admins. */
function traineeDetail_(p) {
  onlyFields_(p, ['traineeId']);
  const row = traineeById_(str_(p.traineeId, 'Trainee', { required: true, max: 40 }));
  if (!row) throw err_.notFound('Trainee not found.');
  const table = traineeTable_();
  const visible = visibleFor_(row.id, 'volunteer').fields;
  const fields = Object.keys(CONFIG.TRAINEES.columns)
    .filter((key) => key !== 'id' && key !== 'name' && row[key] !== '' && row[key] !== undefined)
    .map((key) => ({ key, label: table.header(key), value: String(row[key]), visibleToVolunteers: visible.indexOf(normHeader_(table.header(key))) >= 0 }));
  const allNotes = sortBy_(table_('traineeNotes').filter((n) => String(n.traineeId) === String(row.id)), (n) => `${n.date} ${n.addedAt}`).reverse()
    .map((n) => ({ noteId: n.noteId, date: n.date, note: n.note, author: n.author, source: n.source, status: n.status || 'shared', addedBy: n.addedBy }));
  const pairings = sortBy_(table_('bookings').filter((b) => String(b.traineeId) === String(row.id) && b.status === 'confirmed'), (b) => b.sessionDate).reverse()
    .slice(0, 10).map((b) => ({ date: b.sessionDate, sessionTitle: b.sessionTitle, volunteerName: b.volunteerName }));
  return { trainee: { id: String(row.id), name: row.name, active: isActiveTrainee_(row), fields }, notes: allNotes, pairings };
}

function listTrainees_() {
  const counts = {};
  table_('traineeNotes').rows().forEach((n) => {
    if (n.status !== 'hidden') counts[n.traineeId] = (counts[n.traineeId] || 0) + 1;
  });
  const trainees = traineeTable_().rows().filter((r) => r.id && r.name).map((r) => ({
    id: String(r.id),
    name: r.name,
    preferredName: r.preferredName || '',
    gender: r.gender || '',
    communication: r.communication || '',
    active: isActiveTrainee_(r),
    noteCount: counts[String(r.id)] || 0,
  }));
  return { trainees: sortBy_(trainees, (t) => natKey_(t.name)) };
}

/* ---------- notes ---------- */

function addNote_(trainee, text, author, source, leaderName, feedbackId, dateStr) {
  const note = table_('traineeNotes').insert({
    noteId: newId_('N'),
    traineeId: String(trainee.id),
    traineeName: trainee.name,
    date: dateStr || todayStr_(),
    note: text,
    author,
    source,
    feedbackId: feedbackId || '',
    status: 'shared',
    addedBy: leaderName,
    addedAt: fmtDateTime_(now_()),
  });
  writeLatestObservation_(trainee, text, author, note.date);
  return note;
}

/** Copies the newest shared note onto the trainee's own row (Config.gs → writeBack). */
function writeLatestObservation_(trainee, text, author, dateStr) {
  if (!CONFIG.TRAINEES.writeBack || !text) return false;
  const table = traineeTable_();
  const row = table.find((r) => String(r.id) === String(trainee.id));
  if (!row) return false;
  const patch = {};
  if (table.hasColumn('latestObservation')) patch.latestObservation = `${dateStr} (${author}): ${text}`;
  if (table.hasColumn('observationUpdated')) patch.observationUpdated = dateStr;
  table.update(row, patch);
  return Object.keys(patch).length > 0;
}

/** Leader adds a note straight onto a trainee's profile. */
function addTraineeNote_(p, admin) {
  onlyFields_(p, ['traineeId', 'note']);
  const trainee = traineeById_(str_(p.traineeId, 'Trainee', { required: true, max: 40 }));
  if (!trainee) throw err_.notFound('Trainee not found.');
  const text = str_(p.note, 'Note', { required: true, max: LIMITS.NOTES });
  addNote_(trainee, text, admin.name, 'Leader', admin.name, '', todayStr_());
  return traineeDetail_({ traineeId: String(trainee.id) });
}

/** Leader hides (or re-shares) a note. Hidden notes stay in the sheet but volunteers no longer see them. */
function setNoteStatus_(p) {
  onlyFields_(p, ['noteId', 'status']);
  const notes = table_('traineeNotes');
  const note = notes.find((n) => n.noteId === id_(p.noteId, 'Note'));
  if (!note) throw err_.notFound('Note not found.');
  notes.update(note, { status: oneOf_(p.status, 'Status', ['shared', 'hidden']) });
  return traineeDetail_({ traineeId: String(note.traineeId) });
}

/** Volunteer observations waiting for a leader. */
function reviewQueue_() {
  const items = table_('feedback').filter((f) => f.noteStatus === 'pending' && f.traineeObservation);
  return {
    items: sortBy_(items, (f) => f.submittedAt).map((f) => ({
      feedbackId: f.feedbackId,
      traineeId: String(f.traineeId),
      traineeName: f.traineeName,
      volunteerName: f.volunteerName,
      date: f.date,
      observation: f.traineeObservation,
      rating: f.rating,
    })),
  };
}

function reviewObservation_(p, admin) {
  onlyFields_(p, ['feedbackId', 'decision', 'note']);
  const feedback = table_('feedback');
  const f = feedback.find((x) => x.feedbackId === id_(p.feedbackId, 'Feedback'));
  if (!f) throw err_.notFound('Feedback not found.');
  if (f.noteStatus !== 'pending') throw err_.conflict('This note has already been reviewed.');
  const decision = oneOf_(p.decision, 'Decision', ['share', 'private']);
  if (decision === 'share') {
    const trainee = traineeById_(f.traineeId);
    if (!trainee) throw err_.notFound('The trainee for this note is no longer on the trainee list.');
    const text = p.note === undefined ? f.traineeObservation : str_(p.note, 'Note', { required: true, max: LIMITS.NOTES });
    addNote_(trainee, text, f.volunteerName, 'Volunteer feedback', admin.name, f.feedbackId, f.date);
  }
  feedback.update(f, { noteStatus: decision === 'share' ? 'shared' : 'private', reviewedBy: admin.name });
  return reviewQueue_();
}

/* ---------- automatic pairing ---------- */

function parseIds_(value) {
  return String(value || '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

/* ---------- staff dashboard: add and edit trainees ---------- */

/** Fields staff can edit: every mapped trainee column except the ID. */
function traineeEditable_() {
  return Object.keys(CONFIG.TRAINEES.columns).filter((k) => k !== 'id');
}

const TRAINEE_SHORT_FIELDS = ['preferredName', 'gender', 'caregiverName'];

function traineeFields_(p, partial) {
  const out = {};
  traineeEditable_().forEach((key) => {
    if (partial && !has_(p, key)) return;
    const label = primaryHeader_(CONFIG.TRAINEES.columns[key]);
    if (key === 'name') out.name = str_(p.name, label, { required: true });
    else if (key === 'caregiverPhone') out.caregiverPhone = phone_(p.caregiverPhone, label, { optional: true });
    else if (key === 'active') {
      const v = p.active;
      out.active = v === true || v === undefined || v === '' || /^(yes|y|true|active)$/i.test(String(v)) ? 'Yes' : 'No';
    } else out[key] = str_(p[key], label, { max: TRAINEE_SHORT_FIELDS.indexOf(key) >= 0 ? LIMITS.SHORT : LIMITS.NOTES });
  });
  return out;
}

/** Every mapped field of a trainee row, for the dashboard's table and edit form. */
function traineeRecordOut_(row) {
  const fields = {};
  traineeEditable_().forEach((key) => { fields[key] = row[key] === undefined ? '' : String(row[key]); });
  return { id: String(row.id), name: row.name, active: isActiveTrainee_(row), fields };
}

function traineeColumnsOut_(table) {
  const visible = defaultVisible_('volunteer');
  return traineeEditable_().map((key) => ({
    key,
    label: table.header(key),
    visibleToVolunteers: visible.indexOf(normHeader_(table.header(key))) >= 0,
    inSheet: table.hasColumn(key),
  }));
}

/** Regular volunteers with a fixed pairing, by trainee ID: { 'T-0001': [names] }. */
function regularsByTrainee_() {
  const out = {};
  standingRows_().forEach((x) => {
    (out[String(x.traineeId)] = out[String(x.traineeId)] || []).push({ userId: x.userId, name: x.volunteerName });
  });
  return out;
}

function listTraineeRecords_() {
  const table = traineeTable_();
  const regulars = regularsByTrainee_();
  const trainees = table.rows().filter((r) => r.id && r.name)
    .map((r) => Object.assign(traineeRecordOut_(r), { regulars: regulars[String(r.id)] || [] }));
  return { trainees: sortBy_(trainees, (t) => natKey_(t.name)), columns: traineeColumnsOut_(table) };
}

/** Adds any mapped column the trainee tab lacks for these keys, then re-reads it. */
function ensureTraineeColumns_(keys) {
  let table = traineeTable_();
  const missing = keys.filter((k) => !table.hasColumn(k)).map((k) => primaryHeader_(CONFIG.TRAINEES.columns[k]));
  if (missing.length) {
    ensureTab_(traineeSpreadsheet_(), traineeTabName_(), missing, {});
    resetDbCache_();
    table = traineeTable_();
  }
  return table;
}

function nextTraineeId_(rows) {
  let max = 0;
  rows.forEach((r) => {
    const m = /^T-(\d+)$/.exec(String(r.id));
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `T-${String(max + 1).padStart(4, '0')}`;
}

function createTrainee_(p) {
  onlyFields_(p, traineeEditable_());
  const fields = traineeFields_(p, false);
  // "Active: Yes" is the default, so it does not need an Active column to be added.
  const table = ensureTraineeColumns_(['id'].concat(Object.keys(fields).filter((k) => fields[k] !== '' && !(k === 'active' && fields[k] === 'Yes'))));
  const id = nextTraineeId_(table.rows());
  table.insert(Object.assign({ id }, fields));
  return Object.assign(traineeProfile_({ traineeId: id }), { message: `${fields.name} added as ${id}.` });
}

function updateTrainee_(p) {
  onlyFields_(p, ['traineeId'].concat(traineeEditable_()));
  const traineeId = str_(p.traineeId, 'Trainee', { required: true, max: 40 });
  requireChanges_(p, 'traineeId');
  const rest = Object.assign({}, p);
  delete rest.traineeId;
  const patch = traineeFields_(rest, true);
  let row = traineeById_(traineeId);
  if (!row) throw err_.notFound('Trainee not found.');
  const changes = changedOnly_(row, patch);
  if (changes.active === 'Yes' && isActiveTrainee_(row)) delete changes.active; // blank already means active
  if (!Object.keys(changes).length) return Object.assign(traineeProfile_({ traineeId }), { message: 'No changes to save.' });
  const table = ensureTraineeColumns_(Object.keys(changes));
  row = table.find((r) => String(r.id) === traineeId);
  table.update(row, changes);
  if (changes.name) {
    // Volunteers see the trainee's name on their upcoming bookings; past rows keep the name used at the time.
    const bookings = table_('bookings');
    const today = todayStr_();
    bookings.filter((b) => String(b.traineeId) === traineeId && String(b.sessionDate) >= today)
      .forEach((b) => bookings.update(b, { traineeName: changes.name }));
  }
  return Object.assign(traineeProfile_({ traineeId }), { message: `Saved ${row.name}.` });
}

/** One trainee's full record, with notes, pairings, house visits, trips and outings. */
function traineeProfile_(p) {
  onlyFields_(p, ['traineeId']);
  const traineeId = str_(p.traineeId, 'Trainee', { required: true, max: 40 });
  const row = traineeById_(traineeId);
  if (!row) throw err_.notFound('Trainee not found.');
  const detail = traineeDetail_({ traineeId });
  const names = nameMaps_();
  const outings = byKey_(table_('outings').rows(), 'outingId');
  const trips = byKey_(table_('trips').rows(), 'tripId');
  return {
    trainee: traineeRecordOut_(row),
    columns: traineeColumnsOut_(traineeTable_()),
    sections: traineeSectionsView_(row, null),
    regulars: regularsByTrainee_()[traineeId] || [],
    visibility: { volunteer: !visibleFor_(traineeId, 'volunteer').isDefault, regular: !visibleFor_(traineeId, 'regular').isDefault },
    notes: detail.notes,
    pairings: detail.pairings,
    visits: listVisits_({ traineeId }).visits,
    trips: table_('tripParticipants').filter((x) => String(x.traineeId) === traineeId).map((x) => {
      const t = trips[x.tripId] || {};
      return { tripId: x.tripId, title: t.title || x.tripTitle, startDate: t.startDate || '', endDate: t.endDate || '', status: x.status, volunteerName: names.users[x.userId] || x.volunteerName || '' };
    }),
    outings: table_('outingAssignments').filter((a) => String(a.traineeId) === traineeId).map((a) => {
      const o = outings[a.outingId] || {};
      return { outingId: a.outingId, title: o.title || a.outingTitle, date: o.date || '', volunteerName: names.users[a.userId] || a.volunteerName || '', boarded: a.boarded === 'Yes' };
    }),
  };
}
