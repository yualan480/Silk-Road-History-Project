import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from '../../orbitcraft/node_modules/@playwright/test/index.mjs';
import {server as wisp} from '@mercuryworkshop/wisp-js/server';
import {createSearchServer} from '../server.js';
import {renderOrbitSearch} from '../../chat/orbit-search.js';
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
const target=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><h1>Orbit Search fixture</h1><button id="test" onclick="this.textContent=\'JavaScript works\'">Test JavaScript</button>');});
const targetBase=await listen(target);
const parent=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><div id="main" style="height:90vh"></div>');});
const parentBase=await listen(parent);
const proxy=createSearchServer({parentOrigin:parentBase,verifyIdentity:async token=>{if(token!=='test-session')throw Error();return {id:'browser-test',expiresAt:Date.now()+600000};}});
const proxyBase=await listen(proxy);
// Test-only network fixture: production disallows these private addresses and ports.
wisp.options.allow_private_ips=true;wisp.options.allow_loopback_ips=true;
wisp.options.port_whitelist=[Number(new URL(targetBase).port)];
wisp.options.dns_method=async()=> '127.0.0.1';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')console.log('browser:',message.text().slice(0,300));});
 await page.route(parentBase+'/orbit-search/config',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({url:proxyBase})}));
 let readinessChecks=0;
 await page.route(parentBase+'/orbit-search/ready',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(++readinessChecks<3?{ready:false}:{ready:true,parent:parentBase})}));
 await page.goto(parentBase);
 await page.evaluate(({render,proxyBase})=>{
   const fn=(0,eval)('('+render+')');
   fn(document.querySelector('#main'),{sb:{auth:{getSession:async()=>({data:{session:{access_token:'test-session'}}})}},menuBtn:()=>'',bindMenu:()=>{}});
 },{render:renderOrbitSearch.toString(),proxyBase});
 assert.equal(await page.locator('iframe').count(),0,'Do not embed Render startup pages');
 const search=page.frameLocator('iframe[title="Orbit Search"]');
 await search.locator('#status').filter({hasText:'Ready'}).waitFor({timeout:45000});
 assert.ok(readinessChecks>=3);
 await page.locator('[data-search-notice]').waitFor({state:'hidden'});
 await search.locator('#address').fill('http://fixture.test:'+new URL(targetBase).port+'/');
 await search.locator('#go').click();
 const content=search.frameLocator('iframe');
 await content.getByRole('heading',{name:'Orbit Search fixture'}).waitFor({timeout:45000});
 await content.locator('#test').click();
 await content.getByRole('button',{name:'JavaScript works'}).waitFor();
 assert.equal(errors.length,0,errors.join('\n'));
 await page.setViewportSize({width:390,height:844});
 assert.equal(await search.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
 const direct=await browser.newPage();await direct.goto(proxyBase);await direct.getByRole('status').filter({hasText:'Open Orbit Search from the Orbit sidebar'}).waitFor();await direct.close();
 console.log('PASS cold-start readiness, connection acknowledgement, standalone guidance, isolated Scramjet service worker, authenticated Wisp relay, proxied HTML/JavaScript and phone layout.');
}finally{await browser.close();for(const s of [proxy,parent,target]){s.closeAllConnections();s.close();}process.exitCode=0;}
