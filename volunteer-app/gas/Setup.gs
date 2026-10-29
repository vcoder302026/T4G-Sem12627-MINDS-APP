/**
 * Setup.gs — run these from the Apps Script editor (select the function, press Run).
 *
 *   checkConfig()     read-only: reports what setup() would change. Safe to run any time.
 *   setup()           links the app to your sheet: creates missing tabs, appends
 *                     missing headers, adds Trainee IDs if needed, creates APP_SECRET.
 *                     Safe to re-run; it never deletes, reorders or overwrites data.
 *   makeFirstAdmin()  promotes the account whose email is in the FIRST_ADMIN_EMAIL
 *                     script property (register in the app first). After that,
 *                     leaders promote others from the People tab in the app.
 */

function checkConfig() {
  return freshReads_(checkConfigInternal_);
}

function checkConfigInternal_() {
  return setupInternal_(true);
}

function setup() {
  const report = freshReads_(() => setupInternal_(false));
  bumpDataVersion_(); // cached pages (Speed.gs) are out of date after setup
  bumpPeopleVersion_();
  bumpAllTables_();
  return report;
}

function setupInternal_(dryRun) {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(CONFIG.PROP_SPREADSHEET_ID)) {
    throw new Error('Set the SPREADSHEET_ID script property first (Project Settings → Script properties). ' +
      'It is the long ID in your sheet URL: docs.google.com/spreadsheets/d/<THIS PART>/edit');
  }
  const report = [];
  if (!props.getProperty(CONFIG.PROP_SECRET)) {
    if (!dryRun) props.setProperty(CONFIG.PROP_SECRET, Utilities.getUuid() + Utilities.getUuid());
    report.push(dryRun ? 'Would create APP_SECRET.' : 'Created APP_SECRET (do not share or delete it — doing so signs everyone out and invalidates QR codes).');
  }

  const ss = spreadsheet_();
  const adminPasswordLine = ensureAdminPassword_(dryRun);
  if (adminPasswordLine) report.push(adminPasswordLine);
  report.push(`Main sheet: "${ss.getName()}"`);
  report.push(contactsOn_()
    ? `Google Contacts sync: on, label "${contactLabel_()}"${typeof People === 'undefined' ? ' (but the People API service is not added: Services (+) → People API)' : ''}. Run testContactsAccess() once to allow it.`
    : 'Google Contacts sync: off (set the script property CONTACTS_SYNC to "on" to save volunteers as contacts).');
  Object.keys(CONFIG.TABLES).forEach((key) => {
    const def = CONFIG.TABLES[key];
    const headers = Object.keys(def.columns).map((k) => def.columns[k]);
    report.push(describeTab_(bookFor_(def), def.tab, headers, dryRun, { hidden: def.hidden }));
  });
  if (visitsSpreadsheet_().getId() !== ss.getId()) report.push(`House visit sheet: "${visitsSpreadsheet_().getName()}"`);

  const t = CONFIG.TRAINEES;
  const tss = traineeSpreadsheet_();
  const tabName = traineeTabName_();
  const tsheet = tss.getSheetByName(tabName);
  const head = (k) => primaryHeader_(t.columns[k]);
  const traineeHeaders = [head('id'), head('name')]
    .concat(t.volunteerVisible.map(head))
    .concat(t.writeBack ? Object.keys(t.writeBack).map((k) => t.writeBack[k]) : []);
  if (tss.getId() !== ss.getId()) report.push(`Trainee sheet: "${tss.getName()}", tab "${tabName}"`);
  if (!tsheet) {
    report.push(describeTab_(tss, tabName, traineeHeaders, dryRun, {}) + ' — paste your trainee list into it.');
  } else {
    const lastCol = tsheet.getLastColumn();
    const existing = lastCol ? tsheet.getRange(1, 1, 1, lastCol).getValues()[0].map(normHeader_) : [];
    const hasHeader = (k) => headerOptions_(t.columns[k]).some((o) => existing.indexOf(normHeader_(o)) >= 0);
    if (!hasHeader('name')) {
      throw new Error(`The "${tabName}" tab has no name column (${headerOptions_(t.columns.name).map((h) => `"${h}"`).join(' or ')}). ` +
        'Add your header to CONFIG.TRAINEES.columns.name in Config.gs.');
    }
    // A House Visit form sheet has its own detailed columns: don't add the simple-list ones to it.
    const formSheet = existing.length > 30;
    const missingVisible = formSheet ? [] : t.volunteerVisible.filter((k) => !hasHeader(k));
    if (missingVisible.length && !CONFIG.ADD_MISSING_TRAINEE_COLUMNS) {
      report.push(`Note: "${tabName}" has no ${missingVisible.map((k) => `"${head(k)}"`).join(', ')} column(s); volunteers simply won't see those fields.`);
    }
    // Added to the trainee tab: the ID column, the two write-back columns and
    // (if ADD_MISSING_TRAINEE_COLUMNS) empty columns for volunteer-visible fields, for staff to fill.
    const required = [head('id')]
      .concat(CONFIG.ADD_MISSING_TRAINEE_COLUMNS ? missingVisible.map(head) : [])
      .concat(t.writeBack ? Object.keys(t.writeBack).map((k) => t.writeBack[k]) : []);
    report.push(describeTab_(tss, tabName, required, dryRun, {}));
    if (!dryRun) report.push(fillTraineeIds_());
    if (!dryRun) { const moved = moveHouseVisits_(); if (moved) report.push(moved); }
  }
  if (!dryRun) {
    seedContent_().forEach((line) => report.push(line));
    report.push(refreshVolunteerTypes_());
  } else {
    report.push('Would add starter venues, Volunteer Guide sections and projects to any of those tabs that are empty.');
  }
  const text = report.join('\n');
  console.log(text);
  return text;
}

