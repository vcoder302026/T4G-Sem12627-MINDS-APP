"""
Scrolling on phones: every page taller than the screen scrolls with a finger
swipe, and nothing is left on top of the next page after a dropdown sheet, a
date wheel or a quick card is open when the page changes (Back), or after
dragging on the pairing board.

  cd volunteer-app
  PORT=5316 npm run dev &
  python3 dev/check-scroll.py
"""
import asyncio, sys
from playwright.async_api import async_playwright
BASE='http://localhost:5316'
ADMIN = ['admin','today','pairings','pairings/regular','pairings/history','volunteers','attendance','hours','trainees','trainee/T-0001','info/T-0001','review','visibility','overview','log','guide-edit','venues','admin-password','sheets','advanced','fundraising','outings','trips','visits','visit-new/T-0001','new-session','guide','me','edit-me','sessions']
async def swipe(pg, cdp, x=200, y=700, dy=-400):
    await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    for i in range(1, 9):
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x,'y':y + dy*i/8}]}); await pg.wait_for_timeout(16)
    await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); await pg.wait_for_timeout(450)
async def every_page():
    async with async_playwright() as p:
        b=await p.chromium.launch(); c=await b.new_context(viewport={'width':412,'height':924}, is_mobile=True, has_touch=True, device_scale_factor=2); pg=await c.new_page(); cdp=await c.new_cdp_session(pg)
        await pg.goto(BASE+'/#/login'); await pg.wait_for_timeout(500)
        await pg.fill('[name=email]','admin@example.com'); await pg.fill('[name=password]','AdminDemo123'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1300)
        sid = await pg.evaluate("(JSON.parse(localStorage.getItem('minds.ahome'))||{sessions:[]}).sessions.find(s=>s.date===JSON.parse(localStorage.getItem('minds.ahome')).today).sessionId")
        bad = []
        for r in ADMIN + [f'session/{sid}', f'pair/{sid}', f'clock/{sid}']:
            await pg.goto(f'{BASE}/#/{r}'); await pg.wait_for_timeout(1100)
            await pg.evaluate("window.scrollTo(0,0)")
            tall = await pg.evaluate("document.documentElement.scrollHeight - innerHeight")
            if tall < 80: continue
            await swipe(pg, cdp)
            y = await pg.evaluate("scrollY")
            if y < 40: bad.append(f'{r}: page {tall}px taller than screen, swipe scrolled {y}px')
        print('\n'.join(bad) or 'every tall page scrolls')
        await b.close()


async def swipe(pg, cdp, x=200, y=700, dy=-400):
    await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    for i in range(1, 9):
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x,'y':y + dy*i/8}]}); await pg.wait_for_timeout(16)
    await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); await pg.wait_for_timeout(500)
async def after(pg, cdp, label):
    await pg.goto(BASE+'/#/info/T-0001') if 'info' not in pg.url else None
    await pg.wait_for_timeout(1200); await pg.evaluate("window.scrollTo(0,0)")
    await swipe(pg, cdp)
    layers = await pg.evaluate("document.querySelectorAll('.wheel-overlay, .dnd-ghost, dialog[open]').length")
    y = await pg.evaluate('scrollY')
    print(f"{label}: layers left {layers} | trainee page scrolled {y}px")
async def leftovers():
    async with async_playwright() as p:
        b=await p.chromium.launch(); c=await b.new_context(viewport={'width':412,'height':924}, is_mobile=True, has_touch=True); pg=await c.new_page(); cdp=await c.new_cdp_session(pg)
        await pg.goto(BASE+'/#/login'); await pg.wait_for_timeout(500)
        await pg.fill('[name=email]','admin@example.com'); await pg.fill('[name=password]','AdminDemo123'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1300)
        for start, opener, label in [('trainees', 'main .select-display', 'dropdown sheet + Back')]:
            await pg.goto(BASE+'/#/info/T-0001'); await pg.wait_for_timeout(1000)
            await pg.goto(f'{BASE}/#/{start}'); await pg.wait_for_timeout(1500)
            await pg.locator(opener).first.click(); await pg.wait_for_timeout(400)
            await pg.go_back(); await after(pg, cdp, label)
        # quick card + Back
        await pg.goto(BASE+'/#/info/T-0001'); await pg.wait_for_timeout(1000)
        await pg.goto(BASE+'/#/trainees'); await pg.wait_for_timeout(1500)
        await pg.locator('main .only-narrow [data-trainee]').first.click(button='right'); await pg.wait_for_timeout(900)
        await pg.go_back(); await after(pg, cdp, 'quick card + Back')
        # a real touch drag on the pairing board, then leave
        sid = await pg.evaluate("(JSON.parse(localStorage.getItem('minds.ahome'))||{sessions:[]}).sessions.find(s=>s.date===JSON.parse(localStorage.getItem('minds.ahome')).today).sessionId")
        await pg.goto(f'{BASE}/#/pair/{sid}'); await pg.wait_for_timeout(1800)
        v = await pg.locator('.pb-vol .pb-card').first.bounding_box(); t = await pg.locator('.pb-tr .pb-card').nth(2).bounding_box()
        x0, y0 = v['x']+v['width']/2, v['y']+20; x1, y1 = t['x']+t['width']/2, t['y']+20
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x0,'y':y0}]})
        for i in range(1, 13):
            await cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x0+(x1-x0)*i/12,'y':y0+(y1-y0)*i/12}]}); await pg.wait_for_timeout(20)
        await cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); await pg.wait_for_timeout(1500)
        print('drag paired:', await pg.evaluate("document.getElementById('toast').innerText"))
        await pg.evaluate("window.scrollTo(0,0)"); await swipe(pg, cdp, x=200, y=800, dy=-300)
        print('pairing page scrolls after the drag:', await pg.evaluate('scrollY'))
        await after(pg, cdp, 'after pairing board')
        await b.close()


asyncio.run(every_page())
asyncio.run(leftovers())
