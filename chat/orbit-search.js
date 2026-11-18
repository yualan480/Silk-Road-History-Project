export function renderOrbitSearch(main, {sb, menuBtn, bindMenu}) {
  if (main.querySelector('[data-orbit-search]')) return;
  main.innerHTML = `<div class="top">${menuBtn()}<b class="title">Orbit Search</b></div><section data-orbit-search style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%"><div data-search-notice style="padding:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span role="status">Starting Orbit Search… Render may take a minute to wake up.</span><button type="button" class="btn ghost" data-search-retry hidden style="width:auto;display:none">Retry connection</button></div></section>`;
  bindMenu();
  const container = main.querySelector('[data-orbit-search]');
  const notice = container.querySelector('[data-search-notice]');
  const status = notice.querySelector('[role=status]');
  const retry = notice.querySelector('button');
  let refreshTimer, helloTimer, timeout, listener, stopped=false, inFlight;
  const pending = new AbortController();
  function cleanup() {
    stopped=true;pending.abort();clearInterval(refreshTimer);clearInterval(helloTimer);clearTimeout(timeout);
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
    const origin = new URL(url).origin;
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
    frame.style.cssText = 'border:0;width:100%;flex:1;min-height:480px;background:#080d32';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads');
    status.textContent='Connecting your Orbit account…';
    async function connect() {
      if(stopped||!container.isConnected)return;
      if(inFlight)return inFlight;
      inFlight=(async()=>{
        const {data} = await sb.auth.getSession();
        if (!data.session) throw new Error('Sign in to Orbit to use Orbit Search.');
        const res = await fetch(origin + '/api/session', {method:'POST',signal:pending.signal,headers:{Authorization:'Bearer '+data.session.access_token}});
        if (!res.ok) throw new Error(res.status === 401 ? 'Your Orbit session expired. Sign in again.' : 'Orbit Search could not connect. Retry the connection.');
        const session = await res.json();
        if(!stopped)frame.contentWindow.postMessage({type:'orbit-search-session',...session},origin);
      })().finally(()=>{inFlight=null;});
      return inFlight;
    }
    let sessionStarted=false;
    listener = event => {
      if(stopped||event.origin!==origin||event.source!==frame.contentWindow)return;
      if(event.data?.type==='orbit-search-ready'&&!sessionStarted) {sessionStarted=true;clearInterval(helloTimer);connect().catch(error=>fail(error.message));}
      if(event.data?.type==='orbit-search-connected') {
        clearTimeout(timeout);clearInterval(helloTimer);notice.hidden=true;notice.style.display='none';
      }
      if(event.data?.type==='orbit-search-error') fail(String(event.data.message||'Orbit Search could not initialize.'));
    };
    window.addEventListener('message',listener);
    container.append(frame);
    const hello=()=>frame.contentWindow.postMessage({type:'orbit-search-hello'},origin);
    frame.onload=hello;
    helloTimer=setInterval(hello,5000);
    timeout=setTimeout(()=>fail('Your browser could not connect the embedded search page. Retry here. If it remains blocked, check browser extensions or network filtering.'),45000);
    refreshTimer=setInterval(()=>connect().catch(error=>fail(error.message)),20*60*1000);
  })().catch(error=>{if(!stopped)fail(error.message);});
}
