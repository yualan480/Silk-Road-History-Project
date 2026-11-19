import {readFile} from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import {WebSocketServer} from '../../orbitcraft/node_modules/ws/wrapper.mjs';
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
let workerFetches=0,workerSockets=0;
const target=http.createServer((req,res)=>{
 if(req.url==='/background'){setTimeout(()=>{res.setHeader('Content-Type','text/html');res.end('<h1>Background ready</h1>');},1200);return;}
 if(req.url==='/worker-data'){workerFetches++;res.end('Relay fetch');return;}
 if(['/worker.js','/shared.js'].includes(req.url)){
  res.setHeader('Content-Type','application/javascript');
  const run=`async function run(send){try{const text=await fetch('/worker-data').then(r=>r.text());const socket=new WebSocket('ws://fixture.test:${target.address().port}/echo');socket.onopen=()=>socket.send('Relay socket');socket.onmessage=e=>{send(text+' '+e.data);socket.close();};socket.onerror=()=>send('socket failed');}catch(e){send('error '+e.message);}}`;
  res.end(run+(req.url==='/worker.js'?"run(text=>postMessage(text));":"onconnect=e=>{const port=e.ports[0];port.start();run(text=>port.postMessage(text));};"));return;
 }
 res.setHeader('Content-Type','text/html');res.end(`<!doctype html><h1>Orbit Search fixture</h1><button id="test" onclick="this.textContent='JavaScript works'">Test JavaScript</button><button id="worker-test" onclick="const worker=new Worker('/worker.js');worker.onmessage=e=>document.querySelector('#worker-result').textContent=e.data;">Test worker</button><output id="worker-result"></output><button id="shared-test" onclick="const worker=new SharedWorker('/shared.js','orbit-fixture');worker.onerror=e=>document.querySelector('#shared-result').textContent='Shared error: '+e.message;worker.port.onmessage=e=>document.querySelector('#shared-result').textContent=e.data;worker.port.start();">Test shared worker</button><output id="shared-result"></output>`);
});
const echo=new WebSocketServer({noServer:true});target.on('upgrade',(req,socket,head)=>echo.handleUpgrade(req,socket,head,ws=>{workerSockets++;ws.on('message',data=>ws.send(data,{binary:false}));}));
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
 const page=await browser.newPage();const errors=[],directRequests=[],nativeSockets=[];
 page.on('request',r=>{if(new URL(r.url()).hostname==='fixture.test')directRequests.push(r.url());});page.on('websocket',ws=>nativeSockets.push(ws.url()));
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
 await search.frameLocator('.browser-tab-panel:not([hidden]) iframe').getByRole('heading',{name:'Orbit Search fixture'}).waitFor();

 await search.locator('#address').fill('http://fixture.test:'+new URL(targetBase).port+'/');
 await search.locator('#go').click();
 const content=search.frameLocator('.browser-tab-panel:not([hidden]) iframe');
 await content.getByRole('heading',{name:'Orbit Search fixture'}).waitFor({timeout:45000});
 await content.locator('#test').click();
 await content.getByRole('button',{name:'JavaScript works'}).waitFor();
 await content.locator('#worker-test').click();await content.locator('#worker-result').filter({hasText:'Relay fetch Relay socket'}).waitFor({timeout:30000});
 const sandbox=(await search.locator('#browser iframe').getAttribute('sandbox')).split(' ');
 for(const token of ['allow-scripts','allow-same-origin','allow-forms','allow-downloads','allow-popups','allow-popups-to-escape-sandbox','allow-modals'])assert.ok(sandbox.includes(token),token);
 await content.locator('body').evaluate(body=>{const button=document.createElement('button');button.id='popup-test';button.textContent='Open fixture popup';button.onclick=()=>window.open('/popup','_blank');body.append(button);});
 const popupReady=page.context().waitForEvent('page');
 const popupNavigation=page.context().waitForEvent('request',{predicate:r=>r.isNavigationRequest()&&r.url().startsWith(proxyBase+'/service/')&&decodeURIComponent(r.url()).endsWith('/popup')});
 await content.locator('#popup-test').click();const fixturePopup=await popupReady;
 const popupRequest=await popupNavigation;assert.ok(popupRequest.url().startsWith(proxyBase+'/service/'));await fixturePopup.close();
 // This verifies permission + rewritten navigation only. Popup content stalled in the v1 probe.

 assert.ok(workerFetches>=1&&workerSockets>=1);assert.deepEqual(directRequests,[]);assert.ok(nativeSockets.every(url=>url.startsWith(proxyBase.replace('http:','ws:')+'/wisp/')));
 // Known unresolved v1 compatibility probe. Opt in to reproduce, not to hide the result.
 if(process.env.ORBIT_SEARCH_SHARED_WORKER_CHECK==='1'){
  await content.locator('#shared-test').click();
  await content.locator('#shared-result').filter({hasText:'Relay fetch Relay socket'}).waitFor({timeout:15000});
  assert.ok(workerFetches>=2&&workerSockets>=2);
 }

 await search.locator('#back').click();
 assert.ok((await search.locator('#address').inputValue()).endsWith('/first'));
 await search.locator('#forward').click();assert.ok((await search.locator('#address').inputValue()).endsWith('/'));
 // A new tab preserves the exact iframe/document; switching and closing never reload survivors.
 const retainedUrl='http://fixture.test:'+new URL(targetBase).port+'/retained';
 const retainedNavigation=page.waitForEvent('framenavigated',{predicate:frame=>frame.url()===proxyBase+'/service/'+encodeURIComponent(retainedUrl)});
 await search.locator('#address').fill(retainedUrl);await search.locator('#go').click();await retainedNavigation;
 await content.locator('#test').click();await content.getByRole('button',{name:'JavaScript works'}).waitFor();
 const originalTab=await search.getByRole('tab',{selected:true}).getAttribute('id');
 const retainedFrame=await search.locator('#browser .browser-tab-panel:not([hidden]) iframe').elementHandle();
 await search.locator('#newtab').click();assert.equal(await search.getByRole('tab').count(),2);
 const blankTab=await search.getByRole('tab',{selected:true}).getAttribute('id');
 assert.ok(await retainedFrame.evaluate(frame=>frame.isConnected));await search.locator('#welcome').waitFor();
 await search.locator('#'+originalTab).click();assert.equal(await search.locator('#address').inputValue(),retainedUrl);
 await content.getByRole('button',{name:'JavaScript works'}).waitFor();
 assert.ok(await search.locator('#browser .browser-tab-panel:not([hidden]) iframe').evaluate((frame,original)=>frame===original,retainedFrame));
 await search.locator('#'+blankTab).click();await search.getByRole('button',{name:'Close New search tab',exact:true}).click();
 assert.equal(await search.getByRole('tab').count(),1);assert.equal(await search.locator('#address').inputValue(),retainedUrl);
 await content.getByRole('button',{name:'JavaScript works'}).waitFor();await search.locator('#newtab').click();
 const backgroundTab=await search.getByRole('tab',{selected:true}).getAttribute('id');
 await search.locator('#address').fill('http://fixture.test:'+new URL(targetBase).port+'/background');await search.locator('#go').click();
 await search.locator('#newtab').click();assert.equal(await search.locator('#address').inputValue(),'');
 await search.frameLocator('#'+backgroundTab+'-panel iframe').getByRole('heading',{name:'Background ready',includeHidden:true}).waitFor({state:'attached'});
 assert.equal(await search.locator('#address').inputValue(),'');assert.equal(await search.locator('#welcome').isVisible(),true);
 await search.locator('#'+backgroundTab).locator('..').locator('.tab-close').click();
 assert.equal(await search.getByRole('tab').count(),2);
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
 assert.equal(await search.locator('#browser .browser-tab-panel:not([hidden]) iframe').count(),0);assert.equal(await search.locator('#back').isDisabled(),true);
 await search.locator('#start-address').focus();await page.keyboard.press('Control+k');
 assert.equal(await search.locator('#address').evaluate(input=>input===document.activeElement),true);
 assert.equal(errors.length,0,errors.join('\n'));await search.locator('body').screenshot({path:'/tmp/orbit-search-real-tabs-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await search.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);await search.locator('body').screenshot({path:'/tmp/orbit-search-real-tabs-phone.png'});
 await page.getByRole('button',{name:'Fullscreen',exact:true}).click();
 await page.waitForFunction(()=>document.fullscreenElement===document.querySelector('#main'));
 await page.evaluate(()=>{document.querySelector('#main').innerHTML='<p>Another Orbit tab</p>';});
 await page.waitForFunction(()=>!document.fullscreenElement);

 const direct=await browser.newPage({viewport:{width:1440,height:1000}});await direct.goto(proxyBase);await direct.getByRole('status').filter({hasText:'Open Orbit Search from the Orbit sidebar'}).waitFor();const invalidProbe=await direct.evaluate(async()=>{try{await(await import('/relay-probe.js')).verifyRelay('expired');return 'unexpected success';}catch(error){return error.message;}});assert.match(invalidProbe,/expired|restarted/);
 const failedProbe=await direct.evaluate(async()=>{
  const session=await(await fetch('/api/session',{method:'POST',headers:{Authorization:'Bearer test-session'}})).json();
  const NativeWebSocket=window.WebSocket;
  window.WebSocket=class{constructor(){queueMicrotask(()=>this.onclose?.({code:1008}));}close(){}};
  try{await(await import('/relay-probe.js')).verifyRelay(session.token);return 'unexpected success';}catch(error){return error.message;}finally{window.WebSocket=NativeWebSocket;}
 });assert.match(failedProbe,/closed before its handshake/);

 assert.equal(await direct.locator('.load-track').count(),0);
 await direct.locator('body').evaluate(el=>el.classList.add('loading'));
 assert.equal(await direct.locator('.tab-logo').evaluate(el=>getComputedStyle(el).animationName),'tab-orbit-spin');
 await direct.locator('body').evaluate(el=>el.classList.remove('loading'));
 assert.equal(await direct.locator('.tab-logo').evaluate(el=>getComputedStyle(el).animationName),'none');
 await direct.locator('.brand-mark img').evaluate(img=>img.decode());await direct.waitForTimeout(650);await direct.screenshot({path:'/tmp/orbit-search-redesign-desktop.png'});
 for(const size of [{width:390,height:844},{width:360,height:640},{width:844,height:390}]){await direct.setViewportSize(size);assert.equal(await direct.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);assert.equal(await direct.locator('#start-search').isVisible(),true);}
 await direct.setViewportSize({width:390,height:844});await direct.screenshot({path:'/tmp/orbit-search-redesign-phone.png'});
 await direct.locator('#newtab').click();assert.equal(await direct.getByRole('tab').count(),2);
 await direct.getByRole('tab',{selected:true}).focus();await direct.keyboard.press('ArrowLeft');await direct.keyboard.press('Delete');assert.equal(await direct.getByRole('tab').count(),1);
 await direct.getByRole('tab',{selected:true}).press('Delete');assert.equal(await direct.getByRole('tab').count(),1);
 await direct.emulateMedia({reducedMotion:'reduce'});await direct.locator('body').evaluate(el=>el.classList.add('loading'));assert.equal(await direct.locator('.tab-logo').evaluate(el=>getComputedStyle(el).animationName),'none');assert.equal(await direct.locator('.brand-mark').evaluate(el=>getComputedStyle(el).animationName),'none');await direct.close();
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
 await popup.frameLocator('.browser-tab-panel:not([hidden]) iframe').getByRole('heading',{name:'Orbit Search fixture'}).waitFor({timeout:45000});
 await popup.frameLocator('.browser-tab-panel:not([hidden]) iframe').locator('#test').click();
 await popup.frameLocator('.browser-tab-panel:not([hidden]) iframe').getByRole('button',{name:'JavaScript works'}).waitFor();
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
 await embedded.frameLocator('.browser-tab-panel:not([hidden]) iframe').getByRole('heading',{name:'Orbit Search fixture'}).waitFor({timeout:45000});
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
 console.log('PASS real tab creation, iframe/document retention, independent tab navigation, background-load isolation, closing, keyboard controls, mobile scrolling and per-tab loading; popup permission + proxy-prefixed navigation attempt (popup content unverified); dedicated-worker fetch + WebSocket relay (shared-worker probe opt-in; not verified), no direct fixture requests, no COOP/COEP required; redesigned Chrome-inspired toolbar, central search, back/forward/start-page controls, reduced motion, phone/landscape fit, automatic fullscreen on a real tab click, exit/re-entry controls, actual Orbit CSP negative/positive controls, in-screen nested-wrapper browsing, blocked-iframe popup recovery, same-origin account authentication, cold-start readiness, connection acknowledgement, standalone guidance, isolated Scramjet service worker, authenticated Wisp relay, proxied HTML/JavaScript and phone layout.');
}finally{await browser.close();for(const s of [proxy,parent,target,wrapper]){s.closeAllConnections();s.close();}process.exitCode=0;}
