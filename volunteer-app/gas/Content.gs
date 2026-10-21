/**
 * Content.gs — things volunteer leaders manage in the app:
 * venues, projects, and the Volunteer Guide new volunteers read first.
 *
 * Starting content is added by setup() only when a tab is empty. Leaders then
 * edit it in the app (Me → Leader tools), or directly in the sheet.
 */

const DEFAULT_GUIDE = [
  {
    title: 'Welcome to MINDS volunteering',
    body: 'Thank you for volunteering with MINDS. Our trainees are persons with intellectual disabilities, and your time helps them learn, play and build confidence.\n\nThis guide takes about 3 minutes. Read it once before you sign up for your first session. You can open it again any time from the Me tab.',
  },
  {
    title: 'What to wear',
    body: '- Comfortable, modest clothes you can move and sit on the floor in\n- Covered shoes (sports shoes are best)\n- No dangling jewellery, and keep nails short\n- Your volunteer T-shirt, if you have one\n- A water bottle, and a cap for outdoor sessions',
  },
  {
    title: 'What we expect from you',
    body: '- Arrive 10 to 15 minutes early\n- Stay with your paired trainee unless an admin asks you to switch\n- Be patient and kind, and speak to trainees with the respect you would give anyone their age\n- Keep your phone away during activities\n- No photos or videos of trainees unless an admin says it is allowed\n- Tell an admin straight away about any injury, distress or safety worry\n- Can\'t make it? Tap "Can\'t make it" in the app as early as possible',
  },
  {
    title: 'On the day',
    body: '1. Open the app and read your trainee\'s profile and notes.\n2. Show your QR pass to an admin to clock in.\n3. Stay with your trainee and follow the plan for the session.\n4. At the end, show your QR pass again to clock out.\n5. Fill in the short feedback form. Your notes help the next volunteer.',
  },
  {
    title: 'Working with your trainee',
    body: '- Use short, simple sentences and give time to answer\n- Show as well as tell: demonstrate, point, use pictures\n- Follow the "Things to take note" in your trainee\'s profile\n- Praise effort, not just results\n- If your trainee becomes upset, stay calm, give them space and call an admin',
  },
];

// The projects at MINDS Woodlands Gardens School. Descriptions are a starting point for admins to edit.
const DEFAULT_PROJECTS = [
  {
    name: 'West End (WE)',
    description: 'Volunteer with trainees at the West End project: activities, games and life-skills practice.',
    schedule: 'Regular sessions, 2:30 pm to 5:30 pm',
    venue: 'MINDS Woodlands Gardens School',
  },
  {
    name: 'Regular Service Project for the Intellectually Disabled (RSPID)',
    description: 'Regular sessions with trainees: building friendships, confidence and everyday skills.',
    schedule: 'Regular sessions, 2:30 pm to 5:30 pm',
    venue: 'MINDS Woodlands Gardens School',
  },
];

/* ---------------- venues ---------------- */

function venueOut_(v) {
  return { venueId: v.venueId, name: v.name, address: v.address, notes: v.notes, status: v.status || 'active' };
}

function venueRows_() {
  return table_('venues').rows().filter((v) => v.name);
}

function activeVenues_() {
  return sortBy_(venueRows_().filter((v) => v.status !== 'archived'), (v) => v.name.toLowerCase()).map(venueOut_);
}

function venueByName_(name) {
  const n = String(name || '').trim().toLowerCase();
  return venueRows_().find((v) => v.name.toLowerCase() === n) || null;
}

/** Sessions must use a venue from the Venues tab; returns its exact name. */
function requireVenue_(name) {
  const venue = venueByName_(name);
  if (!venue || venue.status === 'archived') throw err_.validation('Choose a venue from the list, or add it as a new venue first.');
  return venue.name;
}

function listVenues_() {
  return { venues: sortBy_(venueRows_().map(venueOut_), (v) => `${v.status === 'archived' ? 1 : 0}${v.name.toLowerCase()}`) };
}

