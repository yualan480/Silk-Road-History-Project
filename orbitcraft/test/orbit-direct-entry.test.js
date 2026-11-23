import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../gate.js',import.meta.url),'utf8');
function run(path,unlocked=false){
 const url=new URL(path,'https://search.orbitstayintheloop.workers.dev'),local=new Map(unlocked?[['stg_ok','1']]:[]),session=new Map(),redirects=[],window={};
 const storage=map=>({getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,String(value))});
 vm.runInNewContext(source,{URL,location:{href:url.href,pathname:url.pathname,search:url.search,hash:url.hash,replace:value=>redirects.push(value)},document:{currentScript:{src:url.origin+'/gate.js?v=2'}},localStorage:storage(local),sessionStorage:storage(session),top:window,self:window});
 return {local,session,redirects};
}
test('explicit Orbit entry reaches its login directly without the history cover or Morse popup',()=>{
 for(const path of ['/chat/?entry=orbit','/chat/index.html?entry=orbit']){
  const result=run(path);assert.deepEqual(result.redirects,[]);assert.equal(result.local.get('stg_ok'),'1');assert.equal(result.session.has('stg_fwd'),false);
 }
});
test('ordinary locked and unlocked entry routes preserve their previous behavior',()=>{
 assert.deepEqual(run('/chat/').redirects,['https://search.orbitstayintheloop.workers.dev/']);
 assert.deepEqual(run('/games/?entry=orbit').redirects,['https://search.orbitstayintheloop.workers.dev/']);
 const unlocked=run('/chat/',true);assert.deepEqual(unlocked.redirects,['https://search.orbitstayintheloop.workers.dev/#/chat']);assert.equal(JSON.parse(unlocked.session.get('stg_fwd')).v,'chat');
});
