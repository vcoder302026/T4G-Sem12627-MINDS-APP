# Using the MINDS Volunteer App

For volunteers, regular volunteers and admins. Setup and code are covered in the
[README](../README.md).

There is **one app** and **no modes to switch**. Everyone sees **Home · QR pass ·
Sessions · Me**. Regular volunteers also see **Trainees**. Admins also see **Admin**.
On a computer these become a sidebar on the left; on a phone they're the tabs under the
header, and admin pages get a scrollable row of sub-pages. The header's ↻ button loads the
newest version of the app and 🌗 switches dark mode.

## Three profiles

| Profile | Who | What's different |
| --- | --- | --- |
| **Volunteer** | Everyone starts here (new / ad hoc) | An admin pairs you with a trainee for each session. You see your trainee's details that admins allow. |
| **Regular** | After 10 attended sessions (automatic), or when an admin promotes you | You can read about any trainee. An admin can give you a fixed trainee, who you're paired with every time you sign up. |
| **Admin** | Regular volunteers with admin access (becoming an admin makes someone a regular) | The Admin menu, on top of everything above. |

## For every volunteer

| I want to… | Tap |
| --- | --- |
| Join | **Register now**, fill in your details, agree to the data notice, **Create account** |
| Get started | Read the Volunteer Guide that opens, then **I've read the guide** (needed once, before your first sign-up) |
| Say I'm coming | **Sessions** → tick every session you can come to → **I'm coming**. No need to wait for a confirmation |
| Can't make it | **Home** → Coming up → **Can't make it** (on the day, tell an admin instead) |
| See my trainee | **Home**, once an admin has paired you: their photo and name. **Press and hold** for key details and the latest note; tap for their full page |
| Tell the next volunteer something | Your trainee's page → **Send update**, or **Give feedback** after a session. An admin reads it first |
| Clock in and out | **QR pass** → show it to an admin at the start, and again at the end |
| See my hours and past sessions | **Me** → History: each session, your hours, and the trainee you were with |
| Update my details or password | **Me** → My details → **Edit**; **Me** → Change password |
| Forgot my password | Ask an admin to reset it |

**Regular volunteers** also have:

| I want to… | Tap |
| --- | --- |
| See my fixed trainee | **Home**, at the top: press and hold for details, tap for their full page |
| Read about any trainee | **Trainees** → search → tap a name |
| Send an update about any trainee | Their page → **Send update** |

Good to know:
- **Your pass works without signal.** The app keeps passes for the next two weeks of your
  sessions on your phone. Turn the brightness up if the scan is slow.
- **Upcoming sessions** are listed for everyone under **Sessions**, ready to screenshot.

## For admins

Open **Admin** (phone) or use the sidebar (computer). It has six sections: **Dashboard,
Sessions, Pairing, Volunteers, Trainees, Settings**, plus **More**. Sections with several
pages show them as tabs at the top. **Press and hold any underlined name** (right-click on a
computer) to see a volunteer's Telegram and phone, or a trainee's photo and key details.

| I want to… | Go to |
| --- | --- |
| See what needs attention | **Dashboard**: new and regular volunteers, trainees without a regular, who still needs pairing |
| Add sessions | **Sessions** → **New session** → pick the date. It's a Regular session, 2:30–5:30 pm at Woodlands, for both projects, WE and RSPID (change the dropdowns or untick a project if needed). **Add another date** adds the same session on several days at once |
| See who's coming | **Sessions** → a session: everyone coming, their trainee, and no-shows after the day |
| Pair volunteers for a session | **Sessions** → **Pair** on the session's row (or **Pairing**). Tap a volunteer, pick a trainee. Tap a trainee to add or move volunteers. The red **Unpaired** button shows only those still unpaired |
| Share the pairings | Pairing board → **Pairing list**: a Volunteer → Trainee table to screenshot |
| Give a regular their fixed trainee | **Pairing** → **Regular pairings** → tap the regular → pick the trainee. The pop-up shows who they've been with before, then trainees new for them. Their upcoming sessions follow the change |
| Check who has been with whom | **Pairing** → **History**: sessions together for every pair, and each regular's fixed trainees over time (with dates). Also on a volunteer's page: Recent sessions and Regular trainees over time |
| Clock people in | **Sessions** → **Scan** on today's session (or **Scan passes** at the top). If a phone is flat: **Clock in** on the session's row, then **Clock in** / **Clock out**, or add a walk-in |
| Promote someone to regular | **Volunteers** → their name → **Promote to regular** (or **Move back to volunteer**) |
| Make or remove an admin | **Volunteers** → their name → **Make an admin** / **Remove admin access**. Making or removing an admin (and deactivating or reactivating one) asks for the **admin password** (a shared password, not your sign-in password) |
| Deactivate someone | **Volunteers** → **Deactivate** next to their name (they can't sign in; their hours stay) |
| Fix attendance, export hours | **Volunteers** → **Attendance** (fix a missed scan) and **Hours** (export CSV) |
| Add or change a trainee's photo | **Trainees** → the trainee → **Add photo** / **Change photo** (from this device, or a Google Drive link) or **Remove** |
| Choose what volunteers see about trainees | **Trainees** → **What volunteers see** (the default), or a trainee → **What volunteers see** (just them). **Set as default for everyone** copies one trainee's settings to all |
| Review notes | **Trainees** → **Notes to review**: edit if needed, then **Share with future volunteers** or **Keep private** |
| Check who changed what | **Dashboard** → **Activity log**: filter by admin, date or words like "pairing" |
| Change the guide | **Settings** → **Guide & projects**: **Edit** any section, **Add text**, or **Add infographic** (a picture or PDF from this device, or a Google Drive link). Use the arrows to move items; the ↻ button replaces an infographic's file. **Preview as a volunteer** shows the result |
| Edit projects and venues | **Settings** → **Guide & projects** (projects), **Venues** |
| Change the admin password | **Settings** → **Admin password**: type the current one and the new one twice. Tell the other admins. Forgotten? Whoever looks after Apps Script runs `resetAdminPassword()` |

Fundraising, outings, overseas trips and house visits are kept from Version 1 under
**More** (placeholders) until MINDS decides how they fit.

## How the app decides things

- **Pairing when someone says they're coming:** a regular with a fixed trainee is paired
  with them straight away. Everyone else shows as **Unpaired** until an admin pairs them.
  A pairing an admin sets for one session is never overwritten by a fixed-trainee change.
- **One trainee per volunteer, several volunteers per trainee.** Trainees without a regular
  are highlighted, because ideally each has at least one.
- **Becoming a regular:** counted from sessions you were clocked out of. Volunteers don't see the count; admins see it on the volunteer's page. If an admin set
  someone's profile by hand, the automatic rule leaves them alone.
- **Pairings typed into the sheet:** rows in the Regular Pairings tab may use plain names
  (volunteer and trainee); the app matches them to the right people.
- **What a volunteer sees** comes from the admin's settings for that trainee, or the default.
  Admins always see everything.
