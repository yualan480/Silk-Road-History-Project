import{chromium}from'@playwright/test';import assert from'node:assert/strict';
const base=process.env.GAME_TEST_URL||'http://127.0.0.1:8801',browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/games/a-small-world-cup/index.html');await page.waitForFunction(()=>window.cr_getC2Runtime?.()?.ja,{timeout:60000});
 await page.evaluate(()=>cr_getC2Runtime().Ke=.5);await page.waitForTimeout(1300);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('orbit-small-world-cup-round-v1')));assert.equal(saved.rt.timescale,.5);
 await page.reload();await page.waitForFunction(()=>window.cr_getC2Runtime?.()?.Ke===.5);assert.deepEqual(errors,[]);await page.close();
 const nesPage=await browser.newPage({viewport:{width:390,height:844}}),nesErrors=[];nesPage.on('pageerror',e=>nesErrors.push(e.message));
 await nesPage.route('**/super-mario-bros/player.js?*',async route=>{const r=await route.fetch();const s=await r.text();await route.fulfill({response:r,body:s.replace('player=new jsnes.Browser','player=window.testNes=new jsnes.Browser')});});
 await nesPage.goto(base+'/games/super-mario-bros/index.html');
 // Original, minimal homebrew ROM written for this test. No commercial ROM data.
 const rom=Buffer.alloc(16+16384+8192);rom.set([0x4e,0x45,0x53,0x1a,1,1],0);rom.fill(0xea,16,16+16384);
 const code=[0x78,0xd8,0xa2,0xff,0x9a,0xe8,0x8e,0x00,0x20,0x8e,0x01,0x20,0xa9,0x3f,0x8d,0x06,0x20,0xa9,0x00,0x8d,0x06,0x20,0xa9,0x21,0x8d,0x07,0x20,0x4c,0x1b,0x80];rom.set(code,16);for(const offset of [0x3ffa,0x3ffc,0x3ffe]){rom[16+offset]=0;rom[16+offset+1]=0x80;}
 await nesPage.locator('#rom').setInputFiles({name:'original-test-homebrew.nes',mimeType:'application/octet-stream',buffer:rom});
 await nesPage.waitForFunction(()=>!document.getElementById('pause').disabled);await nesPage.evaluate(()=>testNes.nes.cpu.mem[0x20]=77);await nesPage.waitForTimeout(2600);await nesPage.locator('#pause').click();
 await nesPage.reload();await nesPage.waitForFunction(()=>window.testNes?.nes?.cpu?.mem?.[0x20]===77,{timeout:30000});
 assert.ok(await nesPage.locator('#screen canvas').count());assert.ok(await nesPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(nesErrors,[]);await nesPage.close();
 console.log('PASS A Small World Cup native run-state reload and NES ROM/state persistence using an original test ROM at phone width.');
}finally{await browser.close();}
