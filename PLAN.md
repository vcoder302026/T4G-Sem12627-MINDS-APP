# MINDS Admin: first prototype implementation plan

> **Prototype 1 only.** This is the build plan for the Node.js staff app in `prototype-1/`.
> The current app is the volunteer app: see [volunteer-app/README.md](volunteer-app/README.md).

## 1. Goal and fixed decisions

Build a desktop browser application that MINDS staff can clone, install, and run locally. It must have a real frontend, a real backend, and persistent local data. One login and one dashboard provide access to Attendance, Fundraising, Outings, Overseas Trips, and House Visits, plus shared Volunteers and Trainees directories.

This is a deliberately reduced prototype of the existing applications. Implement the workflows explicitly listed below; do not attempt feature parity with the source repositories. A screen containing only placeholder cards or links to the old applications does not satisfy this plan.

Fixed architecture:

- Use Node.js 24.x, Express 5, JavaScript ES modules, and Node's built-in `node:sqlite` DatabaseSync. No ORM.
- Use plain HTML, CSS, and browser JavaScript modules. No React, build pipeline, CDN libraries, or external fonts.
- Serve the frontend and /api routes from one Express process and one origin.
- Store data in `data/minds.sqlite`; create the directory/database automatically on first startup.
- Bind to 127.0.0.1 by default, port 3000; allow PORT configuration. Do not expose the server to the network by default.
- Use local demo data only. No Google Apps Script, Google Sheets, Gemini, email, WhatsApp, cloud storage, or external API calls.
- No mobile-specific work, PWA, service worker, QR scanning, file uploads, online payment processing, or automatic deployment.
- Every clone has its own database. This prototype does not synchronize staff computers.
- All authenticated users are staff admins with the same permissions. Volunteer-facing registration and bookings are excluded.

Expected commands after implementation:

```bash
git clone <actual-repository-url>
cd T4G-Sem12627-MINDS-APP
npm install
npm start
```

Open http://localhost:3000. The implementation README must use the actual repository URL if a Git remote supplies one; otherwise label the URL as a placeholder. Commit package-lock.json. Require no environment file or Google credentials to launch.

These decisions follow the agreed local prototype direction. The user has not requested migration of existing records or full reproduction of every old feature.

## 2. Source references and repository structure

Existing references are sibling folders available during development:

| Reference | What to consult |
| --- | --- |
| ../CSL-Attendance-Exp | src/App.tsx and src/AttendanceHoursSummary.tsx for attendance and hours workflows |
| ../Canvassing_GIAS | frontend/js/app.js for products, orders, paid/collected status |
| ../MYG-Outing-Exp | pairing.html, grouping.html, tracker.html and frontend/js for outing assignments and boarding |
| ../Overseas-Trip-Planner-Exp | registration, participant, medical, diet, finance and logistics screens |
| ../Trainee-House-Visit | app.js and index.html for visit fields and history |
| ../deploy/deploy | index.html for shared login/member/session ideas |
| ../backend/backend | Code (2).gs for account, trainee and attendance concepts |

Use these as read-only references. Copy small useful pieces only when adapting them to this plan. Do not copy whole repositories, .git directories, deployed URLs, cached records, real personal information, old credentials, logs, or old Google backends. Sibling folders must not be required to run the finished app.

Suggested structure (use it unless a minor local adjustment is necessary):

```text
package.json
package-lock.json
README.md
PLAN.md
AGENTS.md
.gitignore
server/
  index.js          # Express setup, static serving, shutdown
  db.js             # connection, schema creation, demo seeding
  auth.js           # passwords, sessions, authentication middleware
  validation.js     # common validation and HTTP errors
  routes/
    auth.js
    directory.js
    dashboard.js
    attendance.js
    fundraising.js
    outings.js
    trips.js
    visits.js
public/
  index.html
  styles.css
  js/
    app.js          # routing, authenticated shell
    api.js          # fetch wrapper, errors, session expiration
    ui.js           # safe DOM helpers, notices, formatting
    modules/
      directory.js
      dashboard.js
      attendance.js
      fundraising.js
      outings.js
      trips.js
      visits.js
tests/
  prototype.test.js
data/               # ignored; created at runtime
```

