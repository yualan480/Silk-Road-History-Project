import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isHttp2Reset,withHttp1Fallback} from '../public/http-fallback.js';
const reset=()=>new Error('Hyper client: hyper::Error(Http2, Error { kind: Reset(StreamId(1), PROTOCOL_ERROR, Library) })');
function fixture({primaryError=reset(),fallbackError}={}){
 const calls={primary:[],fallback:[],init:0,ws:0};
 class Primary{constructor(){this.opts={};this.wisp='wss://relay.example/wisp/?ticket=fixture';}async request(url,method){calls.primary.push([url.href,method]);if(primaryError)throw primaryError;return {status:403};}connect(){calls.ws++;return 'original-websocket';}}
 const Transport=withHttp1Fallback(Primary,async(opts,wisp)=>{calls.init++;assert.equal(wisp,'wss://relay.example/wisp/?ticket=fixture');return {async request(url,method){calls.fallback.push([url.href,method]);if(fallbackError)throw fallbackError;return {status:200,body:'HTTP/1.1'};}};});
 return {transport:new Transport(),calls};
}
test('recognizes the reported HTTP/2 reset and nested causes, not unrelated errors',()=>{
 assert.ok(isHttp2Reset(reset()));assert.ok(isHttp2Reset(new Error('network',{cause:reset()})));
 for(const e of [Error('403 Forbidden'),Error('TLS certificate invalid'),Error('HTTP2 timeout'),Error('connection reset')])assert.equal(isHttp2Reset(e),false);
});
test('GET retries once over HTTP/1.1 and reuses fallback only for that origin; WebSockets stay original',async()=>{
 const {transport,calls}=fixture();const url=new URL('https://www.youtube.com/');assert.equal((await transport.request(url,'GET',null,{})).status,200);
 await transport.request(new URL('https://www.youtube.com/next'),'POST','body',{});assert.equal(calls.primary.length,1);assert.equal(calls.fallback.length,2);assert.equal(calls.init,1);
 assert.equal(transport.connect(),'original-websocket');assert.equal(calls.ws,1);
 await transport.request(new URL('https://other.example/'),'HEAD',null,{});assert.equal(calls.primary.length,2);
});
test('does not replay POST, body-bearing GET, aborted requests, or unrelated failures',async()=>{
 for(const [method,body,signal] of [['POST',null],['GET','body'],['GET',null,{aborted:true}]]){
  const {transport,calls}=fixture();await assert.rejects(transport.request(new URL('https://youtube.com/'),method,body,{},signal));assert.equal(calls.init,0);
 }
 const {transport,calls}=fixture({primaryError:Error('TLS certificate invalid')});await assert.rejects(transport.request(new URL('https://youtube.com/'),'GET',null,{}));assert.equal(calls.init,0);
});
test('HTTP error responses are returned without retry; fallback failures preserve both errors',async()=>{
 const ordinary=fixture({primaryError:null});assert.equal((await ordinary.transport.request(new URL('https://youtube.com/'),'GET',null,{})).status,403);assert.equal(ordinary.calls.init,0);
 const failed=fixture({fallbackError:Error('HTTP/1.1 failed')});await assert.rejects(failed.transport.request(new URL('https://youtube.com/'),'GET',null,{}),e=>e instanceof AggregateError&&e.errors.length===2);assert.equal(failed.transport.http1Origins.size,0);
});