function describeTab_(ss, tab, headers, dryRun, opts) {
  if (dryRun) {
    const sheet = ss.getSheetByName(tab);
    if (!sheet) return `Would create tab "${tab}".`;
    const lastCol = sheet.getLastColumn();
    const existing = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(normHeader_) : [];
    const missing = headers.filter((h) => !headerOptions_(h).some((o) => existing.indexOf(normHeader_(o)) >= 0)).map(primaryHeader_);
    return missing.length ? `Would add to "${tab}": ${missing.join(', ')}` : `"${tab}" is ready.`;
  }
  const r = ensureTab_(ss, tab, headers, opts);
  if (r.created) return `Created tab "${tab}".`;
  return r.added.length ? `Added to "${tab}": ${r.added.join(', ')}` : `"${tab}" is ready.`;
}

/** Gives every named trainee without an ID a stable one (T-0001, …). Existing IDs are kept. */
/**
 * Version 4 keeps house visit records in the trainee spreadsheet. Copies the records from the
 * volunteer sheet's House Visits tab (Versions 2–3) when the new tab has none yet; the old tab
 * is left as it is (it can be deleted afterwards).
 */
function moveHouseVisits_() {
  const tab = CONFIG.TABLES.houseVisits.tab;
  const from = spreadsheet_().getSheetByName(tab);
  const toBook = visitsSpreadsheet_();
  if (!from || toBook.getId() === spreadsheet_().getId() || from.getLastRow() < 2) return '';
  const to = toBook.getSheetByName(tab) || toBook.insertSheet(tab);
  if (to.getLastRow() > 1) return '';
  const values = from.getRange(1, 1, from.getLastRow(), from.getLastColumn()).getValues();
  to.getRange(1, 1, values.length, values[0].length).setValues(values);
  resetDbCache_();
  return `Moved ${values.length - 1} house visit record(s) to the trainee spreadsheet ("${toBook.getName()}"). The old "${tab}" tab in the volunteer sheet can be deleted.`;
}

function fillTraineeIds_() {
  resetDbCache_();
  const table = traineeTable_();
  const rows = table.rows();
  let max = 0;
  rows.forEach((r) => {
    const m = /^T-(\d+)$/.exec(String(r.id));
    if (m) max = Math.max(max, Number(m[1]));
  });
  let filled = 0;
  rows.forEach((r) => {
    if (r.name && !r.id) {
      max += 1;
      table.update(r, { id: `T-${String(max).padStart(4, '0')}` });
      filled += 1;
    }
  });
  filled += AUTO_TRAINEE_IDS_; // filled in earlier in this run, when the trainee list was first read
  AUTO_TRAINEE_IDS_ = 0;
  return filled ? `Added IDs to ${filled} trainee(s).` : 'All trainees already have IDs.';
}

function makeFirstAdmin() {
  return freshReads_(makeFirstAdminInternal_);
}

function makeFirstAdminInternal_() {
  const email = String(PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_FIRST_ADMIN_EMAIL) || '').trim().toLowerCase();
  if (!email) throw new Error('Set the FIRST_ADMIN_EMAIL script property to the email you registered with in the app.');
  resetDbCache_();
  const users = table_('users');
  const user = users.find((u) => String(u.email).toLowerCase() === email);
  if (!user) throw new Error(`No registered account for ${email}. Register in the app first, then run this again.`);
  users.update(user, { role: 'admin' });
  makeRegularAsAdmin_(user); // admins are regular volunteers by default
  bumpPeopleVersion_(); // their next request sees the admin role (Speed.gs)
  bumpAllTables_();
  const msg = `${user.name} (${email}) is now an admin and a regular volunteer.`;
  logAdminAction_({ userId: '', name: 'Apps Script editor' }, 'makeFirstAdmin', { userId: user.userId }, null);
  console.log(msg);
  return msg;
}

/**
 * Gives everyone a Volunteer Type and promotes anyone who has already
 * attended REGULAR_AFTER_SESSIONS sessions (unless an admin set their type by hand).
 */
function refreshVolunteerTypes_() {
  resetDbCache_();
  const users = table_('users');
  let filled = 0;
  let promoted = 0;
  users.rows().forEach((u) => {
    if (!u.userId) return;
    if (!u.volunteerType) {
      users.update(u, { volunteerType: 'volunteer' });
      filled += 1;
    }
    if (maybePromote_(u.userId)) promoted += 1;
    // Admins are regular volunteers by default, unless a person deliberately set them back.
    const setByPerson = u.typeSetBy && !/^(automatic|made an admin)/i.test(String(u.typeSetBy));
    if (u.role === 'admin' && !setByPerson && makeRegularAsAdmin_(u)) promoted += 1;
  });
  const parts = [];
  if (filled) parts.push(`set ${filled} volunteer type(s) to "volunteer"`);
  if (promoted) parts.push(`promoted ${promoted} to regular (${CONFIG.REGULAR_AFTER_SESSIONS}+ sessions)`);
  return parts.length ? `Volunteer types: ${parts.join(', ')}.` : 'Volunteer types are up to date.';
}
