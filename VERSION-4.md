# MINDS Volunteer Management: Version 4 (in progress)

Changes from the call with MINDS on 29 October 2026. **v4.0-beta** contains the first part;
the rest follows in the next update. Version 3 is described in [VERSION-3.md](VERSION-3.md).

## In v4.0-beta

| Change | Where |
| --- | --- |
| Registration asks for **Full Name (as per NRIC)** again (one box) | Registration, Edit my details, Add / Edit volunteer |
| Google Contacts: **first name only**, "Short Name_[Full Name]_Project", e.g. `Xin Yi_[Ng Xin Yi]_RSPID (WGS)`; birthday, 8-digit phone, notes ending "MINDS volunteer." | `gas/Contacts.gs` |
| **Short names across the app**, in alphanumeric order ("Ali 2" before "Ali 10"); two volunteers (or two trainees) with the same short name both show their full name. Searches still match full names; titles and edit forms keep the full name | `gas/DisplayNames.gs` (applied to every response) |
| **Google Contacts update when details are saved**, after a short warning ("… which also updates their Google contact"); the Update / Save to Google Contacts button is gone; becoming a regular or an admin also updates the contact | Edit my details, a volunteer's admin page |
| **"Share with all volunteers"** (was "all future volunteers") | Note sharing |
| **Files on notes:** up to 3 photos, videos or documents (10 MB together) on Send update, session feedback and admins' notes, from the device or Google Drive. Photos are made smaller automatically (longest side 1,600 px). Files are kept in a **private** Drive folder ("MINDS Volunteer App – Note Files") and only opened through the app, by people who may read the note | `gas/NoteFiles.gs`, `web/js/ui.js` (`attachPicker`, `attachmentList`) |

New sheet columns (added by setup): **Attachments** on Feedback and Trainee Notes. The First Name /
Last Name columns from v3.35 are no longer used; you can delete them from the Volunteers tab.

## Coming next

- One spreadsheet for trainees and house visits; Settings → Google Sheets shows two databases.
- Adding a trainee with the House Visit Form; required: Project, Full Name, NRIC (last 4), Date of
  Birth, Spoken Language, Gender, Short Name, Caregiver 1's name and contact.
- A more accessible Admin menu.
- Phone and tablet layout checks, and the documentation, for all of Version 4.
