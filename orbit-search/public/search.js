import { normalizeAddress } from '/address.js';
const status = document.querySelector('#status');
const address = document.querySelector('#address');
let frame, controller, connection, expires = 0;
const connectionId=crypto.randomUUID();
const orbitWindow=parent!==window?parent:window.opener;
const notify=message=>orbitWindow?.postMessage(message,config.parent);
const config = await fetch('/config.json').then(r => r.json());
status.textContent=!orbitWindow?'Open Orbit Search from the Orbit sidebar to connect your account.':'Connecting to your Orbit account…';
let boot;
async function initialize() {
  if (boot) return boot;
  boot = (async () => {
    if (!navigator.serviceWorker || !window.SharedWorker) throw new Error('This browser does not support Orbit Search. Try a current Chrome or Firefox browser.');
    const { ScramjetController } = $scramjetLoadController();
    controller = new ScramjetController({prefix:'/service/', files:{wasm:'/vendor/scramjet/scramjet.wasm.wasm',all:'/vendor/scramjet/scramjet.all.js',sync:'/vendor/scramjet/scramjet.sync.js'}});
    await controller.init();
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
    connection = new BareMux.BareMuxConnection('/vendor/baremux/worker.js');
  })().catch(error => {boot = null; throw error;});
  return boot;
}
window.addEventListener('message', async event => {
  if (event.source !== orbitWindow || event.origin !== config.parent) return;
  if(event.data?.type==='orbit-search-hello'){notify({type:'orbit-search-ready',connectionId});return;}
  if(!['orbit-search-session','orbit-search-account'].includes(event.data?.type))return;
  try {
    let session=event.data;
    if(event.data.type==='orbit-search-account'){
      const response=await fetch('/api/session',{method:'POST',headers:{Authorization:'Bearer '+event.data.accessToken}});
      if(!response.ok)throw new Error('Could not connect your Orbit account. Sign in again and reopen Orbit Search.');
      session=await response.json();
    }
    await initialize();
    const url = new URL('/wisp/', location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('ticket', session.token);
    await connection.setTransport('/vendor/epoxy/index.mjs', [{wisp:url.href}]);
    expires = session.expires;
    status.textContent = 'Ready · Search results and websites open here.';
    notify({type:'orbit-search-connected'});
  } catch (error) {status.textContent = error.message;notify({type:'orbit-search-error',message:error.message});}
});
notify({type:'orbit-search-ready',connectionId});
document.querySelector('#search').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    if (Date.now() >= expires) throw new Error('Connecting to Orbit. If this persists, reopen the Orbit Search tab.');
    const url = normalizeAddress(address.value);
    if (!frame) {
      frame = controller.createFrame();
      frame.frame.title = 'Orbit Search browser';
      // Sites can navigate within the proxy, but cannot replace the surrounding Orbit page.
      frame.frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads');
      frame.addEventListener('urlchange', event => {if (event.url) address.value=String(event.url);});
      document.querySelector('#browser').replaceChildren(frame.frame);
    }
    frame.go(url);
    status.textContent = 'Opening ' + new URL(url).hostname + '…';
    frame.frame.onload = () => {status.textContent = 'Page loaded · Some websites may require a CAPTCHA or refuse proxy access.';};
  } catch (error) {status.textContent = error.message;}
});
for (const [id, method] of [['back','back'],['forward','forward'],['reload','reload']]) {
  document.getElementById(id).onclick = () => {if (frame) frame[method]();};
}
