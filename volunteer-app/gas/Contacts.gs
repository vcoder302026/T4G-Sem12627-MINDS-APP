/**
 * Google Contacts sync: when a volunteer registers, or an admin adds one, the
 * app saves them as a contact in the Google account the app runs as (for Exp:
 * vcoder302026@gmail.com). Editing their name, email, phone or Telegram later
 * updates the same contact.
 *
 * Each contact has the name, email and phone (+65 91234567), the Telegram handle
 * in the notes, and the label CONTACTS_LABEL ("MINDS Volunteers" by default).
 *
 * Turn it on: in Apps Script, Services (+) → People API → Add; then set the
 * script property CONTACTS_SYNC to "on" and run testContactsAccess() once to allow
 * the Contacts permission. It never blocks a registration: if Google Contacts
 * fails, the volunteer is saved anyway and the "Google Contact" column says why.
 */

function contactsOn_() {
  return String(PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_CONTACTS_SYNC) || '').trim().toLowerCase() === 'on';
}

function contactLabel_() {
  return String(PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_CONTACTS_LABEL) || '').trim() || 'MINDS Volunteers';
}

/** The People API advanced service, or a clear error if it hasn't been added to the project. */
function peopleApi_() {
  if (typeof People === 'undefined' || !People.People) {
    throw new Error('The People API service is not added. In Apps Script: Services (+) → People API → Add.');
  }
  return People;
}

/** The contact label's resource name (contactGroups/…), created the first time. */
function contactGroup_() {
  const props = PropertiesService.getScriptProperties();
  const label = contactLabel_();
  const cached = String(props.getProperty(CONFIG.PROP_CONTACTS_GROUP) || '');
  if (cached.indexOf(`${label}|`) === 0) return cached.slice(label.length + 1);
  const api = peopleApi_();
  let found = '';
  let pageToken;
  do {
    const res = api.ContactGroups.list({ pageSize: 200, pageToken });
    (res.contactGroups || []).forEach((g) => { if (!found && (g.name === label || g.formattedName === label)) found = g.resourceName; });
    pageToken = res.nextPageToken;
  } while (!found && pageToken);
  if (!found) found = api.ContactGroups.create({ contactGroup: { name: label } }).resourceName;
  props.setProperty(CONFIG.PROP_CONTACTS_GROUP, `${label}|${found}`);
  return found;
}

/** The contact as Google's People API expects it. */
function contactBody_(u, group) {
  const notes = [
    u.telegram ? `Telegram: @${u.telegram}` : 'Telegram: not given',
    u.project ? `Project: ${u.project}` : '',
    u.emergencyPhone ? `Emergency contact: ${u.emergencyPhone}${u.emergencyRelation ? ` (${u.emergencyRelation})` : ''}` : '',
    `MINDS volunteer${u.role === 'admin' ? ' (admin)' : volunteerType_(u) === 'regular' ? ' (regular)' : ''}.`,
  ].filter(Boolean).join('\n');
  // First and last name into Google's own fields (older records only have the Full Name: it
  // goes in First name); the short name volunteers go by is the contact's nickname.
  const first = String(u.firstName || '').trim();
  const last = String(u.lastName || '').trim();
  const short = String(u.shortName || '').trim();
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(u.birthday || ''));
  const digits = String(u.phone || '').replace(/\D/g, '');
  return {
    names: [first ? { givenName: first, familyName: last } : { givenName: String(u.name || '').trim() }],
    nicknames: short ? [{ value: short }] : [],
    birthdays: b ? [{ date: { year: Number(b[1]), month: Number(b[2]), day: Number(b[3]) } }] : [],
    emailAddresses: u.email ? [{ value: u.email, type: 'home' }] : [],
    phoneNumbers: digits ? [{ value: digits.slice(-8), type: 'mobile' }] : [], // the 8-digit number, e.g. 92334014
    biographies: [{ value: notes, contentType: 'TEXT_PLAIN' }],
    memberships: [{ contactGroupMembership: { contactGroupResourceName: group } }],
  };
}

const CONTACT_FIELDS_ = 'names,nicknames,birthdays,emailAddresses,phoneNumbers,biographies,memberships';

/** Saves or updates one volunteer's contact. Throws on failure (see syncContactSafe_). */
function syncContact_(userId) {
  const users = table_('users');
  const u = users.find((x) => x.userId === userId);
  if (!u) throw err_.notFound('Volunteer not found.');
  const api = peopleApi_();
  const group = contactGroup_();
  const body = contactBody_(u, group);
  let resourceName = String(u.contactId || '');
  let action = 'Saved';
  if (resourceName) {
    try {
      const current = api.People.get(resourceName, { personFields: CONTACT_FIELDS_ });
      // Keep any labels someone added in Google Contacts.
      const others = (current.memberships || []).filter((m) => m.contactGroupMembership
        && m.contactGroupMembership.contactGroupResourceName !== group);
      body.memberships = body.memberships.concat(others);
      body.etag = current.etag;
      api.People.updateContact(body, resourceName, { updatePersonFields: CONTACT_FIELDS_ });
      action = 'Updated';
    } catch (e) {
      if (!/not ?found|404/i.test(String(e && e.message ? e.message : e))) throw e;
      resourceName = ''; // deleted in Google Contacts: save it again
    }
  }
  if (!resourceName) resourceName = api.People.createContact(body).resourceName;
  users.update(u, { contactId: resourceName, contactStatus: `${action} ${fmtDateTime_(now_())}` });
  return { status: 'saved', action, resourceName };
}

