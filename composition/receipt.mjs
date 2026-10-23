// Read-only exact-UPS observation. No proof generation, send, replacement nonce,
// market authorization or compensation transaction exists in this module.
import assert from'node:assert/strict';
import{readFileSync,lstatSync,mkdirSync,writeFileSync}from'node:fs';
import{join}from'node:path';import{createHash}from'node:crypto';
import{execFile}from'node:child_process';import{promisify}from'node:util';
import{parseLosslessJson}from'../amm/u124/client.mjs';
import{receiptReader}from'../executor/chainReceipts.mjs';
import{publicState}from'../executor/publicState.mjs';
import{recordIncluded,recoveryPlan}from'./workflow.mjs';
import{saveObservation}from'../executor/observations.mjs';
const execute=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
const SDK='0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425';
const VERIFIER='0f3f359d65340eb80a6069cc85c34991425cef210e5f85c8dd399ce68f498c69';
function regular(path){const s=lstatSync(path);assert.ok(s.isFile()&&!s.isSymbolicLink(),'regular evidence file required');return readFileSync(path);}
export function bindPendingRequest(state,bytes){
 assert.equal(recoveryPlan(state).action,'reconcile-exact-original','only an already recorded broadcast can be observed');
 const p=state.pending,request=parseLosslessJson(bytes.toString()),core=request.user_ec_input?.core;
 assert.equal(sha(bytes),p.requestHash,'original request bytes');assert.ok(Array.isArray(request.proof)&&request.proof.length>0&&request.proof.length<8*1024*1024);
 const proof=Buffer.from(request.proof.map(n=>{assert.ok(typeof n==='bigint'&&n>=0n&&n<=255n,'canonical proof byte');return Number(n);}));assert.equal(sha(proof),p.proofHash,'original proof bytes');
 assert.equal(core.new_user_leaf.user_id,p.caller);assert.equal(core.state_transition.user_id,p.caller);assert.equal(core.new_user_leaf.nonce,p.nonce);assert.equal(core.checkpoint_id,p.sourceCheckpoint);assert.equal(core.new_user_leaf.last_checkpoint_id,core.checkpoint_id);
 assert.equal(core.state_transition.start_user_leaf_hash,p.startLeaf);assert.equal(core.state_transition.end_user_leaf_hash,p.endLeaf);
 const expectedKey=p.caller===state.intent.terms.execution.vaultId?state.intent.terms.execution.publicKeyHash:state.plan.registry.value.markets.find(m=>m.vaultId===p.caller)?.publicKeyHash;
 if(expectedKey)assert.equal(core.new_user_leaf.public_key,expectedKey,'stage key identity');
 const fee=core.stats.guta_fees_collected+core.stats.da_fees_collected;assert.ok(typeof fee==='bigint'&&fee>=0n);
 return{core,fee,requestSha256:sha(bytes),proofSha256:sha(proof)};
}
export function includedObservation(state,bound,result,commonCheckpoint){
 assert.equal(result.status,'included');assert.equal(result.receipt.success,true);const p=state.pending,d=result.receipt.data;
 assert.equal(BigInt(result.userId),p.caller);assert.equal(result.endUserLeafHash,p.endLeaf);assert.equal(d.content_hash,result.contentHash);assert.equal(d.status,'included');assert.equal(d.tx_type,'UserEndcap');assert.equal(BigInt(d.included_checkpoint_id),BigInt(result.checkpoint));assert.equal(BigInt(d.result.user_id),p.caller);
 for(const k of ['slots_modified','total_transactions','user_ops_processed'])assert.equal(BigInt(d.result[k]),bound.core.stats[k],'receipt/proof stats '+k);
 assert.equal(BigInt(d.result.fees_collected),bound.fee,'receipt/proof fee');
 return{requestHash:p.requestHash,contentHash:result.contentHash,endLeaf:p.endLeaf,caller:p.caller,nonce:p.nonce,checkpoint:BigInt(result.checkpoint),commonCheckpoint:BigInt(commonCheckpoint),fee:bound.fee};
}
export async function observeExactStage({state,requestPath,rpcConfig,rpcConfigSha256,domainHash,sdkManifestHash,verifier,out}){
 // This binary verifies the pinned isolated InternalTestnet end-cap key/common
 // data only. No automatic production-domain or SDK-version fallback exists.
 assert.equal(state.intent.terms.domainHash,domainHash);assert.equal(sdkManifestHash,SDK);assert.equal(state.intent.terms.sdkManifestHash,SDK);
 const config=regular(rpcConfig),binary=regular(verifier),bytes=regular(requestPath);assert.equal(sha(config),rpcConfigSha256,'frozen RPC configuration');assert.equal(sha(binary),VERIFIER,'reviewed offline verifier');
 const bound=bindPendingRequest(state,bytes),c=JSON.parse(config),network=c.networks[c.defaultNetwork];assert.equal(BigInt(network.magic),1384803358401154921n,'only explicit isolated proof profile supported');
 mkdirSync(out,{recursive:false,mode:0o700});const requestCopy=join(out,'request.json'),configCopy=join(out,'rpc.json'),report=join(out,'verification.json');writeFileSync(requestCopy,bytes,{flag:'wx',mode:0o600});writeFileSync(configCopy,config,{flag:'wx',mode:0o600});
 saveObservation(join(out,'INPUTS.json'),{requestSha256:bound.requestSha256,proofSha256:bound.proofSha256,rpcConfigSha256,domainHash,sdkManifestHash,verifierSha256:VERIFIER,broadcast:false,businessAuthorizationVerified:false});
 let verified;try{verified=await execute(verifier,[requestCopy,report],{timeout:120000,maxBuffer:2000000});}
 catch(error){writeFileSync(join(out,'verification.log'),String(error.stdout??'')+'\n'+String(error.stderr??''),{flag:'wx'});saveObservation(join(out,'OBSERVATION.json'),{status:'verification-rejected',originalIdentityRetained:true,newBusinessOperationAllowed:false,businessAuthorizationVerified:false,broadcast:false});throw error;}
 writeFileSync(join(out,'verification.log'),verified.stdout+'\n'+verified.stderr,{flag:'wx'});assert.equal(sha(regular(verifier)),VERIFIER,'verifier changed');
 const v=parseLosslessJson(regular(report).toString());assert.equal(v.fullProofVerifiedAgainstPinnedNodeKeyAndCommon,true);assert.equal(v.metadataEndpointsAndFeesVerified,true);assert.equal(v.requestSha256,bound.requestSha256);assert.equal(v.publicKeyHash,bound.core.new_user_leaf.public_key);assert.equal(v.userId,state.pending.caller);assert.equal(v.nonce,state.pending.nonce);assert.equal(v.sourceCheckpoint,state.pending.sourceCheckpoint);assert.equal(v.startUserLeafHash,state.pending.startLeaf);assert.equal(v.endUserLeafHash,state.pending.endLeaf);
 const find=await receiptReader(configCopy,{maxPages:100}),result=await find({userId:Number(state.pending.caller),endUserLeafHash:state.pending.endLeaf,minCheckpoint:Number(state.pending.sourceCheckpoint)});
 if(result.status!=='included'){saveObservation(join(out,'OBSERVATION.json'),{status:'unresolved',result,originalIdentityRetained:true,newBusinessOperationAllowed:false,broadcast:false});return{state,status:'unresolved'};}
 const snapshot=await publicState(configCopy);assert.equal(BigInt(snapshot.network.magic),1384803358401154921n);
 if(snapshot.checkpoint<result.checkpoint){saveObservation(join(out,'OBSERVATION.json'),{status:'unresolved',result,commonCheckpoint:snapshot.checkpoint,newBusinessOperationAllowed:false,broadcast:false});return{state,status:'unresolved'};}
 const event=includedObservation(state,bound,result,snapshot.checkpoint),next=recordIncluded(state,event);
 saveObservation(join(out,'OBSERVATION.json'),{status:'included',event,result,commonCheckpoint:snapshot.checkpoint,fullProofVerified:true,historicalLeafAndIndexedOccurrenceVerified:true,businessAuthorizationVerified:false,broadcast:false,runtimeImageAttested:false,scope:'exact inclusion observation only; controller/SD-key route authorization and financial adapter remain required'});
 return{state:next,status:'included',event};
}
