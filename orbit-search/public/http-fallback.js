/* Retry only read-only, bodyless requests after a recognizable HTTP/2 reset. */
export function isHttp2Reset(error){
  const parts=[];const seen=new Set();
  for(let current=error;current&&!seen.has(current)&&seen.size<5;current=current.cause){seen.add(current);parts.push(String(current),String(current.stack||''));}
  const text=parts.join('\n');
  return /http2|http\/2|\bh2\b/i.test(text)&&/protocol_error|stream.*reset|reset\(|goaway/i.test(text);
}
export function withHttp1Fallback(Base,makeHttp1){
 return class extends Base{
  constructor(...args){super(...args);this.http1Origins=new Set();this.http1Ready=null;}
  http1(){return this.http1Ready||=(Promise.resolve().then(()=>makeHttp1(this.opts,this.wisp)).catch(error=>{this.http1Ready=null;throw error;}));}
  async request(remote,method,body,headers,signal){
   if(this.http1Origins.has(remote.origin))return (await this.http1()).request(remote,method,body,headers,signal);
   try{return await super.request(remote,method,body,headers,signal);}
   catch(error){
    if(!['GET','HEAD'].includes(String(method).toUpperCase())||body!=null||signal?.aborted||!isHttp2Reset(error))throw error;
    let response;
    try{response=await(await this.http1()).request(remote,method,body,headers,signal);}
    catch(fallbackError){throw new AggregateError([error,fallbackError],'The HTTP/2 request and HTTP/1.1 fallback both failed.',{cause:fallbackError});}
    if(this.http1Origins.size>=64)this.http1Origins.delete(this.http1Origins.values().next().value);
    this.http1Origins.add(remote.origin);
    return response;
   }
  }
 };
}
