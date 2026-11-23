import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {renderOrbitSearch} from '../../chat/orbit-search.js';
const server=createServer((req,res)=>{
 if(req.url==='/view.js'){res.setHeader('Content-Type','text/javascript');return res.end(`const render=${renderOrbitSearch.toString()};document.querySelector('#launch').onclick=()=>render(document.querySelector('main'));`);}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><button id="launch">Open Orbit Search</button><main style="display:flex;height:100dvh"></main><script src="/view.js"></script>');
}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://orbitsearch.onrender.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Orbit destination</h1>'}));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#launch').click();
 await page.frameLocator('iframe[title="Orbit"]').getByRole('heading',{name:'Orbit destination'}).waitFor();
 await page.waitForFunction(()=>document.fullscreenElement===document.querySelector('main'));
 assert.equal(await page.locator('main header,main nav,main button,main a,main .top').count(),0);
 const box=await page.locator('iframe').boundingBox(),viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));assert.ok(Math.abs(box.width-viewport.width)<1);assert.ok(Math.abs(box.height-viewport.height)<1);
 await page.locator('main').evaluate(el=>el.replaceChildren());await page.waitForFunction(()=>!document.fullscreenElement);assert.deepEqual(errors,[]);await page.close();
}console.log('PASS Orbit tab: no header or toolbar, automatic fullscreen on click, viewport filling and cleanup on desktop/phone.');}finally{await browser.close();server.close();}
