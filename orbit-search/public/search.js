import { normalizeAddress } from '/address.js';
import { createProxyRuntime } from '/proxy-runtime.js';
const status = document.querySelector('#status');
const address = document.querySelector('#address');
const startAddress=document.querySelector('#start-address');
const welcome=document.querySelector('#welcome'),browserPanel=document.querySelector('#browser');
const tabList=document.querySelector('#tabs');
const tabs=[];let activeTab=null,nextTabId=0;
const siteHelp=document.querySelector('#site-help');
function setStatus(message,state='ready',tab=activeTab){
 if(tab){tab.message=message;tab.state=state;}
 if(!tab||tab===activeTab){status.textContent=message;document.body.dataset.connection=state;}
}
let controller, expires = 0, initialUrlOpened = false;
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
    if(!initialUrlOpened&&typeof event.data.initialUrl==='string'&&event.data.initialUrl){
      const target=new URL(event.data.initialUrl);
      if(['https:','http:'].includes(target.protocol)) {initialUrlOpened=true;navigate(target.href);}
    }
  } catch (error) {setStatus(error.message,'error');notify({type:'orbit-search-error',message:error.message});}
});
notify({type:'orbit-search-ready',connectionId});
function paintTab(tab){
 tab.label.textContent=tab.title;
 tab.button.setAttribute('aria-label',tab.title);
 tab.close.setAttribute('aria-label','Close '+tab.title+' tab');
 tab.element.classList.toggle('is-loading',tab.loading);
}
function syncNavigation(){
 document.querySelector('#back').disabled=!activeTab||activeTab.index<=0;
 document.querySelector('#forward').disabled=!activeTab||activeTab.index>=activeTab.history.length-1;
}
function showActive(){
 const tab=activeTab;if(!tab)return;
 for(const item of tabs){
  const selected=item===tab;item.panel.hidden=!selected;
  item.element.classList.toggle('active-tab',selected);
  item.button.setAttribute('aria-selected',String(selected));item.button.tabIndex=selected?0:-1;
  if(selected)item.label.id='tab-title';else item.label.removeAttribute('id');
 }
 welcome.hidden=!!tab.url;browserPanel.hidden=!tab.url;
 tab.button.setAttribute('aria-controls',tab.url?tab.panel.id:'welcome');welcome.setAttribute('role','tabpanel');welcome.setAttribute('aria-labelledby',tab.id);
 address.value=tab.draft;startAddress.value=tab.startDraft;
 document.body.classList.toggle('browsing',!!tab.url);document.body.classList.toggle('loading',tab.loading);
 siteHelp.hidden=!/^https?:\/\/(?:[a-z0-9-]+\.)?(?:discord\.com|discordapp\.com)(?::\d+)?(?:\/|$)/i.test(tab.url);
 setStatus(tab.message,tab.state,tab);syncNavigation();
}
function selectTab(tab,focus=false){
 if(!tabs.includes(tab))return;activeTab=tab;showActive();
 tab.element.scrollIntoView({block:'nearest',inline:'nearest'});if(focus)tab.button.focus();
}
function closeTab(tab){
 const index=tabs.indexOf(tab);if(index<0)return;
 tabs.splice(index,1);tab.panel.remove();tab.element.remove();
 if(!tabs.length){activeTab=null;addTab();return;}
 if(activeTab===tab)selectTab(tabs[Math.max(0,index-1)],true);
}
function addTab(){
 const id='search-tab-'+(++nextTabId),tab={id,url:'',title:'New search',draft:'',editing:false,startDraft:'',history:[],index:-1,frame:null,loading:false,message:Date.now()<expires?'Ready · Search results and websites open here.':status.textContent,state:Date.now()<expires?'ready':document.body.dataset.connection};
 tab.panel=document.createElement('div');tab.panel.id=id+'-panel';tab.panel.className='browser-tab-panel';tab.panel.hidden=true;tab.panel.setAttribute('role','tabpanel');tab.panel.setAttribute('aria-labelledby',id);
 browserPanel.append(tab.panel);
 tab.element=document.createElement('div');tab.element.className='browser-tab';
 tab.button=document.createElement('button');tab.button.type='button';tab.button.id=id;tab.button.className='tab-select';tab.button.setAttribute('role','tab');tab.button.setAttribute('aria-controls',tab.panel.id);
 tab.button.innerHTML='<img class="tab-logo" src="/orbit-mark.png" width="25" height="18" alt=""><span class="tab-label"></span>';
 tab.label=tab.button.querySelector('.tab-label');
 tab.close=document.createElement('button');tab.close.type='button';tab.close.className='tab-close';tab.close.textContent='×';tab.close.onclick=()=>closeTab(tab);
 tab.button.onclick=()=>selectTab(tab);
 tab.button.onkeydown=event=>{
  let index=tabs.indexOf(tab);
  if(event.key==='ArrowRight')index=(index+1)%tabs.length;else if(event.key==='ArrowLeft')index=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else if(event.key==='Delete'){event.preventDefault();closeTab(tab);return;}else return;
  event.preventDefault();selectTab(tabs[index],true);
 };
 tab.element.append(tab.button,tab.close);tabList.append(tab.element);tabs.push(tab);paintTab(tab);selectTab(tab);startAddress.focus({preventScroll:true});
 return tab;
}
function updateAddress(url,tab=activeTab){
 if(!tab||!tabs.includes(tab))return;
 try{const target=new URL(url);if(!['https:','http:'].includes(target.protocol))return;
  tab.url=target.href;if(!tab.editing)tab.draft=tab.url;tab.title=target.hostname;
  if(tab.history[tab.index]!==tab.url){tab.history.splice(tab.index+1);tab.history.push(tab.url);tab.index=tab.history.length-1;}
  paintTab(tab);if(tab===activeTab)showActive();
 }catch{/* Ignore non-web frame notifications. */}
}
function navigate(value,tab=activeTab){
 try{
  const url=normalizeAddress(value);tab.editing=false;
  if(Date.now()>=expires)throw new Error('Connect to your Orbit account before searching. Reopen Orbit Search if the connection has expired.');
  if(!tab.frame){
   const frame=tab.frame=controller.createFrame();frame.frame.title='Orbit Search browser';
   frame.frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-downloads allow-modals');
   frame.addEventListener('urlchange',event=>{if(tabs.includes(tab)&&event.url)updateAddress(String(event.url),tab);});
   frame.frame.onload=()=>{if(!tabs.includes(tab))return;tab.loading=false;setStatus('Page loaded · Some websites may require a CAPTCHA or refuse proxy access.','ready',tab);paintTab(tab);if(tab===activeTab)showActive();};
   tab.panel.append(frame.frame);
  }
  tab.loading=true;setStatus('Opening '+new URL(url).hostname+'…','loading',tab);updateAddress(url,tab);tab.frame.go(url);
 }catch(error){tab.loading=false;setStatus(error.message,'error',tab);paintTab(tab);if(tab===activeTab)showActive();}
}
address.addEventListener('input',()=>{activeTab.draft=address.value;activeTab.editing=true;});
startAddress.addEventListener('input',()=>{activeTab.startDraft=startAddress.value;});
document.querySelector('#search').addEventListener('submit',event=>{event.preventDefault();navigate(address.value);});
document.querySelector('#start-search').addEventListener('submit',event=>{event.preventDefault();navigate(startAddress.value);});

