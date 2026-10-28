# Setting up the Experimentation (Exp) app from scratch

A clean Exp setup for Version 3, separate from your Version 1 Exp. You'll create a **new**
volunteer sheet (from the attached mock database) and a **new** Apps Script project, and use
MINDS's mock House Visit sheet for trainees. Everything in the mock data is fictional.

**You need:** `MINDS-Volunteer-Database-Exp.xlsx` (made below); the mock House Visit sheet
("Mock Data - (Exp) House Visit Template Form (Responses)"); the `version-3` code on your
computer; about 45 minutes.

> **Before you start, make your own key and database** (never commit the key):
> ```bash
> cd volunteer-app
> python3 -c 'import secrets; print(secrets.token_hex(32))'      # your APP_SECRET; keep it private
> python3 dev/make-exp-database.py <that APP_SECRET> ~/Desktop/MINDS-Volunteer-Database-Exp.xlsx
> ```
> (Needs Node.js and `pip install openpyxl`.) It's for Exp only; Prod gets its own key (setup
> creates one automatically).

---

## Part A: Google Sheets

### 1. Check the trainee sheet (MINDS's mock House Visit responses)

1. Open https://docs.google.com/spreadsheets/d/1da0qLQ-ioicz9H79H_KFubAQrXwayLu89U3uGvjNqsg
2. Click the **Form Responses 1** tab and copy the URL from the address bar. It ends in
   `#gid=…` (the number of that tab). Keep it for step 5. If the link you have
   (`gid=1084079621`) opens a different tab, use the Form Responses 1 one.
3. Leave the **Map (Fixed)** tab as it is: the app uses it to group the questions into sections.
4. Make sure the Google account you'll use for Apps Script can **edit** this sheet. Setup adds
   a **Trainee ID** column (T-0001 = Mock Trainee 1, …) and two observation columns, and changes
   nothing else.

### 2. Create the volunteer database

1. Go to https://sheets.new (a blank sheet) and name it **MINDS Volunteer Database (Exp)**.
2. **File → Import → Upload** → choose `MINDS-Volunteer-Database-Exp.xlsx` →
   **Import location: Replace spreadsheet** → **Import data**.
3. You should see tabs Volunteers, Sessions, Bookings, … (the `_Auth` tab is hidden on purpose:
   it holds the demo passwords, scrambled).
4. Copy this sheet's URL for step 5.

What's in it: 35 fictional volunteers (the five demo accounts plus 30 more across RSPID (CTDC),
RSPID (WGS), West End and the Alumni options), sessions from the past weeks to the next two weeks
with attendance and hours, 26–27 volunteers coming to each of the next two sessions, regular
pairings with Mock Trainees 1, 2, 6 and 11–14, notes, feedback, a house visit, and the Version 1
fundraising / outing / trip examples. Session dates are around 28 October 2026.

---

## Part B: Apps Script (the backend)

### 3. Create a new Apps Script project

1. Go to https://script.google.com → **New project**. Name it **MINDS Volunteer App (Exp)**.
2. **Project Settings (⚙️) → IDs:** copy the **Script ID**.

### 4. Upload the Version 3 code with clasp

1. Turn on the Apps Script API (once): https://script.google.com/home/usersettings →
   **Google Apps Script API: On**.
2. **Go to the app's folder and the Version 3 code.** Open Terminal and run these two lines:
   ```bash
   cd ~/T4G-Sem12627-MINDS-APP/volunteer-app
   git checkout version-3
   ```
   - `cd …` moves Terminal into the `volunteer-app` folder, where the backend code (`gas/`) is.
     If your copy of the repository is somewhere else, use that path instead (for example
     `cd ~/Documents/T4G-Sem12627-MINDS-APP/volunteer-app`).
   - `git checkout version-3` switches to the Version 3 code. If you've already merged it into
     `main`, use `git checkout main` instead. Either way, `git log --oneline -1` should show your
     latest Version 3 commit.

