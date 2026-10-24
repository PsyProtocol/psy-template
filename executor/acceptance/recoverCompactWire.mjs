// Explicit ONE exact-wire retry of a preserved compact transaction. No new
// proof, nonce, calls, fee or replacement business operation is created.
import assert from'node:assert/strict';import{readFileSync,existsSync,mkdirSync,writeFileSync}from'node:fs';import{join}from'node:path';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
import{loadOptions}from'../config.mjs';import{ExecutionJournal}from'../journal.mjs';import{createPublicWalletAdapter}from'../publicWalletAdapter.mjs';import{publicState}from'../publicState.mjs';
import{read,save,run}from'../../batching/admission/liveSupport.mjs';import{parseLosslessJson,losslessJson}from'../../amm/u124/client.mjs';import{execFile}from'node:child_process';import{promisify}from'node:util';
import{assertDurableRuntimeDirectory}from'../runtimeStorage.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),exact=p=>parseLosslessJson(readFileSync(p,'utf8'));
export function exactCompactWire(wire,request){
 const packet=parseLosslessJson(wire.toString('utf8'));assert.equal(packet.jsonrpc,'2.0');assert.equal(packet.id,1n);assert.equal(packet.method,'psy_submit_user_end_cap');assert.deepEqual(packet.params,parseLosslessJson(losslessJson(request)),'exact original transaction only');assert.ok(wire.length<8*1024*1024);return packet;
}
export function frozenRecoveryVerifier(toolsFile){
 const tools=read(toolsFile);assert.equal(tools.sdkManifestSha256,'0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425');const v=tools.binaries?.verifier;assert.ok(v&&typeof v.file==='string');assert.match(v.sha256,/^[0-9a-f]{64}$/);assert.equal(sha(readFileSync(v.file)),v.sha256,'frozen recovery verifier changed');return v;
}
export async function recoverCompactWire(config,out,toolsFile){
 assert.ok(toolsFile,'explicit frozen TOOLS.json required; no transient /tmp verifier fallback');const verifierBinding=frozenRecoveryVerifier(toolsFile);
 const o=await loadOptions(config);assertDurableRuntimeDirectory(o.runtimeDirectory);assertDurableRuntimeDirectory(out);
 assert.ok(!existsSync(out),'fresh evidence directory required');mkdirSync(out);
 const j=new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,vaultId:o.vaultId,fingerprint:o.fingerprint}),a=await createPublicWalletAdapter(o,{runDriver:promisify(execFile)});
 try{
  await j.reconcile(a.reconcile);const pending=await j.unresolved();
  if(!pending.length){save(join(out,'decision.json'),{at:new Date().toISOString(),status:'no-unresolved-original',broadcast:false});return;}
  assert.equal(pending.length,1);const original=pending[0],p=original.proof,send=p.submissionDirectory;
  const requestBytes=readFileSync(join(send,'request.json')),request=exact(join(send,'request.json')),wire=readFileSync(join(send,'rpc-request.json')),intent=exact(join(send,'intent.json')),manifest=read(join(p.preparedDirectory,'prepared.json'));
  exactCompactWire(wire,request);assert.equal(sha(requestBytes),manifest.requestSha256);assert.equal(intent.requestSha256,manifest.requestSha256);assert.equal(intent.endUserLeafHash,request.user_ec_input.core.state_transition.end_user_leaf_hash);assert.equal(intent.userId,BigInt(o.vaultId));assert.equal(intent.nonce,request.user_ec_input.core.new_user_leaf.nonce);
  const verifier=verifierBinding.file;assert.equal(sha(readFileSync(verifier)),verifierBinding.sha256);
  await run(verifier,[join(send,'request.json'),join(out,'verification.json')],join(out,'verification.log'));
  const v=read(join(out,'verification.json'));assert.equal(v.fullProofVerifiedAgainstPinnedNodeKeyAndCommon,true);assert.equal(v.metadataEndpointsAndFeesVerified,true);assert.equal(v.requestSha256,manifest.requestSha256);
  await j.locked(async()=>{
   const now=await j.unresolved();assert.deepEqual(now.map(x=>x.taskId),[original.taskId]);assert.ok(!(await j.records()).some(r=>r.taskId===original.taskId&&r.status==='exact-wire-recovery-intent'),'one recovery transmission per original identity');
   assert.equal(await a.validateProof(original.task,p),true,'original nonce/anchor/window/proof no longer current');assert.equal(await a.isCurrent(original.task),true,'original operation/identities/dependencies changed');
   const s=await publicState(o.rpcConfig),realm=s.network.realm_configs.find(r=>r.id===Math.floor(o.vaultId/s.network.users_per_realm)),url=realm?.rpc_url[0];assert.ok(['https://realm0-stg.psy-protocol.xyz','https://realm1-stg.psy-protocol.xyz'].includes(url));assert.ok(s.checkpoint>=v.sourceCheckpoint&&s.checkpoint<=Number(original.task.validUntilCheckpoint));
   const record={at:new Date().toISOString(),taskId:original.taskId,originalSubmissionDirectory:send,requestSha256:manifest.requestSha256,wireSha256:sha(wire),sourceCheckpoint:v.sourceCheckpoint,currentCheckpoint:s.checkpoint,validUntilCheckpoint:original.task.validUntilCheckpoint,userId:o.vaultId,nonce:v.nonce,endUserLeafHash:v.endUserLeafHash,configSha256:sha(readFileSync(config)),rpcConfigSha256:sha(readFileSync(o.rpcConfig)),verifierSha256:sha(readFileSync(verifier)),maximumRecoveryTransmissions:1,newProof:false,newNonce:false,newPayment:false,priorInclusion:'unresolved after exact receipt reconciliation'};
   writeFileSync(join(out,'request.json'),requestBytes,{flag:'wx'});writeFileSync(join(out,'rpc-request.json'),wire,{flag:'wx'});save(join(out,'intent.json'),record);await j.append({status:'exact-wire-recovery-intent',taskId:original.taskId,evidence:out,requestSha256:record.requestSha256,wireSha256:record.wireSha256});
   let result;
   try{const response=await fetch(url,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:wire,signal:AbortSignal.timeout(15000)}),body=await response.text();assert.ok(Buffer.byteLength(body)<=65536);result={httpStatus:response.status,body,included:false,reconciliationRequired:true,automaticRetry:false};writeFileSync(join(out,'rpc-response.body'),body,{flag:'wx'});save(join(out,'rpc-response-meta.json'),{httpStatus:response.status,truncated:false,automaticRetry:false});save(join(out,'response.json'),result);}
   catch(error){result={name:error.name,included:false,reconciliationRequired:true,automaticRetry:false};save(join(out,'transport-unknown.json'),result);}
   await j.append({status:'exact-wire-recovery-result',taskId:original.taskId,evidence:out,result});
  });
  await j.reconcile(a.reconcile);save(join(out,'after.json'),{at:new Date().toISOString(),unresolved:(await j.unresolved()).map(x=>x.taskId),scope:'one exact original wire only; unknown remains pending, never permits a replacement'});
 }finally{await a.close?.();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const[config,out,tools]=process.argv.slice(2);assert.ok(config&&out&&tools,'CONFIG FRESH_OUT FROZEN_TOOLS_JSON');await recoverCompactWire(config,out,tools);}
