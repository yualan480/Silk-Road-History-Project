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
