# T4G × MINDS: volunteer management

NTU Tech for Good (Semester 1, AY2026/27) app for **MINDS**, built to replace manual logging of
volunteer hours, attendance and pairing.

**The MINDS Volunteer App** is one web app for phones, tablets and computers:

- **Volunteers** register with MINDS's form, say which sessions they're coming to, see their
  paired trainee, show a QR pass to clock in and out, and send updates (with photos, videos or
  documents) about their trainee.
- **Regulars** (after 10 sessions) can read about any trainee and have fixed trainees.
- **Admins** create sessions, pair volunteers and trainees on a live board (laid out like the
  WERONE outing app), scan passes, add trainees with MINDS's House Visit Form, review notes,
  and manage volunteers, hours, Google Sheets and Google Contacts.

It runs on **Google Apps Script + Google Sheets** (MINDS's own sheets, including the House
Visit form responses), with the web app on GitHub Pages.

**Status: Version 4.7**, tested on the Exp environment with 100 volunteers and 10 admins at once.

| Read this | For |
| --- | --- |
| **[volunteer-app/README.md](volunteer-app/README.md)** | Features, running the demo, setting it up on Google, configuration, speed and load testing, troubleshooting |
| **[User guide](volunteer-app/docs/USER-GUIDE.md)** | How volunteers, regulars and admins use the app, step by step |
| **[VERSION-4.md](VERSION-4.md)** | What Version 4 changed (MINDS's 29 October call, then the speed work) and how to upgrade |
| [Exp setup guide](volunteer-app/docs/EXP-SETUP.md) | Setting up a test environment from scratch, with mock data |
| [TODO.md](TODO.md) | What's still open, and questions for MINDS |

## Quick start

Try the app on your computer with demo data (no Google account needed; Node.js 20 or later):

```bash
git clone https://github.com/vcoder302026/T4G-Sem12627-MINDS-APP.git
cd T4G-Sem12627-MINDS-APP/volunteer-app
npm test         # 131 tests
npm run dev      # → http://localhost:5173
```

| Profile | Email | Password |
| --- | --- | --- |
| Admin | `admin@example.com` | `AdminDemo123` (admin password: `admin-demo-2026`) |
| Regular | `regular@example.com` | `RegularDemo123` |
| Volunteer | `volunteer@example.com` | `VolunteerDemo123` |

Everyone in the demo is fictional.

## Repository layout

```
volunteer-app/        the MINDS Volunteer App
  gas/                backend (Google Apps Script)
  web/                web app (published to GitHub Pages)
  tests/              automated tests (npm test)
  dev/                local demo, layout checks, load test, Exp database generator
  docs/               user guide, Exp setup guide, screenshots
  README.md           features, setup, configuration, development
  DESIGN-NOTES.md     why it's built this way
.github/workflows/    publish the web app and deploy the backend when main changes
prototype-1/          Prototype 1: the team's earlier offline staff app (Node.js, SQLite)
AGENTS.md             rules for changing the app (MINDS's template, consistency, checks)
VERSION-4.md          what Version 4 changed (VERSION-1–3.md, STEVEN-UPDATE.md: earlier)
TODO.md               what's still open
PROGRESS.md           progress log
PLAN.md               Prototype 1's build plan
```

## Version history

| Version | When | Highlights |
| --- | --- | --- |
| [Prototype 1](prototype-1/README.md) | First | Local, offline staff app: attendance, fundraising, outings, trips, house visits |
| [Version 1](VERSION-1.md) | Oct 2026 | The volunteer app on Google Apps Script and Sheets |
| [Version 2](VERSION-2.md), [STEVEN-UPDATE](STEVEN-UPDATE.md) | Oct 2026 (update: 27 Oct) | MINDS's registration form, trainee sheet, pairing, House Visit Form |
| [Version 3](VERSION-3.md) | 28 Oct 2026 | Pairing board like the WERONE outing app, every phone size, warnings, standard projects |
| **[Version 4](VERSION-4.md)** | 29–30 Oct 2026 | Short names, Google Contacts on save, files on notes, one trainee & house visit database, Add trainee with the House Visit Form, the Dashboard, speed and live updates (4.1–4.3), design updates with Lovable (4.4–4.6; 4.7 back to the 4.3 design, keeping All pages, bottom tabs, the shrinkable sidebar and organised information) |

## Working together

- Make changes on a branch and open a pull request into `main`. **Merging to `main` deploys**
  the web app (GitHub Pages) and, with the repository secrets set, the backend (Apps Script).
- Run the tests first: `cd volunteer-app && npm test`, and before merging,
  `node dev/check-deploy.mjs` ("ready to deploy"). For layout changes, also run the
  `dev/check-*.py` scripts (volunteer app README, Part 2, Step 6). The rules for changes are in
  [AGENTS.md](AGENTS.md).
- Use fictional data only. Never commit real volunteer or trainee details, `.clasp.json`,
  `.clasprc.json`, the `APP_SECRET`, or Apps Script URLs and Sheet IDs.
