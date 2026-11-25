"""Screenshots for the handbook: phone-width captures of the local demo (fictional data).

Start the demo first (PORT=5326 npm run dev), then: python3 docs/handbook/shots.py /tmp/hbshots
"""
import asyncio, json
from playwright.async_api import async_playwright
import os, sys
B=os.environ.get('BASE','http://localhost:5326'); O=sys.argv[1].rstrip('/')+'/'
ACC={'v':('volunteer@example.com','VolunteerDemo123'),'r':('regular@example.com','RegularDemo123'),'a':('admin@example.com','AdminDemo123'),None:None}
PLAN=[
 ('register',None,[('click','text=Register now')]),
 ('guide','v',[('go','guide')]),
 ('sessions','v',[('go','sessions'),('js',"[...document.querySelectorAll('main input[type=checkbox]')].filter(x=>!x.checked).slice(0,2).forEach(x=>x.click())")]),
 ('home','v',[('go','home')]),
 ('trainee','v',[('go','info/T-0003')]),
 ('pass','v',[('go','pass')]),
 ('feedback','v',[('go','home'),('click','text=Give feedback')]),
 ('past','v',[('go','sessions/past'),('click','main details summary')]),
 ('me','v',[('go','me')]),
 ('regdir','r',[('go','directory')]),
 ('admin','a',[('go','admin')]),
 ('allpages','a',[('go','admin'),('click','text=All pages >> visible=true')]),
 ('newsession','a',[('go','new-session')]),
 ('allsessions','a',[('go','today')]),
 ('pairings','a',[('go','pairings')]),
 ('board','a',[('go','pairings'),('click','main >> text=/Today, /')]),
 ('scan','a',[('go','scan')]),
 ('clock','a',[('go','clock')]),
 ('people','a',[('go','volunteers')]),
 ('review','a',[('go','review')]),
 ('visibility','a',[('go','visibility')]),
 ('atrainee','a',[('go','trainee/T-0001')]),
 ('attendance','a',[('go','attendance')]),
 ('guideedit','a',[('go','guide-edit')]),
 ('sheets','a',[('go','sheets')]),
 ('advanced','a',[('go','advanced')]),
 ('adminpw','a',[('go','admin-password')]),
 ('pastall','a',[('go','today'),('js',"document.querySelector('main details details summary, main details.card summary')&&0"),('click','main details.card summary'),('js',"(()=>{const d=document.querySelector('main details.card');d.scrollIntoView({block:'start'});window.scrollBy(0,-120)})()")]),
]
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for name,who,steps in PLAN:
      c=await b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)
      pg=await c.new_page()
      await pg.goto(B+'/#/login'); await pg.wait_for_timeout(700)
      if ACC[who]:
        e,pw=ACC[who]; await pg.fill('[name=email]',e); await pg.fill('[name=password]',pw); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1500)
      try:
        for k,v in steps:
          if k=='go': await pg.goto(B+'/#/'+v); await pg.wait_for_timeout(1500)
          elif k=='click': await pg.locator(v).first.click(); await pg.wait_for_timeout(1300)
          elif k=='js': await pg.evaluate(v); await pg.wait_for_timeout(600)
        await pg.screenshot(path=O+name+'.png')
        from PIL import Image  # crop the demo banner, keep the top of the page, save as JPEG
        im=Image.open(O+name+'.png').convert('RGB'); im=im.crop((0,40,im.width,min(im.height,1440)))
        im.resize((585,int(im.height*585/im.width)),Image.LANCZOS).save(O+name+'.jpg',quality=82); os.remove(O+name+'.png')
        print('ok',name)
      except Exception as ex: print('FAIL',name,str(ex).split('\n')[0][:150])
      await c.close()
    await b.close()
asyncio.run(main())
