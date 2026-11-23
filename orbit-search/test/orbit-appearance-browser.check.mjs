import {createServer}from'node:http';import{readFile}from'node:fs/promises';import{resolve,extname}from'node:path';import{fileURLToPath}from'node:url';import assert from'node:assert/strict';
import{createSearchServer}from'../server.js';import{server as wisp}from'@mercuryworkshop/wisp-js/server';import{chromium}from'../../orbitcraft/node_modules/@playwright/test/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+s.address().port)));
const allowed=new Set(['/pagescale.js','/chat/style.css','/chat/layout.css','/chat/home-themes.css','/chat/orbit-bg.js','/chat/asset-url.js','/chat/orbit-space.jpg']);
const target=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://test').pathname;
 if(path==='/chat/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/pagescale.js"></script><link rel="stylesheet" href="/chat/style.css"><link rel="stylesheet" href="/chat/layout.css"><link rel="stylesheet" href="/chat/home-themes.css"><div id="root"><div id="app" class="app"><aside class="side">Sidebar</aside><main class="main"><div class="panel orbithome">Orbit home</div></main></div></div><script type="module" src="/fixture.js"></script>');}
 if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end("import{createBackdrop}from'/chat/orbit-bg.js';const cv=createBackdrop();cv.className='ovid';document.querySelector('#app').prepend(cv);cv.play();window.backdrop=cv;");}
 if(!allowed.has(path)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg'})[extname(path)]);res.end(await readFile(resolve(root,'.'+path)));
 }catch{res.writeHead(404);res.end();}});
const targetBase=await listen(target),proxy=createSearchServer({targetUrl:'http://fixture.test:'+new URL(targetBase).port+'/chat/?entry=orbit'}),base=await listen(proxy);
// Local fixtures only; production retains its private-address restrictions.
wisp.options.allow_private_ips=true;wisp.options.allow_loopback_ips=true;wisp.options.port_whitelist=[Number(new URL(targetBase).port)];wisp.options.dns_method=async()=> '127.0.0.1';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const [width,height,dpr]of[[1920,1080,1],[1280,720,1.5]]){
 let baseline;
 for(const proxied of[false,true]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const picture=page.waitForResponse(r=>r.url().includes('orbit-space.jpg'));
  await page.goto(proxied?base:targetBase+'/chat/?entry=orbit');
  const response=await picture;assert.equal(response.status(),200,'The real backdrop URL must load through the relay');assert.match(response.headers()['content-type'],/image\/jpeg/);
  const frame=proxied?page.frames().find(f=>f!==page.mainFrame()):page.mainFrame();await frame.waitForFunction(()=>!!window.backdrop);await page.waitForTimeout(200);
  const state=await frame.evaluate(()=>{window.backdrop.pause();window.backdrop.currentTime=0;const c=window.backdrop;return {zoom:getComputedStyle(document.documentElement).zoom,sidebar:document.querySelector('.side').getBoundingClientRect().width,columns:getComputedStyle(document.querySelector('.app')).gridTemplateColumns,display:getComputedStyle(c).display,pixel:[...c.getContext('2d').getImageData(Math.floor(c.width*.5),Math.floor(c.height*.4),1,1).data]};});
  assert.equal(state.zoom,'1');assert.equal(state.display,'block');assert.equal(state.sidebar,width===1920?320:220);assert.deepEqual(errors,[]);
  if(!proxied)baseline=state;else{assert.equal(state.columns,baseline.columns);state.pixel.forEach((v,i)=>assert.ok(Math.abs(v-baseline.pixel[i])<=3,'The proxied canvas must draw the original background'));await page.screenshot({path:'/tmp/orbit-restored-'+width+'.png'});}
  await context.close();
 }
}console.log('PASS actual Orbit assets through Scramjet: original background loads/draws and desktop layout matches direct rendering at 100% and 150% display scaling.');}finally{await browser.close();for(const s of[proxy,target]){s.closeAllConnections();s.close();}}
