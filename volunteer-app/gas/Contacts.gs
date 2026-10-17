/**
 * Contacts.gs — every volunteer is added to Google Contacts.
 *
 * The web app runs as the account that deployed it, so contacts are created in
 * THAT account's Google Contacts (for MINDS: the shared admin Google account).
 * When someone registers (or an admin adds them), a contact is created with
 * their name, email and phone, the label CONTACT_GROUP, and their Telegram
 * handle in the contact's notes. Later changes to those details update the
 * same contact. The contact's ID is kept in the "Google Contact" column.
 *
 * Needs the People API advanced service (appsscript.json → enabledAdvancedServices)
 * and the contacts scope; the first run asks the deploying account to allow it.
 * A failure never stops a registration: the error is written in the
 * "Google Contact" column and admins can retry with Admin → Settings → Sync now.
 */

function contactsAvailable_() {
  return CONFIG.SYNC_GOOGLE_CONTACTS && typeof People !== 'undefined' && People && People.People;
}

function contactNote_(u) {
  return [
    u.telegram ? `Telegram: @${u.telegram}` : 'Telegram: (not given)',
    `MINDS volunteer since ${String(u.createdAt || todayStr_()).slice(0, 10)}`,
    `App user ID: ${u.userId}`,
  ].join('\n');
}

function contactBody_(u) {
  return {
    names: [{ givenName: u.name }],
    emailAddresses: u.email ? [{ value: u.email, type: 'home' }] : [],
    phoneNumbers: u.phone ? [{ value: u.phone, type: 'mobile' }] : [],
    organizations: [{ name: 'MINDS', title: 'Volunteer' }],
    biographies: [{ value: contactNote_(u), contentType: 'TEXT_PLAIN' }],
  };
}

/** The contact group (label) resource name, created the first time. '' = no label. */
function contactGroup_() {
  if (!CONFIG.CONTACT_GROUP) return '';
  return memo_('contactGroup', () => {
    const list = People.ContactGroups.list({ pageSize: 200 });
    const found = (list.contactGroups || []).find((g) => g.name === CONFIG.CONTACT_GROUP || g.formattedName === CONFIG.CONTACT_GROUP);
    if (found) return found.resourceName;
    return People.ContactGroups.create({ contactGroup: { name: CONFIG.CONTACT_GROUP } }).resourceName;
  });
}

/** Creates or updates the volunteer's Google contact. Returns 'created' | 'updated' | 'skipped' | 'error'. */
function syncContact_(user) {
  if (!CONFIG.SYNC_GOOGLE_CONTACTS) return 'skipped';
  const users = table_('users');
  if (!contactsAvailable_()) {
    if (!user.googleContact) users.update(user, { googleContact: 'Not synced: turn on the People API advanced service' });
    return 'skipped';
  }
  try {
    const existing = String(user.googleContact || '');
    let resourceName;
    let outcome;
    if (/^people\//.test(existing)) {
      const current = People.People.get(existing, { personFields: 'metadata' });
      const body = Object.assign(contactBody_(user), { etag: current.etag });
      People.People.updateContact(body, existing, { updatePersonFields: 'names,emailAddresses,phoneNumbers,organizations,biographies' });
      resourceName = existing;
      outcome = 'updated';
    } else {
      resourceName = People.People.createContact(contactBody_(user)).resourceName;
      const group = contactGroup_();
      if (group) People.ContactGroups.Members.modify({ resourceNamesToAdd: [resourceName] }, group);
      outcome = 'created';
    }
    if (existing !== resourceName) users.update(user, { googleContact: resourceName });
    return outcome;
  } catch (e) {
    console.error(`Google Contacts sync failed for ${user.userId}: ${e && e.message}`);
    users.update(user, { googleContact: `Error: ${String((e && e.message) || e).slice(0, 150)}` });
    return 'error';
  }
}

function contactsStatus_() {
  const people = table_('users').rows().filter((u) => u.userId && u.status !== 'inactive');
  const synced = people.filter((u) => /^people\//.test(String(u.googleContact || ''))).length;
  const errors = people.filter((u) => /^(Error|Not synced)/.test(String(u.googleContact || ''))).length;
  return {
    enabled: Boolean(CONFIG.SYNC_GOOGLE_CONTACTS),
    available: Boolean(contactsAvailable_()),
    label: CONFIG.CONTACT_GROUP,
    volunteers: people.length,
    synced,
    notSynced: people.length - synced,
    errors,
  };
}

/** Admin → Settings → Sync now: adds everyone active who is not in Google Contacts yet. */
function syncContacts_(p) {
  onlyFields_(p, ['all']);
  if (!CONFIG.SYNC_GOOGLE_CONTACTS) throw err_.validation('Google Contacts sync is turned off (Config.gs → SYNC_GOOGLE_CONTACTS).');
  if (!contactsAvailable_()) throw err_.config('Turn on the People API advanced service in the Apps Script editor (Services → People API).');
  const todo = table_('users').rows().filter((u) => u.userId && u.status !== 'inactive'
    && (p.all === true || !/^people\//.test(String(u.googleContact || ''))));
  const counts = { created: 0, updated: 0, error: 0, skipped: 0 };
  todo.slice(0, 200).forEach((u) => { counts[syncContact_(u)] += 1; });
  const parts = [];
  if (counts.created) parts.push(`${counts.created} added`);
  if (counts.updated) parts.push(`${counts.updated} updated`);
  if (counts.error) parts.push(`${counts.error} failed (see the Google Contact column)`);
  return Object.assign({ contacts: contactsStatus_() }, {
    message: parts.length ? `Google Contacts: ${parts.join(', ')}.` : 'Everyone is already in Google Contacts.',
  });
}
