# PROGRESS.md — Progress tracker

Session hand-off log for the repository's two apps. Update it at the end of every working
session; the [session log](#session-log) at the bottom covers both.

## Volunteer app (`volunteer-app/`) — current work

| Item | Value |
| --- | --- |
| Goal | Volunteer management PWA for MINDS: one app for volunteers and staff. Registration (Telegram, no emergency contact), Volunteer Guide (with an "On the day" infographic, pictures/PDFs), a shared schedule with multi-session "I'm coming", new/regular volunteers, pairing (regular pairs, multi-pairing), trainee info and updates (house-visit form responses), QR clock-in/out, feedback → trainee notes. An Admin menu opened with a shared admin password (every change logged): sessions & pairing, scan & clock-in by hand, pairing list, volunteers, trainees (photos, partner history), attendance & no-shows, hours, notes review, guide & venues, fundraising, outings, overseas trips, house visits, settings (database links, what volunteers see, Google Contacts) |
| Stack | Google Apps Script API + Google Sheets; HTML / vanilla JS / Tailwind PWA on GitHub Pages; GitHub Actions + clasp |
| Run locally | `cd volunteer-app && npm run dev` → http://localhost:5173 (staff@example.com / StaffDemo123, then Me → Admin with AdminDemo123); `/__sheet` and `/__contacts` show the simulated Google Sheets and Contacts; real `gas/*.gs` against in-memory stand-ins |
| Tests | `cd volunteer-app && npm test` → 83 backend tests (49 `gas.test.js`, 19 `dashboard.test.js`, 15 `partner.test.js`) |
| Docs | [README](volunteer-app/README.md), [USER-GUIDE](volunteer-app/docs/USER-GUIDE.md), [DESIGN-NOTES](volunteer-app/DESIGN-NOTES.md), [PARTNER-FEEDBACK-OCT-2026](volunteer-app/docs/PARTNER-FEEDBACK-OCT-2026.md) |
| Status | Working prototype after the October 2026 partner feedback, tested locally (scripted Chromium walkthrough at 360/390/800/1024/1440 px). Not yet run end to end on real Google Apps Script with real phones |
| Next steps | 1) Discuss in person with MINDS: edit session, merging sessions and outings, trips separate, which trainee fields volunteers see (PDPA). 2) Connect to a real Google Sheet (README Part 3): People API, `setAdminPassword()`, link the house-visit responses. 3) Refresh the demo .xlsx and the "Link to a Google Sheet" guide for the new admin setup |

## Prototype 1 (repository root) — complete

Sources of truth for Prototype 1: [PLAN.md](PLAN.md) (contract) and [AGENTS.md](AGENTS.md)
(working rules). If anything below conflicts with PLAN.md, PLAN.md wins.
README: [docs/prototype-1/README.md](docs/prototype-1/README.md).

### Project snapshot

| Item | Value |
| --- | --- |
| Goal | Local MINDS staff prototype: one login/dashboard for Attendance, Fundraising, Outings, Overseas Trips, House Visits + shared Volunteers/Trainees directories |
| Stack | Node.js 24, Express 5, `node:sqlite` (DatabaseSync), plain HTML/CSS/JS modules, no build system |
| Repo | https://github.com/vcoder302026/T4G-Sem12627-MINDS-APP |
| Run | `npm install && npm start` → http://127.0.0.1:3000 (PORT overridable) |
| Demo login | `admin` / `MindsDemo123!` (local demo credentials, seeded once) |
| Data | `data/minds.sqlite` (gitignored, auto-created + seeded on first start; reset = stop server, delete file) |
| Tests | `npm test` → node:test integration suite, temp DB + ephemeral port |

### Current status: **Prototype 1 COMPLETE** (as of 2026-10-10)

All five modules plus directories, auth and dashboard are implemented, tested and pushed.
`npm test` passes 23/23.

#### Implemented (backend + frontend)

- [x] Scaffold: package.json (start/dev/test scripts), .gitignore, Express entry with
      `createApp({databasePath})` factory + separate `startServer()` CLI path
- [x] Database: schema v1 (all 16 tables, NOT NULL/UNIQUE/CHECK/FK constraints,
      `PRAGMA foreign_keys=ON`), one-time transactional demo seed (admin user, 3 volunteers,
      3 trainees, 1 attendance session, 1 fundraiser + 2 products, 1 outing + 1 assignment,
      1 trip + 1 participant + 1 logistics item, 1 house visit; dates derived from Singapore
      "today" at seed time). Never reseeds.