Keep package scripts to `start: node server/index.js`, `dev: node --watch server/index.js`, and `test: node --test`. Express is the only required runtime package. Use Node crypto for password hashes and session tokens, Node test/assert for automated tests.

## 3. Data model and behavior rules

Use integer primary keys for domain records, foreign keys with PRAGMA foreign_keys=ON, prepared SQL statements, and transactions for multi-record writes. Use snake_case in SQLite and camelCase in JSON. Store instants as UTC ISO strings and calendar dates as YYYY-MM-DD. Display timestamps in Asia/Singapore. Money is integer Singapore cents; never use floating-point currency in stored calculations.

Create the schema automatically with CREATE TABLE IF NOT EXISTS. This is schema version 1: no legacy import or migration system is needed. Add NOT NULL, UNIQUE, CHECK and foreign key constraints matching the rules below.

Tables and fields (id is INTEGER PRIMARY KEY in each domain table):

- users: id, username UNIQUE, password_hash, password_salt, name, created_at.
- auth_sessions: token_hash TEXT PRIMARY KEY, user_id FK users, expires_at.
- volunteers: id, name, email, phone, created_at. Name required; email/phone optional.
- trainees: id, name, caregiver_name, caregiver_phone, support_needs, medical_notes, dietary_notes, created_at. Name required; remaining text fields default to empty strings.
- attendance_sessions: id, title, date, venue, created_at. Title/date required; venue defaults to empty.
- attendance_records: id, session_id FK attendance_sessions, volunteer_id FK volunteers, clock_in, clock_out nullable. UNIQUE(session_id, volunteer_id).
- fundraisers: id, name, date, created_at. Name/date required.
- products: id, fundraiser_id FK fundraisers, name, price_cents. Name required; price_cents >= 0.
- orders: id, fundraiser_id FK fundraisers, customer_name, customer_contact, total_cents, payment_status ('unpaid' or 'paid'), collection_status ('pending' or 'collected'), created_at.
- order_items: id, order_id FK orders, product_id FK products, product_name, quantity, unit_price_cents. Quantity integer >= 1; product_name and unit_price_cents snapshot product values at order creation.
- outings: id, title, date, venue, notes, created_at. Title/date required.
- outing_assignments: id, outing_id FK outings, trainee_id FK trainees, volunteer_id FK volunteers, group_name, bus_name, boarded INTEGER 0/1. UNIQUE(outing_id, trainee_id). Group/bus labels default to empty.
- trips: id, title, destination, start_date, end_date, notes, created_at. Title/destination/dates required; end_date >= start_date.
- trip_participants: id, trip_id FK trips, trainee_id FK trainees, volunteer_id FK volunteers nullable, registration_status ('pending' or 'confirmed'), medical_notes, dietary_notes. UNIQUE(trip_id, trainee_id).
- trip_logistics: id, trip_id FK trips, description, status ('pending' or 'done'). Description required.
- trip_expenses: id, trip_id FK trips, description, amount_cents. Description required; amount_cents >= 0.
- house_visits: id, trainee_id FK trainees, volunteer_id FK volunteers, visit_date, family_notes, daily_living_notes, social_notes, health_notes, follow_up, created_at. Date required; text observations default to empty.

No delete functionality in v1. This prevents accidental record removal and unnecessary cascading policies. No editing attendance timestamps or submitted orders in v1; status updates are supported as specified below.

Rules that must be enforced on the server:

- Trim required strings and reject blank strings. Limit names/titles/labels to 200 characters and observation/notes fields to 5000 characters.
- Reject invalid calendar dates, invalid enums, non-integer IDs/counts/cents, negative money, and missing referenced records. IDs must be positive.
- Optional text fields accept empty strings. A nullable volunteer assignment accepts null.
- Never trust a client-supplied order total or product price. Calculate total from stored products and requested quantities in one transaction. Every product must belong to the order's fundraiser. Require at least one item; reject duplicate product IDs in one order.
- Clock in uses server time and creates one record. Repeat clock-in returns 409. Clock out uses server time on the existing open record. Missing record returns 404; repeat clock-out returns 409. Hours are calculated from timestamps; do not store a second hours value. Exclude open records from served-hours totals and display them as "In progress".
- An outing may assign a volunteer to multiple trainees. Each trainee appears once per outing. An assignment is the complete attendance roster for this reduced workflow; "boarded" is a manual checkbox, not location tracking.
- Each trainee appears once per trip. On adding a participant, copy the trainee's medical/dietary notes into that trip participant. Later trip note edits do not overwrite the shared trainee profile.
- Changes to a shared volunteer/trainee name appear everywhere using that record ID.
- House visit history is append-only; show newest visit date first, then newest ID for ties.

