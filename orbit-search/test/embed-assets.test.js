import test from 'node:test';
import assert from 'node:assert/strict';
import {createSearchServer} from '../server.js';
test('deployed launcher serves every local stylesheet, script and icon without login',async t=>{
 const server=createSearchServer({verifyIdentity:async()=>{throw new Error('No account handoff expected');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const response=await fetch(base+'/');assert.equal(response.status,200);const html=await response.text();
 assert.match(html,/src="https:\/\/search\.orbitstayintheloop\.workers\.dev\/"/);
 const assets=[...html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="(\/[^"]+)"[^>]*>/g)].map(m=>m[1]);
 assert.ok(assets.some(path=>path.endsWith('.css')));assert.ok(assets.some(path=>path.endsWith('.js')));
 for(const path of assets){const asset=await fetch(base+path);assert.equal(asset.status,200,path);
  if(path.endsWith('.css'))assert.match(asset.headers.get('content-type'),/text\/css/);
  if(path.endsWith('.js'))assert.match(asset.headers.get('content-type'),/javascript/);
  assert.ok((await asset.arrayBuffer()).byteLength>0,path);
 }
 assert.equal((await fetch(base+'/auth-config.js')).status,404);
});
