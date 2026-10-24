// Fixed-checkpoint read-only audit. Bounded row scheduling preserves stable
// report order; publicState additionally caps all RPCs at four per process.
import assert from 'node:assert/strict';
import {decodeAmount} from '../../amm/u124/client.mjs';
import {mapReads,readTogether} from '../../executor/readConcurrency.mjs';
export async function cohortState(s,users,assets) {
 assert.equal(new Set(users).size,users.length);assert.equal(new Set(assets).size,assets.length);
 const accounts=await mapReads(users,async user=>{
  const [native,nativeRoot,balances]=await readTogether([
   s.slot(user,0,0),s.contractStateRoot(user,0),
   mapReads(assets,async asset=>{
    const [limbs,root]=await readTogether([readTogether([0,1].map(j=>s.slot(user,asset,j))),s.contractStateRoot(user,asset)]);
    return {asset,balance:decodeAmount(limbs),root};
   })]);
  return {user,native,nativeRoot,balances};
 });
 const pairs=users.flatMap(from=>users.filter(to=>to!==from).map(to=>({from,to})));
 const outboxes=await mapReads(pairs,async({from,to})=>{
  const [sent,claimed,ft]=await readTogether([
   s.slot(from,0,3+2*to),s.slot(to,0,4+2*from),
   mapReads(assets,async asset=>{
    const [sent,claimed]=await readTogether([33554453+4*to,33554455+4*from].map((offset,j)=>
     readTogether([0,1].map(i=>s.slot(j?to:from,asset,offset+i))).then(decodeAmount)));
    assert.ok(sent>=claimed,'FT claim exceeds sender Outbox');
    return {asset,sent,claimed,pending:sent-claimed};
   })]);
  assert.ok(sent>=claimed,'native claim exceeds sender Outbox');
  return {from,to,native:sent-claimed,ft};
 });
 let native=0n;const totals=new Map(assets.map(id=>[id,0n]));
 for(const row of accounts){native+=row.native;for(const b of row.balances)totals.set(b.asset,totals.get(b.asset)+b.balance);}
 for(const row of outboxes){native+=row.native;for(const b of row.ft)totals.set(b.asset,totals.get(b.asset)+b.pending);}
 return {accounts,outboxes,native,totals};
}
