import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=createServer(async(req,res)=>{
 if(req.url==='/module.js'){res.setHeader('Content-Type','text/javascript');return res.end(await readFile(new URL('../../chat/signup-window.js',import.meta.url)));}
 if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(await readFile(new URL('../../chat/style.css',import.meta.url)));}
 res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><main style="padding:16px;max-width:800px;margin:auto" id="panel"></main><script type="module">
 import {signupWindowPanel} from '/module.js';let until=0;window.calls=[];window.notices=[];
 const sb={async rpc(name,args){window.calls.push({name,args});if(location.search==='?missing')return {error:{code:'PGRST202',message:'Could not find the function'}};if(name==='admin_set_signup_window'){await new Promise(r=>setTimeout(r,100));until=args.p_open?Date.now()+120000:Date.now();}return {data:{open:until>Date.now(),open_until:until>Date.now()?new Date(until).toISOString():null,server_now:new Date().toISOString()}};}};
 const panel=await signupWindowPanel({sb,toast:text=>window.notices.push(text)});const el=document.querySelector('#panel');el.innerHTML=panel.html;panel.bind(el);</script>`);
}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install();await page.goto(base);
 const button=page.locator('[data-window-toggle]'),status=page.locator('[data-window-status]');
 await button.waitFor();assert.match(await status.innerText(),/Approval required/);
 await button.click();assert.equal(await button.isDisabled(),true);await page.clock.runFor(110);
 assert.match(await status.innerText(),/2:00 remaining/);assert.equal(await button.innerText(),'Require approval now');
 await page.clock.runFor(60000);assert.match(await status.innerText(),/1:0[01] remaining/);
 await page.clock.runFor(61001);assert.match(await status.innerText(),/Approval required/);
 assert.equal(await button.innerText(),'Open sign-ups for 2 minutes');
 await button.click();await page.clock.runFor(110);await button.click();await page.clock.runFor(110);
 assert.match(await status.innerText(),/Approval required/);
 assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.name==='admin_set_signup_window').map(c=>c.args)),[{p_open:true},{p_open:true},{p_open:false}]);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/tmp/signup-window-'+width+'.png'});
 await page.locator('#panel').evaluate(el=>el.remove());const count=await page.evaluate(()=>window.calls.length);
 await page.clock.runFor(30000);assert.equal(await page.evaluate(()=>window.calls.length),count);
 assert.deepEqual(errors,[]);await page.close();
 }
 const missing=await browser.newPage();await missing.goto(base+'/?missing');await missing.locator('[data-window-error]').waitFor();
 assert.equal(await missing.locator('[data-window-toggle]').isDisabled(),true);
 assert.match(await missing.locator('[data-window-error]').innerText(),/migration-signup-approval-window.sql/);
 console.log('PASS signup window UI: start, countdown, expiry, early close, no duplicate submissions, mobile sizing, cleanup and missing-migration setup instructions.');
}finally{await browser.close();server.close();}
