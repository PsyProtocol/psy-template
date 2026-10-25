// Explicit reviewed QA original-only delivery. Both sends describe the same
// immutable nonce/start/end transition; never creates a replacement operation.
import assert from'node:assert/strict';
import{readFileSync,readdirSync,mkdirSync,existsSync}from'node:fs';import{join,dirname}from'node:path';import{fileURLToPath}from'node:url';
import{parseLosslessJson}from'../../amm/u124/client.mjs';
import{validateExactRecovery}from'./exactPreparedRecovery.mjs';
import{sha256}from'../requestBinding.mjs';import{save,run}from'../../batching/admission/liveSupport.mjs';
import{receiptReader}from'../chainReceipts.mjs';import{freezeAppModules}from'./sourceClosure.mjs';
import{insideCase}from'../../composition/acceptance/receiptRequestLocator.mjs';
const[base,reviewFlag]=process.argv.slice(2);assert.equal(reviewFlag,'--reviewed-original-only-once');
const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),rec=join(base,'unused-sponsorship-exit-v1');
freezeAppModules(fileURLToPath(import.meta.url),base,'sponsor-original-only-delivery-v1');
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&e.name!=='drivers'?walk(join(d,e.name)):e.isFile()?[join(d,e.name)]:[]);
const intents=walk(join(rec,'runtime-unused-sponsor-exit')).filter(p=>p.endsWith('-broadcast-intent.json'));
assert.equal(intents.length,1,'only first sender-return transmission may be recovered here');
const source=intents[0],intent=exact(source),p=intent.proof,prepared=insideCase(base,p.preparedDirectory),send=insideCase(base,p.submissionDirectory),manifestBytes=readFileSync(join(prepared,'prepared.json')),manifest=exact(join(prepared,'prepared.json')),preflight=exact(join(prepared,'preflight.json'));
const identity=validateExactRecovery({intent,manifest,verification:exact(join(send,'verification.json')),requestBytes:readFileSync(join(prepared,'request.json')),originalBytes:readFileSync(join(send,'request.json')),manifestBytes,preflight});
assert.equal(identity.userId,662720);assert.equal(preflight.core.new_user_leaf.nonce,47n);assert.equal(intent.scope.fingerprint,'df90e0aab5a0b651fee95123523de98d16b25241d0e2f2e4091b9fdb3f93ecc6');
const task=parseLosslessJson(intent.task.submission),refund=task.contract_calls.find(c=>c.contract_id===2497n&&c.method_name==='recover_funding');
assert.deepEqual(refund.inputs,[519360n,0n,0n,0n,0n,5_000_500_000n,4n]);
const failure=exact(join(send,'failure.json'));assert.equal(failure.broadcastMayHaveBeenAttempted,true);assert.equal(failure.automaticRetry,false);assert.equal(failure.phase,'broadcast-compact-ups');
const config=join(rec,'public/rpc.json'),observed=await(await receiptReader(config))(identity),out=join(dirname(prepared),'reviewed-original-delivery-v1');
assert.ok(!existsSync(out),'prior manual delivery exists; reconcile without another send');
save(out+'-review.json',{at:new Date().toISOString(),identity,originalJournal:source,originalJournalSha256:sha256(readFileSync(source)),originalRequestSha256:manifest.requestSha256,priorReceipt:observed,automaticRetry:false,newProof:false,newBusiness:false,expiryExtended:false,scope:'one operator-reviewed delivery of the exact original sender-only QA sponsor return; original may still execute'});
if(observed.status==='included'){console.log('original already exactly included; no transmission');process.exit(0);}
const release=exact(join(base,'public/RELEASE.json')),binary=release.binaries.compact;assert.equal(release.sdkManifestSha256,'0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425');assert.equal(sha256(readFileSync(binary.file)),binary.sha256);
save(join(send,'reviewed-exact-delivery-fence-v1.json'),{at:new Date().toISOString(),out,originalRequestSha256:manifest.requestSha256,maximumAdditionalTransmissions:1,reproved:false,nonce:47,scope:'linked immutable request; original intent and failure remain authoritative'});
const policy=join(rec,'public/unused-sponsor-exit-orderbook-executor/policy.json');
// All crypto, sig_hash/call stack, fees, identity, live roots, nonce/start and
// expiry are checked by the unchanged pinned native broadcast-prepared path.
await run(binary.file,['broadcast-prepared',policy,config,join(dirname(prepared),'calls.json'),join(dirname(prepared),'guard.json'),prepared,p.manifestSha256,out],out+'.native.log',{PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'});
console.log('identical prepared sponsor return delivered once; original journal reconciliation continues');
