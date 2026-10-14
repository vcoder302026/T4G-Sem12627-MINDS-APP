# Prototype 1 — App Usage Guide

A practical guide for MINDS staff using the local MINDS Admin prototype in a desktop browser.
For setup instructions, see the [Prototype 1 README](README.md).

## Signing in

1. Start the app (`npm start`) and open <http://localhost:3000>.
2. Sign in with the local demo credentials (also shown on the login screen):
   - Username: `admin`
   - Password: `MindsDemo123!` (note the exclamation mark)
3. Your name appears at the bottom of the left sidebar. Click **Log out** when you are done.

Sessions last eight hours; after that the app returns to the login screen and you simply sign
in again. Everything you save is stored on this computer only, in the local database file, and
stays there even after you close the browser or restart the app.

## Getting around

- The **left sidebar** lists every screen: Dashboard, Volunteers, Trainees, Attendance,
  Fundraising, Outings, Overseas Trips and House Visits. Click an item to open it.
- The **Dashboard** is the home screen. It shows a card for each module, links to the two
  directories, record counts, total completed volunteer hours, and the next five upcoming
  outings and trips.
- You can bookmark or refresh any screen — for example `#/trips/1` — and it will reopen
  exactly where you were. Unknown addresses return you to the Dashboard.
- Throughout the app: **saving buttons disable while working**, success messages appear
  briefly in green, and errors appear in red. If a save fails, whatever you typed stays in
  the form so you can fix it and retry.

## Volunteers (shared directory)

Used by Attendance, Outings, Overseas Trips and House Visits.

- **Add**: type a Name (required); Email and Phone are optional. Click **Add**.
- **Find**: type in the search box to filter by name or email.
- **Edit**: click **Edit** on a row, change the fields, click **Save** (or **Cancel**).
  Renaming a volunteer updates the name everywhere it is used.

## Trainees (shared directory)

Used by Outings, Overseas Trips and House Visits.

- **Add**: Name is required. Caregiver name, Caregiver phone, Support needs, Medical notes
  and Dietary notes are optional.
- **Find**: search by trainee name or caregiver name.
- **Edit**: same inline Save/Cancel flow as Volunteers.
- The Medical/Dietary notes here are the trainee's *profile*. When you add the trainee to an
  overseas trip, a copy is taken for that trip (see Overseas Trips below).

## Attendance

Replaces QR-based clocking with manual desktop sign-in/out.

- **Create a session**: give it a Title and Date (Venue optional), click **Create session**.
- **Open a session** from the list. On the session page:
  - **Clock in**: choose a volunteer from the dropdown and click **Clock in**.
  - The record shows clock-in time (Singapore time), and **In progress** until clocked out.
  - **Clock out**: click **Clock out** on the open row. Completed rows show the calculated
    hours.
- Each volunteer can be clocked in only once per session; repeat attempts are rejected.
  Timestamps are recorded by the server and cannot be edited.
- The Attendance landing page also shows the **Volunteer hours summary**: completed sessions
  and total hours per volunteer. Records still in progress are excluded and the volunteer
  shows 0 until clocked out.

## Fundraising

- **Create a fundraiser**: Name and Date, then open it from the list.
- **Products**: add items with a Name and a Price in SGD (for example `5.50` — at most two
  decimal places).
- **Take an order**:
  1. Enter the Customer name (required) and Contact (optional).
  2. Each row picks a Product and a Quantity. Use **＋ Add another product** for more rows
     and **Remove** to delete one (at least one is required).
  3. The **Preview total** updates as you type — the final total is always calculated by
     the server from the stored product prices.
  4. Click **Create order**.
- **Track the order** in the Orders table:
  - **Mark paid / Mark unpaid** toggles payment status.
  - **Mark collected / Mark pending** toggles collection status.
- The **Sales** card shows Total sales and Paid sales for the fundraiser. Submitted orders
  cannot be edited — only their statuses can be changed.

## Outings

- **Create an outing**: Title and Date (Venue and Notes optional), then open it.
- The header shows **Boarded X of Y trainees**.
- **Assign**: choose a Trainee and a Volunteer (both required); Group and Bus labels are
  optional. Each trainee can appear only once per outing.
- **Edit an assignment**: on each row you can change the Volunteer dropdown, the Group and
  Bus text, tick the **boarded** checkbox, then click **Save**. Boarding is a manual
  checklist — the app does not track location.

## Overseas Trips

All management happens on one trip detail page.

- **Create a trip**: Title, Destination, Start date and End date (the end cannot be before
  the start); Notes optional.
- **Participants**:
  - Add a Trainee (each trainee once per trip) and optionally a Volunteer.
  - When the participant is added, their Medical and Dietary notes are **copied from the
    trainee profile**. The copy belongs to this trip: editing the trainee's profile later
    will not change it, and editing it here will not change the profile.
  - On each row you can change the Volunteer, set Registration to **Pending** or
    **Confirmed**, edit the per-trip Medical/Dietary notes, then **Save**.
- **Logistics checklist**: add tasks and toggle **Mark done / Mark pending**.
- **Expenses**: add a Description and an Amount in SGD (e.g. `120.50`). The **Total
  expenses** line keeps a running sum.

## House Visits

- **Record a visit**: choose a Trainee and a Volunteer, set the Visit date (defaults to
  today), then fill in any of the five observation fields — Family circumstances, Daily
  living, Social skills, Health and Follow-up. Click **Record visit**.
- **History**: visits are listed newest first as readable cards with the full observations.
  Use the **Filter by trainee** dropdown to see one trainee's history.
- Visits are append-only: they cannot be edited or deleted, so the history stays trustworthy.

## Tips and troubleshooting

- **Money fields** accept plain numbers with at most two decimals (`5`, `5.5`, `5.50`).
- **Dates** use the native date picker; invalid dates such as 31 February are rejected.
- **"Cannot reach the local server"** means the app is not running — start it again with
  `npm start` (your data is safe).
- **Reset the demo data**: stop the server, delete the `data` folder, start again. This
  erases everything in this copy of the app.
- The app needs no internet connection after installation and never sends data anywhere.
