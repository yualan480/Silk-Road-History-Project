export function renderOrbitSearch(main) {
  if(main.querySelector('[data-orbit-search]'))return;
  main.innerHTML='<section data-orbit-search style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%;width:100%"></section>';
  const container=main.querySelector('[data-orbit-search]');
  const frame=document.createElement('iframe');
  frame.title='Orbit';frame.src='https://orbitsearch.onrender.com/';frame.referrerPolicy='no-referrer';
  frame.style.cssText='display:block;border:0;width:100%;flex:1;min-height:0;background:#080d32';
  frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox');
  frame.setAttribute('allow','autoplay; fullscreen');frame.allowFullscreen=true;
  container.append(frame);
  // Enter during the tab click when allowed; Escape remains the browser's exit.
  if(navigator.userActivation?.isActive&&!document.fullscreenElement){try{main.requestFullscreen?.().catch(()=>{});}catch{}}
  const observer=new MutationObserver(()=>{if(!container.isConnected){observer.disconnect();if(document.fullscreenElement===main)document.exitFullscreen?.().catch(()=>{});}});
  observer.observe(main,{childList:true});
}
