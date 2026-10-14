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

## Next steps worth considering

- Telegram reminders the day before a session (Apps Script time-driven trigger
  + Telegram Bot API).
- Volunteer self-service profile editing.
- A monthly hours summary tab (or a pivot table) for MINDS reporting.
- Move the two CDN libraries into the repo once you have npm access, so the
  very first load also works without a CDN.
