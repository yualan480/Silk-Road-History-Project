import { normalizeAddress } from '/address.js';
import { createProxyRuntime } from '/proxy-runtime.js';
const status = document.querySelector('#status');
const address = document.querySelector('#address');
const startAddress=document.querySelector('#start-address');
const welcome=document.querySelector('#welcome'),browserPanel=document.querySelector('#browser');
const tabTitle=document.querySelector('#tab-title');
const siteHelp=document.querySelector('#site-help');
function setStatus(message,state='ready'){status.textContent=message;document.body.dataset.connection=state;}
let frame, controller, expires = 0;
const connectionId=crypto.randomUUID();
const orbitWindow=parent!==window?parent:window.opener;
const notify=message=>orbitWindow?.postMessage(message,config.parent);
const config = await fetch('/config.json').then(r => r.json());
setStatus(!orbitWindow?'Open Orbit Search from the Orbit sidebar to connect your account.':'Connecting to your Orbit account…','connecting');
const runtime=createProxyRuntime();
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
    controller=await runtime.connect(session.token);
    expires = session.expires;
    setStatus('Ready · Search results and websites open here.');
    notify({type:'orbit-search-connected'});
  } catch (error) {setStatus(error.message,'error');notify({type:'orbit-search-error',message:error.message});}
});
notify({type:'orbit-search-ready',connectionId});
let history=[],historyIndex=-1,currentUrl='';
function syncNavigation(){document.querySelector('#back').disabled=historyIndex<=0;document.querySelector('#forward').disabled=historyIndex>=history.length-1;}
function updateAddress(url){
  try{const target=new URL(url);if(!['https:','http:'].includes(target.protocol))return;currentUrl=target.href;address.value=currentUrl;tabTitle.textContent=target.hostname;
    siteHelp.hidden=!(target.hostname==='discord.com'||target.hostname.endsWith('.discord.com')||target.hostname==='discordapp.com'||target.hostname.endsWith('.discordapp.com'));
    if(history[historyIndex]!==currentUrl){history.splice(historyIndex+1);history.push(currentUrl);historyIndex=history.length-1;}syncNavigation();
  }catch{/* Ignore non-web notifications from an unloaded frame. */}
}
function navigate(value){
  try{
    const url=normalizeAddress(value);
    if(Date.now()>=expires)throw new Error('Connect to your Orbit account before searching. Reopen Orbit Search if the connection has expired.');
    if(!frame){
      frame=controller.createFrame();frame.frame.title='Orbit Search browser';
      frame.frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-downloads');
      const opened=frame;
      frame.addEventListener('urlchange',event=>{if(frame===opened&&event.url)updateAddress(String(event.url));});
      frame.frame.onload=()=>{if(frame!==opened)return;document.body.classList.remove('loading');setStatus('Page loaded · Some websites may require a CAPTCHA or refuse proxy access.');};
      browserPanel.replaceChildren(frame.frame);
    }
    welcome.hidden=true;browserPanel.hidden=false;document.body.classList.add('browsing','loading');
    updateAddress(url);setStatus('Opening '+new URL(url).hostname+'…','loading');frame.go(url);
  }catch(error){document.body.classList.remove('loading');setStatus(error.message,'error');}
}
document.querySelector('#search').addEventListener('submit',event=>{event.preventDefault();navigate(address.value);});
document.querySelector('#start-search').addEventListener('submit',event=>{event.preventDefault();navigate(startAddress.value);});
document.querySelectorAll('[data-url]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.url)));
document.querySelector('#source-link').addEventListener('click',event=>{event.preventDefault();navigate(event.currentTarget.href);});
document.querySelector('#newtab').onclick=()=>{
  if(frame){frame.frame.remove();frame=null;}browserPanel.replaceChildren();browserPanel.hidden=true;welcome.hidden=false;siteHelp.hidden=true;history=[];historyIndex=-1;currentUrl='';address.value=startAddress.value='';tabTitle.textContent='New search';syncNavigation();document.body.classList.remove('browsing','loading');setStatus(Date.now()<expires?'Ready · Search results and websites open here.':'Open Orbit Search from the Orbit sidebar to connect your account.',Date.now()<expires?'ready':'connecting');startAddress.focus({preventScroll:true});
};
document.querySelector('#back').onclick=()=>{if(historyIndex>0){historyIndex--;navigate(history[historyIndex]);}};
document.querySelector('#forward').onclick=()=>{if(historyIndex<history.length-1){historyIndex++;navigate(history[historyIndex]);}};
document.querySelector('#reload').onclick=()=>{if(frame){document.body.classList.add('loading');setStatus('Reloading '+new URL(currentUrl).hostname+'…','loading');frame.reload();}else startAddress.focus();};
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();address.focus();address.select();}});
