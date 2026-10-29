// Public-plan consistency only. Native source verification and the replacement
// spending key own cryptographic checks; this validator cannot authorize funds.
import assert from 'node:assert/strict';
const profile='source-covered-producer-minimum-stream-v1';
const integer=n=>{n=Number(n);assert.ok(Number.isSafeInteger(n)&&n>=0&&n<2**24);return n;};
export function validateMinimumStreamPlan(plan,source,pages,queue){
 assert.equal(plan.profile,profile);assert.equal(plan.authenticatedSeedRelativeToHistory,true);assert.equal(plan.producerInfluence,true);assert.equal(plan.noReset,true);
 for(const k of ['canSign','canBroadcast','fullUpsVerified','qualifiedRandomness','finalityVerified','causalSealBeforeReleaseAuthenticated'])assert.equal(plan[k],false);
 const n=integer(plan.members),accounts=integer(plan.accounts);assert.ok(n>0&&accounts>=n);
 assert.equal(BigInt(plan.drawCheckpoint),BigInt(plan.sourceCheckpoint)+1n);assert.equal(BigInt(plan.expiry),BigInt(plan.sourceCheckpoint)+8192n);
 const count=Math.ceil(n/4);assert.equal(pages.length,2*count);assert.equal(Number(plan.minimumBuildPages),count);assert.equal(Number(plan.minimumExtractionPages),count);assert.equal(Number(plan.minimumPages),pages.length);assert.equal(queue.length,n);
 assert.equal(source.length,Math.ceil(accounts/4));assert.equal(Number(plan.sourcePages),source.length);let seen=0,ledger=null;
 for(const p of source){assert.deepEqual(p.scope,plan.scope);assert.ok(p.rows.length>0&&p.rows.length<=4);if(seen+p.rows.length<accounts)assert.equal(p.rows.length,4);if(ledger)assert.deepEqual(p.before,ledger);else assert.equal(Number(p.before.accounts),0);assert.equal(Number(p.after.accounts)-Number(p.before.accounts),p.rows.length);seen+=p.rows.length;ledger=p.after;}
 assert.equal(seen,accounts);assert.equal(Number(ledger.order_count),n);assert.deepEqual(ledger.orders,plan.sourceSetRoot);assert.deepEqual(ledger.users,source[0].facts[0]);
 let state=null,built=0,popped=0,lastIndex=-1n;const members=new Map();
 for(let i=0;i<pages.length;i++){
  const p=pages[i],extract=i>=count;assert.equal(p.refund_only,false);assert.deepEqual(p.seed,plan.seed);
  assert.equal(p.rows.length,Math.min(4,n-(extract?popped:built)));
  if(state)assert.deepEqual(p.current,state,'no reset or gap');else{assert.equal(Number(p.current.built),0);assert.equal(Number(p.current.extracted),0);assert.deepEqual(p.current.seen,plan.sourceSetRoot);}
  state=p.current;
  for(const r of p.rows){assert.deepEqual(r.scope,plan.scope);assert.deepEqual(r.seed,plan.seed);assert.equal(r.extract,extract);assert.deepEqual(r.before,state);const owner=String(r.node.owner);
   if(!extract){assert.ok(BigInt(r.node.index)>lastIndex,'canonical source-index consumption');lastIndex=BigInt(r.node.index);assert.ok(!members.has(owner));members.set(owner,r.node);built++;assert.equal(Number(r.after.built),built);assert.equal(Number(r.after.extracted),0);}
   else{assert.equal(built,n);assert.equal(Number(r.before.built),n);assert.equal(r.node.owner,r.before.front);assert.equal(Number(queue[popped].index),popped);const original=members.get(owner);assert.ok(original);for(const k of ['owner','index','nonce','terms'])assert.deepEqual(r.node[k],original[k]);for(const k of ['owner','nonce','terms'])assert.deepEqual(queue[popped].member[k],r.node[k]);members.delete(owner);popped++;assert.equal(Number(r.after.built),n);assert.equal(Number(r.after.extracted),popped);}
   state=r.after;
  }
 }
 assert.equal(built,n);assert.equal(popped,n);assert.equal(members.size,0);assert.equal(Number(state.front),0);assert.deepEqual(state.queue,plan.orderedRoot);
 return {profile,accounts,members:n,minimumBuildPages:count,minimumExtractionPages:count,orderingPages:pages.length,noReset:true,scope:'authenticated finite final-state source, not all-market admission or transaction history',producerInfluence:true,qualifiedRandomness:false,fullUpsVerified:false,canSign:false,canBroadcast:false};
}