function saveVenue_(p, admin) {
  onlyFields_(p, ['venueId', 'name', 'address', 'notes', 'status']);
  const venues = table_('venues');
  const fields = {};
  if (p.name !== undefined) fields.name = str_(p.name, 'Venue name', { required: true });
  if (p.address !== undefined) fields.address = str_(p.address, 'Address', { max: 300 });
  if (p.notes !== undefined) fields.notes = str_(p.notes, 'Notes', { max: 1000 });
  if (p.status !== undefined) fields.status = oneOf_(p.status, 'Status', ['active', 'archived']);
  if (fields.name) {
    const clash = venueByName_(fields.name);
    if (clash && clash.venueId !== p.venueId) throw err_.conflict(`"${clash.name}" is already on the venue list.`);
  }
  let venue;
  if (p.venueId) {
    venue = venues.find((v) => v.venueId === id_(p.venueId, 'Venue'));
    if (!venue) throw err_.notFound('Venue not found.');
    const oldName = venue.name;
    venues.update(venue, fields);
    if (fields.name && fields.name !== oldName) renameVenueEverywhere_(oldName, fields.name);
  } else {
    if (!fields.name) throw err_.validation('Venue name is required.');
    venue = venues.insert({
      venueId: newId_('V'),
      name: fields.name,
      address: fields.address || '',
      notes: fields.notes || '',
      status: 'active',
      createdBy: admin.name,
      createdAt: fmtDateTime_(now_()),
    });
  }
  return { venue: venueOut_(venue), venues: activeVenues_() };
}

/** A renamed venue is renamed on today's and future sessions, and on projects. */
function renameVenueEverywhere_(oldName, newName) {
  const today = todayStr_();
  const sessions = table_('sessions');
  sessions.filter((s) => s.venue === oldName && s.date >= today).forEach((s) => sessions.update(s, { venue: newName }));
  const projects = table_('projects');
  projects.filter((pr) => pr.venue === oldName).forEach((pr) => projects.update(pr, { venue: newName }));
}

/* ---------------- projects ---------------- */

function projectOut_(pr) {
  const v = pr.venue ? venueByName_(pr.venue) : null;
  return {
    projectId: pr.projectId,
    name: pr.name,
    description: pr.description,
    schedule: pr.schedule,
    venue: pr.venue,
    venueAddress: v ? v.address : '',
    order: Number(pr.order) || 0,
    status: pr.status || 'active',
  };
}

function projectRows_() {
  return table_('projects').rows().filter((pr) => pr.name);
}

function activeProjects_() {
  return sortBy_(projectRows_().filter((pr) => pr.status !== 'archived'), (pr) => `${String(Number(pr.order) || 0).padStart(5, '0')}${pr.name.toLowerCase()}`).map(projectOut_);
}

function requireProject_(name) {
  if (!name) return '';
  const n = String(name).trim().toLowerCase();
  const pr = projectRows_().find((x) => x.name.toLowerCase() === n && x.status !== 'archived');
  if (!pr) throw err_.validation('Choose a project from the list.');
  return pr.name;
}

/** A session's projects, stored as one cell: "Project A, Project B". */
function parseProjects_(value) {
  return String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
}

/** One or several projects (a list, or text separated by commas), each from the Projects tab. */
function requireProjects_(value) {
  const list = Array.isArray(value) ? value.map((x) => str_(x, 'Project')) : parseProjects_(str_(value, 'Project', { max: 1000 }));
  const out = [];
  list.forEach((name) => {
    const ok = requireProject_(name);
    if (ok && out.indexOf(ok) === -1) out.push(ok);
  });
  return out.join(', ');
}

function saveProject_(p, admin) {
  onlyFields_(p, ['projectId', 'name', 'description', 'schedule', 'venue', 'status']);
  const projects = table_('projects');
  const fields = { updatedBy: admin.name, updatedAt: fmtDateTime_(now_()) };
  if (p.name !== undefined) {
    fields.name = str_(p.name, 'Project name', { required: true });
    if (fields.name.indexOf(',') >= 0) throw err_.validation('A project name can\'t contain a comma (sessions list their projects separated by commas).');
  }
  if (p.description !== undefined) fields.description = str_(p.description, 'Description', { max: LIMITS.NOTES });
  if (p.schedule !== undefined) fields.schedule = str_(p.schedule, 'When', { max: 300 });
  if (p.venue !== undefined) fields.venue = p.venue ? requireVenue_(p.venue) : '';
  if (p.status !== undefined) fields.status = oneOf_(p.status, 'Status', ['active', 'archived']);
  if (fields.name) {
    const clash = projectRows_().find((x) => x.name.toLowerCase() === fields.name.toLowerCase());
    if (clash && clash.projectId !== p.projectId) throw err_.conflict(`"${clash.name}" is already a project.`);
  }
  if (p.projectId) {
    const pr = projects.find((x) => x.projectId === id_(p.projectId, 'Project'));
    if (!pr) throw err_.notFound('Project not found.');
    projects.update(pr, fields);
  } else {
    if (!fields.name) throw err_.validation('Project name is required.');
    const order = projectRows_().reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1;
    projects.insert(Object.assign({ projectId: newId_('P'), order, status: 'active', description: '', schedule: '', venue: '' }, fields));
  }
  return contentForLeaders_();
}

