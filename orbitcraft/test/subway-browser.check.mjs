import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.SUBWAY_TEST_URL||'http://127.0.0.1:8801';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:800}}),errors=[],failures=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)failures.push([r.status(),r.url()]);});
 for(const name of ['config','strings_en','chunks_idle','chunks_game'])assert.equal((await page.request.get(base+'/games/subway-surfers/assets/data/'+name+'.json')).status(),200);
 for(const path of ['/orbitcraft/data/world.sqlite','/orbitcraft/server/index.js','/games/subway-surfers/assets/data/secret.json'])assert.equal((await page.request.get(base+path)).status(),404);
 await page.goto(base+'/games/subway-surfers/index.html');
 await page.locator('canvas').waitFor({state:'visible',timeout:60000});
 await page.waitForTimeout(12000);
 await page.screenshot({path:'/tmp/subway-title.png'});
 await page.locator('canvas').click();await page.keyboard.press('Space');await page.waitForTimeout(5000);
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');
 await page.screenshot({path:'/tmp/subway-playing.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 console.log('PASS real server: Subway data served, private data blocked, canvas startup and play input without errors.');
}finally{await browser.close();}
