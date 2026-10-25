// Explicit recovery of a confirmed three-UPS prefix, before any epoch exists.
// This verifies consumed proofs; it never signs or broadcasts them again.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parseLosslessJson,losslessJson,FEE_ESCROW as F} from '../../amm/u124/client.mjs';
import {sponsorCalls} from '../../batching/v2/client.mjs';
import {binding,save} from '../../batching/admission/liveSupport.mjs';
import {sponsorGrant} from '../sponsorGrant.mjs';
import {sha256} from '../requestBinding.mjs';

export function assertPreEpochPrefix({labels,hasPlan,hasPrewarm,selection,grant,vault}){
 assert.equal(selection,'baseline');assert.equal(hasPlan,false,'epoch already fixed');assert.equal(hasPrewarm,false,'prewarm already attempted');
 assert.deepEqual([...labels].sort(),['buyer-order','owner-order','start-fund']);
 const adopted=sponsorGrant(grant,{vault,purpose:2n,amount:F});assert.equal(adopted.adopt,true,'only the exact original unconsumed start grant');
 return adopted;
}
export function assertOriginalStartFunding(actual,expected){
 assert.deepEqual(parseLosslessJson(losslessJson(actual)),parseLosslessJson(losslessJson(expected)),'original funding calls changed');
}
export async function verifyPreEpochResume({base,round,original,selection,market,state,actors,grant,bindings,label}){
 assert.match(label,/^pre-epoch-read-recovery-v[1-9][0-9]*$/);
 assertPreEpochPrefix({labels:readdirSync(join(round,'attempts')),hasPlan:existsSync(join(round,'public/PLAN.json')),hasPrewarm:existsSync(join(round,'public/PREWARM.json')),selection,grant,vault:market.vault});
 assert.ok(!existsSync(join(round,'prewarm-native.log')),'partial native work must be inspected separately');
 assert.equal(sha256(readFileSync(join(round,'public/rpc.json'))),sha256(readFileSync(join(original,'public/rpc.json'))),'wrong RPC/network domain');
 assert.equal(sha256(readFileSync(join(base,'public/rpc.json'))),sha256(readFileSync(join(original,'public/rpc.json'))),'changed case network domain');
 const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),out=join(base,label);mkdirSync(out);
 const verifier=JSON.parse(readFileSync(join(original,'public/TOOLS-v2.json'),'utf8')).binaries.verifier;
 assert.equal(sha256(readFileSync(verifier.file)),verifier.sha256);
 const rows=[];
 for(const [name,actor]of [['owner-order','bob'],['buyer-order','buyer'],['start-fund','sponsor']]){
  const directory=join(round,'attempts',name),input=join(round,'public',name+'.json'),request=join(directory,'request.json'),p=exact(join(directory,'preflight.json')),q=exact(request),r=exact(join(directory,'included.json')),a=actors[actor],core=q.user_ec_input.core;
  assert.deepEqual(core,p.core);assert.equal(p.inputSha256,sha256(readFileSync(input)));assert.equal(core.new_user_leaf.public_key,a.publicKeyHash);assert.equal(core.new_user_leaf.user_id,BigInt(a.id));
  assert.equal(r.status,'included');assert.equal(r.receipt.data.status,'included');assert.equal(r.userId,BigInt(a.id));assert.equal(r.receipt.data.owner_user_id,r.userId);assert.equal(r.contentHash,r.receipt.data.content_hash);assert.equal(r.checkpoint,r.receipt.data.included_checkpoint_id);assert.equal(r.endUserLeafHash,core.state_transition.end_user_leaf_hash);assert.ok(r.commonCheckpoint>=r.checkpoint);assert.ok(BigInt(state.checkpoint)>=r.checkpoint);
  assert.equal(r.receipt.data.result.fees_collected,core.stats.guta_fees_collected+core.stats.da_fees_collected);
  const realm=state.network.realm_configs.find(x=>x.id===Math.floor(a.id/state.network.users_per_realm));assert.ok(realm);
  const params={checkpoint_id:state.checkpoint,user_id:a.id},[hash,leaf]=await Promise.all([state.rpc(realm.rpc_url[0],'psy_get_user_tree_leaf_hash',params),state.rpc(realm.rpc_url[0],'psy_get_user_leaf_data',params,{exactIntegers:true})]);
  assert.equal(hash,r.endUserLeafHash,'intervening account state');assert.equal(leaf.nonce,core.new_user_leaf.nonce);assert.equal(leaf.public_key,a.publicKeyHash);
  const report=join(out,name+'-full-proof.json'),result=await promisify(execFile)(verifier.file,[request,report],{timeout:120000,maxBuffer:2000000,env:{...process.env,RAYON_NUM_THREADS:'2'}});writeFileSync(report+'.log',result.stdout+'\n'+result.stderr,{flag:'wx'});
  const v=exact(report);assert.equal(v.fullProofVerifiedAgainstPinnedNodeKeyAndCommon,true);assert.equal(v.metadataEndpointsAndFeesVerified,true);assert.equal(v.requestSha256,sha256(readFileSync(request)));assert.equal(v.publicKeyHash,a.publicKeyHash);assert.equal(v.nonce,leaf.nonce);
  rows.push({label:name,userId:a.id,nonce:leaf.nonce,end:hash,checkpoint:state.checkpoint,requestSha256:v.requestSha256,inputSha256:p.inputSha256,contentHash:r.contentHash,fullProofReportSha256:sha256(readFileSync(report))});
 }
 assertOriginalStartFunding(exact(join(round,'public/start-fund.json')).calls.contract_calls,sponsorCalls({marketId:BigInt(market.id),abi:market.abi,vaultId:BigInt(market.vault),nonce:grant.nonce,purpose:2n,amount:F}));
 for(const id of [0,2483,2484,market.id])assert.deepEqual(await binding(state,id),bindings.get(id),'changed dependency');
 const prior=exact(join(base,'public/SETUP-REUSE-v1.json')).observations.find(x=>x.userId===BigInt(market.vault));assert.ok(prior);
 const realm=state.network.realm_configs.find(x=>x.id===Math.floor(market.vault/state.network.users_per_realm));
 assert.equal(await state.rpc(realm.rpc_url[0],'psy_get_user_tree_leaf_hash',{checkpoint_id:state.checkpoint,user_id:market.vault}),prior.userLeafHash,'vault changed before epoch');
 const checked={at:new Date().toISOString(),rows,grant,verifierSha256:verifier.sha256,newOrders:0,repeatedFunding:0,cleanPerformancePairEligible:false,scope:'manual recovery of exact confirmed prefix after read-only checkpoint failure; new resident construction and downtime exclude this round from a clean comparison'};
 save(join(out,'CHECKED.json'),checked);return checked;
}
