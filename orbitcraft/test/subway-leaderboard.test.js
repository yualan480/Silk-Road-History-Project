import test from 'node:test';
import assert from 'node:assert/strict';
import {createSubwayLeaderboard} from '../../games/subway-surfers/orbit-leaderboard.js';
function setup(){
 let user={id:'alan',first_name:'Alan',last_name:'Yu',display_name:'Space Ranger'},fail=false,best=0;const values=new Map(),calls=[],statuses=[];
 const board=createSubwayLeaderboard({getUser:async()=>user,status:s=>statuses.push(s),storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},rpc:async(name,args)=>{calls.push({name,args});if(fail)throw Error('offline');if(name==='submit_subway_score'){best=Math.max(best,args.p_score);return best;}return [{user_id:'other',name:'Sarvesh Premkumar',score:800,rank:1,avatar_url:'https://example.com/tracker.png'},{user_id:'alan',name:'Alan Yu',score:best,rank:15,avatar_url:null}];}});
 return {board,values,calls,statuses,setFail:v=>fail=v,setUser:v=>user=v,best:()=>best};
}
test('completed runs save under authenticated account; rankings show Orbit names and own rank',async()=>{const f=setup();await f.board.submit(605);const rows=await f.board.getLeaderboard();assert.equal(f.best(),605);assert.equal(rows[0].name,'Sarvesh Premkumar');assert.equal(rows[1].name,'Alan Yu');assert.equal(rows[1].highlight,true);assert.equal(rows[1].index,15);assert.match(rows[0].image,/^data:image\/svg\+xml/);assert.equal(f.values.size,0);});
test('failed uploads are retained and retried; lower scores never replace a queued best',async()=>{const f=setup();f.setFail(true);await f.board.submit(900);await f.board.submit(400);assert.equal(f.values.get('orbit-subway-pending:alan'),'900');f.setFail(false);await f.board.getLeaderboard();assert.equal(f.best(),900);assert.equal(f.values.size,0);});
test('guest scores and invalid scores are never submitted',async()=>{const f=setup();f.setUser(null);await f.board.submit(123);for(const n of [NaN,Infinity,-1,0,1.5,2147483648])await f.board.submit(n);assert.deepEqual(await f.board.getLeaderboard(),[]);assert.equal(f.calls.length,0);});
test('pending scores stay tied to their original user',async()=>{const f=setup();f.setFail(true);await f.board.submit(700);f.setUser({id:'sarvesh'});f.setFail(false);await f.board.getLeaderboard();assert.equal(f.best(),0);assert.equal(f.values.get('orbit-subway-pending:alan'),'700');});

test('native nickname is automatically bound to the full Orbit name',async()=>{const f=setup();const native={name:'Random nickname',save(){this.saved=true}};await f.board.bindUser(native);assert.equal(native.name,'Alan Yu');assert.equal(native.nameSet,true);assert.equal(native.saved,true);assert.match(native.image,/^data:image\/svg\+xml/);});
