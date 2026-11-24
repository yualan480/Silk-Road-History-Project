import {verifyRelay} from './relay-probe.js';
/* Pinned Scramjet v1 + BareMux v2 + Epoxy v2 runtime. Keep on the isolated Search origin. */
export const PREFIX='/service/';
// v1 has no generic `rewriter` or worker-hook flag. Native worker hooks are bundled.
export const PROXY_FLAGS={strictRewrites:true,serviceworkers:false,syncxhr:false};
export const PROXY_SITE_FLAGS={
  // Experimental v1 SW emulation is limited to Discord. Failed hooks must not fall through.
  '^https://(?:[a-z0-9-]+\\.)?(?:discord\\.com|discordapp\\.com)(?::443)?/':{serviceworkers:true,allowFailedIntercepts:false}
};
export function waitForController(serviceWorker,timeout=20000){
  return new Promise((resolve,reject)=>{
    let timer;
    const clean=()=>{clearTimeout(timer);serviceWorker.removeEventListener('controllerchange',check);};
    const check=()=>{if(serviceWorker.controller){clean();resolve();}};
    serviceWorker.addEventListener('controllerchange',check);
    timer=setTimeout(()=>{clean();reject(new Error('Orbit Search did not gain service-worker control. Reload the Search page and try again.'));},timeout);
    check(); // Listen first, then inspect: do not lose a claim during startup.
  });
}
export function createProxyRuntime(){
  let boot;
  function initialize(){
    if(boot)return boot;
    boot=(async()=>{
      if(!navigator.serviceWorker||!window.SharedWorker)throw new Error('This browser does not support Orbit Search. Try a current Chrome or Firefox browser.');
      const {ScramjetController}=$scramjetLoadController();
      const controller=new ScramjetController({prefix:PREFIX,flags:PROXY_FLAGS,siteFlags:PROXY_SITE_FLAGS,files:{wasm:'/vendor/scramjet/scramjet.wasm.wasm',all:'/vendor/scramjet/scramjet.all.js',sync:'/vendor/scramjet/scramjet.sync.js'}});
      await controller.init();
      const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      if(new URL(registration.scope).origin!==location.origin||!new URL(PREFIX,location.origin).href.startsWith(registration.scope))throw new Error('The Search service-worker scope does not cover its proxy prefix.');
      await navigator.serviceWorker.ready;
      await waitForController(navigator.serviceWorker);
      const connection=new BareMux.BareMuxConnection('/vendor/baremux/worker.js');
      return {controller,connection};
    })().catch(error=>{boot=null;throw error;});
    return boot;
  }
  return {async connect(ticket){
    if(typeof ticket!=='string'||!ticket)throw new Error('Create a proxy session before loading the website.');
    await verifyRelay(ticket);
    const {controller,connection}=await initialize();
    const wisp=new URL('/wisp/',location.href);wisp.protocol=location.protocol==='https:'?'wss:':'ws:';wisp.searchParams.set('ticket',ticket);
    await connection.setTransport('/epoxy-fallback.mjs?v=4',[{wisp:wisp.href}]);
    return controller; // No proxied frame is loaded before transport setup resolves.
  }};
}
