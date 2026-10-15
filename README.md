# T4G × MINDS: volunteer management

NTU Tech for Good (Semester 1, AY2026/27) prototypes for **MINDS**, built to
replace manual logging of volunteer hours and attendance.

| App | What it is | Stack |
| --- | --- | --- |
| **[Volunteer app](volunteer-app/README.md)** (current) | Phone app for volunteers and volunteer leaders: registration, a guide for new volunteers, session booking, automatic trainee pairing, QR clock-in/out, feedback and trainee notes | Google Apps Script + Google Sheets, HTML/JS/Tailwind PWA on GitHub Pages |
| [Prototype 1](docs/prototype-1/README.md) (earlier) | Local, offline staff app: attendance, fundraising, outings, overseas trips and house visits | Node.js 24, Express, SQLite |

## Quick start

Try the volunteer app on your computer, with demo data and no Google account
needed (Node.js 20 or later):

```bash
git clone https://github.com/vcoder302026/T4G-Sem12627-MINDS-APP.git
cd T4G-Sem12627-MINDS-APP/volunteer-app
npm run dev      # → http://localhost:5173  (leader@example.com / LeaderDemo123)
```

Prototype 1 runs from the repository root: `npm install && npm start` →
<http://localhost:3000> (needs Node.js 24).

## Repository layout

```
volunteer-app/        the volunteer app (backend in gas/, phone app in web/)
  README.md           features, setup on Google, configuration, development
  DESIGN-NOTES.md     why it's built this way
  docs/USER-GUIDE.md  how volunteers and leaders use it
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
