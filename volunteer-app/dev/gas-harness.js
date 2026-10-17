// Runs the real gas/*.gs files inside Node with in-memory stand-ins for the
// Google services they use (SpreadsheetApp, DriveApp, People (Google Contacts),
// Utilities, PropertiesService, CacheService, LockService, ContentService).
// Used by the tests and by the local mock server, so the frontend can be
// developed without deploying.
//
// The fake spreadsheet imitates the Sheets behaviour that matters here:
// cells not formatted as plain text ("@") auto-convert typed text, so
// "2026-10-14" becomes a Date and "+6591234567" becomes a number — exactly
// the bugs the backend has to avoid.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const GAS_DIR = path.join(here, '..', 'gas');

const SGT_OFFSET_MS = 8 * 3600 * 1000;

/* ---------------- fake spreadsheet ---------------- */

function sheetsAutoConvert(value) {
  if (typeof value !== 'string') return value;
  if (value.startsWith("'")) return value.slice(1);
  const s = value.trim();
  if (s.startsWith('=')) return `#FORMULA ${s}`; // would have been evaluated as a formula
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(Date.parse(`${s}T00:00:00Z`) - SGT_OFFSET_MS);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) return new Date(Date.parse(`${s.replace(' ', 'T')}Z`) - SGT_OFFSET_MS);
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':').map(Number);
    return new Date(Date.UTC(1899, 11, 30, h, m) - SGT_OFFSET_MS);
  }
  if (/^[+-]?\d+(\.\d+)?$/.test(s.replace(/\s/g, ''))) return Number(s.replace(/\s/g, ''));
  return value;
}

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    if (row < 1 || col < 1 || row + numRows - 1 > sheet.maxRows || col + numCols - 1 > sheet.maxCols) {
      throw new Error(`Range out of bounds on "${sheet.name}" (${row},${col},${numRows},${numCols})`);
    }
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(this.sheet.get(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  getValue() {
    return this.sheet.get(this.row, this.col);
  }
  setValues(values) {
    if (values.length !== this.numRows || values.some((line) => line.length !== this.numCols)) {
      throw new Error('setValues dimensions do not match the range');
    }
    values.forEach((line, r) => line.forEach((v, c) => this.sheet.set(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v) {
    this.sheet.set(this.row, this.col, v);
    return this;
  }
  setNumberFormat(fmt) {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) this.sheet.formats.set(`${this.row + r}:${this.col + c}`, fmt);
    }
    return this;
  }
  setFontWeight() {
    return this;
  }
}

class FakeSheet {
  constructor(parent, name, sheetId) {
    this.parent = parent;
    this.name = name;
    this.sheetId = sheetId;
    this.cells = new Map();
    this.formats = new Map();
    this.maxRows = 1000;
    this.maxCols = 26;
    this.hidden = false;
  }
  get(r, c) {
    const v = this.cells.get(`${r}:${c}`);
    return v === undefined ? '' : v;
  }
  set(r, c, v) {
    const fmt = this.formats.get(`${r}:${c}`);
    const stored = fmt === '@' ? (v === null || v === undefined ? '' : typeof v === 'number' ? v : String(v)) : sheetsAutoConvert(v);
    if (stored === '' || stored === null || stored === undefined) this.cells.delete(`${r}:${c}`);
    else this.cells.set(`${r}:${c}`, stored);
  }
  getName() {
    return this.name;
  }
  getSheetId() {
    return this.sheetId; // the number after #gid= in the sheet's link
  }
  getParent() {
    return this.parent;
  }
  getLastRow() {
    let last = 0;
    for (const key of this.cells.keys()) last = Math.max(last, Number(key.split(':')[0]));
    return last;
  }
  getLastColumn() {
    let last = 0;
    for (const key of this.cells.keys()) last = Math.max(last, Number(key.split(':')[1]));
    return last;
  }
  getMaxRows() {
    return this.maxRows;
  }
  getMaxColumns() {
    return this.maxCols;
  }
  insertRowsAfter(after, n) {
    this.maxRows += n;
  }
  insertColumnsAfter(after, n) {
    this.maxCols += n;
  }
  deleteRow(r) {
    const shift = (map) => {
      const next = new Map();
      for (const [key, v] of map) {
        const [row, col] = key.split(':').map(Number);
        if (row === r) continue;
        next.set(`${row > r ? row - 1 : row}:${col}`, v);
      }
      return next;
    };
    this.cells = shift(this.cells);
    this.formats = shift(this.formats);
    this.maxRows -= 1;
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    return new FakeRange(this, row, col, numRows, numCols);
  }
  getDataRange() {
    return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }
  setFrozenRows() {
    return this;
  }
  hideSheet() {
    this.hidden = true;
    return this;
  }
  isSheetHidden() {
    return this.hidden;
  }
  /** Test helper: plain 2D array of everything in the tab (row 1 = headers). */
  dump() {
    const rows = this.getLastRow();
    const cols = this.getLastColumn();
    return rows && cols ? this.getRange(1, 1, rows, cols).getValues() : [];
  }
}

class FakeSpreadsheet {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.sheets = [];
  }
  getId() {
    return this.id;
  }
  getName() {
    return this.name;
  }
  getSpreadsheetTimeZone() {
    return 'Asia/Singapore';
  }
  getSheets() {
    return this.sheets.slice();
  }
  getSheetByName(name) {
    return this.sheets.find((s) => s.name === name) || null;
  }
  insertSheet(name) {
    if (this.getSheetByName(name)) throw new Error(`A sheet named "${name}" already exists`);
    // Like Google Sheets: the first tab is gid 0, later tabs get other numbers.
    const sheet = new FakeSheet(this, name, this.sheets.length ? 1000 + this.sheets.length * 137 : 0);
    this.sheets.push(sheet);
    return sheet;
  }
}

/* ---------------- fake Google Drive (files kept in memory) ---------------- */

class FakeBlob {
  constructor(bytes, contentType = 'application/octet-stream', name = 'file') {
    this.bytes = bytes;
    this.contentType = contentType;
    this.name = name;
  }
  getBytes() {
    return this.bytes.slice();
  }
  getContentType() {
    return this.contentType;
  }
  getName() {
    return this.name;
  }
  getDataAsString() {
    return toBuffer(this.bytes).toString('utf8');
  }
}

function createFakeDrive() {
  const folders = new Map();
  const files = new Map();
  let seq = 0;
  const iterator = (items) => {
    let i = 0;
    return { hasNext: () => i < items.length, next: () => items[i++] };
  };
  const makeFile = (blob, folderId) => {
    const id = `drive-file-${++seq}`;
    const file = {
      id, folderId, blob, trashed: false,
      getId: () => id,
      getName: () => blob.getName(),
      getMimeType: () => blob.getContentType(),
      getSize: () => blob.bytes.length,
      getBlob: () => blob,
      setTrashed(v) { file.trashed = Boolean(v); return file; },
      isTrashed: () => file.trashed,
    };
    files.set(id, file);
    return file;
  };
  const makeFolder = (name) => {
    const id = `drive-folder-${++seq}`;
    const folder = { id, name, getId: () => id, getName: () => name, createFile: (blob) => makeFile(blob, id) };
    folders.set(id, folder);
    return folder;
  };
  return {
    files,
    folders,
    DriveApp: {
      createFolder: makeFolder,
      getFoldersByName: (name) => iterator([...folders.values()].filter((f) => f.name === name)),
      getFolderById(id) {
        const f = folders.get(id);
        if (!f) throw new Error(`No folder with ID ${id} (or no permission)`);
        return f;
      },
      getFileById(id) {
        const f = files.get(id);
        if (!f || f.trashed) throw new Error(`No file with ID ${id} (or no permission)`);
        return f;
      },
    },
  };
}

/* ---------------- fake Google Contacts (People API advanced service) ---------------- */

function createFakePeople(accountEmail) {
  const contacts = new Map();
  const groups = new Map();
  let seq = 0;
  const People = {
    People: {
      createContact(body) {
        const resourceName = `people/c${1000 + (++seq)}`;
        const person = { ...structuredClone(body), resourceName, etag: `e${seq}`, memberships: [], updated: new Date().toISOString() };
        contacts.set(resourceName, person);
        return structuredClone(person);
      },
      get(resourceName) {
        const p = contacts.get(resourceName);
        if (!p) throw new Error(`Requested entity was not found: ${resourceName}`);
        return structuredClone(p);
      },
      updateContact(body, resourceName, opts) {
        const p = contacts.get(resourceName);
        if (!p) throw new Error(`Requested entity was not found: ${resourceName}`);
        if (body.etag !== p.etag) throw new Error('The etag does not match (the contact changed)');
        (opts.updatePersonFields || '').split(',').forEach((f) => { p[f] = structuredClone(body[f]); });
        p.etag = `e${++seq}`;
        p.updated = new Date().toISOString();
        return structuredClone(p);
      },
    },
    ContactGroups: {
      list: () => ({ contactGroups: [...groups.values()].map((g) => ({ ...g })) }),
      create({ contactGroup }) {
        const g = { resourceName: `contactGroups/g${++seq}`, name: contactGroup.name, formattedName: contactGroup.name };
        groups.set(g.resourceName, g);
        return { ...g };
      },
      Members: {
        modify({ resourceNamesToAdd = [] }, groupResourceName) {
          const g = groups.get(groupResourceName);
          resourceNamesToAdd.forEach((rn) => { const p = contacts.get(rn); if (p) p.memberships.push(g ? g.name : groupResourceName); });
          return {};
        },
      },
    },
  };
  return { People, contacts, groups, accountEmail };
}

/* ---------------- Utilities ---------------- */

const toSigned = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const toBuffer = (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map((b) => (b < 0 ? b + 256 : b))));

