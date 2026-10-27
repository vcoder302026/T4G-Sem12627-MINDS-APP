# Steven's update: Mr Sadil's feedback on Version 2

Session hand-off, 27 October 2026. Branch `steven-update` (from `main` at `12920f8`).
Everything is in `volunteer-app/`. Prototype 1 (repository root) is unchanged.

**Contents**

1. [What was asked and what was done](#1-what-was-asked-and-what-was-done)
2. [How each change works](#2-how-each-change-works)
3. [Try it](#3-try-it)
4. [Testing](#4-testing)
5. [Upgrading the live (Exp) setup](#5-upgrading-the-live-exp-setup)
6. [Open points for the next session](#6-open-points-for-the-next-session)
7. [Files changed](#7-files-changed)

---

## 1. What was asked and what was done

| Feedback point | Status | Where |
| --- | --- | --- |
| **Trainee pairing** | | |
| One trainee to multiple volunteers | **Done** (already possible; kept) | Admin → Pairing |
| Enable one volunteer to multiple trainees | **Done**, for sessions and for regulars' fixed trainees | Pairing board, Regular pairings |
| Follow the house visit form for trainee details | **Done**: details are grouped and coloured like the House Visit form, each question with its guide text under it (e.g. "Current Health Condition" / "近期的身体状况") | Trainee page, admin trainee profile, press-and-hold card |
| Click on small ✕ to unpair | **Done**: every paired name on a card is a pill with a ✕ | Both pairing boards |
| Paired / Unpaired / All filter, for trainees and regular volunteers | **Done**: on each column of both boards | Both pairing boards |
| Drag and drop for pairing, for regular volunteers and trainees | **Done**: phones (touch) and computers (mouse), either direction | Both pairing boards |
| Make paired trainees and volunteers more obvious | **Done**: paired cards have a green edge and ✓, unpaired a red edge; legend; "✓ All paired" when done | Both pairing boards |
| Follow the outing interface for the pairing interface | **Done**: modelled on `MYG-Outing-Exp/pairing.html` (green/blue columns, cards that are both draggable and drop targets, pills with ✕, "+ Trn" / "+ Vol", "Drop … here", sideways-drag rule). Referred to, not copied | `web/js/views/pairing.js`, `web/js/dnd.js` |
| **Feedback notes from the end of session** | | |
| Share with more volunteers, or with specific volunteers | **Done**: "Who can read" on each note of a trainee's admin page | Admin → Trainees → a trainee |
| Different ways to share: all future volunteers / regulars only / selected volunteers (fuzzy search, several people) | **Done** | Trainees → Notes to review |
| Keep private → only admins can see, instead of being deleted | **Done**: the note is kept on the trainee's profile, labelled "Private: admins only" | Notes to review, trainee profile |
| Filter for what volunteers see, linked to the notes volunteers give | **Done**: "What volunteers see" now has a **Notes** section ("Notes from volunteers", "Notes from admins") per audience and per trainee. Also: notes filter chips on the trainee page, and a Session feedback / Trainee updates filter on Notes to review | Admin → Trainees → What volunteers see |
| Session feedback when paired with several trainees | **Done** (follows from the above): one note box per trainee; each note is reviewed on its own | Feedback form |
| **Volunteer registration** | | |
| Follow the fields in the Google Form shown | **Done, but check it** (see §6.1): the form is now driven by a question list, `REGISTRATION` in `gas/Config.gs`. The Google Form wasn't available in this repo or the sibling repos, so the current list is a best guess at a typical MINDS volunteer form | Register, Me, Edit my details, admin volunteer page |
| **Minor details** | | |
| Drag and drop instead of up/down arrows (volunteer guide page) | **Done**: drag the ⠿ handle (keyboard: focus it, arrow keys). Projects too | Admin → Settings → Guide & projects |
| Make sure the mobile view works properly | **Checked** at iPhone 12 size (390 px): no sideways scrolling on 20+ pages; fixed the board's card layout, where names were squeezed to one letter per line | All pages |

## 2. How each change works

### 2.1 Many-to-many pairing (backend: `gas/Pairing.gs`, `gas/Admin.gs`)

- A booking's **Trainee ID** cell can list several trainees: `T-0001, T-0004` (same format as a
  session's "Trainees Attending"); **Trainee Name** lists the names. Old single-ID rows still
  work. Helpers: `bookingTraineeIds_`, `bookingTrainees_`, `hasTrainee_`, `traineeCells_`.
- A regular can have several **active** rows in the Regular Pairings tab (`activeStandings_`).
  Their sign-ups get all of them (`applyStanding_`), and their upcoming sessions follow every
  change (`followStanding_`).
- API (both stay backwards compatible):
  - `updateBooking { bookingId, addTraineeId }` / `{ bookingId, removeTraineeId }`; `traineeId` still replaces them all ('' unpairs).
  - `setStandingPairing { userId, addTraineeId }` / `{ userId, removeTraineeId }`; `traineeId` still replaces them all.
- Responses gained `trainees: [{ id, name }]` (bookings, Home, history, scan results, person
  detail, `regularTrainees`). The old single `trainee` / `regularTrainee` fields are still
  sent (the first one), so a phone with the old app keeps working until it refreshes.
- Everything that used one trainee now uses the list: trainee access for ad hoc volunteers,
  pairing history (each pair counted), the activity log ("Unpaired X from Y"), scan messages,
  renaming a trainee, the session page, the clock-in page.

### 2.2 The pairing board (frontend: `web/js/views/pairing.js`, `web/js/dnd.js`)

- **Drag a card sideways** onto a card in the other column to pair them. On phones an up/down
  move still scrolls the column (the outing app's rule: a drag starts only when the first move
  is more sideways than vertical). Near the top or bottom of a column it scrolls by itself.
- **Tap a card** (or **+ Trn** / **+ Vol**) for the pick list; tap rows to pair or unpair; it
  stays open so several can be ticked, then **Done**.
- **✕** on a pill unpairs that pair. **Press and hold** a card or a pill for details (as before).
- Changes show at once and save in the background; the board redraws from the server once no
  save is waiting (no flicker on quick drags). A failed save shows why and reloads the board.
- The same board is used for **Regular pairings** (regulars ↔ fixed trainees).
- Drag-and-drop listeners are removed when leaving the page (`ctx.onLeave`).

### 2.3 Notes and who can read them (`gas/Trainees.gs`, `gas/TraineeInfo.gs`)

- Trainee Notes tab: new columns **Shared With** (`all` | `regular` | `selected` | `private`),
  **Shared With Volunteers** (user IDs) and **Shared With (Names)**. Old rows: Status "hidden" =
  private, otherwise all. Labels are in `NOTE_AUDIENCES` (`gas/Config.gs`).
- `reviewObservation { feedbackId, audience, userIds?, note? }`. A private note is now **kept**
  (admins see it); before, "Keep private" left it out of the notes. Old `decision: share | private` still works.
- New `setNoteSharing { noteId, audience, userIds? }` (Who can read). `addTraineeNote` accepts
  `audience` / `userIds`. `setNoteStatus` (hide/show) maps to private/all.
- Who sees a note: admins all; regulars `all` + `regular` + `selected` with them; ad hoc
  volunteers `all` + `selected` with them (and only for trainees they may open).
- "What volunteers see" lists gained `notes:volunteer` and `notes:admin` (and a `notes:set`
  marker, so lists saved before this change keep showing notes). Only notes shared with
  everyone are copied into the trainee sheet's "Latest Volunteer Observation".
- Trainee updates sent with **Send update** now say "Volunteer update" in the Source column and
  show as "Trainee update" in the review queue.

### 2.4 Registration (`gas/Config.gs` → `REGISTRATION`, `gas/Profile.gs`, `web/js/views/questions.js`)

- Name, birthday, email, phone, Telegram and password are always asked (the account).
- The other questions are a list in `REGISTRATION.fields`: `key`, `header` (column in the
  Volunteers tab), `label`, `type` (`text`, `textarea`, `choice`, `multi`, `yesno`), `options`
  (`'projects'` = the Projects tab; an "Other" option lets people type their own), `required`,
  `section`, `hint`. `setup()` adds the columns.
- The app fetches them with the public `registrationForm` action, so changing the form needs
  only `Config.gs`. Answers are checked on the server (`registrationAnswers_`), shown on Me
  and on the admin volunteer page, and can be changed under Edit my details.
- `register` enforces required questions only when `answers` is sent, so an old app version
  can still sign people up.

### 2.5 Guide editor (`web/js/views/content.js`, `gas/Content.gs`)

- Rows have a ⠿ handle: drag to reorder (touch or mouse), or focus it and press ↑/↓.
- New `reorderContent { kind: 'guide' | 'projects', ids }` saves the whole order at once and
  refuses a stale list. `moveContent` (up/down) is kept for old app versions.

### 2.6 Styles

- New plain-CSS rules at the end of `web/src/input.css` (board pills, drag states, filters,
  House Visit section colours, sharing options).
- `web/styles.css` was **rebuilt with Tailwind** (`npm run build:css`), which also clears the
  old TODO item about hand-written fallback rules.

## 3. Try it

```bash
cd volunteer-app
npm run dev        # http://localhost:5173 (sheet view: /__sheet)
```

Demo accounts are unchanged (admin `admin@example.com` / `AdminDemo123`, etc.). New demo data:
Vera is paired with **two** trainees today; Rina has **two** fixed trainees; Mock Trainee 4 has a
regulars-only note, a note shared only with Sam, and a private note; demo volunteers have
registration answers.

1. Admin → **Pairing** → today's session: drag Sam onto a trainee, then onto another; ✕ one off.
   Try the All / Paired / Unpaired filters. Do it in a phone-sized window too.
2. **Regular pairings**: drag Rex onto a second trainee.
3. **Trainees → Notes to review**: share Vera's note with "selected volunteers" (search "sam").
4. **Trainees → Mock Trainee 4**: see the three ways notes are shared; change one with **Who can read**.
5. Sign in as Rex (regular): Mock Trainee 4 shows the regulars-only note but not the others.
6. **What volunteers see** → Notes: untick "Notes from volunteers" for volunteers.
7. Sign out → **Register now**: the new questions.
8. **Settings → Guide & projects**: drag the ⠿ handle.

## 4. Testing

- `cd volunteer-app && npm test`: **103 passing** (92 before + 11 new in
  `tests/v2-feedback.test.js`). Two older tests were updated for changed behaviour: a private
  note is now kept for admins, and the visibility list now includes the notes keys.
- Root `npm test` (Prototype 1): passing, unchanged.
- **Browser walkthrough** (Playwright, Chromium, outside the repo): iPhone 12 viewport with touch,
  plus a 1280 px desktop. Checked: registration with required and "Other" answers; pairing board
  layout, filters, **touch drag** to pair, ✕ to unpair, multi-pick; regular pairings with two
  trainees and a **mouse drag**; review sharing with a selected volunteer; trainee profile
  labels and House Visit colours; notes filter; guide **touch drag** reorder; what regulars can
  and can't read; no sideways scrolling on 20+ pages; no page errors.
- **Not checked:** real iPhone (Safari) and Android phones, dark mode on the new screens, and the
  real Google Apps Script deployment (only the local harness).

## 5. Upgrading the live (Exp) setup

1. Paste the changed `gas/*.gs` files into the Apps Script project (or `npm run gas:push`).
2. Run **`setup()`**: it adds the new columns (Trainee Notes: Shared With …; Volunteers: one per
   registration question). Nothing is deleted or reordered.
3. Deploy → Manage deployments → ✏️ → New version → Deploy (same `/exec` URL).
4. Merge `steven-update` into `main` to republish the website; testers tap ↻.

Existing data needs no migration: old bookings, pairings and notes are read as before.

## 6. Open points for the next session

1. **Registration questions.** Get MINDS's Google Form and compare every question, option and
   "required" flag with `REGISTRATION.fields` in `gas/Config.gs`. Today's list: preferred name,
   gender, studying/working, school or organisation, languages, T-shirt size, dietary
   restrictions, medical conditions, projects of interest, experience with persons with
   intellectual disability, how they heard about MINDS, photo consent.
2. **Real phones.** Try drag and drop on an iPhone and an Android phone (pairing board and guide
   editor), and the new screens in dark mode.
3. **Interpretation to confirm with Mr Sadil:** "link the filter for updates from volunteers to the
   notes given by the volunteers" was read as: the "What volunteers see" filter also controls
   notes (from volunteers / from admins), and trainee updates and session feedback go through the
   same review and sharing. If he meant something else, the notes keys are in `NOTE_FILTER`
   (`gas/TraineeInfo.gs`).
4. **"Selected volunteers" and ad hoc volunteers:** a note shared with an ad hoc volunteer shows
   only once they are paired with that trainee (they can't open other trainees). Regulars see it
   straight away.
5. `docs/screenshots/` still show the Version 2 board; retake them when convenient.

## 7. Files changed

| Area | Files |
| --- | --- |
| Backend | `gas/Pairing.gs`, `Admin.gs`, `Volunteer.gs`, `Trainees.gs`, `TraineeInfo.gs`, `Profile.gs`, `Auth.gs`, `Attendance.gs`, `Content.gs`, `AdminLog.gs`, `Main.gs`, `Config.gs` |
| Frontend | `web/js/dnd.js` (new), `web/js/views/questions.js` (new), `pairing.js`, `trainees.js`, `volunteer.js`, `auth.js`, `profile.js`, `content.js`, `leader.js`, `admin.js`, `quickview.js`, `ui.js`, `web/admin/js/views/people.js`, `web/sw.js` |
| Styles | `web/src/input.css`, `web/styles.css` (rebuilt) |
| Tests and demo | `tests/v2-feedback.test.js` (new), `tests/gas.test.js`, `tests/v2.test.js`, `dev/mock-server.js`, `package.json` |
| Docs | `STEVEN-UPDATE.md` (this file), `PROGRESS.md`, `TODO.md`, `VERSION-2.md`, `volunteer-app/README.md`, `volunteer-app/DESIGN-NOTES.md`, `volunteer-app/docs/USER-GUIDE.md` |
