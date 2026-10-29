# Prototype 1: MINDS Admin (local staff app)

> **Prototype 1 (earlier, offline staff app).** The current app is the volunteer app:
> see [volunteer-app/README.md](../volunteer-app/README.md).

> This is the team's first prototype: a local, offline staff app. The current
> volunteer management app is in [`volunteer-app/`](../volunteer-app/README.md).
> Its code is in this folder (`server/`, `public/`, `tests/`); run the commands below from
> `prototype-1/`.
> How to use it: [USAGE-GUIDE.md](USAGE-GUIDE.md). Its build plan: [PLAN.md](../PLAN.md).

A desktop browser application that MINDS staff can clone, install and run locally. One login
and one dashboard provide access to Attendance, Fundraising, Outings, Overseas Trips and
House Visits, plus shared Volunteers and Trainees directories.

This is a deliberately reduced prototype with a real frontend, a real backend (Node.js 24 +
Express 5) and persistent local data (SQLite via Node's built-in `node:sqlite`). It works
fully offline after installation: no Google services, external APIs, CDNs or internet access
are used at runtime.

## Requirements

- Node.js **24.x** (uses the built-in `node:sqlite` module)
- A desktop browser

## Install and run

```bash
git clone https://github.com/vcoder302026/T4G-Sem12627-MINDS-APP.git
cd T4G-Sem12627-MINDS-APP/prototype-1
npm install
npm start
```

Then open <http://localhost:3000>. The server binds to `127.0.0.1` only (not exposed to the
network) and honours a `PORT` environment variable if you need a different port. No `.env`
file or Google credentials are needed.

Development mode with automatic restart: `npm run dev`.

## Demo credentials (local only)

| Username | Password       | Display name       |
| -------- | -------------- | ------------------ |
| `admin`  | `MindsDemo123!` | MINDS Demo Admin   |

These are local demo credentials, created automatically on first startup. All authenticated
users are staff admins with the same permissions; there is no self-service registration,
password reset or user management in this milestone.

## Data location and reset

- All data is stored in `data/minds.sqlite` (created automatically on first startup).
- The first startup seeds one fictional demo dataset (three volunteers, three trainees, one
  attendance session, one fundraiser with two products, one outing, one trip, one house
  visit and the demo login). Seeding happens only once; restarts never duplicate or
  overwrite data.
- To reset the demo data: stop the server and delete the `data` directory (or just
  `data/minds.sqlite`), then start again.
- Every clone has its own database. This prototype does **not** synchronize staff computers.

## What the five modules do

| Module          | Capabilities |
| --------------- | ------------ |
| **Dashboard**   | Counts of all record types, completed volunteer hours, upcoming outings and trips, links to every module and directory |
| **Attendance**  | Create sessions (title/date/venue), manually clock volunteers in and out (replaces QR workflows), per-record and per-volunteer hours summary; open records show as "In progress" and are excluded from totals |
| **Fundraising** | Create fundraisers and products (SGD prices), take multi-item orders — the server calculates totals transactionally from stored product prices — mark orders paid/unpaid and collected/pending, view total and paid sales |
| **Outings**     | Create outings, assign each trainee once to a volunteer (group/bus labels), edit assignments, mark trainees as boarded, see boarded count out of total assigned |
| **Overseas Trips** | Create trips (validated date ranges), register trainees as participants with medical/dietary notes copied from the shared trainee profile at registration (later profile edits do not overwrite trip notes), edit per-trip notes and registration status, manage a logistics checklist and record expenses with a running total |
| **House Visits** | Record visits (trainee, volunteer, date, family/daily-living/social/health observations and follow-up) with append-only history, newest first, filterable by trainee |
| **Directories** | Shared Volunteers and Trainees records (trainees include caregiver, support, medical and dietary details); name changes appear everywhere the record is used |

## Local-only data behaviour

- Money is stored as integer Singapore cents; timestamps are stored as UTC ISO strings and
  displayed in Asia/Singapore time.
- All writes go through server-side validation, prepared SQL statements and transactions.
- Sessions use hashed tokens in an HttpOnly, SameSite=Strict cookie that expires after eight
  hours; passwords are scrypt-hashed with a random salt.
- Only fictional demo data is included. No personal data, credentials or service URLs from
  any existing MINDS system are used.

## Reduced scope (v1)

This prototype intentionally omits: record deletion, editing of attendance timestamps or
submitted orders (status updates only), volunteer-facing registration/booking, Google
Sheets/Apps Script/email/WhatsApp integration, QR scanning, file uploads, online payments,
mobile/PWA support, multi-user synchronisation, user management and deployment tooling. It is
a local demo, not a production system.

## Tests

```bash
npm test
```

Runs integration tests with `node:test` against a temporary isolated database and an
ephemeral port, covering seeding, authentication, session expiry, all five modules'
workflows, validation rules and error responses.
