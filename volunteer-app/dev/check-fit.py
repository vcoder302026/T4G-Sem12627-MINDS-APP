"""
Design faults the other layout checks miss (found on a real iPhone, October 2026):

  1. a control sticking out of its box or past the screen edge (e.g. date boxes wider than
     their column);
  2. a short label or name breaking across lines in a button, chip, badge, tab or pairing card
     (e.g. "Mock Trainee / 1" in a pairing pill);
  3. a date box with no visible label (an empty one is blank on iPhone).

Unlike check-squash.py it looks inside the pairing board too.

  cd volunteer-app
  PORT=5326 npm run dev &
  python3 dev/check-fit.py            # 320, 375, 393, 430 and 768 px
  python3 dev/check-fit.py 393        # one width
  python3 dev/check-fit.py --ios 393  # as iPhone Safari shows it (empty date boxes have no width)
"""
import asyncio, sys
from playwright.async_api import async_playwright

BASE = 'http://localhost:5326'
# --ios: imitate iPhone Safari in Chrome. The page believes it's on iOS (CSS.supports
# '-webkit-touch-callout'), gets the iOS-only CSS, and empty date boxes lose their built-in
# width, as in Safari (Chrome gives them one, which hid the New session date box bug).
IOS = '--ios' in sys.argv
IOS_INIT = "const s = CSS.supports.bind(CSS); CSS.supports = (a, v) => (String(a).includes('touch-callout') ? true : s(a, v));"
IOS_CSS = '''input[type="date"] { -webkit-appearance: none; appearance: none; display: block; width: 100%; min-height: 2.75rem; }
.date-wrap.is-empty .date-ph { display: block; }
div:has(> .date-wrap) { min-width: min(10rem, 100%); }
input[type="date"]::-webkit-datetime-edit, input[type="date"]::-webkit-calendar-picker-indicator { display: none !important; }'''
SIZES = [(320, 640), (375, 812), (393, 852), (430, 932), (768, 1024)]
ADMIN = ['admin', 'overview', 'log', 'today', 'new-session', 'pairings', 'pairings/regular', 'pairings/history', 'volunteers',
         'attendance', 'hours', 'trainees', 'trainee/T-0001', 'trainee-new', 'review', 'visibility', 'guide-edit', 'venues',
         'admin-password', 'sheets', 'advanced', 'visits', 'visit-new/T-0001', 'fundraising']
VOL = ['home', 'pass', 'sessions', 'me', 'edit-me', 'guide', 'info/T-0001']

CHECK = r"""(() => {
  const out = new Set();
  const vw = document.documentElement.clientWidth;
  const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('.sr-only, [hidden]'); };
  const scrolls = (e) => { for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowX)) return true; } return false; };
  const name = (e) => (e.innerText || e.value || e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);

  // 1. Controls sticking out of their box or past the screen edge.
  for (const e of document.querySelectorAll('main input, main select, main textarea, main button, main a.btn, main .badge, main .card, main img, dialog input, dialog select, dialog button')) {
    if (!visible(e) || e.type === 'hidden' || e.type === 'checkbox' || e.type === 'radio' || scrolls(e)) continue;
    const r = e.getBoundingClientRect();
    const p = e.parentElement.getBoundingClientRect();
    const ps = getComputedStyle(e.parentElement);
    const inner = p.right - parseFloat(ps.borderRightWidth || 0);
    if (r.right > vw + 1) out.add(`past the screen edge: ${e.tagName.toLowerCase()} "${name(e)}" (right ${Math.round(r.right)} of ${vw})`);
    else if (r.right > inner + 2 && ps.overflow === 'visible') out.add(`sticks out of its box by ${Math.round(r.right - inner)}px: ${e.tagName.toLowerCase()} "${name(e)}"`);
  }

  // 1b. Boxes too small to use: text and date boxes under 7rem, number boxes under 4rem.
  for (const e of document.querySelectorAll('main input, main select, main textarea, dialog input, dialog select, dialog textarea')) {
    if (!visible(e) || ['hidden', 'checkbox', 'radio', 'file', 'range', 'color'].includes(e.type) || e.closest('.sr-only')) continue;
    const w = e.getBoundingClientRect().width;
    const min = e.type === 'number' ? 64 : 112;
    if (w < min) out.add(`box too small to use (${Math.round(w)}px): ${e.type || e.tagName.toLowerCase()} "${name(e)}"`);
  }

  // 2. Short labels and names breaking across lines.
  // The most lines any one piece of text takes (icons and count badges beside it don't count).
  const lines = (e) => {
    let most = 0;
    const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      if (!t.textContent.trim() || t.parentElement.closest('.tab-count, .side-count, .badge') !== (e.matches('.badge') ? e : null) && t.parentElement.closest('.tab-count, .side-count')) continue;
      const range = document.createRange(); range.selectNodeContents(t);
      const tops = new Set([...range.getClientRects()].filter((r) => r.width > 1).map((r) => Math.round(r.top / 4)));
      most = Math.max(most, tops.size);
    }
    return most;
  };
  for (const e of document.querySelectorAll('main .btn, main .badge, main .chip, main .pb-pill, main .pb-name, main .pb-add, main .seg-item, main .sub-link, #tabs .seg-item, #subnav .sub-link, main .tab-count, main .pb-toggle, dialog .btn')) {
    if (!visible(e)) continue;
    const text = (e.innerText || '').trim().replace(/\s+/g, ' ');
    if (!text || text.length > 22) continue;
    if (lines(e) >= 2) out.add(`short text breaks across lines: "${text}" (${e.className.split(' ').find((c) => /^(pb-|btn|badge|chip|seg|sub)/.test(c)) || e.tagName.toLowerCase()}, ${Math.round(e.getBoundingClientRect().width)}px)`);
  }

  // 3. Date boxes without a visible label.
  for (const e of document.querySelectorAll('main input[type=date], dialog input[type=date]')) {
    if (!visible(e)) continue;
    let label = (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)) || e.closest('label');
    for (let n = e.parentElement, i = 0; !label && n && i < 4; n = n.parentElement, i++) label = n.querySelector(':scope > label, :scope > .label');
    if (!label || !visible(label)) out.add(`date box with no visible label (blank on iPhone when empty): "${e.getAttribute('aria-label') || e.name || ''}"`);
  }
  return [...out];
})()"""


