// Admin adjustments add tally weight without inventing voter identities.
export function pollTotals(options, votes) {
  const voters=new Set(votes.map(v=>v.user_id)).size;
  const counts=new Map();
  for(const vote of votes)counts.set(vote.option_id,(counts.get(vote.option_id)||0)+1);
  let adjustments=0;
  for(const option of options){
    const extra=Number.isSafeInteger(option.manual_votes)&&option.manual_votes>0?option.manual_votes:0;
    adjustments+=extra;counts.set(option.id,(counts.get(option.id)||0)+extra);
  }
  return {voters,adjustments,denominator:voters+adjustments,counts};
}
