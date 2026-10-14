/**
 * Auth.gs — registration, sign-in and roles.
 *
 * Passwords: iterated HMAC-SHA256 with a per-user salt, keyed with APP_SECRET
 * (a "pepper" kept in Script Properties). Someone who can open the sheet sees
 * only hashes, and cannot test guesses without the secret.
 *
 * Sign-in tokens are signed, not stored: v1.<userId>.<version>.<expiry>.<signature>.
 * Every request re-reads the user's row, so a promotion, demotion or
 * deactivation takes effect immediately. Changing or resetting a password bumps
 * the version, which signs the user out on every device.
 */

function publicUser_(u) {
  return {
    userId: u.userId,
    name: u.name,
    email: u.email,
    phone: u.phone,
    telegram: u.telegram,
    birthday: u.birthday,
    emergencyName: u.emergencyName,
    emergencyPhone: u.emergencyPhone,
    emergencyRelation: u.emergencyRelation,
    role: u.role === 'admin' ? 'admin' : 'volunteer',
    createdAt: u.createdAt,
    guideReadAt: u.guideReadAt || '',
  };
}

function password_(value, label) {
  if (typeof value !== 'string' || value.length < 8) throw err_.validation(`${label || 'Password'} must be at least 8 characters.`);
  if (value.length > 128) throw err_.validation(`${label || 'Password'} is too long.`);
  return value;
}

function hashPassword_(password, salt) {
  const key = Utilities.newBlob(`${secret_()}:${salt}`).getBytes();
  let h = Utilities.newBlob(password).getBytes();
  for (let i = 0; i < CONFIG.PASSWORD_ITERATIONS; i++) h = Utilities.computeHmacSha256Signature(h, key);
  return b64url_(h);
}

function setPassword_(userId, password) {
  const auth = table_('auth');
  const salt = Utilities.getUuid().replace(/-/g, '');
  const fields = { passwordHash: hashPassword_(password, salt), salt, updatedAt: fmtDateTime_(now_()) };
  const row = auth.find((a) => a.userId === userId);
  if (row) return auth.update(row, Object.assign(fields, { tokenVersion: (Number(row.tokenVersion) || 1) + 1 }));
  return auth.insert(Object.assign(fields, { userId, tokenVersion: 1 }));
}

function issueToken_(user, authRow) {
  const exp = now_().getTime() + CONFIG.TOKEN_TTL_DAYS * 86400000;
  const body = `${user.userId}.${Number(authRow.tokenVersion) || 1}.${exp}`;
  return `v1.${body}.${sign_(`auth|${body}`)}`;
}

function requireUser_(token) {
  if (typeof token !== 'string' || !token) throw err_.unauthorized('Please sign in.');
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') throw err_.unauthorized();
  const body = parts.slice(1, 4).join('.');
  if (!safeEqual_(parts[4], sign_(`auth|${body}`))) throw err_.unauthorized();
  if (Number(parts[3]) < now_().getTime()) throw err_.unauthorized('Your sign-in has expired. Please sign in again.');
  const user = table_('users').find((u) => u.userId === parts[1]);
  if (!user || user.status === 'inactive') throw err_.unauthorized('This account is not active.');
  const authRow = table_('auth').find((a) => a.userId === user.userId);
  if (!authRow || String(Number(authRow.tokenVersion) || 1) !== parts[2]) throw err_.unauthorized();
  return user;
}

/* ---------- actions ---------- */

function register_(p) {
  onlyFields_(p, ['name', 'birthday', 'email', 'phone', 'telegram', 'emergencyName', 'emergencyPhone', 'emergencyRelation', 'password', 'consent']);
  const rec = {
    name: str_(p.name, 'Full name', { required: true, max: LIMITS.SHORT }),
    birthday: date_(p.birthday, 'Birthday'),
    email: email_(p.email),
    phone: phone_(p.phone, 'Phone'),
    telegram: telegram_(p.telegram),
    emergencyName: str_(p.emergencyName, 'Emergency contact name', { required: true, max: LIMITS.SHORT }),
    emergencyPhone: phone_(p.emergencyPhone, 'Emergency contact phone'),
    emergencyRelation: str_(p.emergencyRelation, 'Relationship', { max: 50 }),
  };
  if (rec.birthday > todayStr_()) throw err_.validation('Birthday cannot be in the future.');
  const password = password_(p.password);
  if (p.consent !== true) throw err_.validation('Please agree to the personal data notice to register.');

  const users = table_('users');
  const existing = users.find((u) => String(u.email).toLowerCase() === rec.email);
  let user;
  if (existing) {
    if (existing.userId && table_('auth').find((a) => a.userId === existing.userId)) {
      throw err_.conflict('An account with this email already exists. Try signing in instead.');
    }
    // The volunteer is already on the MINDS list but has no app account yet:
    // link their existing row instead of creating a duplicate. The role is
    // always reset to volunteer: anyone can type any email, so a pre-listed
    // leader row must not hand leader access to whoever registers first.
    user = users.update(existing, Object.assign({}, rec, {
      userId: existing.userId || newId_('U'),
      role: 'volunteer',
      status: existing.status || 'active',
      createdAt: existing.createdAt || fmtDateTime_(now_()),
    }));
    if (user.status === 'inactive') throw err_.unauthorized('This account has been deactivated. Please contact a volunteer leader.');
  } else {
    user = users.insert(Object.assign({}, rec, {
      userId: newId_('U'),
      role: 'volunteer',
      status: 'active',
      createdAt: fmtDateTime_(now_()),
    }));
  }
  const authRow = setPassword_(user.userId, password);
  return { token: issueToken_(user, authRow), user: publicUser_(user) };
}