### Authentication

On first initialization create demo user username `admin`, password `MindsDemo123!`, display name `MINDS Demo Admin`. Label these as local demo credentials in the login screen and README.

Hash passwords with Node crypto.scrypt and a random salt. Do not store plaintext passwords. Login creates a random 32-byte token, stores only its SHA-256 hash in auth_sessions, and sets a HttpOnly, SameSite=Strict, Path=/ cookie with an eight-hour expiration. Secure cookie is not required for localhost HTTP. Compare derived password bytes with timingSafeEqual. Logout deletes the session and clears the cookie. Expired sessions return 401.

Protect every /api route except login and health. Verify Origin on mutating API requests when supplied: accept only the request's own origin, reject others with 403. Do not enable CORS. No self-service registration, password reset, role editor or user management in this milestone. This login implementation is sufficient for the local demo scope; do not claim production readiness.

### Initialization and demo data

Seed only an empty database, in a transaction; never reseed or overwrite data on restart. Create:
- Three fictional volunteers and three fictional trainees. Use example.com for optional emails and invented contact details.
- One attendance session dated today in Singapore, with no clock records.
- One fundraiser, two products priced SGD 5.00 and SGD 10.00, no orders.
- One outing dated today, with one trainee/volunteer assignment.
- One trip starting seven days from today and ending ten days from today, one participant and one pending logistics item.
- One house visit from yesterday.

Use fixed fictional names such as Demo Volunteer A and Demo Trainee A. Derive sample dates at initial seed time. Login account creation must be part of the same seed transaction. README may explain resetting demo data by stopping the server and removing the local database; do not add an automatic destructive reset command.

## 4. API contract

All routes are under /api. Successful JSON is `{data: ...}`; error JSON is `{error: {code, message}}`. List responses put arrays in data; create responses return the new record with HTTP 201; updates return the updated record with HTTP 200. Login/logout use HTTP 200. No pagination for this small demo.

Codes: 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_ERROR. Return helpful messages without stack traces, SQL details, session tokens or password values. Log unexpected errors on the server. Unknown /api routes return JSON 404.

Routes and request bodies:

| Method and route | Body / response requirements |
| --- | --- |
| GET /health | Public; data: {status:"ok"} |
| POST /auth/login | {username,password}; data: {id,username,name}; sets cookie |
| GET /auth/me | Current user: {id,username,name} |
| POST /auth/logout | Empty body; data: {loggedOut:true}; clears cookie |
| GET /dashboard | Counts of volunteers, trainees, attendance sessions, fundraisers, outings, trips and visits; completed volunteer hours; upcoming outings/trips |
| GET, POST /volunteers | List; create {name,email,phone} |
| PATCH /volunteers/:id | Partial name/email/phone update |
| GET, POST /trainees | List; create {name,caregiverName,caregiverPhone,supportNeeds,medicalNotes,dietaryNotes} |
| PATCH /trainees/:id | Partial update of the above fields |
| GET, POST /attendance/sessions | List; create {title,date,venue} |
| GET /attendance/sessions/:id | Session, records joined with volunteerName and calculated hours |
| POST /attendance/sessions/:id/clock-in | {volunteerId} |
| POST /attendance/sessions/:id/clock-out | {volunteerId} |
| GET /attendance/summary | Per-volunteer completed hours and completed session count; include zero-hour volunteers |
| GET, POST /fundraisers | List; create {name,date} |
| GET /fundraisers/:id | Fundraiser, products, orders with items, total sales cents and paid sales cents |
| POST /fundraisers/:id/products | {name,priceCents} |
| POST /fundraisers/:id/orders | {customerName,customerContact,items:[{productId,quantity}]} |
| PATCH /orders/:id | Partial {paymentStatus,collectionStatus} |
| GET, POST /outings | List; create {title,date,venue,notes} |
| GET /outings/:id | Outing and assignments with joined traineeName/volunteerName |
| POST /outings/:id/assignments | {traineeId,volunteerId,groupName,busName}; boarded starts false |
| PATCH /outing-assignments/:id | Partial {volunteerId,groupName,busName,boarded}; boarded is a JSON boolean |
| GET, POST /trips | List; create {title,destination,startDate,endDate,notes} |
| GET /trips/:id | Trip, participants with joined names, logistics, expenses, totalExpenseCents |
| POST /trips/:id/participants | {traineeId,volunteerId}; volunteerId may be null; starts pending |
| PATCH /trip-participants/:id | Partial {volunteerId,registrationStatus,medicalNotes,dietaryNotes} |
| POST /trips/:id/logistics | {description}; starts pending |
| PATCH /trip-logistics/:id | {status} |
| POST /trips/:id/expenses | {description,amountCents} |
| GET /visits | Optional traineeId query; joined traineeName and volunteerName |
| POST /visits | {traineeId,volunteerId,visitDate,familyNotes,dailyLivingNotes,socialNotes,healthNotes,followUp} |