/**
 * Best effort: never throws. Returns null when sync is off, otherwise
 * { status: 'saved' | 'failed', … }, and records the result on the volunteer's row.
 */
function syncContactSafe_(userId) {
  if (!contactsOn_()) return null;
  try {
    return syncContact_(userId);
  } catch (e) {
    const message = String(e && e.message ? e.message : e).slice(0, 200);
    console.error(`Google Contacts sync failed for ${userId}: ${message}`);
    try {
      const users = table_('users');
      const u = users.find((x) => x.userId === userId);
      if (u) users.update(u, { contactStatus: `Failed ${fmtDateTime_(now_())}: ${message}` });
    } catch (ignored) {
      // nothing more to do
    }
    return { status: 'failed', message };
  }
}

/** Which volunteer a request should sync, if any (called after the request succeeds; Main.gs). */
function contactSyncTarget_(action, payload, user, out) {
  const answers = payload.answers && typeof payload.answers === 'object' ? payload.answers : {};
  const touches = ['name', 'firstName', 'lastName', 'birthday', 'email', 'phone', 'telegram'].some((k) => payload[k] !== undefined)
    || ['shortName', 'project', 'emergencyPhone', 'emergencyRelation'].some((k) => answers[k] !== undefined);
  if (action === 'register') return out && out.user ? out.user.userId : '';
  if (action === 'createVolunteer') return out && out.person ? out.person.userId : '';
  if (action === 'updateProfile' && touches) return user.userId;
  if (action === 'updatePerson' && touches) return payload.userId;
  return '';
}

/** Admin → a volunteer → "Save to Google Contacts" (also retries a failed one). */
function syncContactNow_(p) {
  onlyFields_(p, ['userId']);
  const userId = id_(p.userId, 'User');
  if (!contactsOn_()) throw err_.conflict('Google Contacts sync is off. In Apps Script, set the script property CONTACTS_SYNC to "on".');
  const target = table_('users').find((u) => u.userId === userId);
  if (!target) throw err_.notFound('Volunteer not found.');
  const r = syncContactSafe_(userId);
  return Object.assign(personDetail_({ userId }), {
    message: r.status === 'saved' ? `${r.action} ${target.name} in Google Contacts.` : `Could not save to Google Contacts: ${r.message}`,
  });
}

/** What admins see about the sync on a volunteer's page. */
function contactInfo_(u) {
  return { on: contactsOn_(), status: u.contactStatus || '', saved: Boolean(u.contactId) && !/^Failed/.test(String(u.contactStatus || '')) };
}

/**
 * Run from the Apps Script editor after turning sync on: allows the Contacts
 * permission, creates the label, and says what it found.
 */
function testContactsAccess() {
  const lines = [];
  lines.push(`CONTACTS_SYNC is ${contactsOn_() ? '"on"' : 'not "on": the app will not save contacts until it is'}.`);
  try {
    peopleApi_();
    const group = contactGroup_();
    lines.push(`OK: contacts will be saved in the Google account that runs this script (the one signed in here), with the label "${contactLabel_()}" (${group}).`);
  } catch (e) {
    lines.push(`Problem: ${e && e.message ? e.message : e}`);
  }
  const text = lines.join('\n');
  console.log(text);
  return text;
}

/** Run from the editor: saves every active volunteer not yet saved (or whose last try failed). */
function syncAllContacts() {
  return withLock_(syncAllContactsInternal_);
}

/** The work of syncAllContacts(), for callers already holding the lock (Advanced Settings). */
function syncAllContactsInternal_() {
  if (!contactsOn_()) throw err_.conflict('Google Contacts sync is off. Set the script property CONTACTS_SYNC to "on" first.');
  return (() => {
    let saved = 0;
    let failed = 0;
    table_('users').rows().forEach((u) => {
      if (!u.userId || !u.email || u.status === 'inactive') return;
      if (u.contactId && !/^Failed/.test(String(u.contactStatus || ''))) return;
      const r = syncContactSafe_(u.userId);
      if (r && r.status === 'saved') saved += 1;
      else failed += 1;
    });
    const text = `Google Contacts: saved ${saved} volunteer(s)${failed ? `, ${failed} failed (see the "Google Contact" column)` : ''}.`;
    console.log(text);
    return text;
  })();
}