- [x] Auth: scrypt password hashes, SHA-256-hashed random 32-byte session tokens,
      HttpOnly/SameSite=Strict/Path=/ cookie, 8h expiry, timingSafeEqual compare, expired
      session cleanup, logout clears cookie. Origin check on mutating /api requests
      (403 on mismatch). Every /api route protected except /health and /auth/login.
- [x] Validation: server-side trim/blank/length checks (200 chars names/titles/labels,
      5000 notes), calendar-date, enum, positive-int ID, integer-cents money, boolean
      checks; unknown-field and empty-PATCH rejection; SQLite constraint errors mapped
      (UNIQUE→409, FK/CHECK→400).
- [x] Directories: volunteers + trainees list/create/PATCH, searchable tables, inline
      row edit (Save/Cancel), shared records used by all module dropdowns.
- [x] Attendance: sessions list/create/detail, clock-in/out with server time (409 repeats,
      404 missing), hours computed from timestamps only, per-record + per-volunteer summary
      (open rows "In progress", excluded from totals).
- [x] Fundraising: fundraisers, products (integer cents), transactional order creation
      (server-side totals from stored prices; product-fundraiser mismatch, duplicate product
      IDs, bad quantities rejected), PATCH order payment/collection status, total/paid sales.
- [x] Outings: create/list/detail, assignments unique per (outing, trainee), PATCH
      volunteer/group/bus/boarded, boarded count.
- [x] Trips: create with date-range validation, participants unique per trip with
      medical/dietary snapshot copied from trainee profile (independent of later profile
      edits), PATCH volunteer/status/notes, logistics checklist (pending/done), expenses +
      total.
- [x] House visits: create (5 observation fields + follow-up), append-only history newest
      first (date desc, id desc), ?traineeId= filter.
