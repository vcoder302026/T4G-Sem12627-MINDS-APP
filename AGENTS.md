# Implementation instructions

This repository has two apps. **For the volunteer app (`volunteer-app/`, the current app), the
rules are in the [Volunteer app](#volunteer-app-volunteer-app-stay-consistent-with-mindss-other-apps)
section below**, and its documentation is `volunteer-app/README.md`, `volunteer-app/docs/USER-GUIDE.md`
and `VERSION-4.md`. The first sections apply only to **Prototype 1** (the Node.js staff app in
`prototype-1/`).

## Prototype 1: objective and source of truth
Implement the first local MINDS staff prototype described in PLAN.md. Read the entire plan before editing. PLAN.md defines architecture, workflows, database rules, routes and acceptance criteria. If this file conflicts with it, follow PLAN.md. Later explicit user instructions take precedence.

## Prototype 1: working rules
- Work inside this repository. Sibling repositories are read-only references; the delivered app must run without them.
- Implement all five modules and the shared directories using the reduced workflows in PLAN.md. Do not equate dashboard links or mock UI with working backend functionality.
- Use Node.js 24, Express 5, built-in node:sqlite and plain browser JavaScript. Do not introduce a framework, ORM, external API or build system.
- Implement in the plan's phase order. Do not replace real database writes with browser storage, hardcoded success responses or disappearing in-memory records.
- Preserve demo data on restart. Store only fictional sample records. Never copy cached personal data, credentials, deployed service URLs or .git folders from reference projects.
- Use server-side validation, prepared SQL, transactions and protected API routes. Render user text safely. Keep password/session secrets out of responses and logs.
- If a reference implementation behaves differently, follow the prototype contract in PLAN.md. Do not infer missing features from repository names.
- Resolve ordinary implementation details consistently with the plan. Ask only when a genuine blocker or material requirement conflict prevents progress.
- Keep changes focused. No deployment, git push, live Google access, mobile work or production-readiness claims.
- Do not create sub-agents unless the user explicitly requests them.

## Prototype 1: validation and reporting
Run the tests and browser walkthrough required by PLAN.md during implementation. If a browser tool is unavailable, complete feasible automated checks and explicitly identify the manual checks still unperformed; do not claim them as passed.
Finish with a concise report of implemented workflows, startup commands, demo credentials, validation results and remaining limitations. Keep README accurate to the final app.

## Volunteer app (`volunteer-app/`): stay consistent with MINDS's other apps

Always keep the design and functions similar to MINDS's existing apps (read-only references):

- Trainee House Visit: https://github.com/vcoder302026/Trainee-House-Visit
- CSL Attendance: https://github.com/vcoder302026/CSL-Attendance-Exp
- Overseas Trip Planner: https://github.com/vcoder302026/Overseas-Trip-Planner-Exp

Before adding or changing a screen, check how these apps do the same thing and follow them.
Patterns already shared (keep them; reuse the helpers rather than writing new ones):

| Pattern | Reference app | In the volunteer app |
| --- | --- | --- |
| Sticky header: environment banner (purple "Experimentation" for Exp, red "Testing" for Dev), ↻ update app, 🌗 dark mode | All three | `web/index.html`, `web/js/app.js` |
| Indigo primary (#4F46E5), green secondary; gray-50 / black backgrounds; Tailwind; dark mode by class | House Visit | `web/src/input.css` |
| Coloured, collapsible section headers (uppercase), guide text under questions | House Visit | `ui.js` `section`, `hvSections` |
| Dates: the browser's own calendar (as in the outing app; MINDS chose it over the House Visit "Rolodex" wheel) | MYG Outing | plain `<input type="date">` |
| Time wheel (HH · MM); dropdowns as the app's own list right below the box (above it when there's no room), same width, ✓ on the current choice, search for long lists; never the browser's own pop-ups | MINDS template (Rolodex) | `web/js/controls.js` (every `<input type="time">` and `<select>`, automatically) |
| Show / hide eye on password boxes | House Visit, Overseas | `ui.js` `field()`; `controls.js` for any other password box |
| Fixed bottom action bar for the main button | House Visit | `.action-bar` |
| Phones and tablets: main tabs in a bar fixed to the bottom; action bars sit just above it, and `scroll-padding-bottom` keeps anything scrolled into view clear of it. Computers: sidebar that can shrink to icons | Design update (Lovable, v4.4) | `web/src/input.css` (end), `app.js` |
| Top-centre toasts, green / red | House Visit | `ui.js` `toast` |
| Pairing exactly like the WERONE outing app's Manual Pair page: two searches, green VOLUNTEERS / blue TRAINEES headers with one ALL ↔ PAIRED button each, plain cards (name, +Trn / +Vol, profile label and project underneath, dashed box with ✕ pills or "Drop … here"), pulsing "N Unpaired", "Saved / Saving…", quick-pair pop-up; no groupings | MYG Outing (Overseas pairing page) | `web/js/views/pairing.js`, `dnd.js`, `quickview.js` |
| Search boxes with a clear (✕) button | Overseas | `ui.js` `searchBox` |
| Camera QR scanning, choose-mode style admin layout, "Update app" | CSL Attendance | `web/js/qr.js`, `views/leader.js` |
| Google Apps Script backend; Prod / Dev / Exp; GitHub Actions + clasp deploy keeping the same Web App URL | All three | `volunteer-app/gas/`, `.github/workflows/` |

### MINDS's web app template ("Template Prompts for Creating WebApps")

MINDS keeps a template for all its web apps (Google Doc "Template Prompts for Creating WebApps",
in the Team 39 Tech for Good x MINDS Drive). Follow it for new work. Where this app follows it, and
where it differs on purpose:

| Template rule | In this app |
| --- | --- |
| Installable PWA, desktop and mobile, Tailwind, modern minimalist UI for non-technical users | Yes |
| 🌗 dark/light toggle top right; dark mode black-based, not blue | Yes |
| Update App icon that animates, beside 🌗, clears non-user caches; reload does the same | Yes (↻; the service worker cache is re-versioned on every deploy) |
| Header: refresh · 🌗 · home (back arrow and page title on the left); logout at the far right when there's a login | Yes (↻ · 🌗 · 🏠 · sign out). On phones under 480 px 🏠 is hidden, because Home is in the tab bar (at the bottom of the screen on phones and tablets) |
| Dev = red "Testing" bar, Exp = purple "Experimentation" bar, Prod = none | Yes |
| GAS backend, Execute as Me, Anyone (anonymous); data in Sheets and Drive | Yes |
| GitHub Pages frontend; GitHub Actions + clasp deploy keeping the same Web App URL; secrets `CLASPRC_JSON`, `GAS_SCRIPT_ID`, `GAS_DEPLOYMENT_ID` | Yes (`.github/workflows/volunteer-app-gas.yml`, same credential conversion) |
| Google permission prompts instead of "failed to fetch" | Yes: a clear message and a link to Google's permission page (`web/js/api.js`) |
| Fuzzy search everywhere | Yes (`ui.js` `fuzzyFilter`) |
| ← goes back to the page the person came from (history depth in `app.js`); only a page opened fresh falls back to its "up" link | Yes |
| Header: ← back + page title left; square ↻ · 🌗 · 🏠 (· sign out) right | Yes (`web/index.html`, `app.js` `syncHeaderTitle`) |
| Dashboard layout: action cards left (big primary button, select + coloured outlined buttons), list of upcoming items right with a compact table and icon buttons | Admin home (`views/admin.js` `renderAdminHub`), modelled on the Comm Dashboard |
| Never cover the page with an invisible layer (dropdowns close on a tap elsewhere without blocking it) | `web/js/controls.js` |
| Nothing may stay on top of the page after it changes (sheets, wheels, pop-ups, a dragged card): `app.js` clears them on every page change | `python3 volunteer-app/dev/check-scroll.py`: every tall page scrolls with a swipe, and nothing is left over after Back |
| No squashed text on phones or tablets: a row of text + badges / buttons wraps (the text keeps ~11rem), status badges go above titles, long header titles use 2 lines (3 on the narrowest), label/value lines let long values drop below, third columns move under the text | `python3 volunteer-app/dev/check-squash.py` (280–1024 px) must print "nothing squashed" |
| Profile labels everywhere as on the Volunteers page: Admin (purple), Regular (green), Volunteer (indigo), via `typeBadges()` in `ui.js`; never "new / ad hoc" | Yes |
| Number tiles: the line under a number is only for another figure ("97 without a regular"), never an explanation | `web/admin/js/kit.js` `stat()` |
| Design: Version 4.3's look, plus only the four kept features (All pages, bottom tabs on phones and tablets, shrinkable sidebar, organised information). New design changes go in `src/input.css` by name, not in layers that override each other; matching things look the same (both pairing headings left-aligned, every grouped details list left-aligned) | `VERSION-4.md` §11 |
| Before merging into `main` (it deploys): `node volunteer-app/dev/check-deploy.mjs` must print "ready to deploy" (deploy workflows' needs, styles, `.gs` syntax, tests) | `volunteer-app/dev/check-deploy.mjs` |
| Nothing sticks out, short labels don't break, date boxes are labelled: `python3 dev/check-fit.py` (also looks inside the pairing board, which `check-squash.py` skips). iPhone Safari: date boxes get their own minimum width and are blank when empty, so keep `input[type=date]` at `max-width: 100%` and give each a visible label | `volunteer-app/dev/check-fit.py` |
| Works on every phone: check 280 px (Galaxy Fold folded) to 430 px (iPhone Pro Max) and phones held sideways | `python3 volunteer-app/dev/check-phones.py` must print "all clean"; keep inputs at 16 px text (no iPhone zoom), leave room for notches (`safe-area-inset-*`), and keep only the header and tab bar pinned |
| Keep text short: no explanation lines under titles, no hint text under options or obvious fields; admins know the workflow | Yes. Only add text that carries information, gives a format, or prevents a mistake (and keep it to a few words) |
| Warnings before major actions | Short: "Warning: You are <action>. Do you wish to continue?" (`ui.js` `majorActionPrompt`) |
| Linking Google Sheets from the app (create new, search Drive, paste URL; verify tabs) | Yes, as in CSL Attendance's "Manage Google Sheet": Admin → Settings → Google Sheets (`gas/DataSources.gs`) |
| Advanced Settings page for one-time setup/migration, with a data-loss warning, inside the admin area | Yes: Admin → Settings → Advanced settings (`gas/Maintenance.gs`). **Add future one-time jobs there.** |
| Show/hide eye on every password field; Enter submits; wrong-password message near the field | Yes |
| Passwords in Script Properties | The shared admin password, yes (hashed). Volunteer passwords are per person, hashed in the hidden `_Auth` tab |
| Skeletons over spinners | Yes (`ui.js` `loading`) |
| Rolodex picker; drag-and-drop engine (touch + mouse) | Yes for times (HH · MM wheel, `web/js/controls.js`); dates use the browser's calendar, as MINDS chose. Drag and drop: `web/js/dnd.js` |
| Delta payloads (send only changed fields); `LockService` on every write | Yes |
| **Differences, on purpose** | |
| Multi-page app (one .html per area) | One page with hash routes (`#/sessions`); the phone's Back button still works. A rewrite into pages would be large; revisit if MINDS asks |
| One backend file `Code.gs`; folders `/frontend`, `/backend`; environment only in `backend/config.js` | `volunteer-app/gas/*.gs` (several files, pushed together by clasp), `volunteer-app/web/`; environment from the GitHub variable `APP_ENVIRONMENT` and script properties |
| Default passwords `P@ssw0rd` | Not used: `setup()` generates a random admin password (safer for personal data) |
| CacheService write-through caching, polling with stale-payload rejection | Not yet: worth adding if many admins use the pairing board at once |
| One-click code backup to a Google Doc | Not yet (see TODO.md) |

If a request conflicts with these apps, follow the request and note the difference in
`volunteer-app/DESIGN-NOTES.md`.
