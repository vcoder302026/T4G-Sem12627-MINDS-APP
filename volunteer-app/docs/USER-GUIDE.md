# Using the MINDS Volunteer App

For volunteers and volunteer leaders. Setup and code are covered in the
[README](../README.md).

The app has two modes. Volunteers see **Home · QR pass · Sessions · Me**.
Leaders see **Sessions · Scan · People · Me**; a leader can switch to volunteer
mode with the 🏠 icon (Choose Mode) to book sessions for themselves. The
header's ↻ button loads the newest version of the app and 🌗 switches dark mode.

## For volunteers

| I want to… | Tap |
| --- | --- |
| Join | **Register now**, fill in your details and emergency contact, agree to the data notice, **Create account** |
| Get started | Read the Volunteer Guide that opens, then **I've read the guide** (needed once, before your first booking) |
| Book a session | **Sessions** → search if you like → **Book**. It shows **Pending** until a leader confirms it |
| Cancel a booking | **Home** → Coming up → **Cancel booking** (on the day, tell your leader instead) |
| See my trainee | **Home**, once your booking is confirmed: their profile, **Things to take note**, and notes from previous volunteers |
| Clock in and out | **QR pass** → show it to your leader at the start, and again at the end |
| Give feedback | **Home** → **Give feedback** after the session: a 1–5 rating, comments, and notes for future volunteers working with your trainee |
| Update my details | **Me** → My details → **Edit** → **Save changes** |
| Change my password | **Me** → Change password |
| Forgot my password | Ask a volunteer leader to reset it |
| Re-read the guide | **Me** → Volunteer Guide |

Good to know:
- **Your pass works without signal.** The app keeps passes for your booked
  sessions over the next two weeks on your phone. Turn the brightness up if the
  scan is slow.
- **A pass only works on its own day**, so a screenshot from another day is
  rejected. Open the pass in the app instead.
- **Booked but not confirmed yet?** You can still come: the leader's scan
  confirms you and pairs you with a trainee.
- **Changing your email** changes how you sign in, so the app asks for your
  current password first.
- **Your notes about a trainee** are read by a leader before other volunteers
  see them.

## For volunteer leaders

**Sessions**

| I want to… | Tap |
| --- | --- |
| Post a session | **Sessions** → **New session** → title, date, times, **Venue**, project (optional), slots, notes, trainees attending (optional) → **Create session** |
| Use a new venue | In the Venue box type its name → **+ Add a new venue** → add the address → **Add venue** |
| Find a session | **Sessions** → search by title, venue, project or day ("bakng" finds Baking) |
| Confirm one volunteer | Session → their row → **Confirm & pair** (or pick a trainee first, then **Confirm**) |
| Confirm everyone at once | Session → **Confirm all & pair trainees** |
| Change a pairing | Session → the volunteer's Trainee box → type a name → pick it |
| Edit, close or cancel a session | Session → **Edit or close this session** |

**On the day**

| I want to… | Tap |
| --- | --- |
| Clock volunteers in and out | **Scan** (or Session → **Scan passes for this session**) → point the camera at their pass. First scan = in, next = out |
| Someone turns up without booking | Scan them → **Add as walk-in and clock in** (set Session at the top if there are several today) |
| A volunteer's phone is flat | Session → their row → **Clock in by hand** / **Clock out** |
| No signal | Keep scanning. Scans are saved on your phone and upload by themselves later (or tap **Upload now**) |

**Trainees and notes**

| I want to… | Tap |
| --- | --- |
| Review volunteers' notes | **Sessions** → blue "notes to review" bar → edit if needed → **Share with future volunteers** or **Keep private** |
| See a trainee's details and notes | **People** → **Trainees** → search → name |
| Add a note for future volunteers | Trainee page → write it → **Add note** |
| Hide a note | Trainee page → **Hide from volunteers** (bring it back with **Show to volunteers**) |
| Change a trainee's details | Edit their row in the trainee Google Sheet; the app shows it straight away |

**People**

| I want to… | Tap |
| --- | --- |
| Find someone | **People** → search by name, email, phone or Telegram (typos are fine) |
| Edit someone's details (volunteers and other leaders) | **People** → name → edit → **Save details** |
| Make someone a leader, or remove leader access | **People** → name → Access |
| Reset a forgotten password | **People** → name → **Reset password** → give them the temporary password |
| Stop someone signing in | **People** → name → **Deactivate account** (their hours stay in the sheet; **Reactivate account** undoes it) |

**Leader tools** (under **Me**)

| I want to… | Tap |
| --- | --- |
| Edit the Volunteer Guide | **Volunteer guide & projects** → **Edit** on a section (start lines with `- ` for bullets or `1. ` for steps), or **Add section**; arrows reorder |
| Add or change projects | **Volunteer guide & projects** → **Add project** / **Edit** / **Archive** |
| Manage venues | **Venues** → **Add venue**, **Edit** (renaming updates today's and future sessions) or **Archive** |
| See it as volunteers do | **Volunteer guide & projects** → **Preview as a volunteer** |

## How the app decides things

- **Pairing.** Confirming a booking without choosing a trainee pairs one from
  the active trainees (`Active` isn't `No`), only from the session's
  "Trainees attending" if you set any. One trainee never gets two volunteers in
  the same session. It prefers the trainee this volunteer had last time, then
  the trainee with the fewest pairings so far. The confirmation message says why.
- **Scans.** The first scan clocks a volunteer in and the next clocks them out.
  A repeat scan within 2 minutes is ignored, so a camera reading the same pass
  twice can't clock someone straight back out. Hours are written to the sheet immediately.
- **What volunteers see about a trainee** is set by MINDS in `Config.gs`.
  Medical and caregiver details are for leaders only. On a trainee's page,
  each field is marked "Volunteer sees" or "Leaders only".
- **Leaders.** There is always at least one active leader. Leaders can't remove
  their own leader access or deactivate themselves; another leader has to.
