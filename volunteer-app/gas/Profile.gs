/**
 * Profile.gs — a person's details, and whether they are a new or regular volunteer.
 *
 *   updateProfile   a volunteer edits their own details under Me.
 *                   Changing the sign-in email needs their current password.
 *   personDetail    an admin opens anyone in Admin → Volunteers.
 *   updatePerson    an admin edits anyone's details, volunteer type or active
 *                   status. Deactivating (or reactivating) someone needs the
 *                   admin password typed again.
 *
 * Both use the same checks as registration. Each save writes only the cells
 * that changed and stamps "Details Updated By / At" on the person's row.
 *
 * New or regular: the "Volunteer Type" column. Blank = automatic: a volunteer
 * becomes regular once they have completed REGULAR_AFTER_SESSIONS sessions
 * (the cell is then set to "Regular", with the date in "Regular Since").
 * Admins can also set Regular (e.g. someone who volunteered before the app) or
 * New (stays new however many sessions they do).
 */

const PROFILE_FIELDS = ['name', 'birthday', 'email', 'phone', 'telegram'];

const PROFILE_LABELS = {
  name: 'name',
  birthday: 'birthday',
  email: 'email',
  phone: 'phone',
  telegram: 'Telegram',
  status: 'status',
  volunteerType: 'volunteer type',
};

/* ---------- new or regular ---------- */

/** Completed sessions per volunteer (attendance with a clock-out), worked out once per request. */
function completedCounts_() {
  return memo_('completedCounts', () => {
    const counts = {};
    table_('attendance').rows().forEach((a) => {
      if (a.clockOut && a.userId) counts[a.userId] = (counts[a.userId] || 0) + 1;
    });
    return counts;
  });
}

function typeSetting_(u) {
  const t = String(u.volunteerType || '').trim().toLowerCase();
  return t === 'regular' ? 'regular' : t === 'new' ? 'new' : 'auto';
}

/** { type: regular | new, setting: auto | regular | new, completed } */
function volunteerTypeOf_(u) {
  const completed = completedCounts_()[u.userId] || 0;
  const setting = typeSetting_(u);
  const regular = setting === 'regular' || (setting === 'auto' && completed >= CONFIG.REGULAR_AFTER_SESSIONS);
  return { type: regular ? 'regular' : 'new', setting, completed };
}

const isRegular_ = (u) => volunteerTypeOf_(u).type === 'regular';

/**
 * After a session is completed: promotes an automatic volunteer who has now
 * reached REGULAR_AFTER_SESSIONS. Returns a sentence for the message, or ''.
 */
function maybePromote_(user) {
  delete DB_.memo.completedCounts; // a clock-out has just been written
  if (typeSetting_(user) !== 'auto' || !isRegular_(user)) return '';
  table_('users').update(user, { volunteerType: 'Regular', regularSince: todayStr_() });
  return ` ${user.name} has now done ${CONFIG.REGULAR_AFTER_SESSIONS} sessions and is a regular volunteer.`;
}

/* ---------- checks shared by self-service and admins ---------- */

/** Validates whichever profile fields were sent (same rules as registration). */
function profilePatch_(p, opts) {
  const has = (k) => Object.prototype.hasOwnProperty.call(p, k);
  const patch = {};
  if (has('name')) patch.name = str_(p.name, 'Full name', { required: true, max: LIMITS.SHORT });
  if (has('birthday')) {
    patch.birthday = date_(p.birthday, 'Birthday', { optional: opts && opts.byAdmin });
    if (patch.birthday && patch.birthday > todayStr_()) throw err_.validation('Birthday cannot be in the future.');
  }
  if (has('email')) patch.email = email_(p.email);
  if (has('phone')) patch.phone = phone_(p.phone, 'Phone', { optional: opts && opts.byAdmin });
  if (has('telegram')) patch.telegram = telegram_(p.telegram, { required: CONFIG.REQUIRE_TELEGRAM && !(opts && opts.byAdmin) });
  return patch;
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
  const names = keys.map((k) => PROFILE_LABELS[k] || k);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return `${prefix} ${list}.`;
}

/**
 * Volunteers see the volunteer name on their open bookings (and admins see it
 * on session lists), so a new name is copied to today's and future bookings
 * and to active regular pairs. Past bookings and attendance keep the name used at the time.
 */
function renameInOpenBookings_(userId, name) {
  const bookings = table_('bookings');
  const today = todayStr_();
  bookings.filter((b) => b.userId === userId && b.status !== 'cancelled' && String(b.sessionDate) >= today)
    .forEach((b) => bookings.update(b, { volunteerName: name }));
  const pairs = table_('pairs');
  pairs.filter((x) => x.userId === userId && x.status !== 'ended').forEach((x) => pairs.update(x, { volunteerName: name }));
}

const CONTACT_FIELDS = ['name', 'email', 'phone', 'telegram'];

