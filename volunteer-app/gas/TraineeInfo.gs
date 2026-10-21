/**
 * TraineeInfo.gs — what each kind of volunteer can see about trainees.
 *
 * Every column of the trainee tab is shown, grouped into sections (from the
 * trainee file's "Map (Fixed)" tab if it has one, else Config.gs → TRAINEES.sections).
 *
 *   admin      every detail of every trainee
 *   regular    any trainee; the details in the "regular" visible list
 *   volunteer  only a trainee they're paired with; the "volunteer" visible list
 *
 * The visible lists start from Config.gs → TRAINEES.visibleTo. Admins change
 * the default in the app (stored in the App Settings tab), and can give one
 * trainee different settings (Trainee Visibility tab), or make that trainee's
 * settings the new default.
 */

const AUDIENCES = ['volunteer', 'regular'];

/* ---------------- sections ---------------- */

function sectionMap_() {
  const tabName = CONFIG.TRAINEES.sectionMapTab;
  const out = {};
  const order = [];
  const sheet = tabName ? traineeSpreadsheet_().getSheetByName(tabName) : null;
  if (sheet && sheet.getLastColumn() && sheet.getLastRow() >= 2) {
    const rows = sheet.getRange(1, 1, 2, sheet.getLastColumn()).getValues();
    rows[0].forEach((h, i) => {
      const section = String(rows[1][i] || '').trim();
      if (!String(h).trim() || !section) return;
      out[normHeader_(h)] = section;
      if (order.indexOf(section) === -1) order.push(section);
    });
  }
  if (!order.length) {
    CONFIG.TRAINEES.sections.forEach((s) => {
      order.push(s.title);
      s.headers.forEach((h) => { out[normHeader_(h)] = s.title; });
    });
  }
  return { bySection: out, order };
}

/**
 * The trainee tab's columns grouped into sections, in display order.
 * The ID, the full name and form bookkeeping (e.g. Timestamp) are left out.
 */
function traineeSections_() {
  if (DB_.cache.traineeSections) return DB_.cache.traineeSections;
  const table = traineeTable_();
  const skip = [normHeader_(table.header('id')), normHeader_(table.header('name'))]
    .concat((CONFIG.TRAINEES.hiddenHeaders || []).map(normHeader_));
  const map = sectionMap_();
  const groups = {};
  table.allHeaders().forEach((h) => {
    if (skip.indexOf(h.norm) >= 0) return;
    const title = map.bySection[h.norm] || 'Other details';
    (groups[title] = groups[title] || []).push(h);
  });
  const order = map.order.filter((t) => groups[t]).concat(Object.keys(groups).filter((t) => map.order.indexOf(t) === -1));
  const sections = order.map((title) => ({ title, headers: groups[title] }));
  DB_.cache.traineeSections = sections;
  return sections;
}

/* ---------------- settings ---------------- */

function setting_(key) {
  const row = table_('settings').find((s) => s.key === key);
  return row ? row.value : '';
}

function saveSetting_(key, value, admin) {
  const settings = table_('settings');
  const row = settings.find((s) => s.key === key);
  const fields = { value, updatedBy: admin.name, updatedAt: fmtDateTime_(now_()) };
  if (row) settings.update(row, fields);
  else settings.insert(Object.assign({ key }, fields));
}

function parseFieldList_(text) {
  if (!text) return null;
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list.map(normHeader_) : null;
  } catch (e) {
    return null;
  }
}

/** Every column's key (normalised header) shown in the sections. */
function allFieldKeys_() {
  const keys = [];
  traineeSections_().forEach((s) => s.headers.forEach((h) => keys.push(h.norm)));
  return keys;
}

/** The default visible details for an audience. */
function defaultVisible_(audience) {
  const saved = parseFieldList_(setting_(`visibility.${audience}`));
  if (saved) return saved;
  const rule = CONFIG.TRAINEES.visibleTo[audience] || {};
  if (rule.all) return allFieldKeys_();
  const headers = (rule.headers || []).map(normHeader_);
  const sections = (rule.sections || []).map(normHeader_);
  const out = [];
  traineeSections_().forEach((s) => s.headers.forEach((h) => {
    if (headers.indexOf(h.norm) >= 0 || sections.indexOf(normHeader_(s.title)) >= 0) out.push(h.norm);
  }));
  return out;
}

function visibilityOverride_(traineeId, audience) {
  return table_('traineeVisibility').find((v) => String(v.traineeId) === String(traineeId) && v.audience === audience) || null;
}

/** The visible details for one trainee and audience, and whether it's the default. */
function visibleFor_(traineeId, audience) {
  const override = traineeId ? visibilityOverride_(traineeId, audience) : null;
  const list = override ? parseFieldList_(override.fields) : null;
  return list ? { fields: list, isDefault: false } : { fields: defaultVisible_(audience), isDefault: true };
}

