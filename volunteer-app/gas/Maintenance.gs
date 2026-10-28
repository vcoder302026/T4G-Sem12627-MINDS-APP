/**
 * Advanced Settings (Admin → Settings → Advanced settings): one-time setup and
 * migration functions an admin can run from the app instead of the Apps Script
 * editor, as MINDS's web app template asks. The page warns that they may cause
 * data loss; each one that changes data needs the admin password.
 *
 * For any future one-time setup or migration: add it here (and its button
 * appears in the app), rather than asking someone to run it in the editor.
 */

const MAINTENANCE_TASKS = {
  checkConfig: {
    label: 'Check the setup',
    about: 'Reads the sheets and settings and reports what setup would change. Changes nothing.',
    changesData: false,
    run: () => setupInternal_(true),
  },
  setup: {
    label: 'Run setup',
    about: 'Adds missing tabs and columns (e.g. new registration questions), Trainee IDs, starter content, renames projects to the form\'s names, and updates volunteer types. Existing data is kept, but cells may be renamed or filled in.',
    changesData: true,
    run: () => setupInternal_(false),
  },
  syncAllContacts: {
    label: 'Save all volunteers to Google Contacts',
    about: 'Saves every active volunteer not yet in the app\'s Google Contacts (needs CONTACTS_SYNC = on).',
    changesData: true,
    run: () => syncAllContactsInternal_(),
  },
};

/** The list shown on the Advanced Settings page. */
function maintenanceTasks_() {
  return {
    tasks: Object.keys(MAINTENANCE_TASKS).map((key) => {
      const t = MAINTENANCE_TASKS[key];
      return { key, label: t.label, about: t.about, changesData: t.changesData };
    }),
  };
}

/** Runs one task. Tasks that change data need the admin password. Returns its report. */
function runMaintenance_(p, admin) {
  onlyFields_(p, ['task', 'adminPassword']);
  const key = oneOf_(p.task, 'Task', Object.keys(MAINTENANCE_TASKS));
  const task = MAINTENANCE_TASKS[key];
  if (task.changesData) checkAdminPassword_(admin, p.adminPassword, `Enter the admin password to run "${task.label}".`);
  const report = String(task.run() || 'Done.');
  return { task: key, report, message: `${task.label}: done. See the report below.` };
}
