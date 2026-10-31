# MINDS Volunteer Management: Version 4

Changes from the call with MINDS on 29 October 2026. Version 3 is described in
[VERSION-3.md](VERSION-3.md); step-by-step use is in the
[user guide](volunteer-app/docs/USER-GUIDE.md).

## 1. What changed

| Change | Where |
| --- | --- |
| Registration asks for **Full Name (as per NRIC)** (one box) | Registration, Edit my details, Add / Edit volunteer |
| Google Contacts: **first name only**, "Short Name_[Full Name]_Project", e.g. `Xin Yi_[Ng Xin Yi]_RSPID (WGS)`; birthday, 8-digit phone, notes ending "MINDS volunteer." | `gas/Contacts.gs` |
| **Short names across the app**, in alphanumeric order ("Ali 2" before "Ali 10"). When two volunteers (or two trainees) share a short name, both show their full name. Searches still match full names; page titles, press-and-hold cards and edit forms keep the full name | `gas/DisplayNames.gs` (applied to every response) |
| **Google Contacts update when details are saved**, after a short warning ("… which also updates their Google contact"). The Update / Save to Google Contacts button is gone. Becoming a regular or an admin also updates the contact | Edit my details; a volunteer's admin page |
| **"Share with all volunteers"** (was "all future volunteers") | Note sharing |
| **Files on notes:** up to 3 photos, videos or documents (10 MB together) on Send update, session feedback and admins' notes, from the device or Google Drive. Photos are made smaller automatically (longest side 1,600 px). Files are kept in a **private** Drive folder ("MINDS Volunteer App – Note Files") and only opened through the app, by people who may read the note (and the author while it waits for review) | `gas/NoteFiles.gs`; `web/js/ui.js` (`attachPicker`, `attachmentList`) |
| **One database for trainees and house visits:** MINDS's House Visit form responses. Form Responses 1 is the trainee list; the House Visits tab with the visits recorded in the app sits in the same spreadsheet. Settings → Google Sheets shows two databases (volunteers; trainees & house visits) | `gas/Db.gs`, `gas/DataSources.gs`, `gas/Setup.gs` |
| **Google Form submissions show up by themselves:** a new response gets a Trainee ID the next time trainees load. If it's the same trainee again (same full name and NRIC last 4), it gets their ID and the **newest row is their current information**; older rows stay untouched | `gas/Db.gs` (`TraineeTable`) |
| **Add trainee with the House Visit Form:** required (✱) are Project, Full Name, NRIC (last 4), Date of Birth, Spoken Language, Gender, Short Name, and Caregiver 1's name and contact; everything else can be blank and filled in later. The trainee is added as a new row; no visit is recorded. **+ Start New Blank Visit** needs the same answers | Trainees → **Add trainee**; `HOUSE_VISIT.requiredForNewTrainee` in `gas/Config.gs` |
| **Admin home in the Dashboard:** the sidebar's (and admin row's) **Dashboard** opens the Admin home (Create New Session, Session Management, Upcoming Sessions), with **Home · Overview · Activity log** tabs | `web/js/app.js` |
| **Fewer duplicates:** each session action is in one place (Session Management: Pair, Who's coming, Scan, Clock in); Upcoming Sessions cards show the numbers and Copy Info. Removed: the Records card and Regular pairings button (in the sidebar / Pairing), the sidebar's sub-pages (the page's tabs show them), the Admin button on Me. The admin Sessions section is now **All sessions**, so it isn't confused with volunteers' Sessions | `web/js/views/admin.js`, `web/js/app.js` |
| **A more accessible Admin menu:** on phones, **All pages** (first in the admin row) lists every admin page by section, one tap away; on computers, the sidebar lists the sections and each page's tabs show its pages | `web/js/app.js` |

## 2. Upgrading Exp from Version 3

1. Put the code on a branch, push, merge into `main` (with the GitHub secrets set, this updates
   the website and the backend). Keep `volunteer-app/.clasp.json` out of rsync:
   `rsync -a --delete --exclude .git --exclude volunteer-app/.clasp.json …`
2. In the app: **Settings → Advanced settings → Run setup**. It adds the Attachments columns,
   creates the House Visits tab in the trainee spreadsheet and **moves your house visit records
   there** (the old tab in the volunteer sheet is left; you can delete it), and fills in any
   missing Trainee IDs.
3. **Advanced settings → Save all volunteers to Google Contacts**: updates every volunteer's existing contact to the
   new first-name format (and adds any missing). The report says "updated N and added N".
4. Optional: delete the First Name / Last Name columns (from v3.35) from the Volunteers tab, and
   the `VISITS_SPREADSHEET_ID` script property if you set one (no longer used).

## 3. Testing

- `npm test`: **124 passing** (new: short names and clashes; files on notes and who may open
  them; Form submissions getting IDs and the newest row winning; moving house visit records;
  required questions for a new trainee).
- Browser walkthroughs: short names in lists; the save warning; attaching a photo and opening it
  from Notes to review; All pages and the sidebar; Add trainee (✱ marks, missing answers, adding).
- Layout checks: nothing squashed (360, 412 px); every page scrolls; nothing left covering a page.

## 4. Version 4.1: speed, live updates, and a load test

**Why Version 4 felt slower:** showing short names meant reading the volunteer list and the trainee
spreadsheet (MINDS's large House Visit responses) on almost every request.

**What's faster now** (`gas/Speed.gs`):
- **Short-name lists and admin pages are cached** in Apps Script's cache (CacheService). Pages
  that look the same for every admin (trainees, volunteers, pairings, a session, notes to review,
  house visits, pairing history) are cached for up to 2 minutes.
- **A data version** changes with every save, and every cached copy belongs to one version, so
  nobody is shown data from before a change. Edits typed straight into the sheet, or a new Google
  Form response, show within 2 minutes (or straight away after the next save in the app).
- **Live updates:** pairing boards ask "has anything changed?" every 10 seconds (a tiny request
  that doesn't read the sheets) and reload when something has. A pairing changed by one admin
  shows on the other admins' boards within about 10–15 seconds.
- **Busy retries:** Google runs at most **30 requests at once** for the app's account (all requests
  run as the account that deployed it). When it's busy it refuses the extra ones before the app's
  code runs; the app now waits a moment and tries again (up to 3 times), instead of showing an error.

**Load test** (`volunteer-app/dev/load-test.mjs`, needs Node.js 18+):

```bash
cd volunteer-app
node dev/load-test.mjs --url "https://script.google.com/macros/s/AKfycbzHxrOJEAazsDfVYNjkqc09R7jvjHHtwxj6grKVVViXGlkxn3KSRZxFGZN9qbgsNZ8o/exec" --volunteers 100 --admins 10 --minutes 3
```

It signs in volunteers (with the mock database's accounts) and admins, has volunteers use Home,
Me and the guide every 5–20 seconds, and has each admin keep a session's pairing board open and
change a pairing every 20–40 seconds (then put it back). It prints how long requests take (median
and 95%), how many failed or were refused as busy, and **how long each admin's change took to
show on the other admins' boards**. Run it at a quiet time: it uses the Exp app for real.

Locally (the demo, about 0.8 s a request): changes showed on other admins' boards after a median
of 9.7 s (slowest 11.7 s).

## 5. Version 4.2: faster with many users

From the first load test on Exp (100 volunteers, 10 admins): every request took about 2.5 s
before doing any work, saving a pairing took 12.5 s (median, 39 s for 1 in 20) because saves
queued, and changes reached other admins in 10.5 s (27 s for 1 in 20).

- **Who's signed in is remembered** (Apps Script cache, 5 minutes) for reads, instead of reading
  the Volunteers and sign-in tabs on every request. Saves always check the sheet. Anything written
  to those tabs (a profile edit, deactivation, a password change, becoming a regular after 10
  sessions, …) clears the remembered sign-ins at once.
- **Saves hold the lock for less time:** a pairing save writes, releases the lock, then builds the
  updated board for its reply (and caches it for the other admins), so the next save doesn't wait.
- **Live updates every 5 seconds, with the data:** when something changed, the check brings the new
  board back in the same request. Locally another admin's change showed in about 3–4 s
  (load test dry run: median 2.8 s, slowest 5.5 s).
- **Reads are tried once more** after a Google error (HTTP 500); saves aren't, as they may have
  been saved.
- `dev/load-test.mjs` checks every 5 s, as the app does (`--poll` to change).

**What Apps Script can't do:** each request still costs about 1 s of Google's own start-up, at most
30 run at once, and saves are one at a time. For instant syncing with hundreds of people at once,
the long-term option is a real-time database (e.g. Firebase Firestore) with the Google Sheet as a
copy; that's a bigger change.

## 6. Version 4.3: aiming for under 3 seconds

From the second Exp load test: reads were 1.5–1.6 s, but saving a pairing took 40 s (median)
because 10 admins saved faster than one save finished (each held the lock for 3–5 s), and the
waiting saves made other requests slow at the tail.

- **Copies of the tabs** in Apps Script's cache (`gas/Speed.gs`). Reads use a recent copy instead
  of reading Google Sheets (0.5–1 s a tab). Each tab's copy is out of date as soon as the app writes
  to that tab; edits typed into the sheet, or a new Google Form response, show within 60 seconds.
  Saves (inside the lock) and the editor functions (setup, checkConfig, …) always read the sheet
  itself. Turn the copies off with the script property **`TABLE_CACHE` = `off`**.
- **Shorter saves:** the trainee is checked from the recent copy; the Admin Activity Log row is
  appended (`appendRow`, without reading the log) after the lock is released.
- **The Dashboard is cached** for all admins, and a board is built once when many admins ask at once.
- **Boards check every 3 seconds.**

Tab reads per request (`node dev/count-reads.mjs`): volunteerHome 8 → 0, guide 3 → 0,
saving a pairing 12 → 3. Locally another admin's change showed in 2.1–3.1 s.

**Expected on Exp:** reads about 1–1.5 s (Google's own start-up is about 1 s), a pairing save about
2–3 s, another admin's change in about 2–4 s. Apps Script itself sets the floor: about 1 s a
request, 30 at once, saves one at a time.

**4.3.1:** dates read from the copies of the sheets are kept as dates (they could show as
timestamps such as `2025-12-29T12:26:09.000Z`); a test reads a trainee's dates through the copy.

## 7. Version 4.4: design update (with Lovable)

Five design changes suggested in Lovable (the design copy of the repo), checked against the app
and added. Nothing the app does has changed: only layout and looks.

1. A shorter top bar; on phones and tablets the main tabs are in a **bar at the bottom of the
   screen** (`index.html`, `src/input.css`).
2. Home: today's session first, a slim "Feedback needed" line, a compact regular-trainee card
   (`js/views/volunteer.js`).
3. Tighter cards; time and place on one line; small sentence-case labels
   (`js/views/volunteer.js`, `js/views/trainees.js`, `src/input.css`).
4. Softer shadows and slightly smaller corners; indigo stays the primary colour; status colours and
   dark mode kept (`src/input.css`).
5. Admin on phones: **All pages** plus the current section; on computers the **sidebar can shrink
   to icons** (remembered on that computer) (`js/app.js`, `src/input.css`).

Checked before adding: all 130 tests; `check-phones.py` all clean; `check-scroll.py` (every page
scrolls, nothing left over); the bottom action bars sit just above the tab bar; dropdowns near the
bottom open upwards; no style the app uses was lost in the rebuilt `styles.css`. Two fixes on top
of Lovable's files:

- on 280 px phones the slim feedback line squeezed its text to 44 px: the button now moves below
  the text when there isn't room (`.fb-text`);
- things the browser scrolls into view (a field with an error, keyboard focus) could stop behind
  the bottom tab bar: `scroll-padding-bottom` keeps them above it.

**4.4.1: checked against the deployment.** Both GitHub workflows' steps were run on a copy (the
offline-cache stamp, the environment and Apps Script URL in `config.js`, every file the page and
service worker load, every style in the committed `styles.css`, all 27 `.gs` files, the manifest,
the tests). No new Google permissions are needed. Two fixes for real Apps Script:

- Apps Script's cache holds at most **100 KB per entry, counted in bytes**. Big copies were split
  every 90,000 characters, which Chinese text (3 bytes a character, e.g. the House Visit form's
  column names) could push over the limit, so the trainee sheet would never have been cached on
  Exp. Pieces are now 30,000 characters (at most ~90 KB), and the test environment enforces
  Google's real limits (keys 250 characters, values 100 KB, 6 hours).
- The House Visit form's "Map (Fixed)" tab is cached like the others: a trainee page now makes no
  sheet reads at all (it opened the trainee file every time).

**`node dev/check-deploy.mjs`** runs all of these checks in one go (no internet needed) and prints
"ready to deploy" or what to fix. Run it before merging into `main`, e.g. after a Lovable update.

## 8. Version 4.5: 18 design updates (second Lovable round)

From `minds-all-updates-v2.zip` (presentation only; nothing about Apps Script, the sheets or
deployment). New since 4.4: separated boxes, alerts and cards; the admin volunteer page with a
summary card (name, profile labels, email and phone to tap), compact statistics and details
grouped (Contact, Personal, Emergency contact, Admin); the trainee page and admin trainee page
with a **Sections** menu that jumps to (and opens) a section, the first two sections open, label
and answer side by side, readable dates, and two columns on computers; regular volunteers in a
green box; roomier pairing cards and columns, larger touch targets, dialogs that fit; **All
pages** also in the computer sidebar; the phone admin menu with full-width choices and a fixed title.

The overlay was built on 4.4 before 4.4.1, so it was merged, not copied over. Kept from 4.4.1:
the 280 px feedback line (`.fb-text`) and `scroll-padding-bottom` above the bottom tab bar. Changed
from the overlay: the House Visit **guide text stays visible under each question** (the overlay
made it a hover tooltip, which phones can't show; AGENTS: "guide text under questions"); comments
say "Design update" rather than "Version 5"; an unused `pb-show-both` class removed.

Checked: `dev/check-deploy.mjs` ready to deploy (130 tests); `check-phones.py` all clean;
`check-squash.py` (280–768 px) nothing squashed; `check-scroll.py` clean; in a browser the
Sections menu, guide text, dates, the volunteer summary card and the sidebar's All pages work.

## 9. Version 4.6: design improvements 19–36 (third Lovable round)

From `minds-all-updates-v3.zip` (presentation only, 12 website files; the service-worker
registration is unchanged). Easier to read on phones: names, dates and details wrap instead of
being cut off; phone record cards with label/value rows (attendance cards titled with the
volunteer's name); labelled pairing searches ("Volunteers", "Trainees"); trainee IDs in the
trainee directory; the Activity log with labelled filters and readable action names; tidier Me
page, QR pass, session choices, settings, More pages and house visits; larger touch targets and
16 px form text on phones. The sign-in page adds the hint "Use the email registered with MINDS."
(listed in TODO.md under wording to confirm).

Like 4.5's overlay it was built on the overlay before 4.5's merge, so it was merged again, not
copied: the 280 px feedback line, `scroll-padding-bottom` above the tab bar, guide text visible
under House Visit questions, "Design update" comments, and two unused classes removed
(`pb-show-both`, `review-item`). One layout problem it introduced was fixed: on phones every
cut-off line now wraps, which squeezed rows that also hold buttons (Settings lists: 88 px of
360 px; All sessions: 106 px of 280 px). In lists you can reorder, the buttons now move under
the name; in other rows a group of buttons or badges moves below once the text would get under
10rem.

Checked: `dev/check-deploy.mjs` ready to deploy (130 tests); `check-squash.py` at 280, 320, 360,
412 and 768 px nothing squashed; `check-phones.py` all clean; `check-scroll.py` clean; in a
browser the pairing searches filter, attendance cards, Activity log filters, the sign-in hint and
the two fixed rows.

## 10. Version 4.6.1: design faults found on a real iPhone

Two problems seen on Exp (v4.5) on an iPhone, which the layout checks (run in Chrome) had missed:

- **Activity log dates:** the From / To date boxes were blank, unlabelled and stuck out past the
  screen edge. iPhone Safari gives a date box its own minimum width and shows an empty one as
  blank. Date boxes now never get wider than their box; on iPhones and iPads they fill it and an
  empty one says **"Any date"** (filters) or **"Choose a date"** (forms) (`controls.js`, only on
  those devices). From / To have labels (4.6).
- **Pairing board squashed:** Lovable's second and third rounds made +Trn / +Vol take a row of
  their own and the buttons and name chips 2.75rem tall, so names broke ("Mock Trainee / 1").
  Those 57 lines of pairing size rules were removed from `input.css` and the same 42 rules from
  the built `styles.css` (matched by selector, properties and values), so the board measures
  exactly as in v4.3.1 (card 106 px tall at 393 px). The name now has the card's full width and
  +Trn / +Vol sits at the end of the row below; on phones under 380 px names and chips are a
  little smaller. Names fit on one line from 375 px; at 320 px (2016 iPhone SE) a long name in a
  chip wraps between words.

Found by a new check, **`dev/check-fit.py`**, which (unlike `check-squash.py`) looks inside the
pairing board: controls sticking out of their box or past the screen edge, short labels breaking
across lines, and date boxes with no visible label. It also found, and these were fixed: table
buttons squeezed on tablets ("Deactivate" 36 px, "Fix", "Who can read"; they now stay on one line
and the table scrolls), and the Hours search box squeezed to 59 px by a phone-only rule that
applied at every width.

**Activity log wording:** a house visit was described by its field names ("traineeId, date,
family, …"); entries now use the message the admin saw ("Priya Nair added as T-0101.") and 17
actions got readable names ("Recorded a house visit", "Added an outing", …). New test (131).

Checked: `check-deploy.mjs` ready to deploy; `check-fit.py` all fit except the 320 px chips;
`check-squash.py` (280–768), `check-phones.py`, `check-scroll.py` clean. Safari itself couldn't be
run here: the iPhone date behaviour was checked by simulating it in Chrome, so check the Activity
log's From / To on a real iPhone after deploying.

## 11. Version 4.7: back to the Version 4.3 design, keeping four things

MINDS asked to return to the design from before the Lovable updates (4.4–4.6), keeping:

1. **All pages**: on phones the admin row shows All pages and the current section; All pages
   lists every admin page (full-width choices on phones). Also in the computer sidebar.
2. **Tabs at the bottom** of the screen on phones and tablets.
3. **The shrinkable sidebar** on computers.
4. **Organised information**: details grouped under small headings (Contact, Personal,
   Emergency contact, Admin) with short labels ("NRIC (last 4)") and readable dates ("15 Jan
   2000"), on **Me** and an admin's volunteer page; a trainee's House Visit details with the
   **Sections** menu, question and answer side by side (guide text under the question) and two
   columns on computers.

How: the website files are Version 4.3's (`index.html`, `kit.js`, `attendance.js`, `auth.js`,
`admin.js`, `volunteer.js`, `trainees.js`), with the four kept features and every fix since then
added back (iPhone date boxes, compact pairing cards with the name on its own row, labelled
pairing searches, labelled Activity log filters, files on notes). The stylesheet is Version 4.3's
plus one commented block at the end ("Kept from the design updates"), so the Lovable layers are
gone. The sign-in hint added in 4.6 went with it.

Consistency fixes found while checking:

- Pairing board: the **Trainees** heading was centred and **Volunteers** left-aligned; both are
  left-aligned, with ALL / PAIRED on the right.
- **All pages** had the same list icon as **More** (identical in the shrunk sidebar): it now has
  its own grid-of-dots icon.
- The Sections button's list icon was blank (missing from `ui.js`).
- An admin's volunteer page right-aligned its answers while Me left-aligned them: both left-aligned,
  label above answer on phones and side by side from 480 px (as House Visit details).
- Small buttons stay on one line (Hours: All time / This month / This year wrapped at 320 px; "Who
  can read" at 768 px); that row now wraps instead.

Checked: `check-deploy.mjs` ready to deploy (131 tests); `check-fit.py` all fit except the known
320 px pairing chips; `check-squash.py` (280–768) nothing squashed; `check-phones.py` all clean;
`check-scroll.py` clean; phone and computer screenshots reviewed.

## 12. Version 4.7.1: date boxes on iPhone and iPad; pairing filter with Unpaired

**Date box too small (seen on an iPhone, New session):** an empty date box in Safari has almost
no width of its own. The wrapper that shows "Choose a date" sat in a row (date and its ✕) and
shrank around it, to 34 px. The wrapper now fills its row, and any labelled block holding a date
box keeps at least 10rem on iPhone and iPad (Attendance / Hours From and To were 34 px side by
side on an iPad). Pop-up form buttons ("Create fundraiser") keep their words on one line; the row
wraps on narrow phones.

**Found with an iPhone mode for `dev/check-fit.py`** (`--ios`): Chrome pretends to be iPhone
Safari (the iOS-only CSS applies, and empty date boxes lose their built-in width, as in Safari).
It reproduced the New session bug before the fix (34 px) and passes after it. The check also
flags boxes too small to use (text and date under 7rem, numbers under 4rem), and now covers the
signed-out pages (sign-in, registration) and the pop-ups with date boxes (Add volunteer, New
fundraiser, New outing, New trip, Edit trainee).

**Pairing filter:** each column's button now goes **ALL → UNPAIRED → PAIRED → ALL**. UNPAIRED is
red, like the "N unpaired" count, so it's clear the list is filtered.

Checked: `check-deploy.mjs` ready to deploy (131 tests); `check-fit.py --ios` at 320, 375, 393,
430 and 768 px and `check-fit.py` all fit (except the known 320 px pairing chips);
`check-squash.py`, `check-phones.py`, `check-scroll.py` clean; the filter cycle tested in a browser.

