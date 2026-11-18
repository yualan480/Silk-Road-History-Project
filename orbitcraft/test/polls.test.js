import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../chat/app.js',import.meta.url),'utf8');
const section=source.slice(source.indexOf('const pollBusy ='),source.indexOf('/* ───────── "something new"'));
function fixture(){
 const S={view:'server',me:{id:'me'},list:[{id:'message',has_poll:true,content:'Question'}],polls:new Map()};
 let result={data:[],error:null},resolveRpc,calls=0;
 const context={S,document:{hidden:false},setInterval(){},addEventListener(){},sb:{from(){return {select(){return {in:async()=>result}}}},rpc(){calls++;return new Promise(r=>resolveRpc=r)}},$:()=>null,md:x=>x,toast(){},Set,Map,Date};
 vm.createContext(context);vm.runInContext(section+';globalThis.api={loadPolls,pollHtml,votePoll,onVote,refreshVisiblePolls};',context);
 return {S,api:context.api,setResult:r=>result=r,finish:()=>resolveRpc({error:null}),calls:()=>calls};
}
test('failed poll loads display a retry instead of hiding the poll',async()=>{const f=fixture();f.setResult({error:{message:'offline'}});assert.equal(await f.api.loadPolls(['message']),false);assert.match(f.api.pollHtml(f.S.list[0]),/retrypoll/);});
test('late loads do not populate a newly opened channel',async()=>{const f=fixture();f.setResult({data:[{message_id:'message',id:'poll'}]});const pending=f.api.loadPolls(['message']);f.S.polls=new Map();await pending;assert.equal(f.S.polls.size,0);});
test('repeated vote clicks submit once and always release the pending state',async()=>{const f=fixture();f.S.polls.set('message',{id:'poll',votes:[]});const first=f.api.votePoll(f.S.list[0],'option');await f.api.votePoll(f.S.list[0],'option');assert.equal(f.calls(),1);f.finish();await first;const next=f.api.votePoll(f.S.list[0],'option');assert.equal(f.calls(),2);f.finish();await next;});
test('expired polls cannot submit new votes',async()=>{const f=fixture();f.S.polls.set('message',{id:'poll',votes:[],ends_at:'2000-01-01'});await f.api.votePoll(f.S.list[0],'option');assert.equal(f.calls(),0);});
test('DELETE events with no poll payload reload authoritative results',async()=>{const f=fixture();f.setResult({data:[{message_id:'message',id:'poll',options:[],votes:[]}]});f.api.onVote({eventType:'DELETE',old:{}});await new Promise(r=>setImmediate(r));assert.equal(f.S.polls.get('message').votes.length,0);});
