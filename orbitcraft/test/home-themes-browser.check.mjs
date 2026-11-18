import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../../chat/home-themes.js',import.meta.url),'utf8'),css=await readFile(new URL('../../chat/home-themes.css',import.meta.url),'utf8');
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/themes.js'?'text/javascript':'text/html');res.end(req.url==='/themes.js'?source:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:20px}${css}</style><div class="home-theme-slot"></div>`);}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const width of [1100,390,320]){
 const page=await browser.newPage({viewport:{width,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(async()=>{
 const {createHomeThemes,HOME_THEMES}=await import('/themes.js');window.balance=30000;window.calls=[];window.inventory=[];window.S={me:{id:'one'},orbits:30000};
 const sb={from(table){return {select(){return {in:async()=>({data:HOME_THEMES.map(t=>({...t,active:true}))}),eq:async()=>({data:inventory})}}}},async rpc(name,args){calls.push({name,args});if(name==='buy_shop_item'){if(window.failPurchase)return {error:{message:'Not enough Orbits'}};window.balance-=HOME_THEMES.find(t=>t.id===args.p_item).price;return {data:balance}}return {error:null}}};
 window.picker=createHomeThemes({S,sb,toast(){},modal(title,body,buttons){window.confirmBuy=buttons[1].fn},setOrbits:n=>{S.orbits=n}});picker.mount(document.querySelector('.home-theme-slot'));
 });
 await page.locator('summary').click();await page.locator('[data-theme-use="home_aurora"]').waitFor();
 await page.locator('[data-theme-preview="home_aurora"]').click();assert.equal(await page.locator('html').getAttribute('data-orbit-home-theme'),'aurora');assert.equal(await page.evaluate(()=>calls.length),0);
 assert(await page.locator('.home-theme-panel').evaluate(e=>e.getBoundingClientRect().right<=innerWidth));
 await page.keyboard.press('Escape');assert.equal(await page.locator('html').getAttribute('data-orbit-home-theme'),null);
 await page.locator('summary').click();await page.locator('[data-theme-use="home_aurora"]').click();await page.evaluate(()=>confirmBuy());assert.equal(await page.evaluate(()=>S.orbits),20000);assert.equal(await page.locator('[data-theme-use="home_aurora"]').textContent(),'Equipped');
 await page.locator('[data-theme-preview="home_rose"]').click();await page.keyboard.press('Escape');assert.equal(await page.locator('html').getAttribute('data-orbit-home-theme'),'aurora');
 await page.locator('summary').click();await page.evaluate(()=>window.failPurchase=true);await page.locator('[data-theme-use="home_rose"]').click();await page.evaluate(()=>confirmBuy());assert.equal(await page.evaluate(()=>S.orbits),20000);assert.equal(await page.locator('[data-theme-use="home_rose"]').textContent(),'Buy');
 await page.locator('[data-theme-default]').click();assert.equal(await page.locator('html').getAttribute('data-orbit-home-theme'),null);
 assert.deepEqual(errors,[]);await page.close();
}console.log('PASS theme dropdown at desktop/390/320: preview rollback, fit, purchase/equip, failed purchase preserves balance, original theme.');}finally{await browser.close();server.close();}
