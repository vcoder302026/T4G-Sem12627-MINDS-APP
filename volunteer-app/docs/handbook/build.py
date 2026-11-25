"""Builds the MINDS Volunteer App handbook (HTML -> PDF) in the app's own design.

Run: python3 build.py <screenshots dir> <app icon> <out.pdf>
Screenshots are phone-width captures of the local demo (fictional data).
"""
import base64, html, os, sys, asyncio
from playwright.async_api import async_playwright

SHOTS, ICON, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
APP_VERSION = '4.9'
HB_VERSION = '2.0'
DATE = 'November 2026'


def b64(path):
    ext = os.path.splitext(path)[1].lstrip('.').replace('jpg', 'jpeg')
    return f'data:image/{ext};base64,' + base64.b64encode(open(path, 'rb').read()).decode()


def shot(name, caption=''):
    p = os.path.join(SHOTS, name + '.jpg')
    if not os.path.exists(p):
        return ''
    cap = f'<figcaption>{caption}</figcaption>' if caption else ''
    return f'<figure class="phone"><img src="{b64(p)}" alt="{html.escape(caption or name)}">{cap}</figure>'


def b(t):  # bold UI words: **x** -> <b>x</b>
    out, bold = '', False
    for part in t.split('**'):
        out += (f'<b>{part}</b>' if bold else part)
        bold = not bold
    return out


def steps(*items):
    return '<ol class="steps">' + ''.join(f'<li><span class="n">{i}</span><span>{b(t)}</span></li>' for i, t in enumerate(items, 1)) + '</ol>'


def table(head, rows, cls=''):
    h = ''.join(f'<th>{b(x)}</th>' for x in head)
    r = ''.join('<tr>' + ''.join(f'<td>{b(c)}</td>' for c in row) + '</tr>' for row in rows)
    return f'<div class="card tbl {cls}"><table><thead><tr>{h}</tr></thead><tbody>{r}</tbody></table></div>'


def alert(kind, title, text):
    icon = {'info': 'i', 'warn': '!', 'error': '!', 'success': '✓'}[kind]
    return f'<div class="alert alert-{kind}"><span class="ai">{icon}</span><div><p class="at">{title}</p><p>{b(text)}</p></div></div>'


def bullets(*items):
    return '<ul class="bul">' + ''.join(f'<li>{b(t)}</li>' for t in items) + '</ul>'


def badge(t, c):
    return f'<span class="badge badge-{c}">{t}</span>'


def chapter(n, title, lead, body, side=''):
    side_html = f'<div class="side">{side}</div>' if side else ''
    return f'''<section class="chapter">
  <p class="group-label">Chapter {n}</p>
  <h2 class="page-title">{title}</h2>
  <p class="lead">{b(lead)}</p>
  <div class="cols{' two' if side else ''}"><div class="main">{body}</div>{side_html}</div>
</section>'''


def part(letter, title, lead, items):
    lis = ''.join(f'<li><span class="pn">{n}</span>{t}</li>' for n, t in items)
    return f'''<section class="page part">
  <div class="part-card">
    <p class="part-label">Part {letter}</p>
    <h1>{title}</h1>
    <p class="part-lead">{lead}</p>
    <ul class="part-list">{lis}</ul>
  </div>
</section>'''


A_CH = [(1, 'Getting started'), (2, 'The Volunteer Guide'), (3, 'Saying you\'re coming'), (4, 'Your trainee'),
        (5, 'On the day: your QR pass'), (6, 'After the session: feedback'), (7, 'Your hours and past sessions')]
B_CH = [(8, 'Admin basics'), (9, 'Running sessions'), (10, 'Pairing'), (11, 'Clocking in and out'),
        (12, 'Managing volunteers'), (13, 'Trainees and notes'), (14, 'Records and past sessions'),
        (15, 'Guide, projects and venues'), (16, 'Settings')]

pages = []

# ---------------------------------------------------------------- cover
pages.append(f'''<section class="page cover">
  <div class="cover-top">
    <img class="app-icon" src="{b64(ICON)}" alt="">
    <div><p class="brand">MINDS Volunteers</p><p class="brand-sub">Tech for Good × MINDS</p></div>
  </div>
  <p class="group-label light">Handbook</p>
  <h1 class="cover-title">MINDS Volunteer App</h1>
  <p class="cover-sub">User &amp; Admin Handbook</p>
  <p class="cover-lead">A simple, step-by-step guide for volunteers, regular volunteers and admins.</p>
  <div class="cover-grid">
    <div class="cover-cards">
      <div class="ccard"><p class="ct">Part A · Volunteers</p><p>Register, say you're coming, meet your trainee, clock in, give feedback</p></div>
      <div class="ccard"><p class="ct">Part B · Admins</p><p>Sessions, pairing, scanning, people, trainees, records and settings</p></div>
      <div class="ccard profiles"><p class="ct">Three profiles</p><p>{badge('Volunteer','indigo')} {badge('Regular','emerald')} {badge('Admin','purple')}</p></div>
    </div>
    {shot('home', '')}
  </div>
  <div class="cover-foot"><span>Handbook version {HB_VERSION} · {DATE}</span><span>For app version {APP_VERSION}</span></div>
</section>''')

