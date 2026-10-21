/**
 * The admin password: one shared password, separate from everyone's sign-in
 * password, that an admin types to make or remove an admin: giving admin access,
 * removing it, deactivating or reactivating an admin, or adding someone as an admin.
 *
 * - setup() generates it the first time and shows it once in the Execution log.
 * - Admins change it in the app (Admin → Settings → Admin password) by typing
 *   the current one and the new one.
 * - Forgotten? Run resetAdminPassword() in the Apps Script editor for a new one.
 *
 * Only a salted hash is kept (script property ADMIN_PASSWORD_HASH), never the
 * password itself, and it is never written to the sheet or the activity log.
 */

const ADMIN_PASSWORD_PROP = 'ADMIN_PASSWORD_HASH'; // "salt.hash"

/** A readable random password, e.g. "admin-7k2p-9xq4-b3mz". */
function newAdminPassword_() {
  const raw = Utilities.getUuid().replace(/-/g, '').toLowerCase();
  return `admin-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function setAdminActionPassword_(password) {
  const salt = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(ADMIN_PASSWORD_PROP, `${salt}.${hashPassword_(password, salt)}`);
}

function hasAdminPassword_() {
  return Boolean(PropertiesService.getScriptProperties().getProperty(ADMIN_PASSWORD_PROP));
}

/** Called by setup(): creates the admin password if there isn't one. Returns a line for the report. */
function ensureAdminPassword_(dryRun) {
  if (hasAdminPassword_()) return '';
  if (dryRun) return 'Would create the admin password (shown once when setup() runs).';
  const password = newAdminPassword_();
  setAdminActionPassword_(password);
  return `Created the ADMIN PASSWORD: ${password}\n`
    + '  It is needed to make or remove an admin. Write it down and give it to the other admins:\n'
    + '  it is shown only this once. Change it in the app: Admin → Settings → Admin password.';
}

/**
 * Checks the admin password. 5 wrong tries (per admin) lock it for 15 minutes.
 * `message` is what a wrong password says.
 */
function checkAdminPassword_(admin, password, message) {
  const cache = CacheService.getScriptCache();
  const failKey = `adminpw-fail:${admin.userId}`;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= CONFIG.LOGIN_MAX_FAILURES) {
    throw new AppError('TOO_MANY_ATTEMPTS', 'Too many wrong admin passwords. Wait 15 minutes and try again.');
  }
  const stored = PropertiesService.getScriptProperties().getProperty(ADMIN_PASSWORD_PROP) || '';
  const dot = stored.indexOf('.');
  const ok = dot > 0 && typeof password === 'string' && password
    && safeEqual_(hashPassword_(password, stored.slice(0, dot)), stored.slice(dot + 1));
  if (!ok) {
    if (password) cache.put(failKey, String(fails + 1), 900);
    throw new AppError('PASSWORD_REQUIRED', stored ? message || 'Enter the admin password to make or remove an admin.'
      : 'There is no admin password yet. Run setup() in Apps Script to create one.');
  }
  cache.remove(failKey);
}

/** Admin → Settings → Admin password: change it by giving the current one and a new one. */
function changeAdminPassword_(p, admin) {
  onlyFields_(p, ['currentPassword', 'newPassword']);
  checkAdminPassword_(admin, p.currentPassword, 'The current admin password is not right.');
  const next = password_(p.newPassword, 'New admin password');
  if (next === p.currentPassword) throw err_.validation('The new admin password is the same as the current one.');
  setAdminActionPassword_(next);
  return { message: 'Admin password changed. Let the other admins know the new one.' };
}

/** Run from the Apps Script editor if the admin password is forgotten: makes and shows a new one. */
function resetAdminPassword() {
  const password = newAdminPassword_();
  setAdminActionPassword_(password);
  try {
    logAdminAction_({ userId: '', name: 'Apps Script editor' }, 'resetAdminPassword', {}, null);
  } catch (e) {
    // logging is best effort here
  }
  const text = `New ADMIN PASSWORD: ${password}\nGive it to the admins. They can change it in the app: Admin → Settings → Admin password.`;
  console.log(text);
  return text;
}
