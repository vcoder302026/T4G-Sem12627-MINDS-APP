/**
 * AdminLog.gs — "who did what": every change an admin makes is added to the
 * Admin Activity Log tab (one row per change, in plain English).
 *
 * Main.gs calls logAdminAction_ after each successful admin write, inside the
 * same lock, so the log always matches the data. Passwords are never logged.
 * Staff can read the tab in the sheet, or in the app under Admin → Activity log.
 */

const ADMIN_ACTION_LABELS = {
  createSession: 'Created a session',
  createSessions: 'Added sessions',
  updateSession: 'Edited a session',
  updateBooking: 'Changed a sign-up or pairing',
  addWalkIn: 'Added a walk-in',
  scan: 'Scanned a QR pass',
  scanBatch: 'Uploaded offline scans',
  manualClock: 'Clocked a volunteer in/out by hand',
  setRole: 'Changed admin access',
  updatePerson: 'Edited a volunteer',
  resetPassword: 'Reset a password',
  setVolunteerType: 'Changed a volunteer type',
  setStandingPairing: 'Changed a regular pairing',
  addTraineeNote: 'Added a trainee note',
  setNoteStatus: 'Changed a note',
  reviewObservation: 'Reviewed a volunteer note',
  saveVenue: 'Saved a venue',
  saveProject: 'Saved a project',
  saveGuideSection: 'Edited the Volunteer Guide',
  deleteGuideSection: 'Deleted a guide section',
  addGuideFile: 'Added an infographic to the guide',
  moveContent: 'Reordered the guide or projects',
  saveVisibility: 'Changed what volunteers see about trainees',
  setTraineePhoto: 'Changed a trainee photo',
  changeAdminPassword: 'Changed the admin password',
  resetAdminPassword: 'Reset the admin password',
  addAttendance: 'Added attendance',
  updateAttendance: 'Corrected attendance',
  createVolunteer: 'Added a volunteer',
  createTrainee: 'Added a trainee',
  updateTrainee: 'Edited a trainee',
  makeFirstAdmin: 'Made the first admin',
};

