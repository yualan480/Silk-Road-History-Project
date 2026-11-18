/* Local game save coordinator. It never uploads browser storage or authentication data.
   Native save formats stay native; registered game adapters can additionally save a run. */
(function(){
 'use strict';if(window.OrbitGameSave)return;
 var script=document.currentScript,game=script?.dataset.game||location.pathname.split('/').filter(Boolean)[1]||'game';
 if(!/^[a-z0-9-]{1,60}$/.test(game))return;
 var store;try{store=localStorage;}catch{return;}
 var originalSet=Storage.prototype.setItem,originalRemove=Storage.prototype.removeItem;
 var prefix='orbit-game-backup-v1:',backupKey=prefix+game,dirty=new Map(),handlers=new Set(),timer=0,busy=false,lastNative=0;
 var MAX=2*1024*1024;
 function permitted(key){return typeof key==='string'&&key.length<240&&!/^(sb-|chatter|stg|orbit-game-backup|orbit-(?:balance|claim|rates|ambient|music|guide|cursor|trail|theme|profile)|player-(?:name|avatar))/i.test(key)&&!/(?:token|password|secret|credential|session|device[_-]?id)/i.test(key);}
 function read(){try{var saved=JSON.parse(store.getItem(backupKey)||'{}');return saved.version===1&&saved.values&&typeof saved.values==='object'?saved.values:{};}catch{return {};}}
 function notify(message){try{if(parent!==window)parent.postMessage({orbitSave:'status',game:game,text:message},location.origin);}catch{}}
 // Repair missing native save keys from the last local backup before the game loads.
 var recovered=read();Object.keys(recovered).forEach(function(key){if(permitted(key)&&typeof recovered[key]==='string'&&store.getItem(key)===null)try{originalSet.call(store,key,recovered[key]);}catch{}});
 function flushBackup(){
  clearTimeout(timer);timer=0;if(!dirty.size)return;
  try{var values=read();dirty.forEach(function(value,key){if(value===null)delete values[key];else values[key]=value;});var payload=JSON.stringify({version:1,savedAt:Date.now(),values:values});if(payload.length>MAX){notify('Game data saved; backup is too large.');dirty.clear();return;}originalSet.call(store,backupKey,payload);dirty.clear();notify('Saved on this device');}
  catch{try{originalRemove.call(store,backupKey);}catch{}dirty.clear();notify('Recovery backup storage is full. Export a backup in the game.');}
 }
 function changed(key,value){if(!permitted(key))return;dirty.set(key,value);clearTimeout(timer);timer=setTimeout(flushBackup,200);}
 Storage.prototype.setItem=function(key,value){
  try{originalSet.call(this,key,value);}catch(error){
   if(this!==store||!(/quota/i.test(error.name||'')))throw error;
   // Recovery copies must never crowd out a game's primary save.
   var backups=[];for(var i=0;i<store.length;i++){var k=store.key(i);if(k?.startsWith(prefix))backups.push(k);}backups.forEach(function(k){originalRemove.call(store,k);});
   originalSet.call(this,key,value);
  }
  if(this===store)changed(String(key),String(value));
 };
 Storage.prototype.removeItem=function(key){originalRemove.call(this,key);if(this===store){changed(String(key),null);flushBackup();}};
 async function flush(){
  if(busy){flushBackup();return;}busy=true;
  try{
   var tasks=[];handlers.forEach(function(fn){try{tasks.push(Promise.resolve(fn()));}catch{notify('The game could not save this time.');}});
   if(window.Game?.WriteSave&&window.Game.ready&&Date.now()-lastNative>1500){lastNative=Date.now();try{var data=window.Game.WriteSave(1);if(typeof data==='string'&&data.length>10&&window.Game.SaveTo)store.setItem(window.Game.SaveTo,data);}catch{}}
   var module=window.gameInstance?.Module||window.unityInstance?.Module||window.Module;
   if(module?.calledRun&&module.FS?.syncfs){tasks.push(new Promise(function(resolve){try{module.FS.syncfs(false,function(error){if(error)notify('Could not sync game data.');resolve();});}catch{resolve();}}));}
   flushBackup();await Promise.allSettled(tasks);flushBackup();
  }finally{busy=false;}
 }
 // IndexedDB games (worlds, emulator states, Unity preferences) commit through their own engines.
 try{var transaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(){var tx=transaction.apply(this,arguments);if(tx.mode==='readwrite'&&!/cache|asset|unityweb/i.test(this.name)){tx.addEventListener('complete',function(){notify('Saved on this device');});tx.addEventListener('abort',function(){notify('Could not save game data. Check available storage.');});}return tx;};}catch{}
 var api=window.OrbitGameSave={game:game,register:function(fn){handlers.add(fn);return function(){handlers.delete(fn);};},flush:flush};
 setInterval(function(){if(!document.hidden)flush();},2000);
 addEventListener('pagehide',function(){flush();flushBackup();});
 document.addEventListener('visibilitychange',function(){if(document.hidden){flush();flushBackup();}});
 document.addEventListener('freeze',function(){flush();flushBackup();});
 addEventListener('message',function(event){if(event.origin===location.origin&&event.source===parent&&event.data?.orbitSave==='flush')flush();});
 // Persisting storage is optional; a denied request does not stop games from saving normally.
 addEventListener('pointerdown',function(){navigator.storage?.persist?.().catch(function(){});},{once:true,passive:true});
})();