function login_(p) {
  onlyFields_(p, ['email', 'password']);
  const email = email_(p.email);
  if (typeof p.password !== 'string' || !p.password) throw err_.validation('Password is required.');
  const cache = CacheService.getScriptCache();
  const failKey = `login-fail:${email}`;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= CONFIG.LOGIN_MAX_FAILURES) {
    throw new AppError('TOO_MANY_ATTEMPTS', 'Too many attempts. Wait 15 minutes, or ask a volunteer leader to reset your password.');
  }
  const user = table_('users').find((u) => String(u.email).toLowerCase() === email);
  const authRow = user && user.userId ? table_('auth').find((a) => a.userId === user.userId) : null;
  const hash = hashPassword_(p.password, authRow ? authRow.salt : 'no-such-user'); // same cost either way
  if (!authRow || !safeEqual_(hash, authRow.passwordHash)) {
    cache.put(failKey, String(fails + 1), 900);
    throw err_.unauthorized('Email or password is incorrect.');
  }
  if (user.status === 'inactive') throw err_.unauthorized('This account has been deactivated. Please contact a volunteer leader.');
  cache.remove(failKey);
  return { token: issueToken_(user, authRow), user: publicUser_(user) };
}

function me_(p, user) {
  return { user: publicUser_(user) };
}

function changePassword_(p, user) {
  onlyFields_(p, ['currentPassword', 'newPassword']);
  const authRow = table_('auth').find((a) => a.userId === user.userId);
  if (typeof p.currentPassword !== 'string' || !safeEqual_(hashPassword_(p.currentPassword, authRow.salt), authRow.passwordHash)) {
    throw err_.validation('Current password is incorrect.');
  }
  const updated = setPassword_(user.userId, password_(p.newPassword, 'New password'));
  return { token: issueToken_(user, updated) };
}

/* ---------- leader actions on people ---------- */

function listPeople_() {
  const hours = {};
  table_('attendance').rows().forEach((a) => {
    if (!a.clockOut) return;
    const h = hours[a.userId] || (hours[a.userId] = { hours: 0, sessions: 0 });
    h.hours += Number(a.hours) || 0;
    h.sessions += 1;
  });
  const hasAccount = byKey_(table_('auth').rows(), 'userId');
  const people = table_('users').rows()
    .filter((u) => u.userId)
    .map((u) => Object.assign(publicUser_(u), {
      status: u.status || 'active',
      hasAccount: Boolean(hasAccount[u.userId]),
      hours: Math.round(((hours[u.userId] || {}).hours || 0) * 100) / 100,
      sessions: (hours[u.userId] || {}).sessions || 0,
    }));
  return { people: sortBy_(people, (x) => String(x.name).toLowerCase()) };
}

function setRole_(p, admin) {
  onlyFields_(p, ['userId', 'role']);
  const userId = id_(p.userId, 'User');
  const role = oneOf_(p.role, 'Role', ['volunteer', 'admin']);
  const users = table_('users');
  const target = users.find((u) => u.userId === userId);
  if (!target) throw err_.notFound('Volunteer not found.');
  if (role === 'volunteer') {
    if (target.userId === admin.userId) throw err_.conflict('You cannot remove your own leader access. Ask another leader.');
    const admins = users.filter((u) => u.role === 'admin' && u.status !== 'inactive');
    if (admins.length <= 1) throw err_.conflict('There must be at least one volunteer leader.');
  }
  users.update(target, { role });
  return { person: publicUser_(target) };
}

function resetPassword_(p, admin) {
  onlyFields_(p, ['userId']);
  const target = table_('users').find((u) => u.userId === id_(p.userId, 'User'));
  if (!target) throw err_.notFound('Volunteer not found.');
  // Readable temporary password, e.g. "minds-7k2p-9xq4"; the volunteer changes it under Profile.
  const raw = Utilities.getUuid().replace(/-/g, '').toLowerCase();
  const tempPassword = `minds-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  setPassword_(target.userId, tempPassword);
  return { tempPassword, name: target.name, resetBy: admin.name };
}
