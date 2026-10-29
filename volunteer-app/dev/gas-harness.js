// Runs the real gas/*.gs files inside Node with in-memory stand-ins for the
// Google services they use (SpreadsheetApp, Utilities, PropertiesService,
// CacheService, LockService, ContentService). Used by the tests and by the
// local mock server, so the frontend can be developed without deploying.
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
    if (this.numRows > 1) globalThis.__sheetReads = (globalThis.__sheetReads || 0) + 1; // dev/count-reads.mjs

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

let nextSheetId = 0;

class FakeSheet {
  constructor(parent, name) {
    this.parent = parent;
    this.name = name;
    this.sheetId = nextSheetId === 0 ? 0 : 1000 + nextSheetId; // the first tab is gid=0, as in Google Sheets
    nextSheetId += 1;
    this.cells = new Map();
    this.formats = new Map();
    this.maxRows = 1000;
    this.maxCols = 26;
    this.hidden = false;
  }
  setName(name) {
    this.name = name;
    return this;
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
    return this.sheetId;
  }
  getParent() {
    return this.parent;
  }
  appendRow(values) {
    this.getRange(this.getLastRow() + 1, 1, 1, values.length).setValues([values]);
    return this;
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
  getUrl() {
    return `https://docs.google.com/spreadsheets/d/${this.id}/edit`;
  }
  getSheets() {
    return this.sheets.slice();
  }
  getSheetByName(name) {
    return this.sheets.find((s) => s.name === name) || null;
  }
  insertSheet(name) {
    if (this.getSheetByName(name)) throw new Error(`A sheet named "${name}" already exists`);
    const sheet = new FakeSheet(this, name);
    this.sheets.push(sheet);
    return sheet;
  }
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

/** In-memory Google Drive: folders and files, enough for the guide's infographics. */
function createFakeDrive() {
  const files = new Map();
  const folders = new Map();
  let n = 0;
  const newId = (prefix) => `${prefix}${String(++n).padStart(4, '0')}fakeDriveId0000000000`;
  const makeFile = (blob, parent) => {
    const id = newId('F');
    const f = {
      id, name: blob.getName(), mime: blob.getContentType(), bytes: blob.getBytes(), parent, sharing: 'PRIVATE', blockSharing: false,
      getId: () => id, getName: () => f.name, getMimeType: () => f.mime, getSize: () => f.bytes.length,
      getBlob: () => ({ getBytes: () => f.bytes, getContentType: () => f.mime, getName: () => f.name }),
      setSharing: (access) => { if (f.blockSharing) throw new Error('Sharing blocked by policy'); f.sharing = access; return f; },
    };
    files.set(id, f);
    return f;
  };
  const service = {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', PRIVATE: 'PRIVATE' },
    Permission: { VIEW: 'VIEW', EDIT: 'EDIT' },
    createFolder(name) {
      const id = newId('D');
      const folder = { id, name, getId: () => id, getName: () => name, createFile: (blob) => makeFile(blob, id) };
      folders.set(id, folder);
      return folder;
    },
    getFolderById(id) {
      if (!folders.has(id)) throw new Error('No item with the given ID could be found.');
      return folders.get(id);
    },
    getFileById(id) {
      if (!files.has(id)) throw new Error('No item with the given ID could be found, or you do not have permission to access it.');
      return files.get(id);
    },
  };
  const addFile = (name, mime, bytes = [1, 2, 3]) => makeFile({ getName: () => name, getContentType: () => mime, getBytes: () => bytes }, null);
  // Spreadsheets live in the runtime's `books`; Drive can find, open and copy them too.
  let sheets = null;
  const attachSheets = (books, clone) => { sheets = { books, clone }; };
  const sheetFile = (book) => ({
    getId: () => book.id,
    getName: () => book.name,
    getUrl: () => book.getUrl(),
    getMimeType: () => 'application/vnd.google-apps.spreadsheet',
    getLastUpdated: () => new Date(Date.UTC(2026, 9, 1)),
    makeCopy: (name) => sheetFile(sheets.clone(book, name)),
  });
  const fileById = service.getFileById;
  service.getFileById = (id) => (sheets && sheets.books.has(id) ? sheetFile(sheets.books.get(id)) : fileById(id));
  service.searchFiles = (query) => {
    const title = (/title contains '((?:[^'\\]|\\.)*)'/.exec(query) || [])[1];
    const want = title ? title.replace(/\\'/g, "'").toLowerCase() : '';
    const list = sheets && /application\/vnd\.google-apps\.spreadsheet/.test(query)
      ? [...sheets.books.values()].filter((b) => !want || b.name.toLowerCase().includes(want)).map(sheetFile) : [];
    let i = 0;
    return { hasNext: () => i < list.length, next: () => list[i++] };
  };
  return { service, files, folders, addFile, attachSheets };
}

/**
 * In-memory Google Contacts (the People API advanced service), enough for
 * Contacts.gs. `failWith` makes the next calls throw, like an API error.
 */
function createFakeContacts() {
  const people = new Map();
  const groups = new Map([['contactGroups/myContacts', { resourceName: 'contactGroups/myContacts', name: 'myContacts', formattedName: 'My Contacts' }]]);
  const state = { n: 0, failWith: '', calls: [] };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const maybeFail = (what) => {
    state.calls.push(what);
    if (state.failWith) throw new Error(state.failWith);
  };
  const notFound = () => new Error('API call to people.people.get failed with error: Requested entity was not found.');
  const service = {
    People: {
      createContact(body) {
        maybeFail('create');
        state.n += 1;
        const p = { ...clone(body), resourceName: `people/c${1000 + state.n}`, etag: `etag-${state.n}` };
        people.set(p.resourceName, p);
        return clone(p);
      },
      get(resourceName) {
        maybeFail('get');
        if (!people.has(resourceName)) throw notFound();
        return clone(people.get(resourceName));
      },
      updateContact(body, resourceName, opts) {
        maybeFail('update');
        const cur = people.get(resourceName);
        if (!cur) throw notFound();
        if (body.etag !== cur.etag) throw new Error('etag mismatch: get the contact again before updating it');
        String(opts.updatePersonFields).split(',').forEach((f) => { cur[f] = clone(body[f] || []); });
        state.n += 1;
        cur.etag = `etag-${state.n}`;
        return clone(cur);
      },
    },
    ContactGroups: {
      list() {
        maybeFail('groups.list');
        return { contactGroups: [...groups.values()].map(clone) };
      },
      create({ contactGroup }) {
        maybeFail('groups.create');
        state.n += 1;
        const g = { resourceName: `contactGroups/${state.n.toString(16)}`, name: contactGroup.name, formattedName: contactGroup.name };
        groups.set(g.resourceName, g);
        return clone(g);
      },
    },
  };
  return { service, people, groups, state };
}

/** A copy of a whole spreadsheet (Drive → Make a copy). */
function cloneBook(books, book, name) {
  const copy = new FakeSpreadsheet(`${book.id}-copy-${books.size}`, name);
  book.sheets.forEach((sh) => {
    const c = copy.insertSheet(sh.name);
    c.cells = new Map(sh.cells);
    c.formats = new Map(sh.formats);
    c.maxRows = sh.maxRows;
    c.maxCols = sh.maxCols;
    c.hidden = sh.hidden;
  });
  books.set(copy.id, copy);
  return copy;
}

export function createGasRuntime() {
  let newBooks = 0;
  const drive = createFakeDrive();
  const contacts = createFakeContacts();
  const books = new Map();
  drive.attachSheets(books, (book, name) => cloneBook(books, book, name));
  const props = new Map();
  const cache = new Map();

  const services = {
    SpreadsheetApp: {
      openById(id) {
        const book = books.get(id);
        if (!book) throw new Error(`Spreadsheet ${id} not found (or no permission)`);
        return book;
      },
      create(name) {
        newBooks += 1;
        const book = new FakeSpreadsheet(`ss-new-${newBooks}`, name);
        book.insertSheet('Sheet1');
        books.set(book.id, book);
        return book;
      },
      flush() {},
    },
    Utilities: {
      computeHmacSha256Signature(value, key) {
        return toSigned(crypto.createHmac('sha256', toBuffer(key)).update(toBuffer(value)).digest());
      },
      sleep() {}, // the stand-in runs one request at a time
      base64Encode(bytes) {
        return toBuffer(bytes).toString('base64');
      },
      base64EncodeWebSafe(bytes) {
        return toBuffer(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
      },
      formatDate,
      getUuid: () => crypto.randomUUID(),
      newBlob: (data, contentType = 'text/plain', name = '') => {
        const bytes = typeof data === 'string' ? toSigned(Buffer.from(data, 'utf8')) : data;
        return { getBytes: () => bytes, getContentType: () => contentType, getName: () => name };
      },
      base64Decode: (text) => {
        if (!/^[A-Za-z0-9+/=\s]*$/.test(text)) throw new Error('Could not decode string.');
        return toSigned(Buffer.from(text, 'base64'));
      },
    },
    DriveApp: drive.service,
    People: contacts.service,
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
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(content) {
        return { content, setMimeType() { return this; }, getContent() { return this.content; } };
      },
    },
    console: { log() {}, error: (...a) => console.error('[gas]', ...a), warn() {} },
  };

  const context = vm.createContext({ ...services });
  const files = fs.readdirSync(GAS_DIR).filter((f) => f.endsWith('.gs')).sort();
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(GAS_DIR, file), 'utf8'), context, { filename: file });
  }

  const runtime = {
    context,
    props,
    drive, // tests: rt.drive.addFile(name, mime) puts a file in the admin's Google Drive
    contacts, // tests: rt.contacts.people (saved contacts), rt.contacts.state.failWith = 'error' to make calls fail
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
      const width = Math.max(0, ...rows.map((line) => line.length));
      sheet.maxCols = Math.max(sheet.maxCols, width); // like a real tab, grow to fit what was pasted
      sheet.maxRows = Math.max(sheet.maxRows, rows.length + 50);
      sheet.cells = new Map(); // replaces what was there, like pasting a whole new tab
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
    call(action, payload = {}, token) {
      const body = JSON.stringify({ action, token, payload });
      const out = context.doPost({ postData: { contents: body, type: 'text/plain' } });
      return JSON.parse(out.getContent());
    },
    callRaw(contents) {
      return JSON.parse(context.doPost({ postData: { contents } }).getContent());
    },
  };
  return runtime;
}