# ---------------------------------------------------------------- contents
def toc_rows(chs, start):
    return ''.join(f'<tr><td class="tn">{n}</td><td>{t}</td></tr>' for n, t in chs)

pages.append(f'''<section class="page">
  <p class="group-label">Handbook</p>
  <h2 class="page-title">Contents</h2>
  <p class="lead">Volunteers: read Part A. Admins: read Part A, then Part B.</p>
  <div class="card toc"><p class="group-label in">Part A · For volunteers</p><table>{toc_rows(A_CH, 0)}</table></div>
  <div class="card toc"><p class="group-label in">Part B · For admins</p><table>{toc_rows(B_CH, 0)}</table></div>
  <p class="group-label">Finding your way around</p>
  {table(['Where', 'What you see'], [
    ['Phone or tablet', 'The tabs are in the **bar at the bottom**: **Home · QR pass · Sessions · Me**. Regulars also have **Trainees**; admins also have **Admin**.'],
    ['Computer', 'The same pages are in the **sidebar** on the left. The small arrow at its edge shrinks it to icons.'],
    ['The header', '**←** goes back · **↻** loads the newest version of the app · **🌗** dark mode · the red arrow signs you out.'],
    ['Names', '**Press and hold** a name with a dotted underline (right-click on a computer) for a quick card.'],
  ])}
  {alert('info', 'The app updated but you don\'t see it?', 'Tap **↻** in the header. The app saves itself for offline use, so it can show the old version until you do.')}
</section>''')

# ---------------------------------------------------------------- Part A
pages.append(part('A', 'For volunteers', 'Sign up, show up and help your trainee have a great session.', A_CH))

pages.append(f'''<section class="page">
{chapter(1, 'Getting started', 'You need a smartphone and about 5 minutes.',
  f"""<h3>Open the app</h3>
  <p>The app runs in your phone's browser; there is nothing to download. MINDS will send you the link.</p>
  {table(['Add it to your home screen', 'Steps'], [['iPhone (Safari)', 'Tap **Share → Add to Home Screen**.'], ['Android (Chrome)', 'Tap **⋮ → Install app** (or **Add to Home screen**).']])}
  <h3>Register</h3>
  {steps('Tap **Register now**.', 'Fill in MINDS\'s volunteer form: the same questions as its Google Form, starting with your **Full Name (as per NRIC)**.', 'Your **Sign-in email** is how you sign in. Type a password (8+ characters) twice: **Re-enter password**.', 'Tick the personal data notice, then tap **Create account**.')}
  <h3>Sign in</h3>
  <p>Sign in with your email and password. You stay signed in for <b>30 days</b>.</p>
  {alert('warn', 'Forgot your password?', 'Ask an admin for a temporary one, then change it on **Me**. After 5 wrong tries, wait 15 minutes.')}""",
  shot('register', 'Register now'))}
</section>''')

pages.append(f'''<section class="page">
  <p class="group-label">Chapter 1 · continued</p>
  <h2 class="page-title">The registration form</h2>
  <p class="lead">The same questions as MINDS's volunteer Google Form, in the same order.</p>
  {table(['Question', 'Notes'], [
    ['Full Name, Date of Birth, Sign-in email, Contact No', 'Required. Phone: +65 and 8 digits.'],
    ['Short Name', 'Required. What people call you in the app.'],
    ['NRIC (last 4), Address', 'Required. **Private.** NRIC like 123A.'],
    ['Project', 'Required: RSPID (CTDC), RSPID (WGS), West End, or an RSPID Alumni option.'],
    ['Course, Matric No., School Email', 'RSPID projects only.'],
    ['Start Year, T-Shirt Size', 'Required.'],
    ['Emergency contact', 'Required. **Private.** Name, relationship and phone.'],
    ['Telegram, committee roles, dietary needs', 'Optional.'],
  ])}
  <p class="muted small">"Private" answers are seen only by you and the admins.</p>
  {alert('info', 'Already on MINDS\'s list?', 'Register with the **same email** MINDS has for you, and your history stays with you.')}
  {alert('warn', 'Formats', 'Phone: **+65 91234567** (8 digits). NRIC: last 4 characters, like **123A**. Password: at least **8 characters**, typed twice.')}
</section>''')

