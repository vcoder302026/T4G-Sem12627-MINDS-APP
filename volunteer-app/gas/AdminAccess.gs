/**
 * AdminAccess.gs — one shared MINDS admin password instead of "leader" accounts.
 *
 * Everyone uses the same app with their own volunteer account. Admin features
 * appear once someone types the shared admin password: they get an admin
 * session (signed, like the sign-in token) for ADMIN_SESSION_HOURS on that
 * device. The password is not tied to any person, and every admin change is
 * written to the "Admin Log" tab with the name of the person who made it.
 *
 * The password is stored only as a salted hash in Script Properties:
 *   1. Apps Script editor → Project Settings → Script properties →
 *      add NEW_ADMIN_PASSWORD = the password you want.
 *   2. Run setAdminPassword(). It saves the hash and deletes NEW_ADMIN_PASSWORD.
 * After that, admins change it in the app (Admin → Settings).
 *
 * Admin session token:  a1.<userId>.<adminVersion>.<expiry>.<signature>
 * Changing the password (or "Sign out every admin device") bumps adminVersion,
 * which ends every admin session at once.
 */

function adminVersion_() {
  return String(PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_ADMIN_VERSION) || '1');
}

function adminPasswordIsSet_() {
  return Boolean(PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_ADMIN_HASH));
}

function checkAdminPassword_(password) {
  const props = PropertiesService.getScriptProperties();
  const hash = props.getProperty(CONFIG.PROP_ADMIN_HASH);
  const salt = props.getProperty(CONFIG.PROP_ADMIN_SALT);
  if (!hash || !salt || typeof password !== 'string' || !password) return false;
  return safeEqual_(hashPassword_(password, salt), hash);
}

function storeAdminPassword_(password) {
  const props = PropertiesService.getScriptProperties();
  const salt = Utilities.getUuid().replace(/-/g, '');
  props.setProperty(CONFIG.PROP_ADMIN_HASH, hashPassword_(password, salt));
  props.setProperty(CONFIG.PROP_ADMIN_SALT, salt);
  props.setProperty(CONFIG.PROP_ADMIN_VERSION, String(Number(adminVersion_()) + 1));
}

function issueAdminToken_(user) {
  const exp = now_().getTime() + CONFIG.ADMIN_SESSION_HOURS * 3600000;
  const body = `${user.userId}.${adminVersion_()}.${exp}`;
  return { adminToken: `a1.${body}.${sign_(`admin|${body}`)}`, expiresAt: fmtDateTime_(new Date(exp)) };
}

/** True when the token is a current admin session for this signed-in person. */
function adminSessionValid_(token, user) {
  if (typeof token !== 'string' || !token || !user) return false;
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== 'a1' || parts[1] !== user.userId) return false;
  const body = parts.slice(1, 4).join('.');
  if (!safeEqual_(parts[4], sign_(`admin|${body}`))) return false;
  if (parts[2] !== adminVersion_() || !adminPasswordIsSet_()) return false;
  return Number(parts[3]) > now_().getTime();
}

/** For sensitive changes (deactivating someone, …): the admin password typed again. */
function requireAdminPassword_(value) {
  if (!checkAdminPassword_(value)) throw err_.validation('Type the admin password to confirm this change.');
}

/* ---------- the Admin Log tab ---------- */

function logAdmin_(user, action, details) {
  table_('adminLog').insert({
    logId: newId_('L'),
    time: fmtDateTime_(now_()),
    userId: user ? user.userId : '',
    person: user ? user.name : 'Apps Script editor',
    action: String(action || '').slice(0, 120),
    details: String(details || '').slice(0, 1000),
  });
}

function listAdminLog_(p) {
  onlyFields_(p, ['limit']);
  const limit = p.limit === undefined ? 300 : int_(p.limit, 'Limit', 1, 2000);
  const rows = sortBy_(table_('adminLog').rows().filter((r) => r.logId), (r) => `${r.time}|${String(r._row).padStart(7, '0')}`).reverse();
  return {
    entries: rows.slice(0, limit).map((r) => ({ logId: r.logId, time: r.time, userId: r.userId, person: r.person, action: r.action, details: r.details })),
    total: rows.length,
  };
}

