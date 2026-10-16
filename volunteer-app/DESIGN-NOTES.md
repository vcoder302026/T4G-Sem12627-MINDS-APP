# Design notes: linking to Google Sheets and adding QR clock-in

This explains the two changes asked for, why they're built as a new
`volunteer-app/` folder rather than as edits to the Node prototype in the
repository root, and what to do if you must keep the Node app instead.

## Why not bolt Sheets and QR onto the existing Node app?

The root app (Prototype 1) was deliberately scoped as a **localhost-only staff
tool**: PLAN.md fixes Node + SQLite, binds to `127.0.0.1`, and explicitly rules
out Google Sheets, QR scanning, PWA and volunteer-facing accounts. Both new
requirements cut against those decisions:

| Requirement | Blocker in the Node app |
| --- | --- |
| Existing Google Sheet as the data store | Data lives in a local SQLite file per laptop; adding Sheets creates two sources of truth that drift. |
| Volunteers show a QR on *their* phone | Server only listens on the laptop itself; volunteers can't reach it. |
| Leaders scan with a phone camera | Browsers only allow the camera on HTTPS (or localhost), so it needs real hosting with a certificate. |
| Your team's architecture | WERONE standard is Apps Script + Sheets + vanilla JS/Tailwind + PWA + clasp CI. |

So the volunteer app follows the WERONE pattern and the Node prototype is left
untouched (no files under `server/`, `public/` or `tests/` changed). Ideas that
carried over:

- the same validation limits (200-char names, 5,000-char notes, real calendar dates);
- hours computed from timestamps, open records shown "in progress" and excluded from totals;
- repeat clock-in/out rejected rather than silently overwritten;
- user text rendered only via `textContent`, never `innerHTML`;
- salted password hashes, signed sessions, unknown fields rejected;
- an automated test suite that runs the real backend code.

## 1) Linking to an existing Google Sheet

What makes it work with a sheet that already exists:

- **Columns are found by header text, not position** (`gas/Db.gs`). The trainee
  tab can have any column order and extra columns; `Config.gs` maps code keys to
  your header names.
- **The sheet is identified by a Script Property** (`SPREADSHEET_ID`), not
  hard-coded, so the ID never lands in GitHub. Trainees can live in a separate
  file (`TRAINEE_SPREADSHEET_ID`).
- **`setup()` is additive and idempotent**: it creates missing tabs, appends
  missing headers at the end, fills missing Trainee IDs, and never deletes or
  reorders. `checkConfig()` previews the changes without writing.
- **Existing volunteers are linked, not duplicated**: if someone registers with
  an email already in the Volunteers tab (and no account yet), their row is
  claimed and filled in.
- **Values stay as typed**: rows are formatted as plain text before writing, so
  Sheets doesn't turn `2026-10-14` into a date serial or `+65 9123 4567` into a
  number. Text starting with `= + - @` is escaped so it can't become a formula.
- **Concurrent writes are safe**: every write runs under `LockService`, and
  checks like capacity and duplicates re-read the sheet inside the lock. Updates
  write only the changed cells, so a staff member editing another column of the
  same row isn't overwritten.
- **Instant backup**: there's no separate database. The clock-in row, the
  clock-out time and the hours figure are in the Attendance tab as soon as the
  leader scans.

## 2) QR clock-in / clock-out

- **What's in the QR**: `MINDS1.<userId>.<yyyymmdd>.<signature>`. The signature
  is an HMAC with `APP_SECRET`, so a code can't be forged or edited to someone
  else's ID, and yesterday's screenshot doesn't work today.
- **Why dated rather than rotating every minute**: venues often have poor
  signal. A per-day code can be pre-loaded (the app caches the next 14 days of
  booked sessions) and still shows offline, while the leader sees the name on
  every scan.
- **One scan toggles** in/out; a repeat within 2 minutes is ignored. The scanner
  also ignores the same code for 4 seconds.
- **The session is worked out from the booking**, so the leader doesn't pick
  anything. If someone has two sessions that day, the confirmed one closest to
  the current time wins; a leader can also lock the scanner to one session.
- **Edge cases handled**: pending bookings are auto-confirmed on scan; unbooked
  volunteers can be added as walk-ins; a leader can clock someone in/out by hand
  if their phone is flat; leader phones queue scans offline and upload them later
  with the original scan time (`scanBatch`).
