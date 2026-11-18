import{chromium}from'@playwright/test';import assert from'node:assert/strict';
const base=process.env.GAME_TEST_URL||'http://127.0.0.1:8801';const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto(base+'/games/suika/index.html');
 await page.waitForFunction(()=>!!window.OrbitGameSave);
 await page.evaluate(()=>{localStorage.setItem('suika-test-native','saved progress');localStorage.setItem('sb-example-auth-token','private');localStorage.setItem('refresh_token','private');});
 await page.waitForTimeout(300);const backup=await page.evaluate(()=>JSON.parse(localStorage.getItem('orbit-game-backup-v1:suika')));
 assert.equal(backup.values['suika-test-native'],'saved progress');assert.equal(backup.values['sb-example-auth-token'],undefined);assert.equal(backup.values.refresh_token,undefined);
 await page.evaluate(()=>{Storage.prototype.setItem.call(sessionStorage,'session-only','not a game save');localStorage.removeItem('suika-test-native');});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('orbit-game-backup-v1:suika')).values['suika-test-native']),undefined);
 await page.evaluate(()=>{window.Game={ready:true,SaveTo:'CookieClickerGame',WriteSave:type=>{if(type!==1)throw Error('Unexpected write mode');return 'encoded-game-save-END';}};});
 await page.evaluate(()=>OrbitGameSave.flush());assert.equal(await page.evaluate(()=>localStorage.getItem('CookieClickerGame')),'encoded-game-save-END');
 const canvas=page.locator('#app');const box=await canvas.boundingBox();await page.mouse.click(box.x+box.width*.3,box.y+20);await page.waitForTimeout(1800);
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('orbit-suika-board-v2')));assert(before.fruits.length>0);
 await page.reload();await page.waitForFunction(()=>document.getElementById('score').textContent.length>0);
 const colored=await page.locator('#app').evaluate(c=>{const ctx=c.getContext('2d'),pixels=ctx.getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]!==233||pixels[i+1]!==213||pixels[i+2]!==176)count++;return count;});assert(colored>1000);
 assert.equal(await page.locator('#app').evaluate(c=>c.getContext('2d').imageSmoothingEnabled),true);
 console.log('PASS fast native backup, auth/session exclusion, removed keys, Cookie Clicker serialization, Suika pile restore and smooth rendering.');
}finally{await browser.close();}