function applyProfileChanges_(users, target, changes, editor) {
  if (!Object.keys(changes).length) return target;
  const stamped = Object.assign({}, changes, { updatedBy: editor.name, updatedAt: fmtDateTime_(now_()) });
  users.update(target, stamped);
  if (changes.name) renameInOpenBookings_(target.userId, changes.name);
  if (CONTACT_FIELDS.some((k) => k in changes)) syncContact_(target); // Contacts.gs
  return target;
}

/* ---------- self-service ---------- */

function updateProfile_(p, user) {
  onlyFields_(p, PROFILE_FIELDS.concat(['currentPassword']));
  const users = table_('users');
  const target = users.find((u) => u.userId === user.userId);
  const changes = changedOnly_(target, profilePatch_(p));
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

/* ---------- admins ---------- */

function personOut_(u, hasAccount) {
  return Object.assign(publicUser_(u), {
    status: u.status === 'inactive' ? 'inactive' : 'active',
    hasAccount: Boolean(hasAccount),
    contactSynced: /^people\//.test(String(u.googleContact || '')),
    contactError: /^people\//.test(String(u.googleContact || '')) ? '' : String(u.googleContact || ''),
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
  const recent = sortBy_(done, (a) => `${a.date} ${a.clockIn}`).reverse().slice(0, 10).map((a) => ({
    date: a.date,
    title: sessionTitle_(sessionsById[a.sessionId] || { title: a.sessionTitle }),
    hours: Number(a.hours) || 0,
  }));
  const upcoming = table_('bookings').filter((b) => b.userId === target.userId && b.status !== 'cancelled' && String(b.sessionDate) >= todayStr_());
  const noShows = noShowsByUser_()[target.userId] || [];
  return {
    person: personOut_(target, hasAccount),
    stats: { hours, sessions: done.length, upcoming: upcoming.length, noShows: noShows.length },
    recent,
    noShows: noShows.slice(0, 20),
    pairs: pairsFor_({ userId: target.userId }), // Pairs.gs: their regular trainees
    partners: partnersOfVolunteer_(target),       // Pairs.gs: every trainee they have been with
    regularAfter: CONFIG.REGULAR_AFTER_SESSIONS,
  };
}

function updatePerson_(p, admin) {
  onlyFields_(p, ['userId'].concat(PROFILE_FIELDS, ['status', 'volunteerType', 'adminPassword']));
  const users = table_('users');
  const target = users.find((u) => u.userId === id_(p.userId, 'User'));
  if (!target) throw err_.notFound('Person not found.');
  const fields = {};
  PROFILE_FIELDS.forEach((k) => { if (Object.prototype.hasOwnProperty.call(p, k)) fields[k] = p[k]; });
  const patch = profilePatch_(fields, { byAdmin: true });
  if (p.status !== undefined) patch.status = oneOf_(p.status, 'Status', ['active', 'inactive']);
  if (p.volunteerType !== undefined) {
    const t = oneOf_(p.volunteerType, 'Volunteer type', ['auto', 'regular', 'new']);
    patch.volunteerType = t === 'auto' ? '' : t === 'regular' ? 'Regular' : 'New';
    if (t === 'regular' && typeSetting_(target) !== 'regular') patch.regularSince = todayStr_();
  }
  const current = Object.assign({}, target, { status: target.status === 'inactive' ? 'inactive' : 'active' });
  const changes = changedOnly_(current, patch);
  if (!('volunteerType' in changes)) delete changes.regularSince;

  if (changes.status) {
    if (target.userId === admin.userId) throw err_.conflict('You cannot deactivate your own account here. Ask another admin.');
    requireAdminPassword_(p.adminPassword); // AdminAccess.gs: deactivating/reactivating needs the admin password again
  }
  if (changes.email) assertEmailFree_(users, changes.email, target.userId);

  const oldName = target.name;
  const before = volunteerTypeOf_(target).type;
  applyProfileChanges_(users, target, changes, admin);
  delete DB_.memo.completedCounts;
  const profileChanges = {};
  Object.keys(changes).filter((k) => PROFILE_FIELDS.indexOf(k) >= 0).forEach((k) => { profileChanges[k] = changes[k]; });
  const parts = [];
  if (Object.keys(profileChanges).length) parts.push(changedMessage_(profileChanges, `Updated ${oldName}'s`));
  if ('volunteerType' in changes) {
    const after = volunteerTypeOf_(target);
    const how = after.setting === 'auto' ? ` (automatic: regular after ${CONFIG.REGULAR_AFTER_SESSIONS} sessions)` : '';
    parts.push(`${target.name} is ${after.type === before ? 'still' : 'now'} a ${after.type} volunteer${how}.`);
  }
  if (changes.status) parts.push(changes.status === 'inactive' ? `${target.name} is deactivated and can no longer sign in.` : `${target.name} is active again.`);
  if (changes.email) parts.push(`They now sign in with ${changes.email}.`);
  const message = parts.join(' ') || 'No changes to save.';
  const hasAccount = Boolean(table_('auth').find((a) => a.userId === target.userId));
  return { person: personOut_(target, hasAccount), changed: Object.keys(changes), message };
}