Detail responses are objects with named collections: attendance {session,records}; fundraising {fundraiser,products,orders,totalSalesCents,paidSalesCents}; outing {outing,assignments}; trip {trip,participants,logistics,expenses,totalExpenseCents}. Other domain responses use the camelCase fields defined above. Attendance summary rows: {volunteerId,volunteerName,completedSessions,hours}. Round displayed/returned hours to two decimals after summing unrounded durations.

Dashboard upcoming entries are outings with date >= today and trips with startDate >= today, sorted ascending, at most five of each. Dashboard completed hours sums all completed attendance durations.

PATCH rejects unknown fields and empty updates. Other writes reject unknown fields too. For PATCH, omitted fields remain unchanged. Lists sort by name for directories, date descending for visits and attendance/fundraisers, and start/date ascending for trips/outings. Map SQLite uniqueness violations to 409 and foreign key errors to useful validation errors.

## 5. Frontend screens and exact prototype workflows

Use hash routing: #/dashboard, #/volunteers, #/trainees, #/attendance, #/fundraising, #/outings, #/trips, #/visits. Detail pages use #/attendance/:id, #/fundraising/:id, #/outings/:id, #/trips/:id. Unknown hashes redirect to dashboard. Refresh/deep-link must work through the same index.html.

A desktop shell has a left navigation sidebar, a content area, logged-in name and Logout. Dashboard shows five module cards, directory links, count cards and upcoming items. Use readable tables, labelled inputs, simple inline forms and save notices. No drag-and-drop or custom modal framework is needed.

Shared frontend behavior:
- On page load call /auth/me. Show login on 401; otherwise render the requested route.
- The API wrapper uses same-origin cookies and JSON. Any later 401 clears the displayed session and returns to login.
- Disable the submitting button while a request is running. Show loading, empty and error states. Keep entered form values on failed saves; refresh displayed data after successful saves.
- Render stored text using textContent or equivalent safe DOM APIs. Never interpolate user notes/names into innerHTML. Fixed static markup is allowed.
- Use a single SGD money formatter and Singapore timestamp formatter. Convert user currency inputs to exact integer cents; validate at most two decimal places.
- Use proper labels, semantic buttons, table headers, visible keyboard focus, and native date inputs.
- No browser localStorage as the authoritative database or authentication source.

Required screens:

