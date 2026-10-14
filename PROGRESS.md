# PROGRESS.md — Master Progress Tracker (MINDS Admin Prototype)

This is the project's master progress tracker, maintained for session hand-off. Update it at
the end of every working session. Sources of truth: [PLAN.md](PLAN.md) (contract) and
[AGENTS.md](AGENTS.md) (working rules). If anything here conflicts with PLAN.md, PLAN.md wins.

## Project snapshot

| Item | Value |
| --- | --- |
| Goal | Local MINDS staff prototype: one login/dashboard for Attendance, Fundraising, Outings, Overseas Trips, House Visits + shared Volunteers/Trainees directories |
| Stack | Node.js 24, Express 5, `node:sqlite` (DatabaseSync), plain HTML/CSS/JS modules, no build system |
| Repo | https://github.com/vcoder302026/T4G-Sem12627-MINDS-APP |
| Run | `npm install && npm start` → http://127.0.0.1:3000 (PORT overridable) |
| Demo login | `admin` / `MindsDemo123!` (local demo credentials, seeded once) |
| Data | `data/minds.sqlite` (gitignored, auto-created + seeded on first start; reset = stop server, delete file) |
| Tests | `npm test` → node:test integration suite, temp DB + ephemeral port |

## Current status: **Prototype 1 COMPLETE** (as of 2026-10-10)

All five modules plus directories, auth and dashboard are implemented, tested and pushed.
`npm test` passes 23/23.

### Implemented (backend + frontend)

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

### Key design decisions (interpretations of PLAN.md — keep consistent)

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

### Bugs found and fixed

| Date | Bug | Fix |
| --- | --- | --- |
| 2026-10-10 | Login appeared to do nothing: password cleared, no screen change. Cause: `.login-wrap{display:flex}` / `.shell{display:grid}` overrode the HTML `hidden` attribute, so the login card never hid (login was actually succeeding). | Added `[hidden]{display:none !important}` to styles.css. Verified JS module graph loads cleanly via DOM-shim import test. |

## Validation status

- Automated: `npm test` 23/23 pass. Full API walkthrough via curl covering every module
  workflow, invalid inputs, logout → restart → re-login persistence, no duplicate seeding.
- NOT performed by a human: visual browser walkthrough (no browser tool in dev environment;
  module graph, asset serving, MIME types, API flows were verified automatically). Recommend
  a quick human pass of the usage guide (PROTOTYPE1-APP-USAGE-GUIDE.md) against the live app.
- No external network calls in runtime code (grep-verified over public/ and server/).

## Known limitations (by design, v1 reduced scope)

No record deletion; no attendance timestamp or order editing (status updates only); no
volunteer-facing registration/booking; no Google/email/WhatsApp/payments; no QR, uploads,
mobile/PWA; no sync between staff computers (every clone has its own DB); single demo admin
account, no user management; not production-ready.

## Suggested next steps (not requested yet — do not start without user instruction)

1. Human visual walkthrough of all screens (use PROTOTYPE1-APP-USAGE-GUIDE.md as checklist).
2. Optional v2 candidates per user direction: record deletion with confirmation, CSV export,
   more demo data, pagination.

## Session log

| Date | Session | Summary |
| --- | --- | --- |
| 2026-10-10 | 1 | Implemented complete Prototype 1 per PLAN.md (all phases), 23-test suite, README, verified startup/persistence/origin rules. |
| 2026-10-10 | 2 | Diagnosed and fixed login-screen visibility CSS bug; added PROTOTYPE1-APP-USAGE-GUIDE.md and PROGRESS.md; pushed to GitHub. |
| 2026-10-14 | 3 | Added `volunteer-app/` (separate from Prototype 1, which is unchanged): Apps Script backend over an existing Google Sheet (header-mapped tabs, additive `setup()`), volunteer registration/booking/trainee pairing/feedback, signed daily QR passes with leader scanning (offline queue, walk-ins, manual fallback), PWA frontend for GitHub Pages, local mock server, 21 backend tests, Playwright phone walkthrough, CI workflows for Pages and clasp. See volunteer-app/README.md and DESIGN-NOTES.md. |
| 2026-10-14 | 4 | volunteer-app: automatic trainee pairing on confirm (continuity first, then fewest pairings; "Confirm all & pair"), richer trainee card for volunteers (gender, communication, behaviours, things to take note, notes from previous volunteers), Volunteer Guide + projects shown to new volunteers before first booking (leader-editable), volunteer feedback → leader review → Trainee Notes, venue dropdown with MINDS Woodlands Gardens School and add/rename/archive venues, fuzzy search everywhere, volunteers edit their own details and leaders edit anyone (incl. other leaders, deactivate). 37 backend tests; Playwright walkthrough of all new flows. |
