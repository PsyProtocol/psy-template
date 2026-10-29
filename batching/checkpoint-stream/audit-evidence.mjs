// Read-only evidence consistency audit. This does NOT verify ZK proofs, install
// a wallet verifier, authorize a broadcast or promote a candidate to production.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
export function auditUpsRow(v,request,plan,session){
 const core=request.user_ec_input.core,transition=core.state_transition,stats=core.stats;
 assert.equal(v.fullUpsVerified,true,'native verification report required, not a replacement for its proof');assert.equal(v.fixedVerifier,true);assert.equal(v.broadcast,false);
 assert.equal(transition.start_user_leaf_hash,v.startLeaf);assert.equal(transition.end_user_leaf_hash,v.endLeaf);
 assert.equal(core.new_user_leaf.user_id,transition.user_id);assert.equal(session.user,transition.user_id);
 assert.equal(core.checkpoint_id,session.checkpoint);assert.equal(core.new_user_leaf.nonce,session.session.nonce);
 assert.equal(core.new_user_leaf.nonce,session.session.start_user_leaf.nonce+1n);
 assert.equal(core.new_user_leaf.public_key,session.session.start_user_leaf.public_key);
 assert.equal(transition.checkpoint_tree_root_hash,session.session.checkpoint_tree_root);
 assert.equal(stats.slots_modified,BigInt(v.slots));assert.equal(stats.total_transactions,BigInt(v.calls));assert.equal(session.txCount,stats.total_transactions);
 assert.equal(stats.guta_fees_collected,1_000_000_000n);assert.equal(stats.da_fees_collected,1000n*stats.slots_modified);
 assert.equal(stats.guta_fees_collected+stats.da_fees_collected,BigInt(v.fee));assert.equal(plan.fields[73],BigInt(v.fee));
 assert.equal(session.actualCalls.length,Number(v.calls));assert.equal(session.stack.length,40);assert.equal(session.keyFingerprint,v.keyFingerprint);
 assert.deepEqual(session.actualCalls.at(-1).inputs,[BigInt(v.fee)]);assert.equal(session.actualCalls.at(-1).method_name,'burn');
 assert.ok(request.proof.length>0);assert.equal(plan.source.scope[0],3n);assert.equal(plan.source.scope[6],BigInt(v.sourceCheckpoint));
 return {phase:v.phase,seconds:Number(v.seconds),keySeconds:Number(v.keySeconds),endcapAndAuditSeconds:Number(v.endcapAndAuditSeconds),actualCalls:Number(v.calls),logicalSlots:40,modifiedWords:Number(v.slots),syntheticNativeFee:String(v.fee),startLeaf:v.startLeaf,endLeaf:v.endLeaf,keyAttackRejections:v.keyAttackRejections};
}
export async function auditStreamEvidence(root){
 const reports={};
 for(const market of ['amm','bondingcurve']){
  const read=async name=>JSON.parse((await readFile(join(root,name))).toString());
  const report=await read(`${market}-REPORT.json`);assert.equal(report.broadcast,false);assert.equal(report.assetConservation,true);
  const phases=['open','source-0','source-1','settle-0','settle-tail','timeout-tail','abort-source'],rows={},pins={};let fingerprint=null;const selected=[];
  for(const phase of phases){const prefix=`${market}-${phase}`;const files={};for(const name of ['verification.json','request.json','plan.json','source.json','current.json','public-session.json','key-proof.bin']){const raw=await readFile(join(root,prefix,name));pins[`${prefix}/${name}`]=digest(raw);if(name.endsWith('.json'))files[name]=name==='verification.json'?JSON.parse(raw.toString()):parseLosslessJson(raw.toString());}
   const v=files['verification.json'];if(fingerprint===null)fingerprint=v.keyFingerprint;assert.equal(v.keyFingerprint,fingerprint,'one exact key per market stream');rows[phase]=auditUpsRow(v,files['request.json'],files['plan.json'],files['public-session.json']);
   if(phase==='settle-0'||phase==='settle-tail'){const p=files['plan.json'];assert.equal(p.settled,phase==='settle-0'?0n:4n);assert.equal(p.fields[4],p.settled);assert.equal(p.fields[2],phase==='settle-0'?4n:1n);for(let i=0;i<Number(p.fields[2]);i++)selected.push(String(p.fields[22+13*i]));}
  }
  for(const [prior,next]of [['open','source-0'],['source-0','source-1'],['source-1','settle-0'],['settle-0','settle-tail'],['settle-0','timeout-tail'],['open','abort-source']])assert.equal(rows[prior].endLeaf,rows[next].startLeaf,`exact state chain ${prior} -> ${next}`);
  assert.equal(new Set(selected).size,5);assert.equal(selected.length,5);
  const normal=['open','source-0','source-1','settle-0','settle-tail'];
  reports[market]={keyFingerprint:fingerprint,sourceAccounts:8,selectedMembers:selected,normalPhases:normal,normalPhaseSeconds:normal.reduce((n,p)=>n+rows[p].seconds,0),normalSyntheticNativeFee:normal.reduce((n,p)=>n+BigInt(rows[p].syntheticNativeFee),0n).toString(),coldResources:report.measurements.filter(m=>m.phase==='cold-stream-resource-build').map(m=>({seconds:Number(m.seconds)})),rows,ordinaryClaims:report.ordinaryClaimBytecode,assetConservationRecorded:true,fileSha256:pins};
 }
 return {schema:1,scope:'structural consistency of saved native-verified synthetic UPS evidence; not independent cryptographic verification or network acceptance',cryptographicVerificationPerformed:false,canBroadcast:false,markets:reports};
}
if(process.argv.length===3&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(await auditStreamEvidence(process.argv[2]),null,2)+'\n');
