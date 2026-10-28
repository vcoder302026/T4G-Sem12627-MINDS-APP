/**
 * Profile.gs — editing a person's details in the app.
 *
 *   updateProfile   a volunteer (or leader) edits their own details under Me.
 *                   Changing the sign-in email needs their current password.
 *   personDetail    a leader opens anyone in People (volunteers and leaders).
 *   updatePerson    a leader edits anyone's details, role or active status.
 *
 * Both use the same checks as registration. Each save writes only the cells
 * that changed and stamps "Details Updated By / At" on the person's row.
 */

const PROFILE_FIELDS = ['name', 'birthday', 'email', 'phone', 'telegram', 'emergencyName', 'emergencyPhone', 'emergencyRelation'];

const PROFILE_LABELS = {
  name: 'name',
  birthday: 'birthday',
  email: 'email',
  phone: 'phone',
  telegram: 'Telegram',
  emergencyName: 'emergency contact',
  emergencyPhone: 'emergency phone',
  emergencyRelation: 'relationship',
  role: 'role',
  status: 'status',
};

/** Validates whichever profile fields were sent (same rules as registration). */
function profilePatch_(p) {
  const has = (k) => Object.prototype.hasOwnProperty.call(p, k);
  const patch = {};
  if (has('name')) patch.name = str_(p.name, 'Full name', { required: true, max: LIMITS.SHORT });
  if (has('birthday')) {
    patch.birthday = date_(p.birthday, 'Birthday');
    if (patch.birthday > todayStr_()) throw err_.validation('Birthday cannot be in the future.');
  }
  if (has('email')) patch.email = email_(p.email);
  if (has('phone')) patch.phone = sgPhone_(p.phone, 'Phone');
  if (has('telegram')) patch.telegram = telegram_(p.telegram);
  if (has('emergencyName')) patch.emergencyName = str_(p.emergencyName, 'Emergency contact name', { max: LIMITS.SHORT });
  if (has('emergencyPhone')) patch.emergencyPhone = sgPhone_(p.emergencyPhone, 'Emergency contact phone', { optional: true });
  if (has('emergencyRelation')) patch.emergencyRelation = str_(p.emergencyRelation, 'Relationship', { max: 50 });
  return patch;
}

/* ---------- the registration form's extra questions (Config.gs → REGISTRATION) ---------- */

/** The options of a choice / multi question: a list, or 'projects' for the active projects. */
function registrationOptions_(f) {
  if (f.options === 'projects') return activeProjects_().map((pr) => pr.name);
  return f.options || [];
}

/** The form as the app draws it (public: shown before signing in). */
function registrationForm_() {
  return {
    sections: REGISTRATION.sections,
    fields: REGISTRATION.fields.map((f) => ({
      key: f.key, label: f.label, type: f.type, section: f.section, required: Boolean(f.required), hint: f.hint || '',
      options: f.type === 'yesno' ? ['Yes', 'No'] : registrationOptions_(f),
      placeholder: f.placeholder || '', private: Boolean(f.private), showIf: f.showIf || null,
    })),
  };
}

/**
 * Checks the answers to the extra questions. `partial` (editing details):
 * only the questions sent are checked, and a required one can't be cleared.
 * Returns { key: cell text }; several choices are stored as "A, B".
 */
