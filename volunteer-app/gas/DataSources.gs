/**
 * Google Sheets the app uses (Admin → Settings → Google Sheets), linked from
 * the app as in CSL Attendance's "Manage Google Sheet": create a new sheet,
 * search Google Drive for one, or paste a URL / ID. The app checks the sheet
 * before linking it.
 *
 *   volunteers  SPREADSHEET_ID          the app's own data and everyone's sign-ins
 *   trainees    TRAINEE_SPREADSHEET_ID  MINDS's trainee list (e.g. the House Visit form responses)
 *   visits      VISITS_SPREADSHEET_ID   house visit records (empty = the volunteer sheet)
 *
 * The volunteer sheet holds everyone's sign-ins, so linking another one would
 * sign everyone out. It can only be linked if it has the linking admin's own
 * account (i.e. it is a copy of this database), and "Create new sheet" makes
 * exactly that: a copy of the current one.
 */

const DATA_SOURCES = {
  volunteers: {
    label: 'Volunteer database',
    about: 'Volunteers, sessions, sign-ups, attendance, pairings, notes, settings and everyone\'s sign-ins.',
    prop: CONFIG.PROP_SPREADSHEET_ID,
  },
  trainees: {
    label: 'Trainee & house visit database',
    about: 'MINDS\'s House Visit form responses: the trainee list (Form Responses 1), and a House Visits tab with every visit recorded in the app.',
    prop: CONFIG.PROP_TRAINEE_SPREADSHEET_ID,
  },
};
const SPREADSHEET_MIME_ = 'application/vnd.google-apps.spreadsheet';

/** Tabs the volunteer database must have before it can be linked. */
const REQUIRED_VOLUNTEER_TABS_ = ['users', 'auth', 'sessions', 'bookings', 'attendance'];

const sheetUrl_ = (ss, gid) => `https://docs.google.com/spreadsheets/d/${ss.getId()}/edit${gid !== null && gid !== undefined ? `#gid=${gid}` : ''}`;
const headerRow_ = (sheet) => (sheet && sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(normHeader_) : []);

/** The first tab with a trainee name column (or the #gid tab). Returns the sheet, or null. */
function traineeTabIn_(ss, gid) {
  const names = headerOptions_(CONFIG.TRAINEES.columns.name).map(normHeader_);
  const hasName = (sh) => headerRow_(sh).some((h) => names.indexOf(h) >= 0);
  if (gid !== null && gid !== undefined) {
    const sh = ss.getSheets().find((x) => x.getSheetId() === gid);
    return sh && hasName(sh) ? sh : null;
  }
  return ss.getSheets().find(hasName) || null;
}

/** What's in a sheet for a data source: { ok, found: [..], missing: [..] }. */
function checkSheet_(key, ss, gid, admin) {
  if (key === 'volunteers') {
    const tabs = REQUIRED_VOLUNTEER_TABS_.map((k) => CONFIG.TABLES[k].tab);
    const missing = tabs.filter((t) => !ss.getSheetByName(t));
    let account = '';
    if (!missing.length && admin) {
      const t = new Table(ss, CONFIG.TABLES.users.tab, CONFIG.TABLES.users.columns, [], `check:users:${ss.getId()}`);
      const me = t.rows().find((u) => u.userId === admin.userId && u.role === 'admin' && u.status !== 'inactive');
      const a = new Table(ss, CONFIG.TABLES.auth.tab, CONFIG.TABLES.auth.columns, [], `check:auth:${ss.getId()}`);
      if (!me || !a.rows().some((r) => r.userId === admin.userId)) account = 'your admin account (so nobody is signed out)';
    }
    return { ok: !missing.length && !account, found: tabs.filter((t) => missing.indexOf(t) === -1), missing: missing.concat(account ? [account] : []) };
  }
  if (key === 'trainees') {
    const sh = traineeTabIn_(ss, gid);
    const name = primaryHeader_(CONFIG.TRAINEES.columns.name);
    return sh ? { ok: true, found: [`tab "${sh.getName()}" with a trainee name column`], missing: [], tab: sh }
      : { ok: false, found: [], missing: [`a tab with a "${name}" or "Trainee’s Full Name" column`] };
  }
  const tab = CONFIG.TABLES.houseVisits.tab;
  return ss.getSheetByName(tab) ? { ok: true, found: [`"${tab}" tab`], missing: [] }
    : { ok: true, found: [], missing: [], note: `The "${tab}" tab will be added.` };
}

/** Admin → Settings → Google Sheets: each database, the sheet it uses, and whether it looks right. */
function dataSources_(p, admin) {
  const props = PropertiesService.getScriptProperties();
  const main = spreadsheet_();
  return {
    sources: Object.keys(DATA_SOURCES).map((key) => {
      const d = DATA_SOURCES[key];
      const ref = parseSheetRef_(props.getProperty(d.prop));
      let ss = main;
      let gid = null;
      let sharesVolunteerSheet = !ref && key !== 'volunteers';
      try {
        if (ref) { ss = SpreadsheetApp.openById(ref.id); gid = ref.gid; }
      } catch (e) {
        return { key, label: d.label, about: d.about, linked: null, error: 'The app\'s Google account can\'t open the linked sheet. Share it with that account, or link another.' };
      }
      if (key === 'trainees' && ref === null) sharesVolunteerSheet = true;
      const check = checkSheet_(key, ss, gid, key === 'volunteers' ? admin : null);
      const tab = key === 'trainees' && check.tab ? check.tab.getName() : key === 'visits' ? CONFIG.TABLES.houseVisits.tab : '';
      return {
        key, label: d.label, about: d.about,
        linked: { id: ss.getId(), name: ss.getName(), url: sheetUrl_(ss, key === 'trainees' && check.tab ? check.tab.getSheetId() : gid), tab, sharesVolunteerSheet },
        check: { ok: check.ok, found: check.found, missing: check.missing, note: check.note || '' },
      };
    }),
  };
}

