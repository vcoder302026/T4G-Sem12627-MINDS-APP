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
| **A more accessible Admin menu:** on phones, **All pages** (first in the admin row) lists every admin page by section, one tap away; on computers, the sidebar shows the pages of the section you're in | `web/js/app.js` |

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
