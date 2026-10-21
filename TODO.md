# To do

What's still open after Version 2 (October 2026): decisions MINDS needs to make, features
not built yet, and things to check before real volunteers use the app. Tick items off as
they're done, and move finished ones into `PROGRESS.md`.

Sources: the October meeting minutes with MINDS, `VERSION-2.md` §2 and §5, and the
"Limits of this prototype" section of `volunteer-app/README.md`.

**Contents**

1. [Waiting for MINDS to decide](#1-waiting-for-minds-to-decide)
2. [Not built yet](#2-not-built-yet)
3. [Built, but check before launch](#3-built-but-check-before-launch)
4. [Tidy-ups](#4-tidy-ups)
5. [Left out on purpose](#5-left-out-on-purpose)

---

## 1. Waiting for MINDS to decide

### 1.1 Which trainee details volunteers and regulars see by default
- [ ] MINDS confirms the default lists ("pending recheck" in the minutes)
- **Now:** volunteers (ad hoc) see the short name, gender, language, allergies and dietary
  restrictions, activities to avoid, and the Behaviour and Abilities / Skills sections.
  Regulars see everything. Admins can already change both in the app.
- **When decided:** update `TRAINEES.visibleTo` in `gas/Config.gs` (the starting point for new
  setups), or set it in the app under Admin → Trainees → What volunteers see.

### 1.2 Registration fields
- [ ] Get MINDS's volunteer registration Google Form (it's in the shared Drive)
- [ ] Match the sign-up form to it
- [ ] Drop the emergency contact if MINDS confirms only Telegram is needed
- **Where:** `gas/Auth.gs` (`register_`), `gas/Profile.gs` (`PROFILE_FIELDS`, `profilePatch_`),
  `gas/Config.gs` (`TABLES.users`), `web/js/views/auth.js`, `web/js/views/profile.js`, and
  the volunteer edit form in `web/admin/js/views/people.js`.

### 1.3 Sessions and outings
- [x] Adding a session is just picking dates: "Regular session", 2:30–5:30 pm, Woodlands are
  pre-filled dropdowns (`SESSION_OPTIONS` in `gas/Config.gs`; add more names or time slots there)
- [ ] Mr Sadil to confirm the editing side (the edit form still shows every field, with "MINDS is
  reviewing how sessions are set up"), and whether other session names or time slots are needed
- [ ] Decide how session attendance and outing attendance relate (discuss in person)
- [ ] Decide whether outings, fundraising and house visits stay in this app or are removed
  (they're kept under Admin → "Later (placeholders)"). Overseas trip attendance stays separate.

### 1.3b Project descriptions
- [ ] MINDS to check the short descriptions of **West End (WE)** and **Regular Service Project for
  the Intellectually Disabled (RSPID)** shown in the Volunteer Guide (written as placeholders;
  admins can edit them under Settings → Guide & projects)

### 1.4 More than one trainee per regular?
- [ ] Confirm. The minutes say a regular may be paired with more than one trainee; we built
  **one trainee per volunteer** (as asked later). A trainee can already have several volunteers.
- **If yes:** the booking row holds one trainee today (`Bookings` → `Trainee ID`); it would need
  a list of trainees per booking, and the pairing board would need to allow several.

### 1.5 Google account for production
- [ ] MINDS provides the Google account the live app runs as (owns the sheets, the Apps Script
  project and the guide's Drive folder)
- [ ] Check that account allows "anyone with the link" sharing. Guide infographics depend on
  it, because volunteers don't sign in to Google.

---

## 2. Not built yet

### 2.1 Trainee photos (built; consent to confirm)
- [x] Admins add, change or remove a photo on the trainee's admin page (upload, or a Google Drive
  link); a placeholder shows until there is one
- [ ] Confirm with MINDS that caregivers agree to volunteers seeing trainee photos (PDPA). Today
  everyone who can open the trainee sees the photo: their paired volunteer, regulars and admins.
- [ ] Optional: let admins hide photos from ad hoc volunteers (like other details, in
  `gas/TraineeInfo.gs` → `traineeBasics_`)

### 2.2 Google Contacts sync
- [ ] When a volunteer registers, add them as a Google contact in an admin account, with their
  Telegram handle in the contact's notes (mock-up account: vcoder302026@gmail.com)
- **Needs:** the **People API** advanced service turned on in Apps Script, the
  `https://www.googleapis.com/auth/contacts` scope in `appsscript.json`, and the owner
  re-authorising.
- **Where:** call it from `register_` in `gas/Auth.gs` (and `createVolunteer_` in
  `gas/Dashboard.gs`). Don't let a Contacts failure stop the registration; log it instead.

### 2.3 Attendance for special events and committee roles
- [ ] A page to record who helped at a special event or held a committee role, and their hours
- **Suggested:** an event type on sessions (e.g. `Session Type`: session / special event /
  committee), or a separate "Event Attendance" tab, so the hours report can include or
  exclude them.

### 2.4 "By Thursday, who's coming on Saturday"
- [ ] Each week, tell admins who has signed up for the weekend's sessions, and who still needs
  pairing
- **Suggested:** a time-driven trigger in Apps Script (Thursday evening) that emails the admins
  a summary built from `adminHome_`. A Telegram bot message would need a bot token.
- The Dashboard and Sessions pages already show who's coming; this is the reminder.

### 2.5 Choosing infographics from Google Drive inside the app
- [ ] Optional: a "Choose from Drive" button (Google Picker) instead of pasting a share link
- **Needs:** a Google Cloud project with an OAuth client ID and API key for the GitHub Pages
  site. Pasting a link works today without any of that.

### 2.6 Trainee IDs for new form responses
- [ ] New House Visit form responses only get a Trainee ID when someone runs `setup()` again
- **Suggested:** an "on form submit" trigger (or a nightly one) that runs `fillTraineeIds_()`
  from `gas/Setup.gs`.

### 2.7 Test-round tools
- [ ] `snapshot()`: copy the Exp sheet before a test round (planned in README Part 3, Stage 9)
- [ ] `MAINTENANCE_MODE`: a switch that pauses sign-ups and scanning while fixing a problem

---

## 3. Built, but check before launch

### 3.1 Test on real phones (live HTTPS site)
- [ ] QR scanning with two phones, and with a pass shown on a laptop screen (the jsQR decoder
  was only tested with a simulated camera)
- [ ] Press-and-hold for contact details on iPhone and Android
- [ ] Guide PDFs in the Google Drive preview on iPhone Safari
- [ ] Offline: scan with no signal, then upload; QR pass with no signal
- [ ] Dark mode on the new screens (pairing board, Admin menu, trainee pages, guide editor)

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

### 3.4 Upgrade the live Exp setup to Version 2
- [ ] Follow `VERSION-2.md` §4: new `.gs` files, `appsscript.json` (Drive permission),
  `TRAINEE_SPREADSHEET_ID` as the trainee tab's URL, run `setup()`, publish a new version

---

## 4. Tidy-ups

- [ ] Rebuild Tailwind with internet access (`npm run build:css`) and commit `web/styles.css`.
  Version 2 added a few hand-written fallback rules at the end of it so the local demo looks
  right without a rebuild; the CI deploy rebuilds it anyway.
- [ ] Dates of birth in the mock data show a time (e.g. `1969-11-02 13:26:30`). Real form
  responses are dates, but consider formatting date-only columns without the time.
- [ ] The fictional demo spreadsheet `docs/demo-data/MINDS-Volunteer-Demo-Data.xlsx` is in the
  Version 1 format (no Version 2 tabs; `setup()` adds them). Refresh it from the local demo.
- [ ] Optional: a printable "upcoming sessions" page for volunteers to send to caregivers (the
  Sessions page and the admin Pairing list can already be screenshotted).
- [ ] Optional: show admins which Regular Pairings rows couldn't be matched to a volunteer or
  trainee (see 3.2).

---

## 5. Left out on purpose

- (Now built, for admins: Pairing → History. See PROGRESS.md session 17.)
- **Automatic pairing of ad hoc volunteers** (Version 1's "fewest pairings" rule): replaced, at
  MINDS's request, by regulars' fixed trainees and admins pairing everyone else.
- **Separate admin login:** the minutes suggested a separate admin profile; later guidance was
  admin access on a volunteer's own account, protected by a shared admin password to make or remove an admin, and an
  activity log. Revisit only if MINDS asks.
