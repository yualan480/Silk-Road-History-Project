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
test('short-lived tickets replace old tickets and expire',()=>{
 const sessions=createSessions();const identity={id:'one',expiresAt:Date.now()+60000};
 const first=sessions.issue(identity);assert.ok(sessions.get(first.token));
 const next=sessions.issue(identity);assert.equal(sessions.get(first.token),undefined);assert.ok(sessions.get(next.token));
 const expired=sessions.issue({id:'expired',expiresAt:Date.now()-1});assert.equal(sessions.get(expired.token),undefined);
});
test('relay needs an Orbit session and exact parent origin; assets are scoped',async t=>{
 const parentOrigin='http://127.0.0.1:8801';
 const server=createSearchServer({parentOrigin,verifyIdentity:async token=>{if(token!=='valid')throw Error();return {id:'test',expiresAt:Date.now()+60000};}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/session',{method:'POST',headers:{Origin:'https://evil.example',Authorization:'Bearer valid'}})).status,403);
 assert.equal((await fetch(base+'/api/session',{method:'POST',headers:{Origin:parentOrigin,Authorization:'Bearer wrong'}})).status,401);
 const result=await fetch(base+'/api/session',{method:'POST',headers:{Origin:parentOrigin,Authorization:'Bearer valid'}});
 assert.equal(result.status,200);assert.ok((await result.json()).token);
 const local=await fetch(base+'/api/session',{method:'POST',headers:{Origin:base,Authorization:'Bearer valid'}});assert.equal(local.status,200);
 assert.equal((await fetch(base+'/api/session',{method:'POST',headers:{Origin:base,Authorization:'Bearer wrong'}})).status,401);
 for(const path of ['/server.js','/security.js','/node_modules/ws/package.json']) assert.equal((await fetch(base+path)).status,404);
 for(const path of ['/','/sw.js','/address.js','/vendor/scramjet/scramjet.all.js','/vendor/scramjet/scramjet.wasm.wasm','/vendor/epoxy/index.mjs','/vendor/baremux/worker.js']) assert.equal((await fetch(base+path)).status,200,path);
 assert.equal(wisp.options.allow_private_ips,false);assert.equal(wisp.options.allow_loopback_ips,false);assert.deepEqual(wisp.options.port_whitelist,[80,443]);
});
