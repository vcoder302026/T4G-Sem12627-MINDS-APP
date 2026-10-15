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
  return setupInternal_(true);
}

function setup() {
  return setupInternal_(false);
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
  report.push(`Main sheet: "${ss.getName()}"`);
  Object.keys(CONFIG.TABLES).forEach((key) => {
    const def = CONFIG.TABLES[key];
    const headers = Object.keys(def.columns).map((k) => def.columns[k]);
    report.push(describeTab_(ss, def.tab, headers, dryRun, { hidden: def.hidden }));
  });

  const t = CONFIG.TRAINEES;
  const tss = traineeSpreadsheet_();
  const tsheet = tss.getSheetByName(t.tab);
  const traineeHeaders = [t.columns.id, t.columns.name]
    .concat(t.volunteerVisible.map((k) => t.columns[k]))
    .concat(t.writeBack ? Object.keys(t.writeBack).map((k) => t.writeBack[k]) : []);
  if (!tsheet) {
    report.push(describeTab_(tss, t.tab, traineeHeaders, dryRun, {}) + ' — paste your trainee list into it.');
  } else {
    const lastCol = tsheet.getLastColumn();
    const existing = lastCol ? tsheet.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h).trim().toLowerCase()) : [];
    if (existing.indexOf(t.columns.name.toLowerCase()) === -1) {
      throw new Error(`The "${t.tab}" tab has no "${t.columns.name}" column. Change CONFIG.TRAINEES.columns.name in Config.gs to your sheet's header.`);
    }
    const missingVisible = t.volunteerVisible.filter((k) => existing.indexOf(String(t.columns[k]).toLowerCase()) === -1);
    if (missingVisible.length && !CONFIG.ADD_MISSING_TRAINEE_COLUMNS) {
      report.push(`Note: "${t.tab}" has no ${missingVisible.map((k) => `"${t.columns[k]}"`).join(', ')} column(s); volunteers simply won't see those fields.`);
    }
    // Added to the trainee tab: the ID column, the two write-back columns and
    // (if ADD_MISSING_TRAINEE_COLUMNS) empty columns for volunteer-visible fields, for staff to fill.
    const required = [t.columns.id]
      .concat(CONFIG.ADD_MISSING_TRAINEE_COLUMNS ? missingVisible.map((k) => t.columns[k]) : [])
      .concat(t.writeBack ? Object.keys(t.writeBack).map((k) => t.writeBack[k]) : []);
    report.push(describeTab_(tss, t.tab, required, dryRun, {}));
    if (!dryRun) report.push(fillTraineeIds_());
  }
  if (!dryRun) seedContent_().forEach((line) => report.push(line));
  else report.push('Would add starter venues, Volunteer Guide sections and projects to any of those tabs that are empty.');
  const text = report.join('\n');
  console.log(text);
  return text;
}

function describeTab_(ss, tab, headers, dryRun, opts) {
  if (dryRun) {
    const sheet = ss.getSheetByName(tab);
    if (!sheet) return `Would create tab "${tab}".`;
    const lastCol = sheet.getLastColumn();
    const existing = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h).trim().toLowerCase()) : [];
    const missing = headers.filter((h) => existing.indexOf(String(h).toLowerCase()) === -1);
    return missing.length ? `Would add to "${tab}": ${missing.join(', ')}` : `"${tab}" is ready.`;
  }
  const r = ensureTab_(ss, tab, headers, opts);
  if (r.created) return `Created tab "${tab}".`;
  return r.added.length ? `Added to "${tab}": ${r.added.join(', ')}` : `"${tab}" is ready.`;
}

/** Gives every named trainee without an ID a stable one (T-0001, …). Existing IDs are kept. */
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
  return filled ? `Added IDs to ${filled} trainee(s).` : 'All trainees already have IDs.';
}

function makeFirstAdmin() {
  const email = String(PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_FIRST_ADMIN_EMAIL) || '').trim().toLowerCase();
  if (!email) throw new Error('Set the FIRST_ADMIN_EMAIL script property to the email you registered with in the app.');
  resetDbCache_();
  const users = table_('users');
  const user = users.find((u) => String(u.email).toLowerCase() === email);
  if (!user) throw new Error(`No registered account for ${email}. Register in the app first, then run this again.`);
  users.update(user, { role: 'admin' });
  const msg = `${user.name} (${email}) is now a volunteer leader.`;
  console.log(msg);
  return msg;
}
