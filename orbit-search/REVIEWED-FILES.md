> Historical monorepo audit snapshot. For current setup, use README.md. The live server now imports `./auth.js` and `./auth-config.js`; the old parent-directory imports shown below are obsolete.

# Complete reviewed proxy files

Snapshot for the November 19 audit. These are full file contents, not snippets. Current changes include raised relay limits, popup/modal sandbox permissions, and Discord-scoped experimental service-worker emulation with fail-closed intercepts. Root `_headers` is unchanged and is not consumed by the Render Node service. Existing CSS, logo, lockfile, installed dependencies, and `orbitcraft/server/auth.js` remain required. Keep files at their listed paths.

**This is not a complete Discord compatibility fix.** Shared-worker validation remains unresolved; third-party service-worker emulation remains experimental and is now enabled only for Discord pages; no successful Discord login/CAPTCHA or universal no-leak result is established. See PROXY-AUDIT.md. Do not import BareMux's SharedWorker entry into the service worker or invent an Epoxy WASM file.

The outer `chat/orbit-search.js` wrapper also needs the popup permissions; its complete contents are included below. Deploy both services. Main `chat/app.js` and `chat/index.html` module cache versions have also been advanced in the repository.

HTTP/2 reset recovery uses the full Epoxy transport plus a lazy HTTP/1.1-only adapter. The added adapter and retry-policy modules are included below; install dependencies from the updated lockfile.

## orbit-search/server.js

