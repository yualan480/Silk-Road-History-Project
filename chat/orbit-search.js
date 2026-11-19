export function renderOrbitSearch(main, {sb, menuBtn, bindMenu}, externalWindow = null) {
  if (main.querySelector('[data-orbit-search]')) return;
  main.innerHTML = `<div class="top search-shell-top">${menuBtn()}<b class="title">Orbit Search</b><span class="grow"></span><button type="button" class="btn ghost" data-search-fullscreen style="width:auto">Fullscreen</button></div><section data-orbit-search style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%"><div data-search-notice style="padding:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button type="button" class="btn ghost" data-search-window disabled style="width:auto">Open search window</button><span role="status">Starting Orbit Search… Render may take a minute to wake up.</span><button type="button" class="btn ghost" data-search-retry hidden style="width:auto;display:none">Retry connection</button></div></section>`;
  bindMenu();
  const container = main.querySelector('[data-orbit-search]');
  // Personal shortcuts live below the search iframe, never inside the remote search service.
  const shortcutsStyle = document.createElement('style');
  shortcutsStyle.textContent = `
    .orbit-search-shortcuts{flex:none;padding:10px 14px 12px;background:#0b1539;border-top:1px solid #34416d;color:#f4f6ff;font:14px system-ui,sans-serif}
    .orbit-search-shortcuts .shortcut-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:9px;font-weight:700}
    .orbit-search-shortcuts .shortcut-list{display:flex;flex-wrap:wrap;gap:8px;max-height:104px;overflow-y:auto}
    .orbit-search-shortcuts .shortcut-item{display:inline-flex;align-items:center;gap:5px;background:#202e5b;border:1px solid #485b92;border-radius:10px;padding:5px 8px}
    .orbit-search-shortcuts a{color:#fff;text-decoration:none;font-weight:600}
    .orbit-search-shortcuts .shortcut-remove{border:0;background:transparent;color:#bfc9ee;cursor:pointer;font-size:16px}
    .orbit-search-shortcuts button.shortcut-add{background:#334b92;border:1px solid #6a84cf;border-radius:8px;color:white;padding:6px 10px;cursor:pointer}
    .orbit-search-shortcuts .shortcut-form{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
    .orbit-search-shortcuts .shortcut-form[hidden]{display:none}
    .orbit-search-shortcuts input{min-width:110px;flex:1;background:#0d1940;color:white;border:1px solid #667bb1;border-radius:7px;padding:7px}
    .orbit-search-shortcuts .shortcut-error{color:#ffb5b5;margin-top:5px}
  `;
  main.append(shortcutsStyle);
  const defaultShortcuts = [
    {name:'Discord',url:'https://discord.com/app'},
    {name:'TikTok',url:'https://www.tiktok.com/'},
    {name:'X',url:'https://x.com/'},
    {name:'Instagram',url:'https://www.instagram.com/'},
    {name:'Poki',url:'https://poki.com/'}
  ];
  const shortcutBar = document.createElement('div');
  shortcutBar.className='orbit-search-shortcuts';
  shortcutBar.innerHTML = `<div class="shortcut-heading"><span>Shortcuts</span><button class="shortcut-add" type="button" data-add-shortcut>+ Add shortcut</button></div>
    <div class="shortcut-list" data-shortcut-list></div>
    <form class="shortcut-form" data-shortcut-form hidden><input name="name" maxlength="32" placeholder="Website name" aria-label="Shortcut name" required><input name="url" type="url" placeholder="https://example.com" aria-label="Website URL" required><button class="shortcut-add" type="submit">Save</button><button class="shortcut-add" type="button" data-shortcut-cancel>Cancel</button></form>
    <div class="shortcut-error" data-shortcut-error role="alert" hidden></div>`;
  container.append(shortcutBar);
  let shortcutStorageKey = null;
  let customShortcuts = [];
  const shortcutList = shortcutBar.querySelector('[data-shortcut-list]');
  const shortcutForm = shortcutBar.querySelector('[data-shortcut-form]');
  const shortcutError = shortcutBar.querySelector('[data-shortcut-error]');
  const displayShortcuts = () => {
    shortcutList.replaceChildren();
    for (const [i,item] of [...defaultShortcuts,...customShortcuts].entries()) {
      const wrap=document.createElement('span');wrap.className='shortcut-item';
      const a=document.createElement('a');a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.name;wrap.append(a);
      if(i>=defaultShortcuts.length) {
        const remove=document.createElement('button');remove.type='button';remove.className='shortcut-remove';remove.textContent='×';remove.setAttribute('aria-label','Remove '+item.name);
        remove.onclick=()=>{customShortcuts.splice(i-defaultShortcuts.length,1);saveShortcuts();displayShortcuts();};wrap.append(remove);
      }
      shortcutList.append(wrap);
    }
  };
  const saveShortcuts=()=>{if(shortcutStorageKey)try{localStorage.setItem(shortcutStorageKey,JSON.stringify(customShortcuts));}catch{}};
  sb.auth.getUser().then(({data})=>{
    if(!container.isConnected||!data?.user?.id)return;
    shortcutStorageKey='orbit-search-shortcuts:'+data.user.id;
    try { const saved=JSON.parse(localStorage.getItem(shortcutStorageKey)||'[]');if(Array.isArray(saved))customShortcuts=saved.filter(x=>x&&typeof x.name==='string'&&typeof x.url==='string'&&/^https:\/\//i.test(x.url)).slice(0,30); }catch{}
    displayShortcuts();
  }).catch(()=>{});
  shortcutBar.querySelector('[data-add-shortcut]').onclick=()=>{shortcutForm.hidden=false;shortcutError.hidden=true;shortcutForm.elements.name.focus();};
  shortcutBar.querySelector('[data-shortcut-cancel]').onclick=()=>{shortcutForm.hidden=true;shortcutForm.reset();shortcutError.hidden=true;};
  shortcutForm.onsubmit=e=>{
    e.preventDefault();shortcutError.hidden=true;
    const name=shortcutForm.elements.name.value.trim(),raw=shortcutForm.elements.url.value.trim();
    let url;try{url=new URL(raw);if(!['https:','http:'].includes(url.protocol))throw Error('protocol');}catch{shortcutError.textContent='Enter a valid http or https website URL.';shortcutError.hidden=false;return;}
    if(!name||customShortcuts.length>=30){shortcutError.textContent='Enter a name (maximum 30 personal shortcuts).';shortcutError.hidden=false;return;}
    customShortcuts.push({name,url:url.href});saveShortcuts();displayShortcuts();shortcutForm.reset();shortcutForm.hidden=true;
  };
  displayShortcuts();

  const fullscreen = main.querySelector('[data-search-fullscreen]');
  const syncFullscreen=()=>{fullscreen.textContent=document.fullscreenElement===main?'Exit fullscreen':'Fullscreen';fullscreen.setAttribute('aria-pressed',String(document.fullscreenElement===main));};
  fullscreen.onclick=()=>{try{const result=document.fullscreenElement===main?document.exitFullscreen?.():main.requestFullscreen?.();result?.catch(()=>{});}catch{}};
  document.addEventListener('fullscreenchange',syncFullscreen);syncFullscreen();
  // Request during the tab click, before any network await consumes user activation.
  if(!externalWindow&&navigator.userActivation?.isActive&&!document.fullscreenElement)fullscreen.click();
  const notice = container.querySelector('[data-search-notice]');
  const status = notice.querySelector('[role=status]');
  const retry = notice.querySelector('[data-search-retry]');
  const openWindow = notice.querySelector('[data-search-window]');
  let searchOrigin;
  openWindow.onclick=()=>{
    if(externalWindow&&!externalWindow.closed){externalWindow.focus();return;}
    const popup=window.open(searchOrigin+'/#orbit-window','_blank');
    if(!popup){status.textContent='Your browser blocked the new window. Allow popups for this site, then click Open search window again.';return;}
    observer.disconnect();cleanup();container.remove();renderOrbitSearch(main,{sb,menuBtn,bindMenu},popup);
  };
  let refreshTimer, helloTimer, timeout, listener, stopped=false, inFlight;
  const pending = new AbortController();
  function cleanup() {
    stopped=true;pending.abort();
    document.removeEventListener('fullscreenchange',syncFullscreen);
    if(document.fullscreenElement===main)document.exitFullscreen?.().catch(()=>{});clearInterval(refreshTimer);clearInterval(helloTimer);clearTimeout(timeout);
    if(listener)window.removeEventListener('message',listener);
  }
  const observer = new MutationObserver(() => {if (!container.isConnected) {cleanup();observer.disconnect();}});
  observer.observe(main,{childList:true});
  const fail = message => {
    cleanup();
    if (!container.isConnected) return;
    notice.hidden=false;notice.style.display='flex';status.textContent=message;retry.hidden=false;retry.style.display='inline-flex';
  };
  retry.onclick=()=>{observer.disconnect();cleanup();container.remove();renderOrbitSearch(main,{sb,menuBtn,bindMenu});};
  (async () => {
    const response = await fetch('/orbit-search/config', {cache:'no-store',signal:pending.signal});
    const {url} = await response.json();
    if (!url) throw new Error('Orbit Search is being set up. The site owner needs to connect its dedicated search service in Render.');
    const origin = new URL(url).origin;searchOrigin=origin;openWindow.disabled=false;
    if (origin === location.origin) throw new Error('Orbit Search needs a separate origin from Orbit.');
    // Wait for the application, rather than embedding Render's cold-start interstitial.
    const deadline=Date.now()+90000;
    while (!stopped) {
      const ready=await fetch('/orbit-search/ready',{cache:'no-store',signal:pending.signal}).then(r=>r.json());
      if (ready.ready) {
        if (ready.parent!==location.origin) throw new Error('The search service is configured for a different website. Set ORBIT_SEARCH_PARENT_ORIGIN to '+location.origin+' on the search service, then redeploy it.');
        break;
      }
      if(Date.now()>=deadline) throw new Error('The search service is still starting. Wait a minute, then retry.');
      await new Promise(resolve=>{const delay=setTimeout(resolve,2000);pending.signal.addEventListener('abort',()=>{clearTimeout(delay);resolve();},{once:true});});
    }
    if(stopped||!container.isConnected)return;
    const frame = document.createElement('iframe');
    frame.title = 'Orbit Search'; frame.src = origin + '/';
    frame.style.cssText = 'border:0;width:100%;flex:1;min-height:0;background:#080d32';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals');
    const peer=()=>externalWindow||frame.contentWindow;
    status.textContent=externalWindow?'Connecting the search window to your Orbit account…':'Connecting your Orbit account…';
    async function connect() {
      if(stopped||!container.isConnected)return;
      if(inFlight)return inFlight;
      inFlight=(async()=>{
        const {data} = await sb.auth.getSession();
        if (!data.session) throw new Error('Sign in to Orbit to use Orbit Search.');
        // Authenticate inside the search origin so browsers need no cross-site API request from Orbit.
        if(!stopped)peer().postMessage({type:'orbit-search-account',accessToken:data.session.access_token},origin);
      })().finally(()=>{inFlight=null;});
      return inFlight;
    }
    let sessionStarted=null;
    listener = event => {
      if(stopped||event.origin!==origin||event.source!==peer())return;
      if(event.data?.type==='orbit-search-ready'&&sessionStarted!==(event.data.connectionId||'initial')) {sessionStarted=event.data.connectionId||'initial';clearInterval(helloTimer);connect().catch(error=>fail(error.message));}
      if(event.data?.type==='orbit-search-connected') {
        clearTimeout(timeout);clearInterval(helloTimer);
        if(externalWindow){status.textContent='Search is connected in the separate window. Keep this Orbit tab open to stay connected.';openWindow.textContent='Return to search window';}
        else {notice.hidden=true;notice.style.display='none';}
      }
      if(event.data?.type==='orbit-search-error') fail(String(event.data.message||'Orbit Search could not initialize.'));
    };
    window.addEventListener('message',listener);
    if(!externalWindow)container.insertBefore(frame,shortcutBar);
    const hello=()=>peer().postMessage({type:'orbit-search-hello'},origin);
    frame.onload=hello;hello();
    helloTimer=setInterval(hello,5000);
    timeout=setTimeout(()=>fail('The embedded page could not connect. Click Open search window to connect outside the iframe, or retry here.'),45000);
    refreshTimer=setInterval(()=>connect().catch(error=>fail(error.message)),20*60*1000);
  })().catch(error=>{if(!stopped)fail(error.message);});
}
