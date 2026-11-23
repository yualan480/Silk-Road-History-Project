import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticate} from '../auth.js';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from '../auth-config.js';
test('standalone auth verifies the Orbit token and reads its actual profile',async t=>{
 const requests=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  requests.push({url,options});
  return Response.json(url.endsWith('/auth/v1/user')?{id:'verified-user'}:[{username:'school-user',first_name:'A',last_name:'Student',display_name:'Orbit Display'}]);
 });
 const user=await authenticate('test-token');assert.equal(user.id,'verified-user');assert.equal(user.name,'A Student');
 assert.equal(requests.length,2);assert.equal(requests[0].url,SUPABASE_URL+'/auth/v1/user');
 assert.equal(requests[0].options.headers.Authorization,'Bearer test-token');assert.equal(requests[0].options.headers.apikey,SUPABASE_ANON_KEY);
 assert.ok(requests[1].url.includes('id=eq.verified-user'));
});
test('standalone auth rejects missing login and upstream identity/profile failures',async t=>{
 await assert.rejects(authenticate(null),/Sign in/);
 t.mock.method(globalThis,'fetch',async()=>new Response('',{status:401}));
 await assert.rejects(authenticate('bad-token'),/session expired/);
 globalThis.fetch=async url=>url.endsWith('/auth/v1/user')?Response.json({id:'verified-user'}):Response.json([]);
 await assert.rejects(authenticate('test-token'),/Finish creating/);
});
