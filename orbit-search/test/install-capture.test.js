import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

test('Chrome install event survives app-module loading and is cleared after installation', async () => {
 const events=new EventTarget(),window={};
 runInNewContext(await readFile(new URL('../../chat/install-prompt.js',import.meta.url),'utf8'),{
  window,Event,addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)
 });
 // Chrome may fire before app.js and its optional imports finish loading.
 const prompt=new Event('beforeinstallprompt',{cancelable:true});
 events.dispatchEvent(prompt);
 assert.equal(prompt.defaultPrevented,true);
 assert.equal(window.OrbitInstallPrompt.event,prompt);
 // The consumer uses the same stored state once it starts.
 const consumerState=window.OrbitInstallPrompt;
 events.dispatchEvent(new Event('appinstalled'));
 assert.equal(consumerState.event,null);
 assert.equal(consumerState.installed,true);
});

test('installation is remembered across reloads and cleared when Chrome offers reinstall',async()=>{
 const storage=new Map(),source=await readFile(new URL('../../chat/install-prompt.js',import.meta.url),'utf8');
 const boot=()=>{const events=new EventTarget(),window={};runInNewContext(source,{window,Event,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)});return{events,window};};
 const first=boot();first.events.dispatchEvent(new Event('appinstalled'));
 const next=boot();assert.equal(next.window.OrbitInstallPrompt.installed,true);
 next.events.dispatchEvent(new Event('beforeinstallprompt',{cancelable:true}));
 assert.equal(next.window.OrbitInstallPrompt.installed,false);
 assert.equal(storage.has('orbit-app-installed-v1'),false);
});