/* ---------- actions ---------- */

function adminUnlock_(p, user) {
  onlyFields_(p, ['password']);
  if (!adminPasswordIsSet_()) {
    throw err_.config('The admin password has not been set up yet. In the Apps Script editor, add the script property NEW_ADMIN_PASSWORD and run setAdminPassword().');
  }
  const cache = CacheService.getScriptCache();
  const failKey = `admin-fail:${user.userId}`;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= CONFIG.ADMIN_MAX_FAILURES) {
    throw new AppError('TOO_MANY_ATTEMPTS', 'Too many wrong admin passwords. Wait 15 minutes and try again.');
  }
  if (!checkAdminPassword_(p.password)) {
    cache.put(failKey, String(fails + 1), 900);
    logAdmin_(user, 'Admin password wrong', 'Someone signed in as this person typed a wrong admin password.');
    throw err_.validation('That is not the admin password.');
  }
  cache.remove(failKey);
  const session = issueAdminToken_(user);
  logAdmin_(user, 'Opened admin', `Admin access on this device until ${session.expiresAt}.`);
  return Object.assign(session, { message: 'Admin unlocked.' });
}

/** Lets the app check, without throwing, whether its saved admin session is still good. */
function adminStatus_(p, user, ctx) {
  return { isAdmin: Boolean(ctx && ctx.isAdmin), passwordSet: adminPasswordIsSet_() };
}

function adminLock_() {
  return { message: 'Left admin on this device.' };
}

function changeAdminPassword_(p, admin) {
  onlyFields_(p, ['currentPassword', 'newPassword']);
  if (!checkAdminPassword_(p.currentPassword)) throw err_.validation('The current admin password is not right.');
  const next = password_(p.newPassword, 'New admin password');
  if (next.length < 10) throw err_.validation('Use at least 10 characters for the admin password.');
  storeAdminPassword_(next);
  return Object.assign(issueAdminToken_(admin), { message: 'Admin password changed. Every other admin device has to enter the new password.' });
}

function adminSignOutAll_(p, admin) {
  onlyFields_(p, ['adminPassword']);
  requireAdminPassword_(p.adminPassword);
  const props = PropertiesService.getScriptProperties();
  props.setProperty(CONFIG.PROP_ADMIN_VERSION, String(Number(adminVersion_()) + 1));
  return Object.assign(issueAdminToken_(admin), { message: 'Every other device has left admin.' });
}

/** Everything on Admin → Settings in one call. */
function adminSettings_() {
  return {
    databases: listDataSources_().databases,
    fieldAccess: fieldAccess_(),
    contacts: contactsStatus_(),
    adminSessionHours: CONFIG.ADMIN_SESSION_HOURS,
    regularAfterSessions: CONFIG.REGULAR_AFTER_SESSIONS,
  };
}

/* ---------- run from the Apps Script editor ---------- */

/** Sets (or resets) the shared admin password from the NEW_ADMIN_PASSWORD script property. */
function setAdminPassword() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(CONFIG.PROP_SECRET)) throw new Error('Run setup() first.');
  const pw = props.getProperty(CONFIG.PROP_NEW_ADMIN_PASSWORD);
  if (!pw) throw new Error('Add a script property NEW_ADMIN_PASSWORD with the admin password you want, then run setAdminPassword() again.');
  if (pw.length < 10 || pw.length > 128) throw new Error('Use an admin password of 10 to 128 characters.');
  storeAdminPassword_(pw);
  props.deleteProperty(CONFIG.PROP_NEW_ADMIN_PASSWORD);
  resetDbCache_();
  logAdmin_(null, 'Set the admin password', 'Set from the Apps Script editor with setAdminPassword().');
  const msg = 'Admin password saved (only a hash is kept) and NEW_ADMIN_PASSWORD deleted. Anyone who had admin open must type the new password.';
  console.log(msg);
  return msg;
}