function registrationAnswers_(answers, partial, current) {
  const a = answers === undefined || answers === null ? {} : obj_(answers, 'Answers');
  const known = REGISTRATION.fields.map((f) => f.key);
  Object.keys(a).forEach((k) => { if (known.indexOf(k) === -1) throw err_.validation(`Unknown question "${k}".`); });
  const out = {};
  // The answer a showIf question depends on: the one sent now, else the one saved.
  const answerOf = (key) => String(Object.prototype.hasOwnProperty.call(a, key) ? a[key] : (current && current[key]) || '');
  const applies = (f) => !f.showIf || answerOf(f.showIf.key).toLowerCase().indexOf(String(f.showIf.startsWith).toLowerCase()) === 0;
  REGISTRATION.fields.forEach((f) => {
    if (partial && !Object.prototype.hasOwnProperty.call(a, f.key) && !(f.showIf && Object.prototype.hasOwnProperty.call(a, f.showIf.key))) return;
    if (!applies(f)) {
      out[f.key] = ''; // e.g. the RSPID questions for a West End volunteer: not asked, cleared
      return;
    }
    const raw = a[f.key];
    const options = f.type === 'yesno' ? ['Yes', 'No'] : registrationOptions_(f);
    const free = options.indexOf('Other') >= 0; // "Other" lets people type their own answer
    const pick = (v) => {
      const text = str_(v, f.label, { max: LIMITS.SHORT });
      const match = options.find((o) => o.toLowerCase() === text.toLowerCase());
      if (match) return match;
      if (text && free) return text;
      if (text) throw err_.validation(`${f.label}: choose one of the options.`);
      return '';
    };
    let value;
    if (f.type === 'multi') {
      const list = raw === undefined || raw === null || raw === '' ? [] : Array.isArray(raw) ? raw : String(raw).split(/\s*,\s*/);
      if (list.length > 20) throw err_.validation(`${f.label}: too many choices.`);
      value = list.map(pick).filter(Boolean).filter((x, i, all) => all.indexOf(x) === i).join(', ');
    } else if (f.type === 'choice' || f.type === 'yesno') {
      value = pick(raw);
    } else if (f.type === 'phone') {
      value = sgPhone_(raw, f.label, { optional: true });
    } else if (f.type === 'email') {
      const text = str_(raw, f.label, { max: 254 });
      value = text ? emailAs_(text, f.label) : '';
    } else if (f.type === 'year') {
      value = str_(raw, f.label, { max: 10 });
      const y = Number(value);
      const thisYear = Number(todayStr_().slice(0, 4));
      if (value && (!/^\d{4}$/.test(value) || y < 1970 || y > thisYear)) throw err_.validation(`${f.label}: a year like ${thisYear}, not later than this year.`);
    } else if (f.type === 'nric4') {
      value = str_(raw, f.label, { max: 10 }).toUpperCase().replace(/\s/g, '');
      if (value && !/^\d{3}[A-Z]$/.test(value)) throw err_.validation('NRIC: just the last 4 characters, 3 digits and a letter, e.g. 123A.');
    } else if (f.type === 'matric') {
      value = str_(raw, f.label, { max: 20 }).toUpperCase().replace(/\s/g, '');
      if (value && !/^[A-Z0-9]{5,12}$/.test(value)) throw err_.validation(`${f.label}: letters and numbers only, e.g. U2312345A.`);
    } else {
      value = str_(raw, f.label, { max: f.type === 'textarea' ? LIMITS.NOTES : LIMITS.NAME });
    }
    if (f.required && !value) throw err_.validation(`Please answer: ${f.label}`);
    out[f.key] = value;
  });
  return out;
}

/** A person's answers, for their Me page and the admin profile: [{ key, label, value }]. */
function registrationAnswersOut_(u) {
  return REGISTRATION.fields
    .filter((f) => !f.showIf || String(u[f.showIf.key] || '').toLowerCase().indexOf(String(f.showIf.startsWith).toLowerCase()) === 0)
    .map((f) => ({ key: f.key, label: f.label, value: u[f.key] === undefined ? '' : String(u[f.key]), private: Boolean(f.private) }));
}

/** Keeps only the fields whose value actually changes. */
function changedOnly_(row, patch) {
  const out = {};
  Object.keys(patch).forEach((k) => {
    if (String(row[k] === undefined ? '' : row[k]) !== String(patch[k])) out[k] = patch[k];
  });
  return out;
}

function assertEmailFree_(users, email, userId) {
  const clash = users.find((u) => u.userId !== userId && String(u.email).trim().toLowerCase() === email);
  if (clash) throw err_.conflict('Another account already uses this email.');
}

function changedMessage_(changes, prefix) {
  const keys = Object.keys(changes);
  if (!keys.length) return 'No changes to save.';
  const names = keys.map((k) => PROFILE_LABELS[k] || (REGISTRATION.fields.find((f) => f.key === k) || { header: k }).header.toLowerCase());
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return `${prefix} ${list}.`;
}

/**
 * Volunteers see the volunteer name on their open bookings (and leaders see it
 * on session lists), so a new name is copied to today's and future bookings.
 * Past bookings and attendance keep the name used at the time.
 */
function renameInOpenBookings_(userId, name) {
  const bookings = table_('bookings');
  const today = todayStr_();
  bookings.filter((b) => b.userId === userId && b.status !== 'cancelled' && String(b.sessionDate) >= today)
    .forEach((b) => bookings.update(b, { volunteerName: name }));
}

