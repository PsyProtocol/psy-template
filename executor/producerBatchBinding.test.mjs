// Local persistence/recovery tests; no native proof or network acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {producerBatchBindings,producerBatchStatement} from './producerBatchBinding.mjs';
import {previousTask} from './previousCheckpointReader.mjs';
import {PREVIOUS_TAG} from '../batching/checkpoint-processor/policy.mjs';

const root=process.env.PREVIOUS_FIXTURES;assert.ok(root,'reviewed v4 fixtures required');
const scope={identity:{network:'testnet',vaultId:100,marketId:1000,fingerprint:'a'.repeat(64),publicKeyHash:'b'.repeat(64)},
 dependencies:[{contract:{contractId:0,codeRoot:'c'.repeat(64)}}],driverSha256:'d'.repeat(64),policySha256:'e'.repeat(64),rpcConfigSha256:'f'.repeat(64),configSha256:'1'.repeat(64)};
for(const market of ['amm','bondingcurve'])test(`${market}: verified set/draw survives restart and cannot be reselected`,async()=>{
 const policy=JSON.parse(await readFile(join(root,market,'policy.json'),'utf8'));
 const op=policy.operations.find(o=>o.name===(market==='amm'?'swap_0':'settle_limit_buy_change'));
 const f=Array(80).fill(0n);f[0]=2n;f[1]=1n;f[2]=4n;f[3]=101n;f.splice(13,4,11n,12n,13n,14n);
 f.splice(17,4,3n,1n,0n,2n);f[73]=1000030000n;f[79]=4n*1000100000n-f[73];f[78]=PREVIOUS_TAG;f.splice(74,4,21n,22n,23n,24n);
 const used=new Set([0,...op.calls.flatMap(c=>c.inputs.filter(a=>a.witness!==undefined).map(a=>a.witness))]);
 for(let row=0;row<4;row++)for(const col of used)f[21+13*row+col]=col===0?BigInt(op.branch):col===1?BigInt(200+row):1n;
 const task=(v=f,expiry=200)=>previousTask(policy,v,expiry);
 const dir=await mkdtemp(join(tmpdir(),'psy-producer-pin-'));
 try{
  const make=(s=scope)=>producerBatchBindings({directory:dir,scope:s,policy});
  const path=join(dir,'producer-batches','testnet','100','1.json');
  await make().check(task());await assert.rejects(access(path),{code:'ENOENT'});
  await make().retainVerified(task());const original=await readFile(path,'utf8');
  const saved=JSON.parse(original);assert.deepEqual(saved.batch.members.map(m=>m.owner),['200','201','202','203']);
  assert.equal(saved.qualifiedRandomness,false);assert.equal(saved.finalityVerified,false);
  assert.equal(saved.batch.seed[0],'21');assert.deepEqual(saved.batch.rank,[3,1,0,2]);
  await make().check(task());await make().retainVerified(task());
  for(const change of [v=>v[3]++,v=>v[13]++,v=>v[74]++,v=>v[31]++,v=>v.splice(17,4,0n,1n,2n,3n),v=>v[22]=199n]){
   const bad=[...f];change(bad);await assert.rejects(make().check(task(bad)),/verified producer batch changed/);
   await assert.rejects(make().retainVerified(task(bad)),/verified producer batch changed/);
  }
  await assert.rejects(make().check(task(f,201)),/verified producer batch changed/);
  for(const name of ['driverSha256','policySha256','rpcConfigSha256','configSha256']){
   await assert.rejects(make({...scope,[name]:'9'.repeat(64)}).check(task()),/verified producer batch changed/);
  }
  const fee=[...f];fee[73]+=1000n;fee[79]-=1000n;await make().check(task(fee));
  // Recovery may expire the original batch. It neither deletes nor rerolls it.
  const expired=Array(80).fill(0n);expired[0]=3n;expired[1]=1n;expired[78]=PREVIOUS_TAG;
  await make().check(previousTask(policy,expired,201));
  assert.equal(await readFile(path,'utf8'),original);
  assert.throws(()=>producerBatchStatement(scope,policy,{...task(),batchId:'2'}),/batch identity/);
  assert.throws(()=>producerBatchStatement(scope,policy,task(f,101)),/draw must precede/);
  // A separate batch keeps its own namespace; a racing replacement of the
  // same batch is rejected, independent of which local writer wins.
  const next=[...f];next[1]=2n;const other=[...next];other[74]++;
  const raced=await Promise.allSettled([make().retainVerified(task(next)),make().retainVerified(task(other))]);
  assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(raced.filter(r=>r.status==='rejected').length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
