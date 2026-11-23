import test from 'node:test';import assert from 'node:assert/strict';
import {moduleAsset} from '../../chat/asset-url.js';
test('module assets retain the same original URL when loaded through Scramjet',()=>{
 const original='https://search.orbitstayintheloop.workers.dev/chat/orbit-bg.js?v=5';
 const proxied='https://orbitsearch.onrender.com/service/'+encodeURIComponent(original);
 for(const path of ['orbit-space.jpg?v=2','orbit-ambient.wav','collectible-float.css?v=2','./orbit-logo-planet.png']){
  assert.equal(moduleAsset(path,proxied),new URL(path,original).href);
  assert.equal(moduleAsset(path,original),new URL(path,original).href);
 }
});
test('ordinary service directories and encoded asset names keep native URL semantics',()=>{
 assert.equal(moduleAsset('../icon.png','https://example.com/service/modules/app.js'),'https://example.com/service/icon.png');
 const base='https://example.com/my%20site/chat/module.js';
 assert.equal(moduleAsset('image%20one.jpg','https://proxy.example/service/'+encodeURIComponent(base)),new URL('image%20one.jpg',base).href);
});
