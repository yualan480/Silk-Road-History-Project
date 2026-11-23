export function renderOrbitSearch(main, {menuBtn, bindMenu}) {
  if(main.querySelector('[data-orbit-search]'))return;
  const site='https://orbitsearch.onrender.com/';
  main.innerHTML=`<div class="top search-shell-top">${menuBtn()}<b class="title">Orbit Search</b><span class="grow"></span><a class="btn ghost" href="${site}" target="_blank" rel="noopener noreferrer" style="width:auto">Open site</a><button type="button" class="btn ghost" data-search-fullscreen style="width:auto">Fullscreen</button></div><section data-orbit-search style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%"><p data-search-loading role="status" style="padding:12px;margin:0">Loading site…</p></section>`;
  bindMenu();
  const container=main.querySelector('[data-orbit-search]'),button=main.querySelector('[data-search-fullscreen]');
  const frame=document.createElement('iframe');
  frame.title='Orbit Search website';frame.src=site;frame.referrerPolicy='no-referrer';
  frame.style.cssText='border:0;width:100%;flex:1;min-height:0;background:#080d32';
  frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox');
  frame.setAttribute('allow','autoplay; fullscreen');frame.allowFullscreen=true;
  frame.onload=()=>{const notice=container.querySelector('[data-search-loading]');if(notice)notice.hidden=true;};
  container.append(frame);
  const sync=()=>{button.textContent=document.fullscreenElement===main?'Exit fullscreen':'Fullscreen';button.setAttribute('aria-pressed',String(document.fullscreenElement===main));};
  button.onclick=()=>{try{const result=document.fullscreenElement===main?document.exitFullscreen?.():main.requestFullscreen?.();result?.catch(()=>{});}catch{}};
  document.addEventListener('fullscreenchange',sync);sync();
  if(navigator.userActivation?.isActive&&!document.fullscreenElement)button.click();
  const observer=new MutationObserver(()=>{if(!container.isConnected){document.removeEventListener('fullscreenchange',sync);observer.disconnect();if(document.fullscreenElement===main)document.exitFullscreen?.().catch(()=>{});}});
  observer.observe(main,{childList:true});
}
