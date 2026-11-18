export function orbitProfileName(profile){
 const full=[profile?.first_name,profile?.last_name].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 return full||String(profile?.display_name||profile?.name||'Orbit player').trim();
}
export function createSubwayLeaderboard({rpc,getUser,getProfile=async user=>user,status,storage}) {
  let pending=Promise.resolve(),profile=null,gameUser=null;
  const localBest=new Map();
  async function identify(){
    const user=await getUser();
    if(!user){profile=null;if(gameUser){gameUser.name='Orbit player';gameUser.nameSet=true;}return null;}
    let details;try{details=await getProfile(user);}catch{details=user;}
    profile={id:user.id,name:orbitProfileName(details),image:profileAvatar(details),avatar_color:details?.avatar_color};
    if(gameUser){gameUser.name=profile.name;gameUser.nameSet=true;gameUser.image=profile.image;gameUser.save?.();}
    return user;
  }
  function ownRow(user){return [{name:profile?.name||'Orbit player',image:profile?.image||'icon_friend',score:Math.max(read(user.id),localBest.get(user.id)||0),index:'—',highlight:true}];}
  const key=id=>'orbit-subway-pending:'+id;
  const read=id=>{try{return Number(storage.getItem(key(id)))||0;}catch{return 0;}};
  const write=(id,n)=>{try{if(n)storage.setItem(key(id),String(n));else storage.removeItem(key(id));}catch{}};
  async function upload(user,score){
    const best=Math.max(score,read(user.id));if(!best)return;
    write(user.id,best);status('Saving Orbit score…');
    await rpc('submit_subway_score',{p_score:best});
    if(read(user.id)<=best)write(user.id,0);
    status('Score saved to Orbit');
  }
  function submit(score){
    if(!Number.isSafeInteger(score)||score<1||score>2147483647)return Promise.resolve();
    pending=pending.then(async()=>{const user=await identify();if(!user){status('Log in to Orbit to save your score.');return;}localBest.set(user.id,Math.max(localBest.get(user.id)||0,score));await upload(user,score);}).catch(()=>status('Score not uploaded yet. We’ll retry when you reconnect.'));
    return pending;
  }
  async function getLeaderboard(limit=11){
    await pending;
    let user;
    try{
      user=await identify();if(!user){status('Log in to Orbit to see player rankings.');return [];}
      try{await upload(user,0);}catch{status('Your score is waiting to upload.');}
      const rows=await rpc('get_subway_leaderboard',{p_limit:limit});
      if(!Array.isArray(rows))throw Error('Invalid leaderboard');
      status(rows.length?'Orbit players · best scores':'Your Orbit profile · finish a run to join the rankings.');
      if(!rows.length)return ownRow(user);
      return rows.map(row=>({name:row.user_id===user.id?profile.name:String(row.name||'Orbit player'),score:Number(row.score)||0,index:Number(row.rank),highlight:row.user_id===user.id,image:row.user_id===user.id?profile.image:profileAvatar({...row,display_name:row.name})}));
    }catch{status(user?'Showing your local score. Orbit rankings unavailable; retry later.':'Log in to Orbit to load your profile and rankings.');return user?ownRow(user):[];}
  }
  return {submit,getLeaderboard,get profile(){return profile;},bindUser:async user=>{gameUser=user;try{await identify();}catch{status('Could not load your Orbit profile.');}}};
}
function profileAvatar(profile){
 const image=safeAvatar(profile?.avatar_url);if(image!=='icon_friend')return image;
 const color=/^#[0-9a-f]{6}$/i.test(profile?.avatar_color||'')?profile.avatar_color:'#6d5efc';
 const initial=String(profile?.display_name||orbitProfileName(profile)||'?').slice(0,1).toUpperCase().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${color}"/><text x="32" y="43" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" fill="white">${initial}</text></svg>`);
}
function safeAvatar(url){
  try{const u=new URL(url);if(u.origin==='https://qtmrtxgkisshdtqshjre.supabase.co'&&u.pathname.startsWith('/storage/v1/object/public/'))return u.href;}catch{}
  return 'icon_friend';
}
function setStatus(text){
  let el=document.getElementById('orbit-score-status');
  if(!el){el=document.createElement('p');el.id='orbit-score-status';el.setAttribute('role','status');document.body.appendChild(el);}
  el.textContent=text;
}
let clientPromise;
function client(){return clientPromise||=(async()=>{
 const [{createClient},config]=await Promise.all([import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm'),import('../../chat/config.js')]);
 return createClient(config.SUPABASE_URL,config.SUPABASE_ANON_KEY);
})().catch(e=>{clientPromise=null;throw e;});}
if(typeof window!=='undefined'){
 window.OrbitSubway=createSubwayLeaderboard({storage:localStorage,status:setStatus,
   getUser:async()=>{const sb=await client();const {data,error}=await sb.auth.getSession();if(error)throw error;return data.session?.user||null;},
   getProfile:async user=>{const sb=await client();const {data,error}=await sb.from('profiles').select('id,first_name,last_name,display_name,avatar_url,avatar_color').eq('id',user.id).single();if(error)throw error;return data;},
   rpc:async(name,args)=>{const sb=await client();const {data,error}=await sb.rpc(name,args);if(error)throw error;return data;}
 });
}
