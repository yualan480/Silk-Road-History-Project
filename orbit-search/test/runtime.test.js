import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitForController} from '../public/proxy-runtime.js';
test('service-worker claim before and after listener registration both resolve',async()=>{
 const claimed=new EventTarget();claimed.controller={};await waitForController(claimed,100);
 const pending=new EventTarget();const ready=waitForController(pending,100);pending.controller={};pending.dispatchEvent(new Event('controllerchange'));await ready;
 // Claim happens while addEventListener runs: the post-listen inspection must catch it.
 const racing=new EventTarget();racing.addEventListener=function(...args){EventTarget.prototype.addEventListener.apply(this,args);this.controller={};};await waitForController(racing,100);
});
test('service-worker control wait fails rather than hanging forever',async()=>{await assert.rejects(waitForController(new EventTarget(),5),/did not gain/);});
