import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {createSearchServer} from '../server.js';
import {server as wisp} from '@mercuryworkshop/wisp-js/server';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+s.address().port)));
let hits=0,identities=0;
const target=createServer((req,res)=>{hits++;res.setHeader('Content-Type','text/html');res.end('<h1>Fixed website through proxy</h1><button onclick="this.textContent=\'Interactive\'">Test page</button>');});
const targetBase=await listen(target),destination='http://fixture.test:'+new URL(targetBase).port+'/';
const server=createSearchServer({targetUrl:destination,verifyIdentity:async()=>{identities++;throw Error('Account connection must not be used');}});const base=await listen(server);
// Only this local test overrides production destination protections.
wisp.options.allow_private_ips=true;wisp.options.allow_loopback_ips=true;wisp.options.port_whitelist=[Number(new URL(targetBase).port)];wisp.options.dns_method=async()=> '127.0.0.1';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage(),direct=[],accounts=[],errors=[];
 page.on('request',r=>{if(new URL(r.url()).hostname==='fixture.test')direct.push(r.url());if(r.url().endsWith('/api/session'))accounts.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);const frame=page.frameLocator('#site iframe');await frame.getByRole('heading',{name:'Fixed website through proxy'}).waitFor({timeout:45000});
 await frame.getByRole('button',{name:'Test page'}).click();await frame.getByRole('button',{name:'Interactive'}).waitFor();
 assert.ok(new URL(await page.locator('#site iframe').getAttribute('src'),base).href.startsWith(base+'/service/'));assert.equal(await page.locator('input').count(),0);
 const id=await page.evaluate(()=>sessionStorage.getItem('orbit-search-guest'));
 await page.reload();await frame.getByRole('heading',{name:'Fixed website through proxy'}).waitFor({timeout:45000});assert.equal(await page.evaluate(()=>sessionStorage.getItem('orbit-search-guest')),id);
 assert.deepEqual(direct,[]);assert.deepEqual(accounts,[]);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(await page.locator('header,nav,button,a').count(),0);const box=await page.locator('#site iframe').boundingBox();assert.ok(box.width===width&&box.height>=800,'Orbit fills the viewport without a toolbar');
 await context.close();
}assert.equal(identities,0);assert.ok(hits>=4);console.log('PASS real Scramjet/Wisp: fixed website proxied and interactive, reload and toolbar-free layout work, no direct destination requests, no Orbit account, desktop/phone layout.');}finally{await browser.close();for(const s of [server,target]){s.closeAllConnections();s.close();}}
