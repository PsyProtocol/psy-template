// Bounded public readiness observations only. No signing, proving or submission.
// Successful RPC reads are not cryptographic proof verification or finality.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {publicState} from '../publicState.mjs';
import {parseLosslessJson,losslessJson} from '../../amm/u124/client.mjs';
const P=18446744069414584321n,ZERO='0'.repeat(64),GLOBAL_HEIGHT=32;
function checkpoint(n,label){assert.ok(Number.isSafeInteger(n)&&n>0&&n<2**32,'bounded '+label);return n;}
function hash(s,label,{zero=true}={}){assert.match(s??'',/^[a-f0-9]{64}$/,label+' canonical hash');for(let i=0;i<64;i+=16)assert.ok(BigInt('0x'+s.slice(i,i+16))<P,label+' canonical hash limb');if(!zero)assert.notEqual(s,ZERO,label+' nonzero');return s;}
function scalar(n,label){assert.ok(typeof n==='bigint'&&n>=0n&&n<P,label+' lossless canonical scalar');return n;}
function approval(actorId,approvedActor){
 assert.ok(Number.isSafeInteger(actorId)&&actorId>0&&actorId<2**24,'bounded actor identity');
 assert.equal(approvedActor?.userId,actorId,'approved actor identity');
 hash(approvedActor.publicKeyHash,'approved key',{zero:false});hash(approvedActor.startUserLeafHash,'approved materialized anchor',{zero:false});
 assert.match(approvedActor.nextNonce??'',/^[1-9][0-9]*$/,'approved canonical next nonce');assert.ok(BigInt(approvedActor.nextNonce)<P,'approved nonce range');
}
// Match only the frozen SDK's exact named missing-spine RPC shape. Unknown
// errors, other checkpoints, resource errors and additional data never retry.
export function isMissingCheckpointSpine(error,expectedCheckpoint){
 checkpoint(expectedCheckpoint,'missing proof checkpoint');
 let value=error;
 if(error instanceof Error){try{value=JSON.parse(error.message);}catch{return false;}}
 return value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).every(k=>['code','message'].includes(k))&&value.code===-32001
  &&value.message===`User tree proof not found for checkpoint_id ${expectedCheckpoint}`;
}
export function assertMaterializedActorObservation({actorId,approvedActor,checkpointId,validUntilCheckpoint,leaf,rawHash}){
 approval(actorId,approvedActor);checkpoint(checkpointId,'actor checkpoint');checkpoint(validUntilCheckpoint,'expiry checkpoint');
 assert.ok(checkpointId<=validUntilCheckpoint,'original ordinary input expired');hash(rawHash,'current raw leaf',{zero:false});
 assert.equal(rawHash,approvedActor.startUserLeafHash,'current raw leaf changed');assert.equal(scalar(leaf?.user_id,'current user'),BigInt(actorId),'current user changed');
 assert.equal(leaf.public_key,approvedActor.publicKeyHash,'current key changed');
 assert.equal(scalar(leaf.nonce,'current nonce')+1n,BigInt(approvedActor.nextNonce),'current nonce changed');
 return {checkpointId,userId:actorId,rawUserLeafHash:rawHash,publicKeyHash:leaf.public_key,observedNonce:String(leaf.nonce),nextNonce:approvedActor.nextNonce,
  scope:'RPC observations only; Native must authenticate the actual session and complete UPS'};
}
function merkleShape(value,{index,height,label}){
 assert.ok(value&&typeof value==='object',label+' proof object');assert.ok(typeof value.index==='bigint'&&value.index>=0n,label+' lossless proof index');assert.equal(value.index,BigInt(index),label+' proof index');
 assert.ok(Array.isArray(value.siblings)&&value.siblings.length===height,label+' proof height');
 for(const s of value.siblings)hash(s,label+' sibling');hash(value.root,label+' root');hash(value.value,label+' value');
}
export async function checkOrdinaryCheckpointReadiness(input,{readState=publicState}={}){
 const {rpcConfig,actorId,failedCheckpoint,approvedActor,validUntilCheckpoint}=input;
 assert.equal(typeof rpcConfig,'string');approval(actorId,approvedActor);checkpoint(failedCheckpoint,'failed checkpoint');checkpoint(validUntilCheckpoint,'expiry checkpoint');
 const state=await readState(rpcConfig),network=state.network;
 const perRealm=network.users_per_realm,realmHeight=Math.log2(perRealm),realmId=Math.floor(actorId/perRealm),topHeight=GLOBAL_HEIGHT-realmHeight;
 assert.equal(network.global_user_tree_height,GLOBAL_HEIGHT,'frozen global user proof tree height');
 assert.equal(network.realm_user_tree_height,20,'frozen realm user proof tree height');
 assert.ok(Number.isSafeInteger(perRealm)&&perRealm===2**20&&realmHeight===20&&topHeight===12,'frozen realm partition shape');
 const realmIndex=network.realm_configs.findIndex(r=>r.id===realmId);assert.ok(realmIndex>=0,'configured actor realm');
 const realmUrl=network.realm_configs[realmIndex].rpc_url[0];assert.equal(typeof realmUrl,'string');
 const actorHead=checkpoint(state.heads[realmIndex]?.checkpoint_id,'actor realm head');
 const coordinatorHead=checkpoint((await state.rpc(state.coordinator,'psy_get_latest_l2_block_state',{})).checkpoint_id,'coordinator head');
 const commonCheckpoint=Math.min(actorHead,coordinatorHead);assert.ok(commonCheckpoint<=validUntilCheckpoint,'original ordinary input expired');
 const observations=[];
 for(const cp of [...new Set([failedCheckpoint,commonCheckpoint])]){
  if(cp>commonCheckpoint){observations.push({checkpointId:cp,status:'beyond-observed-common-head'});continue;}
  try{
   const root=hash(await state.rpc(realmUrl,'psy_get_user_tree_root',{checkpoint_id:cp}),'realm user root');
   const proof=await state.rpc(realmUrl,'psy_get_user_tree_merkle_proof',{checkpoint_id:cp,user_id:actorId},{exactIntegers:true});
   const height=proof?.siblings?.length;assert.ok(height===realmHeight||height===GLOBAL_HEIGHT,'realm proof height');
   merkleShape(proof,{index:actorId,height,label:'realm user'});
   // The frozen provider always requests/stitches this top proof, including
   // when the realm returned a full path. Observe that actual dependency too.
   const top=await state.rpc(state.coordinator,'psy_get_user_sub_tree_merkle_proof',{checkpoint_id:cp,root_level:0,leaf_level:topHeight,leaf_index:realmId},{exactIntegers:true});
   merkleShape(top,{index:realmId,height:topHeight,label:'coordinator top'});assert.equal(top.root,root,'coordinator/realm root observation differs');
   if(height===realmHeight)assert.equal(proof.root,top.value,'realm spine value observation differs');
   else assert.equal(proof.root,root,'full realm root observation differs');
   // Frozen SDK discards any realm-returned top siblings and verifies the
   // first 20 realm siblings followed by the 12 coordinator siblings. Node
   // records shape/metadata consistency; Native performs the actual hash check.
   observations.push({checkpointId:cp,status:'available-observation',userTreeRoot:root,rawUserLeafHash:proof.value,realmProofHeight:height,coordinatorProofHeight:topHeight,sdkStitchedProofHeight:realmHeight+topHeight,cryptographicVerification:false});
  }catch(error){if(!isMissingCheckpointSpine(error,cp))throw error;observations.push({checkpointId:cp,status:'missing-checkpoint-spine',cryptographicVerification:false});}
 }
 const [leaf,rawHash]=await Promise.all([
  state.rpc(realmUrl,'psy_get_user_leaf_data',{checkpoint_id:commonCheckpoint,user_id:actorId},{exactIntegers:true}),
  state.rpc(realmUrl,'psy_get_user_tree_leaf_hash',{checkpoint_id:commonCheckpoint,user_id:actorId}),
 ]);
 const actor=assertMaterializedActorObservation({actorId,approvedActor,checkpointId:commonCheckpoint,validUntilCheckpoint,leaf,rawHash});
 const current=observations.find(o=>o.checkpointId===commonCheckpoint);
 if(current?.status==='available-observation')assert.equal(current.rawUserLeafHash,rawHash,'proof/raw leaf observations differ');
 return {schema:1,profile:'ordinary-checkpoint-readiness-observation-v1',network:state.networkName,actorId,failedCheckpoint,validUntilCheckpoint,
  actorRealmCheckpoint:actorHead,coordinatorCheckpoint:coordinatorHead,commonCheckpoint,observations,actor,
  startupReadsObservedReady:actorHead<=coordinatorHead&&current?.status==='available-observation',cryptographicVerification:false,
  signingFieldsAdded:false,sourceCheckpointSelected:false,financialOperations:0,broadcast:false,
  scope:'Bounded configured public reads only. No proof/key/resource/finality acceptance. Native still chooses and fully verifies its actual session; caller must repeat original dependency/domain/identity/expiry/fee guards. No transaction retry is authorized by this report.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 assert.equal(process.argv.length,4,'PUBLIC_INPUT_JSON FRESH_PUBLIC_REPORT_JSON');
 const input=parseLosslessJson(await readFile(process.argv[2],'utf8'));
 // Public JSON uses safe numeric IDs/checkpoints; retain the nonce as string.
 for(const name of ['actorId','failedCheckpoint','validUntilCheckpoint'])input[name]=Number(input[name]);input.approvedActor.userId=Number(input.approvedActor.userId);
 const report=await checkOrdinaryCheckpointReadiness(input);await writeFile(process.argv[3],losslessJson(report)+'\n',{flag:'wx'});
 console.log(JSON.stringify({report:process.argv[3],startupReadsObservedReady:report.startupReadsObservedReady,financialOperations:0,broadcast:false}));
}
