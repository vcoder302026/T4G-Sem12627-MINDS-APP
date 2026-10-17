/**
 * Content.gs — things admins manage in the app:
 * venues, projects, and the Volunteer Guide new volunteers read first.
 *
 * Starting content is added by setup() only when a tab is empty. Admins then
 * edit it in the app (Admin → Guide & venues), or directly in the sheet.
 * Any guide section can show a picture or a PDF (Files.gs). The "On the day"
 * section starts with a built-in infographic (web/img/on-the-day.svg), which
 * admins can replace with their own picture or PDF.
 */

const DEFAULT_GUIDE = [
  {
    title: 'Welcome to MINDS volunteering',
    body: 'Thank you for volunteering with MINDS. Our trainees are persons with intellectual disabilities, and your time helps them learn, play and build confidence.\n\nThis guide takes about 3 minutes. Read it once before your first session. You can open it again any time from the Me tab.',
  },
  {
    title: 'What to wear',
    body: '- Comfortable, modest clothes you can move and sit on the floor in\n- Covered shoes (sports shoes are best)\n- No dangling jewellery, and keep nails short\n- Your volunteer T-shirt, if you have one\n- A water bottle, and a cap for outdoor sessions',
  },
  {
    title: 'What we expect from you',
    body: '- Arrive 10 to 15 minutes early\n- Stay with your paired trainee unless MINDS staff ask you to switch\n- Be patient and kind, and speak to trainees with the respect you would give anyone their age\n- Keep your phone away during activities\n- No photos or videos of trainees unless MINDS staff say it is allowed\n- Tell MINDS staff straight away about any injury, distress or safety worry\n- Can\'t make it? Tap "Can\'t make it" in the app as early as possible',
  },
  {
    title: 'On the day',
    body: 'Your session day at a glance.',
    media: 'builtin:on-the-day',
  },
  {
    title: 'Working with your trainee',
    body: '- Use short, simple sentences and give time to answer\n- Show as well as tell: demonstrate, point, use pictures\n- Follow the "Things to take note" in your trainee\'s profile\n- Praise effort, not just results\n- If your trainee becomes upset, stay calm, give them space and call MINDS staff',
  },
];

const DEFAULT_PROJECTS = [
  {
    name: 'School activity support',
    description: 'Help trainees during classroom and recreational activities: crafts, games, music and life-skills practice.',
    schedule: 'See the Schedule in the app',
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

function saveProject_(p, admin) {
  onlyFields_(p, ['projectId', 'name', 'description', 'schedule', 'venue', 'status']);
  const projects = table_('projects');
  const fields = { updatedBy: admin.name, updatedAt: fmtDateTime_(now_()) };
  if (p.name !== undefined) fields.name = str_(p.name, 'Project name', { required: true });
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

/** A guide section's picture or PDF: { fileId, kind: builtin | image | pdf, name, src } or null. */
function guideMedia_(fileId) {
  const id = String(fileId || '').trim();
  if (!id) return null;
  if (id === 'builtin:on-the-day') return { fileId: id, kind: 'builtin', name: 'On the day infographic', src: 'img/on-the-day.svg' };
  const f = table_('files').find((x) => x.fileId === id);
  if (!f) return null;
  return { fileId: id, kind: f.mimeType === 'application/pdf' ? 'pdf' : 'image', name: f.name, sizeKb: Number(f.sizeKb) || 0 };
}

function guideSections_() {
  return sortBy_(table_('guide').rows().filter((g) => g.title || g.body), (g) => String(Number(g.order) || 0).padStart(5, '0'))
    .map((g) => ({ sectionId: g.sectionId, title: g.title, body: g.body, order: Number(g.order) || 0, media: guideMedia_(g.mediaFileId) }));
}

function saveGuideSection_(p, admin) {
  onlyFields_(p, ['sectionId', 'title', 'body', 'useInfographic']);
  const guide = table_('guide');
  const fields = {
    title: str_(p.title, 'Title', { required: true }),
    body: str_(p.body, 'Content', { max: LIMITS.NOTES }),
    updatedBy: admin.name,
    updatedAt: fmtDateTime_(now_()),
  };
  if (p.useInfographic === true) fields.mediaFileId = 'builtin:on-the-day';
  if (!fields.body && !p.sectionId && p.useInfographic !== true) throw err_.validation('Add some content, or a picture/PDF after saving.');
  if (p.sectionId) {
    const g = guide.find((x) => x.sectionId === id_(p.sectionId, 'Section'));
    if (!g) throw err_.notFound('Guide section not found.');
    guide.update(g, fields);
  } else {
    const order = guide.rows().reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1;
    guide.insert(Object.assign({ sectionId: newId_('G'), order }, fields));
  }
  return contentForLeaders_();
}

function deleteGuideSection_(p) {
  onlyFields_(p, ['sectionId']);
  const guide = table_('guide');
  const g = guide.find((x) => x.sectionId === id_(p.sectionId, 'Section'));
  if (!g) throw err_.notFound('Guide section not found.');
  const media = g.mediaFileId;
  const title = g.title;
  guide.remove(g);
  deleteUpload_(media); // Files.gs
  return Object.assign(contentForLeaders_(), { message: `Deleted "${title}" from the guide.` });
}

/** Moves a guide section or project one place up or down. */
function moveContent_(p) {
  onlyFields_(p, ['kind', 'id', 'direction']);
  const kind = oneOf_(p.kind, 'Kind', ['guide', 'projects']);
  const direction = oneOf_(p.direction, 'Direction', ['up', 'down']);
  const table = table_(kind);
  const idKey = kind === 'guide' ? 'sectionId' : 'projectId';
  const rows = sortBy_(table.rows().filter((r) => r[idKey] && (kind === 'guide' || r.status !== 'archived')), (r) => String(Number(r.order) || 0).padStart(5, '0'));
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
  return { message: 'Thanks for reading the guide! You can now sign up for sessions.', home: volunteerHome_({}, user) };
}

/** Everything admins edit on the Guide & venues screens. */
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
      sectionId: newId_('G'), order: i + 1, title: g.title, body: g.body, mediaFileId: g.media || '', updatedBy: 'setup', updatedAt: fmtDateTime_(now_()),
    }));
    added.push(`Added ${DEFAULT_GUIDE.length} starter Volunteer Guide sections (edit them in the app: Admin → Guide & venues)`);
  }
  if (!projectRows_().length) {
    DEFAULT_PROJECTS.forEach((pr, i) => table_('projects').insert({
      projectId: newId_('P'), order: i + 1, name: pr.name, description: pr.description, schedule: pr.schedule,
      venue: venueByName_(pr.venue) ? pr.venue : '', status: 'active', updatedBy: 'setup', updatedAt: fmtDateTime_(now_()),
    }));
    added.push(`Added ${DEFAULT_PROJECTS.length} starter project(s)`);
  }
  return added;
}