- [x] Dashboard: counts, completed hours, upcoming outings/trips (≥ today, max 5 each).
- [x] Frontend: hash routing (#/dashboard, #/volunteers, #/trainees, #/attendance[/:id],
      #/fundraising[/:id], #/outings[/:id], #/trips[/:id], #/visits), unknown→dashboard,
      SPA fallback for deep links; login shell; textContent-only rendering (no innerHTML for
      user data); loading/empty/error states; busy-disabled buttons; values kept on failed
      saves; single SGD + Singapore-time formatters; money input parsing (≤2 decimals);
      no external scripts/fonts/CDNs (verified).
- [x] Tests: tests/prototype.test.js — 23 integration tests covering seed-once, re-init
      preservation, login failure/success, 401/403/404 semantics, expired session, logout,
      directory validation, clock lifecycle with exact 1.5 h duration (direct DB timestamp
      rewrite, no sleeps), order totals + rejections, outing duplicate/edit, trip range/
      snapshot/logistics/expenses, visits + filter, unknown API 404, malformed JSON 400.

#### Key design decisions (interpretations of PLAN.md — keep consistent)

- Money is integer cents everywhere; UI converts `5.50` → 500.
- Timestamps stored UTC ISO; displayed Asia/Singapore; calendar dates stored YYYY-MM-DD.
- Route param IDs: nonexistent session/fundraiser/outing/trip/order/assignment → 404;
  body references (volunteerId/traineeId/productId) → 400 with a message.
- Required vs optional: order customerName required, customerContact optional; outing
  assignment volunteer required; trip participant volunteer nullable (null = unassigned);
  house-visit trainee + volunteer required; visit follow_up is a text field (≤5000).
- Logistics/expense descriptions capped at 200 chars; observation/notes fields 5000.
- Dashboard response shape: `{counts:{...}, completedHours, upcomingOutings, upcomingTrips}`;
  attendance summary rows `{volunteerId, volunteerName, completedSessions, hours}`.
- No deletes, no attendance-timestamp or submitted-order editing (v1 scope).

#### Bugs found and fixed

| Date | Bug | Fix |
| --- | --- | --- |
| 2026-10-10 | Login appeared to do nothing: password cleared, no screen change. Cause: `.login-wrap{display:flex}` / `.shell{display:grid}` overrode the HTML `hidden` attribute, so the login card never hid (login was actually succeeding). | Added `[hidden]{display:none !important}` to styles.css. Verified JS module graph loads cleanly via DOM-shim import test. |

### Validation status

- Automated: `npm test` 23/23 pass. Full API walkthrough via curl covering every module
  workflow, invalid inputs, logout → restart → re-login persistence, no duplicate seeding.
- NOT performed by a human: visual browser walkthrough (no browser tool in dev environment;
  module graph, asset serving, MIME types, API flows were verified automatically). Recommend
  a quick human pass of the usage guide (docs/prototype-1/USAGE-GUIDE.md) against the live app.
- No external network calls in runtime code (grep-verified over public/ and server/).

### Known limitations (by design, v1 reduced scope)

No record deletion; no attendance timestamp or order editing (status updates only); no
volunteer-facing registration/booking; no Google/email/WhatsApp/payments; no QR, uploads,
mobile/PWA; no sync between staff computers (every clone has its own DB); single demo admin
account, no user management; not production-ready.

### Suggested next steps (not requested yet — do not start without user instruction)

1. Human visual walkthrough of all screens (use docs/prototype-1/USAGE-GUIDE.md as checklist).
2. Optional v2 candidates per user direction: record deletion with confirmation, CSV export,
   more demo data, pagination.

## Session log

| Date | Session | Summary |
| --- | --- | --- |
| 2026-10-10 | 1 | Implemented complete Prototype 1 per PLAN.md (all phases), 23-test suite, README, verified startup/persistence/origin rules. |
| 2026-10-10 | 2 | Diagnosed and fixed login-screen visibility CSS bug; added the Prototype 1 usage guide (now docs/prototype-1/USAGE-GUIDE.md) and PROGRESS.md; pushed to GitHub. |
| 2026-10-14 | 3 | Added `volunteer-app/` (separate from Prototype 1, which is unchanged): Apps Script backend over an existing Google Sheet (header-mapped tabs, additive `setup()`), volunteer registration/booking/trainee pairing/feedback, signed daily QR passes with leader scanning (offline queue, walk-ins, manual fallback), PWA frontend for GitHub Pages, local mock server, 21 backend tests, Playwright phone walkthrough, CI workflows for Pages and clasp. See volunteer-app/README.md and DESIGN-NOTES.md. |
| 2026-10-14 | 4 | volunteer-app: automatic trainee pairing on confirm (continuity first, then fewest pairings; "Confirm all & pair"), richer trainee card for volunteers (gender, communication, behaviours, things to take note, notes from previous volunteers), Volunteer Guide + projects shown to new volunteers before first booking (leader-editable), volunteer feedback → leader review → Trainee Notes, venue dropdown with MINDS Woodlands Gardens School and add/rename/archive venues, fuzzy search everywhere, volunteers edit their own details and leaders edit anyone (incl. other leaders, deactivate). 37 backend tests; Playwright walkthrough of all new flows. |
| 2026-10-14 | 5 | Repo tidy-up: new root README (index of both apps), Prototype 1 README and usage guide moved to `docs/prototype-1/`, `push_test.txt` removed, volunteer-app README restructured with screenshots, new `volunteer-app/docs/USER-GUIDE.md`. |
| 2026-10-15 | 6 | Fictional demo Google Sheet (`volunteer-app/docs/demo-data/*.xlsx`); README link fixes; more robust GitHub Pages deploy (installs Tailwind, validates variables). |
| 2026-10-16 | 7 | **Version 1 complete.** Added the staff dashboard (`volunteer-app/web/admin/`) on the same Apps Script backend and Google Sheet, leaders only, five sections: overview & people (attendance fixes, hours report + CSV, add/edit volunteers and trainees), fundraising, outings, overseas trips, house visits. New `gas/` files Dashboard/Fundraising/Outings/Trips/Visits, 11 new Sheet tabs, 19 new tests (56 total), demo data and demo .xlsx extended, browser walkthrough passed. Wrote `VERSION-1.md` (client report: product, demo guide, technical notes). |
| 2026-10-16 | 8 | Docs only: test-round process for integration (snapshot → deploy → user testing and feedback → pause → fix → redeploy) with rollback of data, backend version and website. `volunteer-app/README.md` Part 3 new Stage 9 (production is now Stage 10); `VERSION-1.md` §3.4 step 10. `snapshot()` and `MAINTENANCE_MODE` noted as not built yet. |
| 2026-10-17 | 9 | **Partner feedback (meeting minutes).** One app for everyone: leader accounts replaced by a shared MINDS admin password (12 h admin sessions, Admin Log of every change, password to deactivate); the staff dashboard merged into the app (`web/js/admin/`, responsive: phone tabs + chips + card tables, desktop sidebar; `web/admin/` redirects). "I'm coming" without confirmation, multi-session sign-up, schedule for all volunteers (share). New/regular volunteers (regular after 10 sessions); regulars auto-paired, new paired by admins; Pairing List (many-to-many, import); multi-pairing; partner history; no-shows. Data Sources (sheet/tab links), house-visit form responses as trainee updates (append rows in their format), per-type field access, trainee photos, guide pictures/PDFs + "On the day" infographic. Telegram required, emergency contact removed, Google Contacts sync (simulated locally). Session Type. 83 tests; Playwright walkthrough phone/tablet/desktop. |