pages.append(f'''<section class="page">
{chapter(2, 'The Volunteer Guide', 'Read this short guide once, before your first session.',
  f"""{steps('The guide opens after you register. Read each section, scrolling to the end.', 'Tap **I\'ve read the guide**. The button only unlocks at the end of the guide.')}
  {alert('warn', 'Important', 'You can\'t say you\'re coming to a session until you have read the guide.')}
  <h3>Key points from the guide</h3>
  <div class="grid2">
    <div class="card pad"><p class="group-label in">What to wear</p>{bullets('Comfortable, modest clothes', 'Covered shoes', 'No dangling jewellery; short nails', 'Water bottle; cap if outdoors')}</div>
    <div class="card pad"><p class="group-label in">What we expect</p>{bullets('Arrive 10–15 minutes early', 'Stay with your paired trainee', 'Phone away during activities', 'Report any injury or worry to an admin at once')}</div>
    <div class="card pad"><p class="group-label in">With your trainee</p>{bullets('Short, simple sentences', 'Show as well as tell', 'Praise effort', 'If they get upset, stay calm and call an admin')}</div>
    <div class="card pad"><p class="group-label in">On the day</p>{bullets('Read your trainee\'s page', 'Show your QR pass to clock in and out', 'Give feedback afterwards')}</div>
  </div>
  {alert('error', 'Privacy', 'No photos or videos of trainees unless an admin allows it.')}
  <p>Read the guide again any time from <b>Me</b>.</p>""",
  shot('guide', 'The Volunteer Guide'))}
</section>''')

pages.append(f'''<section class="page">
{chapter(3, 'Saying you\'re coming', 'One tap. No approval needed.',
  f"""{steps('Open the **Sessions** tab. **Upcoming** lists every open session with its date, time and venue.', 'Tick every session you can come to (several at once is fine).', 'Tap **I\'m coming**. The card shows **You\'re coming**, and the session appears on **Home**.')}
  <h3>Who will I be with?</h3>
  {table(['You are', 'What happens'], [[badge('Volunteer','indigo'), 'An admin pairs you with a trainee before the session.'], [badge('Regular','emerald') + ' with fixed trainees', 'You\'re paired with them straight away.']])}
  <h3>Can't make it?</h3>
  <p>On <b>Home</b> → Coming up, tap <b>Can't make it</b>. Do it early so your trainee can be paired with someone else. On the day, tell an admin instead. You can't cancel after you've clocked in.</p>
  <h3>Can't say you're coming?</h3>
  {table(['Message', 'What it means'], [['"Sign-ups … are closed."', 'An admin closed sign-ups for that session.'], ['"Please read the Volunteer Guide…"', 'Read the guide first (Chapter 2).']])}""",
  shot('sessions', 'Sessions → Upcoming'))}
</section>''')

pages.append(f'''<section class="page">
{chapter(4, 'Your trainee', 'Read about your trainee before the session.',
  f"""{steps('On **Home**, each session shows your **Paired trainee** once an admin has paired you.', 'Tap the name for their page: short name, gender and language beside the photo, then the details MINDS shares.', '**Sections** jumps to a part of the page; tap a heading to open or close it.', 'Read the notes left by earlier volunteers.')}
  {alert('info', 'Tip', '**Press and hold** a trainee\'s name for a quick card.')}
  <h3>What you can see</h3>
  {table(['Profile', 'Trainees you can read about'], [
    [badge('Volunteer','indigo'), 'Your paired trainee, until 14 days after the session, and their 5 newest shared notes.'],
    [badge('Regular','emerald'), 'Any trainee, from the **Trainees** tab. Your fixed trainees are at the top of **Home**.'],
  ])}
  <h3>Send an update</h3>
  {steps('On the trainee\'s page, tap **Send update**.', 'Write what you noticed. **Attach files (optional)**: up to 3 photos, videos or documents.', 'Send. An admin reviews it before anyone else reads it.')}
  {alert('error', 'Privacy', 'Trainee information is confidential. Don\'t screenshot or share it outside the app.')}""",
  shot('trainee', 'A trainee\'s page'))}
</section>''')

