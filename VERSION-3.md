# MINDS Volunteer Management: Version 3 prototype

NTU Tech for Good (Semester 1, AY2026/27) · Prepared for MINDS · 28 October 2026

Version 3 builds on [Version 2](VERSION-2.md) and on Steven's update after Mr Sadil's call 2
feedback ([STEVEN-UPDATE.md](STEVEN-UPDATE.md), PR #8). Everything is in `volunteer-app/`.
Every person and record in the demo is fictional.

**Contents**

1. [Call 2 minutes: where everything stands](#1-call-2-minutes-where-everything-stands)
2. [What's new in Version 3](#2-whats-new-in-version-3)
3. [Try it in 10 minutes](#3-try-it-in-10-minutes)
4. [Upgrading the Exp setup](#4-upgrading-the-exp-setup)
5. [Testing](#5-testing)
6. [Still open](#6-still-open)

---

## 1. Call 2 minutes: where everything stands

| Point from the minutes | Status | Where |
| --- | --- | --- |
| **Trainee pairing** | | |
| One trainee to multiple volunteers | Done (Version 2, kept) | Pairing |
| One volunteer to multiple trainees | Done (Steven) | Both pairing boards |
| Follow the House Visit form for trainee details | Done (Steven) | Trainee pages |
| Small ✕ to unpair | Done (Steven) | Both pairing boards |
| Paired / Unpaired / All filters | Done; now one **All ↔ Paired** button per column, as in the outing app | Each column of both boards |
| Drag and drop, for regular volunteers and trainees | Done (Steven), touch and mouse | Both pairing boards |
| Paired trainees and volunteers more obvious | Done: paired names sit in each card's box, unpaired cards say "Drop … here", and the red **N unpaired** count | Both pairing boards |
| Follow the outing pairing interface | **Done in Version 3**: laid out like the outing app's Manual Pair page (§2.11) | Pairing |
| **Feedback notes** | | |
| Share with all future volunteers / regulars only / selected volunteers / keep private | Done (Steven) | Trainees → Notes to review |
| Filter what volunteers see, linked to volunteer updates | Done (Steven); his reading still to confirm with Mr Sadil | What volunteers see |
| **Volunteer registration** | | |
| Follow the fields in the Google Form | **Done in Version 3**: question for question (Steven's list was a placeholder, as the form wasn't available then) | Register, Me, Edit my details, admin volunteer page |
| **Minor details** | | |
| Drag and drop instead of arrows on the guide page | Done (Steven) | Settings → Guide & projects |
| "Ensure that there are…" | **Unclear**: the sentence is cut off in the minutes | Ask Mr Sadil |
| Make sure the mobile view works properly | **Checked in Version 3** from 280 px (Galaxy Fold folded) to tablets: nothing off-screen, no squashed text, every page scrolls (§2.10, three check scripts) | All pages |
| **Added after call 2** | | |
| Warning when making someone an admin or deactivating an admin | **Done in Version 3** | Admin → Volunteers |

## 2. What's new in Version 3

### 2.1 Registration = MINDS's "Consolidated Volunteer Records" Google Form

| # | Google Form question | In the app | Check |
| --- | --- | --- | --- |
| 1 | Short Name \* | Personal particulars | Required; used in "Welcome, …" and Google Contacts |
| 2 | Full Name \* | Your account (**First Name** and **Last Name**) | Required; asked as two boxes so they fill Google Contacts' First and Last name; the app joins them into the Full Name (`FULL_NAME_ORDER` in `Config.gs`) |
| 3 | NRIC (Last 4 Alphanumeric, e.g. 123A) \* | Personal particulars 🔒 | 3 digits and a letter, saved in capitals |
| 4 | Project \* (RSPID (CTDC), RSPID (WGS), West End, RSPID (CTDC) Alumni, RSPID (WGS) Alumni) | Project | One choice, from the standard Projects list (Settings → Guide & projects) plus "Alumni" for the RSPID projects |
| 5 | Course and Year [RSPID Volunteers] | Project | Asked only for RSPID projects |
| 6 | Matriculation Number [RSPID Volunteers] | Project 🔒 | Only for RSPID; letters and numbers, saved in capitals |
| 7 | School Email [RSPID Volunteers] | Project | Only for RSPID; a valid email |
| 8 | Email [To Receive Newsletters] \* | Your account ("Sign-in email") | Valid email; people sign in with it |
| 9 | Contact No \* | Your account | +65 and 8 digits |
| 10 | D.O.B \* | Your account ("Date of Birth") | Not in the future |
| 11 | Address \* | Personal particulars 🔒 | Required |
| 12 | T-Shirt Size \* (XS–XXL) | Other information | One choice |
| 13 | Start Year (RSPID or West End, whichever is earlier) (YYYY) \* | Project | A 4-digit year, not later than this year |
| 14 | Events' / Project Committee Participation | Other information | Long answer |
| 15 | Dietary Restrictions | Other information | |
| 16 | Spoken languages / dialects | Other information | |
| 17 | Emergency Contact's Relationship \* | Emergency contact 🔒 | Required (**back**: Version 2.13 had removed it) |
| 18 | Emergency Contact No. \* | Emergency contact 🔒 | +65 and 8 digits |
| + | Telegram handle (not in the form) | Your account | Optional; admins message volunteers there |

- 🔒 = personal particulars: shown only to the volunteer (Me) and to admins, never to other
  volunteers, never on quick cards for volunteers, and **never saved to Google Contacts**.
- The RSPID-only questions appear as soon as an RSPID project is picked, and disappear (and are
  cleared) for West End. Editing details works the same way.
- The questions are still Steven's data list (`REGISTRATION` in `gas/Config.gs`), now with five
  more answer types (`email`, `phone`, `year`, `nric4`, `matric`), `showIf` for the RSPID-only
  questions, `private`, and `placeholder`. Changing the form later is still a `Config.gs` edit,
  `setup()` and a new version.
- Steven's placeholder questions (gender, studying/working, medical conditions, how they
  heard, photo consent, …) are gone. Answers already saved stay in their sheet columns.

### 2.2 Warnings before major admin actions

Short and the same everywhere: **"Warning: You are _making Sam Siva an admin_. Do you wish to
continue?"**, with Cancel / Continue and, where needed, the admin password.

| Action | Admin password |
| --- | --- |
| Making someone an admin (volunteer page, or Add volunteer with admin access) | Yes |
| Deactivating an admin | Yes |
| Deactivating a volunteer | No |
| Advanced settings functions that change data; linking or creating a Google Sheet | Yes |
| Removing admin access; reactivating an admin | Yes |
| Promoting to regular / moving back to volunteer; resetting a password; reactivating a volunteer; removing a trainee photo; taking someone off a session; cancelling a session; archiving a venue or project; deleting a guide section; setting visibility as the default | No |

Every change to someone's access or status, and every removal, warns this way (the table above).

**Behaviour change:** deactivating someone also **takes them off their upcoming sessions** (their
sign-ups are marked cancelled, not deleted), so deactivated people no longer sit on session lists
and pairing boards. Hours, attendance, notes and pairing history are kept.

### 2.3 Project names match the form

- **One standard project list:** RSPID (CTDC), RSPID (WGS) and West End (Settings → Guide &
  projects). Registration offers these plus "RSPID (CTDC) Alumni" and "RSPID (WGS) Alumni"; a project
  added in Settings appears at registration too. `setup()` adds any missing standard project.

- The Woodlands projects are now **"West End"** and **"RSPID (WGS)"** (WGS = Woodlands Gardens
  School), as in the form, instead of "West End (WE)" and the long RSPID name.
- `setup()` renames them on the Projects tab and in every session that lists them, once
  (`PROJECT_RENAMES` in `gas/Config.gs`). New sessions tick both by default, as before.
- Badges show the name itself when it's short ("West End", "RSPID (WGS)").

### 2.4 Smaller changes

- Google Contacts (when sync is on): **First name** and **Last name** in Google's own fields, the
  short name as the **nickname**, the **birthday**, the phone as its **8 digits** (e.g. 92334014),
  and Telegram, Project and the emergency contact in the notes. Editing any of these updates the
  contact. Older records with only a Full Name put it in First name until someone splits it
  (Edit details).
- Home greets volunteers by their short name: "Welcome, Mei!".
- The volunteer list knows each person's upcoming sign-ups, so the deactivation warning gives
  the exact number.

### 2.5 Consistent with MINDS's other apps

The app keeps the look and behaviour of the Trainee House Visit, CSL Attendance and Overseas
Trip Planner apps (the rule and the full list of shared patterns are in `AGENTS.md`). Version 3
adds the ones that were missing:

- **Dates** use the browser's own calendar picker, as in the WERONE outing app (MINDS chose it
  over the House Visit "Rolodex" wheel). **Times** open an HH · MM wheel.
- **Dropdowns** open the app's own list right below the box (just above it near the bottom of
  the screen), the same width, with ✓ on the current choice and a search box for long lists.
- **Show / hide eye** on every password box, including the admin-password prompts.
- **Clear (✕) button** inside search boxes (Overseas Trip Planner).
- **"Saved / Saving… / Not saved"** next to "N unpaired" on the pairing board (Overseas).

**Fixed:** Admin → Volunteers → **Add volunteer** and a volunteer's **Edit** didn't open (a
leftover from removing the emergency contact in v2.13). They open again, and include the
emergency contact's relationship and number, as in the form.

### 2.6 MINDS's web app template

MINDS's "Template Prompts for Creating WebApps" (Team 39 Drive) sets the rules for all their apps.
`AGENTS.md` now lists every rule and how this app meets it. Version 3 adds the ones that were missing:

- **Advanced settings** (Admin → Settings → Advanced settings): run **Check the setup**
  (read-only), **Run setup** and **Save all volunteers to Google Contacts** from the app, with the
  template's warning ("may cause data loss; only use if you know what you are doing"), the admin
  password for anything that changes data, a report on screen, and an Activity log entry. Future
  one-time jobs go here too.
- **Google permissions:** when Google needs the app's account to allow access, the app says so
  and links to Google's permission page, instead of "unexpected reply" / "couldn't reach the server".
- **🏠 Home** in the header (↻ · 🌗 · 🏠 · sign out), as in the template's standard header.
- **Skeletons over spinners:** pages show shimmering placeholder blocks while loading.
- The HH · MM time wheel can be **dragged with a mouse** on computers and vibrates slightly per
  step on phones, like the template's Rolodex engine.

### 2.7 Link the Google Sheets from the app

**Admin → Settings → Google Sheets**, laid out like CSL Attendance's "Manage Google Sheet": one card
for each database, showing the sheet it uses now and whether it has what the app needs.

| Database | What's in it | Create New Sheet |
| --- | --- | --- |
| **Volunteer database** (`SPREADSHEET_ID`) | Volunteers, sessions, sign-ups, attendance, pairings, notes, settings, sign-ins | Makes a **copy** of the current database and switches to it (useful as a backup or for a test round) |
| **Trainee database** (`TRAINEE_SPREADSHEET_ID`) | MINDS's trainee list, e.g. the House Visit form responses | A new sheet with a Trainees tab |
| **House visit database** (`VISITS_SPREADSHEET_ID`, new) | House visit records ("House Visits" tab) | A new sheet with a House Visits tab |

- **Or connect existing:** search Google Drive by name, then **Link**; or paste a URL or ID and
  **Connect**. The app checks the sheet first: a trainee name column for trainees; for the volunteer
  database, the app's tabs **and the linking admin's own account**, because a sheet without it would
  sign everyone out.
- After linking, setup runs by itself (adds any missing tabs and columns); its report is on the page.
- The trainee and house visit databases can go back to the volunteer database with one tap.
- Every change needs the admin password and is in the Activity log. If no house visit database is
  linked, house visits stay in the volunteer database, as before.

### 2.8 Clean, concise screens (like the Comm Dashboard)

- **Header:** ← back and the page's title on the left; square ↻ · 🌗 · 🏠 · sign-out buttons on the
  right, as in the Comm Dashboard and Overseas Trip Planner. The page title is no longer repeated
  below it, and ← goes up a level (e.g. from a volunteer back to Volunteers).
- **Admin home** laid out like the Comm Dashboard: **Create New Session**; **Session Management**
  (pick a session, then Pair, Who's coming, Scan, Clock in, Regular pairings); **Records** shortcuts;
  and **Upcoming Sessions**, each with a small table by project (coming / paired / to pair, by the
  project volunteers registered under), icon buttons, **Copy Info** (session, venue and who's coming
  with their trainees, ready to paste into Telegram) and Clock in / Pair.
- **Shorter text:** the explanation lines under page titles are gone (admins know what each page is
  for). Volunteers keep one short line where it helps ("Tick the sessions you can come to.").

### 2.9 House visits follow MINDS's House Visit Form

- **New visit** (Admin → More → House visits, or **New house visit** on a trainee's page) is MINDS's
  House Visit Form: the same questions (the trainee sheet's columns), in the same sections and
  order (General Details → … → Volunteers' Observations), each question with its guide text, the
  1–5 scales with their end labels (e.g. "Need support to walk and can be clumsy" ↔ "Agile and
  stable"), a calendar for the date, a project dropdown, and a fixed Submit bar.
- It is **prefilled** with the trainee's current answers; Date of Visit is today.
- **Submit** keeps the visit in the House Visits tab (one column per question, never changed
  afterwards) and, unless unticked, updates the trainee's changed answers in MINDS's trainee sheet,
  as a form response would.
- Trainee details (trainee pages, visit history) use the same section order, and show the 1–5
  answers as the same scale.
- Section order and the scale labels are in `gas/Config.gs` → `HOUSE_VISIT`. Visits recorded before
  this change (four boxes) still show.

### 2.10 Every phone size

Checked on 31 pages at 280 px (Galaxy Fold folded), 320, 360 (Galaxy S8), 375 (iPhone SE), 390
(iPhone 13/14), 412 (Pixel 9) and 430 px (iPhone Pro Max), and two phones held sideways: nothing
runs off the screen and no titles are cut off (`volunteer-app/dev/check-phones.py`). Admin section
buttons wrap onto two lines and scroll away with the page; only the header and tab bar stay pinned.
Dates from MINDS's sheet read "29 Dec 2025" instead of "2025-12-29 20:26:09".

- **No squashed text** at 280, 360, 412, 768 and 1024 px (`dev/check-squash.py`): a row of text
  plus badges or buttons wraps so the text keeps a readable width; status badges such as "You're
  coming" sit above titles; long header titles use two lines; on phones the header's 🏠 is hidden
  (Home is in the tab bar).
- **Scrolling never gets stuck** (`dev/check-scroll.py`): every page change clears anything left
  on top of the page (pop-ups, dropdowns, wheels, a dragged card), and dropdowns never put an
  invisible layer over the page.

### 2.11 Pairing like the WERONE outing app

Both pairing boards (a session's, and Regular pairings) follow the outing app's **Manual Pair**
page: two search boxes; green **VOLUNTEERS** and blue **TRAINEES** headers, each with one **All ↔
Paired** button; plain cards with the name, **+Trn** / **+Vol**, the profile label (**Regular** /
**Volunteer**, and **Admin**), the project, and a dashed box with the paired names (✕ unpairs) or
"Drop trainee here"; the pulsing **N unpaired** and **Saved**. Groups don't apply and are left out.

### 2.12 Trainee details: less repetition

- **Trainee page** (volunteers and regulars) and the **press-and-hold card**: the full name is the
  title; **Short name, Gender and Language** sit beside the photo and aren't repeated below. They
  follow "What volunteers see", so a hidden detail stays hidden. Admins' cards show the same
  details volunteers see.
- **Admins** tapping a trainee anywhere in the volunteer screens go straight to the admin trainee
  page (Edit, New house visit, …). The header **←** goes back to the page they came from.
- Notes shared with selected volunteers say **"Shared with selected volunteers"**; press and hold
  (right-click on a computer) to see who.

### 2.13 Labels and wording

- The same profile labels everywhere: **Admin** (purple), **Regular** (green), **Volunteer**
  (indigo); never "new / ad hoc".
- Session cards say **Paired trainee**; a regular's own card says **Your regular trainee**.
- Registration and Edit my details: **Date of Birth**, **Sign-in email** ("Sign in with this
  email."), **Re-enter password** for every second password box.
- The guide's **Add Files** (was "Add infographic"): Import from device (a "Choose a file or drag
  it here" box, a preview, and **Remove** for a wrong file) or Import from Google Drive.
- Explanatory lines were removed throughout (e.g. "An admin reads it first", "Become regulars
  after 10 sessions", "Not your sign-in password", the 🔒 notes); format hints, error messages and
  the consent notice stay. The rule is in `AGENTS.md`.

### 2.14 Blank house visits for new trainees

**New visit** looks like MINDS's House Visit app: **Find Trainee** (name search) and **+ Start New
Blank Visit**. A blank visit for a trainee not yet in the sheet adds them to MINDS's trainee sheet
with the next Trainee ID, then records the visit.

## 3. Try it in 10 minutes

```bash
cd volunteer-app
npm test
npm run dev
```

Open http://localhost:5173. Accounts are unchanged: `admin@example.com` / `AdminDemo123`
(admin password `admin-demo-2026`), `regular@example.com` / `RegularDemo123`,
`volunteer@example.com` / `VolunteerDemo123`.

1. **Register now** (narrow the window to phone size): the sections follow the Google Form.
   Pick **RSPID (WGS)**: Course and Year, Matriculation Number and School Email appear; pick
   **West End**: they go. Try NRIC `12AB` (refused), then `123a` (saved as 123A).
2. After registering: Home says "Welcome, <short name>!"; **Me** shows your answers.
3. As the admin: **Volunteers → Vera → Make an admin**. The warning is one line ("Warning: You are
   making Vera Volunteer an admin. Do you wish to continue?"); type `admin-demo-2026` and
   **Continue**.
4. **Deactivate** Vera: the warning says how many upcoming sessions she's taken off. Check a
   session: she's gone from it. **Reactivate** her: her hours are all still there.
5. **Deactivate** Sam from the list: a warning, but no password (he isn't an admin).
6. Sessions: badges read **West End** and **RSPID (WGS)**.
7. **Pairing**: open today's session from the Admin home → **Pair**. Drag a volunteer onto a
   trainee; tap **All** above a column to see only the paired ones.
8. **More → House visits → New visit → + Start New Blank Visit**: fill in a name and **Submit**;
   the trainee appears under Trainees.
9. Narrow the window to a phone and press and hold any trainee's name: short name, gender and
   language beside the photo.

## 4. Upgrading the Exp setup

1. Paste every `gas/*.gs` file into the Exp Apps Script project (or `npm run gas:push`).
2. Run **`setup()`** (once, in Apps Script, because Advanced settings arrives with this update;
   from now on use **Admin → Settings → Advanced settings → Run setup**). It adds the new Volunteers columns (Short Name, NRIC (Last 4), Address,
   Project, Course and Year, Matriculation Number, School Email, Start Year, Events / Project
   Committee Participation, Spoken Languages / Dialects), renames the two projects (and the
   sessions that list them), and leaves everything else as it is.
3. Deploy → Manage deployments → ✏️ → **New version** → Deploy (same `/exec` URL).
4. Merge the branch into `main` so GitHub Pages republishes; testers tap ↻.

Existing volunteers keep their accounts. The new required questions are asked when they next
edit their details; nobody is locked out.

## 5. Testing

- `cd volunteer-app && npm test`: **118 passing** (103 from Steven's update; the rest cover the
  registration formats and required questions, deactivation, project names and the standard list,
  Google Contacts, Google Sheets linking, house visits including blank visits, and what volunteers
  see beside the photo).
- Layout checks (`volunteer-app/dev/`): `check-phones.py` (nothing off-screen, 280–430 px and
  sideways), `check-squash.py` (no squashed text, phones and tablets) and `check-scroll.py` (every
  page scrolls; nothing left covering it) all pass.
- Browser walkthroughs (Playwright, Chromium) with touch at phone sizes for each change: dropdowns
  and the time wheel, password eyes, search clear, pairing (drag and drop, filters, labels),
  registration (RSPID questions, NRIC check), warnings, house visits, the trainee page and cards.
- **Not checked:** a real iPhone (Safari) and Android phone, dark mode on the new warning, and
  the real Google Apps Script deployment (local harness only).

## 6. Still open

1. **"Ensure that there are…"** in the minutes is cut off: ask Mr Sadil what it should say.
2. **Telegram** isn't in MINDS's Google Form; it's kept as an optional extra. Confirm with MINDS.
3. **PDPA notice:** the consent text at sign-up should mention NRIC (last 4), address and the
   emergency contact. Draft wording for MINDS to approve.
4. **Existing volunteers** registered before Version 3 haven't answered the new required
   questions. Decide whether to ask them on next sign-in (a "complete your profile" prompt) or
   leave it to admins.
5. Steven's open points still stand: confirm the "What volunteers see" notes reading with Mr
   Sadil, real-phone drag and drop, and dark mode on the newer screens.
6. **Wording to confirm:** whether to keep a few short instructions on volunteer screens (the QR
   pass brightness tip, "Show your pass again at the end to clock out", "Forgot your password? Ask
   an admin to reset it"), and whether times should also use the browser's own picker like dates.

See [TODO.md](TODO.md) for the full list.
