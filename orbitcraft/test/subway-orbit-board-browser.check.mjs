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
 await page.route('**/js/main.js?*',async route=>{
 const r=await route.fetch();const source=await r.text();await route.fulfill({response:r,body:source.replace('new ro(window.sharedAppData).init(t);','window.testApp=new ro(window.sharedAppData);window.testApp.init(t);')});
 });
 await page.goto(base+'/games/subway-surfers/index.html');
 await page.locator('canvas').waitFor({state:'visible',timeout:60000});
 await page.waitForTimeout(12000);
 await page.screenshot({path:'/tmp/subway-title.png'});
 await page.locator('canvas').click();await page.keyboard.press('Space');await page.waitForTimeout(5000);
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');
 await page.evaluate(async()=>{
  const {createSubwayLeaderboard}=await import('/games/subway-surfers/orbit-leaderboard.js');window.savedScores=[];
  window.OrbitSubway=createSubwayLeaderboard({storage:localStorage,status:()=>{},getUser:async()=>({id:'orbit-alan'}),rpc:async(name,args)=>{
    if(name==='submit_subway_score'){savedScores.push(args.p_score);return args.p_score;}
    return [{user_id:'orbit-sarvesh',name:'Sarvesh',score:900,rank:1},{user_id:'orbit-alan',name:'Alan Yu',score:605,rank:2}];
  }});
  testApp.game.stats.score=605;
  testApp.sections.open('gameover');
 });
 await page.waitForFunction(()=>testApp.sections.subs.gameover?.ranking?.entries[0]?.name?.text==='Sarvesh');
 assert.equal(await page.evaluate(()=>testApp.sections.subs.gameover.ranking.entries[1].name.text),'Alan Yu');
 assert.equal(await page.evaluate(()=>testApp.sections.subs.gameover.ranking.entries.filter(e=>e.visible).length),2);
 await page.screenshot({path:'/tmp/subway-orbit-leaderboard.png'});
 await page.evaluate(()=>testApp.sections.open('toprun'));
 await page.waitForFunction(()=>testApp.sections.subs.toprun?.ranking?.entries[0]?.name?.text==='Sarvesh');
 await page.screenshot({path:'/tmp/subway-playing.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 console.log('PASS actual Subway results and Top Run screens show Orbit names, current-player highlight, and no sample rankings.');
}finally{await browser.close();}