pages.append(f'''<section class="page">
{chapter(5, 'On the day: your QR pass', 'Your QR pass records your arrival and departure, so your hours count automatically.',
  f"""<div class="flow">{''.join(f'<div class="fs"><span class="n">{i}</span><p class="ft">{t}</p><p>{d}</p></div>' for i,(t,d) in enumerate([('Prepare','Read your trainee\'s page'),('Arrive','Show your QR pass'),('Session','Stay with your trainee'),('Leave','Show your pass again'),('Feedback','Fill in the short form')],1))}</div>
  {steps('Open the app and tap **QR pass**.', 'An admin scans it when you arrive.', 'At the end, the admin scans it again.')}
  <h3>Good to know</h3>
  {bullets('**Works offline.** Passes for your next two weeks of sessions are kept on your phone. Open the app once with internet before you go.', '**One day only.** Each pass works only on its own day, so screenshots from another day won\'t work.', 'A second scan within 2 minutes is ignored.', '**Phone flat?** An admin can clock you in by hand.', '**Didn\'t say you were coming?** An admin can add you as a walk-in.', '**Forgot to be scanned out?** If MINDS has turned on automatic clock-out, you\'re clocked out at the session\'s end time.')}
  {alert('success', 'Becoming a regular', 'After 10 attended sessions, you become a regular automatically. An admin can also promote you.')}""",
  shot('pass', 'QR pass'))}
</section>''')

pages.append(f'''<section class="page">
{chapter(6, 'After the session: feedback', 'Your notes help the next volunteer who works with your trainee.',
  f"""{steps('On **Home**, tap **Give feedback** on the session.', 'Rate it from 1 to 5 and add a short comment.', 'Write what you noticed about each trainee. Attach files if useful.', 'Submit.')}
  {alert('warn', 'Important', 'Give feedback within **14 days**. You can submit it only once.')}
  <div class="grid2">
    <div class="card pad do"><p class="group-label in">Do</p>{bullets('Describe what worked: "Give two choices at a time."', 'Note what they enjoyed')}</div>
    <div class="card pad avoid"><p class="group-label in">Avoid</p>{bullets('Guesses about diagnoses', 'Labels like "naughty"')}</div>
  </div>
  <p>An admin reviews your notes about trainees before they are shared. By default they go to <b>that trainee's own volunteers</b>: their regulars and anyone paired with them in the last 2 weeks.</p>""",
  shot('feedback', 'Give feedback'))}
</section>''')

pages.append(f'''<section class="page">
{chapter(7, 'Your hours and past sessions', 'Everything about you is on Me and Sessions → Past.',
  f"""<h3>Me</h3>
  {table(['Part of Me', 'What it does'], [
    ['Hours volunteered and History', 'Your total hours, and each session with your hours and the trainee you were with.'],
    ['Edit', 'Change your details (Date of Birth, Sign-in email, …), then **Save** and **Continue**. Changing your email asks for your current password.'],
    ['Change password', 'The current one, then the new one. Your other devices are signed out.'],
    ['Volunteer Guide', 'Read it again any time.'],
  ])}
  <h3>Sessions → Past</h3>
  {steps('Open **Sessions** and tap **Past** at the top.', 'Tap a session to open it: who you were paired with, your clock-in and out times and hours, and the rating, feedback and notes you gave.', 'Search by session, venue, date or trainee.')}
  {alert('info', 'It\'s personal', 'Sessions → Past shows only your own sessions, for everyone, admins included. Admins see everyone\'s on **All sessions** (Chapter 14).')}""",
  shot('past', 'Sessions → Past'))}
</section>''')

# ---------------------------------------------------------------- Part B
pages.append(part('B', 'For admins', 'Run sessions, pair volunteers, record attendance and look after trainee information.', B_CH))

pages.append(f'''<section class="page">
{chapter(8, 'Admin basics', 'Admins use the same app, with an extra Admin menu.',
  f"""{steps('Open **Admin** (phone) or **Dashboard** in the sidebar (computer).', 'The Dashboard\'s **Home** has **Create Session**, **Session Management** (pick a session, then Pair, Who\'s coming, Scan or Clock in) and **Upcoming Sessions** (who\'s coming, paired and to pair, with **Copy Info** for Telegram).', '**All pages** lists every admin page by section, one tap away.')}
  {bullets('New admins register as volunteers first; an admin then taps **Make an admin** on their page.', '**Admins are always regulars.**', 'There must always be at least one admin, and you can\'t remove your own access.', 'Every admin change is recorded in the **Activity log**.')}
  <h3>Two passwords</h3>
  {table(['Password', 'Used for'], [['Your own password', 'Signing in.'], ['Admin password', 'Shared by all admins, separate from your own. Needed for admin access changes and some Advanced settings. A wrong one says **Wrong admin password** with the tries left.']])}
  {alert('warn', 'Changes ask first', 'Changes that matter show "Warning: You are … Do you wish to continue?" with **Cancel** / **Continue**.')}
  {alert('error', 'Privacy', 'Admins see medical, caregiver and personal details. Use them only for MINDS work, and never share the Google Sheets with volunteers.')}""",
  shot('admin', 'Admin → Dashboard'))}
</section>''')

