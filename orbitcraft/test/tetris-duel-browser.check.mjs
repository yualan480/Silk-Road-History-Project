import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://test').pathname;if(path==='/fixture'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><iframe src="/games/tetris-duel.html?embed=1" style="width:100%;height:95vh;border:0"></iframe>');return;}try{res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.png')?'image/png':'text/html');res.end(await readFile(root+path));}catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const channels=new Map();let ref=0;
function installRelay(context){return context.routeWebSocket('**/realtime/v1/websocket**',socket=>{
 const joined=new Set();const reply=(topic,event,payload,ref)=>socket.send(JSON.stringify({topic,event,payload,ref}));
 function presence(topic){const peers=channels.get(topic)||new Map();const state={};for(const meta of peers.values())if(meta)state[meta.id]={metas:[meta]};for(const peer of peers.keys())peer.send(JSON.stringify({topic,event:'presence_state',payload:state}));}
 socket.onMessage(raw=>{const m=JSON.parse(raw);if(m.event==='phx_join'){assert.equal(m.payload.config.presence.enabled,true);if(!channels.has(m.topic))channels.set(m.topic,new Map());channels.get(m.topic).set(socket,null);joined.add(m.topic);reply(m.topic,'phx_reply',{status:'ok',response:{}},m.ref);presence(m.topic);}
 else if(m.event==='presence'){channels.get(m.topic).set(socket,{...m.payload.payload,phx_ref:'test-'+(++ref)});presence(m.topic);}
 else if(m.event==='broadcast'){for(const peer of channels.get(m.topic)?.keys()||[])if(peer!==socket)peer.send(JSON.stringify({topic:m.topic,event:'broadcast',payload:m.payload}));}
 else if(m.event==='phx_leave'){channels.get(m.topic)?.delete(socket);presence(m.topic);}
 });socket.onClose(()=>{for(const topic of joined){channels.get(topic)?.delete(socket);presence(topic);}});
 });}
try{
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
 for(let i=0;i<contexts.length;i++){await contexts[i].addInitScript(name=>{localStorage.setItem('stg_ok','1');localStorage.setItem('lb-halved-v1','1');localStorage.setItem('player-name',name);},i?'Guest':'Host');await contexts[i].route('**/rest/v1/**',route=>route.fulfill({contentType:'application/json',body:'[]'}));if(process.env.TETRIS_DUEL_LIVE!=='1')await installRelay(contexts[i]);}
 const [hostPage,guestPage]=await Promise.all(contexts.map(c=>c.newPage()));const errors=[];for(const page of [hostPage,guestPage])page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});
 await Promise.all([hostPage.goto(base+'/fixture'),guestPage.goto(base+'/fixture')]);
 const host=hostPage.frames()[1],guest=guestPage.frames()[1];
 await host.locator('#bCreate').click();await host.locator('#lCode').waitFor();const code=await host.locator('#lCode').textContent();assert.match(code,/^[A-Z2-9]{4}$/);
 await guest.locator('#bJoinMenu').click();await guest.locator('#codeIn').fill(code);await guest.locator('#bJoin').click();await guest.locator('#pLobby').waitFor({timeout:15000}).catch(async error=>{console.log('GUEST',await guest.locator('body').innerText());console.log('HOST',await host.locator('body').innerText());throw error;});await host.waitForFunction(()=>!document.querySelector('#bStart').disabled);await host.locator('#bStart').click();
 for(const page of [host,guest])await page.waitForFunction(()=>document.querySelector('#count').hidden&&document.querySelector('#tmr').textContent.startsWith('1:'));
 await host.locator('#cvMe').click();await hostPage.keyboard.press('Space');await host.waitForFunction(()=>Number(document.querySelector('#meSc').textContent)>0);
 const score=await host.locator('#meSc').textContent();await guest.waitForFunction(expected=>document.querySelector('#opSc').textContent===expected,score);assert.equal(await guest.locator('#meSc').textContent(),'0','Host inputs never control the guest board');
 await guest.locator('#cvMe').click();await guestPage.keyboard.press('Space');await guest.waitForFunction(()=>Number(document.querySelector('#meSc').textContent)>0);
 // An abandoned board tops out rapidly; both peers reach results and can rematch.
 for(let i=0;i<30;i++){if(await host.locator('#pOver').isVisible())break;await hostPage.keyboard.press('Space');await host.waitForTimeout(30);}
 await host.locator('#pOver').waitFor();await guest.locator('#pOver').waitFor();assert.equal(await guest.locator('#oTitle').textContent(),'You win!');
 await host.locator('#bAgain').click();await guest.locator('#count').waitFor();await host.locator('#menuBtn').click();await guest.locator('#pOver').waitFor();
 await guest.locator('#bMenu').click();await guestPage.setViewportSize({width:390,height:844});await guest.locator('#bSolo').click();await guest.waitForFunction(()=>document.querySelector('#count').hidden&&document.querySelector('#tmr').textContent.startsWith('1:'));await guest.locator('[data-control=drop]').click();await guest.waitForFunction(()=>Number(document.querySelector('#meSc').textContent)>0);
 assert.ok(await guest.locator('body').evaluate(el=>el.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 await guestPage.screenshot({path:'/tmp/tetris-duel-mobile.png'});
 await guest.locator('#menuBtn').click();await host.locator('#bQuick').click();await host.locator('#pLobby').waitFor();await guest.locator('#bQuick').click();for(const page of [host,guest])await page.waitForFunction(()=>document.querySelector('#count').hidden&&document.querySelector('#tmr').textContent.startsWith('1:'));

 const gallery=await hostPage.request.get(base+'/games/index.html');assert.ok((await gallery.text()).includes('id="appTetrisDuel"'));
 console.log('PASS Tetris Duel: room create/join, host start, fast gravity, isolated player controls, synchronized scores, top-out winner, rematch/disconnect, CPU and phone controls. Relay: '+(process.env.TETRIS_DUEL_LIVE==='1'?'live Supabase':'deterministic Phoenix test transport')+'.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
