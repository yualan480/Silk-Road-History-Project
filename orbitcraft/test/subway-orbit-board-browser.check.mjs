import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=process.env.SUBWAY_TEST_URL||'http://127.0.0.1:8801';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:800}}),errors=[],failures=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)failures.push([r.status(),r.url()]);});
 for(const name of ['config','strings_en','chunks_idle','chunks_game'])assert.equal((await page.request.get(base+'/games/subway-surfers/assets/data/'+name+'.json')).status(),200);
 for(const path of ['/orbitcraft/data/world.sqlite','/orbitcraft/server/index.js','/games/subway-surfers/assets/data/secret.json'])assert.equal((await page.request.get(base+path)).status(),404);
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm',route=>route.fulfill({contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:'export function createClient(){return window.testSb}'}));
 await page.route('https://qtmrtxgkisshdtqshjre.supabase.co/storage/v1/object/public/avatars/alan.png',async route=>route.fulfill({contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'},body:await readFile(new URL('../../games/subway-surfers/NewYorkIcon.png',import.meta.url))}));
 await page.addInitScript(()=>{
  window.savedScores=[];window.boardRows=[];window.fixtureProfile={id:'orbit-alan',first_name:'Alan',last_name:'Yu',display_name:'Space Ranger',avatar_color:'#336699',avatar_url:null};
  window.testSb={auth:{getSession:async()=>({data:{session:{user:{id:'orbit-alan'}}}})},from(){return {select(){return {eq(){return {single:async()=>({data:window.fixtureProfile})}}}}}},rpc:async(name,args)=>{
   if(name==='submit_subway_score'){savedScores.push(args.p_score);return {data:args.p_score};}
   return {data:window.boardRows};
  }};
 });
 await page.route('**/js/main.js?*',async route=>{
 const r=await route.fetch();const source=await r.text();await route.fulfill({response:r,body:source.replace('new ro(window.sharedAppData).init(t);','window.testApp=new ro(window.sharedAppData);window.testApp.init(t);')});
 });
 await page.goto(base+'/games/subway-surfers/index.html');
 await page.locator('canvas').waitFor({state:'visible',timeout:60000});
 await page.waitForTimeout(12000);
 await page.screenshot({path:'/tmp/subway-title.png'});
 await page.locator('canvas').click();await page.keyboard.press('Space');await page.waitForTimeout(5000);
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');
 await page.waitForFunction(()=>window.testApp?.user?.name==='Alan Yu');
 assert.equal(await page.evaluate(()=>OrbitSubway.profile.name),'Alan Yu');
 assert.match(await page.evaluate(()=>OrbitSubway.profile.image),/^data:image\/svg\+xml/);
 // An empty global board still shows the real signed-in account, not a blank list.
 await page.evaluate(()=>testApp.sections.open('toprun'));
 await page.waitForFunction(()=>testApp.sections.subs.toprun?.ranking?.entries[0]?.name?.text==='Alan Yu');
 await page.evaluate(()=>{
  window.boardRows=[{user_id:'orbit-sarvesh',name:'Sarvesh Premkumar',score:900,rank:1},{user_id:'orbit-alan',name:'Space Ranger',score:605,rank:2}];
  testApp.sections.close();testApp.game.gameover();
 });
 await page.waitForFunction(()=>testApp.sections.subs.gameover?.ranking?.entries[0]?.name?.text==='Sarvesh Premkumar');
 assert.equal(await page.evaluate(()=>testApp.sections.subs.gameover.ranking.entries[1].name.text),'Alan Yu');
 assert.ok((await page.evaluate(()=>savedScores)).includes(await page.evaluate(()=>Math.floor(testApp.game.stats.score))));
 assert.equal(await page.evaluate(()=>testApp.sections.subs.gameover.ranking.entries.filter(e=>e.visible).length),2);
 await page.screenshot({path:'/tmp/subway-orbit-leaderboard.png'});
 await page.evaluate(()=>testApp.sections.open('toprun'));
 await page.waitForFunction(()=>testApp.sections.subs.toprun?.ranking?.entries[0]?.name?.text==='Sarvesh Premkumar');
 await page.screenshot({path:'/tmp/subway-playing.png'});

 await page.evaluate(()=>testApp.sections.open('settings'));
 await page.waitForFunction(()=>testApp.sections.subs.settings?.nickname?.subtitle?.text==='Alan Yu');
 assert.equal(await page.evaluate(()=>testApp.sections.subs.settings.nickname.type),'profile');
 assert.ok(await page.evaluate(()=>!!testApp.sections.subs.settings.nickname.profileAvatar));
 await page.evaluate(async()=>{fixtureProfile.avatar_url='https://qtmrtxgkisshdtqshjre.supabase.co/storage/v1/object/public/avatars/alan.png';await OrbitSubway.bindUser(testApp.user);testApp.sections.subs.settings.updateEntries();});
 await page.waitForFunction(()=>testApp.sections.subs.settings.nickname.profileAvatar._path===fixtureProfile.avatar_url&&testApp.sections.subs.settings.nickname.profileAvatar.image.texture.valid);
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 console.log('PASS real bridge profile sync, empty board, full-name native settings/avatar, finished-run upload, Top Run and result ranks.');
}finally{await browser.close();}
