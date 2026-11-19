import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitForController,PROXY_FLAGS,PROXY_SITE_FLAGS} from '../public/proxy-runtime.js';
test('service-worker claim before and after listener registration both resolve',async()=>{
 const claimed=new EventTarget();claimed.controller={};await waitForController(claimed,100);
 const pending=new EventTarget();const ready=waitForController(pending,100);pending.controller={};pending.dispatchEvent(new Event('controllerchange'));await ready;
 // Claim happens while addEventListener runs: the post-listen inspection must catch it.
 const racing=new EventTarget();racing.addEventListener=function(...args){EventTarget.prototype.addEventListener.apply(this,args);this.controller={};};await waitForController(racing,100);
});
test('service-worker control wait fails rather than hanging forever',async()=>{await assert.rejects(waitForController(new EventTarget(),5),/did not gain/);});

test('Discord-only experimental SW emulation and fail-closed intercept policy use v1 flags',()=>{
 assert.equal(PROXY_FLAGS.strictRewrites,true);assert.equal(PROXY_FLAGS.serviceworkers,false);assert.equal(PROXY_FLAGS.syncxhr,false);
 const entries=Object.entries(PROXY_SITE_FLAGS);assert.equal(entries.length,1);const [pattern,flags]=entries[0];const matcher=new RegExp(pattern);
 for(const url of ['https://discord.com/app','https://canary.discord.com/login','https://discordapp.com/','https://ptb.discord.com:443/'])assert.ok(matcher.test(url),url);
 for(const url of ['https://discord.com.evil.example/','https://notdiscord.com/','https://example.com/','https://discord.com:8443/'])assert.equal(matcher.test(url),false,url);
 assert.deepEqual(flags,{serviceworkers:true,allowFailedIntercepts:false});
});
