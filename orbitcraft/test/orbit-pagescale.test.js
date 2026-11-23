import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync}from'node:fs';
const source=readFileSync(new URL('../../pagescale.js',import.meta.url),'utf8');
function scale({path='/chat/',iframe=false,phone=false}={}){
 const url=new URL(path,'https://example.com'),win={outerWidth:1280,innerWidth:1280,devicePixelRatio:1.5};win.location=url;win.self=win;win.top=iframe?{}:win;
 vm.runInNewContext(source,{window:win,document:{documentElement:{style:{removeProperty(){},setProperty(){}}}},location:url,URLSearchParams,localStorage:{getItem:()=>null},matchMedia:q=>({matches:q.includes('pointer:coarse')?phone:!phone}),addEventListener(){}});
 return win.__pz;
}
test('direct Orbit matches the original unscaled iframe rather than shrinking twice',()=>{
 assert.equal(scale({path:'/chat/?entry=orbit'}),1);assert.equal(scale({iframe:true}),1);assert.equal(scale({path:'/chat/?entry=orbit',phone:true}),1);
});
test('regular top-level desktop scaling retains its existing calibration',()=>{assert.equal(scale(),0.6667);});
