# T4G × MINDS: volunteer management

NTU Tech for Good (Semester 1, AY2026/27) prototypes for **MINDS**, built to
replace manual logging of volunteer hours and attendance.

| App | What it is | Stack |
| --- | --- | --- |
| **[Volunteer app](volunteer-app/README.md)** (current, **Version 4**) | One app for phones, tablets and computers. Volunteers register with MINDS's form, say which sessions they're coming to, see their paired trainee and show a QR pass; regulars can read about any trainee; admins get an Admin menu for sessions, pairing (laid out like the WERONE outing app), scanning, volunteers, trainees, house visits (MINDS's House Visit Form), attendance, hours, Google Sheets and an activity log | Google Apps Script + Google Sheets, HTML/JS/Tailwind PWA on GitHub Pages |
| [Prototype 1](docs/prototype-1/README.md) (earlier) | Local, offline staff app: attendance, fundraising, outings, overseas trips and house visits | Node.js 24, Express, SQLite |

**New here?** Start with the [volunteer app README](volunteer-app/README.md) (features, demo,
setup on Google) and the [user guide](volunteer-app/docs/USER-GUIDE.md) (how volunteers,
regulars and admins use it). **[VERSION-4.md](VERSION-4.md)** explains what Version 4 changed
and how to upgrade ([VERSION-3.md](VERSION-3.md) for Version 3); [TODO.md](TODO.md) lists what's still open.

Earlier versions, kept for the record: [VERSION-1.md](VERSION-1.md),
[VERSION-2.md](VERSION-2.md) (after the October meeting with MINDS) and
[STEVEN-UPDATE.md](STEVEN-UPDATE.md) (after Mr Sadil's feedback on Version 2).

## Quick start

Try the app on your computer, with demo data and no Google account needed
(Node.js 20 or later):

```bash
git clone https://github.com/vcoder302026/T4G-Sem12627-MINDS-APP.git
cd T4G-Sem12627-MINDS-APP/volunteer-app
npm run dev      # → http://localhost:5173
```

| Profile | Email | Password |
| --- | --- | --- |
| Admin | `admin@example.com` | `AdminDemo123` (admin password: `admin-demo-2026`) |
| Regular | `regular@example.com` | `RegularDemo123` |
| Volunteer | `volunteer@example.com` | `VolunteerDemo123` |

Prototype 1 runs from the repository root: `npm install && npm start` →
<http://localhost:3000> (needs Node.js 24).

## Repository layout

```
volunteer-app/        the volunteer app (backend in gas/, web app in web/)
  README.md           features, setup on Google, configuration, development
  DESIGN-NOTES.md     why it's built this way
  docs/USER-GUIDE.md  how volunteers, regulars and admins use it
  dev/                local demo server, and phone / tablet layout checks (check-*.py)
.github/workflows/    publish the volunteer app (GitHub Pages) and deploy its backend (clasp)
server/ public/ tests/  Prototype 1 (local staff app)
docs/prototype-1/     Prototype 1 README and usage guide
AGENTS.md             rules for anyone (or any coding agent) changing the app: MINDS's
                      template, consistency with MINDS's other apps, layout checks
PLAN.md               Prototype 1's build plan
PROGRESS.md           progress log for both apps
VERSION-3.md          what Version 3 changed; VERSION-1/2.md and STEVEN-UPDATE.md: earlier
TODO.md               what's still open
```

## Working together

- Make changes on a branch and open a pull request into `main`; merging to
  `main` publishes the volunteer app.
- Run the tests first: `cd volunteer-app && npm test` (and `npm test` at the
  root for Prototype 1). For layout changes, also run the `dev/check-*.py` scripts
  (see the volunteer app README, Part 2, Step 6).
- Use fictional data only. Never commit real volunteer or trainee details, payment
  screenshots, `.clasprc.json`, or Apps Script URLs and Sheet IDs.
