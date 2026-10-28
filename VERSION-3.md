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
| Paired / Unpaired / All filters | Done (Steven) | Each column of both boards |
| Drag and drop, for regular volunteers and trainees | Done (Steven), touch and mouse | Both pairing boards |
| Paired trainees and volunteers more obvious | Done (Steven): green edge and ✓ | Both pairing boards |
| Follow the outing pairing interface | Done (Steven) | Pairing |
| **Feedback notes** | | |
| Share with all future volunteers / regulars only / selected volunteers / keep private | Done (Steven) | Trainees → Notes to review |
| Filter what volunteers see, linked to volunteer updates | Done (Steven); his reading still to confirm with Mr Sadil | What volunteers see |
| **Volunteer registration** | | |
| Follow the fields in the Google Form | **Done in Version 3**: question for question (Steven's list was a placeholder, as the form wasn't available then) | Register, Me, Edit my details, admin volunteer page |
| **Minor details** | | |
| Drag and drop instead of arrows on the guide page | Done (Steven) | Settings → Guide & projects |
| "Ensure that there are…" | **Unclear**: the sentence is cut off in the minutes | Ask Mr Sadil |
| Make sure the mobile view works properly | **Checked again in Version 3** at 360 px (small Android) with touch: no sideways scrolling on 40 pages, no errors | All pages |
| **Added after call 2** | | |
| Warning when making someone an admin or deactivating an admin | **Done in Version 3** | Admin → Volunteers |

## 2. What's new in Version 3

### 2.1 Registration = MINDS's "Consolidated Volunteer Records" Google Form

| # | Google Form question | In the app | Check |
| --- | --- | --- | --- |
| 1 | Short Name \* | Personal particulars | Required; used in "Welcome, …" and Google Contacts |
| 2 | Full Name \* | Your account | Required |
| 3 | NRIC (Last 4 Alphanumeric, e.g. 123A) \* | Personal particulars 🔒 | 3 digits and a letter, saved in capitals |
| 4 | Project \* (RSPID (CTDC), RSPID (WGS), West End, RSPID (CTDC) Alumni, RSPID (WGS) Alumni) | Project | One choice |
| 5 | Course and Year [RSPID Volunteers] | Project | Asked only for RSPID projects |
| 6 | Matriculation Number [RSPID Volunteers] | Project 🔒 | Only for RSPID; letters and numbers, saved in capitals |
| 7 | School Email [RSPID Volunteers] | Project | Only for RSPID; a valid email |
| 8 | Email [To Receive Newsletters] \* | Your account | Valid email; **this is the sign-in email**, with the form's advice not to use a school email |
| 9 | Contact No \* | Your account | +65 and 8 digits |
| 10 | D.O.B \* | Your account | Not in the future |
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
  volunteers, never on quick cards for volunteers, and **never saved to Google Contacts**. The
  form says so under each of these questions.
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

**Behaviour change:** deactivating someone also **takes them off their upcoming sessions** (their
sign-ups are marked cancelled, not deleted), so deactivated people no longer sit on session lists
and pairing boards. Hours, attendance, notes and pairing history are kept.

### 2.3 Project names match the form

- The Woodlands projects are now **"West End"** and **"RSPID (WGS)"** (WGS = Woodlands Gardens
  School), as in the form, instead of "West End (WE)" and the long RSPID name.
- `setup()` renames them on the Projects tab and in every session that lists them, once
  (`PROJECT_RENAMES` in `gas/Config.gs`). New sessions tick both by default, as before.
- Badges show the name itself when it's short ("West End", "RSPID (WGS)").

### 2.4 Smaller changes

- Google Contacts (when sync is on): saved as **"Short Name (Full Name)"**, e.g. "Mei (Tan Mei
  Ling)", with Project and the emergency contact in the notes. Editing the short name, project
  or emergency contact updates the contact.
- Home greets volunteers by their short name: "Welcome, Mei!".
- The volunteer list knows each person's upcoming sign-ups, so the deactivation warning gives
  the exact number.

### 2.5 Consistent with MINDS's other apps

The app keeps the look and behaviour of the Trainee House Visit, CSL Attendance and Overseas
Trip Planner apps (the rule and the full list of shared patterns are in `AGENTS.md`). Version 3
adds the ones that were missing:

- **Wheel date picker** (House Visit's "Rolodex"): every date box (D.O.B, session dates,
  attendance, trips, …) opens a sheet with day / month / year wheels and Cancel / Confirm.
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
- The wheel date picker can be **dragged with a mouse** on computers and vibrates slightly per step
  on phones, like the template's Rolodex engine.

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
  stable"), the date wheel, a project dropdown, and a fixed Submit bar.
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
3. As the admin: **Volunteers → Vera → Make an admin**. Read the warning; **Make an admin**
   stays grey until you tick the box and type `admin-demo-2026`.
4. **Deactivate** Vera: the warning says how many upcoming sessions she's taken off. Check a
   session: she's gone from it. **Reactivate** her: her hours are all still there.
5. **Deactivate** Sam from the list: a warning, but no password (he isn't an admin).
6. Sessions: badges read **West End** and **RSPID (WGS)**.
7. Everything from Steven's update still works: Pairing (drag and drop, ✕, filters), notes sharing,
   guide drag and drop. See STEVEN-UPDATE.md §3.

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

- `cd volunteer-app && npm test`: **108 passing** (103 from Steven's update, 5 new: formats,
  required questions, deactivation, project rename, Google Contacts). Three older tests were
  updated for the new project names and the real form questions.
- Browser walkthrough (Playwright, Chromium) at **360 px with touch**: the wheel date picker (registration, New session with two dates, inside the Add volunteer pop-up), password eyes, search clear, the pairing Saved pill, Add / Edit volunteer; registration (sections,
  RSPID questions appearing and disappearing, NRIC check, short-name greeting), both warnings
  (button disabled until ticked and password typed; messages after), deactivating a volunteer
  without a password; **40 pages** as admin, regular and volunteer with no sideways scrolling and
  no errors.
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
   Sadil, real-phone drag and drop, dark mode, and new screenshots (STEVEN-UPDATE.md §6).
