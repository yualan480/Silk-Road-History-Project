export const isGmsChannel = channel => channel?.special === 'gms' || String(channel?.name || '').toLowerCase() === 'gms';
export function createGmsDrawer({render,load}) {
  let dialog=null,content=null,restore=null,closing=false,timer;
  function finish(){if(!dialog)return;const old=dialog;dialog=content=null;closing=false;clearTimeout(timer);if(old?.open)old.close();old?.remove();document.documentElement.classList.remove('gms-drawer-active');const target=restore?.isConnected?restore:document.querySelector('#homeDayBadge');restore=null;target?.focus({preventScroll:true});}
  function close(){if(!dialog||closing)return;closing=true;dialog.classList.remove('is-open');dialog.addEventListener('transitionend',event=>{if(event.target===dialog&&event.propertyName==='transform')finish();},{once:true});timer=setTimeout(finish,280);}
  function refresh(){if(dialog&&!closing)render(content);}
  async function open(){
    if(dialog){dialog.querySelector('button')?.focus();return;}
    restore=document.activeElement;dialog=document.createElement('dialog');dialog.className='gms-drawer';dialog.setAttribute('aria-labelledby','gms-drawer-title');
    dialog.innerHTML='<header class="gms-drawer-head"><button type="button" class="gms-drawer-back" aria-label="Close GMS summaries" title="Slide summaries back">←</button><div><h2 id="gms-drawer-title">GMS summaries</h2><p>Good Morning ’Stoga</p></div></header><div class="gms-drawer-content"></div>';
    content=dialog.querySelector('.gms-drawer-content');dialog.querySelector('button').onclick=close;
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))close();});
    document.body.append(dialog);document.documentElement.classList.add('gms-drawer-active');dialog.showModal();
    const opened=dialog;render(content,{loading:true});
    requestAnimationFrame(()=>{if(dialog===opened&&!closing)opened.classList.add('is-open');});
    try{await load();if(dialog===opened&&!closing)refresh();}catch{if(dialog===opened&&!closing){content.replaceChildren();const error=document.createElement('p');error.className='gms-drawer-error';error.textContent='Could not load summaries. Close the panel and try again.';content.append(error);}}
  }
  return {open,close,refresh,destroy:finish,isOpen:()=>!!dialog&&!closing};
}
