# Future contributions

It covers getting set up, finding your way around the code, making and
deploying a change safely, and what to build next.

This guide doesn't repeat the other docs; it tells you which one to open:

| Doc | Open it for |
| --- | --- |
| [README.md](README.md) | The project in one page, quick start, version history |
| [volunteer-app/README.md](volunteer-app/README.md) | Every feature, setting up Google (Part 3), configuration, troubleshooting |
| [volunteer-app/docs/USER-GUIDE.md](volunteer-app/docs/USER-GUIDE.md) | How volunteers, regulars and admins use the app |
| [Handbook (PDF)](volunteer-app/docs/MINDS-Volunteer-App-Handbook.pdf) | The printable beginners' handbook; rebuild it after screen changes ([how](volunteer-app/docs/handbook/README.md)) |
| [AGENTS.md](AGENTS.md) | The rules for changing the app (MINDS's template, consistency with their other apps, deploy rules) |
| [volunteer-app/DESIGN-NOTES.md](volunteer-app/DESIGN-NOTES.md) | Why things are built the way they are |
| [VERSION-4.md](VERSION-4.md) | What changed most recently, and how each upgrade was deployed |
| [TODO.md](TODO.md) | Everything still open, and questions for MINDS |
| [PROGRESS.md](PROGRESS.md) | A log of every working session |

---

## 1. Where the project stands (November 2026)

- **Version 4.9** runs on the **Exp** environment: the website on GitHub Pages, the backend on
  Google Apps Script, the data in Google Sheets. Every merge into `main` deploys both through
  GitHub Actions.
- It was load-tested with 100 volunteers and 10 admins at once and tested by users on
  31 October. All of that feedback is done except **reminders** (see section 7).
- **Not on Prod yet.** Production needs a Google account from MINDS that owns the sheets and the
  Apps Script project (TODO.md 1.4, 3.5).
- Several decisions are waiting on MINDS: which trainee details volunteers see, PDPA wording,
  whether outings and fundraising stay. See TODO.md section 1.

| Environment | What it is | Data |
| --- | --- | --- |
| Local demo | `npm run dev` on your laptop; the real backend code against an in-memory sheet | Fictional, resets when stopped |
| Exp | The test environment (purple "Experimentation" bar) | MINDS's mock data and test volunteers |
| Prod | Not set up yet | Real volunteers and trainees |

---

### Where things live

The Apps Script and Drive links only open for people they've been shared with: ask the current owner (see the
[Handover log](#handover-log)) for access. This repository is public, so keep each one's sharing
set to **Restricted**, and never add passwords, the Web App URL or script IDs for Prod here.

| What | Link | What's in it |
| --- | --- | --- |
| Apps Script project (Exp) | [Open in Apps Script](https://script.google.com/d/1w-EB81QtKqWS1uEuX12ZWElMp5mzeXS3CClX4Yc_9U99iwBkmw5bNsUE/edit) | The backend (`volunteer-app/gas/`). Run `setup()` or `resetAdminPassword()` here, approve new permissions after a deploy, and read the Execution log |
| Google Drive folder | [Team 39 × MINDS Drive](https://drive.google.com/drive/folders/1pqzDAsVHs4shmEvAijmLySF_zvivSKEH) | The project's shared files: the Google Sheets, note files, guide pictures and trainee photos |
| Meeting minutes | [MINDS-Meeting-Minutes.pdf](volunteer-app/docs/MINDS-Meeting-Minutes.pdf) (in this repo) | What MINDS asked for at each meeting: 16 Oct call, 17 Oct in person, 22 and 29 Oct calls, 31 Oct testing feedback. Pictures in it use mock data only |

## 2. Getting set up

### On your computer (about 10 minutes)

You need Git and Node.js 20 or later. For the layout checks, also Python 3 with Playwright.

```bash
git clone https://github.com/vcoder302026/T4G-Sem12627-MINDS-APP.git
cd T4G-Sem12627-MINDS-APP/volunteer-app
npm test          # 137 tests, all should pass
npm run dev       # http://localhost:5173
```

Sign in with the demo accounts in the [root README](README.md#quick-start). The demo admin
password is `admin-demo-2026` (only in the demo).

### Access to ask the previous team or MINDS for

- [ ] **Write access** to the GitHub repository (Settings → Collaborators)
- [ ] **Editor access** to the Exp Apps Script project, or at least someone who has it. Only the
  project's owner can approve new Google permissions (section 5)
- [ ] The Exp volunteer sheet and the trainee (House Visit) sheet
- [ ] The **admin password** for Exp (admin-09fb-95d6-ed48) (it's separate from everyone's sign-in password; if nobody
  has it, the owner runs `resetAdminPassword()`)
- [ ] An Exp admin account for yourself (register in the app, then an admin uses **Make an admin**)
- [ ] MINDS's Drive folder "Team 39 Tech for Good x MINDS", which holds their web app template

Never copy real volunteer or trainee data onto your computer, into the repo, or into
screenshots. Use the demo or Exp.

---

## 3. Finding your way around the code

### How one request travels

```
web/js/views/*.js            call('setVolunteerType', { … })          (web/js/api.js)
        │  HTTPS POST to the Apps Script /exec URL
        ▼
gas/Main.gs  routes_()       setVolunteerType: { auth: 'admin', write: true, fn: setVolunteerType_ }
        │  checks the sign-in and role; write actions run inside withLock_()
        ▼
gas/Pairing.gs               setVolunteerType_(p, admin)  ← the feature's own file
        │  table_('volunteers').update(…)   (gas/Db.gs: sheets as tables, found by header)
        ▼
gas/Speed.gs                 marks the cached copies it changed as out of date
        │
        ▼  { message, … }    the reply; a slow reply is built in afterLock, after the lock is released
```

To add a backend action: write the function in the feature's `.gs` file, add one line to
`routes_()` in `gas/Main.gs` (with `auth` and `write`), and call it from the page with `call()`.

### I want to change… → look in…

| I want to change… | Look in |
| --- | --- |
| Registration questions, session defaults, projects, trainee columns, who sees what, switches like `SESSION_SPOTS` | `volunteer-app/gas/Config.gs` (MINDS should be able to change most things here) |
| A volunteer's screens (Home, Sessions with Upcoming and Past, QR pass, Me) | `web/js/views/volunteer.js`, `profile.js`, `web/js/qr.js`; past sessions: `pastSessions_` / `allPastSessions_` in `gas/Volunteer.gs` |
| The guide | `web/js/views/content.js` (pages), `gas/Content.gs` (server) |
| Admin home, sessions (All sessions, including Past sessions), scanning | `web/js/views/admin.js`, `leader.js`; `gas/Admin.gs`, `gas/Attendance.gs` |
| Pairing boards | `web/js/views/pairing.js`, `web/js/dnd.js`; `gas/Pairing.gs` |
| Trainees, notes, who can read a note | `web/js/views/trainees.js`; `gas/Trainees.gs`, `gas/TraineeInfo.gs`, `NOTE_AUDIENCES` in `Config.gs` |
| Volunteers, roles, attendance and hours pages | `web/admin/js/views/people.js`, `attendance.js`; `gas/Profile.gs`, `gas/Dashboard.gs` |
| House visits | `web/admin/js/views/visits.js`; `gas/Visits.gs` |
| Scheduled jobs (automatic clock-out) | `gas/AutoClock.gs`, switched on in `gas/Maintenance.gs` (Advanced settings) |
| Menus, header, routes, Back | `web/js/app.js` (`ADMIN_SECTIONS`, `ROUTES`) |
| Shared pieces: fields, warnings, toasts, pop-ups | `web/js/ui.js` (reuse these; don't write new ones) |
| Dropdowns, the time wheel, password eyes | `web/js/controls.js` (applied to every page automatically) |
| Colours, layout, phone sizes | `web/src/input.css` (named rules at the end); `web/styles.css` is the built file |
| Speed and caching | `gas/Speed.gs` (read [Speed and load testing](volunteer-app/README.md#speed-and-load-testing) first) |
| Deploys | `.github/workflows/volunteer-app-pages.yml` (website), `volunteer-app-gas.yml` (backend) |

### The test harness

`dev/gas-harness.js` loads every `gas/*.gs` file into Node with fake Google services
(SpreadsheetApp, CacheService, LockService, ScriptApp, …). Tests call the backend just as the app
does:

```js
const res = rt.call('setRole', { userId, role: 'admin', adminPassword: ADMIN_PW }, leader);
rt.setNow(at('13:05'));               // move the clock
rt.evaluate('autoClockOut()');        // run any backend function
rt.records(SHEET, 'Attendance');      // read a tab
```

If you use a Google service the harness doesn't fake yet, add a small fake there; that's how
`ScriptApp` was added for automatic clock-out.

---

## 4. Making a change: the routine

1. **Branch from an up-to-date `main`.**
   ```bash
   git switch main && git pull
   git switch -c short-description
   ```
2. **Check the rules first.** Before adding or changing a screen, read [AGENTS.md](AGENTS.md) and
   see how MINDS's other apps do the same thing. Keep text short, warn before major actions,
   reuse `ui.js`.
3. **Make the change, and add or update a test** in `volunteer-app/tests/`. If a test checks the
   old behaviour on purpose, change the test rather than weakening it.
4. **Run the checks.**
   ```bash
   cd volunteer-app
   npm test                         # all must pass
   node dev/check-deploy.mjs        # must print "ready to deploy"
   ```
   For anything visible, also try it in the demo at phone size. For layout changes, run the
   `dev/check-*.py` scripts; each one's first lines say which port to start the demo on.
5. **Update the docs** that your change makes wrong:

   | If you changed… | Update |
   | --- | --- |
   | What someone can do or see | `volunteer-app/docs/USER-GUIDE.md`, and Part 1 of `volunteer-app/README.md` |
   | A setting, tab or column | `volunteer-app/README.md` Part 3–4 |
   | How something works, and why | `volunteer-app/DESIGN-NOTES.md` |
   | Anything | A row in `PROGRESS.md`; tick or add items in `TODO.md`; a section in `VERSION-4.md` (or start `VERSION-5.md`) |
   | The test count | `README.md` and `volunteer-app/README.md` |

6. **Push and open a pull request into `main`.** The backend tests run on the pull request. Say
   in the description if the change adds a Google permission or needs **Run setup**.
7. **Merge.** That deploys. Then do the after-merge checklist below.

### After every merge

- [ ] **Actions:** both "Volunteer app · deploy web" (a **build** and a **deploy** box) and
  "Volunteer app · test and deploy Apps Script" are green
- [ ] **New Google permission?** (a changed `oauthScopes` in `gas/appsscript.json`) The project's
  owner opens the Apps Script editor, runs any function once, and approves it, **straight away**.
  Until then, the app can't reach the backend
- [ ] **New columns or tabs?** Admin → Settings → Advanced settings → **Run setup**
- [ ] Open the app, tap ↻, and try what you changed on Exp

---

## 5. Things that caught us out

| What happened | What to do |
| --- | --- |
| The 4.8 deploy added a permission (triggers, for automatic clock-out). Deploys can't approve permissions | The owner runs a function once in the editor after the deploy. Say so in the pull request |
| The website deploy failed with "No artifacts named github-pages"; re-running everything then failed with "Multiple artifacts" | Build and deploy are now separate jobs. If only **deploy** fails, use **Re-run failed jobs**, never **Re-run all jobs** |
| "The app keeps asking for the admin password" | It was a wrong password, but the message didn't say so (fixed in 4.8.1). The admin password is shared and separate from sign-in passwords |
| A Tailwind class used in new code didn't exist in the committed `web/styles.css` | Reuse an existing class or add a named rule to `web/src/input.css`; `check-deploy.mjs` catches it |
| A screen looked old after a deploy | Tap ↻ (Update app); the offline cache is re-versioned on every deploy |
| Lists slow down when every request reads the sheets | Read through `table_()`, which uses the cached copies in `gas/Speed.gs`; writes inside `withLock_` mark copies out of date. Check with `node dev/count-reads.mjs` |
| Long work inside the lock made other admins wait | Return `{ afterLock: () => … }` from the handler for anything slow, as `updateBooking_` and `updateSession_` do |
| Removing a feature MINDS might want back | Switch it off in `Config.gs` (like `SESSION_SPOTS`) instead of deleting code or columns |
| iPhone Safari shows things differently (date boxes, zoom on small text) | Run `python3 dev/check-fit.py --ios`, keep inputs at 16 px, and test on a real iPhone before telling MINDS it's done |
| Apps Script runs about 30 requests at once, saves one at a time | Keep saves short; measure with `dev/load-test.mjs` before big changes to busy pages (pairing, scanning) |

---

## 6. Decisions to make with MINDS first

The questions are in [TODO.md](TODO.md) section 1:

- Which trainee details volunteers and regulars see by default (PDPA)
- Whether outings and fundraising stay in this app (they're placeholders under **More**)
- How session attendance and outing attendance relate
- Email or Telegram for reminders
- The Google account for production

---

## 7. What to build next

Roughly in order of value to MINDS. Sizes: **S** is under a day, **M** a few days, **L** a week
or more.

| # | What | Why | Where to start | Size |
| --- | --- | --- | --- | --- |
| 1 | **Reminders** the day before a session (volunteers and admins) | Asked for in the 31 Oct testing; fewer no-shows | Sketch below; MINDS chooses email or Telegram | M |
| 2 | **Production setup** | Real volunteers can't use Exp | `volunteer-app/README.md` Part 3 with MINDS's account; TODO.md 3.5 | M |
| 3 | **Real-phone testing** (QR between two phones, press and hold, offline passes, iPhone date boxes) | Everything so far was tested in emulated phones | TODO.md 3.1 and 7 | S |
| 4 | **Security and privacy review** before real data | Passwords use iterated HMAC (no bcrypt in Apps Script), emails aren't verified | TODO.md 3.3 | S–M |
| 5 | **Cancelling a session tells its volunteers** and cancels their bookings | Today they just stop seeing it | `updateSession_` in `gas/Admin.gs`; pairs well with reminders | S |
| 6 | **Maintenance mode** that pauses sign-ups and scanning | Safer fixes during a live session | A `MAINTENANCE_MODE` script property checked in `handle_` (`gas/Main.gs`) | S |
| 7 | **Special events and committee hours** | MINDS records these by hand | TODO.md 2.3 (an event type on sessions) | M |
| 8 | **Trainee IDs for new form responses** without running setup | New House Visit responses wait for setup | An "on form submit" trigger running `fillTraineeIds_()` (`gas/Setup.gs`), switched on like automatic clock-out | S |
| 9 | **Backend workflow on Node 24 actions** | GitHub warns that Node 20 actions are deprecated | `actions/checkout` and `setup-node` to v5 in `volunteer-app-gas.yml` | S |
| 10 | From MINDS's template: **code backup to a Google Doc**, **CacheService write-through** for many admins on one board | Template items not built yet | TODO.md section 6 | M |
| 11 | **Choose from Drive** for guide files (Google Picker) | Easier than pasting links | TODO.md 2.4 (needs a Google Cloud OAuth client) | M |
| 12 | Tidy-ups: rebuild Tailwind, refresh the demo spreadsheet | Housekeeping | TODO.md section 4 | S |

### Sketch: reminders

Built the same way as automatic clock-out (`gas/AutoClock.gs`), so most of the pattern exists:

1. **A daily trigger** (e.g. 6 pm Singapore time), switched on and off in Advanced settings
   (`gas/Maintenance.gs`), created with `ScriptApp.newTrigger(…).timeBased().everyDays(1).atHour(18)`.
   The permission is already in `appsscript.json`.
2. **Who to remind:** confirmed bookings (`table_('bookings')`) for sessions tomorrow, with each
   volunteer's paired trainee (short names, `gas/DisplayNames.gs`).
3. **How to send it** (MINDS chooses):
   - **Email** with `MailApp.sendEmail`: the simplest, but it adds the `script.send_mail`
     permission (approve it after the deploy, section 4) and has a daily quota (about 100
     recipients a day on a personal Gmail account, more on Google Workspace).
   - **Telegram** with a bot and `UrlFetchApp`: free and quick, but each volunteer must start the
     bot once so it can message them; store their chat ID when they do. Adds the
     `script.external_request` permission. Keep the bot token in a script property.
4. **For admins:** the same job sends tomorrow's numbers (coming, unpaired) and a **Things to
   bring** list, a new optional field on sessions and outings (add it in `Config.gs`, the session
   form in `views/leader.js`, and `gas/Admin.gs`).
5. **Tests:** add `MailApp` or `UrlFetchApp` fakes to `dev/gas-harness.js` that record what would
   be sent, and test who gets a reminder (cancelled bookings, closed sessions and deactivated
   volunteers don't).

---

### Handover log

| When | From | To | Notes |
| --- | --- | --- | --- |
| Nov 2026 | Tech for Good Team 39, Sem 1 AY2026/27 | | Version 4.9 on Exp; see section 1. Re-share the Apps Script project and Drive folder ([Where things live](#where-things-live)) with the next team; the minutes are in the repo |