/* ---------------- volunteer guide ---------------- */

/** An <img> address for a link-shared image in Google Drive, `width` pixels wide. */
function driveImageUrl_(fileId, width) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width || 2000}`;
}

/** Links for a guide infographic stored in Google Drive (shared "anyone with the link"). */
function guideFileLinks_(fileId) {
  const id = encodeURIComponent(fileId);
  return {
    imageUrl: driveImageUrl_(fileId, 2000),
    previewUrl: `https://drive.google.com/file/d/${id}/preview`,
    openUrl: `https://drive.google.com/file/d/${id}/view`,
  };
}

function guideKind_(g) {
  return g.kind === 'image' || g.kind === 'pdf' ? g.kind : 'text';
}

function guideSections_() {
  const rows = table_('guide').rows().filter((g) => g.title || g.body || g.fileId);
  return sortBy_(rows, (g) => Number(g.order) || 0).map((g) => {
    const kind = guideKind_(g);
    const out = { sectionId: g.sectionId, kind, title: g.title, body: g.body, order: Number(g.order) || 0 };
    if (kind !== 'text') Object.assign(out, { fileId: g.fileId, fileName: g.fileName }, g.fileId ? guideFileLinks_(g.fileId) : {});
    return out;
  });
}

function saveGuideSection_(p, admin) {
  onlyFields_(p, ['sectionId', 'title', 'body']);
  const guide = table_('guide');
  const existing = p.sectionId ? guide.find((x) => x.sectionId === id_(p.sectionId, 'Section')) : null;
  if (p.sectionId && !existing) throw err_.notFound('Guide section not found.');
  const isFile = existing && guideKind_(existing) !== 'text';
  const fields = {
    // An infographic's heading and caption are optional; a text section needs both.
    title: str_(p.title, 'Title', { required: !isFile }),
    body: str_(p.body, isFile ? 'Caption' : 'Content', { required: !isFile, max: LIMITS.NOTES }),
    updatedBy: admin.name,
    updatedAt: fmtDateTime_(now_()),
  };
  if (existing) guide.update(existing, fields);
  else {
    const order = guide.rows().reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1;
    guide.insert(Object.assign({ sectionId: newId_('G'), order, kind: 'text' }, fields));
  }
  return contentForLeaders_();
}

/** A Drive folder the app owns (its ID kept in a script property), created the first time it's needed. */
function appFolder_(propKey, name) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(propKey);
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      // the folder was deleted: make a new one
    }
  }
  const folder = DriveApp.createFolder(name);
  props.setProperty(propKey, folder.getId());
  return folder;
}

function guideFolder_() {
  return appFolder_(CONFIG.PROP_GUIDE_FOLDER_ID, CONFIG.GUIDE_FILES.folderName);
}

/**
 * Saves a file an admin chose: uploaded (base64 `data`, `fileName`, `mimeType`)
 * into the app's folder, or picked from Google Drive by link (`driveUrl`).
 * Either way it's link-shared for viewing. Returns { file, warning }.
 */