/* ---------------- building the views ---------------- */

/** A trainee's details, grouped. `allowed` = list of field keys, or null for everything. */
function traineeSectionsView_(row, allowed) {
  const table = traineeTable_();
  const ok = allowed ? allowed.reduce((m, k) => { m[k] = true; return m; }, {}) : null;
  return traineeSections_().map((s) => ({
    title: s.title,
    fields: s.headers.filter((h) => !ok || ok[h.norm]).map((h) => ({ key: h.norm, label: h.header, value: table.rawValue(row, h.index) }))
      .filter((f) => f.value !== ''),
  })).filter((s) => s.fields.length);
}

function traineeBasics_(row) {
  return { id: String(row.id), name: row.name, preferredName: row.preferredName || '', gender: row.gender || '' };
}

/** The trainee card on a volunteer's upcoming session (Volunteer.gs → volunteerHome). */
function traineeForVolunteer_(id, user) {
  const row = traineeById_(id);
  if (!row) return null;
  const audience = user ? volunteerType_(user) : 'volunteer';
  const allowed = user && user.role === 'admin' ? null : visibleFor_(row.id, audience).fields;
  const sections = traineeSectionsView_(row, allowed);
  const fields = [];
  sections.forEach((s) => s.fields.forEach((f) => { if (fields.length < 8) fields.push({ key: f.key, label: f.label, value: f.value }); }));
  return Object.assign(traineeBasics_(row), {
    fields,
    moreDetails: sections.reduce((n, s) => n + s.fields.length, 0) > fields.length,
    notes: sharedNotes_(row.id, CONFIG.NOTES_SHOWN_TO_VOLUNTEERS),
  });
}

/** Can this person open this trainee's page? Returns 'admin' | 'regular' | 'volunteer' or throws. */
function traineeAccess_(user, traineeId) {
  if (user.role === 'admin') return 'admin';
  if (volunteerType_(user) === 'regular') return 'regular';
  const from = addDays_(todayStr_(), -CONFIG.FEEDBACK_WINDOW_DAYS);
  const paired = table_('bookings').find((b) => b.userId === user.userId && b.status !== 'cancelled'
    && String(b.traineeId) === String(traineeId) && String(b.sessionDate) >= from);
  if (!paired) throw err_.forbidden("You can see a trainee's details once an admin pairs you with them.");
  return 'volunteer';
}

/** A trainee's page for volunteers and regulars (admins get the full profile under Admin). */
function traineeInfo_(p, user) {
  onlyFields_(p, ['traineeId']);
  const traineeId = str_(p.traineeId, 'Trainee', { required: true, max: 40 });
  const row = traineeById_(traineeId);
  if (!row) throw err_.notFound('Trainee not found.');
  const access = traineeAccess_(user, traineeId);
  const allowed = access === 'admin' ? null : visibleFor_(row.id, access).fields;
  const today = todayStr_();
  const sessionById = byKey_(table_('sessions').rows(), 'sessionId');
  const together = sortBy_(table_('bookings').filter((b) => b.userId === user.userId && b.status !== 'cancelled'
    && String(b.traineeId) === traineeId && String(b.sessionDate) >= today), (b) => b.sessionDate)
    .map((b) => { const s = sessionById[b.sessionId] || {}; return { date: b.sessionDate, title: s.title || b.sessionTitle, startTime: s.startTime || '', endTime: s.endTime || '' }; });
  const regulars = standingRows_().filter((x) => String(x.traineeId) === traineeId)
    .map((x) => x.volunteerName);
  const mine = activeStanding_(user.userId);
  return {
    trainee: traineeBasics_(row),
    access,
    sections: traineeSectionsView_(row, allowed),
    notes: sharedNotes_(row.id, access === 'volunteer' ? CONFIG.NOTES_SHOWN_TO_VOLUNTEERS : 0),
    together,
    regulars: access === 'volunteer' ? [] : regulars,
    isMyRegular: Boolean(mine && String(mine.traineeId) === traineeId),
  };
}

/** All trainees, for regulars (and admins) to browse. */
function traineeDirectory_(p, user) {
  onlyFields_(p, []);
  if (user.role !== 'admin' && volunteerType_(user) !== 'regular') {
    throw err_.forbidden('The trainee list is for regular volunteers. You can see your own trainee once an admin pairs you.');
  }
  const regularsByTrainee = {};
  standingRows_().forEach((x) => {
    (regularsByTrainee[String(x.traineeId)] = regularsByTrainee[String(x.traineeId)] || []).push(x.volunteerName);
  });
  const mine = activeStanding_(user.userId);
  return {
    myTraineeId: mine ? String(mine.traineeId) : '',
    trainees: traineeList_().map((t) => Object.assign({}, t, { regulars: regularsByTrainee[t.id] || [] })),
  };
}

