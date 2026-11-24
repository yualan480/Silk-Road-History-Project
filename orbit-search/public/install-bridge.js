// Chrome install prompts can only belong to the actual top-level launcher.
const installedKey='orbit-app-installed-v1';
let installed=false;try{installed=localStorage.getItem(installedKey)==='1';}catch{}
const remember=value=>{installed=value;try{if(value)localStorage.setItem(installedKey,'1');else localStorage.removeItem(installedKey);}catch{}};
if(matchMedia('(display-mode: standalone)').matches)remember(true);
let installEvent=null;
addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;remember(false);});
addEventListener('appinstalled',()=>{installEvent=null;remember(true);});
addEventListener('message',async event=>{
 const frame=document.querySelector('#site iframe');
 if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin)return;
 let data=event.data;for(let i=0;i<2&&data?.$scramjet$data;i++)data=data.$scramjet$data;
 if(!['orbit-install-request','orbit-install-status'].includes(data?.type)||typeof data.requestId!=='string'||data.requestId.length>80)return;
 const reply=status=>event.source.postMessage({type:'orbit-install-result',requestId:data.requestId,status},location.origin);
 if(installed||matchMedia('(display-mode: standalone)').matches){reply('installed');return;}
 if(data.type==='orbit-install-status'){reply(installEvent?'available':'unavailable');return;}
 if(!installEvent){reply('unavailable');return;}
 const pending=installEvent;installEvent=null;reply('pending');
 try{await pending.prompt();const choice=await pending.userChoice;if(choice?.outcome==='accepted')remember(true);reply(choice?.outcome==='accepted'?'accepted':'dismissed');}
 catch{reply('unavailable');}
});
