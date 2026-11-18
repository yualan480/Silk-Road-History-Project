export function renderOrbitSearch(main, {sb, menuBtn, bindMenu}) {
  if (main.querySelector('[data-orbit-search]')) return;
  main.innerHTML = `<div class="top">${menuBtn()}<b class="title">Orbit Search</b></div><section data-orbit-search style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%"><p role="status" style="padding:20px">Connecting to Orbit Search…</p></section>`;
  bindMenu();
  const container = main.querySelector('[data-orbit-search]');
  let timer;
  let listener;
  let startupTimeout;
  const fail = message => { clearInterval(timer);clearTimeout(startupTimeout);if(listener)window.removeEventListener('message',listener);if (container.isConnected) {container.replaceChildren(); const p = document.createElement('p'); p.style.padding = '24px'; p.textContent = message; container.append(p);} };
  (async () => {
    const response = await fetch('/orbit-search/config', {cache:'no-store'});
    const {url} = await response.json();
    if (!url) return fail('Orbit Search is being set up. The site owner needs to connect its dedicated search service in Render.');
    const origin = new URL(url).origin;
    if (origin === location.origin) throw new Error('Orbit Search needs a separate origin from Orbit.');
    const frame = document.createElement('iframe');
    frame.title = 'Orbit Search'; frame.src = origin + '/';
    frame.style.cssText = 'border:0;width:100%;flex:1;min-height:480px;background:#080d32';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads');
    async function connect() {
      if (!container.isConnected) {clearInterval(timer);window.removeEventListener('message',listener);return;}
      const {data} = await sb.auth.getSession();
      if (!data.session) throw new Error('Sign in to Orbit to use Orbit Search.');
      const res = await fetch(origin + '/api/session', {method:'POST', headers:{Authorization:'Bearer '+data.session.access_token}});
      if (!res.ok) throw new Error(res.status === 401 ? 'Your Orbit session expired. Sign in again.' : 'Orbit Search could not connect. Try reopening this tab.');
      const session = await res.json();
      frame.contentWindow.postMessage({type:'orbit-search-session', ...session},origin);
    }
    listener = event => {
      if (event.origin !== origin || event.source !== frame.contentWindow || event.data?.type !== 'orbit-search-ready') return;
      clearTimeout(startupTimeout);
      connect().catch(error => fail(error.message));
    };
    window.addEventListener('message',listener);
    container.replaceChildren(frame);
    startupTimeout=setTimeout(()=>fail('Orbit Search did not respond. Its Render service may be starting; try reopening this tab in a minute.'),90000);
    timer = setInterval(() => connect().catch(error => fail(error.message)), 20*60*1000);
    const observer = new MutationObserver(() => {if (!container.isConnected) {clearInterval(timer);clearTimeout(startupTimeout);window.removeEventListener('message',listener);observer.disconnect();}});
    observer.observe(main,{childList:true});
  })().catch(error => fail(error.message));
}
