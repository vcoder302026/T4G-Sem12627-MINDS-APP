# Partner feedback, October 2026: what changed

Changes made to the volunteer app after the meeting with MINDS (Ms Julia and Mr Sadil),
following the meeting minutes. Decisions taken with the team where the minutes left a
choice:

- **Admin access:** one shared MINDS admin password, not tied to anyone's account.
- **Other modules** (fundraising, outings, overseas trips, house visits): kept, working.
- **Sign-ups:** volunteers just say "I'm coming"; there is no confirmation step.
- **Google Contacts:** built; simulated in the local demo (contacts of
  `vcoder302026@gmail.com`, shown at `/__contacts`).

Everything runs in the local demo (`npm run dev`); 83 backend tests pass, and a scripted
browser walkthrough passed on phone (360 and 390 px), tablet (800 px) and desktop (1024 and
1440 px) widths. It has **not** yet been tried on real Google Apps Script or real phones.

## Admin access and leaders (Ms Julia)

| Minutes | What changed | Where |
| --- | --- | --- |
| Remove leader access; tag a password to it, or one big admin profile not linked to a person | "Leader" accounts are gone. Anyone signed in can open **Admin** by typing the shared MINDS admin password. It is stored only as a salted hash (`setAdminPassword()` reads it once from a script property and deletes it). Admin stays open on that device for 12 hours; 5 wrong tries lock it for 15 minutes. | `gas/AdminAccess.gs`, `Main.gs`; app: **Me → Admin** |
| Volunteer leaders keep their own profile, separate from admin | Staff use their normal volunteer account; Admin is unlocked on top of it, so their own sessions, hours and pass work as for everyone. | `web/js/app.js` |
| History of who makes changes on the admin side | Every admin change is written to a new **Admin Log** tab with the person's name, the action and what it was about (never passwords). Opening admin and wrong passwords are logged too. **Admin → Activity log** shows it. | `Main.gs → logAdmin_`, `AdminAccess.gs`; `admin/views/settings.js` |
| One seamless interface: the same views as volunteers plus an admin submenu | No more mode switching. Everyone has Home · Pass · Schedule · Trainees · Me; with Admin open, an **Admin** tab (phone) or an Admin section in the left menu (computer) appears. | `web/js/app.js`, `web/index.html` |
| Key in a password to remove a leader | Deactivating or reactivating anyone needs the admin password typed again. Changing the admin password, or "Sign out every other admin device", ends admin everywhere else. | `Profile.gs → updatePerson_`, `AdminAccess.gs` |
| Deactivate button at the side of the volunteer list; deactivate leaders as well | **Deactivate / Reactivate** on each row of **Admin → Volunteers**. There are no leader accounts left to protect, so anyone (former leaders included) is deactivated the same way; you can't deactivate yourself. | `admin/views/people.js` |
| Change "leaders" to ADMIN | "Leader" is now "admin" / "MINDS staff" throughout the app, messages and docs. | all |

## Sign-ups, pairing and sessions

