/**
 * Db.gs — Google Sheets as tables.
 *
 * Each tab is read once per request (getValues on the whole used range), turned
 * into plain objects keyed by the names in Config.gs, and cached for the rest
 * of that request. Columns are located by their header text, so the app works
 * with an existing sheet whatever its column order, and never touches columns
 * it does not know about.
 *
 * Writes are cell-precise: update() only writes the cells it changes, so a
 * staff member editing another column of the same row is not overwritten.
 */

const DB_ = { cache: {}, books: {}, memo: {} };

function resetDbCache_() {
  DB_.cache = {};
  DB_.memo = {}; // per-request derived values (data source links, session counts…)
}

/** Remembers fn() for the rest of this request. */
function memo_(key, fn) {
  if (!(key in DB_.memo)) DB_.memo[key] = fn();
  return DB_.memo[key];
}

function openBook_(id) {
  const key = `id:${id}`;
  if (!DB_.books[key]) DB_.books[key] = SpreadsheetApp.openById(String(id).trim());
  return DB_.books[key];
}

function spreadsheet_() {
  if (!DB_.books.main) {
    const id = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_SPREADSHEET_ID);
    if (!id) throw err_.config('SPREADSHEET_ID is not set. Add it under Project Settings → Script properties.');
    DB_.books.main = SpreadsheetApp.openById(String(id).trim());
  }
  return DB_.books.main;
}

/** The trainee spreadsheet when no Data Sources link is set (TRAINEE_SPREADSHEET_ID, else the main one). */
function defaultTraineeSpreadsheet_() {
  if (!DB_.books.trainees) {
    const id = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_TRAINEE_SPREADSHEET_ID);
    DB_.books.trainees = id ? SpreadsheetApp.openById(String(id).trim()) : spreadsheet_();
  }
  return DB_.books.trainees;
}

function traineeSpreadsheet_() {
  return sheetLocation_('trainees').ss;
}

/** Table for an app-owned tab: table_('users'), table_('bookings'), … */
function table_(key) {
  const def = CONFIG.TABLES[key];
  if (key === 'users') {
    const loc = sheetLocation_('volunteers');
    return new Table(loc.ss, loc.tab, def.columns, def.numeric || [], `app:${key}`);
  }
  return new Table(spreadsheet_(), def.tab, def.columns, def.numeric || [], `app:${key}`);
}

/** Table over the existing trainee tab (see Config.gs → TRAINEES). */
function traineeTable_() {
  const t = CONFIG.TRAINEES;
  const columns = Object.assign({}, t.columns, t.writeBack || {});
  const loc = sheetLocation_('trainees');
  return new Table(loc.ss, loc.tab, columns, [], 'trainees');
}

/* ---------- links to other databases (the "Data Sources" tab) ---------- */

/** "https://docs.google.com/spreadsheets/d/<id>/edit#gid=<gid>" (or a bare ID) → { id, gid }. */
function parseSheetUrl_(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]{6,})/.exec(s);
  const id = m ? m[1] : /^[A-Za-z0-9_-]{6,}$/.test(s) ? s : '';
  if (!id) return null;
  const g = /[#?&]gid=(\d+)/.exec(s);
  return { id, gid: g ? g[1] : '' };
}

/** "https://drive.google.com/drive/folders/<id>" (or a bare ID) → id. */
function parseFolderUrl_(url) {
  const s = String(url || '').trim();
  const m = /\/folders\/([A-Za-z0-9_-]{6,})/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{6,}$/.test(s) ? s : '';
}

/** Rows of the Data Sources tab by key ({} before setup() has created the tab). */
function dataSourceRows_() {
  return memo_('dataSources', () => {
    const def = CONFIG.TABLES.dataSources;
    if (!spreadsheet_().getSheetByName(def.tab)) return {};
    return byKey_(table_('dataSources').rows().filter((r) => r.key), 'key');
  });
}

/**
 * Where a linked database lives: { ss, tab, linked, url }.
 * A link with #gid=… picks that tab; otherwise the Tab Name column, else the default tab.
 * Returns null for an optional database that is not linked (trainee updates, pairs).
 */
function sheetLocation_(key) {
  return memo_(`loc:${key}`, () => {
    const def = dataSourceDefs_()[key];
    const row = dataSourceRows_()[key];
    const link = row && row.url ? parseSheetUrl_(row.url) : null;
    if (row && row.url && !link) throw err_.config(`The "${def.label}" link in the Data Sources tab is not a Google Sheets link.`);
    if (!link) {
      if (key === 'volunteers') return { ss: spreadsheet_(), tab: CONFIG.TABLES.users.tab, linked: false, url: '' };
      if (key === 'trainees') return { ss: defaultTraineeSpreadsheet_(), tab: CONFIG.TRAINEES.tab, linked: false, url: '' };
      return null;
    }
    let ss;
    try {
      ss = openBook_(link.id);
    } catch (e) {
      throw err_.config(`The app cannot open the "${def.label}" sheet. Share it with the account that runs the app, or fix the link in Admin → Settings → Databases.`);
    }
    let tab = (row.tab || def.tab || '').trim();
    if (link.gid) {
      const sheet = ss.getSheets().find((sh) => String(sh.getSheetId()) === link.gid);
      if (!sheet) throw err_.config(`The "${def.label}" link points at a tab that no longer exists. Fix it in Admin → Settings → Databases.`);
      tab = sheet.getName();
    }
    return { ss, tab, linked: true, url: row.url };
  });
}