pages.append(f'''<section class="page">
{chapter(9, 'Running sessions', 'Volunteers don\'t need approval. Your job is to create sessions and pair people.',
  f"""<h3>Create a session</h3>
  {steps('**Dashboard → Create Session**, or **All sessions → New session**.', 'Pick the date. It\'s a Regular session, 2:30–5:30 pm at Woodlands, for West End and RSPID (WGS), unless you change it.', '**Add another date** adds the same session on several days (up to 31 at once).', 'Add notes and the trainees attending if you like, then save. Volunteers see it in Sessions straight away.')}
  <h3>Session counts</h3>
  <div class="chips">{badge('coming','slate')} {badge('to pair','amber')} {badge('on site','emerald')} {badge('done','indigo')} {badge('no-shows','red')}</div>
  <h3>On the session page</h3>
  {bullets('See everyone coming and their trainees; no-shows after the day.', '**Edit or close this session**: change times, close sign-ups or cancel it (with a warning).', 'Remove someone from the list (not after they clock in).', 'Pair, scan, clock in by hand and add walk-ins.')}""",
  shot('allsessions', 'All sessions'))}
</section>''')

pages.append(f'''<section class="page">
{chapter(10, 'Pairing', 'Volunteers see a trainee only after you pair them. The board works like the WERONE outing app.',
  f"""<h3>For one session</h3>
  {steps('**Pairing → Sessions to pair** → a session (or **Pair** on the Dashboard).', '**Volunteers** on the left, **Trainees** on the right, with a search box each.', '**Drag** a card onto a card in the other column, or tap a card (or **+Trn** / **+Vol**) and tick names.', '**✕** unpairs. **Saved** shows when it\'s stored.')}
  {bullets('Many to many: a volunteer can have several trainees, and a trainee several volunteers.', 'Each column\'s button cycles **All → Unpaired → Paired**. The red **N unpaired** count shows who\'s left.', 'Other admins\' changes appear on the board by themselves.', '**Pairing list** gives a table to screenshot or share.')}
  <h3>Regular pairings</h3>
  <p><b>Pairing → Regular pairings</b>: the same board with regulars on the left. Their fixed trainees are paired with them every time they say they're coming; their upcoming sessions follow the change.</p>
  {alert('info', 'History', '**Pairing → History** shows every pair that has been together, and each regular\'s fixed trainees over time.')}""",
  shot('board', 'Pairing board'))}
</section>''')

pages.append(f'''<section class="page">
{chapter(11, 'Clocking in and out', 'One scan clocks in. The next clocks out.',
  f"""{steps('Open the session and tap **Scan** (or **Scan passes** on All sessions), on the day.', 'Allow the camera and scan the volunteer\'s QR pass.', 'Scan again at the end to clock them out.')}
  {table(['Message', 'What to do'], [
    ['"Clocked in at 14:32."', 'Done. Pair them if it says they\'re not paired.'],
    ['"Already clocked in…"', 'A second scan within 2 minutes. Ignore it.'],
    ['"3 h recorded…"', 'Clocked out.'],
    ['"…has no booking for this session."', 'Tap **Add as walk-in and clock in**.'],
    ['"This QR code is for 2026-…"', 'An old pass or screenshot. Ask them to open the app.'],
  ])}
  {bullets('**No signal?** Keep scanning. Scans upload when you\'re back online (within 24 hours).', '**Phone flat?** Session → **Clock in** → **Clock in** / **Clock out** by hand. Only on the day.', '**Automatic clock-out** (if turned on in Advanced settings): anyone still clocked in an hour after the session ends is clocked out at the end time, marked **Auto clock-out**.', '**Mistakes?** Fix them in **Volunteers → Attendance** (Chapter 14).')}""",
  shot('clock', 'Clock in by hand'))}
</section>''')

