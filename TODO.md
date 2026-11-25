# To do

What's still open after Version 4.9 (November 2026): decisions MINDS needs to make, features
not built yet, and things to check before real volunteers use the app. For how to pick these up,
see [FUTURE-CONTRIBUTIONS.md](FUTURE-CONTRIBUTIONS.md). Tick items off as
they're done, and move finished ones into `PROGRESS.md`.

Sources: the October meeting minutes and call 2 with MINDS, `VERSION-3.md` §6, the 31 October
testing feedback (`VERSION-4.md` §13), and the "Limits of this prototype" section of
`volunteer-app/README.md`.

**Contents**

- [Latest: 31 October testing feedback](#latest-31-october-testing-feedback)
1. [Waiting for MINDS to decide](#1-waiting-for-minds-to-decide)
2. [Not built yet](#2-not-built-yet)
3. [Built, but check before launch](#3-built-but-check-before-launch)
4. [Tidy-ups](#4-tidy-ups)
5. [Left out on purpose](#5-left-out-on-purpose)
6. [From MINDS's web app template](#6-from-mindss-web-app-template-not-built-yet)
7. [Check on a real iPhone](#7-check-on-a-real-iphone-from-471)

---

## Latest: 31 October testing feedback

Done in Version 4.8 / 4.8.1 (`VERSION-4.md` §13–14):
- [x] "I've read the guide" unlocks only at the end of the guide
- [x] Press and hold on a name opens the card on the first try
- [x] Removing a volunteer from a session is instant; cancelling a session no longer holds up other admins
- [x] Simple user guide for new admins (`volunteer-app/docs/USER-GUIDE.md`)
- [x] Automatic clock-out at the session's end time (Advanced settings switch)
- [x] Session spots removed (`SESSION_SPOTS: false`; can be switched back on)
- [x] Notes go to the trainee's own volunteers by default
- [x] Admins are always regulars; only **Remove admin access** on an admin's page
- [x] Website deploy fixed; a wrong admin password says so

Done in Version 4.9 (`VERSION-4.md` §15):
- [x] Past sessions: your own on **Sessions → Past**; every past session's pairings, hours and notes on **All sessions → Past sessions**

Still open:
- [ ] **Reminders** the day before a session. Decide with MINDS: **email** (simplest; Apps Script
  MailApp has a daily quota, roughly 100 a day on a personal Gmail account, more on Workspace) or
  a **Telegram bot** (free; each volunteer starts the bot once). Two kinds:
  - [ ] volunteers: "You're coming to … tomorrow, paired with …"
  - [ ] admins: the next day's numbers, who's unpaired, and a **Things to bring** checklist
    (a new field on sessions and outings)
- [ ] Turn on automatic clock-out on Exp and watch a session or two (check the **Auto clock-out**
  rows in Attendance); then decide whether 60 minutes after the session is right
- [ ] Press and hold on a real iPhone and Android phone (see 3.1)
- [ ] Tell MINDS that notes now go to the trainee's own volunteers by default, and confirm that's
  what they want (PDPA: fewer people see each note than before)
- [ ] Optional: cancelling a session also cancels its bookings and tells the volunteers (today
  they just stop seeing it)

---

## 1. Waiting for MINDS to decide

### 1.1 Which trainee details volunteers and regulars see by default
- [ ] MINDS confirms the default lists ("pending recheck" in the minutes)
- **Now:** volunteers see the short name, gender, language, allergies and dietary
  restrictions, activities to avoid, and the Behaviour and Abilities / Skills sections.
  Regulars see everything. Admins can already change both in the app. The short name, gender
  and language beside the trainee's photo follow the same settings.
- **When decided:** update `TRAINEES.visibleTo` in `gas/Config.gs` (the starting point for new
  setups), or set it in the app under Admin → Trainees → What volunteers see.

### 1.2 Registration fields
- [x] Sign-up follows MINDS's "Consolidated Volunteer Records" Google Form, question for question
  (VERSION-3.md); emergency contact (relationship and number) is back, as the form requires it
- [ ] MINDS to confirm Telegram stays as an extra question (it isn't in their Google Form)
- [ ] Add NRIC (last 4), address and emergency contact to the personal data notice wording (PDPA)

### 1.3 Sessions and outings
- [x] Adding a session is just picking dates: "Regular session", 2:30–5:30 pm, Woodlands are
  pre-filled dropdowns (`SESSION_OPTIONS` in `gas/Config.gs`; add more names or time slots there)
- [ ] Mr Sadil to confirm the editing side (the edit form still shows every field), and whether
  other session names or time slots are needed
- [ ] Decide how session attendance and outing attendance relate (discuss in person)
- [x] House visits follow MINDS's House Visit Form (More → House visits), including blank
  visits for new trainees
- [ ] Decide whether outings and fundraising stay in this app or are removed (they're kept
  under Admin → More). Overseas trip attendance stays separate.


### 1.4 Google account for production
- [ ] MINDS provides the Google account the live app runs as (owns the sheets, the Apps Script
  project and the guide's Drive folder)
- [ ] Check that account allows "anyone with the link" sharing. Guide pictures / PDFs and
  trainee photos depend on it, because volunteers don't sign in to Google.

### 1.5 Wording to confirm
Explanatory lines were removed throughout Version 3; these few were kept because they tell
people what to do. Keep, shorten or remove?
- [ ] QR pass: "Turn your screen brightness up if the scan is slow."
- [ ] QR pass after clocking in: "Your clock-in was recorded at … Show your pass again at the end
  to clock out." (or just "Clocked in at …")
- [ ] Sign-in: "Forgot your password? Ask an admin to reset it." (there's no self-service reset)
- [ ] Edit my details: "Needed to change your email." under the current-password box
- [ ] Hours: "Only completed records count."
- [ ] Admin password page: the one-line "Forgotten it?" box
- [ ] Guide, before it's read: "Please read this before your first session."
- [ ] A volunteer's page: "3 more to become a regular" under Sessions attended (a figure, kept)
- [ ] Should **Update Google contact** warn first? (It only refreshes that person's contact.)
- [ ] The pairing board's **✕** doesn't warn, so pairing stays quick (one drag undoes it). OK?
- [ ] Times use an HH · MM wheel; dates use the browser's calendar. Should times also use the
  browser's own picker?
- [ ] The outing app has its filter on the Volunteers column only; ours has one on each column
  (call 2 asked for both). OK?

---

## 2. Not built yet

### 2.1 Trainee photos (built; consent to confirm)
- [x] Admins add, change or remove a photo on the trainee's admin page (upload, or a Google Drive
  link); a placeholder shows until there is one
- [ ] Confirm with MINDS that caregivers agree to volunteers seeing trainee photos (PDPA). Today
  everyone who can open the trainee sees the photo: their paired volunteer, regulars and admins.
- [ ] Optional: let admins hide photos from volunteers (like other details, in
  `gas/TraineeInfo.gs` → `basicsFor_`)

### 2.2 Google Contacts sync (built; to switch on and confirm)
- [x] New and admin-added volunteers are saved to the Google account the app runs as (name,
  email, +65 phone, Telegram in the notes, a label); edits update the same contact (`gas/Contacts.gs`)
- [ ] Exp: add the People API service, set `CONTACTS_SYNC` = `on` and `CONTACTS_LABEL` =
  `MINDS Volunteers (Exp)`, run `testContactsAccess()`, publish a new version (README → Google Contacts sync)
- [ ] MINDS to confirm the production Google account, and add a sentence about saving contacts
  to the registration consent notice (PDPA)
- [ ] Decide what happens to a Google contact when a volunteer is deactivated (today: kept; their upcoming sessions are cancelled)

### 2.3 Attendance for special events and committee roles
- [ ] A page to record who helped at a special event or held a committee role, and their hours
- **Suggested:** an event type on sessions (e.g. `Session Type`: session / special event /
  committee), or a separate "Event Attendance" tab, so the hours report can include or
  exclude them.

### 2.4 Choosing guide files from Google Drive inside the app
- [ ] Optional: a "Choose from Drive" button (Google Picker) instead of pasting a share link
- **Needs:** a Google Cloud project with an OAuth client ID and API key for the GitHub Pages
  site. Pasting a link works today without any of that.

### 2.6 Trainee IDs for new form responses
- [ ] New House Visit form responses only get a Trainee ID when someone runs setup again
  (Advanced settings → Run setup). Blank visits recorded in the app get one straight away.
- **Suggested:** an "on form submit" trigger (or a nightly one) that runs `fillTraineeIds_()`
  from `gas/Setup.gs`.

### 2.7 Test-round tools
- [x] Copy the volunteer database before a test round: Admin → Settings → Google Sheets → Create New Sheet
- [ ] `MAINTENANCE_MODE`: a switch that pauses sign-ups and scanning while fixing a problem

---

## 3. Built, but check before launch

### 3.1 Test on real phones (live HTTPS site)
- [ ] QR scanning with two phones, and with a pass shown on a laptop screen (the jsQR decoder
  was only tested with a simulated camera)
- [ ] Press-and-hold for contact details on iPhone and Android (the "needs two tries" bug was fixed in 4.8 in an emulated phone)
- [ ] Guide PDFs in the Google Drive preview on iPhone Safari
- [ ] Offline: scan with no signal, then upload; QR pass with no signal
- [ ] Dark mode on the newer screens (pairing board, Admin home, trainee pages, guide editor,
  dropdowns, warnings, Add Files)
- [ ] Dropdowns (open below the box) and the time wheel on iPhone Safari and Android Chrome
- [ ] Scrolling: a page once stopped scrolling in Chrome's phone view; the likely cause (an
  invisible dropdown layer) was removed in v3.27. Confirm on real phones, and note the steps if
  it happens again
- [ ] Drag and drop on real phones (pairing board: drag sideways; guide editor: the ⠿ handle).
  Tested in an emulated iPhone 12 (Chromium) only, not iOS Safari or a real Android phone

### 3.2 Pairing with real numbers
- [ ] Try the pairing board with a real-sized session (30+ volunteers, 100 trainees) on a phone
- [ ] Paste MINDS's existing regular pairings into the Regular Pairings tab and check every
  name is matched (unmatched rows are skipped quietly; consider showing them to admins)

### 3.3 Security and privacy review
- [ ] Passwords use iterated HMAC-SHA256 (Apps Script has no bcrypt); review before launch
- [ ] Emails aren't verified; anyone can register with any email
- [ ] PDPA: who can see which trainee details, photos (2.1) and volunteer contact details
- [ ] Remove `FIRST_ADMIN_EMAIL` after the first admin is made
- [ ] Note the admin password `setup()` shows in the Execution log, give it to the admins, and
  have them change it (Settings → Admin password)

### 3.4 Exp is on Version 4.9
- [x] Exp upgraded (deploys run from `main` through GitHub Actions)
- [ ] Try the House Visit Form against a **copy** of the House Visit responses, not the live sheet

### 3.5 Before production
- [ ] Set up the Prod Apps Script project and sheets as in `volunteer-app/README.md` Part 3, with
  MINDS's Google account (1.4)
- [ ] Approve every permission in the editor once (including triggers, for automatic clock-out),
  note the admin password from `setup()`, and decide whether to turn automatic clock-out on
- [ ] Do 3.1 and 3.3 first

---

## 4. Tidy-ups

- [ ] The backend workflow (`.github/workflows/volunteer-app-gas.yml`) still uses `actions/checkout@v4`
  and `actions/setup-node@v4`, which GitHub warns about (Node 20 is deprecated). Move them to v5, as
  the website workflow did in 4.8.1.
- [ ] Rebuild Tailwind with internet access (`npm run build:css`) and commit `web/styles.css`.
  Version 2 added a few hand-written fallback rules at the end of it so the local demo looks
  right without a rebuild; the CI deploy rebuilds it anyway.
- [x] Dates and timestamps from MINDS's sheet show as "29 Dec 2025" (no time)
- [ ] The fictional demo spreadsheet `docs/demo-data/MINDS-Volunteer-Demo-Data.xlsx` is in the
  Version 1 format (no Version 2 tabs; `setup()` adds them). Refresh it from the local demo.
- [ ] Optional: a printable "upcoming sessions" page for volunteers to send to caregivers (the
  Sessions page and the admin Pairing list can already be screenshotted).
- [ ] Optional: show admins which Regular Pairings rows couldn't be matched to a volunteer or
  trainee (see 3.2).

---

## 5. Left out on purpose

- (Now built, for admins: Pairing → History. See PROGRESS.md session 17.)
- **Automatic pairing of volunteers** (Version 1's "fewest pairings" rule): replaced, at
  MINDS's request, by regulars' fixed trainees and admins pairing everyone else.
- **Separate admin login:** the minutes suggested a separate admin profile; later guidance was
  admin access on a volunteer's own account, protected by a shared admin password to make or remove an admin, and an
  activity log. Revisit only if MINDS asks.

## 6. From MINDS's web app template (not built yet)

- [ ] One-click code backup to a Google Doc (Admin → Settings), as the template describes
- [ ] CacheService write-through caching and stale-payload rejection, if many admins use the
  pairing board at the same time
- [ ] Decide with MINDS whether the single-page layout is acceptable, or whether they want the
  template's one-page-per-area structure (large change)

## 7. Check on a real iPhone (from 4.7.1)

- [ ] New session: the date box fills the row and says "Choose a date"; Attendance and Hours From / To on an iPad.
- [ ] Pairing: the column button goes ALL → UNPAIRED → PAIRED.
- [ ] Activity log (Dashboard → Activity log): From / To fit the screen and say "Any date" when empty;
  picking a date shows it. Same for Attendance and Hours date ranges.
- [ ] Pairing board: cards compact, names on one line, +Trn / +Vol beside the project.
- Known limit: on 320 px phones (2016 iPhone SE) a long trainee name in a pairing chip wraps
  between words.

