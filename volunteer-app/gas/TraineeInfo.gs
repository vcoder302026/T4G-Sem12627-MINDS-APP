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

/** Section titles in the House Visit Form's order (Config.gs → HOUSE_VISIT.sectionOrder); others after, "Other details" last. */
function formSectionOrder_(titles) {
  const want = HOUSE_VISIT.sectionOrder.map(normHeader_);
  const rank = (t) => {
    const i = want.indexOf(normHeader_(t));
    return i >= 0 ? i : t === 'Other details' ? 999 : 500;
  };
  return titles.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map((x) => x.t);
}

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
  const hiddenSections = (CONFIG.TRAINEES.hiddenSections || []).map(normHeader_);
  const map = sectionMap_();
  const groups = {};
  table.allHeaders().forEach((h) => {
    if (skip.indexOf(h.norm) >= 0) return;
    const title = map.bySection[h.norm] || 'Other details';
    if (hiddenSections.indexOf(normHeader_(title)) >= 0) return;
    (groups[title] = groups[title] || []).push(h);
  });
  const order = formSectionOrder_(map.order.filter((t) => groups[t]).concat(Object.keys(groups).filter((t) => map.order.indexOf(t) === -1)));
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

/*
 * Notes in the same filter. "What volunteers see" also lists the trainee's
 * notes, split by who wrote them, so the filter covers the updates volunteers
 * send as well as the details:
 *   notes:volunteer   notes from volunteers (session feedback and trainee updates)
 *   notes:admin       notes added by admins
 * Lists saved before this existed have no "notes:set" marker: notes stay shown.
 */
const NOTE_FILTER = {
  marker: 'notes:set',
  title: 'Notes',
  fields: [
    { key: 'notes:volunteer', label: 'Notes from volunteers (session feedback and updates)' },
    { key: 'notes:admin', label: 'Notes from admins' },
  ],
};

function noteFilterKeys_() {
  return NOTE_FILTER.fields.map((f) => f.key);
}

/** { volunteer: bool, admin: bool }: which notes an audience sees for this trainee (each note's own sharing still applies). */
function notesShown_(traineeId, audience) {
  const fields = visibleFor_(traineeId, audience).fields;
  if (fields.indexOf(NOTE_FILTER.marker) === -1) return { volunteer: true, admin: true };
  return { volunteer: fields.indexOf('notes:volunteer') >= 0, admin: fields.indexOf('notes:admin') >= 0 };
}

/* ---------------- building the views ---------------- */

/** A trainee's details, grouped. `allowed` = list of field keys, or null for everything. */
/**
 * A sheet value as people read it: dates and form timestamps ("2025-12-29",
 * "2025-12-29 20:26:09") become "29 Dec 2025"; everything else is unchanged.
 */
