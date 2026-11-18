import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pollTotals} from '../../chat/poll-totals.js';
test('manual poll adjustments produce five No votes without creating voter identities',()=>{
 const votes=[...[1,2,3,4].map(i=>({user_id:'user'+i,option_id:'yes'})),{user_id:'user5',option_id:'no'}];
 const result=pollTotals([{id:'yes'},{id:'no',manual_votes:4}],votes);
 assert.equal(result.counts.get('no'),5);assert.equal(result.counts.get('yes'),4);
 assert.equal(result.voters,5);assert.equal(result.adjustments,4);assert.equal(result.denominator,9);
 assert.equal(votes.length,5);
});
test('existing polls need no migration and malformed adjustments cannot change totals',()=>{
 for(const value of [undefined,null,-1,1.5,'4']){
  const result=pollTotals([{id:'no',manual_votes:value}],[{user_id:'one',option_id:'no'}]);
  assert.equal(result.counts.get('no'),1);assert.equal(result.adjustments,0);
 }
});