/** Short, readable description of what an admin action changed. */
function describeAdminAction_(action, p, out) {
  const names = nameMaps_();
  const person = (id) => names.users[id] || id || '';
  const trainee = (id) => names.trainees[String(id)] || id || '';
  const session = (id) => {
    const s = id ? table_('sessions').find((x) => x.sessionId === id) : null;
    return s ? `${s.title} (${s.date})` : id || '';
  };
  const booking = (id) => (id ? table_('bookings').find((b) => b.bookingId === id) : null);
  const list = (o) => Object.keys(o).filter((k) => ['userId', 'adminPassword', 'currentPassword', 'password'].indexOf(k) === -1).join(', ');
  switch (action) {
    case 'createSession': return `${p.title || ''} on ${p.date || ''}`;
    case 'createSessions': return `${p.title || ''}, ${p.startTime || ''}–${p.endTime || ''}: ${out && out.created ? out.created.map((s) => s.date).join(', ') : ''}`;
    case 'updateSession': return `${session(p.sessionId)}: ${p.status ? `status → ${p.status}` : `changed ${list(p).replace('sessionId', '').replace(/^, |, $/g, '')}`}`;
    case 'updateBooking': {
      const b = booking(p.bookingId);
      const who = b ? `${b.volunteerName}, ${b.sessionTitle} (${b.sessionDate})` : p.bookingId;
      if (p.status === 'cancelled') return `Removed ${who}`;
      if (Object.prototype.hasOwnProperty.call(p, 'traineeId')) return p.traineeId ? `Paired ${who} with ${trainee(p.traineeId)}` : `Unpaired ${who}`;
      return who;
    }
    case 'addWalkIn': return `${person(p.userId)} at ${session(p.sessionId)}`;
    case 'scan': return out && out.volunteer ? `${out.volunteer.name}: ${out.outcome}` : 'QR pass';
    case 'scanBatch': return `${(p.scans || []).length} scan(s)`;
    case 'manualClock': {
      const b = booking(p.bookingId);
      return b ? `${b.volunteerName}: ${out && out.outcome ? out.outcome : ''} (${b.sessionTitle})` : p.bookingId;
    }
    case 'setRole': return `${person(p.userId)} → ${p.role === 'admin' ? 'admin' : 'not an admin'}`;
    case 'updatePerson': {
      const changed = out && out.changed ? out.changed : [];
      const bits = changed.map((k) => (k === 'role' ? `role → ${p.role}` : k === 'status' ? `status → ${p.status}` : k));
      return `${person(p.userId)}: ${bits.length ? bits.join(', ') : 'no changes'}`;
    }
    case 'resetPassword': return person(p.userId);
    case 'setVolunteerType': return `${person(p.userId)} → ${p.volunteerType}`;
    case 'setStandingPairing': return p.traineeId ? `${person(p.userId)} ↔ ${trainee(p.traineeId)}` : `${person(p.userId)}: regular pairing removed`;
    case 'addTraineeNote': return trainee(p.traineeId);
    case 'changeAdminPassword': return ''; // never log passwords
    case 'resetAdminPassword': return 'from the Apps Script editor';
    case 'setTraineePhoto': return `${trainee(p.traineeId)}: ${p.remove ? 'photo removed' : p.driveUrl ? 'photo from Google Drive' : 'photo uploaded'}`;
    case 'setNoteStatus': return `${p.noteId} → ${p.status}`;
    case 'reviewObservation': return `${p.feedbackId}: ${p.decision}`;
    case 'saveVenue': return p.name || p.venueId || '';
    case 'saveProject': return p.name || p.projectId || '';
    case 'saveGuideSection': return p.title || p.sectionId || '';
    case 'deleteGuideSection': return p.sectionId || '';
    case 'addGuideFile': return `${p.title || p.fileName || 'Infographic'}${p.driveUrl ? ' (from Google Drive)' : ' (uploaded)'}${p.sectionId ? ', replacing the old file' : ''}`;
    case 'saveVisibility': return `${p.traineeId ? trainee(p.traineeId) : 'Default'} (${p.audience === 'regular' ? 'regulars' : 'volunteers'})${p.reset ? ': back to default' : ''}`;
    case 'addAttendance': return `${person(p.userId)} at ${session(p.sessionId)}`;
    case 'updateAttendance': return p.attendanceId || '';
    case 'createVolunteer': return `${p.name || ''} (${p.email || ''})`;
    case 'createTrainee': return p.name || '';
    case 'updateTrainee': return `${trainee(p.traineeId)}: ${list(p).replace('traineeId', '').replace(/^, |, $/g, '')}`;
    case 'makeFirstAdmin': return person(p.userId);
    default: return list(p);
  }
}

function logAdminAction_(admin, action, payload, out) {
  let summary = '';
  try {
    summary = describeAdminAction_(action, payload || {}, out);
  } catch (e) {
    summary = '';
  }
  table_('adminLog').insert({
    logId: newId_('L'),
    at: fmtDateTime_(now_()),
    adminId: admin.userId || '',
    adminName: admin.name || '',
    action: ADMIN_ACTION_LABELS[action] || action,
    summary: String(summary).slice(0, 500),
  });
}

/** Newest first, optionally filtered by admin, date range and text. */
function listAdminLog_(p) {
  onlyFields_(p, ['adminId', 'from', 'to', 'query', 'limit']);
  const range = dateRange_(p);
  const adminId = p.adminId ? id_(p.adminId, 'Admin') : '';
  const q = str_(p.query, 'Search', { max: 100 }).toLowerCase();
  const limit = p.limit ? int_(p.limit, 'Limit', 1, 1000) : 300;
  const rows = table_('adminLog').rows().filter((r) => r.logId
    && range.contains(String(r.at).slice(0, 10))
    && (!adminId || r.adminId === adminId)
    && (!q || `${r.adminName} ${r.action} ${r.summary}`.toLowerCase().indexOf(q) >= 0));
  const admins = {};
  table_('adminLog').rows().forEach((r) => { if (r.adminId) admins[r.adminId] = r.adminName; });
  table_('users').rows().forEach((u) => { if (u.role === 'admin' && u.userId) admins[u.userId] = u.name; });
  return {
    entries: rows.slice().reverse().slice(0, limit).map((r) => ({ at: r.at, adminId: r.adminId, adminName: r.adminName, action: r.action, summary: r.summary })),
    total: rows.length,
    admins: sortBy_(Object.keys(admins).map((id) => ({ userId: id, name: admins[id] })), (a) => String(a.name).toLowerCase()),
  };
}
