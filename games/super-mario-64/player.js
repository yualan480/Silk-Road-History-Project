/* User-supplied US N64 ROM. Native emulator storage plus local resume snapshots. */
window.EJS_player='#game';
window.EJS_core='n64';
window.EJS_gameUrl='super-mario-64.z64';
window.EJS_gameName='Super Mario 64 (USA)';
window.EJS_pathtodata='vendor/';
window.EJS_startOnLoaded=true;
window.EJS_disableAutoLang=false;
window.EJS_language='en-US';
window.EJS_threads=false;
window.EJS_backgroundColor='#000';
window.EJS_defaultControls={0:{0:{value:'x',value2:'BUTTON_2'},1:{value:'z',value2:'BUTTON_1'},3:{value:'enter',value2:'START'},4:{value:'w',value2:'DPAD_UP'},5:{value:'s',value2:'DPAD_DOWN'},6:{value:'a',value2:'DPAD_LEFT'},7:{value:'d',value2:'DPAD_RIGHT'},10:{value:'q',value2:'LEFT_TOP_SHOULDER'},11:{value:'e',value2:'RIGHT_TOP_SHOULDER'},12:{value:'shift',value2:'LEFT_BOTTOM_SHOULDER'},16:{value:'right arrow',value2:'LEFT_STICK_X:+1'},17:{value:'left arrow',value2:'LEFT_STICK_X:-1'},18:{value:'down arrow',value2:'LEFT_STICK_Y:+1'},19:{value:'up arrow',value2:'LEFT_STICK_Y:-1'},20:{value:'l',value2:'RIGHT_STICK_X:+1'},21:{value:'j',value2:'RIGHT_STICK_X:-1'},22:{value:'k',value2:'RIGHT_STICK_Y:+1'},23:{value:'i',value2:'RIGHT_STICK_Y:-1'}},1:{},2:{},3:{}};
window.EJS_defaultOptions={'virtual-gamepad':'disabled','save-save-interval':'30'};
window.EJS_Buttons={playPause:false,restart:false,mute:false,settings:false,fullscreen:false,saveState:false,loadState:false,screenRecord:false,gamepad:false,cheat:false,volume:false,saveSavFiles:false,loadSavFiles:false,quickSave:false,quickLoad:false,screenshot:false,cacheManager:false,exitEmulation:false};
(function(){
 let dbPromise,started=false,saving=false;
 function database(){return dbPromise||=new Promise((resolve,reject)=>{const req=indexedDB.open('orbit-n64-resume-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('states');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
 async function read(){const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction('states').objectStore('states').get('sm64-usa-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async function save(){if(!started||saving)return;saving=true;try{const manager=window.EJS_emulator.gameManager;manager.saveSaveFiles();const bytes=manager.getState();if(!bytes?.byteLength)return;const db=await database();await new Promise((resolve,reject)=>{const tx=db.transaction('states','readwrite');tx.objectStore('states').put(bytes,'sm64-usa-v1');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}catch(error){console.warn('Orbit N64 resume save unavailable',error);}finally{saving=false;}}
 window.EJS_onGameStart=async function(){const emu=window.EJS_emulator;emu.toggleVirtualGamepad(false);try{const bytes=await read();if(bytes?.byteLength)emu.gameManager.loadState(bytes);}catch(error){console.warn('Orbit N64 resume unavailable',error);}started=true;setInterval(save,10000);setInterval(()=>{if(started&&!document.hidden)emu.gameManager.saveSaveFiles();},2000);document.querySelector('#game canvas')?.focus();};
 window.OrbitGameSave?.register(save);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
 addEventListener('pagehide',save);
})();
