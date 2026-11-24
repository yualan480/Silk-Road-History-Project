import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync}from'node:fs';
const source=readFileSync(new URL('../../pagescale.js',import.meta.url),'utf8');
function scale({path='/chat/',iframe=false,phone=false,dpr=1.5,browserZoom=1}={}){
 const url=new URL(path,'https://example.com'),win={outerWidth:1280,innerWidth:1280/browserZoom,devicePixelRatio:dpr*browserZoom};win.location=url;win.self=win;win.top=iframe?{}:win;
 vm.runInNewContext(source,{window:win,document:{documentElement:{style:{removeProperty(){},setProperty(){}}}},location:url,URLSearchParams,localStorage:{getItem:()=>null},matchMedia:q=>({matches:q.includes('pointer:coarse')?phone:!phone}),addEventListener(){}});
 return win.__pz;
}
test('direct Orbit normalizes desktop scaling both directly and inside the unscaled proxy',()=>{
 assert.equal(scale({path:'/chat/?entry=orbit'}),0.6667);assert.equal(scale({iframe:true}),1);assert.equal(scale({path:'/chat/?entry=orbit',phone:true}),1);
});
test('regular top-level desktop scaling retains its existing calibration',()=>{assert.equal(scale(),0.6667);});

test('direct Orbit keeps phone touch targets and deliberate browser zoom',()=>{
 assert.equal(scale({path:'/chat/?entry=orbit',iframe:true}),0.6667);
 assert.equal(scale({path:'/chat/?entry=orbit',dpr:1}),1);
 assert.equal(scale({path:'/chat/?entry=orbit',browserZoom:1.5}),0.6667);
 assert.equal(scale({path:'/chat/?entry=orbit',dpr:1,browserZoom:1.5}),1);
});
