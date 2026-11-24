// Installation belongs to the top-level Chrome page, including when Orbit is
// displayed inside the proxy. This exchange contains no account credentials.
export function requestParentInstall({host=window,timeout=1200,statusOnly=false}={}) {
  if(host.parent===host)return Promise.resolve(false);
  return new Promise(resolve=>{
    const requestId=host.crypto.randomUUID();let timer;
    const finish=handled=>{clearTimeout(timer);host.removeEventListener('message',receive);resolve(handled);};
    function receive(event){
      // Scramjet wraps WindowProxy identities. The unpredictable reply ID ties
      // this response to our parent request; the native bridge validates origin/source.
      let data=event.data;for(let i=0;i<2&&data?.$scramjet$data;i++)data=data.$scramjet$data;
      if(data?.type!=='orbit-install-result'||data.requestId!==requestId)return;
      if(data.status==='pending'){clearTimeout(timer);timer=setTimeout(()=>finish(true),120000);return;}
      if(['accepted','installed'].includes(data.status))host.OrbitInstallPrompt?.setInstalled?.(true);
      if(data.status==='available')host.OrbitInstallPrompt?.setInstalled?.(false);
      finish(['accepted','dismissed','installed'].includes(data.status));
    }
    host.addEventListener('message',receive);timer=setTimeout(()=>finish(false),timeout);
    host.parent.postMessage({type:statusOnly?'orbit-install-status':'orbit-install-request',requestId},'*');
  });
}