/** A volunteer or regular sends an update about a trainee; an admin reviews it like session feedback. */
function submitTraineeUpdate_(p, user) {
  onlyFields_(p, ['traineeId', 'note']);
  const traineeId = str_(p.traineeId, 'Trainee', { required: true, max: 40 });
  const trainee = traineeById_(traineeId);
  if (!trainee) throw err_.notFound('Trainee not found.');
  traineeAccess_(user, traineeId);
  const note = str_(p.note, 'Update', { required: true, max: LIMITS.NOTES });
  const shareNow = Boolean(CONFIG.AUTO_SHARE_OBSERVATIONS);
  const fb = table_('feedback').insert({
    feedbackId: newId_('F'),
    sessionId: '',
    bookingId: '',
    userId: user.userId,
    volunteerName: user.name,
    traineeId: String(trainee.id),
    traineeName: trainee.name,
    date: todayStr_(),
    traineeObservation: note,
    noteStatus: shareNow ? 'shared' : 'pending',
    submittedAt: fmtDateTime_(now_()),
  });
  if (shareNow) addNote_(trainee, note, user.name, 'Volunteer update', 'automatic', fb.feedbackId, todayStr_());
  return {
    message: shareNow ? `Thanks! Your update is now in ${trainee.name}'s notes.` : `Thanks! An admin will review your update about ${trainee.name}.`,
  };
}

/* ---------------- admin: choose what volunteers see ---------------- */

/** The visibility editor's data: every section and field, with who can see each. */
function visibilitySettings_(p) {
  onlyFields_(p, ['traineeId']);
  const traineeId = p.traineeId ? str_(p.traineeId, 'Trainee', { max: 40 }) : '';
  let trainee = null;
  if (traineeId) {
    const row = traineeById_(traineeId);
    if (!row) throw err_.notFound('Trainee not found.');
    trainee = traineeBasics_(row);
  }
  const audiences = {};
  AUDIENCES.forEach((a) => {
    const v = visibleFor_(traineeId, a);
    audiences[a] = { fields: v.fields, isDefault: !traineeId || v.isDefault };
  });
  return {
    trainee,
    sections: traineeSections_().map((s) => ({ title: s.title, fields: s.headers.map((h) => ({ key: h.norm, label: h.header })) })),
    audiences,
  };
}

/**
 * Saves the visible details for an audience: the default (no traineeId), one
 * trainee's own settings, `reset` (that trainee goes back to the default) or
 * `makeDefault` (this trainee's choice becomes everyone's default).
 */
function saveVisibility_(p, admin) {
  onlyFields_(p, ['audience', 'fields', 'traineeId', 'reset', 'makeDefault']);
  const audience = oneOf_(p.audience, 'Audience', AUDIENCES);
  const traineeId = p.traineeId ? str_(p.traineeId, 'Trainee', { max: 40 }) : '';
  if (traineeId && !traineeById_(traineeId)) throw err_.notFound('Trainee not found.');
  const known = allFieldKeys_();
  const table = table_('traineeVisibility');
  const existing = traineeId ? visibilityOverride_(traineeId, audience) : null;
  const who = audience === 'regular' ? 'regulars' : 'volunteers';

  if (p.reset === true) {
    if (!traineeId) throw err_.validation('Choose a trainee to reset.');
    if (existing) table.remove(existing);
    return Object.assign(visibilitySettings_({ traineeId }), { message: `This trainee now uses the default for ${who}.` });
  }
  if (!Array.isArray(p.fields)) throw err_.validation('Choose which details to show.');
  const fields = [];
  p.fields.forEach((f) => {
    const k = normHeader_(f);
    if (known.indexOf(k) === -1) throw err_.validation(`"${f}" is not a column of the trainee sheet.`);
    if (fields.indexOf(k) === -1) fields.push(k);
  });
  const value = JSON.stringify(fields);
  if (!traineeId || p.makeDefault === true) {
    saveSetting_(`visibility.${audience}`, value, admin);
    if (existing) table.remove(existing);
    return Object.assign(visibilitySettings_({ traineeId }), { message: `Saved as the default for ${who} (${fields.length} details).` });
  }
  const stamp = { fields: value, updatedBy: admin.name, updatedAt: fmtDateTime_(now_()) };
  if (existing) table.update(existing, stamp);
  else table.insert(Object.assign({ traineeId, audience }, stamp));
  return Object.assign(visibilitySettings_({ traineeId }), { message: `Saved for this trainee (${fields.length} details for ${who}).` });
}
