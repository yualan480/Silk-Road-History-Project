// This pinned Construct runtime's native JSON save/load methods are HY/HX.
(function(){
 const key='orbit-small-world-cup-round-v1';let ready=false;
 function save(){const runtime=window.cr_getC2Runtime?.();if(!ready||!runtime?.ja)return;try{localStorage.setItem(key,runtime.HY());}catch{}}
 const timer=setInterval(()=>{const runtime=window.cr_getC2Runtime?.();if(!runtime?.ja||typeof runtime.HY!=='function'||typeof runtime.HX!=='function')return;clearInterval(timer);try{const data=localStorage.getItem(key);if(data)runtime.HX(data);}catch{}ready=true;window.OrbitGameSave?.register(save);setInterval(save,1000);},100);
 addEventListener('pagehide',save);document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
})();