const shortcutDefaults=[
 {name:'Discord',url:'https://discord.com/app',symbol:'D'},
 {name:'TikTok',url:'https://www.tiktok.com/',symbol:'♪'},
 {name:'X',url:'https://x.com/',symbol:'𝕏'},
 {name:'Instagram',url:'https://www.instagram.com/',symbol:'◎'},
 {name:'Poki',url:'https://poki.com/',symbol:'P'}
];
const shortcutContainer=document.querySelector('#search-shortcuts');
const shortcutEditor=document.querySelector('#shortcut-editor');
const shortcutError=document.querySelector('#shortcut-editor-error');
let shortcutKey='orbit-search-personal-shortcuts',userShortcuts=[];
try{const saved=JSON.parse(localStorage.getItem(shortcutKey)||'[]');if(Array.isArray(saved))userShortcuts=saved.filter(item=>item&&typeof item.name==='string'&&typeof item.url==='string'&&(item.url.startsWith('https://')||item.url.startsWith('http://'))).slice(0,30);}catch{}
function saveUserShortcuts(){if(shortcutKey)try{localStorage.setItem(shortcutKey,JSON.stringify(userShortcuts));}catch{}}
function renderShortcuts(){
 shortcutContainer.replaceChildren();
 for(const item of [...shortcutDefaults,...userShortcuts]){
  const custom=userShortcuts.includes(item);
  const wrap=document.createElement('div');wrap.className='shortcut-entry';
  const button=document.createElement('button');button.type='button';button.className='shortcut';
  button.title='Open '+item.name;
  const icon=document.createElement('span');icon.className='shortcut-icon';icon.setAttribute('aria-hidden','true');icon.textContent=item.symbol||item.name.slice(0,1).toUpperCase();
  const label=document.createElement('span');label.textContent=item.name;
  button.append(icon,label);button.onclick=()=>navigate(item.url);wrap.append(button);
  if(custom){const remove=document.createElement('button');remove.type='button';remove.className='shortcut-delete';remove.textContent='×';remove.setAttribute('aria-label','Remove '+item.name);remove.onclick=()=>{userShortcuts=userShortcuts.filter(x=>x!==item);saveUserShortcuts();renderShortcuts();};wrap.append(remove);}
  shortcutContainer.append(wrap);
 }
 const add=document.createElement('button');add.type='button';add.className='shortcut shortcut-new';
 const icon=document.createElement('span');icon.className='shortcut-icon';icon.textContent='+';
 const label=document.createElement('span');label.textContent='Add shortcut';add.append(icon,label);
 add.onclick=()=>{shortcutEditor.hidden=false;shortcutError.hidden=true;shortcutEditor.elements.name.focus();};
 shortcutContainer.append(add);
}
shortcutEditor.addEventListener('submit',event=>{
 event.preventDefault();shortcutError.hidden=true;
 const name=shortcutEditor.elements.name.value.trim(),value=shortcutEditor.elements.url.value.trim();
 let url;try{url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw Error('protocol');}catch{shortcutError.textContent='Enter a valid http or https URL.';shortcutError.hidden=false;return;}
 if(!name||userShortcuts.length>=30){shortcutError.textContent='Enter a name (up to 30 personal shortcuts).';shortcutError.hidden=false;return;}
 userShortcuts.push({name,url:url.href});saveUserShortcuts();renderShortcuts();shortcutEditor.reset();shortcutEditor.hidden=true;
});
document.querySelector('#shortcut-editor-cancel').onclick=()=>{shortcutEditor.hidden=true;shortcutEditor.reset();shortcutError.hidden=true;};
renderShortcuts();

document.querySelector('#source-link').addEventListener('click',event=>{event.preventDefault();navigate(event.currentTarget.href);});
document.querySelector('#newtab').onclick=()=>addTab();
document.querySelector('#back').onclick=()=>{if(activeTab.index>0){activeTab.index--;navigate(activeTab.history[activeTab.index]);}};
document.querySelector('#forward').onclick=()=>{if(activeTab.index<activeTab.history.length-1){activeTab.index++;navigate(activeTab.history[activeTab.index]);}};
document.querySelector('#reload').onclick=()=>{
 const tab=activeTab;if(tab.frame){tab.loading=true;setStatus('Reloading '+new URL(tab.url).hostname+'…','loading',tab);paintTab(tab);showActive();tab.frame.reload();}else startAddress.focus();
};
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();address.focus();address.select();}});
addTab();
