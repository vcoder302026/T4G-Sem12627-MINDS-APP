# MINDS Volunteer App

A phone-first web app (PWA) for MINDS volunteering. New volunteers register and
read a short **Volunteer Guide** (projects, attire, expectations), then book
sessions. Once a leader confirms a booking they are **paired with a trainee
automatically** and see that trainee's profile (gender, communication,
behaviours, things to take note) plus notes from previous volunteers. They show
a QR pass to clock in and out, and leave feedback that can become a note for the
next volunteer. Leaders post sessions (venue dropdown, add new venues), confirm
and pair, scan passes, review volunteer notes, edit the guide, and manage
people. Volunteers edit their own details; leaders can edit anyone's.
Every search box uses forgiving fuzzy search (typos and missing letters are fine).

Everything is stored in **your existing Google Sheet**. Every clock-in,
clock-out and hours figure is written to the sheet the moment it happens.

Built to the WERONE architecture: **Google Apps Script** as the backend API,
**Google Sheets** as the database, **HTML + vanilla JavaScript + Tailwind** as
the frontend, installable as a **PWA**, deployed by **GitHub Actions + clasp**.
The interface follows the existing WERONE apps (CSL Attendance, Trainee House
Visit, Overseas Trip Planner): same header with refresh / 🌗 dark mode / sign-out
buttons, purple "Experimentation" bar in Exp builds, cards, buttons, badges and
colours. See [DESIGN-NOTES.md](DESIGN-NOTES.md#matching-the-werone-apps).

```mermaid
flowchart LR
  V[Volunteer phone<br/>PWA on GitHub Pages] -- "POST {action, token, payload}" --> G[Apps Script web app<br/>gas/*.gs]
  L[Leader phone<br/>camera scanner] -- "scan / scanBatch" --> G
  G -- "read/write by header name" --> S[(Your Google Sheet<br/>Volunteers · Sessions · Bookings<br/>Attendance · Feedback · Trainees<br/>Trainee Notes · Venues · Projects · Guide)]
```

> Why the frontend is not served by Apps Script: since around February 2026,
> pages served from Apps Script can no longer get camera permission (its iframe
> blocks it), so a QR scanner there fails. Hosting the PWA on GitHub Pages and
> calling Apps Script as an API avoids that and is what makes PWA install possible.

---

## Try it locally (1 minute, no Google account needed)

```bash
cd volunteer-app
npm run dev
```

Open <http://localhost:5173>. A phone on the same Wi-Fi can open
`http://<your-computer's-IP>:5173` to try the screens; the camera needs HTTPS,
so test real scanning on the deployed GitHub Pages site.

| Role | Email | Password |
| --- | --- | --- |
| Volunteer leader | `leader@example.com` | `LeaderDemo123` |
| Volunteer | `volunteer@example.com` | `VolunteerDemo123` |
| Second volunteer | `sam@example.com` | `VolunteerDemo123` |

Register a new account to see the first-time flow (the guide comes first).

The local server runs the **real** `gas/*.gs` code against an in-memory copy of
a spreadsheet. Open <http://localhost:5173/__sheet> to watch what would be
written to Google Sheets. Data resets when you stop the server. All demo
people are fictional.

```bash
npm test          # 37 end-to-end backend tests (register → guide → book → auto-pair → scan → feedback → notes)
npm run build:css # rebuild web/styles.css after changing Tailwind classes
```

---

## Link it to your existing Google Sheet

**1. Create the Apps Script project.** Either
- **No tools:** open the sheet → Extensions → Apps Script. Create one script
  file per file in `gas/` (same names) and paste the contents. In Project
  Settings tick "Show appsscript.json manifest" and paste `gas/appsscript.json`.
- **With clasp** (what CI uses): `npm run clasp:login`, create a project, copy
  `.clasp.json.example` to `.clasp.json` with your Script ID, then `npm run gas:push`.

**2. Tell it which sheet to use.** Project Settings → Script properties → add
`SPREADSHEET_ID` = the long ID in the sheet URL
(`docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`). If trainees are in a
different file, also add `TRAINEE_SPREADSHEET_ID`.

**3. Map your trainee columns.** In `gas/Config.gs` → `TRAINEES.columns`,
change the header text on the right to match row 1 of your trainee tab (e.g.
`name: 'Trainee Name'`). Only a name column is required; order doesn't matter
and unknown columns are left alone. The defaults are `Name`, `Preferred Name`,
`Gender`, `Communication` (verbal / non-verbal and how), `Behaviours`,
`Things to Take Note`, `Interests`, `Support Needs`, `Medical Notes`,
`Caregiver Name`, `Caregiver Phone` and `Active` (`No` keeps a trainee out of
automatic pairing). `volunteerVisible` controls what a paired volunteer sees;
medical and caregiver details are leaders-only by default.

**4. Preview, then set up.** In the editor run `checkConfig()` (read-only: it
lists what would change), then `setup()`. Setup:
- creates the app tabs that are missing (Volunteers, Sessions, Bookings,
  Attendance, Feedback, Trainee Notes, Venues, Projects, Volunteer Guide,
  hidden `_Auth`), or appends missing columns to same-named tabs you already have;
- adds a `Trainee ID` column to your trainee tab if there isn't one and fills
  IDs (T-0001…), empty columns for any volunteer-visible field you don't have
  yet (e.g. `Things to Take Note`), and two columns for volunteer observations;
- adds starter content to empty tabs: the venue **MINDS Woodlands Gardens
  School**, a five-part Volunteer Guide and one project (leaders edit all of it in the app);
- creates `APP_SECRET`, which signs logins and QR codes.

It never deletes, reorders or overwrites existing data and is safe to re-run.
**After updating the `.gs` code, run `setup()` again** so new tabs and columns are added.

**5. Deploy the API.** Deploy → New deployment → type **Web app** → Execute as
**Me** → Who has access **Anyone** → Deploy, and authorise. Copy the Web app
URL (ends in `/exec`).

**6. Publish the app.** In `web/js/config.js` (same convention as the other
apps' `backend/config.js`) set `APP_ENVIRONMENT` (`Exp`, `Dev` or `Prod`) and
paste the URL into `EXP_API_URL` / `PROD_API_URL`. Or leave the file alone and
add repository variables `APP_ENVIRONMENT`, `GAS_EXP_URL`, `GAS_PROD_URL`.
Repo Settings → Pages → Source: **GitHub Actions**. Pushing to `main` runs
`.github/workflows/volunteer-app-pages.yml` and publishes `web/`.

**7. Make yourself the first leader.** Register in the app, then in Script
properties add `FIRST_ADMIN_EMAIL` = that email and run `makeFirstAdmin()`.
From then on, leaders promote others in the app (People → Make volunteer leader).

**Automatic backend deploys (optional):** add the secrets described at the top
of `.github/workflows/volunteer-app-gas.yml`. Each push then runs the tests,
`clasp push`es the code and updates the same deployment, so the URL never changes.

> Changed the `.gs` code by hand? Deploy → Manage deployments → edit (pencil) →
> Version: **New version**. Otherwise the live URL keeps serving the old code.

---

## How it works for each role

| Task | Volunteer taps | Leader taps |
| --- | --- | --- |
| First time: read the guide | lands on it after registering → **I've read the guide** | |
| Book a session | Sessions → (search) → **Book** (2) | |
| Confirm + pair with a trainee | | Session → **Confirm & pair** per person, or **Confirm all & pair trainees** (2) |
| Change a pairing | | Session → trainee box → type a name → pick (2) |
| See my trainee | Home: profile, things to take note, notes from previous volunteers (0) | |
| Clock in / out at the venue | **QR pass** (1) | **Scan** → point camera (1) |
| Volunteer's phone is flat | | Session → **Clock in by hand** (2) |
| Walk-in who didn't book | show pass | scan → **Add as walk-in** (2) |
| Feedback after the session | **Give feedback** prompt → rate → notes for future volunteers → send | |
| Turn feedback into a trainee note | | Sessions → "notes to review" → edit → **Share** (3) |
| New session at a new venue | | New session → Venue → type name → **Add a new venue** |
| Edit the guide, projects or venues | | Me → Leader tools |
| Update my own details | Me → My details → **Edit** | same |
| Edit a volunteer or another leader | | People → (search) → name → edit → **Save details** |
| Promote, deactivate, reset password | | People → name → Access |
| Book a session yourself as a leader | | 🏠 icon → **Choose Mode** → Volunteer |

Details worth knowing:
- **One scan toggles**: first scan clocks in, the next clocks out. A repeat
  scan within 2 minutes is ignored, so a camera reading the same code twice
  can't clock someone straight back out.
- **Pending bookings are confirmed by scanning**: if someone shows up before a
  leader confirmed them, the scan confirms and clocks them in.
- **QR codes are signed and dated.** A code only works on its own date and
  can't be edited or forged without `APP_SECRET`. Phones pre-load codes for the
  next 14 days of booked sessions, so the pass shows with no signal.
- **Leader phones work offline too.** No signal → the scan and its exact time
  are saved on the phone and uploaded automatically later (marked `QR (offline)`).
- **Automatic pairing** happens when a leader confirms a booking (or a scan
  confirms it) without choosing a trainee. It picks from active trainees
  (`Active` not `No`), limited to the session's "Trainees attending" if set,
  never giving one trainee to two volunteers in the same session. It prefers
  the trainee this volunteer was paired with last time (familiar faces help),
  then the trainee with the fewest pairings so far. Leaders can change any
  pairing. Turn it off with `AUTO_PAIR_ON_CONFIRM: false` in `Config.gs`.
- **Feedback becomes trainee notes, after a leader checks it.** A volunteer's
  observation goes to the leader's review list; **Share** adds it (optionally
  edited) to the Trainee Notes tab, and the next volunteers paired with that
  trainee see the latest 5 shared notes. **Keep private** leaves it in Feedback
  only. Leaders can add notes or hide any note. To skip review, set
  `AUTO_SHARE_OBSERVATIONS: true`. The latest observation is also copied into
  "Latest Volunteer Observation" on the trainee's own row.
- **The guide comes first.** With `REQUIRE_GUIDE_BEFORE_BOOKING: true` (default),
  a volunteer must tap "I've read the guide" once before their first booking.
- **Venues** come from the Venues tab. Sessions must use a listed venue; leaders
  add one from the dropdown or from Me → Venues. Renaming a venue renames it on
  today's and future sessions; archiving hides it from new sessions only.
- **Editing details.** Volunteers change their own details (changing the sign-in
  email asks for their password). Leaders can edit anyone, including other
  leaders, and deactivate accounts (that person is signed out at once). There
  must always be at least one active leader, and leaders can't demote or
  deactivate themselves. Each edit records "Details Updated By / At".
- **Forgotten passwords**: a leader taps People → name → Reset password and
  passes on the temporary password. The volunteer changes it under Me.

## What's in the sheet

| Tab | One row per | Notes |
| --- | --- | --- |
| Volunteers | person | profile, emergency contact, Role (`volunteer`/`admin`), Status (`active`/`inactive` to block sign-in), Guide Read At, Details Updated By/At |
| _Auth (hidden) | person | salted password hashes; never shown in the app |
| Sessions | session | Status `open` / `closed` (no new bookings) / `cancelled` |
| Bookings | booking | `pending` → `confirmed` (with trainee) or `cancelled`; Pairing `auto`/`manual`; Walk-in = Yes |
| Attendance | clock record | Clock In, Clock Out, Hours (2 dp), who scanned, Method |
| Feedback | submission | rating 1–5, session feedback, trainee observation, Note Status (`pending`/`shared`/`private`) |
| Trainee Notes | note | what future volunteers see; Status `shared` or `hidden` |
| Venues | venue | Venue, Address (for the Maps link), Status `active`/`archived` |
| Projects | project | shown in the Volunteer Guide and the session form |
| Volunteer Guide | section | heading + content; "- " lines become bullet points |
| Trainees (yours) | trainee | read by the app; only Trainee ID, empty missing columns and 2 observation columns are ever written |

Staff can edit the sheet directly (e.g. fix a wrong clock-out time); the app
re-reads it on every request. Don't rename the header row without updating
`Config.gs`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| App says "Couldn't reach the server" everywhere | Web app access must be **Anyone** (not "Anyone with Google account"); redeploy as a new version; check the URL in `config.js` ends in `/exec`. |
| `CONFIG_ERROR … SPREADSHEET_ID is not set` / `tab was not found` | Add the script property; run `setup()`. |
| Camera doesn't start | The site must be HTTPS (GitHub Pages is); allow camera for the site in browser settings; close other camera apps. |
| "This QR code is for 2026-…" | The volunteer is showing an old screenshot. Reopen the app's pass. |
| Changed code isn't live | Make a **new version** of the existing deployment (see the note after step 7). |

## Limits of this prototype

- Passwords use iterated HMAC-SHA256 with a secret pepper (Apps Script has no
  bcrypt/scrypt); fine for a prototype, review before real launch.
- Apps Script handles roughly 30 simultaneous executions and each request takes
  1–2 s; plenty for session-sized groups, not for thousands of concurrent users.
- Trainee details are edited in the trainee sheet, not in the app.
- Pairing doesn't yet consider gender, skills or trainee preferences; a leader
  adjusts the pairing when that matters.
- Emails aren't verified. Someone who registers first with an email that is
  already on your Volunteers list links to that row (always as a volunteer,
  never a leader). Before launch, consider emailing a one-time code with
  `MailApp` during registration.
- The scanner library (`html5-qrcode` 2.3.8) is stable but no longer actively
  maintained; it is loaded from a CDN with a fallback and cached for offline use.
- Get MINDS's sign-off on which trainee fields volunteers may see (PDPA).

See [DESIGN-NOTES.md](DESIGN-NOTES.md) for why it's built this way and how it
relates to the Node prototype in the repository root.
