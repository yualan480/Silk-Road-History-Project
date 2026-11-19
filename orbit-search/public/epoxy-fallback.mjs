import EpoxyTransport from '/vendor/epoxy/index.mjs';
import {createRelayRecovery,withRelayRecovery} from '/relay-recovery.js';
import {withHttp1Fallback} from '/http-fallback.js';
async function makeHttp1(opts,wisp){
 const {default:init,EpoxyClient,EpoxyClientOptions}=await import('/vendor/epoxy-http1/epoxy-bundled.js');
 await init();
 const options=new EpoxyClientOptions();options.user_agent=navigator.userAgent;
 for(const key of ['wisp_v2','udp_extension_required','title_case_headers','redirect_limit','header_limit','buffer_size'])if(opts[key]!=null)options[key]=opts[key];
 // The minimal build omits HTTP/2/ALPN h2; certificate verification stays enabled.
 const client=new EpoxyClient(wisp,options);
 const recover=createRelayRecovery(()=>client.replace_stream_provider());
 return {async request(remote,method,body,headers,signal){
  if(signal?.aborted)throw new DOMException('The request was aborted.','AbortError');
  if(body instanceof Blob)body=await body.arrayBuffer();
  const response=await recover(()=>client.fetch(remote.href,{method,body,headers,redirect:'manual'}),method,body,signal);
  return {body:response.body,headers:response.rawHeaders,status:response.status,statusText:response.statusText};
 }};
}
export default withHttp1Fallback(withRelayRecovery(EpoxyTransport),makeHttp1);
