// Explicit operator recovery only. Reconcile first; resend the SAME signed UPS
// once, without re-signing, repricing, refreshing the nonce or extending expiry.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from '../requestBinding.mjs';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {save,run} from '../../batching/admission/liveSupport.mjs';
import {receiptReader} from '../chainReceipts.mjs';
export function validateExactRecovery({intent,manifest,verification,requestBytes,originalBytes,manifestBytes,preflight}) {
 assert.equal(intent.status,'broadcast-intent');assert.equal(intent.proof.manifestSha256,sha256(manifestBytes));
 assert.equal(sha256(requestBytes),manifest.requestSha256);assert.deepEqual(requestBytes,originalBytes,'original signed request must be identical');
 assert.equal(verification.fullUpsVerified,true);assert.equal(verification.exactStackAndSessionVerified,true);assert.equal(verification.reproved,false);
 assert.equal(verification.requestSha256,manifest.requestSha256);assert.equal(verification.preparedManifestSha256,intent.proof.manifestSha256);
 assert.equal(preflight.fullUpsVerified,true);assert.equal(preflight.exactStackAndSessionVerified,true);assert.equal(preflight.benchmarkSourceCheckpoint,null);
 assert.equal(preflight.core.new_user_leaf.user_id,BigInt(intent.scope.vaultId));assert.equal(preflight.core.state_transition.end_user_leaf_hash,verification.endUserLeafHash);
 assert.equal(preflight.core.new_user_leaf.nonce,verification.nonce);return {userId:Number(intent.scope.vaultId),endUserLeafHash:verification.endUserLeafHash,minCheckpoint:Number(preflight.core.checkpoint_id)};
}
export async function recoverExact(base,journal,out,operation='activation') {
 const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),inside=p=>{const q=resolve(p);assert.ok(q.startsWith(resolve(base)+'/'),'case path escape');return q;};
 assert.ok(['activation','nft-start','market'].includes(operation));assert.ok(!existsSync(out),'preserve previous recovery');inside(out);inside(journal);
 const intent=exact(journal),p=intent.proof,prepared=inside(p.preparedDirectory),send=inside(p.submissionDirectory),manifestBytes=readFileSync(join(prepared,'prepared.json')),manifest=exact(join(prepared,'prepared.json')),verification=exact(join(send,'verification.json')),preflight=exact(join(prepared,'preflight.json'));
 const identity=validateExactRecovery({intent,manifest,verification,requestBytes:readFileSync(join(prepared,'request.json')),originalBytes:readFileSync(join(send,'request.json')),manifestBytes,preflight});
 const registrations=['orderbook','bondingcurve','nftmarket'].map(kind=>({kind,...exact(join(base,'markets-v1',kind,'live-registration.json'))})),reg=registrations.find(r=>Number(r.vaultId)===identity.userId);assert.ok(reg,'only these new isolated market vaults');assert.equal(reg.fingerprint,intent.scope.fingerprint);assert.equal(reg.publicKeyHash,preflight.core.new_user_leaf.public_key);assert.ok(['batch_maintenance','batch_commit','batch_settle'].includes(intent.task.kind));const calls=JSON.parse(intent.task.submission).contract_calls;assert.ok(calls.some(c=>c.contract_id===Number(reg.marketId)),'original market call required');if(operation!=='market'){assert.equal(reg.kind,'nftmarket');assert.equal(intent.task.kind,'batch_maintenance');assert.ok(calls.some(c=>c.contract_id===Number(reg.marketId)&&c.method_name===(operation==='activation'?'activate':'start_epoch')),'explicit reviewed NFT operation');}
 const config=join(base,'public/rpc.json'),reader=await receiptReader(config),receipt=await reader(identity);
 const review={at:new Date().toISOString(),originalJournal:journal,originalJournalSha256:sha256(readFileSync(journal)),originalRequestSha256:manifest.requestSha256,identity,priorReceipt:receipt,originalIntentStillAuthoritative:true,automaticRetry:false,newProof:false,newBusinessOperation:false,expiryExtended:false,scope:'explicit single exact-request retransmission after receipt reconciliation; original may still execute. At-most-once asset transition relies on identical start/end leaf and nonce constraints; neither a missing receipt nor SDK Submittable proves queue absence'};
 save(out+'-review.json',review);if(receipt.status==='included')return receipt;
 const tools=exact(join(base,'public/TOOLS.json')),binary=tools.binaries.compact.file;assert.equal(tools.sdkManifestSha256,'0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425');assert.equal(sha256(readFileSync(binary)),tools.binaries.compact.sha256);
 const policy=join(base,'public',operation==='activation'?'three-setup-nftmarket-executor':'three-trade-'+reg.kind+'-executor','policy.json');
 const once=join(base,'public','exact-prepared-'+identity.endUserLeafHash+'-once-v2.json');save(once,{...review,operation,maximumTransmissions:1});
 // Native broadcast-prepared re-verifies all files, full UPS, signature context,
 // live code/layout/registration, fee, expiry and exact current anchor/nonce.
 // Its fresh directory writes an intent and transmits once; no proof creation.
 return run(binary,['broadcast-prepared',policy,config,join(dirname(prepared),'calls.json'),join(dirname(prepared),'guard.json'),prepared,p.manifestSha256,out],out+'.native.log',{PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await recoverExact(...process.argv.slice(2));