```js
import http from 'node:http';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';
import { authenticate } from '../orbitcraft/server/auth.js';
import { createSessions } from './security.js';
const root = dirname(fileURLToPath(import.meta.url));
export function createSearchServer({verifyIdentity = authenticate, parentOrigin = process.env.ORBIT_SEARCH_PARENT_ORIGIN || 'https://silkroadhistoryprojects.onrender.com'} = {}) {
const parent = new URL(parentOrigin).origin;
const sessions = createSessions();
const attempts = new Map();
Object.assign(wisp.options, {
  allow_private_ips: false, allow_loopback_ips: false, allow_direct_ip: false,
  allow_udp_streams: false, port_whitelist: [80, 443],
  stream_limit_total: 256, stream_limit_per_host: 64, parse_real_ip: false
});
logging.set_level(logging.WARN);
const vendors = {
  '/vendor/scramjet/': '@mercuryworkshop/scramjet/dist/',
  '/vendor/baremux/': '@mercuryworkshop/bare-mux/dist/',
  '/vendor/bare-mux/': '@mercuryworkshop/bare-mux/dist/', // Alias; retain existing worker URL/storage compatibility.
  '/vendor/epoxy-http1/': '@mercuryworkshop/epoxy-tls/minimal/',
  '/vendor/epoxy/': '@mercuryworkshop/epoxy-transport/dist/'
};
const mime = {'.js':'text/javascript', '.mjs':'text/javascript', '.html':'text/html; charset=utf-8', '.css':'text/css', '.json':'application/json', '.wasm':'application/wasm', '.png':'image/png'};
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(req.url, 'http://local');
  // The public launcher may sit under Orbit's nested/blank-window wrappers.
  // Account handoff still checks the exact immediate parent origin AND window source.
  // It has no stored login and cannot authenticate an unrelated embedding site.
  if(!['/','/index.html'].includes(url.pathname))res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${parent}`);
  if (url.pathname === '/health') { res.writeHead(200); return res.end('Orbit Search ready'); }
  if (url.pathname === '/api/session') {
    res.setHeader('Cache-Control','no-store');
    let ownOrigin=false;try{const source=new URL(req.headers.origin);ownOrigin=['http:','https:'].includes(source.protocol)&&source.host===req.headers.host;}catch{}
    if (req.headers.origin !== parent && !ownOrigin) { res.writeHead(403); return res.end('Open Orbit Search from Orbit.'); }
    res.setHeader('Access-Control-Allow-Origin', ownOrigin?req.headers.origin:parent);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.writeHead(204); return res.end();
    }
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    const ip = req.socket.remoteAddress;
    const now = Date.now();
    for (const [key, value] of attempts) if (now - value.start > 60000) attempts.delete(key);
    const rate = attempts.get(ip) || {start: now, count: 0};
    attempts.set(ip, rate);
    if (++rate.count > 60) { res.writeHead(429); return res.end('Please wait a minute and retry.'); }
    try {
      const identity = await verifyIdentity((req.headers.authorization || '').replace(/^Bearer /, ''));
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify(sessions.issue(identity)));
    } catch { res.writeHead(401); res.end('Sign in to Orbit again, then retry Orbit Search.'); }
    return;
  }
  if (url.pathname === '/api/relay-check') {
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    let own=false;try{const origin=new URL(req.headers.origin);own=['http:','https:'].includes(origin.protocol)&&origin.host===req.headers.host;}catch{}
    if(req.method!=='POST'||!own){res.writeHead(403);return res.end(JSON.stringify({message:'Open Orbit Search from its authorized page.'}));}
    const session=sessions.get(req.headers['x-orbit-relay-ticket']);
    if(!session){res.writeHead(401);return res.end(JSON.stringify({message:'Relay ticket expired or the service restarted. Reopen Orbit Search to reconnect your account.'}));}
    if(session.connections.size>=20){res.writeHead(429);return res.end(JSON.stringify({message:'Your relay has reached 20 connections. Close unused Orbit Search tabs and retry.'}));}
    return res.end(JSON.stringify({ready:true}));
  }
  if (url.pathname === '/config.json') { res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({parent})); }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  let file;
  for (const [prefix, directory] of Object.entries(vendors)) {
    if (!pathname.startsWith(prefix)) continue;
    const name = pathname.slice(prefix.length);
    if (!/^[a-zA-Z0-9._-]+$/.test(name) || name.startsWith('.') || !/\.(js|mjs|wasm)$/.test(name)) break;
    file = resolve(root, 'node_modules', directory, name);
  }
  if (!file) {
    if (!['/', '/index.html', '/search.js', '/style.css', '/sw.js', '/proxy-runtime.js', '/http-fallback.js', '/relay-recovery.js', '/relay-probe.js', '/epoxy-fallback.mjs', '/address.js', '/orbit-mark.png'].includes(pathname)) { res.writeHead(404); return res.end(); }
    file = resolve(root, 'public', pathname === '/' ? 'index.html' : pathname.slice(1));
  }
  try {
    const info = await stat(file);
    res.writeHead(200, {'Content-Type':mime[extname(file)] || 'application/octet-stream', 'Content-Length':info.size, 'Cache-Control':'no-cache'});
    const stream = createReadStream(file); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://local');
  const session = sessions.get(url.searchParams.get('ticket'));
  const origin = req.headers.origin;
  let ownOrigin=false;try{ownOrigin=!!origin&&new URL(origin).host===req.headers.host;}catch{}
  // Only the dedicated proxy origin can open its relay; never expose a public unauthenticated Wisp server.
  if (url.pathname !== '/wisp/' || !session || !ownOrigin || session.connections.size >= 20) {
    console.warn('[Orbit Search relay] upgrade rejected:',url.pathname!=='/wisp/'?'path':!session?'expired-or-missing-ticket':!ownOrigin?'origin':'connection-limit');
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
  }
  session.connections.add(socket);
  const connectedAt=Date.now();
  socket.once('error',error=>console.warn('[Orbit Search relay] socket error:',error.code||error.name));
  socket.once('close',()=>{if(url.searchParams.get('probe')!=='1'&&Date.now()-connectedAt<3000)console.warn('[Orbit Search relay] socket closed within 3s of upgrade; inspect Wisp/network errors.');});
  let expiry;
  const expire=()=>{const remaining=session.expires-Date.now();if(remaining<=0){socket.destroy();return;}expiry=setTimeout(expire,remaining);expiry.unref();};
  expire(); // Recheck renewed expiry instead of killing a healthy renewed connection.
  socket.on('close', () => { clearTimeout(expiry); session.connections.delete(socket); });
  req.url = '/wisp/';
  wisp.routeRequest(req, socket, head);
});
return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createSearchServer().listen(Number(process.env.PORT || 8790), process.env.HOST || '0.0.0.0', () => console.log('Orbit Search listening'));
```

## orbit-search/public/sw.js

```js
/* Classic root-scoped worker for Scramjet 1.1.0 / BareMux 2.x. */
importScripts('/vendor/scramjet/scramjet.all.js');
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => event.respondWith((async () => {
  await scramjet.loadConfig();
  return scramjet.route(event) ? scramjet.fetch(event) : fetch(event.request);
})()));
```

## orbit-search/public/proxy-runtime.js

```js
import {verifyRelay} from './relay-probe.js';
/* Pinned Scramjet v1 + BareMux v2 + Epoxy v2 runtime. Keep on the isolated Search origin. */
export const PREFIX='/service/';
// v1 has no generic `rewriter` or worker-hook flag. Native worker hooks are bundled.
export const PROXY_FLAGS={strictRewrites:true,serviceworkers:false,syncxhr:false};
export const PROXY_SITE_FLAGS={
  // Experimental v1 SW emulation is limited to Discord. Failed hooks must not fall through.
  '^https://(?:[a-z0-9-]+\\.)?(?:discord\\.com|discordapp\\.com)(?::443)?/':{serviceworkers:true,allowFailedIntercepts:false}
};
export function waitForController(serviceWorker,timeout=20000){
  return new Promise((resolve,reject)=>{
    let timer;
    const clean=()=>{clearTimeout(timer);serviceWorker.removeEventListener('controllerchange',check);};
    const check=()=>{if(serviceWorker.controller){clean();resolve();}};
    serviceWorker.addEventListener('controllerchange',check);
    timer=setTimeout(()=>{clean();reject(new Error('Orbit Search did not gain service-worker control. Reload the Search page and try again.'));},timeout);
    check(); // Listen first, then inspect: do not lose a claim during startup.
  });
}
export function createProxyRuntime(){
  let boot;
  function initialize(){
    if(boot)return boot;
    boot=(async()=>{
      if(!navigator.serviceWorker||!window.SharedWorker)throw new Error('This browser does not support Orbit Search. Try a current Chrome or Firefox browser.');
      const {ScramjetController}=$scramjetLoadController();
      const controller=new ScramjetController({prefix:PREFIX,flags:PROXY_FLAGS,siteFlags:PROXY_SITE_FLAGS,files:{wasm:'/vendor/scramjet/scramjet.wasm.wasm',all:'/vendor/scramjet/scramjet.all.js',sync:'/vendor/scramjet/scramjet.sync.js'}});
      await controller.init();
      const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      if(new URL(registration.scope).origin!==location.origin||!new URL(PREFIX,location.origin).href.startsWith(registration.scope))throw new Error('The Search service-worker scope does not cover its proxy prefix.');
      await navigator.serviceWorker.ready;
      await waitForController(navigator.serviceWorker);
      const connection=new BareMux.BareMuxConnection('/vendor/baremux/worker.js');
      return {controller,connection};
    })().catch(error=>{boot=null;throw error;});
    return boot;
  }
  return {async connect(ticket){
    if(typeof ticket!=='string'||!ticket)throw new Error('Connect your Orbit account before browsing.');
    await verifyRelay(ticket);
    const {controller,connection}=await initialize();
    const wisp=new URL('/wisp/',location.href);wisp.protocol=location.protocol==='https:'?'wss:':'ws:';wisp.searchParams.set('ticket',ticket);
    await connection.setTransport('/epoxy-fallback.mjs?v=3',[{wisp:wisp.href}]);
    return controller; // No proxied frame is loaded before transport setup resolves.
  }};
}
```

## orbit-search/public/relay-probe.js

```js
/* Verify authorization and a real Wisp v1 CONTINUE packet before reporting Ready. */
export async function verifyRelay(ticket){
 const response=await fetch('/api/relay-check',{method:'POST',headers:{'X-Orbit-Relay-Ticket':ticket}});
 const check=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(check.message||'The relay authorization check failed. Reopen Orbit Search.');
 const url=new URL('/wisp/',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('ticket',ticket);url.searchParams.set('probe','1');
 await new Promise((resolve,reject)=>{
  const ws=new WebSocket(url);ws.binaryType='arraybuffer';let settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);ws.close();error?reject(error):resolve();};
  const timer=setTimeout(()=>finish(new Error('Relay handshake timed out. Check the Orbit Search Render logs.')),12000);
  ws.onmessage=event=>{const data=new Uint8Array(event.data);if(data.length>=9&&data[0]===3&&new DataView(data.buffer).getUint32(1,true)===0)finish();else finish(new Error('Relay returned an unexpected Wisp handshake packet.'));};
  ws.onerror=()=>finish(new Error('Relay WebSocket could not open. Authorization passed; check Render’s WebSocket upgrade/rejection logs.'));
  ws.onclose=event=>finish(new Error('Relay closed before its handshake (code '+event.code+'). Check Render’s relay logs.'));
 });
}
```

## orbit-search/public/epoxy-fallback.mjs

```js
import EpoxyTransport from '/vendor/epoxy/index.mjs';
import {createRelayRecovery,withRelayRecovery} from '/relay-recovery.js';
import {withHttp1Fallback} from '/http-fallback.js';
async function makeHttp1(opts,wisp){
 const {default:init,EpoxyClient,EpoxyClientOptions}=await import('/vendor/epoxy-http1/epoxy-bundled.js');
 await init();
 const createClient=()=>{
  const options=new EpoxyClientOptions();options.user_agent=navigator.userAgent;
  for(const key of ['wisp_v2','udp_extension_required','title_case_headers','redirect_limit','header_limit','buffer_size'])if(opts[key]!=null)options[key]=opts[key];
  // Options are consumed by the WASM constructor: allocate fresh ones on reconnect.
  return new EpoxyClient(wisp,options);
 };
 let client=createClient();
 const recover=createRelayRecovery(()=>{client=createClient();});
 return {async request(remote,method,body,headers,signal){
  if(signal?.aborted)throw new DOMException('The request was aborted.','AbortError');
  if(body instanceof Blob)body=await body.arrayBuffer();
  const response=await recover(()=>client.fetch(remote.href,{method,body,headers,redirect:'manual'}),method,body,signal);
  return {body:response.body,headers:response.rawHeaders,status:response.status,statusText:response.statusText};
 }};
}
export default withHttp1Fallback(withRelayRecovery(EpoxyTransport),makeHttp1);
```

## orbit-search/public/http-fallback.js

```js
/* Retry only read-only, bodyless requests after a recognizable HTTP/2 reset. */
export function isHttp2Reset(error){
  const parts=[];const seen=new Set();
  for(let current=error;current&&!seen.has(current)&&seen.size<5;current=current.cause){seen.add(current);parts.push(String(current),String(current.stack||''));}
  const text=parts.join('\n');
  return /http2|http\/2|\bh2\b/i.test(text)&&/protocol_error|stream.*reset|reset\(|goaway/i.test(text);
}
export function withHttp1Fallback(Base,makeHttp1){
 return class extends Base{
  constructor(...args){super(...args);this.http1Origins=new Set();this.http1Ready=null;}
  http1(){return this.http1Ready||=(Promise.resolve().then(()=>makeHttp1(this.opts,this.wisp)).catch(error=>{this.http1Ready=null;throw error;}));}
  async request(remote,method,body,headers,signal){
   if(this.http1Origins.has(remote.origin))return (await this.http1()).request(remote,method,body,headers,signal);
   try{return await super.request(remote,method,body,headers,signal);}
   catch(error){
    if(!['GET','HEAD'].includes(String(method).toUpperCase())||body!=null||signal?.aborted||!isHttp2Reset(error))throw error;
    let response;
    try{response=await(await this.http1()).request(remote,method,body,headers,signal);}
    catch(fallbackError){throw new AggregateError([error,fallbackError],'The HTTP/2 request and HTTP/1.1 fallback both failed.',{cause:fallbackError});}
    if(this.http1Origins.size>=64)this.http1Origins.delete(this.http1Origins.values().next().value);
    this.http1Origins.add(remote.origin);
    return response;
   }
  }
 };
}
```

## orbit-search/public/relay-recovery.js

```js
/* A dead Wisp mux needs replacement; replay only bodyless read-only requests. */
export function isEndedMux(error){
 const seen=new Set();
 for(let current=error;current&&!seen.has(current)&&seen.size<5;current=current.cause){seen.add(current);if(/MuxTaskEnded|Multiplexor task ended/i.test(String(current)))return true;}
 return false;
}
export function createRelayRecovery(reset){
 let generation=0,pending;
 return async function request(run,method,body,signal){
  const before=generation;
  try{return await run();}catch(error){
   if(!isEndedMux(error)||!['GET','HEAD'].includes(String(method).toUpperCase())||body!=null||signal?.aborted)throw error;
   if(before===generation){
    if(!pending)pending=Promise.resolve().then(reset).then(()=>{generation++;}).finally(()=>{pending=null;});
    try{await pending;}catch(reconnectError){throw new AggregateError([error,reconnectError],'The relay disconnected and reconnection failed. Reopen Orbit Search to reconnect your account.',{cause:reconnectError});}
   }
   if(signal?.aborted)throw new DOMException('The request was aborted.','AbortError');
   return run(); // One retry only; repeated failure propagates.
  }
 };
}
export function withRelayRecovery(Base){
 return class extends Base{
  constructor(...args){super(...args);this.relayRequest=createRelayRecovery(()=>super.init());}
  request(remote,method,body,headers,signal){return this.relayRequest(()=>super.request(remote,method,body,headers,signal),method,body,signal);}
 };
}
```

## orbit-search/public/search.js

```js
import { normalizeAddress } from '/address.js';
import { createProxyRuntime } from '/proxy-runtime.js';
const status = document.querySelector('#status');
const address = document.querySelector('#address');
const startAddress=document.querySelector('#start-address');
const welcome=document.querySelector('#welcome'),browserPanel=document.querySelector('#browser');
const tabList=document.querySelector('#tabs');
const tabs=[];let activeTab=null,nextTabId=0;
const siteHelp=document.querySelector('#site-help');
function setStatus(message,state='ready',tab=activeTab){
 if(tab){tab.message=message;tab.state=state;}
 if(!tab||tab===activeTab){status.textContent=message;document.body.dataset.connection=state;}
}
let controller, expires = 0;
const connectionId=crypto.randomUUID();
const orbitWindow=parent!==window?parent:window.opener;
const notify=message=>orbitWindow?.postMessage(message,config.parent);
const config = await fetch('/config.json').then(r => r.json());
setStatus(!orbitWindow?'Open Orbit Search from the Orbit sidebar to connect your account.':'Connecting to your Orbit account…','connecting');
const runtime=createProxyRuntime();
window.addEventListener('message', async event => {
  if (event.source !== orbitWindow || event.origin !== config.parent) return;
  if(event.data?.type==='orbit-search-hello'){notify({type:'orbit-search-ready',connectionId});return;}
  if(!['orbit-search-session','orbit-search-account'].includes(event.data?.type))return;
  try {
    let session=event.data;
    if(event.data.type==='orbit-search-account'){
      const response=await fetch('/api/session',{method:'POST',headers:{Authorization:'Bearer '+event.data.accessToken}});
      if(!response.ok)throw new Error('Could not connect your Orbit account. Sign in again and reopen Orbit Search.');
      session=await response.json();
    }
    controller=await runtime.connect(session.token);
    expires = session.expires;
    setStatus('Ready · Search results and websites open here.');
    notify({type:'orbit-search-connected'});
  } catch (error) {setStatus(error.message,'error');notify({type:'orbit-search-error',message:error.message});}
});
notify({type:'orbit-search-ready',connectionId});
function paintTab(tab){
 tab.label.textContent=tab.title;
 tab.button.setAttribute('aria-label',tab.title);
 tab.close.setAttribute('aria-label','Close '+tab.title+' tab');
 tab.element.classList.toggle('is-loading',tab.loading);
}
function syncNavigation(){
 document.querySelector('#back').disabled=!activeTab||activeTab.index<=0;
 document.querySelector('#forward').disabled=!activeTab||activeTab.index>=activeTab.history.length-1;
}
function showActive(){
 const tab=activeTab;if(!tab)return;
 for(const item of tabs){
  const selected=item===tab;item.panel.hidden=!selected;
  item.element.classList.toggle('active-tab',selected);
  item.button.setAttribute('aria-selected',String(selected));item.button.tabIndex=selected?0:-1;
  if(selected)item.label.id='tab-title';else item.label.removeAttribute('id');
 }
 welcome.hidden=!!tab.url;browserPanel.hidden=!tab.url;
 tab.button.setAttribute('aria-controls',tab.url?tab.panel.id:'welcome');welcome.setAttribute('role','tabpanel');welcome.setAttribute('aria-labelledby',tab.id);
 address.value=tab.draft;startAddress.value=tab.startDraft;
 document.body.classList.toggle('browsing',!!tab.url);document.body.classList.toggle('loading',tab.loading);
 siteHelp.hidden=!/^https?:\/\/(?:[a-z0-9-]+\.)?(?:discord\.com|discordapp\.com)(?::\d+)?(?:\/|$)/i.test(tab.url);
 setStatus(tab.message,tab.state,tab);syncNavigation();
}
function selectTab(tab,focus=false){
 if(!tabs.includes(tab))return;activeTab=tab;showActive();
 tab.element.scrollIntoView({block:'nearest',inline:'nearest'});if(focus)tab.button.focus();
}
function closeTab(tab){
 const index=tabs.indexOf(tab);if(index<0)return;
 tabs.splice(index,1);tab.panel.remove();tab.element.remove();
 if(!tabs.length){activeTab=null;addTab();return;}
 if(activeTab===tab)selectTab(tabs[Math.max(0,index-1)],true);
}
function addTab(){
 const id='search-tab-'+(++nextTabId),tab={id,url:'',title:'New search',draft:'',editing:false,startDraft:'',history:[],index:-1,frame:null,loading:false,message:Date.now()<expires?'Ready · Search results and websites open here.':status.textContent,state:Date.now()<expires?'ready':document.body.dataset.connection};
 tab.panel=document.createElement('div');tab.panel.id=id+'-panel';tab.panel.className='browser-tab-panel';tab.panel.hidden=true;tab.panel.setAttribute('role','tabpanel');tab.panel.setAttribute('aria-labelledby',id);
 browserPanel.append(tab.panel);
 tab.element=document.createElement('div');tab.element.className='browser-tab';
 tab.button=document.createElement('button');tab.button.type='button';tab.button.id=id;tab.button.className='tab-select';tab.button.setAttribute('role','tab');tab.button.setAttribute('aria-controls',tab.panel.id);
 tab.button.innerHTML='<img class="tab-logo" src="/orbit-mark.png" width="25" height="18" alt=""><span class="tab-label"></span>';
 tab.label=tab.button.querySelector('.tab-label');
 tab.close=document.createElement('button');tab.close.type='button';tab.close.className='tab-close';tab.close.textContent='×';tab.close.onclick=()=>closeTab(tab);
 tab.button.onclick=()=>selectTab(tab);
 tab.button.onkeydown=event=>{
  let index=tabs.indexOf(tab);
  if(event.key==='ArrowRight')index=(index+1)%tabs.length;else if(event.key==='ArrowLeft')index=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else if(event.key==='Delete'){event.preventDefault();closeTab(tab);return;}else return;
  event.preventDefault();selectTab(tabs[index],true);
 };
 tab.element.append(tab.button,tab.close);tabList.append(tab.element);tabs.push(tab);paintTab(tab);selectTab(tab);startAddress.focus({preventScroll:true});
 return tab;
}
function updateAddress(url,tab=activeTab){
 if(!tab||!tabs.includes(tab))return;
 try{const target=new URL(url);if(!['https:','http:'].includes(target.protocol))return;
  tab.url=target.href;if(!tab.editing)tab.draft=tab.url;tab.title=target.hostname;
  if(tab.history[tab.index]!==tab.url){tab.history.splice(tab.index+1);tab.history.push(tab.url);tab.index=tab.history.length-1;}
  paintTab(tab);if(tab===activeTab)showActive();
 }catch{/* Ignore non-web frame notifications. */}
}
function navigate(value,tab=activeTab){
 try{
  const url=normalizeAddress(value);tab.editing=false;
  if(Date.now()>=expires)throw new Error('Connect to your Orbit account before searching. Reopen Orbit Search if the connection has expired.');
  if(!tab.frame){
   const frame=tab.frame=controller.createFrame();frame.frame.title='Orbit Search browser';
   frame.frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals');
   frame.addEventListener('urlchange',event=>{if(tabs.includes(tab)&&event.url)updateAddress(String(event.url),tab);});
   frame.frame.onload=()=>{if(!tabs.includes(tab))return;tab.loading=false;setStatus('Page loaded · Some websites may require a CAPTCHA or refuse proxy access.','ready',tab);paintTab(tab);if(tab===activeTab)showActive();};
   tab.panel.append(frame.frame);
  }
  tab.loading=true;setStatus('Opening '+new URL(url).hostname+'…','loading',tab);updateAddress(url,tab);tab.frame.go(url);
 }catch(error){tab.loading=false;setStatus(error.message,'error',tab);paintTab(tab);if(tab===activeTab)showActive();}
}
address.addEventListener('input',()=>{activeTab.draft=address.value;activeTab.editing=true;});
startAddress.addEventListener('input',()=>{activeTab.startDraft=startAddress.value;});
document.querySelector('#search').addEventListener('submit',event=>{event.preventDefault();navigate(address.value);});
document.querySelector('#start-search').addEventListener('submit',event=>{event.preventDefault();navigate(startAddress.value);});
document.querySelectorAll('[data-url]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.url)));
document.querySelector('#source-link').addEventListener('click',event=>{event.preventDefault();navigate(event.currentTarget.href);});
document.querySelector('#newtab').onclick=()=>addTab();
document.querySelector('#back').onclick=()=>{if(activeTab.index>0){activeTab.index--;navigate(activeTab.history[activeTab.index]);}};
document.querySelector('#forward').onclick=()=>{if(activeTab.index<activeTab.history.length-1){activeTab.index++;navigate(activeTab.history[activeTab.index]);}};
document.querySelector('#reload').onclick=()=>{
 const tab=activeTab;if(tab.frame){tab.loading=true;setStatus('Reloading '+new URL(tab.url).hostname+'…','loading',tab);paintTab(tab);showActive();tab.frame.reload();}else startAddress.focus();
};
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();address.focus();address.select();}});
addTab();
```

## orbit-search/public/index.html

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#090e2b"><title>Orbit Search</title><link rel="icon" href="/orbit-mark.png"><link rel="stylesheet" href="/style.css?v=5"><script src="/vendor/scramjet/scramjet.all.js"></script><script src="/vendor/baremux/index.js"></script><script type="module" src="/search.js?v=9"></script></head>
<body data-connection="connecting">
<svg class="icon-defs" aria-hidden="true"><defs>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></symbol>
<symbol id="i-back" viewBox="0 0 24 24"><path d="m12 5-7 7 7 7M5 12h15"/></symbol>
<symbol id="i-forward" viewBox="0 0 24 24"><path d="m12 5 7 7-7 7M19 12H4"/></symbol>
<symbol id="i-reload" viewBox="0 0 24 24"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5M20 7l-3-3"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></symbol>
<symbol id="i-spark" viewBox="0 0 24 24"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></symbol>
</defs></svg>
<header class="browser-chrome">
  <div class="tab-strip"><div id="tabs" class="tabs" role="tablist" aria-label="Open tabs"></div><button type="button" id="newtab" class="icon-button new-tab" aria-label="New tab" title="New tab"><svg><use href="#i-plus"/></svg></button><span class="chrome-wordmark">orbit <span>search</span></span></div>
  <form id="search" class="toolbar"><nav class="navigation" aria-label="Browser controls"><button type="button" id="back" class="icon-button" aria-label="Go back" title="Back" disabled><svg><use href="#i-back"/></svg></button><button type="button" id="forward" class="icon-button" aria-label="Go forward" title="Forward" disabled><svg><use href="#i-forward"/></svg></button><button type="button" id="reload" class="icon-button" aria-label="Reload page" title="Reload"><svg><use href="#i-reload"/></svg></button></nav><div class="omnibox"><svg class="search-icon" aria-hidden="true"><use href="#i-search"/></svg><label class="sr" for="address">Search the web or enter a website</label><input id="address" type="text" placeholder="Search the web or enter a website" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"><kbd>Ctrl K</kbd><button id="go" class="omnibox-go" aria-label="Search" title="Search"><svg><use href="#i-arrow"/></svg></button></div></form>
  <div class="connection-line"><span class="connection-dot" aria-hidden="true"></span><p id="status" role="status">Connecting to Orbit…</p></div>
  <aside id="site-help" class="site-help" hidden aria-label="Discord sign-in help"><p>Discord login and CAPTCHA may fail through Orbit Search. Try signing in with your normal browser connection.</p><a href="https://discord.com/login" target="_blank" rel="noopener noreferrer">Open Discord directly ↗</a></aside>
</header>
<main id="workspace">
  <section id="welcome" aria-label="Search start page">
    <div class="ambience" aria-hidden="true"><div class="orbit-line orbit-line-one"></div><div class="orbit-line orbit-line-two"></div><div class="stars"></div></div>
    <div class="welcome-content"><div class="brand-mark"><img src="/orbit-mark.png" alt="" width="168" height="113"></div><p class="eyebrow">A LITTLE CURIOSITY GOES A LONG WAY</p><h1>Orbit <span>Search</span></h1><p class="welcome-subtitle">Where will your curiosity take you?</p>
      <form id="start-search" class="start-search"><svg aria-hidden="true"><use href="#i-search"/></svg><label class="sr" for="start-address">Search the web</label><input id="start-address" type="text" placeholder="Search the web or enter a website" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"><button type="submit" aria-label="Start search"><svg><use href="#i-arrow"/></svg></button></form>
      <div class="shortcuts" aria-label="Website shortcuts"><button type="button" class="shortcut" data-url="https://www.google.com"><span class="shortcut-icon google" aria-hidden="true">G</span><span>Google</span></button><button type="button" class="shortcut" data-url="https://www.youtube.com"><span class="shortcut-icon youtube" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="5" fill="currentColor" stroke="none"/><path d="m10 9 6 3-6 3Z" fill="#fff" stroke="none"/></svg></span><span>YouTube</span></button><button type="button" class="shortcut" data-url="https://www.wikipedia.org"><span class="shortcut-icon wikipedia" aria-hidden="true">W</span><span>Wikipedia</span></button><button type="button" class="shortcut" data-url="https://github.com"><span class="shortcut-icon github" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 19c-4 1-4-2-6-2m12 5v-4a3 3 0 0 0-1-2.5c3-.3 6-1.5 6-6a4.7 4.7 0 0 0-1.3-3.3A4.3 4.3 0 0 0 18.6 3S17.5 2.7 15 4a12 12 0 0 0-6 0C6.5 2.7 5.4 3 5.4 3a4.3 4.3 0 0 0-.1 3.2A4.7 4.7 0 0 0 4 9.5c0 4.5 3 5.7 6 6A3 3 0 0 0 9 18v4"/></svg></span><span>GitHub</span></button></div>
      <div class="welcome-hint"><svg aria-hidden="true"><use href="#i-spark"/></svg><span>A new perspective is only a search away.</span></div>
    </div>
    <footer class="start-footer"><span>Stay curious. Stay in the loop.</span><a id="source-link" href="https://github.com/yualan480/Silk-Road-History-Project/tree/main/orbit-search">Powered by Scramjet · Source &amp; licenses <svg aria-hidden="true"><use href="#i-arrow"/></svg></a></footer>
  </section>
  <div id="browser" hidden></div>
</main>
</body></html>
```

