"""
Checks every page at common phone sizes (and two phones held sideways) for
anything that runs off the screen, cut-off header titles, and page errors.

  cd volunteer-app
  PORT=5312 npm run dev &                 # the local demo on port 5312
  pip install playwright && playwright install chromium
  python3 dev/check-phones.py             # all sizes (about 10 minutes)
  python3 dev/check-phones.py 0,5         # just the Galaxy Fold and the Pixel 9

Prints "all clean", or each problem by phone and page.
"""
import asyncio, json, sys
from playwright.async_api import async_playwright
BASE='http://localhost:5312'
PHONES = [('Galaxy Fold (folded)',280,653),('Small (320)',320,568),('Galaxy S8',360,740),('iPhone SE',375,667),('iPhone 13/14',390,844),('Pixel 9',412,924),('iPhone Pro Max',430,932),('Pixel 9 sideways',924,412),('iPhone 14 sideways',844,390)]
ADMIN_ROUTES = ['admin','today','pairings','pairings/regular','pairings/history','volunteers','attendance','hours','trainees','trainee/T-0001','review','visibility','overview','log','guide-edit','venues','admin-password','sheets','advanced','fundraising','outings','trips','visits','visit-new/T-0001','new-session']
VOL_ROUTES = ['home','pass','sessions','me','edit-me','guide']
CHECK = """(() => {
  const W = innerWidth, out = [];
  if (document.documentElement.scrollWidth > W + 1) out.push('page ' + (document.documentElement.scrollWidth - W) + 'px wide');
  // things sticking out of the screen, unless inside something that scrolls sideways on purpose
  const scrolls = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  for (const e of document.querySelectorAll('header *, main *, .action-bar *, #pagetabs, nav')) {
    const r = e.getBoundingClientRect();
    if (!r.width || getComputedStyle(e).visibility === 'hidden') continue;
    if ((r.right > W + 1 || r.left < -1) && !scrolls(e)) { out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ').slice(0,2).join('.')} ${Math.round(r.left)}..${Math.round(r.right)}`); if (out.length > 4) break; }
  }
  // header: title still readable, buttons all on screen
  const t = document.getElementById('nav-title');
  if (t && t.offsetParent && t.scrollWidth > t.clientWidth + 1 && t.clientWidth < 90) out.push('header title cut to ' + t.clientWidth + 'px: ' + t.textContent);
  return out;
})()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); report = {}
        pick = [int(x) for x in sys.argv[1].split(',')] if len(sys.argv) > 1 else range(len(PHONES))
        for name, w, h in [PHONES[i] for i in pick]:
            for email, pw, routes in [('admin@example.com','AdminDemo123',ADMIN_ROUTES), ('volunteer@example.com','VolunteerDemo123',VOL_ROUTES)]:
                c = await b.new_context(viewport={'width':w,'height':h}, is_mobile=True, has_touch=True, device_scale_factor=2.6); pg = await c.new_page(); errs=[]
                pg.on('pageerror', lambda e: errs.append(str(e)))
                await pg.goto(BASE+'/#/login'); await pg.wait_for_timeout(500)
                await pg.fill('[name=email]',email); await pg.fill('[name=password]',pw); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1300)
                for r in routes:
                    await pg.goto(f'{BASE}/#/{r}'); await pg.wait_for_timeout(650)
                    issues = await pg.evaluate(CHECK)
                    if issues: report.setdefault(name, []).append(f'{r}: ' + '; '.join(issues))
                if errs: report.setdefault(name, []).append('ERRORS ' + '; '.join(errs[:2]))
                await c.close()
        await b.close()
        for k, v in report.items():
            print(f'== {k}'); [print('  ', x[:230]) for x in v[:14]]
        if not report: print('all clean')
asyncio.run(main())
