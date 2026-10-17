/**
 * DataSources.gs — Admin → Settings → Databases.
 *
 * MINDS keeps different information in different Google Sheets. The "Data
 * Sources" tab (in the main spreadsheet) holds one link per database; a link
 * can point at one tab of a sheet (copy the browser address while that tab is
 * open: it ends in #gid=…). Blank links use the defaults described in
 * Config.gs → dataSourceDefs_(). The sheet must be shared with (or owned by)
 * the Google account that runs the web app.
 */

function describeLocation_(key) {
  const def = dataSourceDefs_()[key];
  const row = dataSourceRows_()[key] || {};
  const out = { key, label: def.label, kind: def.kind, notes: def.notes, url: row.url || '', tab: row.tab || '', updatedBy: row.updatedBy || '', updatedAt: row.updatedAt || '' };
  try {
    if (def.kind === 'folder') {
      const folder = filesFolder_();
      return Object.assign(out, { ok: true, status: `Drive folder "${folder.getName()}"`, linked: Boolean(row.url) });
    }
    const loc = sheetLocation_(key);
    if (!loc) return Object.assign(out, { ok: true, linked: false, status: 'Not linked (optional)' });
    const sheet = loc.ss.getSheetByName(loc.tab);
    if (!sheet) return Object.assign(out, { ok: false, linked: loc.linked, status: `No tab called "${loc.tab}" in "${loc.ss.getName()}"` });
    const rows = Math.max(0, sheet.getLastRow() - 1);
    return Object.assign(out, {
      ok: true,
      linked: loc.linked,
      status: `${loc.linked ? '' : 'Default: '}"${loc.ss.getName()}" → tab "${loc.tab}", ${rows} row${rows === 1 ? '' : 's'}`,
    });
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    return Object.assign(out, { ok: false, linked: Boolean(row.url), status: e.message });
  }
}

function listDataSources_() {
  return { databases: Object.keys(dataSourceDefs_()).map(describeLocation_) };
}

/** Checks that a linked sheet looks like the database it is meant to be. */
function checkLinkedSheet_(key, loc) {
  const sheet = loc.ss.getSheetByName(loc.tab);
  if (!sheet) throw err_.validation(`That spreadsheet has no tab called "${loc.tab}". Type the tab name, or open the tab and copy the link again.`);
  const lastCol = sheet.getLastColumn();
  const headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h).trim().toLowerCase()) : [];
  const need = {
    volunteers: [CONFIG.TABLES.users.columns.email],
    trainees: [CONFIG.TRAINEES.columns.name],
    traineeUpdates: [CONFIG.TRAINEE_UPDATES.traineeName],
    pairs: [],
  }[key] || [];
  const missing = need.filter((h) => headers.indexOf(h.toLowerCase()) === -1);
  if (missing.length && !(key === 'volunteers' && !headers.length)) {
    throw err_.validation(`The tab "${loc.tab}" has no ${missing.map((h) => `"${h}"`).join(', ')} column. Check that the link points at the right tab.`);
  }
}

function saveDataSource_(p, admin) {
  onlyFields_(p, ['key', 'url', 'tab']);
  const defs = dataSourceDefs_();
  const key = oneOf_(p.key, 'Database', Object.keys(defs));
  const def = defs[key];
  const url = str_(p.url, 'Link', { max: 500 });
  const tab = str_(p.tab, 'Tab name', { max: 100 });
  if (url && def.kind === 'sheet' && !parseSheetUrl_(url)) throw err_.validation('Paste a Google Sheets link (docs.google.com/spreadsheets/d/…).');
  if (url && def.kind === 'folder' && !parseFolderUrl_(url)) throw err_.validation('Paste a Google Drive folder link (drive.google.com/drive/folders/…).');

  const tableDef = CONFIG.TABLES.dataSources;
  ensureTab_(spreadsheet_(), tableDef.tab, Object.keys(tableDef.columns).map((k) => tableDef.columns[k]), {});
  const table = table_('dataSources');
  let row = table.find((r) => r.key === key);
  const fields = Object.assign({ url, tab, database: def.label }, stamp_(admin));
  if (row) table.update(row, fields);
  else row = table.insert(Object.assign({ key, notes: def.notes }, fields));

  // Check the new link (the row is already written, so a bad link can be fixed or cleared again).
  resetDbCache_();
  if (url && def.kind === 'sheet') {
    let loc;
    try {
      loc = sheetLocation_(key);
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      table_('dataSources').update(table_('dataSources').find((r) => r.key === key), { url: '', tab: '' });
      throw err_.validation(`${e.message} The link was not saved.`);
    }
    try {
      checkLinkedSheet_(key, loc);
    } catch (e) {
      table_('dataSources').update(table_('dataSources').find((r) => r.key === key), { url: '', tab: '' });
      throw e;
    }
  }
  if (def.kind === 'folder') {
    PropertiesService.getScriptProperties().deleteProperty(CONFIG.PROP_FILES_FOLDER_ID);
    if (url) {
      try {
        filesFolder_();
      } catch (e) {
        table_('dataSources').update(table_('dataSources').find((r) => r.key === key), { url: '' });
        throw err_.validation('The app cannot open that Drive folder. Share it with the account that runs the app. The link was not saved.');
      }
    }
  }
  resetDbCache_();
  const saved = describeLocation_(key);
  return Object.assign(listDataSources_(), { message: url ? `${def.label}: ${saved.status}.` : `${def.label} now uses the default.` });
}

/** Called by setup(): one row per database, with blank links (= defaults). */
function seedDataSources_() {
  resetDbCache_();
  const table = table_('dataSources');
  const have = byKey_(table.rows(), 'key');
  const defs = dataSourceDefs_();
  const added = Object.keys(defs).filter((k) => !have[k]);
  added.forEach((k) => table.insert({ key: k, database: defs[k].label, url: '', tab: '', notes: defs[k].notes, updatedBy: 'setup', updatedAt: fmtDateTime_(now_()) }));
  return added.length ? [`Added ${added.length} database link row(s) to the Data Sources tab (blank = default).`] : [];
}