## orbit-search/public/style.css

```css
:root{color-scheme:dark;font-family:Arial,Helvetica,sans-serif;color:#edf0ff;background:#090e2b;--muted:#a6b0d0;--line:#b9c9ff1a;--accent:#a5b7ff}*{box-sizing:border-box}body{margin:0;height:100dvh;display:flex;flex-direction:column;overflow:hidden}button,input{font:inherit}button{cursor:pointer;color:inherit}button:disabled{cursor:default;opacity:.3}svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}.icon-defs{position:absolute;width:0;height:0;overflow:hidden}button:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid #9dccff;outline-offset:4px}.browser-chrome{position:relative;flex-shrink:0;background:linear-gradient(180deg,#171d42,#121832);border-bottom:1px solid var(--line);z-index:2;padding:0 14px}.tab-strip{height:40px;display:flex;align-items:end;gap:8px}.active-tab{display:flex;align-items:center;gap:10px;height:33px;width:min(250px,48vw);padding:0 14px;border-radius:14px 14px 0 0;background:#252c50;border:1px solid #b9c9ff1a;border-bottom:0;font-size:12px}.active-tab img{object-fit:contain}.active-tab #tab-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.tab-dot{width:6px;height:6px;border-radius:50%;background:#9eb2fb;opacity:.75}.chrome-wordmark{margin:auto 8px 10px auto;color:#c5ceec;font-size:13px;font-weight:700;letter-spacing:.2px}.chrome-wordmark span{color:#828eaf;font-weight:400;margin-left:3px}.icon-button{display:grid;place-items:center;min-width:38px;width:38px;height:38px;padding:0;border:0;border-radius:50%;background:transparent;color:#b8c3e4;transition:background 140ms,color 140ms,transform 140ms}.icon-button:not(:disabled):hover{background:#a5b7ff1a;color:#fff}.icon-button:active{transform:scale(.92)}.new-tab{width:30px;min-width:30px;height:30px;margin-bottom:1px}.new-tab svg{width:16px;height:16px}.toolbar{display:flex;align-items:center;gap:12px;padding-top:7px}.navigation{display:flex;gap:3px}.omnibox{display:flex;align-items:center;flex:1;min-width:0;height:44px;border-radius:999px;padding:0 5px 0 16px;background:#090f2a;border:1px solid #a5b7ff25;transition:border-color 160ms,box-shadow 160ms,background 160ms}.omnibox:focus-within{border-color:#8faaff;background:#101836;box-shadow:0 0 0 3px #718cfa18}.search-icon{width:17px;height:17px;color:#99a7ce;margin-right:10px}input{min-width:0;flex:1;border:0;background:transparent;color:inherit;outline:none!important;font-size:13px;height:100%;padding:0}input::placeholder{color:#8896bc;opacity:1}kbd{font:10px Arial,sans-serif;white-space:nowrap;color:#8391b5;border:1px solid #6675a044;padding:3px 6px;border-radius:5px;margin:0 12px;pointer-events:none}.omnibox-go{display:grid;place-items:center;width:33px;height:33px;border:0;border-radius:50%;background:#8da4ff;color:#101b48;transition:background 140ms,transform 140ms}.omnibox-go:hover{background:#b3c3ff;transform:translateX(1px)}.omnibox-go svg{width:17px;height:17px}.connection-line{display:flex;align-items:center;gap:7px;min-height:26px;padding:4px 5px 5px}.connection-dot{width:5px;height:5px;flex:none;background:#9cabc9;border-radius:50%}#status{font-size:10px;color:#97a6cb;margin:0;line-height:1.4;overflow-wrap:anywhere}body[data-connection=ready] .connection-dot{background:#80cdb2;box-shadow:0 0 7px #80cdb222}body[data-connection=error] .connection-dot{background:#f5a5a5}body[data-connection=error] #status{color:#ffc2c2}#workspace{position:relative;display:flex;flex-direction:column;flex:1;min-height:0;background:#090e2b}#welcome{position:relative;flex:1;min-height:0;isolation:isolate;overflow:auto;display:flex;flex-direction:column;background:radial-gradient(ellipse 58% 65% at 50% 35%,#28346740,transparent 80%),linear-gradient(145deg,#0d1436,#0a0f2c 55%,#101432)}[hidden]{display:none!important}.ambience{position:absolute;inset:0;overflow:hidden;z-index:-1;pointer-events:none}.orbit-line{position:absolute;left:50%;top:38%;width:1100px;height:420px;margin:-210px 0 0 -550px;border:1px solid #718bcc12;border-radius:50%;transform:rotate(-23deg)}.orbit-line-two{width:1500px;height:650px;margin:-325px 0 0 -750px;transform:rotate(-23deg);border-color:#718bcc0c}.stars{position:absolute;inset:0;background-image:radial-gradient(1px 1px at 12% 22%,#b6c6fa66 99%,transparent),radial-gradient(1px 1px at 81% 18%,#b6c6fa66 99%,transparent),radial-gradient(1px 1px at 91% 65%,#b6c6fa44 99%,transparent),radial-gradient(1px 1px at 17% 78%,#b6c6fa44 99%,transparent),radial-gradient(1.5px 1.5px at 69% 82%,#b6c6fa55 99%,transparent),radial-gradient(1px 1px at 38% 11%,#b6c6fa44 99%,transparent),radial-gradient(1px 1px at 61% 65%,#b6c6fa44 99%,transparent)}.welcome-content{position:relative;width:min(100%,760px);margin:auto;flex-shrink:0;align-self:center;text-align:center;padding:clamp(22px,5vh,64px) 28px 30px;animation:welcome-in 550ms ease both}.brand-mark{width:168px;height:113px;margin:0 auto 6px;animation:planet-float 8s ease-in-out infinite}.brand-mark img{display:block;width:100%;height:100%;object-fit:contain}.eyebrow{font-size:9px;letter-spacing:2.4px;color:#8799cb;margin:9px 0 17px;font-weight:600}h1{font-size:clamp(32px,5vw,48px);font-weight:650;line-height:1.1;letter-spacing:-1.6px;margin:0;color:#f1f4ff}h1 span{font-weight:400;color:#b5c5f6}.welcome-subtitle{font-size:14px;line-height:1.6;color:#9daed1;margin:14px 0 30px}.start-search{height:58px;max-width:600px;margin:0 auto;display:flex;align-items:center;gap:14px;padding:0 8px 0 20px;border-radius:999px;border:1px solid #a9baff33;background:linear-gradient(115deg,#242e50f0,#1b2545f0);box-shadow:0 10px 40px #02051a33,inset 0 1px #ffffff07;transition:border-color 160ms,box-shadow 160ms,transform 160ms}.start-search>svg{width:20px;color:#c2cff4}.start-search:focus-within{border-color:#99b5ff;box-shadow:0 0 0 4px #7b9afa14,0 10px 40px #02051a33;transform:translateY(-1px)}.start-search input{font-size:14px}.start-search button{display:grid;place-items:center;min-width:40px;height:40px;border:0;border-radius:50%;color:#c8d5ff;background:#617ed32b;transition:background 140ms,transform 140ms}.start-search button:hover{background:#617ed355;transform:translateX(1px)}.shortcuts{display:flex;justify-content:center;gap:12px;margin:25px auto 0}.shortcut{display:flex;flex-direction:column;align-items:center;gap:10px;width:82px;min-height:96px;padding:12px 8px;border:1px solid transparent;border-radius:17px;color:#c1cce7;background:transparent;font-size:11px;transition:background 160ms,border-color 160ms,transform 160ms}.shortcut:hover{background:#7f9bff0b;border-color:#a3b7f51c;transform:translateY(-3px)}.shortcut:active{transform:translateY(0)}.shortcut-icon{display:grid;place-items:center;width:46px;height:46px;border-radius:16px;background:#29345377;border:1px solid #96b1f017;box-shadow:0 4px 14px #02051a1a;font-size:24px;font-weight:700}.shortcut-icon svg{width:23px;height:23px}.google{color:#a5c2ff;font-family:Arial,sans-serif}.youtube{color:#e78098}.wikipedia{font-family:Georgia,serif;font-size:25px;color:#e1e5f1}.github{color:#bdc8e8}.welcome-hint{display:flex;justify-content:center;align-items:center;gap:8px;color:#768bb6;font-size:11px;margin:29px 0 0}.welcome-hint svg{width:14px;height:14px;color:#8ba5dc}.start-footer{position:relative;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px 24px 20px;color:#667b9f;font-size:10px;line-height:1.6}.start-footer a{color:#7f91b5;text-decoration:none}.start-footer a:hover{color:#c2d2f7;text-decoration:underline}#browser{position:relative;flex:1;min-height:0;margin:10px;border:1px solid #a5b7ff20;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 10px 35px #02051a22}#browser iframe{display:block;width:100%;height:100%;border:0;background:#fff}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
@keyframes welcome-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes planet-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@media(min-width:1500px){.welcome-content{padding-top:40px;padding-bottom:80px}}@media(max-width:600px){.browser-chrome{padding:0 8px}.tab-strip{height:35px}.active-tab{height:29px;width:180px;font-size:11px}.chrome-wordmark{font-size:11px}.toolbar{gap:5px}.navigation{gap:0}.icon-button{width:33px;min-width:33px;height:36px}.icon-button svg{width:17px;height:17px}.omnibox{height:41px;padding-left:11px}.omnibox input{font-size:12px}.omnibox kbd{display:none}.search-icon{margin-right:6px;width:15px}.omnibox-go{width:30px;height:30px;flex:none}.welcome-content{padding:28px 18px 24px}.brand-mark{width:140px;height:94px}.eyebrow{font-size:8px;letter-spacing:1.8px}h1{font-size:35px}.welcome-subtitle{font-size:13px;margin-bottom:25px}.start-search{height:54px;padding-left:16px;gap:10px}.start-search input{font-size:12px}.shortcuts{gap:4px;margin-top:20px}.shortcut{width:72px}.welcome-hint{font-size:10px;margin-top:22px}.start-footer{padding:12px 18px;justify-content:center;text-align:center;font-size:9px}#browser{margin:6px;border-radius:12px}}
@media(max-height:600px){.welcome-content{padding-top:18px;padding-bottom:18px}.brand-mark{width:110px;height:74px}.welcome-subtitle{margin:10px 0 18px}.welcome-hint{margin-top:12px}.shortcuts{margin-top:12px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}

.start-footer a{display:inline-flex;align-items:center;gap:4px}.start-footer a svg{width:10px;height:10px;transform:rotate(-35deg)}

.site-help{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:4px 6px 10px;padding:10px 14px;border:1px solid #a3b7f533;border-radius:12px;background:#1b2545;color:#c4cfea;font-size:12px;line-height:1.5}.site-help[hidden]{display:none}.site-help p{margin:0}.site-help a{flex-shrink:0;display:inline-block;padding:8px 12px;border-radius:9px;background:#334a87;color:#f1f4ff;text-decoration:none}.site-help a:hover{background:#405da9}.site-help a:focus-visible{outline:2px solid #a5c2ff;outline-offset:2px}@media(max-width:600px){.site-help{align-items:flex-start;flex-direction:column;font-size:11px}.site-help a{max-width:100%}}

/* Only the active tab logo moves while a page is loading. */
.tab-logo{flex:none;transform-origin:center}.browser-tab.is-loading .tab-logo,body.loading .browser-tab.active-tab .tab-logo{animation:tab-orbit-spin 1.15s linear infinite}@keyframes tab-orbit-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.browser-tab.is-loading .tab-logo,body.loading .browser-tab.active-tab .tab-logo{animation:none;opacity:.65}}

.tabs{display:flex;align-items:flex-end;gap:6px;min-width:0;max-width:calc(100% - 145px);height:40px;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}.browser-tab{display:flex;align-items:center;flex:0 0 190px;width:190px;height:33px;padding:0 5px 0 10px;border:1px solid #b9c9ff16;border-bottom:0;border-radius:14px 14px 0 0;background:#171f3b;color:#9eabcd}.browser-tab.active-tab{width:190px;background:#252c50;color:#edf0ff}.tab-select{display:flex;align-items:center;gap:8px;flex:1;min-width:0;height:100%;padding:0;border:0;background:transparent;color:inherit;text-align:left;font-size:12px}.tab-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tab-logo{object-fit:contain}.tab-close{display:grid;place-items:center;flex:none;width:25px;height:25px;border:0;border-radius:50%;padding:0;background:transparent;color:inherit;font-size:19px}.tab-close:hover{background:#a5b7ff25;color:#fff}.new-tab{flex-shrink:0}.chrome-wordmark{flex-shrink:0}.browser-tab-panel{height:100%;width:100%}.browser-tab-panel[hidden]{display:none!important}@media(max-width:600px){.tabs{height:35px;max-width:calc(100% - 36px)}.browser-tab,.browser-tab.active-tab{width:150px;flex-basis:150px;height:29px}.tab-select{font-size:11px}.chrome-wordmark{display:none}.tab-close{width:25px;height:25px}}
```