pages.append(f'''<section class="page">
{chapter(12, 'Managing volunteers', 'Volunteers → People lists everyone, with filters and search.',
  f"""{table(['On a volunteer\'s page', 'What it does'], [
    ['Edit', 'Same checks as registration. Saving also updates their Google contact (after a warning).'],
    ['Promote to regular / Move back to volunteer', 'Change their profile. Admins are always regulars.'],
    ['Make an admin / Remove admin access', 'Needs the admin password. Remove access first to move an admin back to volunteer.'],
    ['Reset password', 'Shows a temporary password once. Pass it on privately.'],
    ['Deactivate / Reactivate', 'Blocks sign-in and cancels their upcoming sessions. Hours, notes and history are kept.'],
  ])}
  {table(['On People', 'What it does'], [
    ['Filters', 'Active / Deactivated / Everyone, and by profile.'],
    ['Add volunteer', 'With a temporary password, or listed only so they register later with the same email.'],
  ])}
  <p>Profile badges are the same everywhere: {badge('Volunteer','indigo')} {badge('Regular','emerald')} {badge('Admin','purple')}</p>""",
  shot('people', 'Volunteers → People'))}
</section>''')

pages.append(f'''<section class="page">
{chapter(13, 'Trainees and notes', 'You decide what volunteers see, and who reads each note.',
  f"""<h3>Review volunteers' notes</h3>
  {steps('**Trainees → Notes to review**.', 'Edit the wording if needed.', 'Choose who can read it, then **Save**.')}
  {table(['Who can read', 'Means'], [
    ['This trainee\'s volunteers (default)', 'Their regulars and anyone paired with them in the last 2 weeks.'],
    ['All volunteers', 'Everyone who can see this trainee.'],
    ['Regulars only', 'Regular volunteers.'],
    ['Selected volunteers', 'Only the people you pick. Press and hold the note to see who.'],
    ['Private', 'Admins only.'],
  ])}
  <h3>Trainees</h3>
  {bullets('**Add trainee**: MINDS\'s House Visit Form; the ✱ questions are required, the rest can come later.', 'A trainee\'s page: every detail, **Change photo**, **New house visit**, **Edit**, their regular volunteers and notes.', '**Trainees → What volunteers see**: ticks for volunteers and for regulars (the default), or a trainee\'s own settings from their page. **Set as default** copies one trainee\'s settings to all.')}
  {alert('error', 'Privacy', 'Think carefully before showing medical, family or contact details to volunteers.')}""",
  shot('review', 'Notes to review'))}
</section>''')

pages.append(f'''<section class="page">
{chapter(14, 'Records and past sessions', 'Everything that has happened, in one place.',
  f"""<h3>All sessions → Past sessions</h3>
  {steps('Open **All sessions** and scroll to **Past sessions**.', 'Tap a session: everyone who signed up, who they were paired with, their clock-in and out times and hours (**Did not come**, **Auto clock-out**), and their rating, feedback and trainee notes.', 'Search by session, venue, date, volunteer or trainee. **Open the session page** for the full session.')}
  {table(['Page', 'What you can do'], [
    ['Dashboard → Overview', 'Volunteers, regulars, trainees without a regular, hours this month, who still needs pairing.'],
    ['Dashboard → Activity log', 'Every admin change and who made it; filter by admin, date or words.'],
    ['Volunteers → Attendance', 'Fix a missed scan or add a record by hand. Check rows marked **Auto clock-out**.'],
    ['Volunteers → Hours', 'Hours for any dates, with **Export** (CSV) for certificates.'],
    ['More → House visits', '**New visit**: MINDS\'s House Visit Form, prefilled with what\'s known. Visits can\'t be edited later.'],
    ['More → Outings, Trips, Fundraising', 'Kept from Version 1 until MINDS decides how they fit.'],
  ])}""",
  shot('pastall', 'All sessions → Past sessions'))}
</section>''')

pages.append(f'''<section class="page">
{chapter(15, 'Guide, projects and venues', 'Edit these in Settings → Guide & projects and Venues.',
  f"""{table(['Item', 'How'], [
    ['Volunteer Guide', '**Edit** a section, **Add text**, or **Add Files** (from your device or Google Drive; up to 8 MB). Drag the ⠿ handle to reorder. **Preview as a volunteer** shows the result.'],
    ['Projects', 'RSPID (CTDC), RSPID (WGS) and West End; registration also offers the RSPID Alumni options.'],
    ['Venues', 'Name, address and notes. Add a venue before using it in a session.'],
  ])}
  {alert('warn', 'Important', 'Guide pictures and PDFs can be opened by anyone with the link. Never include trainee information.')}""",
  shot('guideedit', 'Guide & projects'))}
</section>''')

