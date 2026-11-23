import {createProxyRuntime} from './proxy-runtime.js?v=2';
const status=document.querySelector('#site-status'),container=document.querySelector('#site');
let guestId;try{guestId=sessionStorage.getItem('orbit-search-guest');}catch{}
if(!/^[a-f0-9-]{36}$/i.test(guestId||'')){guestId=crypto.randomUUID();try{sessionStorage.setItem('orbit-search-guest',guestId);}catch{}}
const runtime=createProxyRuntime();
async function session(){
 const response=await fetch('/api/guest-session',{method:'POST',headers:{'X-Orbit-Guest-ID':guestId}});
 const data=await response.json();if(!response.ok)throw new Error(data.message||'The proxy could not connect. Reload to retry.');
 return data;
}
function fail(error){status.hidden=false;status.textContent=error.message||'Could not load the website through the proxy. Reload to retry.';}
try{
 const connection=await session(),controller=await runtime.connect(connection.token);
 let activeTicket=connection.token;
 const frame=controller.createFrame();frame.frame.title='Orbit';
 frame.frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox');
 frame.frame.setAttribute('allow','autoplay; fullscreen');frame.frame.allowFullscreen=true;
 frame.frame.onload=()=>{status.hidden=true;};container.append(frame.frame);
 status.textContent='Loading website through the proxy…';frame.go(connection.target);
 setInterval(async()=>{try{const renewed=await session();if(renewed.token!==activeTicket){await runtime.connect(renewed.token);activeTicket=renewed.token;}}catch(error){fail(error);}},15*60*1000);
}catch(error){fail(error);}