# Pop-ups with date boxes (and other fields): open each, check it, close it.
DIALOGS = [('volunteers', 'Add volunteer'), ('fundraising', 'New fundraiser'), ('outings', 'New outing'), ('trips', 'New trip'),
           ('trainee/T-0001', 'Edit')]


async def check_dialogs(pg, found, size):
    for route, button in DIALOGS:
        await pg.goto(BASE + '/#/' + route); await pg.wait_for_timeout(1300)
        b = pg.locator('main button:visible', has_text=button).first
        if not await b.count(): continue
        await b.click(); await pg.wait_for_timeout(600)
        for f in await pg.evaluate(CHECK):
            found.setdefault(size, {}).setdefault(f'{route} → {button}', []).append(f)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)


async def first_pairing(pg):
    await pg.goto(BASE + '/#/admin'); await pg.wait_for_timeout(1200)
    href = await pg.locator('main a[href^="#/pair/"]').first.get_attribute('href')
    return href[2:] if href else None


async def run(widths):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        found = {}
        for w, h in [s for s in SIZES if not widths or s[0] in widths]:
            c = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 1024, has_touch=w < 1024)
            if IOS: await c.add_init_script(IOS_INIT)
            pg = await c.new_page()
            for r in ['login', 'register']:  # signed out
                await pg.goto(BASE + '/#/' + r); await pg.wait_for_timeout(1200)
                if IOS: await pg.add_style_tag(content=IOS_CSS)
                for f in await pg.evaluate(CHECK):
                    found.setdefault(f'{w}px', {}).setdefault(r, []).append(f)
            await c.close()
            for email, pw, routes in [('admin@example.com', 'AdminDemo123', ADMIN), ('volunteer@example.com', 'VolunteerDemo123', VOL)]:
                c = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 1024, has_touch=w < 1024)
                if IOS: await c.add_init_script(IOS_INIT)
                pg = await c.new_page()
                await pg.goto(BASE + '/#/login'); await pg.wait_for_timeout(400)
                await pg.fill('[name=email]', email); await pg.fill('[name=password]', pw); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1200)
                pages = list(routes)
                if email.startswith('admin'):
                    pair = await first_pairing(pg)
                    if pair: pages.append(pair)
                    await check_dialogs(pg, found, f'{w}px')
                if IOS: await pg.add_style_tag(content=IOS_CSS)
                for r in pages:
                    await pg.goto(BASE + '/#/' + r); await pg.wait_for_timeout(1300)
                    for f in await pg.evaluate(CHECK):
                        found.setdefault(f'{w}px', {}).setdefault(r.split('/')[0] if r.startswith('pair/') else r, []).append(f)
                await c.close()
        await b.close()
    if not found:
        print('all fit'); return 0
    for size, pages in found.items():
        print(f'== {size}')
        for page, faults in pages.items():
            for f in faults: print(f'   {page}: {f}')
    return 1


if __name__ == '__main__':
    widths = [int(a) for a in sys.argv[1:] if a.isdigit()]
    sys.exit(asyncio.run(run(widths)))