## orbit-search/public/address.js

```js
export function normalizeAddress(value) {
  value = String(value || '').trim();
  if (!value || value.length > 4096) throw new Error('Enter a search or website address.');
  const candidate = /^https?:\/\//i.test(value) ? value : /^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:\/\S*)?$/i.test(value) ? 'https://' + value : null;
  if (!candidate) {
    if (/^[a-z][\w+.-]*:/i.test(value)) throw new Error('Only HTTP and HTTPS websites are supported.');
    return 'https://www.google.com/search?q=' + encodeURIComponent(value);
  }
  const url = new URL(candidate);
  if (url.username || url.password) throw new Error('Use an address without embedded credentials.');
  return url.href;
}
```

## orbit-search/security.js

```js
import { randomBytes } from 'node:crypto';
export function createSessions() {
  const sessions = new Map();
  function prune() { for (const [token, s] of sessions) if (s.expires <= Date.now()) sessions.delete(token); }
  return {
    issue(identity) {
      prune();
      // Renew this account's ticket without breaking other tabs or active relay sockets.
      const expires = Math.min(identity.expiresAt, Date.now() + 30 * 60 * 1000);
      for (const [token, session] of sessions) if (session.user === identity.id) {
        session.expires = expires;
        return {token, expires};
      }
      if (sessions.size >= 500) throw new Error('Orbit Search is busy. Try again shortly.');
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, { user: identity.id, expires, connections: new Set() });
      return { token, expires };
    },
    get(token) { prune(); return sessions.get(token); }
  };
}
```