function saveDriveImage_(p, allowedTypes, maxMb, folderProp, folderName, what) {
  const allowed = (t) => allowedTypes.indexOf(t) >= 0;
  const typeError = what === 'photo' ? 'Choose a photo (JPG or PNG).' : 'Choose an image (JPG or PNG) or a PDF.';
  let file;
  if (p.driveUrl) {
    const fileId = driveFileId_(p.driveUrl);
    try {
      file = DriveApp.getFileById(fileId);
    } catch (e) {
      throw err_.validation('The app\'s Google account can\'t open that file. Share it with the account the app runs as, or upload it from your device instead.');
    }
    if (!allowed(file.getMimeType())) throw err_.validation(typeError);
  } else {
    const mimeType = str_(p.mimeType, 'File type', { required: true, max: 100 });
    if (!allowed(mimeType)) throw err_.validation(typeError);
    const fileName = str_(p.fileName, 'File name', { required: true, max: 200 }).replace(/[\\/:*?"<>|]+/g, '_');
    if (typeof p.data !== 'string' || !p.data) throw err_.validation('No file was received. Choose the file again.');
    let bytes;
    try {
      bytes = Utilities.base64Decode(p.data.replace(/^data:[^,]*,/, ''));
    } catch (e) {
      throw err_.validation('The file could not be read. Choose it again.');
    }
    if (bytes.length > maxMb * 1024 * 1024) throw err_.validation(`The file is too big. Use one under ${maxMb} MB.`);
    file = appFolder_(folderProp, folderName).createFile(Utilities.newBlob(bytes, mimeType, fileName));
  }
  const warning = shareForViewing_(file) ? '' : ' Volunteers may not be able to see it: set the file to "Anyone with the link can view" in Google Drive.';
  return { file, warning };
}

/** The file ID in a Google Drive link (…/file/d/<id>/…, …?id=<id>, or the bare ID). */
function driveFileId_(link) {
  const s = str_(link, 'Google Drive link', { required: true, max: 500 });
  const m = /\/d\/([A-Za-z0-9_-]{10,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s) || /^([A-Za-z0-9_-]{20,})$/.exec(s);
  if (!m) throw err_.validation('That doesn\'t look like a Google Drive file link. In Drive, use Share → Copy link.');
  return m[1];
}

/** Lets anyone with the link view the file, so volunteers' phones can show it. */
function shareForViewing_(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return true;
  } catch (e) {
    return false; // e.g. a Google Workspace policy blocks link sharing
  }
}

/**
 * Adds an infographic (image or PDF) to the guide, or replaces the file of an
 * existing one (sectionId). The file is either uploaded from the admin's device
 * (base64 `data`, `fileName`, `mimeType`) or picked from Google Drive (`driveUrl`).
 * `position`: top (default, above everything else) or bottom.
 */
function addGuideFile_(p, admin) {
  onlyFields_(p, ['sectionId', 'title', 'body', 'position', 'driveUrl', 'data', 'fileName', 'mimeType']);
  const guide = table_('guide');
  const existing = p.sectionId ? guide.find((x) => x.sectionId === id_(p.sectionId, 'Section')) : null;
  if (p.sectionId && !existing) throw err_.notFound('Guide section not found.');
  const types = CONFIG.GUIDE_FILES.types;
  const saved = saveDriveImage_(p, Object.keys(types), CONFIG.GUIDE_FILES.maxMb, CONFIG.PROP_GUIDE_FOLDER_ID, CONFIG.GUIDE_FILES.folderName, 'guide');
  const file = saved.file;
  const warning = saved.warning;
  const kind = types[file.getMimeType()];
  const stamp = { kind, fileId: file.getId(), fileName: file.getName(), updatedBy: admin.name, updatedAt: fmtDateTime_(now_()) };
  if (p.title !== undefined) stamp.title = str_(p.title, 'Heading', { max: LIMITS.NAME });
  if (p.body !== undefined) stamp.body = str_(p.body, 'Caption', { max: LIMITS.NOTES });
  if (existing) {
    guide.update(existing, stamp);
  } else {
    const orders = guide.rows().map((x) => Number(x.order) || 0);
    const position = p.position === 'bottom' ? 'bottom' : 'top';
    const order = position === 'top' ? Math.min(1, ...orders) - 1 : Math.max(0, ...orders) + 1;
    guide.insert(Object.assign({ sectionId: newId_('G'), order, title: '', body: '' }, stamp));
  }
  return Object.assign(contentForLeaders_(), {
    message: `${kind === 'pdf' ? 'PDF' : 'Image'} ${existing ? 'replaced' : 'added to the guide'}. Volunteers see it straight away.${warning}`,
  });
}

/** Removes a section or infographic from the guide. An infographic's file stays in Google Drive. */
function deleteGuideSection_(p) {
  onlyFields_(p, ['sectionId']);
  const guide = table_('guide');
  const g = guide.find((x) => x.sectionId === id_(p.sectionId, 'Section'));
  if (!g) throw err_.notFound('Guide section not found.');
  guide.remove(g);
  return contentForLeaders_();
}

/** Moves a guide section or project one place up or down. */
function moveContent_(p) {
  onlyFields_(p, ['kind', 'id', 'direction']);
  const kind = oneOf_(p.kind, 'Kind', ['guide', 'projects']);
  const direction = oneOf_(p.direction, 'Direction', ['up', 'down']);
  const table = table_(kind);
  const idKey = kind === 'guide' ? 'sectionId' : 'projectId';
  const rows = sortBy_(table.rows().filter((r) => r[idKey] && (kind === 'guide' || r.status !== 'archived')), (r) => Number(r.order) || 0);
  // Normalise the order to 1..n first, so gaps or duplicates typed in the sheet don't matter.
  rows.forEach((r, i) => { if (Number(r.order) !== i + 1) table.update(r, { order: i + 1 }); });
  const i = rows.findIndex((r) => r[idKey] === p.id);
  if (i < 0) throw err_.notFound('Item not found.');
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j >= 0 && j < rows.length) {
    table.update(rows[i], { order: j + 1 });
    table.update(rows[j], { order: i + 1 });
  }
  return contentForLeaders_();
}

/** The guide, projects and venues as a volunteer reads them. */
function guide_(p, user) {
  return {
    sections: guideSections_(),
    projects: activeProjects_(),
    guideReadAt: user.guideReadAt || '',
  };
}

function acknowledgeGuide_(p, user) {
  if (!user.guideReadAt) table_('users').update(user, { guideReadAt: fmtDateTime_(now_()) });
  return { message: 'Thanks for reading the guide! You can now book sessions.', home: volunteerHome_({}, user) };
}

/** Everything admins edit on the Guide & projects and Venues pages. */
function contentForLeaders_() {
  return {
    sections: guideSections_(),
    projects: sortBy_(projectRows_(), (pr) => `${pr.status === 'archived' ? 1 : 0}${String(Number(pr.order) || 0).padStart(5, '0')}`).map(projectOut_),
    venues: activeVenues_(),
  };
}

/** Called by setup(): starting content for empty tabs. */
function seedContent_() {
  const added = [];
  resetDbCache_();
  if (!venueRows_().length) {
    CONFIG.DEFAULT_VENUES.forEach((name) => table_('venues').insert({
      venueId: newId_('V'), name, address: '', notes: '', status: 'active', createdBy: 'setup', createdAt: fmtDateTime_(now_()),
    }));
    if (CONFIG.DEFAULT_VENUES.length) added.push(`Added venue(s): ${CONFIG.DEFAULT_VENUES.join(', ')}`);
  }
  if (!table_('guide').rows().length) {
    DEFAULT_GUIDE.forEach((g, i) => table_('guide').insert({
      sectionId: newId_('G'), order: i + 1, kind: 'text', title: g.title, body: g.body, updatedBy: 'setup', updatedAt: fmtDateTime_(now_()),
    }));
    added.push(`Added ${DEFAULT_GUIDE.length} starter Volunteer Guide sections (edit them in the app: Admin → Settings → Guide & projects)`);
  }
  if (!projectRows_().length) {
    DEFAULT_PROJECTS.forEach((pr, i) => table_('projects').insert({
      projectId: newId_('P'), order: i + 1, name: pr.name, description: pr.description, schedule: pr.schedule,
      venue: venueByName_(pr.venue) ? pr.venue : '', status: 'active', updatedBy: 'setup', updatedAt: fmtDateTime_(now_()),
    }));
    added.push(`Added ${DEFAULT_PROJECTS.length} starter project(s)`);
  }
  // The projects new sessions tick by default (Config.gs → SESSION_OPTIONS.projects) must exist.
  const missing = (CONFIG.SESSION_OPTIONS.projects || []).filter((name) => !projectRows_().some((x) => x.name.toLowerCase() === name.toLowerCase()));
  missing.forEach((name) => {
    const known = DEFAULT_PROJECTS.find((pr) => pr.name === name) || { description: '', schedule: '', venue: '' };
    const order = projectRows_().reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1;
    table_('projects').insert({
      projectId: newId_('P'), order, name, description: known.description, schedule: known.schedule,
      venue: venueByName_(known.venue) ? known.venue : '', status: 'active', updatedBy: 'setup', updatedAt: fmtDateTime_(now_()),
    });
  });
  if (missing.length) added.push(`Added project(s): ${missing.join(', ')}`);
  return added;
}