pages.append(f'''<section class="page">
{chapter(16, 'Settings', 'Rarely needed. Some settings affect everyone.',
  f"""{table(['Setting', 'What it does'], [
    ['Admin password', 'The current one, then the new one twice. Tell the other admins. 5 wrong tries, then a 15-minute wait. Forgotten? The Apps Script project\'s owner runs **resetAdminPassword()**.'],
    ['Google Sheets', 'The volunteer database and the trainee & house visit database: **Create New Sheet**, search Google Drive and **Link**, or paste a URL and **Connect**. A sheet without your admin account is refused, so nobody is signed out.'],
    ['Advanced settings', '**Check the setup** (changes nothing), **Run setup**, **Save all volunteers to Google Contacts**, and **Turn on / off automatic clock-out**. Each shows a report and goes in the Activity log.'],
  ])}
  {alert('info', 'Need more help?', 'The online user guide in the app\'s repository has every step: volunteer-app/docs/USER-GUIDE.md.')}""",
  shot('advanced', 'Advanced settings'))}
</section>''')

CSS = r'''
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: Inter, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #334155; font-size: 10.6pt; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; padding: 16mm 15mm 18mm; background: #f8fafc; position: relative; page-break-after: always; overflow: hidden; }
.page::after { content: "MINDS Volunteer App · User & Admin Handbook"; position: absolute; left: 15mm; bottom: 8mm; font-size: 7.5pt; color: #94a3b8; }
.cover::after, .part::after { content: none; }
b { color: #0f172a; font-weight: 700; }
h3 { font-size: 12.5pt; font-weight: 800; color: #0f172a; margin: 12px 0 6px; letter-spacing: -0.01em; }
p { margin: 0 0 6px; }
.group-label { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin: 0 0 4px; }
.group-label.in { margin-bottom: 6px; }
.page-title { font-size: 24pt; font-weight: 800; letter-spacing: -0.02em; color: #0f172a; margin: 0 0 4px; }
.lead { color: #64748b; font-size: 10.5pt; margin-bottom: 12px; }
.muted { color: #64748b; } .small { font-size: 8pt; }
.card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 1px 2px rgba(15,23,42,.05); margin: 8px 0; overflow: hidden; }
.card.pad { padding: 10px 12px; margin: 0; }
.tbl table { width: 100%; border-collapse: collapse; }
.tbl th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; color: #64748b; background: #f8fafc; padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
.tbl td { padding: 7px 10px; border-top: 1px solid #f1f5f9; vertical-align: top; font-size: 9.8pt; }
.tbl td:first-child { width: 36%; color: #0f172a; font-weight: 600; }
.steps { list-style: none; padding: 0; margin: 6px 0 8px; }
.steps li { display: flex; gap: 10px; align-items: flex-start; margin: 0 0 8px; }
.steps .n, .flow .n { flex: none; width: 20px; height: 20px; border-radius: 50%; background: #4f46e5; color: #fff; font-weight: 800; font-size: 8.5pt; display: inline-flex; align-items: center; justify-content: center; margin-top: 1px; }
.bul { margin: 4px 0 8px; padding-left: 16px; } .bul li { margin: 0 0 4px; } .bul li::marker { color: #4f46e5; }
.badge { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 7.8pt; font-weight: 700; white-space: nowrap; }
.badge-indigo { background: #e0e7ff; color: #4338ca; } .badge-emerald { background: #d1fae5; color: #065f46; }
.badge-amber { background: #fef3c7; color: #92400e; } .badge-red { background: #fee2e2; color: #b91c1c; }
.badge-slate { background: #f1f5f9; color: #475569; } .badge-purple { background: #f3e8ff; color: #7e22ce; }
.chips .badge { margin: 0 4px 4px 0; font-size: 8.5pt; padding: 3px 10px; }
.alert { display: flex; gap: 9px; border: 1px solid; border-radius: 12px; padding: 9px 12px; margin: 10px 0; font-size: 9.8pt; }
.alert p { margin: 0; } .alert .at { font-weight: 800; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 1px; }
.alert .ai { flex: none; width: 17px; height: 17px; border-radius: 50%; color: #fff; font-weight: 800; font-size: 8pt; display: inline-flex; align-items: center; justify-content: center; margin-top: 1px; }
.alert-info { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; } .alert-info .ai { background: #4f46e5; } .alert-info b { color: #3730a3; }
.alert-warn { background: #fffbeb; border-color: #fde68a; color: #92400e; } .alert-warn .ai { background: #d97706; } .alert-warn b { color: #78350f; }
.alert-error { background: #fef2f2; border-color: #fecaca; color: #b91c1c; } .alert-error .ai { background: #dc2626; } .alert-error b { color: #991b1b; }
.alert-success { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; } .alert-success .ai { background: #059669; } .alert-success b { color: #064e3b; }
.cols.two { display: grid; grid-template-columns: 1fr 62mm; gap: 8mm; align-items: start; }
.phone { margin: 0; background: #0f172a; border-radius: 22px; padding: 6px; box-shadow: 0 8px 20px rgba(15,23,42,.18); }
.phone img { display: block; width: 100%; border-radius: 16px; }
.phone figcaption { text-align: center; color: #cbd5e1; font-size: 7.3pt; font-weight: 600; padding: 5px 0 2px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0; }
.do { border-top: 3px solid #10b981; } .avoid { border-top: 3px solid #ef4444; }
.flow { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; margin: 6px 0 10px; }
.fs { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 7px 5px; text-align: center; font-size: 8.2pt; color: #64748b; }
.fs .ft { font-weight: 800; color: #0f172a; font-size: 8.5pt; margin: 4px 0 2px; }
.toc { padding: 10px 14px; } .toc table { width: 100%; border-collapse: collapse; }
.toc td { padding: 4px 0; border-top: 1px solid #f1f5f9; font-size: 9.5pt; color: #0f172a; font-weight: 600; }
.toc tr:first-child td { border-top: 0; } .toc .tn { width: 26px; color: #4f46e5; font-weight: 800; }
/* cover */
.cover { background: linear-gradient(160deg, #4f46e5 0%, #4338ca 55%, #312e81 100%); color: #e0e7ff; padding: 16mm 15mm; }
.cover-top { display: flex; align-items: center; gap: 10px; }
.app-icon { width: 40px; height: 40px; border-radius: 10px; background: #fff; }
.brand { font-weight: 800; color: #fff; font-size: 12pt; margin: 0; } .brand-sub { margin: 0; font-size: 8pt; color: #c7d2fe; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; }
.group-label.light { color: #c7d2fe; margin-top: 26mm; }
.cover-title { font-size: 38pt; line-height: 1.02; font-weight: 800; color: #fff; letter-spacing: -0.03em; margin: 2px 0 4px; }
.cover-sub { font-size: 15pt; color: #e0e7ff; font-weight: 600; margin-bottom: 8px; }
.cover-lead { color: #c7d2fe; font-size: 10.5pt; max-width: 110mm; }
.cover-grid { display: grid; grid-template-columns: 1fr 58mm; gap: 10mm; margin-top: 10mm; align-items: start; }
.ccard { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); border-radius: 14px; padding: 10px 13px; margin-bottom: 9px; color: #e0e7ff; font-size: 9pt; }
.ccard .ct { color: #fff; font-weight: 800; font-size: 10pt; margin-bottom: 2px; }
.cover .phone { background: #0b1020; }
.cover-foot { position: absolute; left: 15mm; right: 15mm; bottom: 10mm; display: flex; justify-content: space-between; font-size: 8pt; color: #c7d2fe; }
/* part pages */
.part { display: flex; align-items: center; }
.part-card { width: 100%; background: linear-gradient(160deg, #4f46e5, #312e81); border-radius: 22px; padding: 22mm 16mm; color: #e0e7ff; box-shadow: 0 12px 30px rgba(49,46,129,.25); }
.part-label { text-transform: uppercase; letter-spacing: .12em; font-weight: 800; font-size: 9pt; color: #c7d2fe; }
.part-card h1 { color: #fff; font-size: 32pt; font-weight: 800; letter-spacing: -0.02em; margin: 4px 0 6px; }
.part-lead { font-size: 11pt; color: #c7d2fe; margin-bottom: 14px; }
.part-list { list-style: none; padding: 0; margin: 0; } .part-list li { padding: 6px 0; border-top: 1px solid rgba(255,255,255,.15); color: #fff; font-weight: 600; font-size: 10.5pt; }
.pn { display: inline-block; width: 28px; color: #a5b4fc; font-weight: 800; }
'''

DOC = f'<!doctype html><html><head><meta charset="utf-8"><title>MINDS Volunteer App – User &amp; Admin Handbook</title><style>{CSS}</style></head><body>{"".join(pages)}</body></html>'


async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        pg = await br.new_page()
        await pg.set_content(DOC, wait_until='load')
        await pg.wait_for_timeout(500)
        await pg.pdf(path=OUT, format='A4', print_background=True, prefer_css_page_size=True)
        await br.close()

asyncio.run(main())
print('wrote', OUT)