/** Search Google Drive for spreadsheets by name (as CSL Attendance's "Search for a Google Sheet"). */
function searchSheets_(p) {
  onlyFields_(p, ['query']);
  const q = str_(p.query, 'Search', { max: 100 }).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const it = DriveApp.searchFiles(`mimeType = '${SPREADSHEET_MIME_}' and trashed = false${q ? ` and title contains '${q}'` : ''}`);
  const out = [];
  while (it.hasNext() && out.length < 20) {
    const f = it.next();
    out.push({ id: f.getId(), name: f.getName(), url: f.getUrl(), updated: fmtDateTime_(f.getLastUpdated()) });
  }
  return { results: out };
}

function openSheetOrExplain_(ref) {
  try {
    return SpreadsheetApp.openById(ref.id);
  } catch (e) {
    throw err_.validation('The app\'s Google account can\'t open that sheet. Check the link, or share the sheet with that account as an editor.');
  }
}

/** Links a sheet (by URL or ID) to a database, after checking it. Needs the admin password. */
function connectDataSource_(p, admin) {
  onlyFields_(p, ['source', 'ref', 'adminPassword']);
  const key = oneOf_(p.source, 'Database', Object.keys(DATA_SOURCES));
  checkAdminPassword_(admin, p.adminPassword, 'Enter the admin password to link a different sheet.');
  const ref = parseSheetRef_(str_(p.ref, 'Sheet URL or ID', { required: true, max: 500 }));
  const ss = openSheetOrExplain_(ref);
  const check = checkSheet_(key, ss, ref.gid, admin);
  if (!check.ok) {
    if (key === 'volunteers' && check.missing.some((m) => /admin account/.test(m))) {
      throw err_.conflict('That sheet doesn\'t have your admin account, so linking it would sign everyone out, including you. Use "Create new sheet" (a copy of the current database), or link a copy of this database.');
    }
    throw err_.validation(`That sheet is missing: ${check.missing.join('; ')}.`);
  }
  return linkSheet_(key, ss, check, admin, `Linked "${ss.getName()}" as the ${DATA_SOURCES[key].label.toLowerCase()}.`);
}

/**
 * "Create new sheet". Volunteer database: a copy of the current one (sign-ins
 * included, so nobody is signed out). Trainee / house visit database: a new
 * sheet with the right tab and columns.
 */
function createDataSource_(p, admin) {
  onlyFields_(p, ['source', 'name', 'adminPassword']);
  const key = oneOf_(p.source, 'Database', Object.keys(DATA_SOURCES));
  checkAdminPassword_(admin, p.adminPassword, 'Enter the admin password to create and link a new sheet.');
  const d = DATA_SOURCES[key];
  const name = str_(p.name, 'Sheet name', { max: 120 }) || `MINDS Volunteer App – ${d.label} (${todayStr_()})`;
  let ss;
  if (key === 'volunteers') {
    ss = SpreadsheetApp.openById(DriveApp.getFileById(spreadsheet_().getId()).makeCopy(name).getId());
  } else {
    ss = SpreadsheetApp.create(name);
    const first = ss.getSheets()[0];
    if (key === 'trainees') {
      first.setName(CONFIG.TRAINEES.tab);
      first.getRange(1, 1, 1, 2).setValues([[primaryHeader_(CONFIG.TRAINEES.columns.id), primaryHeader_(CONFIG.TRAINEES.columns.name)]]);
    }
  }
  const check = checkSheet_(key, ss, null, admin);
  return linkSheet_(key, ss, check, admin, `Created "${name}" and linked it as the ${d.label.toLowerCase()}.`);
}

/** Saves the link, opens it, and runs setup so missing tabs and columns are added. */
function linkSheet_(key, ss, check, admin, message) {
  const props = PropertiesService.getScriptProperties();
  const gid = key === 'trainees' && check.tab ? check.tab.getSheetId() : null;
  props.setProperty(DATA_SOURCES[key].prop, sheetUrl_(ss, gid));
  resetBooks_();
  const report = setupInternal_(false);
  return Object.assign(dataSources_({}, admin), { message, report });
}

/** Trainee or house visit database: stop using a separate sheet (back to the volunteer database). */
function unlinkDataSource_(p, admin) {
  onlyFields_(p, ['source', 'adminPassword']);
  const key = oneOf_(p.source, 'Database', ['trainees']);
  checkAdminPassword_(admin, p.adminPassword, 'Enter the admin password to change the linked sheet.');
  PropertiesService.getScriptProperties().deleteProperty(DATA_SOURCES[key].prop);
  resetBooks_();
  const report = setupInternal_(false);
  return Object.assign(dataSources_({}, admin), { message: `The ${DATA_SOURCES[key].label.toLowerCase()} now uses the volunteer database.`, report });
}