function applyProfileChanges_(users, target, changes, editor) {
  if (!Object.keys(changes).length) return target;
  const stamped = Object.assign({}, changes, { updatedBy: editor.name, updatedAt: fmtDateTime_(now_()) });
  users.update(target, stamped);
  if (changes.name) renameInOpenBookings_(target.userId, changes.name);
  return target;
}

/* ---------- self-service ---------- */

function updateProfile_(p, user) {
  onlyFields_(p, PROFILE_FIELDS.concat(['currentPassword', 'answers']));
  const users = table_('users');
  const target = users.find((u) => u.userId === user.userId);
  const changes = changedOnly_(target, Object.assign(profilePatch_(p), registrationAnswers_(p.answers, true, target)));
  if (changes.email) {
    const authRow = table_('auth').find((a) => a.userId === user.userId);
    if (typeof p.currentPassword !== 'string' || !p.currentPassword
      || !safeEqual_(hashPassword_(p.currentPassword, authRow.salt), authRow.passwordHash)) {
      throw err_.validation('Enter your current password to change the email you sign in with.');
    }
    assertEmailFree_(users, changes.email, user.userId);
  }
  applyProfileChanges_(users, target, changes, user);
  return {
    user: publicUser_(target),
    changed: Object.keys(changes),
    message: changes.email
      ? `Saved. Sign in with ${changes.email} from now on.`
      : changedMessage_(changes, 'Saved your new'),
  };
}

/* ---------- leaders ---------- */

function personOut_(u, hasAccount) {
  return Object.assign(publicUser_(u), {
    status: u.status === 'inactive' ? 'inactive' : 'active',
    hasAccount: Boolean(hasAccount),
    updatedBy: u.updatedBy || '',
    updatedAt: u.updatedAt || '',
  });
}

function personDetail_(p) {
  onlyFields_(p, ['userId']);
  const target = table_('users').find((u) => u.userId === id_(p.userId, 'User'));
  if (!target) throw err_.notFound('Person not found.');
  const hasAccount = Boolean(table_('auth').find((a) => a.userId === target.userId));
  const attendance = table_('attendance').filter((a) => a.userId === target.userId);
  const done = attendance.filter((a) => a.clockOut);
  const hours = Math.round(done.reduce((sum, a) => sum + (Number(a.hours) || 0), 0) * 100) / 100;
  const sessionsById = byKey_(table_('sessions').rows(), 'sessionId');
  const bookingById = byKey_(table_('bookings').filter((b) => b.userId === target.userId), 'bookingId');
  const recent = sortBy_(done, (a) => `${a.date} ${a.clockIn}`).reverse().slice(0, 10).map((a) => {
    const b = bookingById[a.bookingId] || {};
    return {
      date: a.date,
      title: (sessionsById[a.sessionId] || {}).title || 'Session',
      hours: Number(a.hours) || 0,
      trainees: bookingTrainees_(b),
      traineeId: bookingTraineeIds_(b)[0] || '', // the first, for older screens
      traineeName: namesText_(bookingTrainees_(b).map((t) => t.name)),
    };
  });
  const upcoming = table_('bookings').filter((b) => b.userId === target.userId && b.status !== 'cancelled' && String(b.sessionDate) >= todayStr_());
  const fixed = activeStandings_(target.userId);
  return {
    person: personOut_(target, hasAccount),
    stats: { hours, sessions: done.length, upcoming: upcoming.length, noShows: noShowsByUser_()[target.userId] || 0, attended: sessionsAttended_(target.userId) },
    regularAfter: CONFIG.REGULAR_AFTER_SESSIONS,
    contact: contactInfo_(target), // Google Contacts sync (Contacts.gs)
    regularTrainees: fixed.map((x) => ({ id: String(x.traineeId), name: x.traineeName })),
    regularTrainee: fixed.length ? { id: String(fixed[0].traineeId), name: fixed[0].traineeName } : null, // the first, for older screens
    regularHistory: sortBy_(allPairingRows_().filter((x) => x.userId === target.userId), (x) => x.from).reverse()
      .map((x) => ({ traineeId: x.traineeId, traineeName: x.traineeName, from: x.from, to: x.active ? '' : x.to, active: x.active })),
    typeSetBy: target.typeSetBy || '',
    recent,
  };
}

