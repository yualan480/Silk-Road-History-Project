import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium} from '../../orbitcraft/node_modules/@playwright/test/index.mjs';
import {server as wisp} from '@mercuryworkshop/wisp-js/server';
import {createSearchServer} from '../server.js';
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
let version,hits=0;
const target=http.createServer((req,res)=>{hits++;version=req.httpVersion;res.setHeader('Content-Type','text/plain');res.end('HTTP/1.1 fallback works');});
const targetBase=await listen(target);
const proxy=createSearchServer({verifyIdentity:async token=>{assert.equal(token,'http1-test');return {id:'http1-test',expiresAt:Date.now()+60000};}});
const proxyBase=await listen(proxy);
// Local destinations/ports are allowed ONLY inside this test process.
wisp.options.allow_private_ips=true;wisp.options.allow_loopback_ips=true;wisp.options.port_whitelist=[Number(new URL(targetBase).port)];wisp.options.dns_method=async()=> '127.0.0.1';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(proxyBase);
 const result=await page.evaluate(async target=>{
  const response=await fetch('/api/session',{method:'POST',headers:{Authorization:'Bearer http1-test'}});const session=await response.json();
  const wisp=new URL('/wisp/',location.href);wisp.protocol='ws:';wisp.searchParams.set('ticket',session.token);
  const {default:Transport}=await import('/epoxy-fallback.mjs');const transport=new Transport({wisp:wisp.href});
  // Exercise the real, lazily loaded HTTP/1 adapter. Retry selection is covered separately.
  const url=new URL(target);transport.http1Origins.add(url.origin);
  const result=await transport.request(url,'GET',null,{});
  return {status:result.status,text:await new Response(result.body).text(),isolated:crossOriginIsolated};
 },'http://fixture.test:'+new URL(targetBase).port+'/');
 assert.deepEqual(result,{status:200,text:'HTTP/1.1 fallback works',isolated:false});assert.equal(version,'1.1');assert.equal(hits,1);assert.deepEqual(errors,[]);
 console.log('PASS real HTTP/1-only Epoxy WASM adapter fetches via authenticated Wisp, exact HTTP/1.1 observed at destination, no cross-origin isolation required.');
}finally{await browser.close();for(const server of [proxy,target]){server.closeAllConnections();server.close();}}
