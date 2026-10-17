# T4G × MINDS: volunteer management

NTU Tech for Good (Semester 1, AY2026/27) prototypes for **MINDS**, built to
replace manual logging of volunteer hours and attendance.

| App | What it is | Stack |
| --- | --- | --- |
| **[Volunteer app](volunteer-app/README.md)** (current) | One app for volunteers and MINDS staff, on phones and computers: registration, a guide for new volunteers, a shared schedule with "I'm coming" sign-ups, new/regular volunteers and trainee pairing, trainee info and updates, QR clock-in/out, feedback. MINDS staff open an **Admin** menu with a shared admin password: sessions and pairing, scanning, the pairing list, volunteers, trainees, attendance, no-shows and hours, fundraising, outings, overseas trips, house visits, settings and an activity log | Google Apps Script + Google Sheets, HTML/JS/Tailwind PWA on GitHub Pages |
| [Prototype 1](docs/prototype-1/README.md) (earlier) | Local, offline staff app: attendance, fundraising, outings, overseas trips and house visits. Its modules now live in the volunteer app's Admin menu | Node.js 24, Express, SQLite |

**New here?** Read [VERSION-1.md](VERSION-1.md): what Version 1 does, how to demo it, and how it works.
Then [the October 2026 changes](volunteer-app/docs/PARTNER-FEEDBACK-OCT-2026.md) made after the partner meeting
(one app with an Admin menu instead of leader accounts and a separate dashboard).

## Quick start

Try the volunteer app on your computer, with demo data and no Google account
needed (Node.js 20 or later):

```bash
git clone https://github.com/vcoder302026/T4G-Sem12627-MINDS-APP.git
cd T4G-Sem12627-MINDS-APP/volunteer-app
npm run dev      # → http://localhost:5173
```

Sign in as MINDS staff (`staff@example.com` / `StaffDemo123`), then **Me → Admin** with the
demo admin password `AdminDemo123`. Volunteers: `volunteer@example.com` (regular) and
`sam@example.com` (new), password `VolunteerDemo123`.

Prototype 1 runs from the repository root: `npm install && npm start` →
<http://localhost:3000> (needs Node.js 24).

## Repository layout

```
volunteer-app/        the volunteer app (backend in gas/, the app in web/, its Admin pages in web/js/admin/)
  README.md           features, setup on Google, configuration, development
  DESIGN-NOTES.md     why it's built this way
  docs/USER-GUIDE.md  how volunteers and MINDS staff use it
.github/workflows/    publish the volunteer app (GitHub Pages) and deploy its backend (clasp)
server/ public/ tests/  Prototype 1 (local staff app)
docs/prototype-1/     Prototype 1 README and usage guide
PLAN.md, AGENTS.md    Prototype 1's build plan and coding-agent rules
PROGRESS.md           progress log for both apps
```

## Working together

- Make changes on a branch and open a pull request into `main`; merging to
  `main` publishes the volunteer app.
- Run the tests first: `cd volunteer-app && npm test` (and `npm test` at the
  root for Prototype 1).
- Use fictional data only. Never commit real volunteer or trainee details,
  `.clasprc.json`, or Apps Script URLs and Sheet IDs from other projects.