function formatDate(date, tz, pattern) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return pattern
    .replace('yyyy', parts.year)
    .replace('MM', parts.month)
    .replace('dd', parts.day)
    .replace('HH', parts.hour)
    .replace('mm', parts.minute)
    .replace('ss', parts.second);
}

/* ---------------- runtime ---------------- */

export function createGasRuntime({ contactsAccount = 'admin-account@example.com', people = true } = {}) {
  const books = new Map();
  const props = new Map();
  const cache = new Map();
  const drive = createFakeDrive();
  const google = createFakePeople(contactsAccount);

  const services = {
    SpreadsheetApp: {
      openById(id) {
        const book = books.get(id);
        if (!book) throw new Error(`Spreadsheet ${id} not found (or no permission)`);
        return book;
      },
      flush() {},
    },
    Utilities: {
      computeHmacSha256Signature(value, key) {
        return toSigned(crypto.createHmac('sha256', toBuffer(key)).update(toBuffer(value)).digest());
      },
      base64EncodeWebSafe(bytes) {
        return toBuffer(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
      },
      base64Encode: (bytes) => toBuffer(bytes).toString('base64'),
      base64Decode: (text) => toSigned(Buffer.from(String(text), 'base64')),
      formatDate,
      getUuid: () => crypto.randomUUID(),
      newBlob: (data, contentType, name) => new FakeBlob(typeof data === 'string' ? toSigned(Buffer.from(data, 'utf8')) : data.slice(), contentType, name),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => props.set(k, String(v)),
        deleteProperty: (k) => props.delete(k),
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => {
          const hit = cache.get(k);
          return hit && hit.expires > Date.now() ? hit.value : null;
        },
        put: (k, value, seconds) => cache.set(k, { value, expires: Date.now() + seconds * 1000 }),
        remove: (k) => cache.delete(k),
      }),
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {}, hasLock: () => true }),
    },
    DriveApp: drive.DriveApp,
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(content) {
        return { content, setMimeType() { return this; }, getContent() { return this.content; } };
      },
    },
    console: { log() {}, error: (...a) => console.error('[gas]', ...a), warn() {} },
  };

  if (people) services.People = google.People; // people: false = the advanced service is not turned on
  const context = vm.createContext({ ...services });
  const files = fs.readdirSync(GAS_DIR).filter((f) => f.endsWith('.gs')).sort();
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(GAS_DIR, file), 'utf8'), context, { filename: file });
  }

  const runtime = {
    context,
    props,
    drive,
    contacts: google,
    createSpreadsheet(id, name = id) {
      const book = new FakeSpreadsheet(id, name);
      books.set(id, book);
      return book;
    },
    spreadsheet(id) {
      return books.get(id);
    },
    /** Write a 2D array into a tab the way a person pasting into Sheets would (auto-conversion on). */
    fillTab(id, tab, rows) {
      const book = books.get(id);
      const sheet = book.getSheetByName(tab) || book.insertSheet(tab);
      rows.forEach((line, r) => line.forEach((v, c) => sheet.set(r + 1, c + 1, v)));
      return sheet;
    },
    tab(id, tab) {
      return books.get(id).getSheetByName(tab);
    },
    /** Rows of a tab as objects keyed by header text. */
    records(id, tab) {
      const [headers, ...rows] = books.get(id).getSheetByName(tab).dump();
      return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
    },
    run(fnName, ...args) {
      return context[fnName](...args);
    },
    /** Evaluate code inside the Apps Script context, e.g. to change a CONFIG flag in a test. */
    evaluate(code) {
      return vm.runInContext(code, context);
    },
    /** Freeze the backend clock (ISO string or ms). Pass null to use real time again. */
    setNow(when) {
      context.__fixedNow = when === null ? null : new Date(when).getTime();
      vm.runInContext('now_ = function () { return __fixedNow === null ? new Date() : new Date(__fixedNow); }', context);
    },
    advanceMinutes(minutes) {
      runtime.setNow((context.__fixedNow ?? Date.now()) + minutes * 60000);
    },
    /** Same path a real request takes: doPost → JSON text → parsed object. */
    call(action, payload = {}, token, adminToken) {
      const body = JSON.stringify({ action, token, adminToken, payload });
      const out = context.doPost({ postData: { contents: body, type: 'text/plain' } });
      return JSON.parse(out.getContent());
    },
    callRaw(contents) {
      return JSON.parse(context.doPost({ postData: { contents } }).getContent());
    },
  };
  return runtime;
}
