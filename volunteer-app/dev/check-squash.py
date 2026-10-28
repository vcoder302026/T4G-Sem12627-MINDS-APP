"""
Squashed text on phones and tablets: finds text that wraps onto 3+ lines with
fewer than ~3 words a line (e.g. a column squeezed by a badge beside it).

  cd volunteer-app
  PORT=5326 npm run dev &
  python3 dev/check-squash.py            # all sizes
  python3 dev/check-squash.py 412        # one width
"""
import asyncio, sys
from playwright.async_api import async_playwright
BASE = 'http://localhost:5326'
SIZES = [(280, 653), (360, 740), (412, 924), (768, 1024), (1024, 1366)]
ADMIN = ['admin', 'today', 'pairings', 'pairings/regular', 'pairings/history', 'volunteers', 'attendance', 'hours', 'trainees', 'trainee/T-0001',
         'review', 'visibility', 'overview', 'log', 'guide-edit', 'venues', 'admin-password', 'sheets', 'advanced', 'visits', 'visit-new/T-0001', 'new-session']
VOL = ['home', 'pass', 'sessions', 'me', 'edit-me', 'guide', 'info/T-0001']
CHECK = r"""(() => {
  const out = [];
  const seen = new Set();
  const main = document.getElementById('view');
  const full = main ? main.clientWidth : innerWidth;
  for (const e of document.querySelectorAll('main p, main h2, main h3, main li, main dd, main dt, main a, main span.block, main label, dialog p, dialog dd, dialog dt')) {
    if (e.closest('.pb-col, table, .wheel-col, .hv-likert, .hv-likert-view, svg, .sr-only')) continue;
    if (e.querySelector('p, h2, h3, li, dd, div')) continue; // the innermost text blocks only
    const text = e.innerText.trim();
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 4) continue;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || r.width >= full * 0.5 || r.width >= 300) continue; // 300px+ is a comfortable reading width // using most of the width is just wrapping
    const lh = parseFloat(getComputedStyle(e).lineHeight) || 20;
    const lines = Math.round(r.height / lh);
    if (lines >= 3 && words.length / lines < 3) {
      const key = text.slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`"${text.slice(0, 50).replace(/\n/g, ' ')}" ${Math.round(r.width)}px of ${full}px, ${lines} lines`);
    }
  }
  const tabs = document.getElementById('tabs-list');
  if (tabs && tabs.offsetParent && [...tabs.children].some((i) => i.getBoundingClientRect().right > innerWidth + 1 || i.scrollWidth > i.clientWidth + 1)) out.push('a tab in the tab bar is cut off');
  const t = document.getElementById('nav-title');
  if (t && t.offsetParent && t.scrollHeight > t.clientHeight + 2) out.push(`header title cut: "${t.textContent}"`);
  return out;
})()"""
async def run(widths):
    async with async_playwright() as p:
        b = await p.chromium.launch(); found = {}
        for w, h in [s for s in SIZES if not widths or s[0] in widths]:
            for email, pw, routes in [('admin@example.com', 'AdminDemo123', ADMIN), ('volunteer@example.com', 'VolunteerDemo123', VOL)]:
                c = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 1024, has_touch=w < 1024); pg = await c.new_page()
                await pg.goto(BASE + '/#/login'); await pg.wait_for_timeout(400)
                await pg.fill('[name=email]', email); await pg.fill('[name=password]', pw); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1200)
                for r in routes:
                    await pg.goto(f'{BASE}/#/{r}'); await pg.wait_for_timeout(700)
                    for issue in await pg.evaluate(CHECK):
                        found.setdefault(f'{w}px', []).append(f'{r}: {issue}')
                await c.close()
        await b.close()
        for k, v in found.items():
            print(f'== {k}'); [print('  ', x[:200]) for x in v[:25]]
        if not found: print('nothing squashed')
asyncio.run(run([int(x) for x in sys.argv[1:]]))
