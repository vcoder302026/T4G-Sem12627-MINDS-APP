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

const DB_ = { cache: {}, books: {} };

function resetDbCache_() {
  DB_.cache = {};
}

/**
 * A sheet given as an ID or a full URL. A URL may end in #gid=123 to pick one
 * tab, so staff can paste the address straight from the browser.
 */
function parseSheetRef_(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const idMatch = /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(s);
  const gidMatch = /[#&?]gid=(\d+)/.exec(s);
  return { id: idMatch ? idMatch[1] : s, gid: gidMatch ? Number(gidMatch[1]) : null };
}

function spreadsheet_() {
  if (!DB_.books.main) {
    const ref = parseSheetRef_(PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_SPREADSHEET_ID));
    if (!ref) throw err_.config('SPREADSHEET_ID is not set. Add it under Project Settings → Script properties.');
    DB_.books.main = SpreadsheetApp.openById(ref.id);
  }
  return DB_.books.main;
}

/**
 * House visit records live in the trainee spreadsheet (Version 4: one database for trainees
 * and house visits, MINDS's House Visit form responses). Their "House Visits" tab sits next to
 * Form Responses 1.
 */
function visitsSpreadsheet_() {
  return traineeSpreadsheet_();
}

/** The spreadsheet an app table lives in (Config.gs → TABLES.<key>.book). */
function bookFor_(def) {
  return def.book === 'visits' ? visitsSpreadsheet_() : spreadsheet_();
}

/** After linking a different sheet: open everything again. */
function resetBooks_() {
  DB_.books = {};
  DB_.cache = {};
}

function traineeSheetRef_() {
  return parseSheetRef_(PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_TRAINEE_SPREADSHEET_ID));
}

function traineeSpreadsheet_() {
  if (!DB_.books.trainees) {
    const ref = traineeSheetRef_();
    DB_.books.trainees = ref ? SpreadsheetApp.openById(ref.id) : spreadsheet_();
  }
  return DB_.books.trainees;
}

/** The trainee tab's name: the #gid tab of TRAINEE_SPREADSHEET_ID, else Config.gs → TRAINEES.tab. */
function traineeTabName_() {
  if (DB_.books.traineeTab) return DB_.books.traineeTab;
  const ref = traineeSheetRef_();
  let name = CONFIG.TRAINEES.tab;
  if (ref && ref.gid !== null) {
    const sheet = traineeSpreadsheet_().getSheets().find((sh) => sh.getSheetId() === ref.gid);
    if (!sheet) throw err_.config(`The trainee sheet link points to a tab (gid=${ref.gid}) that doesn't exist.`);
    name = sheet.getName();
  }
  DB_.books.traineeTab = name;
  return name;
}

/** Header text compared loosely: case, spacing and curly quotes don't matter. */
function normHeader_(h) {
  return String(h === null || h === undefined ? '' : h).replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

/** A column may list several possible headers; the first one is used when the app creates it. */
function headerOptions_(value) {
  return Array.isArray(value) ? value : [value];
}
function primaryHeader_(value) {
  return headerOptions_(value)[0];
}

/** Table for an app-owned tab: table_('users'), table_('bookings'), … */
function table_(key) {
  const def = CONFIG.TABLES[key];
  return new Table(bookFor_(def), def.tab, def.columns, def.numeric || [], `app:${key}`);
}

/** Table over the existing trainee tab (see Config.gs → TRAINEES). */
function traineeTable_() {
  const t = CONFIG.TRAINEES;
  const columns = Object.assign({}, t.columns, t.writeBack || {});
  return new TraineeTable(traineeSpreadsheet_(), traineeTabName_(), columns, [], 'trainees');
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
    const headerRow = values[0] || [];
    const headers = headerRow.map(normHeader_);
    const colIndex = {};
    const headerText = {};
    Object.keys(this.columns).forEach((key) => {
      const options = headerOptions_(this.columns[key]);
      for (let j = 0; j < options.length; j++) {
        const i = headers.indexOf(normHeader_(options[j]));
        if (i >= 0) {
          colIndex[key] = i;
          headerText[key] = String(headerRow[i]).trim();
          break;
        }
      }
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
    const state = { sheet, rows, colIndex, headerText, width: lastCol, values, headerRow, tz };
    DB_.cache[this.cacheKey] = state;
    return state;
  }

  rows() {
    return this.load_().rows;
  }
  hasColumn(key) {
    return key in this.load_().colIndex;
  }
  /** The sheet's own header text for a key (or the first option if the column is missing). */
  header(key) {
    return this.load_().headerText[key] || primaryHeader_(this.columns[key]);
  }
  /** Every column of the tab: [{ index, header, norm }], in sheet order. */
  allHeaders() {
    const st = this.load_();
    return st.headerRow.map((h, index) => ({ index, header: String(h).trim(), norm: normHeader_(h) })).filter((h) => h.header);
  }
  /** One row's value in any column (by index), formatted like the mapped columns. */
  rawValue(row, index) {
    const st = this.load_();
    const raw = st.values[row._row - 1];
    return raw ? cellToValue_(raw[index], false, st.tz) : '';
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
  const lower = existing.map(normHeader_);
  const missing = headers.map((h) => headerOptions_(h)).filter((opts) => !opts.some((o) => lower.indexOf(normHeader_(o)) >= 0))
    .map((opts) => opts[0]);
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

/**
 * The trainee sheet (MINDS's House Visit form responses) as the app reads it (Version 4):
 *   - a row with a name but no Trainee ID (a new Google Form response, or a row typed in) gets
 *     one straight away: the next ID, or, when the same trainee is already in the sheet (same
 *     full name and NRIC last 4), that trainee's ID;
 *   - when a trainee has several rows (the form submitted again after a house visit), the
 *     newest row is their current information. Older rows stay in the sheet, untouched.
 */
class TraineeTable extends Table {
  rows() {
    const st = this.load_();
    if (!st.idsChecked) {
      st.idsChecked = true;
      if (st.rows.some((r) => r.name && !r.id)) fillMissingTraineeIds_(this, st.rows);
    }
    const newest = {};
    st.rows.forEach((r) => { if (r.id) newest[String(r.id)] = r; });
    return st.rows.filter((r) => !r.id || newest[String(r.id)] === r);
  }
}

let AUTO_TRAINEE_IDS_ = 0; // how many IDs were filled in this run (setup reports them)

function fillMissingTraineeIds_(table, rows) {
  let lock = null;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return; // someone else is writing: the IDs come on the next request
  } catch (e) {
    lock = null;
  }
  try {
    const nric = table.allHeaders().find((h) => /^nric/i.test(h.header));
    const key = (r) => `${String(r.name || '').trim().toLowerCase()}|${nric ? String(table.rawValue(r, nric.index)).trim().toLowerCase() : ''}`;
    const known = {};
    let max = 0;
    rows.forEach((r) => {
      if (!r.id) return;
      known[key(r)] = String(r.id);
      const m = /^T-(\d+)$/.exec(String(r.id));
      if (m) max = Math.max(max, Number(m[1]));
    });
    rows.forEach((r) => {
      if (!r.name || r.id) return;
      let id = known[key(r)];
      if (!id) {
        max += 1;
        id = `T-${String(max).padStart(4, '0')}`;
        known[key(r)] = id;
      }
      table.update(r, { id });
      AUTO_TRAINEE_IDS_ += 1;
    });
  } finally {
    if (lock) lock.releaseLock();
  }
}

