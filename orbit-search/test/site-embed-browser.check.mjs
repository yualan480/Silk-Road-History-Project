import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..');
let render,policy='';
const mainRoot=process.env.ORBIT_MAIN_REPO||resolve(root,'..');if(existsSync(resolve(mainRoot,'chat/orbit-search.js'))){render=(await import(pathToFileURL(resolve(mainRoot,'chat/orbit-search.js')).href)).renderOrbitSearch;policy=(await readFile(resolve(mainRoot,'chat/index.html'),'utf8')).match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];}
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://local').pathname;
 if(path==='/main-fixture'&&render){res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><button id="launch">Orbit Search</button><main id="main" style="height:90dvh;display:flex;flex-direction:column"></main><script src="/fixture.js"></script>`);return;}
 if(path==='/fixture.js'&&render){res.setHeader('Content-Type','text/javascript');res.end(`const render=${render.toString()};document.querySelector('#launch').onclick=()=>render(document.querySelector('#main'),{menuBtn:()=>'',bindMenu:()=>{}});`);return;}
 const file=path==='/'?'index.html':path.slice(1);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(resolve(root,'public',file)));
 }catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const width of [1280,390])for(const main of render?[false,true]:[false]){
 const page=await browser.newPage({viewport:{width,height:850}}),errors=[],legacy=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/orbit-search\/(config|ready)|\/api\/session/.test(r.url()))legacy.push(r.url());});
 await page.route('https://search.orbitstayintheloop.workers.dev/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Embedded destination</h1><button onclick="this.textContent=\'Works\'">Test</button>'}));
 await page.goto('http://127.0.0.1:'+server.address().port+(main?'/main-fixture':'/'));
 if(main)await page.locator('#launch').click();
 const frame=page.locator('iframe[title="Orbit Search website"]');await frame.waitFor();assert.equal(await frame.getAttribute('src'),'https://search.orbitstayintheloop.workers.dev/');
 const content=page.frameLocator('iframe');await content.getByRole('heading',{name:'Embedded destination'}).waitFor();await content.getByRole('button',{name:'Test',exact:true}).click();await content.getByRole('button',{name:'Works'}).waitFor();
 assert.equal(await page.locator('input').count(),0);assert.deepEqual(legacy,[]);assert.deepEqual(errors,[]);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(!await page.evaluate(()=>!!document.fullscreenElement))await page.getByRole('button',{name:'Fullscreen',exact:true}).click();
 await page.waitForFunction(()=>!!document.fullscreenElement);await page.getByRole('button',{name:'Exit fullscreen'}).click();await page.waitForFunction(()=>!document.fullscreenElement);
 if(main){await page.getByRole('button',{name:'Fullscreen',exact:true}).click();await page.locator('#main').evaluate(el=>el.replaceChildren());await page.waitForFunction(()=>!document.fullscreenElement);}
 await page.close();
}console.log('PASS fixed destination embedded and interactive; no local search UI/account handshake; exact-origin CSP, fullscreen, cleanup and mobile sizing.');}finally{await browser.close();server.close();}