1. Volunteers and Trainees: searchable tables (client-side name/email or name/caregiver search), add forms and edit forms. Trainee forms include caregiver, support, medical and dietary notes. Dropdowns in modules use these shared records.
2. Attendance: list/create sessions, open a session, choose volunteer and clock in; table shows in/out times and completed hours, with Clock out on open rows. Show hours summary on the attendance landing page. Manual attendance is the desktop replacement for QR workflows.
3. Fundraising: list/create fundraisers; detail has product list/add form, order creation with customer fields and one or more product/quantity rows, computed preview total, and order table. Preview is informational; backend calculates the final total. Let staff mark orders paid/unpaid and collected/pending. Show total and paid sales.
4. Outings: list/create outings; detail has trainee/volunteer assignment form and table with group, bus and boarded fields. Existing rows can change volunteer, group, bus and boarded status. Show boarded count out of total assigned trainees.
5. Overseas Trips: list/create trips; detail has participant registration/assignment table, editable per-trip medical/dietary notes and pending/confirmed status, logistics checklist, expense entry form and total expenses. These are all sections on one detail page.
6. House Visits: trainee filter, visit history with readable full observation details, and add form selecting trainee/volunteer/date and observations. The supported fields are family circumstances, daily living, social skills, health and follow-up. Editing old visits is excluded.

The app must work without internet after dependencies have been installed.

## 6. Implementation sequence

Complete each phase before starting the next. Keep the app runnable throughout.

1. Scaffold package, ignore data/node_modules/.env/logs, create Express entry point, static frontend and health route. README documents Node 24 and startup.
2. Implement database schema, transactional first-run demo seed, auth and shared API/error helpers. Make login, session restoration and logout work.
3. Implement Volunteers and Trainees backend and screens. Verify shared records save and reload.
4. Implement Attendance routes/screens including clock lifecycle and hours summary.
5. Implement Fundraising routes/screens including transactionally created order items and backend totals.
6. Implement Outings routes/screens including assignment editing and boarding.
7. Implement Trips routes/screens including participant notes, logistics and expenses.
8. Implement House Visits routes/screens and trainee history filter.
9. Implement dashboard aggregation, polish consistent navigation/error/empty/loading states and complete README.
10. Add/run the meaningful tests below and perform the manual walkthrough. Report completed workflows, test results and any remaining limitations.

Do not publish, push, deploy or connect to existing live applications as part of implementation unless the user subsequently requests it. No fallback to Google APIs when local functionality is incomplete. Do not silently drop a required module: report a concrete blocker if one occurs.

## 7. Verification and acceptance

The user requested a working prototype. The later implementation should include these checks. This planning task itself does not run implementation tests.

Automated integration tests using node:test:
- Start the app with a temporary isolated database and an ephemeral localhost port. Expose a createApp({databasePath}) factory and a separate startup path so importing it does not start a server.
- First launch creates schema/demo records; a second initialization preserves counts and user changes.
- Successful/failed login; protected route without cookie; auth/me; expired session; logout invalidates the cookie.
- Directory create/update and invalid required fields.
- Clock-in, duplicate rejection, clock-out, repeat rejection and summary ignoring open records. For exact duration assertions, modify only the temporary test database timestamp to a known time; avoid sleeps.
- Order with both sample products has the correct server total; reject mismatched fundraiser products, duplicate item IDs, bad quantities and negative prices. Status updates persist.
- Outing duplicate trainee rejected; edit group/bus and boarded flag persists.
- Trip invalid date range rejected; participant uniqueness, note snapshot and independence from later shared profile updates; logistics and expense totals.
- Visit creation and trainee filtering; missing foreign references rejected.
- Unexpected API route returns JSON 404, unauthenticated mutations return 401, mismatched Origin returns 403.
- Close server/database and remove temporary test artifacts at the end.

Manual browser walkthrough:
1. Fresh install/start shows demo login; sign in and open every navigation item.
2. Add a volunteer and trainee; verify they appear in all relevant dropdowns.
3. Create attendance session, clock in/out, see hours summary.
4. Create fundraiser/product/order, mark paid and collected, see correct totals.
5. Create outing, assign trainee/volunteer, change group/bus and mark boarded.
6. Create trip, add trainee/volunteer, edit medical/diet notes, confirm registration, complete a logistics task and add an expense.
7. Record a house visit, filter by trainee and read saved observations.
8. Refresh a detail page; log out/back in; stop/restart the server. Data persists and the demo seed is not duplicated.
9. Try invalid forms and unavailable backend; errors are visible and unsaved inputs remain.
10. Confirm UI does not load external scripts/fonts and modules do not call Google services.

Definition of done: all above workflows function in one independently runnable repository; npm test passes; README includes startup, demo credentials, data location/reset instructions, five module capabilities, local-only data behavior and reduced scope. No placeholder module is accepted.
