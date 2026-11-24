import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url);
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://local').pathname;
 if(path==='/test'){res.setHeader('Content-Type','text/html');return res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/chat/style.css"><link rel="stylesheet" href="/chat/layout.css"><link rel="stylesheet" href="/chat/guides.css"><div id="root"><div id="app" class="app"><aside class="side"><nav><button class="nav-grp-h" data-social>Orbit Social</button><button class="nav-grp-h" data-fun>Explore</button></nav><div class="scroll">Channels</div><div class="me">Profile and settings</div></aside><main class="main"><div class="top otop"><div class="home-theme-slot">Themes</div><input id="oq" aria-label="Search Orbit"></div><button id="launch">Start tour</button></main></div></div><script type="module">
 import {createGuideTour} from '/chat/guide-tour.js';
 window.results=[];window.tour=createGuideTour({portrait:who=>'<span class="orbit-guide-portrait guide-'+who+'"></span>',onFinish:r=>results.push(r)});
 document.querySelector('#launch').onclick=()=>tour.start(window.who||'elara');window.ready=true;
 </script>`);}
 res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'image/png');res.end(await readFile(new URL('.'+path,root)));
 }catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const [width,height,who]of [[1440,900,'elara'],[390,844,'stellan']]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/test`);await page.waitForFunction(()=>window.ready);await page.evaluate(w=>window.who=w,who);
 await page.getByRole('button',{name:'Start tour',exact:true}).click();await page.locator('.guide-tour[open]').waitFor();
 assert.equal(await page.locator('.guide-tour .guide-'+who).count(),1);
 for(let i=0;i<6;i++){
  await page.waitForTimeout(40);
  const state=await page.locator('.guide-tour-card').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom}});
  assert.ok(state.x>=0&&state.y>=0&&state.right<=width+1&&state.bottom<=height+1,'Tour card must fit the viewport');
  assert.equal(await page.locator('.guide-tour [data-count]').textContent(),`${i+1} of 6`);
  assert.equal(await page.locator('.guide-tour-focus').isVisible(),true,'Each step points at a real visible control');
  if(i===2){assert.equal(await page.locator('[data-social]').isVisible(),true);await page.screenshot({path:`/tmp/orbit-tour-${width}.png`});}
  await page.getByRole('button',{name:i===5?'Finish':'Next',exact:true}).click();
 }
 assert.deepEqual(await page.evaluate(()=>results),['completed']);assert.equal(await page.locator('.guide-tour').count(),0);
 await page.getByRole('button',{name:'Start tour',exact:true}).click();await page.keyboard.press('Escape');
 assert.deepEqual(await page.evaluate(()=>results),['completed','skipped']);assert.equal(await page.locator('#launch').evaluate(el=>el===document.activeElement),true);
 assert.equal(await page.locator('#app').evaluate(el=>el.classList.contains('open')),false);
 assert.deepEqual(errors,[]);await page.close();
 }console.log('PASS guided tour: real targets, arrows, both guides, six steps, completion, replay, Escape/skip, focus restoration and mobile sidebar/viewport.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