3. **Sign clasp in to your Google account (once per computer).** clasp is Google's tool for
   uploading code to Apps Script from Terminal.
   ```bash
   npm run clasp:login
   ```
   - The first time, npm downloads clasp (a few seconds), then your **browser opens** a Google
     sign-in page. Choose the **same Google account** you used to create the Apps Script project
     in step 3, and click **Allow**.
   - The browser then says "Logged in! You may close this page", and Terminal shows
     `Authorization successful.` You can close the browser tab.
   - Your sign-in is saved on this computer in `~/.clasprc.json`. **Keep that file private**:
     it gives access to your Apps Script projects. (It's the value of the optional GitHub secret
     `CLASPRC_JSON` in step 8.)
   - Signed in with the wrong account? Run `npx @google/clasp@2.4.2 logout`, then
     `npm run clasp:login` again.

4. **Tell clasp which Apps Script project to upload to.** clasp reads this from a small file
   called `.clasp.json` in the `volunteer-app` folder. Make it from the example:
   ```bash
   cp .clasp.json.example .clasp.json
   open -e .clasp.json
   ```
   - `cp` copies the example to a new file named `.clasp.json`. (Files starting with a dot are
     hidden in Finder; that's normal.)
   - `open -e` opens it in TextEdit. It looks like this:
     ```json
     {
       "scriptId": "PASTE_YOUR_SCRIPT_ID (Apps Script editor → Project Settings → IDs)",
       "rootDir": "gas"
     }
     ```
   - Replace **everything between the quotes** after `"scriptId":`, including the
     `PASTE_YOUR_SCRIPT_ID (…)` text, with the **Script ID** you copied in step 3. Keep the quotes
     and the comma. It should end up like this (your ID will be different):
     ```json
     {
       "scriptId": "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefGhIjKlMnOp",
       "rootDir": "gas"
     }
     ```
   - Leave `"rootDir": "gas"` as it is: it tells clasp to upload the files in the `gas/` folder.
   - Save (**Cmd+S**) and close TextEdit. If TextEdit asks, keep the name `.clasp.json` (not
     `.clasp.json.txt`).
   - `.clasp.json` is never committed to GitHub (it's in `.gitignore`), so the Script ID stays on
     your computer.

5. **Upload the code:**
   ```bash
   npm run gas:push
   ```
   Terminal lists each file as it's pushed (`└─ gas/Admin.gs`, …) and ends with
   `Pushed 25 files.` If it says *User has not enabled the Apps Script API*, turn the API on
   (item 1 above) and wait a minute. If it says the script ID is invalid, check `.clasp.json`
   (item 4 above).

   This uploads every `.gs` file and `appsscript.json` (which turns on the People API and asks for
   Sheets, Drive and Contacts access). Reload the Apps Script editor: you'll see Admin.gs,
   Config.gs, … and **Services → People API**.

### 5. Script properties (before running anything)

**Project Settings → Script properties → Add script property**, one at a time:

| Property | Value |
| --- | --- |
| `APP_SECRET` | the key you made at the start |
| `SPREADSHEET_ID` | the volunteer database URL (step 2) |
| `TRAINEE_SPREADSHEET_ID` | the **Form Responses 1** tab URL, with `#gid=…` (step 1) |
| `CONTACTS_SYNC` | `on` |
| `CONTACTS_LABEL` | `MINDS Volunteers (Exp)` |

`APP_SECRET` must be set **before step 6**: the demo passwords in the database were stored under
it. Never change or delete it afterwards (that signs everyone out and breaks QR passes).

**Google Contacts sync** (`CONTACTS_SYNC` = `on`) saves every volunteer who registers, or whom an
admin adds, as a contact in the **Google account that runs the Apps Script project** (yours),
with their first and last name, short name (as the nickname), birthday, email and 8-digit phone,
and their Telegram, project and emergency contact in the notes. Edits to their details update the same contact. `CONTACTS_LABEL` puts them all
under one label in Google Contacts, so the Exp test contacts are easy to find and delete later.
The People API it needs was turned on by `npm run gas:push` (step 4): in the Apps Script editor,
**Services** should list **People API**.

### 6. Run setup (once, in the editor)

1. Open **Setup.gs**, choose **`checkConfig`** in the function list, click **Run**.
   **Review permissions → your account → Advanced → Go to … → Allow**. The Execution log lists
   what setup will do, without changing anything.
2. Choose **`setup`** → **Run**. It adds the Trainee IDs to the House Visit sheet, checks every
   tab, and creates the **admin password**.
3. In the Execution log, find **"Created the ADMIN PASSWORD"** and write the password down. It's
   shown once; admins need it to make or remove admins and for Advanced settings. (Lost it? Run
   `resetAdminPassword()`.)
4. Open **Contacts.gs**, choose **`testContactsAccess`** → **Run**. If Google asks for the
   **Contacts** permission: **Review permissions → your account → Allow**. The Execution log
   should say `CONTACTS_SYNC is "on"` and `OK: contacts will be saved … with the label "MINDS
   Volunteers (Exp)"`. If it says *Problem: …*, check that **Services** lists **People API**
   (if not: **Services (+) → People API → Add**), then run it again.

### 7. Deploy the web app

1. **Deploy → New deployment → ⚙️ Select type → Web app.**
2. Description: `Exp`. **Execute as: Me. Who has access: Anyone.** → **Deploy**.
3. Copy the **Web app URL** (ends in `/exec`) and the **Deployment ID**.

Later code updates: `npm run gas:push`, then **Deploy → Manage deployments → ✏️ → Version: New
version → Deploy** (the URL stays the same).

---

## Part C: GitHub (the website)

### 8. Settings in the repository

On https://github.com/vcoder302026/T4G-Sem12627-MINDS-APP → **Settings**:

1. **Pages → Build and deployment → Source: GitHub Actions.**
2. **Secrets and variables → Actions → Variables → New repository variable:**
   - `APP_ENVIRONMENT` = `Exp` (shows the purple **EXPERIMENTATION** bar)
   - `GAS_EXP_URL` = the `/exec` URL from step 7
3. **Optional: automatic backend updates.** With three secrets added, every time backend code
   (`volunteer-app/gas/`) changes on `main`, GitHub runs the tests, uploads the code to Apps Script
   and publishes it as a new version of your **existing** deployment (the `/exec` URL stays the
   same). Without them, you update the backend by hand each time: `npm run gas:push`, then
   **Deploy → Manage deployments → ✏️ → New version** (step 7). If you're the only one changing
   the backend, doing it by hand is fine; skip to step 9.

   **a. Collect the three values:**

   | Secret name | What it is | Where to get it |
   | --- | --- | --- |
   | `CLASPRC_JSON` | clasp's sign-in to your Google account, created by `npm run clasp:login` (step 4) | In Terminal: `pbcopy < ~/.clasprc.json` copies the whole file. Paste it as it is: all of it, from the first `{` to the last `}` |
   | `GAS_SCRIPT_ID` | Which Apps Script project to update | The **Script ID** from step 3 (also in `volunteer-app/.clasp.json`) |
   | `GAS_DEPLOYMENT_ID` | Which deployment to update, so the `/exec` URL stays the same | Apps Script → **Deploy → Manage deployments** → select the **Exp** web app → copy the **Deployment ID** (a long code starting `AKfycb…`; the ID, not the URL) |

   **b. Add each one as a secret** (three times):
   1. On GitHub: **Settings → Secrets and variables → Actions**.
   2. Open the **Secrets** tab (not Variables: secrets are hidden after saving; step 8.2's values
      were variables).
   3. **New repository secret** → **Name:** exactly as in the table (e.g. `CLASPRC_JSON`) →
      **Secret:** paste the value → **Add secret**.

   When you're done, the Secrets tab lists `CLASPRC_JSON`, `GAS_DEPLOYMENT_ID` and
   `GAS_SCRIPT_ID`.

   **c. Check it works** (once `version-3` is merged into `main`, step 9):
   1. **Actions → "Volunteer app · test and deploy Apps Script" → Run workflow → Branch: main →
      Run workflow.**
   2. **Check that it really updated Apps Script.** A run can finish "green" (successful) even
      without deploying anything: if the secrets are missing, it only runs the tests and skips
      the upload. So look inside it:
      - On the **Actions** tab, wait until the run you started shows a **green ✓** (a few
        minutes; a yellow dot means it's still running, a red ✗ means it failed).
      - Click the run's title. On the left you'll see its two parts ("jobs"): **test** (runs the
        automated tests) and **deploy** (uploads to Apps Script). Click **deploy**.
      - You now see its list of steps, each with an icon:

        | Step | What you want to see | What it means |
        | --- | --- | --- |
        | Push code to Apps Script | **green ✓** | The code was uploaded to your Apps Script project |
        | Update the live web app deployment | **green ✓** | A new version was published on the same `/exec` URL |
        | Skip notice | **grey ⊘** (skipped) | Good: this step only runs when secrets are missing |

      - **If the first two show a grey ⊘ instead** (skipped, and greyed out), GitHub didn't find the
        secrets: check the three names in **Settings → Secrets and variables → Actions → Secrets**
        are exactly `CLASPRC_JSON`, `GAS_SCRIPT_ID` and `GAS_DEPLOYMENT_ID` (and are on the
        **Secrets** tab, not Variables), then run the workflow again. Only the last one skipped?
        `GAS_DEPLOYMENT_ID` is missing.
      - **If one shows a red ✗,** click it to see the error. *Invalid grant* or *unauthorized*: run
        `npm run clasp:login` again and update `CLASPRC_JSON`. *Requested entity was not found*:
        `GAS_SCRIPT_ID` or `GAS_DEPLOYMENT_ID` has a typo.
   3. In Apps Script, **Deploy → Manage deployments** shows a new version described
      **"CI " and a code** (the commit). Same `/exec` URL.

   **Good to know:**
   - `CLASPRC_JSON` gives access to the Apps Script projects in your Google account. GitHub keeps
     it hidden (nobody can read it back, not even you), but anyone who can change the workflow
     files could use it, so only add it if you trust everyone with write access to the repo.
   - If the deploy step later fails with an authorisation error (for example after you change
     your Google password), run `npm run clasp:login` again, then update the `CLASPRC_JSON` secret
     with the new `~/.clasprc.json` (**Secrets → ✏️ → paste → Update secret**).
   - Without the secrets, the workflow shows the notice *"Add the CLASPRC_JSON and GAS_SCRIPT_ID
     secrets to enable automatic Apps Script deploys"* and skips deploying; tests still run.

### 9. Publish

Merge `version-3` into `main` (pull request → Merge), or run **Actions → volunteer-app-pages →
Run workflow**. When it's green, the app is at
**https://vcoder302026.github.io/T4G-Sem12627-MINDS-APP/**

---

## Part D: First look in the app

### 10. Sign in and finish setting up

Open the site (on a phone or computer). You should see the purple **EXPERIMENTATION** bar.

| Account | Email | Password |
| --- | --- | --- |
| Admin (Ada) | `admin@example.com` | `AdminDemo123` |
| Regular (Rex, fixed trainee Mock Trainee 1) | `regular@example.com` | `RegularDemo123` |
| Regular (Rina, Mock Trainees 2 and 6) | `rina@example.com` | `RegularDemo123` |
| Volunteer (Vera) | `volunteer@example.com` | `VolunteerDemo123` |
| Volunteer (Sam, 9 sessions: one more makes him a regular) | `sam@example.com` | `VolunteerDemo123` |
| The 30 others (e.g. Aisha Tan, a regular) | `aisha.tan@example.com` (first.last@example.com) | `VolunteerDemo123` |

As Ada:
1. **Admin → Settings → Advanced settings → Check the setup**: every line OK.
2. **Settings → Admin password**: change the generated one (step 6) to one you'll share.
3. **Settings → Google Sheets**: the volunteer and trainee databases show as connected.
4. **Trainees → What volunteers see**: check what volunteers may see about trainees.
5. **Settings → Advanced settings → Save all volunteers to Google Contacts** (with the admin
   password). The 35 mock volunteers were imported, not registered, so they aren't contacts yet;
   this saves them all. The report says how many were saved.
6. Check it worked: open https://contacts.google.com with the Apps Script account. The label
   **MINDS Volunteers (Exp)** on the left lists them. (The imported mock volunteers only have a Full
   Name, so it's all in First name, e.g. "Ada Admin"; editing someone in the app with First and Last
   name splits it.) In the app, a
   volunteer's page (Admin → Volunteers → a name) now shows **Update Google contact**, and the
   **Google Contact** column on the Volunteers tab says they're saved.

### 11. Test round

- **Pairing:** Admin → Session Management → the 31 Oct session → **Pair**. 26 people are
  coming; 5 are already paired (regulars). Drag the rest onto trainees; try **All ↔ Paired**.
- **Register** a new volunteer (pick an RSPID project to see the extra questions).
- **QR pass:** on a phone, sign in as Vera → QR pass; on another phone, as Ada → **Scan**
  (needs the real HTTPS site; works on the day of a session).
- **Notes:** as Rex → Mock Trainee 1 → **Send update**; as Ada → Trainees → **Notes to review**.
- **House visit:** More → House visits → **New visit** (find a trainee, or **+ Start New Blank
  Visit**). Check the House Visit sheet afterwards.
- **Warnings:** make Vera an admin, then remove it (asks for the admin password).
- **Google Contacts:** register a new test volunteer; they appear under **MINDS Volunteers (Exp)**
  in Google Contacts within a few seconds. Change their phone under **Me → Edit**: the contact
  updates.

---

## If something goes wrong

| What you see | Fix |
| --- | --- |
| "Email or password is incorrect." for the demo accounts | `APP_SECRET` doesn't match. Check step 5 (no spaces). Or the fallback: register in the app with `admin@example.com` (it links to Ada's row as a volunteer), set the property `FIRST_ADMIN_EMAIL` = `admin@example.com`, run `makeFirstAdmin()`, then reset others' passwords from Admin → Volunteers |
| "Google needs permission" | Open the link it shows, allow access with the Apps Script account |
| "Couldn't reach the server" | `GAS_EXP_URL` must end in `/exec`, access **Anyone**; rerun the Pages workflow |
| Trainees missing / no sections | `TRAINEE_SPREADSHEET_ID` must be the **Form Responses 1** tab URL with `#gid=`, and the Apps Script account must be able to edit it; then Advanced settings → Run setup |
| The site still shows an old version | Tap ↻ (Update app), or reload |
| Volunteers don't appear in Google Contacts | The **Google Contact** column on the Volunteers tab says why. Usually the People API service is missing or the Contacts permission wasn't allowed: run `testContactsAccess()` (step 6.4), then **Save all volunteers to Google Contacts** again |
| Removing the test contacts later | contacts.google.com → label **MINDS Volunteers (Exp)** → select all → **⋮ → Delete** |

**Your Version 1 Exp:** leave its sheet as it is. So testers don't use it by mistake, archive its
deployment (old Apps Script project → Deploy → Manage deployments → Archive).

**Fresh data later:** the session dates are around 28 Oct 2026. To regenerate with dates around
today: `cd volunteer-app && python3 dev/make-exp-database.py <APP_SECRET> new.xlsx` (same
`APP_SECRET`), then import it into a new sheet and point `SPREADSHEET_ID` at it.
