(function(){
 const $=id=>document.getElementById(id),status=text=>{$('status').textContent=text;};
 let player=null,romId=null,loaded=false,saving=false,dbPromise;
 function database(){return dbPromise||=new Promise((resolve,reject)=>{const request=indexedDB.open('orbit-nes-player-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
 async function get(key){const db=await database();return new Promise((resolve,reject)=>{const request=db.transaction('files').objectStore('files').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
 async function put(key,value){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
 async function save(){if(!loaded||saving)return;saving=true;try{await put('state:'+romId,{version:1,romId,state:player.nes.toJSON(),savedAt:Date.now()});status('Progress saved on this device.');}catch{status('Could not autosave. Use Export save for a backup.');}finally{saving=false;}}
 async function open(bytes,name,remember){
  if(bytes.length<16||String.fromCharCode(...bytes.slice(0,4))!=='NES\x1a')throw Error('Choose a valid iNES .nes file.');
  const hash=await crypto.subtle.digest('SHA-256',bytes);romId=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  loaded=false;player?.destroy();player=new jsnes.Browser({container:$('screen'),onError:()=>status('This game file could not run. Try another supported NES file.')});
  try{player.loadROM(bytes);}catch(error){player.destroy();for(const id of ['resume','pause','restart','export'])$(id).disabled=true;throw error;}loaded=true;
  for(const id of ['resume','pause','restart','export'])$(id).disabled=false;
  try{
   const saved=await get('state:'+romId);if(saved?.version===1&&saved.romId===romId){try{player.nes.fromJSON(saved.state);status('Your saved progress has been restored.');}catch{status('The previous save is incompatible. Your game file is loaded.');}}else status('Game loaded. Press Enter or Start. Autosave is on.');
   if(remember)await put('rom',{bytes,name});
  }catch{status('Game loaded. Browser storage is unavailable; use Export save for a backup.');}
 }
 $('rom').onchange=async()=>{const file=$('rom').files[0];if(!file)return;try{if(file.size>8*1024*1024)throw Error('Choose an NES file smaller than 8 MB.');await save();await open(new Uint8Array(await file.arrayBuffer()),file.name,true);}catch(e){status(e.message||'Could not load this file.');}};
 $('pause').onclick=()=>{save();player?.stop();};$('resume').onclick=()=>player?.start();
 $('restart').onclick=async()=>{if(!loaded)return;releaseKeys();player.stop();await save();try{await put('state:'+romId,null);}catch{}player.nes.reloadROM();player.start();await save();};
 $('export').onclick=()=>{if(!loaded)return;const payload={version:1,romId,state:player.nes.toJSON()};const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='super-mario-progress.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('import').onchange=async()=>{const file=$('import').files[0];if(!file)return;try{if(!loaded)throw Error('Load your game file first.');if(file.size>8*1024*1024)throw Error('Save file is too large.');const data=JSON.parse(await file.text());if(data.version!==1||data.romId!==romId)throw Error('This save belongs to a different ROM.');player.nes.fromJSON(data.state);await save();status('Save imported.');}catch(e){status(e.message||'Could not import save.');}};
 const held=new Map();function release(pointer){const key=held.get(pointer);held.delete(pointer);if(key!==undefined&&loaded&&![...held.values()].includes(key))player.nes.buttonUp(1,key);}
 document.querySelectorAll('[data-key]').forEach(button=>{button.onpointerdown=e=>{if(!loaded)return;e.preventDefault();button.setPointerCapture(e.pointerId);const key=jsnes.Controller['BUTTON_'+button.dataset.key];held.set(e.pointerId,key);player.nes.buttonDown(1,key);};button.onpointerup=button.onpointercancel=button.onlostpointercapture=e=>release(e.pointerId);});
 function releaseKeys(){for(const pointer of held.keys())release(pointer);if(loaded)for(const name of ['A','B','SELECT','START','UP','DOWN','LEFT','RIGHT'])player.nes.buttonUp(1,jsnes.Controller['BUTTON_'+name]);}addEventListener('blur',releaseKeys);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseKeys();save();player?.stop();}else if(loaded)status('Game paused. Press Resume when ready.');});
 addEventListener('pagehide',save);setInterval(()=>{if(!document.hidden)save();},2000);window.OrbitGameSave?.register(save);
 get('rom').then(rom=>{if(rom)open(new Uint8Array(rom.bytes),rom.name,false).catch(()=>status('Choose your NES game file to continue.'));}).catch(()=>status('Browser storage is unavailable. Progress cannot autosave; use Export save.'));
})();
