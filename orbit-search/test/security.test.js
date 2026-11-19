import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSearchServer} from '../server.js';
import {createSessions} from '../security.js';
import {normalizeAddress} from '../public/address.js';
import {server as wisp} from '@mercuryworkshop/wisp-js/server';
test('web addresses, searches and rejected non-web schemes',()=>{
 assert.equal(normalizeAddress('example.com/path'),'https://example.com/path');
 assert.equal(normalizeAddress('silk road history'),'https://www.google.com/search?q=silk%20road%20history');
 for(const value of ['javascript:alert(1)','file:///etc/passwd','https://user:pass@example.com','']) assert.throws(()=>normalizeAddress(value));
});
test('short-lived tickets renew in place and expire',()=>{
 const sessions=createSessions();const identity={id:'one',expiresAt:Date.now()+60000};
 const first=sessions.issue(identity);assert.ok(sessions.get(first.token));
 const next=sessions.issue(identity);assert.equal(next.token,first.token);assert.ok(sessions.get(first.token));assert.ok(sessions.get(next.token));
 const expired=sessions.issue({id:'expired',expiresAt:Date.now()-1});assert.equal(sessions.get(expired.token),undefined);
});
test('relay needs an Orbit session and exact parent origin; assets are scoped',async t=>{
 const parentOrigin='http://127.0.0.1:8801';
 const server=createSearchServer({parentOrigin,verifyIdentity:async token=>{if(token!=='valid')throw Error();return {id:'test',expiresAt:Date.now()+60000};}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/')).headers.get('content-security-policy'),null,'Public launcher supports nested wrappers');
 assert.equal((await fetch(base+'/config.json')).headers.get('content-security-policy'),"frame-ancestors 'self' "+parentOrigin);
 assert.equal((await fetch(base+'/api/session',{method:'POST',headers:{Origin:'https://evil.example',Authorization:'Bearer valid'}})).status,403);
 assert.equal((await fetch(base+'/api/session',{method:'POST',headers:{Origin:parentOrigin,Authorization:'Bearer wrong'}})).status,401);
 const result=await fetch(base+'/api/session',{method:'POST',headers:{Origin:parentOrigin,Authorization:'Bearer valid'}});
 assert.equal(result.status,200);const issued=await result.json();assert.ok(issued.token);
 assert.equal((await fetch(base+'/api/relay-check',{method:'POST',headers:{Origin:base,'X-Orbit-Relay-Ticket':issued.token}})).status,200);
 assert.equal((await fetch(base+'/api/relay-check',{method:'POST',headers:{Origin:base,'X-Orbit-Relay-Ticket':'expired'}})).status,401);
 assert.equal((await fetch(base+'/api/relay-check',{method:'POST',headers:{Origin:'https://evil.example','X-Orbit-Relay-Ticket':issued.token}})).status,403);
 const local=await fetch(base+'/api/session',{method:'POST',headers:{Origin:base,Authorization:'Bearer valid'}});assert.equal(local.status,200);
 assert.equal((await fetch(base+'/api/session',{method:'POST',headers:{Origin:base,Authorization:'Bearer wrong'}})).status,401);
 for(const path of ['/server.js','/security.js','/node_modules/ws/package.json']) assert.equal((await fetch(base+path)).status,404);
 for(const path of ['/','/sw.js','/address.js','/vendor/scramjet/scramjet.all.js','/vendor/scramjet/scramjet.wasm.wasm','/vendor/epoxy/index.mjs','/vendor/epoxy-http1/epoxy-bundled.js','/epoxy-fallback.mjs','/http-fallback.js','/vendor/baremux/worker.js','/orbit-mark.png']) assert.equal((await fetch(base+path)).status,200,path);
 assert.equal(wisp.options.allow_private_ips,false);assert.equal(wisp.options.allow_loopback_ips,false);assert.deepEqual(wisp.options.port_whitelist,[80,443]);
});

test('vendor alias, module and WASM MIME types, root worker and embedded-page headers',async t=>{
 const server=createSearchServer({parentOrigin:'https://orbit.example'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port;
 for(const file of ['worker.js','index.js','index.mjs']){
  const old=await fetch(base+'/vendor/baremux/'+file),canonical=await fetch(base+'/vendor/bare-mux/'+file);
  assert.equal(canonical.status,200);assert.match(canonical.headers.get('content-type'),/javascript/);
  assert.equal(await old.text(),await canonical.text());
 }
 const wasm=await fetch(base+'/vendor/scramjet/scramjet.wasm.wasm');assert.equal(wasm.status,200);assert.equal(wasm.headers.get('content-type'),'application/wasm');
 assert.deepEqual([...new Uint8Array(await wasm.arrayBuffer()).slice(0,4)],[0,97,115,109]);
 const epoxy=await fetch(base+'/vendor/epoxy/index.mjs');assert.equal(epoxy.status,200);assert.match(epoxy.headers.get('content-type'),/javascript/);assert.ok((await epoxy.text()).includes('AGFzb'));
 for(const path of ['/','/sw.js','/proxy-runtime.js']){
  const response=await fetch(base+path);assert.equal(response.status,200);
  assert.equal(response.headers.get('cross-origin-opener-policy'),null);assert.equal(response.headers.get('cross-origin-embedder-policy'),null);
 }
 for(const path of ['/vendor/bare-mux/%2e%2e%2fpackage.json','/vendor/epoxy/package.json'])assert.equal((await fetch(base+path)).status,404);
});

test('relay accepts twenty authenticated connections and rejects the twenty-first',async t=>{
 const {default:WebSocket}=await import('../../orbitcraft/node_modules/ws/wrapper.mjs');
 const server=createSearchServer({parentOrigin:'https://orbit.example',verifyIdentity:async()=>({id:'connection-limit-test',expiresAt:Date.now()+60000})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,sockets=[];
 t.after(async()=>{for(const ws of sockets)ws.terminate();await new Promise(r=>setImmediate(r));server.closeAllConnections();server.close();});
 const session=await(await fetch(base+'/api/session',{method:'POST',headers:{Origin:base,Authorization:'Bearer test'}})).json();
 const url=base.replace('http:','ws:')+'/wisp/?ticket='+encodeURIComponent(session.token);
 for(let i=0;i<20;i++)await new Promise((resolve,reject)=>{const ws=new WebSocket(url,{origin:base});sockets.push(ws);ws.once('open',resolve);ws.once('error',reject);});
 const rejected=await new Promise((resolve,reject)=>{const ws=new WebSocket(url,{origin:base});sockets.push(ws);ws.once('unexpected-response',(request,response)=>{response.resume();resolve(response.statusCode);ws.terminate();});ws.once('open',()=>reject(Error('Twenty-first connection unexpectedly accepted')));ws.on('error',()=>{});});
 assert.equal(rejected,403);assert.equal(wisp.options.stream_limit_total,256);assert.equal(wisp.options.stream_limit_per_host,64);
});

test('renewal keeps active relay sockets alive past their original deadline, then expires them',async t=>{
 const {default:WebSocket}=await import('../../orbitcraft/node_modules/ws/wrapper.mjs');
 const server=createSearchServer({verifyIdentity:async()=>({id:'renewal-test',expiresAt:Date.now()+1000})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 let ws;t.after(()=>{ws?.terminate();server.closeAllConnections();server.close();});
 const issue=async()=> (await fetch(base+'/api/session',{method:'POST',headers:{Origin:base,Authorization:'Bearer test'}})).json();
 const first=await issue();ws=new WebSocket(base.replace('http:','ws:')+'/wisp/?ticket='+first.token,{origin:base});await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 await new Promise(resolve=>setTimeout(resolve,400));const next=await issue();assert.equal(next.token,first.token);assert.ok(next.expires>first.expires);
 await new Promise(resolve=>setTimeout(resolve,Math.max(1,first.expires-Date.now()+100)));assert.equal(ws.readyState,WebSocket.OPEN);
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Expired relay stayed open')),2000);ws.once('close',()=>{clearTimeout(timeout);resolve();});});
});