- **Why the scanner isn't inside Apps Script**: since around February 2026,
  `HtmlService` pages can't get camera permission, a change reported on the
  [Google developer forum](https://discuss.google.dev/t/camera-permission-in-web-app/333827).
  The PWA is hosted on GitHub Pages and calls Apps Script as a JSON API using
  `text/plain` POSTs (a "simple" CORS request, so no preflight is needed).

## If you must keep the Node app instead

This is possible, but it is more moving parts than the Apps Script route:

1. **Host it with HTTPS** (Render, Railway, Fly.io, a VPS + Caddy) and bind to
   `0.0.0.0`, so volunteers' phones can reach it and the camera is allowed.
2. **Add a Sheets mirror** with a Google Cloud service account: share the sheet
   with the service account's email, `npm i googleapis`, and append a row after
   each successful SQLite write:

   ```js
   // server/sheets.js
   import { google } from 'googleapis';
   const auth = new google.auth.GoogleAuth({
     keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, // never commit this file
     scopes: ['https://www.googleapis.com/auth/spreadsheets'],
   });
   const sheets = google.sheets({ version: 'v4', auth });
   export async function appendAttendance(row) {
     await sheets.spreadsheets.values.append({
       spreadsheetId: process.env.SPREADSHEET_ID,
       range: 'Attendance!A:H',
       valueInputOption: 'RAW', // keep text as typed
       requestBody: { values: [row] },
     });
   }
   ```
   Call it after the `UPDATE attendance_records SET clock_out …` in
   `server/routes/attendance.js`, and queue retries if Google is unreachable.
3. **Add a scan route** that accepts a signed code (same format as above, using
   `crypto.createHmac`) and reuses the existing clock-in/clock-out handlers, plus
   a page that loads `html5-qrcode`.
4. **Add volunteer accounts and roles** to the `users` table (it currently has
   one shared staff role).

The trade-off: SQLite stays the real source of truth and the sheet becomes a
copy, which is exactly the drift problem the Apps Script version avoids.

## Matching the WERONE apps

The interface was aligned with three existing WERONE apps so staff and
volunteers meet the same patterns everywhere:

| Borrowed from | What the volunteer app uses |
| --- | --- |
| All three | White sticky header with refresh ("update app"), 🌗 dark-mode toggle saved as `theme` in localStorage, red sign-out icon; Tailwind slate/neutral greys with full dark mode; system font; top-centre toasts |
| All three (`backend/config.js`) | `APP_ENVIRONMENT` = `Exp` / `Dev` / `Prod` with separate Exp and Prod API URLs; purple **Experimentation** bar for Exp, red **Testing** bar for Dev, nothing in Prod |
| CSL Attendance | Indigo icon tile + extrabold title + small uppercase subtitle; segmented tab bar; rounded-2xl cards and rounded-xl indigo buttons; login card with password eye; **Choose Mode** screen (here: Volunteer Leader / Volunteer); QR card; "Successful clock in!" result with emerald for clock-in and indigo for clock-out; lucide-style icons |
| Trainee House Visit | Coloured uppercase section headers on forms; 1–5 Likert buttons for the session rating; fixed bottom Submit bar; green/red toasts |
| Overseas Trip Planner | Landing page: "Welcome", a green-topped "New volunteer? Register now" card, then a "Secure Login" card; uppercase small group labels; spinner inside buttons while saving |
| `deploy-gas.yml` | Same secret names (`CLASPRC_JSON`, `GAS_SCRIPT_ID`, `GAS_DEPLOYMENT_ID`) and the same handling of both clasp credential formats, so the secret you already use works |

Deliberate differences, kept for good reasons:
- **Zoom stays enabled.** The other apps set `user-scalable=no`; that stops people
  with low vision from zooming, so this app doesn't (inputs are 16px, so iOS
  still won't auto-zoom into fields).
- **The QR code stays dark-on-white in dark mode**, so every phone camera reads it.
- **The service worker is kept.** Trip Planner unregisters service workers on
  load; this app needs one so the QR pass and scanner work with no signal.
- **No `document.write` cache-busting.** The service worker cache is versioned per
  deploy instead (the Pages workflow stamps it with the commit SHA).

## Pairing, the guide, trainee notes and search

**Automatic pairing (`gas/Trainees.gs` → `pickTrainee_`).** Pairing runs inside
the same locked write that confirms a booking (leader tap, "Confirm all", or a
scan that confirms a pending booking), so two leaders confirming at once can't
pair the same trainee twice. The rule is deliberately simple and explainable,
and the reason is shown in the toast:
1. only active trainees, and only the session's "Trainees attending" if set;
2. skip trainees already paired in this session;
3. prefer the trainee this volunteer had last time (continuity matters for
   many MINDS trainees), otherwise the one with the fewest confirmed pairings,
   then the one paired least recently.

Leaders can always override it. Natural next rules, if MINDS wants them:
same-gender pairing for personal-care sessions, or matching on interests.

**What volunteers see about a trainee** is a whitelist (`volunteerVisible`),
applied on the server, so medical and caregiver details never reach a
volunteer's phone. "Things to take note" is highlighted, and the latest five
shared notes are shown with the author's first name only.

**Feedback → trainee notes needs a leader by default.** A volunteer's free-text
observation may contain something that shouldn't be passed on (a guess about a
diagnosis, a family detail), so it waits in a review list where a leader can
edit it, share it, or keep it private. Notes live in their own tab rather than
being appended to one cell, so they keep their date and author, can be hidden
individually, and the trainee sheet stays clean.