class Table {
  constructor(ss, tab, columns, numeric, cacheKey) {
    this.ss = ss;
    this.tab = tab;
    this.columns = columns;
    this.numeric = numeric;
    this.cacheKey = cacheKey;
  }

  load_() {
    if (DB_.cache[this.cacheKey]) return DB_.cache[this.cacheKey];
    const sheet = this.ss.getSheetByName(this.tab);
    if (!sheet) throw err_.config(`The "${this.tab}" tab was not found. Run setup() or check Config.gs.`);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const values = lastRow && lastCol ? sheet.getRange(1, 1, lastRow, lastCol).getValues() : [[]];
    const headers = (values[0] || []).map((h) => String(h).trim().toLowerCase());
    const colIndex = {};
    Object.keys(this.columns).forEach((key) => {
      const i = headers.indexOf(String(this.columns[key]).trim().toLowerCase());
      if (i >= 0) colIndex[key] = i;
    });
    const tz = this.ss.getSpreadsheetTimeZone() || CONFIG.TIMEZONE;
    const rows = [];
    for (let r = 1; r < values.length; r++) {
      const raw = values[r];
      if (raw.every((v) => v === '' || v === null)) continue;
      const row = { _row: r + 1 };
      Object.keys(this.columns).forEach((key) => {
        row[key] = key in colIndex ? cellToValue_(raw[colIndex[key]], this.numeric.indexOf(key) >= 0, tz) : '';
      });
      rows.push(row);
    }
    const state = { sheet, rows, colIndex, width: lastCol };
    DB_.cache[this.cacheKey] = state;
    return state;
  }

  rows() {
    return this.load_().rows;
  }
  hasColumn(key) {
    return key in this.load_().colIndex;
  }
  find(pred) {
    return this.rows().find(pred) || null;
  }
  filter(pred) {
    return this.rows().filter(pred);
  }

  insert(record) {
    const st = this.load_();
    const out = new Array(st.width).fill('');
    Object.keys(record).forEach((key) => {
      if (key in st.colIndex) out[st.colIndex[key]] = valueToCell_(record[key]);
    });
    const rowNum = st.sheet.getLastRow() + 1;
    if (rowNum > st.sheet.getMaxRows()) st.sheet.insertRowsAfter(st.sheet.getMaxRows(), 50);
    // Plain-text format first, so "2026-10-14", "09:30" and "+65 9…" stay exactly as typed.
    st.sheet.getRange(rowNum, 1, 1, st.width).setNumberFormat('@');
    this.numeric.forEach((key) => {
      if (key in st.colIndex) st.sheet.getRange(rowNum, st.colIndex[key] + 1).setNumberFormat('0.##');
    });
    st.sheet.getRange(rowNum, 1, 1, st.width).setValues([out]);
    const row = { _row: rowNum };
    Object.keys(this.columns).forEach((key) => {
      row[key] = record[key] === undefined || record[key] === null ? '' : record[key];
    });
    st.rows.push(row);
    return row;
  }

  /** Deletes the row from the sheet (rows below move up, so the cache is dropped). */
  remove(row) {
    const st = this.load_();
    st.sheet.deleteRow(row._row);
    delete DB_.cache[this.cacheKey];
  }

  update(row, patch) {
    const st = this.load_();
    Object.keys(patch).forEach((key) => {
      if (!(key in st.colIndex)) return; // optional column not present in this sheet
      const cell = st.sheet.getRange(row._row, st.colIndex[key] + 1);
      cell.setNumberFormat(this.numeric.indexOf(key) >= 0 ? '0.##' : '@');
      cell.setValue(valueToCell_(patch[key]));
      row[key] = patch[key];
    });
    return row;
  }
}

/** Sheet cell → JS value. Dates typed by staff come back as Date objects. */
function cellToValue_(v, numeric, tz) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date || Object.prototype.toString.call(v) === '[object Date]') {
    if (v.getFullYear() <= 1900) return Utilities.formatDate(v, tz, 'HH:mm'); // time-only cell
    const full = Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm:ss');
    return full.slice(11) === '00:00:00' ? full.slice(0, 10) : full;
  }
  if (numeric) {
    const n = Number(v);
    return isNaN(n) ? '' : n;
  }
  return String(v).trim();
}

/** JS value → sheet cell. Text that Sheets would treat as a formula gets a leading space. */
function valueToCell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 'Yes' : '';
  const s = String(v);
  return /^[=+\-@]/.test(s) ? ` ${s}` : s;
}

/**
 * Creates a tab if missing and appends any missing headers to the right of the
 * existing ones. Never deletes, reorders or renames anything. Used by setup().
 */
function ensureTab_(ss, tab, headers, opts) {
  const o = opts || {};
  let sheet = ss.getSheetByName(tab);
  const created = !sheet;
  if (!sheet) sheet = ss.insertSheet(tab);
  const lastCol = sheet.getLastColumn();
  const existing = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h).trim()) : [];
  while (existing.length && existing[existing.length - 1] === '') existing.pop();
  const lower = existing.map((h) => h.toLowerCase());
  const missing = headers.filter((h) => lower.indexOf(String(h).toLowerCase()) === -1);
  if (missing.length) {
    const needed = existing.length + missing.length;
    if (needed > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), needed - sheet.getMaxColumns());
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }
  if (created || missing.length) {
    sheet.getRange(1, 1, 1, existing.length + missing.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  if (o.hidden && !sheet.isSheetHidden()) sheet.hideSheet();
  return { sheet, created, added: missing };
}