| Minutes | What changed | Where |
| --- | --- | --- |
| Register for 4 activities in a month at once, just to say they're coming | **Schedule**: tick several sessions → **I'm coming to N sessions**. Each one succeeds or fails on its own (full, closed…). | `Volunteer.gs → signUpSessions_`; `views/volunteer.js` |
| Volunteers only need to indicate in advance; confirmation counts not needed | No confirmation step: a sign-up is "coming" straight away. "Pending / to confirm" counts and buttons are gone; admins see who is **coming** and who **needs a trainee**. | `Volunteer.gs`, `Admin.gs`, `Dashboard.gs` |
| Remove "open the phone app" | Removed (there is only one app now). The old `/admin/` address redirects into it. | `web/admin/index.html` |
| Upcoming sessions shown to ALL volunteers, to screenshot and send to caregivers | **Schedule** lists every upcoming session (closed ones too), with a **Share** button (text for chat apps) and a layout that screenshots well. | `views/volunteer.js` |
| Keep seeing the specific trainee they're paired with | Each session on **Home** shows the trainee(s), with photo; **Trainees** has their full page. | `views/trainees.js` |
| Maintained pairing list; multi-pairing both ways; pull existing pairs from a sheet | New **Pairing List** tab and **Admin → Pairing list** (by volunteer or by trainee). One volunteer can have several trainees and one trainee several volunteers. Import from an existing pairs sheet, or from the house-visit responses ("Name of Attached Volunteer"). Ended pairs are kept as history. | `gas/Pairs.gs`; `admin/views/pairs.js` |
| Regulars auto-paired when they say they're coming; admins pair new/ad-hoc volunteers by hand; admins see unpaired volunteers | A regular is paired at once: their regular pairs first (all of them), else a free trainee (last partner, else fewest pairings). New volunteers wait; the session page lists **Need a trainee** first, with **Pair** (choose one or more trainees) and **Pair the rest automatically**. A trainee kept for their regular partner isn't given to someone else. | `Trainees.gs → pickTrainees_`, `Admin.gs`; `admin/views/sessions.js` |
| Regular after 10 sessions, automatically | New **Volunteer Type** column (blank = automatic). At the 10th completed session the volunteer becomes regular ("Regular" + "Regular Since" are written, and the clock-out message says so). Admins can also set Regular or New. | `Profile.gs` |
| Number of new and regular volunteers on the dashboard | The overview shows active volunteers split into regular and new, and new this month. | `Dashboard.gs`; `admin/views/overview.js` |
| No-shows visible on the attendance dashboard, per volunteer | **Attendance & no-shows**: no-shows per volunteer and the missed sessions; also on each volunteer's page, in the volunteer list and the hours report (and CSV). | `Dashboard.gs → noShowsByUser_` |
| Scanning page only for scanning; clock-in by hand separate | **Scan & clock in** has two tabs: **Scan QR passes** and **Clock in by hand**. The session page no longer has clock buttons. | `admin/views/sessions.js` |
| Details on long-press of the name, so leaders aren't flooded | The session page shows names, type and trainees only. **Press and hold** a name (right-click or Enter on a computer) for Telegram, phone, sessions done, no-shows and regular trainees. | `ui.js → onLongPress`; `admin/views/sessions.js` |
| Not sure session-adding is needed: only volunteer session, outing or overseas | Sessions now have a **Type** (Volunteer session or Outing); the title is optional and shows the type when blank. Overseas trips stay in their own module. | `Admin.gs`, `Config.gs → SESSION_TYPES` |
| Revisit "edit session" with Sadil in person | Left as it was (under "Edit or close this session"). **To discuss in person.** | |

## Trainee information and databases

| Minutes | What changed | Where |
| --- | --- | --- |
| History of trainees' previous partners with volunteers | Each trainee's admin page lists **everyone they have been with** (regular pairs, sessions, house visits, outings, trips), and each volunteer's page the trainees they have been with. | `Pairs.gs → partnersOfTrainee_ / partnersOfVolunteer_` |
| Current database format (house-visit form responses, several rows per trainee); keep volunteer details and trainee updates separate | The form responses are a separate linked database ("trainee updates"), read by header name and matched to trainees by full name. A trainee's current information is the newest answer to each question. Volunteer details stay in the Volunteers list (which can also live in its own spreadsheet). | `gas/TraineeUpdates.gs`, `Config.gs → TRAINEE_UPDATES` |
| A setting to key in URLs for specific databases (a URL to one tab; separate URLs for several sheets) | **Admin → Settings → Databases** (stored in a new **Data Sources** tab): links for the volunteer list, the trainee list, the house-visit responses, a pairs sheet, and the Drive folder for photos. A link can point at one tab (`#gid=…`); the app checks each link when it is saved. | `gas/DataSources.gs`, `Db.gs → sheetLocation_` |
| Regulars want an info dump | Regular volunteers can open **every** trainee under **Trainees**, with more fields (by default also medical and dietary notes, and whichever house-visit answers admins allow). | `TraineeUpdates.gs`; `views/trainees.js` |
| Regulars can update any trainee; new volunteers can update their attached trainee | **Add an update** on a trainee's page: changed answers are added as a new row in the house-visit responses, in the same format, with the volunteer's name (unchanged answers carried over); a note goes to **Notes to review**. Regulars can update any trainee; new volunteers only those they're paired with. | `TraineeUpdates.gs → submitTraineeUpdate_` |
| Control what's released to ad-hoc vs regular volunteers | **Settings → What volunteers see about trainees**: a tick per field for new and for regular volunteers (trainee list fields, photo, notes, and every house-visit question). Starts conservative: caregiver details admins only, house-visit answers hidden until allowed. | new **Trainee Field Access** tab |
| Photo database; see the trainee in advance | Admins upload a photo on the trainee's page (shrunk on the phone first). Photos are kept privately in Google Drive and only sent to people allowed to see that trainee. | `gas/Files.gs`, `web/js/media.js` |

