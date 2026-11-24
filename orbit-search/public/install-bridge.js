// Chrome install prompts can only belong to the actual top-level launcher.
let installEvent=null;
addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;});
addEventListener('appinstalled',()=>{installEvent=null;});
addEventListener('message',async event=>{
 const frame=document.querySelector('#site iframe');
 if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin)return;
 let data=event.data;for(let i=0;i<2&&data?.$scramjet$data;i++)data=data.$scramjet$data;
 if(data?.type!=='orbit-install-request'||typeof data.requestId!=='string'||data.requestId.length>80)return;
 const reply=status=>event.source.postMessage({type:'orbit-install-result',requestId:data.requestId,status},location.origin);
 if(matchMedia('(display-mode: standalone)').matches){reply('installed');return;}
 if(!installEvent){reply('unavailable');return;}
 const pending=installEvent;installEvent=null;reply('pending');
 try{await pending.prompt();const choice=await pending.userChoice;reply(choice?.outcome==='accepted'?'accepted':'dismissed');}
 catch{reply('unavailable');}
});