function displayValue_(value) {
  const s = String(value === null || value === undefined ? '' : value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(s);
  if (!m) return s;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = months[Number(m[2]) - 1];
  return mon ? `${Number(m[3])} ${mon} ${m[1]}` : s;
}

function traineeSectionsView_(row, allowed) {
  const table = traineeTable_();
  const ok = allowed ? allowed.reduce((m, k) => { m[k] = true; return m; }, {}) : null;
  return traineeSections_().map((s) => ({
    title: s.title,
    fields: s.headers.filter((h) => !ok || ok[h.norm]).map((h) => ({ key: h.norm, label: h.header, value: displayValue_(table.rawValue(row, h.index)) }))
      .filter((f) => f.value !== ''),
  })).filter((s) => s.fields.length);
}

function traineeBasics_(row) {
  return { id: String(row.id), name: row.name, preferredName: row.preferredName || '', gender: row.gender || '', photoUrl: traineePhotoUrl_(row.id) };
}

/* ---------------- photos ---------------- */

/** Trainee ID → Drive file ID, read once per request. */
function traineePhotoMap_() {
  if (DB_.cache.traineePhotos) return DB_.cache.traineePhotos;
  const map = {};
  table_('traineePhotos').rows().forEach((r) => { if (r.traineeId && r.fileId) map[String(r.traineeId)] = r.fileId; });
  DB_.cache.traineePhotos = map;
  return map;
}

/** The photo's address for an <img>, or '' (the app then shows a placeholder). */
function traineePhotoUrl_(traineeId) {
  const fileId = traineePhotoMap_()[String(traineeId)];
  return fileId ? driveImageUrl_(fileId, 600) : '';
}

/**
 * Admin adds, replaces (upload, or a Google Drive link) or removes (`remove: true`)
 * a trainee's photo. Removing it leaves the file in Google Drive.
 */
function setTraineePhoto_(p, admin) {
  onlyFields_(p, ['traineeId', 'remove', 'driveUrl', 'data', 'fileName', 'mimeType']);
  const traineeId = str_(p.traineeId, 'Trainee', { required: true, max: 40 });
  const trainee = traineeById_(traineeId);
  if (!trainee) throw err_.notFound('Trainee not found.');
  const photos = table_('traineePhotos');
  const existing = photos.find((r) => String(r.traineeId) === traineeId);
  delete DB_.cache.traineePhotos;
  if (p.remove === true) {
    if (existing) photos.remove(existing);
    return Object.assign(traineeProfile_({ traineeId }), { message: `Removed ${trainee.name}'s photo.` });
  }
  const rules = CONFIG.TRAINEE_PHOTOS;
  const saved = saveDriveImage_(p, rules.types, rules.maxMb, CONFIG.PROP_PHOTO_FOLDER_ID, rules.folderName, 'photo');
  const stamp = { traineeName: trainee.name, fileId: saved.file.getId(), updatedBy: admin.name, updatedAt: fmtDateTime_(now_()) };
  if (existing) photos.update(existing, stamp);
  else photos.insert(Object.assign({ traineeId }, stamp));
  delete DB_.cache.traineePhotos;
  return Object.assign(traineeProfile_({ traineeId }), { message: `${existing ? 'Changed' : 'Added'} ${trainee.name}'s photo.${saved.warning}` });
}

/** The first few details for a short card: most useful sections first (Config.gs → TRAINEES.cardSections), form bookkeeping left out. */
function cardFields_(sections, max) {
  const prefer = (CONFIG.TRAINEES.cardSections || []).map(normHeader_);
  const skip = (CONFIG.TRAINEES.cardSkipSections || []).map(normHeader_);
  const rank = (s) => { const i = prefer.indexOf(normHeader_(s.title)); return i < 0 ? prefer.length : i; };
  const ordered = sections.filter((s) => skip.indexOf(normHeader_(s.title)) === -1)
    .map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map((x) => x.s);
  const fields = [];
  ordered.forEach((s) => s.fields.forEach((f) => { if (fields.length < max) fields.push({ key: f.key, label: f.label, value: f.value }); }));
  return fields;
}

/**
 * What Home shows about a trainee: name and photo only. The details come when
 * the volunteer presses and holds the name, or opens the trainee's page
 * (traineeInfo_), so less personal data sits on volunteers' phones.
 */
function traineeOnHome_(id) {
  const row = traineeById_(id);
  return row ? traineeBasics_(row) : null;
}

/** A short trainee card with up to 8 allowed details and shared notes (kept for other screens). */
function traineeForVolunteer_(id, user) {
  const row = traineeById_(id);
  if (!row) return null;
  const audience = user ? volunteerType_(user) : 'volunteer';
  const allowed = user && user.role === 'admin' ? null : visibleFor_(row.id, audience).fields;
  const sections = traineeSectionsView_(row, allowed);
  const fields = cardFields_(sections, 8);
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
    && hasTrainee_(b, traineeId) && String(b.sessionDate) >= from);
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
    && hasTrainee_(b, traineeId) && String(b.sessionDate) >= today), (b) => b.sessionDate)
    .map((b) => { const s = sessionById[b.sessionId] || {}; return { date: b.sessionDate, title: s.title || b.sessionTitle, startTime: s.startTime || '', endTime: s.endTime || '' }; });
  const regulars = standingRows_().filter((x) => String(x.traineeId) === traineeId)
    .map((x) => x.volunteerName);
  const mine = activeStandings_(user.userId);
  const sections = traineeSectionsView_(row, allowed);
  return {
    trainee: traineeBasics_(row),
    access,
    sections,
    summary: cardFields_(sections, 5), // for the press-and-hold quick card
    notes: notesFor_(row.id, user, access, access === 'volunteer' ? CONFIG.NOTES_SHOWN_TO_VOLUNTEERS : 0),
    together,
    regulars: access === 'volunteer' ? [] : regulars,
    isMyRegular: mine.some((x) => String(x.traineeId) === traineeId),
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
  const mine = activeStandings_(user.userId);
  return {
    myTraineeIds: mine.map((x) => String(x.traineeId)),
    myTraineeId: mine.length ? String(mine[0].traineeId) : '', // the first, for older screens
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
  // Goes to Trainees → Notes to review, next to session feedback, where an admin chooses who can read it.
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
  // Older saved lists have no notes marker, so their notes show as ticked.
  AUDIENCES.forEach((a) => {
    const f = audiences[a].fields;
    if (f.indexOf(NOTE_FILTER.marker) === -1) audiences[a].fields = f.concat(noteFilterKeys_());
  });
  return {
    trainee,
    sections: traineeSections_().map((s) => ({ title: s.title, fields: s.headers.map((h) => ({ key: h.norm, label: h.header })) }))
      .concat([{ title: NOTE_FILTER.title, notes: true, fields: NOTE_FILTER.fields.slice() }]),
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
  const known = allFieldKeys_().concat(noteFilterKeys_(), [NOTE_FILTER.marker]);
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
  if (fields.indexOf(NOTE_FILTER.marker) === -1) fields.push(NOTE_FILTER.marker); // this list decides notes too
  const value = JSON.stringify(fields);
  const details = fields.filter((k) => !/^notes:/.test(k)).length;
  if (!traineeId || p.makeDefault === true) {
    saveSetting_(`visibility.${audience}`, value, admin);
    if (existing) table.remove(existing);
    return Object.assign(visibilitySettings_({ traineeId }), { message: `Saved as the default for ${who} (${details} details).` });
  }
  const stamp = { fields: value, updatedBy: admin.name, updatedAt: fmtDateTime_(now_()) };
  if (existing) table.update(existing, stamp);
  else table.insert(Object.assign({ traineeId, audience }, stamp));
  return Object.assign(visibilitySettings_({ traineeId }), { message: `Saved for this trainee (${details} details for ${who}).` });
}