## Volunteer details

| Minutes | What changed | Where |
| --- | --- | --- |
| Only Telegram needed, no emergency contact; shown only on long-press | Registration and "Edit my details" ask for Telegram (required) and no longer for an emergency contact. Telegram shows on press-and-hold and on the volunteer's admin page. | `Auth.gs`, `Profile.gs`, `views/auth.js` |
| Sync to Google Contacts: auto-add new volunteers to an admin Google account, Telegram in the notes | Each new volunteer (registered, or added by an admin) becomes a contact in the Google account that deploys the app, under the label "MINDS Volunteers", with "Telegram: @handle" in the notes; later changes update the same contact. Failures never block a registration and can be retried (**Settings → Sync now**). Locally it is simulated: see `/__contacts`. | `gas/Contacts.gs`, `appsscript.json` (People API) |

## Guide and dashboard layout (Mr Sadil)

| Minutes | What changed | Where |
| --- | --- | --- |
| Replace "On the day" with an infographic; must be changeable, and allow pictures or a PDF | The "On the day" guide section shows a built-in infographic (6 steps). Any guide section can show a picture or a PDF instead of, or as well as, text: **Guide & venues → Add picture/PDF**. | `web/img/on-the-day.svg`, `Content.gs`, `Files.gs` |
| Dashboard accessible on phone; view changes with screen size; merge both into one; same information on mobile and desktop; hidden tabs on mobile | The staff dashboard and the phone leader screens are now **one app**. On phones: tabs, plus a swipeable row of admin sections and a menu of tiles on the overview; tables turn into cards. From 1024 px: a sidebar with the same sections. Every page works at every width (no sideways scrolling). | `web/js/app.js`, `web/js/admin/`, `src/input.css` |
| Admin sections 2–5 (outings, fundraisers, etc.) overlap with MINDS's own interface | Kept and working, under **Other modules** in the menu. | `web/js/admin/views/` |

## Still to discuss with MINDS in person

1. The "edit session" form (left unchanged).
2. Whether volunteer sessions and outings should become one list (they are separate; a
   session can be of type "Outing", and the Outings module is unchanged).
3. Overseas trips attendance staying completely separate (it is, in its own module).
4. Which trainee fields new and regular volunteers may see (the starting values are a
   suggestion; PDPA).
5. Whether the Google account `vcoder302026@gmail.com` is the right one to own the
   deployment (its contacts receive every volunteer).

## For developers

- New backend files: `AdminAccess.gs`, `Pairs.gs`, `TraineeUpdates.gs`, `DataSources.gs`,
  `Files.gs`, `Contacts.gs`. New tabs: Data Sources, Pairing List, Admin Log, Trainee
  Field Access, Files, Trainee Photos. New columns: Volunteers (Volunteer Type, Regular
  Since, Google Contact), Sessions (Type), Bookings (More Trainees), Feedback (Type), Volunteer
  Guide (Picture or PDF). `setup()` adds them; nothing is deleted.
- Removed: `setRole`, `confirmAll`, `makeFirstAdmin()`, the `FIRST_ADMIN_EMAIL` property,
  the Role and emergency-contact columns from the app (existing columns in a sheet are
  left alone and ignored), `web/js/views/leader.js`, `web/admin/js/app.js`.
- Moved: the dashboard views from `web/admin/js/` to `web/js/admin/` (same code, links now
  `#/admin/...`).
- New permissions: Google Drive and Google Contacts (People API advanced service).
- API: admin actions need `adminToken` (from `adminUnlock`) next to the sign-in token, and
  fail with `ADMIN_REQUIRED` otherwise.
- Tests: 83 (49 main flow, 19 admin records, 15 partner feedback).
