import {createServer}from'node:http';import{readFile}from'node:fs/promises';import{resolve,extname}from'node:path';import{fileURLToPath}from'node:url';import assert from'node:assert/strict';
import{createSearchServer}from'../server.js';import{server as wisp}from'@mercuryworkshop/wisp-js/server';import{chromium}from'../../orbitcraft/node_modules/@playwright/test/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+s.address().port)));
const target=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://test').pathname;
 if(path==='/chat/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><link rel="stylesheet" href="/cursor.css"><script src="/cursor.js"></script><body style="margin:0;height:100vh;padding:20px"><button id="click">Clickable</button><input id="text"><button id="disabled" disabled>Disabled</button><script type="module" src="/fixture.js"></script>');}
 if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(`import * as shop from '/chat/shop-cursors.js';window.shop=shop;window.useOldShop=()=>{const c=shop.cursorCss({id:'cu_test_heart',art:{c1:'#3b82f6',c2:'#8bddff'}});const old=value=>value.replace(/data:image\\/svg\\+xml;base64,([^\"]*)/,(_,data)=>'data:image/svg+xml,'+encodeURIComponent(atob(data)));localStorage.setItem(shop.SHOP_CURSOR_KEY,JSON.stringify({a:old(c.arrow),p:old(c.pointer)}));StgCursor.apply();};window.ready=true;`);}
 if(!['/cursor.css','/cursor.js','/cursor-arrow.png','/cursor-hand.png','/chat/shop-cursors.js'].includes(path)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.css':'text/css','.js':'text/javascript','.png':'image/png'})[extname(path)]);res.end(await readFile(resolve(root,'.'+path)));}catch{res.writeHead(404);res.end();}});
const targetBase=await listen(target),proxy=createSearchServer({targetUrl:'http://fixture.test:'+new URL(targetBase).port+'/chat/'}),base=await listen(proxy);
wisp.options.allow_private_ips=true;wisp.options.allow_loopback_ips=true;wisp.options.port_whitelist=[Number(new URL(targetBase).port)];wisp.options.dns_method=async()=> '127.0.0.1';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{const baseline=new Map();for(const proxied of[false,true]){
 const context=await browser.newContext(),page=await context.newPage();await page.goto(proxied?base:targetBase+'/chat/');if(proxied)await page.locator('#site iframe').waitFor();const frame=proxied?page.frames().find(f=>f!==page.mainFrame()):page.mainFrame();await frame.waitForFunction(()=>window.ready);
 for(const style of['planet','solid','outline','neon','glass','shop','old-shop']){
  const cursors=await frame.evaluate(style=>{
   localStorage.removeItem('stg_shop_cursor');
   if(style==='shop')shop.applyCursor({id:'cu_test_heart',art:{c1:'#3b82f6',c2:'#8bddff'}});
   else if(style==='old-shop')useOldShop();else StgCursor.set({style,color:'#3b82f6'});
   return {arrow:getComputedStyle(document.body).cursor,pointer:getComputedStyle(document.querySelector('#click')).cursor,text:getComputedStyle(document.querySelector('#text')).cursor,disabled:getComputedStyle(document.querySelector('#disabled')).cursor};
  },style);
  assert.equal(cursors.text,'text');assert.equal(cursors.disabled,'not-allowed');
  const graphics=[];for(const cursor of[cursors.arrow,cursors.pointer]){
   const uri=cursor.match(/url\("([^\"]*)"\)/)?.[1];assert.ok(uri,'Custom cursor must have an image');
   // Decode the CSS image from the real unproxied launcher, matching the browser's
   // native cursor loader rather than passing an already-rewritten URL in again.
   graphics.push(await page.evaluate(async uri=>{const image=new Image();image.src=uri;await image.decode();const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,32,32).data;return {hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))].join(','),visible:[...pixels].filter((v,i)=>i%4===3&&v>0).length};},uri));
  }
  graphics.forEach(g=>assert.ok(g.visible>20));if(proxied)assert.deepEqual(graphics,baseline.get(style),'Cursor colors and shapes must survive the proxy: '+style);else baseline.set(style,graphics);
 }
 await frame.getByRole('button',{name:'Clickable',exact:true}).click();await context.close();
}console.log('PASS native cursor images: default, all custom styles, hover, shop and saved legacy cursors render identically through the proxy; text and disabled cursors remain correct.');}finally{await browser.close();for(const s of[proxy,target]){s.closeAllConnections();s.close();}}
