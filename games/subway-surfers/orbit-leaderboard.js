export function createSubwayLeaderboard({rpc,getUser,status,storage}) {
  let pending=Promise.resolve();
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
    pending=pending.then(async()=>{const user=await getUser();if(!user){status('Log in to Orbit to save your score.');return;}await upload(user,score);}).catch(()=>status('Score not uploaded yet. We’ll retry when you reconnect.'));
    return pending;
  }
  async function getLeaderboard(limit=11){
    await pending;
    try{
      const user=await getUser();if(!user){status('Log in to Orbit to see player rankings.');return [];}
      try{await upload(user,0);}catch{status('Your score is waiting to upload.');}
      const rows=await rpc('get_subway_leaderboard',{p_limit:limit});
      if(!Array.isArray(rows))throw Error('Invalid leaderboard');
      status(rows.length?'Orbit players · best scores':'No Orbit scores yet. Finish a run to set the first score!');
      return rows.map(row=>({name:String(row.name||'Orbit player'),score:Number(row.score)||0,index:Number(row.rank),highlight:row.user_id===user.id,image:safeAvatar(row.avatar_url)}));
    }catch{status('Orbit leaderboard unavailable. Please try again later.');return [];}
  }
  return {submit,getLeaderboard};
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
   rpc:async(name,args)=>{const sb=await client();const {data,error}=await sb.rpc(name,args);if(error)throw error;return data;}
 });
}
