# T4G × MINDS: volunteer management

NTU Tech for Good (Semester 1, AY2026/27) prototypes for **MINDS**, built to
replace manual logging of volunteer hours and attendance.

| App | What it is | Stack |
| --- | --- | --- |
| **[Volunteer app](volunteer-app/README.md)** (current) | Phone app for volunteers and volunteer leaders: registration, a guide for new volunteers, session booking, automatic trainee pairing, QR clock-in/out, feedback and trainee notes | Google Apps Script + Google Sheets, HTML/JS/Tailwind PWA on GitHub Pages |
| [Prototype 1](docs/prototype-1/README.md) (earlier) | Local, offline staff app: attendance, fundraising, outings, overseas trips and house visits | Node.js 24, Express, SQLite |

---

## Before you start

You need two things installed:

| Tool | Check it with | Version needed | Get it |
| --- | --- | --- | --- |
| Git | `git --version` | any | Mac: run `xcode-select --install`. Windows: [git-scm.com](https://git-scm.com) |
| Node.js | `node -v` | **20+** for the volunteer app, **24+** for Prototype 1 | [nodejs.org](https://nodejs.org) (pick the LTS installer) |

On a Mac, run the commands below in **Terminal** (Cmd+Space, then type "Terminal").
On Windows, use **PowerShell** or **Git Bash**.

## Get the code

```bash
cd ~
git clone https://github.com/vcoder302026/T4G-Sem12627-MINDS-APP.git
cd T4G-Sem12627-MINDS-APP
```

This creates the folder `~/T4G-Sem12627-MINDS-APP`. Every command below starts from
there. If you downloaded a ZIP from GitHub instead, unzip it and `cd` into the
unzipped folder, which might be named something like `T4G-Sem12627-MINDS-APP-main`.

> **Tip:** if a folder name has a space in it (for example `T4G-Sem12627-MINDS-APP 2`),
> put the path in quotes: `cd "/Users/you/Downloads/T4G-Sem12627-MINDS-APP 2"`.
> You can also type `cd ` with a trailing space and drag the folder from Finder into
> Terminal to paste its path.

---

## Testing the volunteer app

There are three levels of testing. Start with level 1. It needs no Google account and
takes about a minute.

### 1. Run the automated tests

```bash
cd volunteer-app
npm test
```

Expected result: `# tests 37`, `# pass 37`, `# fail 0`. These tests run the real
Apps Script backend code (`gas/*.gs`) against an in-memory spreadsheet. They cover
the whole flow: register, read the guide, book, pair a trainee, scan in and out,
give feedback, and write trainee notes.

There's nothing to install first, because the volunteer app has no npm dependencies.

### 2. Try the app in your browser (local demo)

From the `volunteer-app` folder:

```bash
npm run dev
```

You should see:

```
MINDS Volunteer app (local mock) → http://localhost:5173
  Leader:    leader@example.com / LeaderDemo123
  Volunteer: volunteer@example.com / VolunteerDemo123
  Sheet view: http://localhost:5173/__sheet
```

Open **<http://localhost:5173>** and sign in:

| Role | Email | Password |
| --- | --- | --- |
| Volunteer leader | `leader@example.com` | `LeaderDemo123` |
| Volunteer | `volunteer@example.com` | `VolunteerDemo123` |
| Second volunteer | `sam@example.com` | `VolunteerDemo123` |

Open **<http://localhost:5173/__sheet>** in another tab to see what the app would write
to Google Sheets. Refresh it after each action.

The demo data lives in memory and **resets when you stop the server**. To stop it,
press **Ctrl+C** in Terminal. To use a different port, run `PORT=5174 npm run dev`.

#### Suggested test walkthrough

Use a normal window for the volunteer and a private or incognito window for the leader,
so you can be signed in as both at once.

1. **New volunteer:** click Register and create an account with fictional details.
   Check that you're asked to read the Volunteer Guide, and that you can't book until
   you tap **I've read the guide**.
2. **Booking:** as `volunteer@example.com`, book an upcoming session.
3. **Leader confirms:** as `leader@example.com`, open the session, confirm the booking,
   and check that a trainee is paired automatically.
4. **Clock in/out:** as the volunteer, open the QR pass. As the leader, use the manual
   clock-in option. Camera scanning needs HTTPS, so test that on the live site (level 3).
5. **Feedback and notes:** as the volunteer, submit feedback with a trainee observation.
   As the leader, review it and share it as a trainee note.
6. **Profile and venues:** edit your details under **Me**, and try adding a new venue
   from the venue dropdown.
7. Check **/__sheet** to confirm each step created the rows you expected.

#### Check the phone layout

- **Chrome:** press Cmd+Option+I (Windows: F12), then click the phone icon in the panel.
- **Safari:** choose **Develop → Enter Responsive Design Mode**. If there's no Develop
  menu, turn it on in Safari → Settings → Advanced.
- **On a real phone:** connect the phone to the same Wi-Fi as your computer. Find your
  computer's IP address (Mac: `ipconfig getifaddr en0`; Windows: `ipconfig`) and open
  `http://<that-IP>:5173` on the phone. Everything works except the camera.

### 3. Test the live website (GitHub Pages + Google)

This is where you test **QR scanning with real phones**, because browsers only allow
the camera on HTTPS sites. The live site needs a Google Apps Script backend. Until one
is set up, the page loads but signing in fails.

1. Make a **test Google Sheet with fictional data only**, then follow
   [volunteer-app/README.md → Set it up on Google](volunteer-app/README.md#set-it-up-on-google)
   to create the Apps Script project, run `setup()`, and deploy it as a web app.
2. In this repo, go to **Settings → Secrets and variables → Actions → Variables** and add
   `GAS_EXP_URL` with your web app URL (ending in `/exec`).
3. Make sure **Settings → Pages → Source** is set to **GitHub Actions**. Then rerun
   **Volunteer app · deploy web** from the **Actions** tab.
4. Open the site (the link is under Settings → Pages). It looks like
   `https://vcoder302026.github.io/T4G-Sem12627-MINDS-APP/`.
5. Register an account and make yourself the first leader with `makeFirstAdmin()`
   (see the volunteer-app README). Then test clock-in with two phones: one shows the
   volunteer's QR pass, and the leader's phone scans it.

If it works locally (level 2) but not live, the problem is almost always setup:
a wrong or missing URL, web app access not set to **Anyone**, or a code change that
wasn't published as a **New version** of the deployment.

---

## Testing Prototype 1 (staff app)

Prototype 1 needs **Node.js 24 or later**. Run these from the repository root, not inside
`volunteer-app`:

```bash
npm install
npm test        # expected: 23 tests, all passing
npm start       # → http://localhost:3000
```

Sign in with `admin` / `MindsDemo123!`. Data is saved in `data/minds.sqlite`. To reset
it, stop the server and delete the `data` folder. For more, see
[docs/prototype-1/README.md](docs/prototype-1/README.md) and the
[usage guide](docs/prototype-1/USAGE-GUIDE.md).

---

## Troubleshooting

| What you see | What it means and how to fix it |
| --- | --- |
| `cd: no such file or directory` | The folder isn't where you typed. Find it with `find ~ -maxdepth 4 -type d -name volunteer-app`, then `cd` to the path it prints. Use quotes if the path has spaces. |
| `npm error enoent Could not read package.json` | You're in the wrong folder, usually your home folder after a failed `cd`. Run `pwd` to check, then `cd` into `volunteer-app` (or the repo root for Prototype 1). |
| `npm: command not found` / `node: command not found` | Node.js isn't installed. Install the LTS version from [nodejs.org](https://nodejs.org), then open a new Terminal window. |
| Prototype 1 fails with an error about `node:sqlite` | Your Node.js is older than 24. Run `node -v` and upgrade. |
| `EADDRINUSE` / port already in use | The server is already running in another window. Stop it with Ctrl+C, or use another port: `PORT=5174 npm run dev`. |
| Demo data disappeared | Expected. The local demo resets every time the server stops. |
| Live site: "Couldn't reach the server" | `GAS_EXP_URL` is missing or wrong, or the Apps Script web app isn't shared with **Anyone**. |
| Camera doesn't start | Use the HTTPS GitHub Pages site, not `http://` on your computer, and allow camera access in the browser. |

More fixes for the volunteer app are in
[volunteer-app/README.md → Troubleshooting](volunteer-app/README.md#troubleshooting).

---

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

- Make changes on a branch and open a pull request into `main`. Merging to `main`
  publishes the volunteer app.
- Before opening a PR, run the tests: `cd volunteer-app && npm test` (37 tests), plus
  `npm test` at the root if you touched Prototype 1 (23 tests). The volunteer-app tests
  also run automatically on every pull request.
- Use fictional data only. Never commit real volunteer or trainee details,
  `.clasprc.json`, `.clasp.json`, or Apps Script URLs and Sheet IDs. Put URLs in the
  repository variables instead.
