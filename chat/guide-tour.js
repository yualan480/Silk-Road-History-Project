const STEPS=[
 ['#oq','Find your way','Search for people, channels, and pages from here.'],
 ['.home-theme-slot','Make Orbit yours','Preview themes here and use your Orbits to purchase a look you like.'],
 ['.nav-grp-h[data-social]','Stay connected','Open Orbit Social for friends, direct messages, and communities.'],
 ['.nav-grp-h[data-fun]','Games and more','Open Explore to find games, the shop, and other activities.'],
 ['.side .scroll','Join a conversation','Choose a channel to read messages and join the conversation.'],
 ['.side .me','Your profile and settings','Your profile, Orbits balance, and settings are here. You can replay this tour in Settings.']
];
export function createGuideTour({portrait,onFinish}){
 let dialog=null,index=0,who=null,previous=null,wasOpen=false,raf=0,observer=null;
 const mobile=()=>matchMedia('(max-width:800px)').matches;
 function finish(result){
  if(!dialog)return;
  observer?.disconnect();observer=null;cancelAnimationFrame(raf);window.removeEventListener('resize',position);
  document.removeEventListener('scroll',position,true);
  const d=dialog;dialog=null;d.close();d.remove();
  document.querySelector('#app')?.classList.remove('guide-tour-open');
  document.querySelector('#app')?.classList.toggle('open',wasOpen);
  if(previous?.isConnected)previous.focus({preventScroll:true});
  if(result)onFinish(result);
 }
 function position(){
  if(!dialog)return;
  const target=document.querySelector(STEPS[index][0]);
  const ring=dialog.querySelector('.guide-tour-focus'),card=dialog.querySelector('.guide-tour-card');
  const rect=target?.getBoundingClientRect();
  const visible=rect&&rect.width>0&&rect.height>0;
  ring.hidden=!visible;
  const width=innerWidth,height=innerHeight,cw=card.offsetWidth,ch=card.offsetHeight;
  const x=visible?Math.max(12,Math.min(width-cw-12,rect.left+rect.width/2-cw/2)):(width-cw)/2;
  let y=visible?rect.bottom+22:Math.max(12,(height-ch)/2);
  if(y+ch>height-12)y=visible&&rect.top-ch-22>=12?rect.top-ch-22:Math.max(12,height-ch-12);
  card.style.left=x+'px';card.style.top=y+'px';
  const arrow=dialog.querySelector('svg');arrow.hidden=!visible;
  if(visible){
   Object.assign(ring.style,{left:Math.max(2,rect.left-4)+'px',top:Math.max(2,rect.top-4)+'px',width:Math.min(width-4,rect.width+8)+'px',height:Math.min(height-4,rect.height+8)+'px'});
   const tx=Math.max(8,Math.min(width-8,rect.left+rect.width/2));
   const below=y>=rect.bottom;
   const fromY=below?y-2:y+ch+2,toY=below?rect.bottom+7:rect.top-7;
   const angle=Math.atan2(toY-fromY,tx-(x+cw/2));
   const wing=a=>`${tx-9*Math.cos(a)} ${toY-9*Math.sin(a)}`;
   arrow.querySelector('path').setAttribute('d',`M ${x+cw/2} ${fromY} L ${tx} ${toY} M ${wing(angle-.55)} L ${tx} ${toY} L ${wing(angle+.55)}`);
  }
 }
 function show(){
  if(mobile())document.querySelector('#app')?.classList.toggle('open',index>=2);
  const step=STEPS[index];
  dialog.querySelector('[data-title]').textContent=step[1];
  dialog.querySelector('[data-copy]').textContent=step[2];
  dialog.querySelector('[data-count]').textContent=`${index+1} of ${STEPS.length}`;
  dialog.querySelector('[data-back]').disabled=index===0;
  dialog.querySelector('[data-next]').textContent=index===STEPS.length-1?'Finish':'Next';
  document.querySelector(step[0])?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  position();cancelAnimationFrame(raf);raf=requestAnimationFrame(position);
 }
 return {get active(){return !!dialog;},stop(){finish();},start(guide){
  finish();who=guide;index=0;previous=document.activeElement;
  wasOpen=document.querySelector('#app')?.classList.contains('open')||false;
  const d=document.createElement('dialog');dialog=d;d.className='guide-tour';
  d.setAttribute('aria-labelledby','guide-tour-title');
  d.innerHTML=`<div class="guide-tour-focus" aria-hidden="true"></div><svg aria-hidden="true"><path fill="none" stroke="#b8d5ff" stroke-width="2"/></svg><section class="guide-tour-card">${portrait(who,'happy')}<span class="guide-tour-name">${who==='elara'?'Elara':'Stellan'} · Your Orbit tour</span><span data-count></span><div aria-live="polite" aria-atomic="true"><h2 id="guide-tour-title" data-title></h2><p data-copy></p></div><footer><button type="button" data-skip>Skip tour</button><button type="button" data-back>Back</button><button type="button" class="orbit-guide-primary" data-next>Next</button></footer></section>`;
  d.querySelector('[data-next]').onclick=()=>{if(index===STEPS.length-1)finish('completed');else{index++;show();}};
  d.querySelector('[data-back]').onclick=()=>{if(index){index--;show();}};
  d.querySelector('[data-skip]').onclick=()=>finish('skipped');
  d.addEventListener('cancel',event=>{event.preventDefault();finish('skipped');});
  document.querySelector('#app')?.classList.add('guide-tour-open');
  document.body.append(d);d.showModal();show();d.querySelector('[data-next]').focus({preventScroll:true});
  window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
  observer=new MutationObserver(()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(position);});
  observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
 }};
}
