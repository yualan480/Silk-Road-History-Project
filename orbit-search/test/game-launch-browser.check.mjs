import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '../../orbitcraft/node_modules/@playwright/test/index.mjs';
import {renderOrbitSearch} from '../../chat/orbit-search.js';
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
let searchBase,parentBase;
const parent=createServer((req,res)=>{
 res.setHeader('Content-Type',req.url.startsWith('/orbit-search/')?'application/json':'text/html');
 if(req.url==='/orbit-search/config')return res.end(JSON.stringify({url:searchBase}));
 if(req.url==='/orbit-search/ready')return res.end(JSON.stringify({ready:true,parent:parentBase}));
 res.end(`<main id="main" style="height:90vh"></main><button id="launch">Open official Krillion</button><script>const render=${renderOrbitSearch.toString()};document.querySelector('#launch').onclick=()=>render(document.querySelector('#main'),{initialUrl:'https://krillion.io/',sb:{auth:{getSession:async()=>({data:{session:{access_token:'test-session'}}})}},menuBtn:()=>'',bindMenu:()=>{}});</script>`);
});
parentBase=await listen(parent);
const proxy=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://test').pathname;
 if(path==='/config.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({parent:parentBase}));}
 if(path==='/api/session'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({token:'test-token',expires:Date.now()+600000}));}
 if(path==='/proxy-runtime.js'){res.setHeader('Content-Type','text/javascript');return res.end(`window.launches=[];window.connects=0;export function createProxyRuntime(){return {async connect(){await new Promise(r=>setTimeout(r,150));window.connects++;return {createFrame(){const f=new EventTarget();f.frame=document.createElement('iframe');f.go=url=>{window.launches.push(url);f.frame.src='about:blank';};return f;}};}};}`);}
 const file=path==='/'?'index.html':path.slice(1);
 let body=await readFile(new URL('../public/'+file,import.meta.url));
 if(file==='index.html')body=Buffer.from(body.toString().replace(/<script src="\/vendor\/[^\"]+"><\/script>/g,''));
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.png':'image/png','.html':'text/html'})[extname(file)]||'application/octet-stream');res.end(body);
 }catch{res.writeHead(404);res.end();}});
searchBase=await listen(proxy);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(parentBase);await page.locator('#launch').click();
 const search=page.frameLocator('iframe[title="Orbit Search"]');
 await search.locator('#address').filter().waitFor();
 await page.waitForFunction(()=>{const f=[...document.querySelectorAll('iframe')].find(f=>f.title==='Orbit Search');return !!f;});
 const peer=()=>page.frames().find(f=>f.url().startsWith(searchBase));
 await peer().waitForFunction(()=>window.launches?.length===1);
 assert.deepEqual(await peer().evaluate(()=>window.launches),['https://krillion.io/']);
 assert.equal(await search.locator('#address').inputValue(),'https://krillion.io/');
 await search.locator('#address').fill('https://example.org/');await search.locator('#go').click();
 await page.evaluate(origin=>document.querySelector('iframe[title="Orbit Search"]').contentWindow.postMessage({type:'orbit-search-account',accessToken:'test-session',initialUrl:'https://krillion.io/'},origin),searchBase);
 await peer().waitForFunction(()=>window.connects===2);
 assert.deepEqual(await peer().evaluate(()=>window.launches),['https://krillion.io/','https://example.org/']);
 assert.deepEqual(errors,[]);
 console.log('PASS official-game handoff into embedded Orbit Search after authentication; account refresh preserves the current page.');
}finally{await browser.close();proxy.close();parent.close();}
