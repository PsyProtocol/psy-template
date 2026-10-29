// Public consistency checks only. Native fixed-resource verification is separate;
// this module does not turn declarations into cryptographic or live acceptance.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {parseLosslessJson} from '../../amm/u124/client.mjs';import {sha256} from '../../executor/requestBinding.mjs';
import {auditUpsRow} from './audit-evidence.mjs';
const normalFor=sources=>['funding-grant','open',...Array.from({length:sources},(_,i)=>'source-'+i),'minimum-0','minimum-1','minimum-2','minimum-3','settle-0','settle-tail'];
const phasesFor=normal=>[...normal,'late-minimum-1','late-minimum-2','late-minimum-3','late-refund-0','late-refund-4','timeout-tail','expire-unseeded','unseeded-refund-0','unseeded-refund-4'];
const edgesFor=(normal,sources)=>[...normal.slice(1).map((p,i)=>[normal[i],p]),['minimum-0','late-minimum-1'],['late-minimum-1','late-minimum-2'],['late-minimum-2','late-minimum-3'],['late-minimum-3','late-refund-0'],['late-refund-0','late-refund-4'],['settle-0','timeout-tail'],['source-'+(sources-1),'expire-unseeded'],['expire-unseeded','unseeded-refund-0'],['unseeded-refund-0','unseeded-refund-4']];
export function auditMinimumRow(plan,session){
 assert.equal(plan.fields.length,80);assert.equal(session.stack.length,40);
 assert.equal(plan.registered_key.length,4);const fee=session.actualCalls.at(-2);
 assert.equal(fee.method_name,'account_executor_fee');assert.equal(fee.contract_id,plan.source.scope[3]);
 assert.deepEqual(fee.inputs,[plan.fields[73],...plan.registered_key]);
 if(plan.fields[0]===13n){const grant=session.actualCalls[0];assert.equal(grant.method_name,'apply_fee_grant');assert.deepEqual(grant.inputs.slice(0,6),[plan.fields[21],plan.fields[22],...plan.registered_key]);assert.equal(grant.inputs.length,8);assert.equal(grant.inputs[7],plan.fields[23]);
  if(plan.fields[23]===1n){assert.equal(session.actualCalls[1].method_name,'claim');assert.equal(session.actualCalls[1].contract_id,0n);assert.deepEqual(session.actualCalls[1].inputs,[grant.inputs[6]]);}
 }
 if([7n,12n].includes(plan.fields[0])){
  const page=plan.minimum;assert.ok(page);assert.equal(page.refund_only,false);assert.ok(page.rows.length>=1&&page.rows.length<=4);
  let previous=page.current;
  for(const row of page.rows){assert.deepEqual(row.scope,plan.source.scope);assert.deepEqual(row.seed,page.seed);assert.equal(row.extract,plan.fields[0]===12n);assert.deepEqual(row.before,previous);previous=row.after;}
  const end=plan.fields[0]===7n?previous.built:previous.extracted;
  assert.ok(page.rows.length===4||end===plan.source.scope[8]);
  const calls=session.actualCalls;assert.equal(calls[0].method_name,'begin_order_page');assert.equal(calls[0].inputs[4],plan.source.scope[6]+1n);assert.deepEqual(calls[0].inputs.slice(5),page.seed);
  assert.equal(calls[1].method_name,'advance_minimum_stream');assert.equal(calls[1].inputs[8],previous.built);assert.equal(calls[1].inputs[9],previous.extracted);assert.deepEqual(calls[1].inputs.slice(10,14),previous.queue);
  assert.equal(calls[1].inputs[14],BigInt(previous.built===plan.source.scope[8]&&previous.extracted===plan.source.scope[8]));
 }
 return true;
}
export async function auditMinimumEvidence(root){
 const markets={};
 for(const market of ['amm','bondingcurve']){
  const report=JSON.parse(await readFile(join(root,market+'-REPORT.json'),'utf8'));
  assert.equal(report.sourcePages,2);const normal=normalFor(report.sourcePages),phases=phasesFor(normal),edges=edgesFor(normal,report.sourcePages);
  for(const [k,v]of Object.entries({profile:'source-covered-producer-minimum-stream-v1',fullUpsVerified:true,vmOnly:false,newFullUps:19,broadcast:false,qualifiedRandomness:false,producerInfluence:true,ordinaryWalletUps:false,prefixRecoveryWithoutReset:true,allRecoveryConservation:true,nativeConservationIncludingFees:true,actualSyntheticFills:3}))assert.equal(report[k],v,k);
  const rows={},plans={},digests={};let scope,key;const seed=report.seed.map(BigInt);
  for(const phase of phases){const files={};for(const name of ['verification.json','request.json','plan.json','public-session.json','key-proof.bin']){const b=await readFile(join(root,market+'-'+phase,name));digests[market+'-'+phase+'/'+name]=sha256(b);if(name.endsWith('.json'))files[name]=name==='verification.json'?JSON.parse(b):parseLosslessJson(b.toString());}
   const p=files['plan.json'],s=files['public-session.json'],v=files['verification.json'];plans[phase]=p;rows[phase]=auditUpsRow(v,files['request.json'],p,s);auditMinimumRow(p,s);
   if(!key)key=v.keyFingerprint;assert.equal(v.keyFingerprint,key);
   if(phase!=='funding-grant'){if(!scope)scope=p.source.scope;assert.deepEqual(p.source.scope,scope,'one frozen set across every page/fork');}
   if(p.minimum){const unseeded=phase.includes('unseeded');assert.deepEqual(p.minimum.seed,unseeded?[0n,0n,0n,0n]:seed);assert.equal(p.minimum.refund_only,phase.startsWith('unseeded-refund'));}
  }
  assert.equal(scope[6],BigInt(report.source));assert.equal(scope[6]+1n,BigInt(report.draw));assert.equal(scope[7],scope[6]+8192n);
  for(const [a,b]of edges)assert.equal(rows[a].endLeaf,rows[b].startLeaf,'exact state edge '+a+' -> '+b);
  for(const labels of [['minimum-0','minimum-1','minimum-2','minimum-3'],['minimum-0','late-minimum-1','late-minimum-2','late-minimum-3']]){
   const pages=labels.map(k=>plans[k].minimum);for(let i=1;i<4;i++)assert.deepEqual(pages[i].current,pages[i-1].rows.at(-1).after,'exact minimum continuation');
   assert.deepEqual(pages.map(p=>p.rows.length),[4,1,4,1]);
   const owners=pages.slice(2).flatMap(p=>p.rows.map(r=>String(r.node.owner)));assert.deepEqual(owners,report.permutation.map(String));assert.equal(new Set(owners).size,5);
  }
  for(const [first,tail,ordered]of [['settle-0','settle-tail',true],['late-refund-0','late-refund-4',true],['unseeded-refund-0','unseeded-refund-4',false]]){
   const a=plans[first],b=plans[tail];assert.equal(a.settled,0n);assert.equal(b.settled,4n);assert.deepEqual([a.fields[2],b.fields[2]],[4n,1n]);
   const owners=[a,b].flatMap(p=>Array.from({length:Number(p.fields[2])},(_,i)=>String(p.fields[22+13*i])));assert.equal(new Set(owners).size,5);if(ordered)assert.deepEqual(owners,report.permutation.map(String));else assert.deepEqual(owners,['200','201','202','203','204']);
  }
  const fee=normal.reduce((n,k)=>n+BigInt(rows[k].syntheticNativeFee),0n);assert.equal(fee,BigInt(report.normalFeeUsed));assert.ok(fee<=BigInt(report.lifetimeCap));
  markets[market]={keyFingerprint:key,completeUps:19,actualSyntheticFills:3,normalUps:normal.length,normalUpsSeconds:normal.reduce((n,k)=>n+rows[k].seconds,0),normalSyntheticFee:fee.toString(),coldResources:report.measurements.filter(r=>r.phase==='cold-stream-resource-build'),rows,fileSha256:digests,ordinaryWalletUps:false};
 }
 return {schema:1,scope:'public consistency audit; not an independent ZK verifier, live receipt, wallet arrival, finality or unbiased randomness',completeUps:38,cryptographicVerificationPerformed:false,financialOperations:0,canBroadcast:false,markets};
}
if(process.argv.length===3&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(await auditMinimumEvidence(process.argv[2]),null,2)+'\n');
