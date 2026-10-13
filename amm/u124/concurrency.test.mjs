// Local executor contention/inclusion model, not a chain throughput benchmark.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ExecutionJournal,VaultBusy,UnresolvedBroadcast} from '../../executor/journal.mjs';

const markets=[
 [490560,'aafa2192745b6fa3d9cefc27edcc61e2d4f709c6b7f4c5476f44051fd8e8c236'],
 [1539136,'083440ce17ad83e4d4ba78c6829d1b91e27594927e6e29f08ed013c5f259d731'],
 [1014848,'29dc032e1831388da5483b7c7c1ff3034f7b0186e564c6b437ad3147929d621a']
];
test('64 simultaneous operators per vault, three vaults, eight rounds: one owner broadcasts',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'psy-u124-contention-'));let proofs=0,submits=0,busy=0;
 try{
  for(let round=1;round<=8;round++)await Promise.all(markets.map(async([vaultId,fingerprint])=>{
   const make=()=>new ExecutionJournal({directory,network:'u124-local-model',vaultId,fingerprint});
   let release,ready;const entered=new Promise(r=>ready=r),held=new Promise(r=>release=r);
   const args={task:{nonce:round},prove:async()=>{proofs++;ready();await held;return {fixture:true};},
    isCurrent:async()=>true,submit:async()=>{submits++;return {endUserLeafHash:`fixture-${vaultId}-${round}`};},
    reconcile:async()=>({status:'included',userId:vaultId,contentHash:`fixture-${round}`,checkpoint:round})};
   const owner=make().execute(args);await entered;
   const contenders=await Promise.allSettled(Array.from({length:63},()=>make().execute(args)));
   release();const result=await owner;assert.equal(result.status,'included');
   for(const result of contenders){assert.equal(result.status,'rejected');assert.ok(result.reason instanceof VaultBusy);busy++;}
   assert.equal((await make().execute(args)).status,'already-included');
  }));
  assert.equal(proofs,24);assert.equal(submits,24);assert.equal(busy,1512);
  console.log(JSON.stringify({model:'local-journal',operatorsPerVault:64,vaults:3,rounds:8,attempts:1536,proofs,submits,busy,duplicateBroadcasts:0}));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('response loss blocks the vault until exact inclusion is reconciled',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'psy-u124-response-loss-'));
 try{for(const[vaultId,fingerprint]of markets){
  const journal=new ExecutionJournal({directory,network:'u124-local-model',vaultId,fingerprint});let submits=0;
  const args={task:{nonce:1},isCurrent:async()=>true,prove:async()=>({fixture:true}),
   submit:async()=>{submits++;throw Error('response lost after transmission');},reconcile:async()=>({status:'unresolved'})};
  assert.equal((await journal.execute(args)).status,'unresolved');
  await assert.rejects(journal.execute({...args,task:{nonce:2}}),UnresolvedBroadcast);
  await journal.reconcile(async()=>({status:'included',userId:vaultId,contentHash:'fixture-exact-inclusion',checkpoint:1}));
  assert.equal((await journal.execute(args)).status,'already-included');assert.equal(submits,1);
 }}finally{await rm(directory,{recursive:true,force:true});}
});
