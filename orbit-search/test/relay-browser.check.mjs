import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium} from '../../orbitcraft/node_modules/@playwright/test/index.mjs';
import {server as wisp} from '@mercuryworkshop/wisp-js/server';
import {createSearchServer} from '../server.js';
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+s.address().port)));
let hits=0,upgrades=0;const sockets=new Set();
const target=http.createServer((req,res)=>{hits++;res.setHeader('Connection','close');res.end('relay recovered');});const targetBase=await listen(target);
const proxy=createSearchServer({verifyIdentity:async()=>({id:'relay-recovery-browser',expiresAt:Date.now()+60000})});
proxy.on('upgrade',(req,socket)=>{upgrades++;sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});const proxyBase=await listen(proxy);
wisp.options.allow_private_ips=true;wisp.options.allow_loopback_ips=true;wisp.options.port_whitelist=[Number(new URL(targetBase).port)];wisp.options.dns_method=async()=> '127.0.0.1';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto(proxyBase);
 for(const minimal of [false,true]){
  const read=async first=>page.evaluate(async({first,minimal,target})=>{
   const {default:Transport}=await import('/epoxy-fallback.mjs');
   if(first){const session=await(await fetch('/api/session',{method:'POST',headers:{Authorization:'Bearer fixture'}})).json();const wisp=new URL('/wisp/',location.href);wisp.protocol='ws:';wisp.searchParams.set('ticket',session.token);window.relayTransport=new Transport({wisp:wisp.href});await window.relayTransport.init();if(minimal)window.relayTransport.http1Origins.add(new URL(target).origin);}
   try{const response=await window.relayTransport.request(new URL(target),'GET',null,{});return new Response(response.body).text();}catch(error){throw Error(String(error)+' '+(error.errors||[]).map(String).join('; '));}
  },{first,minimal,target:'http://fixture.test:'+new URL(targetBase).port+'/'});
  assert.equal(await read(true),'relay recovered');const before=upgrades;
  for(const socket of sockets)socket.destroy();await page.waitForTimeout(150);
  assert.equal(await read(false),'relay recovered');assert.ok(upgrades>before,'A replacement authenticated relay connection opens');
 }
 assert.equal(hits,4);console.log('PASS real relay socket drops recover for full Epoxy and HTTP/1-only Epoxy, with authenticated reconnection and one successful retry.');
}finally{await browser.close();for(const s of [proxy,target]){s.closeAllConnections();s.close();}}