## orbit-search/package.json

```json
{
  "name": "orbit-search",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "start": "node server.js",
    "test": "node --test test/*.test.js"
  },
  "dependencies": {
    "@mercuryworkshop/bare-mux": "2.1.9",
    "@mercuryworkshop/epoxy-tls": "2.1.20-1",
    "@mercuryworkshop/epoxy-transport": "2.1.29",
    "@mercuryworkshop/scramjet": "1.1.0",
    "@mercuryworkshop/wisp-js": "0.5.3"
  }
}
```

## _headers

```text
/*
  Cache-Control: no-cache
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), microphone=(self), geolocation=(), payment=(), usb=()

/games/admin.html
  X-Frame-Options: SAMEORIGIN
  Content-Security-Policy: frame-ancestors 'self'
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex, nofollow
```

## chat/orbit-search.js

```js
export function renderOrbitSearch(main, {sb, menuBtn, bindMenu}, externalWindow = null) {
  if (main.querySelector('[data-orbit-search]')) return;
  main.innerHTML = `<div class="top search-shell-top">${menuBtn()}<b class="title">Orbit Search</b><span class="grow"></span><button type="button" class="btn ghost" data-search-fullscreen style="width:auto">Fullscreen</button></div><section data-orbit-search style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%"><div data-search-notice style="padding:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button type="button" class="btn ghost" data-search-window disabled style="width:auto">Open search window</button><span role="status">Starting Orbit Search… Render may take a minute to wake up.</span><button type="button" class="btn ghost" data-search-retry hidden style="width:auto;display:none">Retry connection</button></div></section>`;
  bindMenu();
  const container = main.querySelector('[data-orbit-search]');
  const fullscreen = main.querySelector('[data-search-fullscreen]');
  const syncFullscreen=()=>{fullscreen.textContent=document.fullscreenElement===main?'Exit fullscreen':'Fullscreen';fullscreen.setAttribute('aria-pressed',String(document.fullscreenElement===main));};
  fullscreen.onclick=()=>{try{const result=document.fullscreenElement===main?document.exitFullscreen?.():main.requestFullscreen?.();result?.catch(()=>{});}catch{}};
  document.addEventListener('fullscreenchange',syncFullscreen);syncFullscreen();
  // Request during the tab click, before any network await consumes user activation.
  if(!externalWindow&&navigator.userActivation?.isActive&&!document.fullscreenElement)fullscreen.click();
  const notice = container.querySelector('[data-search-notice]');
  const status = notice.querySelector('[role=status]');
  const retry = notice.querySelector('[data-search-retry]');
  const openWindow = notice.querySelector('[data-search-window]');
  let searchOrigin;
  openWindow.onclick=()=>{
    if(externalWindow&&!externalWindow.closed){externalWindow.focus();return;}
    const popup=window.open(searchOrigin+'/#orbit-window','_blank');
    if(!popup){status.textContent='Your browser blocked the new window. Allow popups for this site, then click Open search window again.';return;}
    observer.disconnect();cleanup();container.remove();renderOrbitSearch(main,{sb,menuBtn,bindMenu},popup);
  };
  let refreshTimer, helloTimer, timeout, listener, stopped=false, inFlight;
  const pending = new AbortController();
  function cleanup() {
    stopped=true;pending.abort();
    document.removeEventListener('fullscreenchange',syncFullscreen);
    if(document.fullscreenElement===main)document.exitFullscreen?.().catch(()=>{});clearInterval(refreshTimer);clearInterval(helloTimer);clearTimeout(timeout);
    if(listener)window.removeEventListener('message',listener);
  }
  const observer = new MutationObserver(() => {if (!container.isConnected) {cleanup();observer.disconnect();}});
  observer.observe(main,{childList:true});
  const fail = message => {
    cleanup();
    if (!container.isConnected) return;
    notice.hidden=false;notice.style.display='flex';status.textContent=message;retry.hidden=false;retry.style.display='inline-flex';
  };
  retry.onclick=()=>{observer.disconnect();cleanup();container.remove();renderOrbitSearch(main,{sb,menuBtn,bindMenu});};
  (async () => {
    const response = await fetch('/orbit-search/config', {cache:'no-store',signal:pending.signal});
    const {url} = await response.json();
    if (!url) throw new Error('Orbit Search is being set up. The site owner needs to connect its dedicated search service in Render.');
    const origin = new URL(url).origin;searchOrigin=origin;openWindow.disabled=false;
    if (origin === location.origin) throw new Error('Orbit Search needs a separate origin from Orbit.');
    // Wait for the application, rather than embedding Render's cold-start interstitial.
    const deadline=Date.now()+90000;
    while (!stopped) {
      const ready=await fetch('/orbit-search/ready',{cache:'no-store',signal:pending.signal}).then(r=>r.json());
      if (ready.ready) {
        if (ready.parent!==location.origin) throw new Error('The search service is configured for a different website. Set ORBIT_SEARCH_PARENT_ORIGIN to '+location.origin+' on the search service, then redeploy it.');
        break;
      }
      if(Date.now()>=deadline) throw new Error('The search service is still starting. Wait a minute, then retry.');
      await new Promise(resolve=>{const delay=setTimeout(resolve,2000);pending.signal.addEventListener('abort',()=>{clearTimeout(delay);resolve();},{once:true});});
    }
    if(stopped||!container.isConnected)return;
    const frame = document.createElement('iframe');
    frame.title = 'Orbit Search'; frame.src = origin + '/';
    frame.style.cssText = 'border:0;width:100%;flex:1;min-height:0;background:#080d32';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals');
    const peer=()=>externalWindow||frame.contentWindow;
    status.textContent=externalWindow?'Connecting the search window to your Orbit account…':'Connecting your Orbit account…';
    async function connect() {
      if(stopped||!container.isConnected)return;
      if(inFlight)return inFlight;
      inFlight=(async()=>{
        const {data} = await sb.auth.getSession();
        if (!data.session) throw new Error('Sign in to Orbit to use Orbit Search.');
        // Authenticate inside the search origin so browsers need no cross-site API request from Orbit.
        if(!stopped)peer().postMessage({type:'orbit-search-account',accessToken:data.session.access_token},origin);
      })().finally(()=>{inFlight=null;});
      return inFlight;
    }
    let sessionStarted=null;
    listener = event => {
      if(stopped||event.origin!==origin||event.source!==peer())return;
      if(event.data?.type==='orbit-search-ready'&&sessionStarted!==(event.data.connectionId||'initial')) {sessionStarted=event.data.connectionId||'initial';clearInterval(helloTimer);connect().catch(error=>fail(error.message));}
      if(event.data?.type==='orbit-search-connected') {
        clearTimeout(timeout);clearInterval(helloTimer);
        if(externalWindow){status.textContent='Search is connected in the separate window. Keep this Orbit tab open to stay connected.';openWindow.textContent='Return to search window';}
        else {notice.hidden=true;notice.style.display='none';}
      }
      if(event.data?.type==='orbit-search-error') fail(String(event.data.message||'Orbit Search could not initialize.'));
    };
    window.addEventListener('message',listener);
    if(!externalWindow)container.append(frame);
    const hello=()=>peer().postMessage({type:'orbit-search-hello'},origin);
    frame.onload=hello;hello();
    helloTimer=setInterval(hello,5000);
    timeout=setTimeout(()=>fail('The embedded page could not connect. Click Open search window to connect outside the iframe, or retry here.'),45000);
    refreshTimer=setInterval(()=>connect().catch(error=>fail(error.message)),20*60*1000);
  })().catch(error=>{if(!stopped)fail(error.message);});
}
```

