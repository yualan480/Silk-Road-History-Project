import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRelayRecovery,isEndedMux,isRelayConnectionFailure} from '../public/relay-recovery.js';
const ended=()=>Error('Hyper client: Error(Connect, Wisp(MuxTaskEnded)) (Multiplexor task ended)');
test('recognizes ended mux, including nested cause; ignores unrelated errors',()=>{assert.ok(isEndedMux(ended()));assert.ok(isEndedMux(new Error('network',{cause:ended()})));assert.equal(isEndedMux(Error('TLS failed')),false);});
test('concurrent ended requests share one reset and retry once',async()=>{
 let resets=0,dead=true;const recover=createRelayRecovery(async()=>{resets++;await new Promise(r=>setTimeout(r,10));dead=false;});let calls=0;
 const run=()=>{calls++;if(dead)throw ended();return 'ok';};assert.deepEqual(await Promise.all([1,2,3].map(()=>recover(run,'GET',null))),['ok','ok','ok']);assert.equal(resets,1);assert.equal(calls,6);
});
test('does not replay writes, body-bearing GET, aborted requests, or unrelated failures',async()=>{
 for(const [method,body,signal] of [['POST',null],['GET','body'],['HEAD',null,{aborted:true}]]){let resets=0;const recover=createRelayRecovery(()=>resets++);await assert.rejects(recover(()=>{throw ended();},method,body,signal));assert.equal(resets,0);}
 let resets=0;await assert.rejects(createRelayRecovery(()=>resets++)(()=>{throw Error('TLS failed');},'GET',null));assert.equal(resets,0);
});
test('repeated mux failure is bounded, failed reconnect preserves both causes',async()=>{
 let resets=0,calls=0;await assert.rejects(createRelayRecovery(()=>resets++)(()=>{calls++;throw ended();},'GET',null));assert.equal(calls,2);assert.equal(resets,1);
 await assert.rejects(createRelayRecovery(()=>{throw Error('403');})(()=>{throw ended();},'GET',null),e=>e instanceof AggregateError&&e.errors.length===2);
});

const unopened=()=>Error('Hyper client: Error(Connect, WebSocketConnectFailed("websocket did not open"))');
test('initial Wisp WebSocket connection failure rebuilds transport and retries a page load once',async()=>{
 assert.ok(isRelayConnectionFailure(new Error('outer',{cause:unopened()})));
 assert.equal(isRelayConnectionFailure(Error('Unrelated WebSocket error')),false);
 let resets=0,calls=0;
 const recover=createRelayRecovery(()=>resets++);
 assert.equal(await recover(()=>{if(++calls===1)throw unopened();return 'page';},'GET',null),'page');
 assert.equal(resets,1);assert.equal(calls,2);
});
test('unopened WebSocket recovery is bounded and never replays writes',async()=>{
 let resets=0,calls=0;const recover=createRelayRecovery(()=>resets++);
 await assert.rejects(recover(()=>{calls++;throw unopened();},'GET',null));
 assert.equal(resets,1);assert.equal(calls,2);
 await assert.rejects(recover(()=>{throw unopened();},'POST',null));
 assert.equal(resets,1);
});
