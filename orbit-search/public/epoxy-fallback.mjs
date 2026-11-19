import EpoxyTransport from '/vendor/epoxy/index.mjs';
import {createRelayRecovery,withRelayRecovery} from '/relay-recovery.js';
import {withHttp1Fallback} from '/http-fallback.js';
async function makeHttp1(opts,wisp){
 const {default:init,EpoxyClient,EpoxyClientOptions}=await import('/vendor/epoxy-http1/epoxy-bundled.js');
 await init();
 const createClient=()=>{
  const options=new EpoxyClientOptions();options.user_agent=navigator.userAgent;
  for(const key of ['wisp_v2','udp_extension_required','title_case_headers','redirect_limit','header_limit','buffer_size'])if(opts[key]!=null)options[key]=opts[key];
  // Options are consumed by the WASM constructor: allocate fresh ones on reconnect.
  return new EpoxyClient(wisp,options);
 };
 let client=createClient();
 const recover=createRelayRecovery(()=>{client=createClient();});
 return {async request(remote,method,body,headers,signal){
  if(signal?.aborted)throw new DOMException('The request was aborted.','AbortError');
  if(body instanceof Blob)body=await body.arrayBuffer();
  const response=await recover(()=>client.fetch(remote.href,{method,body,headers,redirect:'manual'}),method,body,signal);
  return {body:response.body,headers:response.rawHeaders,status:response.status,statusText:response.statusText};
 }};
}
export default withHttp1Fallback(withRelayRecovery(EpoxyTransport),makeHttp1);
