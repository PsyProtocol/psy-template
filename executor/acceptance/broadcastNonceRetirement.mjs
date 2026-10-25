// Requires explicit operator authorization for THIS fee-only recovery. Never
// run merely because the original receipt is missing. No signing or retries.
import assert from'node:assert/strict';import{readFileSync,mkdirSync}from'node:fs';import{join}from'node:path';import{fileURLToPath}from'node:url';
import{parseLosslessJson,losslessJson}from'../../amm/u124/client.mjs';import{publicState}from'../publicState.mjs';import{validateNonceRetirement,validatePriorOversizedRetirement}from'../nonceRetirement.mjs';import{sha256}from'../requestBinding.mjs';import{run,binding,confirmUps}from'../../batching/admission/liveSupport.mjs';import{freezeAppModules}from'./sourceClosure.mjs';import{publishFile}from'../durableFile.mjs';
import{userEndCapWire}from'../exactJsonWire.mjs';
const saveDurable=(path,value)=>publishFile(path,losslessJson(value)+'\n');
const[base,original,authorization,candidateName='nonce-retirement-candidate-v1']=process.argv.slice(2);assert.match(candidateName,/^nonce-retirement-candidate-v[1-9][0-9]*$/);assert.ok(['--authorized-noop-once','--authorized-compact-noop-once'].includes(authorization),'explicit human recovery authorization is required');const additional=authorization==='--authorized-compact-noop-once';freezeAppModules(fileURLToPath(import.meta.url),base,(additional?'authorized-compact-':'authorized-')+candidateName+'-source-v3');
const dir=join(base,candidateName),exact=p=>parseLosslessJson(readFileSync(p,'utf8')),review=exact(join(dir,'REVIEW.json')),input=exact(join(dir,'input.json')),preflight=exact(join(dir,'prepared/preflight.json')),raw=readFileSync(join(dir,'prepared/request.json')),request=parseLosslessJson(raw.toString());
// This one-off acceptance authorization is limited to this QA signer/nonce.
assert.equal(review.userId,1717440n);assert.equal(review.originalNonce,44n);assert.equal(review.publicKeyHash,'0110846a44285289643e8e32fb684be8c3006a419ce33d50d3351034db29dd2a');
assert.equal(sha256(raw),review.candidateRequestSha256);assert.equal(sha256(readFileSync(join(dir,'input.json'))),preflight.inputSha256);const identity=validateNonceRetirement({input,preflight,request,review});
if(additional){
 // This is a separately authorized recovery, never an automatic retry based
 // on HTTP status or expiry. Preserve the original one-send fence and unknown
 // outcome. The extra fence below permits at most one additional delivery.
 const prior=exact(join(base,'public','AUTHORIZED-RETIREMENT-SEND-'+identity.userId+'-'+identity.nonce+'.json'));
 validatePriorOversizedRetirement({priorFence:prior,priorRequestBytes:readFileSync(join(prior.out,'request.json')),priorResponseMeta:exact(join(prior.out,'rpc-response-meta.json')),priorResponseBody:readFileSync(join(prior.out,'rpc-response.body')),userId:identity.userId,nonce:identity.nonce});
}
const config=join(base,'baseline/public/rpc.json'),out=join(dir,additional?'authorized-compact-send-v1':'authorized-send-v1');mkdirSync(out,{mode:0o700});
const tools=JSON.parse(readFileSync(join(original,'public/TOOLS-v2.json'),'utf8')),verifier=tools.binaries.verifier;assert.equal(sha256(readFileSync(verifier.file)),verifier.sha256);
await run(verifier.file,[join(dir,'prepared/request.json'),join(out,'full-proof-verification.json')],join(out,'verification.log'),{RAYON_NUM_THREADS:'2'});
const v=exact(join(out,'full-proof-verification.json'));assert.equal(v.fullProofVerifiedAgainstPinnedNodeKeyAndCommon,true);assert.equal(v.metadataEndpointsAndFeesVerified,true);assert.equal(v.requestSha256,review.candidateRequestSha256);
const s=await publicState(config);assert.equal(s.networkName,'sepolia');assert.equal(BigInt(s.network.magic),0x1337CF514544CF69n);assert.ok(s.checkpoint>=Number(identity.sourceCheckpoint)&&s.checkpoint<=Number(input.validUntilCheckpoint),'prepared retirement expired; never silently re-sign');
const user=Number(identity.userId),realm=s.network.realm_configs.find(r=>r.id===Math.floor(user/s.network.users_per_realm));assert.ok(realm);assert.equal(realm.rpc_url[0].replace(/\/$/,''),'https://realm1-stg.psy-protocol.xyz');
for(const expected of input.contracts){const observed=await binding(s,Number(expected.contract.contractId));assert.deepEqual(parseLosslessJson(losslessJson(observed)),expected,'current dependency changed');}
const ownCp=s.heads[s.network.realm_configs.findIndex(r=>r.id===realm.id)].checkpoint_id;assert.ok(ownCp<=Number(input.validUntilCheckpoint),'own realm send window expired');
const args={checkpoint_id:ownCp,user_id:user},[leaf,currentHash]=await Promise.all([s.rpc(realm.rpc_url[0],'psy_get_user_leaf_data',args,{exactIntegers:true}),s.rpc(realm.rpc_url[0],'psy_get_user_tree_leaf_hash',args)]);
if(currentHash!==identity.start||BigInt(leaf.nonce)+1n!==identity.nonce){await saveDurable(join(out,'NOT-SENT.json'),{broadcast:false,currentHash,currentNonce:leaf.nonce,originalEnd:review.originalEnd,reason:'head advanced; reconcile original or confirmed conflict, never create another nonce'});console.log('head advanced; retirement not sent');process.exit(0);}
assert.equal(leaf.public_key,review.publicKeyHash);assert.equal(await s.slot(user,0,0)-identity.fee,BigInt('0x'+request.user_ec_input.contract_state_updates[0].updates[0].Positional.delta_proof.new_value.slice(-16)));
// Persist the original signed request unchanged. The RPC envelope embeds its
// exact numeric literals rather than round-tripping them through JS Number.
await publishFile(join(out,'request.json'),raw);await publishFile(join(out,'preflight.json'),readFileSync(join(dir,'prepared/preflight.json')));
const body=userEndCapWire(raw);await publishFile(join(out,'rpc-request.json'),body);
await saveDurable(join(out,'intent.json'),{status:'broadcast_intent',userId:identity.userId,nonce:identity.nonce,endUserLeafHash:identity.end,requestSha256:review.candidateRequestSha256,wireSha256:sha256(body),retryAllowed:false,operatorAuthorizedFeeOnlyRetirement:true});
await saveDurable(join(base,'public',(additional?'AUTHORIZED-COMPACT-RETIREMENT-SEND-':'AUTHORIZED-RETIREMENT-SEND-')+identity.userId+'-'+identity.nonce+'.json'),{userId:identity.userId,nonce:identity.nonce,requestSha256:review.candidateRequestSha256,out,retryAllowed:false,separatelyAuthorizedAdditionalCompactSend:additional,scope:'exclusive durable one-send fence across candidate generations; original fence and unknown outcome are preserved; additional delivery requires separate human authorization'});
try{
 const response=await fetch(realm.rpc_url[0],{method:'POST',headers:{'content-type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(120000)});const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;assert.ok(size<=65536,'oversized acknowledgement; outcome unknown');chunks.push(chunk);}const bytes=Buffer.concat(chunks);await publishFile(join(out,'rpc-response.body'),bytes);await saveDurable(join(out,'rpc-response-meta.json'),{httpStatus:response.status,automaticRetry:false,ackTimeoutSeconds:120});assert.ok(response.ok);const ack=JSON.parse(bytes.toString());assert.equal(ack.jsonrpc,'2.0');assert.equal(ack.id,1);assert.equal(ack.error,undefined);assert.ok(ack.result==='ok'||/^[a-f0-9]{64}$/.test(ack.result));await saveDurable(join(out,'receipt.json'),{submitted:true,included:false,receipt:ack.result,endUserLeafHash:identity.end});
}catch(e){await saveDurable(join(out,'UNKNOWN.json'),{status:'unresolved',broadcastMayHaveBeenAttempted:true,automaticRetry:false,endUserLeafHash:identity.end,nonce:identity.nonce,scope:'exact fee-only request transmitted at most once; reconcile both original and retirement before further business'});throw e;}
await confirmUps(config,out);console.log('fee-only nonce retirement exactly included; inspect original conflict before further business');
