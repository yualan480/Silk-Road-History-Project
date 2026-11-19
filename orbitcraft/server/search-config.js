export function searchOrigin(configured,requestHost){
 try{const url=new URL(configured);return url.protocol==='https:'&&!url.username&&!url.password&&url.host!==requestHost?url.origin:null;}catch{return null;}
}
export function searchFramePolicy(html,origin){
 if(!origin)return html;
 return html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]+)(")/,(_,open,policy,close)=>{
  const updated=policy.replace(/\bframe-src\s+([^;]+)/,(_,sources)=>{
   const values=sources.trim().split(/\s+/).filter(value=>value!=='https://silk-road-orbit-search.onrender.com'&&value!==origin);
   return 'frame-src '+[...values,origin].join(' ');
  });return open+updated+close;
 });
}
