/* Replace failed Wisp connections; replay only bodyless read-only requests. */
export function isEndedMux(error){
 const seen=new Set();
 for(let current=error;current&&!seen.has(current)&&seen.size<5;current=current.cause){seen.add(current);if(/MuxTaskEnded|Multiplexor task ended/i.test(String(current)))return true;}
 return false;
}
export function isRelayConnectionFailure(error){
 const seen=new Set();
 for(let current=error;current&&!seen.has(current)&&seen.size<5;current=current.cause){
  seen.add(current);
  if(/MuxTaskEnded|Multiplexor task ended|WebSocketConnectFailed|Wisp WebSocket failed to connect/i.test(String(current)))return true;
 }
 return false;
}
export function createRelayRecovery(reset){
 let generation=0,pending;
 return async function request(run,method,body,signal){
  const before=generation;
  try{return await run();}catch(error){
   if(!isRelayConnectionFailure(error)||!['GET','HEAD'].includes(String(method).toUpperCase())||body!=null||signal?.aborted)throw error;
   if(before===generation){
    if(!pending)pending=Promise.resolve().then(reset).then(()=>{generation++;}).finally(()=>{pending=null;});
    try{await pending;}catch(reconnectError){throw new AggregateError([error,reconnectError],'The relay disconnected and reconnection failed. Reload Orbit to reconnect.',{cause:reconnectError});}
   }
   if(signal?.aborted)throw new DOMException('The request was aborted.','AbortError');
   return run(); // One retry only; repeated failure propagates.
  }
 };
}
export function withRelayRecovery(Base){
 return class extends Base{
  constructor(...args){super(...args);this.relayRequest=createRelayRecovery(()=>super.init());}
  request(remote,method,body,headers,signal){return this.relayRequest(()=>super.request(remote,method,body,headers,signal),method,body,signal);}
 };
}
