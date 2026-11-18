import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSearchReadiness} from '../server/search-status.js';
test('search readiness waits for JSON application config instead of a Render startup page',async()=>{
 let calls=0;
 const readiness=createSearchReadiness(async url=>{calls++;assert.equal(url,'https://search.example/config.json');return new Response('<html>Starting</html>',{headers:{'Content-Type':'text/html'}});});
 assert.deepEqual(await readiness('https://search.example'),{ready:false});
 assert.deepEqual(await readiness('https://search.example'),{ready:false});assert.equal(calls,1);
});
test('search readiness reports allowed parent and coalesces concurrent requests',async()=>{
 let calls=0;
 const readiness=createSearchReadiness(async()=>{calls++;return Response.json({parent:'https://orbit.example'});});
 const results=await Promise.all([readiness('https://search.example'),readiness('https://search.example')]);
 assert.deepEqual(results,[{ready:true,parent:'https://orbit.example'},{ready:true,parent:'https://orbit.example'}]);assert.equal(calls,1);
});
test('search readiness handles service failures and invalid config',async()=>{
 for(const fetcher of [async()=>{throw Error('offline');},async()=>Response.json({}),async()=>Response.json({parent:'null'}),async()=>new Response('',{status:503})]) assert.deepEqual(await createSearchReadiness(fetcher)('https://search.example'),{ready:false});
});