function updatePerson_(p, admin) {
  onlyFields_(p, ['userId'].concat(PROFILE_FIELDS, ['role', 'status', 'adminPassword']));
  const users = table_('users');
  const target = users.find((u) => u.userId === id_(p.userId, 'User'));
  if (!target) throw err_.notFound('Person not found.');
  const fields = {};
  PROFILE_FIELDS.forEach((k) => { if (Object.prototype.hasOwnProperty.call(p, k)) fields[k] = p[k]; });
  const patch = profilePatch_(fields);
  if (p.role !== undefined) patch.role = oneOf_(p.role, 'Role', ['volunteer', 'admin']);
  if (p.status !== undefined) patch.status = oneOf_(p.status, 'Status', ['active', 'inactive']);
  const current = Object.assign({}, target, {
    role: target.role === 'admin' ? 'admin' : 'volunteer',
    status: target.status === 'inactive' ? 'inactive' : 'active',
  });
  const changes = changedOnly_(current, patch);

  const self = target.userId === admin.userId;
  if (self && changes.role === 'volunteer') throw err_.conflict('You cannot remove your own admin access. Ask another admin.');
  if (self && changes.status === 'inactive') throw err_.conflict('You cannot deactivate your own account. Ask another admin.');
  const losesAdmin = current.role === 'admin' && current.status === 'active'
    && (changes.role === 'volunteer' || changes.status === 'inactive');
  if (losesAdmin) {
    const others = users.filter((u) => u.userId !== target.userId && u.role === 'admin' && u.status !== 'inactive');
    if (!others.length) throw err_.conflict('There must be at least one active admin.');
  }
  // Any change to who is an active admin needs the shared admin password (AdminPassword.gs):
  // making someone an admin, removing admin access, deactivating or reactivating an admin.
  const wasAdmin = current.role === 'admin' && current.status === 'active';
  const willBeAdmin = (changes.role || current.role) === 'admin' && (changes.status || current.status) === 'active';
  if (wasAdmin !== willBeAdmin) {
    checkAdminPassword_(admin, p.adminPassword, willBeAdmin ? 'Enter the admin password to make someone an admin.' : 'Enter the admin password to remove an admin.');
  }
  if (changes.email) assertEmailFree_(users, changes.email, target.userId);

  const oldName = target.name;
  applyProfileChanges_(users, target, changes, admin);
  const madeRegular = !wasAdmin && willBeAdmin && makeRegularAsAdmin_(target); // admins are regular volunteers by default
  // Deactivated volunteers can't come, so they come off upcoming sessions (marked cancelled, not deleted).
  let offSessions = 0;
  if (changes.status === 'inactive') {
    const bookings = table_('bookings');
    bookings.filter((b) => b.userId === target.userId && b.status !== 'cancelled' && String(b.sessionDate) >= todayStr_()).forEach((b) => {
      bookings.update(b, { status: 'cancelled', decidedBy: `${admin.name} (deactivated the volunteer)`, decidedAt: fmtDateTime_(now_()) });
      offSessions += 1;
    });
  }
  const profileChanges = {};
  Object.keys(changes).filter((k) => PROFILE_FIELDS.indexOf(k) >= 0).forEach((k) => { profileChanges[k] = changes[k]; });
  const parts = [];
  if (Object.keys(profileChanges).length) parts.push(changedMessage_(profileChanges, `Updated ${oldName}'s`));
  if (changes.role) parts.push(changes.role === 'admin' ? `${target.name} is now an admin.` : `${target.name} is no longer an admin.`);
  if (madeRegular) parts.push('Admins are regular volunteers, so they are now a regular too.');
  if (changes.status) parts.push(changes.status === 'inactive' ? `${target.name} is deactivated and can no longer sign in.` : `${target.name} is active again.`);
  if (offSessions) parts.push(`Taken off ${offSessions} upcoming session${offSessions === 1 ? '' : 's'}.`);
  if (changes.email) parts.push(`They now sign in with ${changes.email}.`);
  const message = parts.join(' ') || 'No changes to save.';
  const hasAccount = Boolean(table_('auth').find((a) => a.userId === target.userId));
  return { person: personOut_(target, hasAccount), changed: Object.keys(changes), message };
}
