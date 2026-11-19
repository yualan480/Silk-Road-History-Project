/* Verify authorization and a real Wisp v1 CONTINUE packet before reporting Ready. */
export async function verifyRelay(ticket){
 const response=await fetch('/api/relay-check',{method:'POST',headers:{'X-Orbit-Relay-Ticket':ticket}});
 const check=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(check.message||'The relay authorization check failed. Reopen Orbit Search.');
 const url=new URL('/wisp/',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('ticket',ticket);url.searchParams.set('probe','1');
 await new Promise((resolve,reject)=>{
  const ws=new WebSocket(url);ws.binaryType='arraybuffer';let settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);ws.close();error?reject(error):resolve();};
  const timer=setTimeout(()=>finish(new Error('Relay handshake timed out. Check the Orbit Search Render logs.')),12000);
  ws.onmessage=event=>{const data=new Uint8Array(event.data);if(data.length>=9&&data[0]===3&&new DataView(data.buffer).getUint32(1,true)===0)finish();else finish(new Error('Relay returned an unexpected Wisp handshake packet.'));};
  ws.onerror=()=>finish(new Error('Relay WebSocket could not open. Authorization passed; check Render’s WebSocket upgrade/rejection logs.'));
  ws.onclose=event=>finish(new Error('Relay closed before its handshake (code '+event.code+'). Check Render’s relay logs.'));
 });
}
