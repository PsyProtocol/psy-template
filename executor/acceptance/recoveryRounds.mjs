import assert from 'node:assert/strict';
// Historical completed rounds do not establish quiescence of later rounds.
// executeRound is never retried here; unknown sends must propagate and stop.
export async function runRecoveryRounds({maxRounds,scanRound,executeRound,isComplete}) {
 assert.ok(Number.isSafeInteger(maxRounds)&&maxRounds>0);
 for(let round=0;round<maxRounds;round++){
  const batch=await scanRound(round);assert.ok(Array.isArray(batch.work));
  if(!batch.work.length){if(await isComplete())return;continue;}
  await executeRound(batch,round);
 }
 throw Error('recovery round bound exhausted');
}
