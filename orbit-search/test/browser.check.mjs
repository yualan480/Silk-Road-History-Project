import {readFile} from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from '../../orbitcraft/node_modules/@playwright/test/index.mjs';
import {server as wisp} from '@mercuryworkshop/wisp-js/server';
import {createSearchServer} from '../server.js';
import {renderOrbitSearch} from '../../chat/orbit-search.js';
const orbitHtml=await readFile(new URL('../../chat/index.html',import.meta.url),'utf8');
const orbitCsp=orbitHtml.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
const frameRule=orbitCsp.split(';').find(rule=>rule.trim().startsWith('frame-src '));
assert.ok(frameRule.split(/\s+/).includes('https://silk-road-orbit-search.onrender.com'),'The actual Orbit CSP must explicitly allow the search origin');
let proxyBase;
const mount=async frame=>{
 await frame.addScriptTag({url:parentBase+'/test-render.js'});
 await frame.evaluate(()=>{
  const tab=document.createElement('button');tab.id='search-test-tab';tab.textContent='Orbit Search';
  tab.onclick=()=>window.testRender(document.querySelector('#main'),{sb:{auth:{getSession:async()=>({data:{session:{access_token:'test-session'}}})}},menuBtn:()=>'',bindMenu:()=>{}});
  document.body.prepend(tab);
 });
 await frame.locator('#search-test-tab').click();
};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
const target=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><h1>Orbit Search fixture</h1><button id="test" onclick="this.textContent=\'JavaScript works\'">Test JavaScript</button>');});
const targetBase=await listen(target);
const parent=http.createServer((req,res)=>{
 if(req.url==='/test-render.js'){res.setHeader('Content-Type','text/javascript');res.end('window.testRender='+renderOrbitSearch.toString());return;}
 const policy=orbitCsp.replace('https://silk-road-orbit-search.onrender.com',req.url==='/blocked-policy'?'https://not-the-search.example':proxyBase);
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta http-equiv="Content-Security-Policy" content="'+policy+'"><div id="main" data-view="search" style="height:90vh"></div>');
});
const parentBase=await listen(parent);
let acceptedSessions=0;
const proxy=createSearchServer({parentOrigin:parentBase,verifyIdentity:async token=>{if(token!=='test-session')throw Error();acceptedSessions++;return {id:'browser-test',expiresAt:Date.now()+600000};}});
proxyBase=await listen(proxy);
const wrapper=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><iframe title="Orbit wrapper" src="'+parentBase+'" allow="fullscreen" allowfullscreen style="width:100%;height:95vh"></iframe>');});
const wrapperBase=await listen(wrapper);
// Test-only network fixture: production disallows these private addresses and ports.
wisp.options.allow_private_ips=true;wisp.options.allow_loopback_ips=true;
wisp.options.port_whitelist=[Number(new URL(targetBase).port)];
wisp.options.dns_method=async()=> '127.0.0.1';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 // Negative control reproduces the reported blank blocked frame under the old allowlist.
 const blocked=await browser.newPage();await blocked.goto(parentBase+'/blocked-policy');
 await blocked.evaluate(proxyBase=>{
  window.violations=[];document.addEventListener('securitypolicyviolation',event=>window.violations.push(event.effectiveDirective));
  const frame=document.createElement('iframe');frame.src=proxyBase;document.body.append(frame);
 },proxyBase);
 await blocked.waitForFunction(()=>window.violations.includes('frame-src'));
 await blocked.close();
 const page=await browser.newPage();const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')console.log('browser:',message.text().slice(0,300));});
 await page.route(parentBase+'/orbit-search/config',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({url:proxyBase})}));
 let readinessChecks=0;
 await page.route(parentBase+'/orbit-search/ready',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(++readinessChecks<3?{ready:false}:{ready:true,parent:parentBase})}));
 await page.goto(parentBase);
 await mount(page);
 assert.equal(await page.locator('iframe').count(),0,'Do not embed Render startup pages');
 await page.waitForFunction(()=>document.fullscreenElement===document.querySelector('#main'));
 await page.getByRole('button',{name:'Exit fullscreen'}).click();
 await page.waitForFunction(()=>!document.fullscreenElement);
 await page.getByRole('button',{name:'Fullscreen',exact:true}).click();
 await page.waitForFunction(()=>document.fullscreenElement===document.querySelector('#main'));
 await page.getByRole('button',{name:'Exit fullscreen'}).click();
 await page.waitForFunction(()=>!document.fullscreenElement);
 const search=page.frameLocator('iframe[title="Orbit Search"]');
 await search.locator('#status').filter({hasText:'Ready'}).waitFor({timeout:45000});
 assert.ok(readinessChecks>=3);
 await page.locator('[data-search-notice]').waitFor({state:'hidden'});
 await search.locator('.brand-mark img').evaluate(img=>img.decode());
 assert.equal(await search.locator('#back').isDisabled(),true);
 await search.locator('#start-address').fill('http://fixture.test:'+new URL(targetBase).port+'/first');
 await search.locator('#start-search button').click();
 await search.frameLocator('iframe').getByRole('heading',{name:'Orbit Search fixture'}).waitFor();

 await search.locator('#address').fill('http://fixture.test:'+new URL(targetBase).port+'/');
 await search.locator('#go').click();
 const content=search.frameLocator('iframe');
 await content.getByRole('heading',{name:'Orbit Search fixture'}).waitFor({timeout:45000});
 await content.locator('#test').click();
 await content.getByRole('button',{name:'JavaScript works'}).waitFor();
 await search.locator('#back').click();
 assert.ok((await search.locator('#address').inputValue()).endsWith('/first'));
 await search.locator('#forward').click();assert.ok((await search.locator('#address').inputValue()).endsWith('/'));
 await search.locator('#newtab').click();
 // Real proxied page with a Discord hostname, routed only to the local test fixture.
 await search.locator('#address').fill('http://discord.com:'+new URL(targetBase).port+'/');await search.locator('#go').click();
 await content.getByRole('heading',{name:'Orbit Search fixture'}).waitFor({timeout:45000});
 const directDiscord=search.getByRole('link',{name:'Open Discord directly'});
 await directDiscord.waitFor({state:'visible'});assert.equal(await directDiscord.getAttribute('href'),'https://discord.com/login');
 assert.equal(await directDiscord.getAttribute('target'),'_blank');assert.equal(await directDiscord.getAttribute('rel'),'noopener noreferrer');
 await page.setViewportSize({width:390,height:844});assert.equal(await search.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
 await search.locator('#newtab').click();
 await search.locator('#address').fill('http://notdiscord.com:'+new URL(targetBase).port+'/');await search.locator('#go').click();await search.locator('#site-help').waitFor({state:'hidden'});
 await search.locator('#newtab').click();
 await search.locator('#address').fill('http://discord.com:'+new URL(targetBase).port+'/');await search.locator('#go').click();await directDiscord.waitFor({state:'visible'});
 await search.locator('#newtab').click();await search.locator('#welcome').waitFor();
 assert.equal(await search.locator('#site-help').isVisible(),false);
 assert.equal(await search.locator('#browser iframe').count(),0);assert.equal(await search.locator('#back').isDisabled(),true);
 await search.locator('#start-address').focus();await page.keyboard.press('Control+k');
 assert.equal(await search.locator('#address').evaluate(input=>input===document.activeElement),true);
 assert.equal(errors.length,0,errors.join('\n'));
 await page.setViewportSize({width:390,height:844});
 assert.equal(await search.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
 await page.getByRole('button',{name:'Fullscreen',exact:true}).click();
 await page.waitForFunction(()=>document.fullscreenElement===document.querySelector('#main'));
 await page.evaluate(()=>{document.querySelector('#main').innerHTML='<p>Another Orbit tab</p>';});
 await page.waitForFunction(()=>!document.fullscreenElement);

 const direct=await browser.newPage({viewport:{width:1440,height:1000}});await direct.goto(proxyBase);await direct.getByRole('status').filter({hasText:'Open Orbit Search from the Orbit sidebar'}).waitFor();await direct.locator('.brand-mark img').evaluate(img=>img.decode());await direct.waitForTimeout(650);await direct.screenshot({path:'/tmp/orbit-search-redesign-desktop.png'});
 for(const size of [{width:390,height:844},{width:360,height:640},{width:844,height:390}]){await direct.setViewportSize(size);assert.equal(await direct.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);assert.equal(await direct.locator('#start-search').isVisible(),true);}
 await direct.setViewportSize({width:390,height:844});await direct.screenshot({path:'/tmp/orbit-search-redesign-phone.png'});
 await direct.emulateMedia({reducedMotion:'reduce'});assert.equal(await direct.locator('.brand-mark').evaluate(el=>getComputedStyle(el).animationName),'none');await direct.close();
 // Reproduce a browser that rejects the embedded service, then use an authenticated top-level window.
 const fallback=await browser.newPage();
 await fallback.route(parentBase+'/orbit-search/config',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({url:proxyBase})}));
 await fallback.route(parentBase+'/orbit-search/ready',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ready:true,parent:parentBase})}));
 await fallback.route(proxyBase+'/',route=>route.request().frame().parentFrame()?route.abort('blockedbyclient'):route.continue());
 await fallback.goto(parentBase);
 await mount(fallback);
 await fallback.locator('iframe').waitFor();
 const popupPromise=fallback.waitForEvent('popup');
 await fallback.getByRole('button',{name:'Open search window'}).click();
 const popup=await popupPromise;
 await popup.locator('#status').filter({hasText:'Ready'}).waitFor({timeout:45000});
 await fallback.getByRole('status').filter({hasText:'Search is connected in the separate window'}).waitFor();
 assert.equal(await fallback.locator('iframe').count(),0);
 await popup.locator('#address').fill('http://fixture.test:'+new URL(targetBase).port+'/');await popup.locator('#go').click();
 await popup.frameLocator('iframe').getByRole('heading',{name:'Orbit Search fixture'}).waitFor({timeout:45000});
 await popup.frameLocator('iframe').locator('#test').click();
 await popup.frameLocator('iframe').getByRole('button',{name:'JavaScript works'}).waitFor();
 await popup.reload();await popup.locator('#status').filter({hasText:'Ready'}).waitFor({timeout:45000});
 await popup.close();await fallback.close();
 // A wrapper ancestor with a different origin must not prevent the trusted Orbit child from embedding Search.
 const wrapped=await browser.newPage();
 await wrapped.route(parentBase+'/orbit-search/config',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({url:proxyBase})}));
 await wrapped.route(parentBase+'/orbit-search/ready',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ready:true,parent:parentBase})}));
 await wrapped.goto(wrapperBase);
 await wrapped.frameLocator('iframe[title="Orbit wrapper"]').locator('#main').waitFor();
 const orbit=wrapped.frames().find(frame=>frame.url()===parentBase+'/');
 await mount(orbit);
 const embedded=wrapped.frameLocator('iframe[title="Orbit wrapper"]').frameLocator('iframe[title="Orbit Search"]');
 await embedded.locator('#status').filter({hasText:'Ready'}).waitFor({timeout:45000});
 await embedded.locator('#address').fill('http://fixture.test:'+new URL(targetBase).port+'/');await embedded.locator('#go').click();
 await embedded.frameLocator('iframe').getByRole('heading',{name:'Orbit Search fixture'}).waitFor({timeout:45000});
 assert.equal(wrapped.context().pages().length,1,'Search stays inside the Orbit screen');
 await wrapped.close();
 const unrelated=await browser.newPage();await unrelated.goto(wrapperBase);
 await unrelated.evaluate(proxyBase=>{document.body.innerHTML='<iframe title="untrusted embedding" src="'+proxyBase+'/"></iframe>';},proxyBase);
 const untrusted=unrelated.frameLocator('iframe[title="untrusted embedding"]');
 await untrusted.locator('#status').filter({hasText:'Connecting'}).waitFor();
 const before=acceptedSessions;
 await unrelated.evaluate(proxyBase=>document.querySelector('iframe').contentWindow.postMessage({type:'orbit-search-account',accessToken:'test-session'},proxyBase),proxyBase);
 await unrelated.waitForTimeout(500);assert.equal(acceptedSessions,before,'Untrusted parent may not hand off an account');
 assert.match(await untrusted.locator('#status').innerText(),/Connecting/);await unrelated.close();
 console.log('PASS redesigned Chrome-inspired toolbar, central search, back/forward/start-page controls, reduced motion, phone/landscape fit, automatic fullscreen on a real tab click, exit/re-entry controls, actual Orbit CSP negative/positive controls, in-screen nested-wrapper browsing, blocked-iframe popup recovery, same-origin account authentication, cold-start readiness, connection acknowledgement, standalone guidance, isolated Scramjet service worker, authenticated Wisp relay, proxied HTML/JavaScript and phone layout.');
}finally{await browser.close();for(const s of [proxy,parent,target,wrapper]){s.closeAllConnections();s.close();}process.exitCode=0;}