**Volunteer Guide, projects and venues** are rows in tabs, edited from Me →
Leader tools. Content is plain text with "- " bullets and "1. " steps, rendered
with `textContent` (never as HTML), so a leader can't accidentally break the
page or inject script. Venues are a managed list because free-typed venues drift
("Woodlands Gardens", "WGS", "MINDS WGS") and make reporting by venue unreliable.

**Fuzzy search (`web/js/ui.js` → `fuzzyScore`)** runs on the phone over data it
already has, so it is instant and works offline. Every word typed must match
some word in the item, allowing: prefixes, typos (1 edit for short words, 2 for
longer), swapped letters, skipped letters ("bkng" → baking), initials ("wgs" →
Woodlands Gardens School), accents ("chloe" → Chloé) and phone digits typed
without spaces. Used for sessions (both roles), people, trainees, venues, and
the venue, project and trainee pickers.

**Editing details.** Self-service edits and leader edits share one validator
(the registration rules). Changing the email you sign in with needs your
current password, so a phone left signed in can't be used to take the account
over. A new name is copied to upcoming bookings; past attendance keeps the name
used at the time. Deactivating someone blocks sign-in immediately (every request
re-reads their row) without deleting their hours.

## The staff dashboard

The phone app is for the day itself (book, pair, scan, feedback). The record
keeping MINDS staff do at a desk (people, hours reports, fundraising, outings,
trips, house visits, the old Prototype 1 modules) lives in a separate page,
`web/admin/`, built for a computer screen.

- **One backend, one sheet.** The dashboard calls the same Apps Script API as
  the phone app, and its data is more tabs in the same Google Sheet. A second
  database (like Prototype 1's SQLite) would let volunteers, trainees and hours
  drift apart between the two. Here a volunteer added on the dashboard can sign
  in on the phone the next minute, and every scan shows up in the hours report.
- **Same accounts.** Any volunteer leader can open it; there is no third role
  to manage. Every dashboard action is leaders-only on the server, not just
  hidden in the page.
- **Prototype 1's rules carried over.** Money is summed in whole cents and order
  totals come from stored prices; each trainee is assigned once per outing;
  trip participants keep their own copy of medical and dietary notes; house
  visit history is add-only; nothing is deleted.
- **Names by ID.** New tabs store the volunteer and trainee IDs (plus a readable
  name for people browsing the sheet). Lists look the current name up by ID, so
  renaming someone shows everywhere without rewriting old rows.
- **Trainee tab safety.** Adding or editing a trainee writes only the mapped
  columns, cell by cell, and adds a mapped column (e.g. "Dietary Notes") only
  the first time someone fills it in. MINDS's own extra columns are untouched.
- **Same look and code.** It reuses the phone app's helpers (`web/js/api.js`,
  `ui.js`) and Tailwind styles, so it needs no build step or framework either.

## Next steps worth considering

- Telegram reminders the day before a session (Apps Script time-driven trigger
  + Telegram Bot API).
- Same-gender or interest-based pairing rules (see above).
- Charts on the dashboard overview (hours per month, sales over time).
- Move the two CDN libraries into the repo once you have npm access, so the
  very first load also works without a CDN.
