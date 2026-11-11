// Host journal/transport fault tests, not browser or network payment acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createStagedWallet} from './staged.mjs';
import {createNativeCommitmentVerifier} from './nativeBackend.mjs';
import {reviewCommitmentConfirmation} from './commitmentReview.mjs';
import {commitmentCapsule} from './commitmentCapsule.mjs';
import {publicManifest,stablePublic,shaPublic} from './capsule.mjs';
import {validateCommitmentRecord} from './commitments.mjs';
import {canonical} from '../protocol.mjs';
import {parseLosslessJson,losslessJson} from '../../amm/u124/client.mjs';
import {AUDIT_MANIFEST,AUDIT_PROFILE,AUDIT_CHAIN_ROOT} from '../nativeProtocol.mjs';
const H=s=>createHash('sha256').update(s).digest('hex');
const call={callerContractId:'4294967296',contractId:'42',methodId:'7',methodName:'private_claim',inputCount:86,inputsHash:H('parameters')};
function fixture(){
 const network={name:'testnet',magic:'1384803358401154921',chainRootAt1:AUDIT_CHAIN_ROOT};
 const context={origin:'https://wallet-test.example',account:H('account'),fingerprint:H('key'),chainKey:H('chain'),userId:300,networkHash:H(canonical(network))};
 const record={schema:3,recordId:H('record'),registryHash:H('registry'),request:{userId:300},snapshot:{user:{publicKeyHash:context.account}},plan:{financialAuthorization:false,userId:300,recipientId:300,network,nativeProtocol:AUDIT_PROFILE,sdkManifestSha256:AUDIT_MANIFEST,verifierPackSha256:H('pack'),startUserLeafHash:H('start'),walletNonce:'8',startCheckpoint:100,validUntilCheckpoint:164,maxNetworkFee:'5000000000',callCommitments:[structuredClone(call)]}};
 const report={fullProofVerified:true,fullCallsBound:true,sessionBound:true,sigHashBound:true,endpointsAndFeesBound:true,publicProjectionBound:true,callCommitments:[structuredClone(call),{...call,contractId:'0',methodId:'3',methodName:'burn',inputCount:1,inputsHash:H('fee')}],actualFee:'1000005000',endUserLeafHash:H('end'),sigHash:H('sig'),sessionHash:H('session'),fingerprint:context.fingerprint,contentHash:H('content'),userId:300,nonce:'8',sdkManifestSha256:AUDIT_MANIFEST,verifierPackSha256:H('pack')};
 report.claimOutputs=[{kind:'ft-credit',assetId:'42',recipientId:'300',amountBaseUnits:'1000000000000000000000000123',codeRoot:H('code'),layoutRoot:H('layout'),functionRoot:H('functions')}];
 const memory=new Map();let sends=0,prepares=0,known=false,saveFailure=null;
 const store={get:async k=>structuredClone(memory.get(k)),set:async(k,v)=>{if(saveFailure?.(v))throw Error('Storage fault');memory.set(k,structuredClone(v));}};
 const tails=new Map();
 const exclusive=async(k,fn)=>{const prior=tails.get(k)??Promise.resolve(),next=prior.catch(()=>{}).then(fn);tails.set(k,next);try{return await next;}finally{if(tails.get(k)===next)tails.delete(k);}};
 const backend={
  prepareOnly:async()=>{prepares++;return commitmentCapsule({record,context,requestJson:'{"public":"request"}',verificationBundleJson:'{"public":"proofs"}',report});},
  verifyPrepared:async(r,p)=>({...report,requestSha256:p.requestSha256,manifestSha256:p.manifestSha256}),
  recheck:async(r,p)=>({requestSha256:p.requestSha256,identityAndDependenciesVerified:true,fullStateAndNonceVerified:true,feesVerified:true,checkpoint:101}),
  broadcastExact:async(bytes,sha)=>{sends++;assert.equal(H(bytes),sha);assert.ok([...memory.values()].some(s=>s.entries.some(e=>e.phase==='broadcast-intent')));throw Error('Lost response');},
  reconcile:async p=>known?{status:'included',success:true,requestSha256:p.requestSha256,userId:300,endUserLeafHash:p.endUserLeafHash,contentHash:p.contentHash,networkHash:p.networkHash,checkpoint:102,commonCheckpoint:102,commonNonce:'8',commonLeafHash:p.endUserLeafHash}:{status:'unresolved'},
 };
 const make=(options={})=>createStagedWallet({store,backend,exclusive,verifyRecord:async r=>{validateCommitmentRecord(r);assert.deepEqual(r,record);},confirmBroadcast:async terms=>{assert.ok(!('fullCalls'in terms));return{approved:true,approvalSha256:H(canonical(terms))};},...options});
 return{context,record,report,store,memory,backend,make,get sends(){return sends;},get prepares(){return prepares;},set known(v){known=v;},set saveFailure(v){saveFailure=v;}};
}
test('commitment journal sends once, retains unknown hold and reconciles exact identity after restart',async()=>{
 const f=fixture(),p=await f.make().prepare(f.context,f.record);
 assert.equal(p.phase,'prepared');
 const raw=JSON.stringify([...f.memory.values()]);
 for(const forbidden of ['fullCalls','"inputs":','random0','sign_witness','cfc_witness'])assert.ok(!raw.includes(forbidden));
 await f.make().broadcast(f.context,p.intentId,p.preparedHash);
 await f.make().broadcast(f.context,p.intentId,p.preparedHash);
 await assert.rejects(f.make().cancelPreparation(f.context,p.intentId));
 await assert.rejects(f.make().assertNoPending(f.context));
 await assert.rejects(f.make().prepare({...f.context,origin:'https://other.example'},f.record),/nonce reserved/);
 const ordinary={...structuredClone(f.record),schema:2,recordId:H('ordinary'),plan:{...structuredClone(f.record.plan),calls:[]}};
 await assert.rejects(f.make({verifyRecord:async()=>{}}).prepare(f.context,ordinary),/nonce reserved/);
 assert.equal((await f.make().reconcile(f.context,p.intentId)).phase,'unresolved');
 f.known=true;
 assert.equal((await f.make().reconcile(f.context,p.intentId)).phase,'included');
 assert.equal(await f.make().assertNoPending(f.context),true);
 assert.equal(f.sends,1);assert.equal(f.prepares,1);
});
for(const mode of ['raw-inputs','nested-witness','extra-call','missing-call','caller','parameters','fee-commitment','projection','pack','nonce','fee','fee-in-budget','session','network'])test('refuses '+mode+' before retaining a private capsule',async()=>{
 const f=fixture();
 if(mode==='nested-witness')f.record.snapshot.user.secret='MUST_NOT_PERSIST';
 else if(mode==='projection')f.report.publicProjectionBound=false;
 else {
  const prepare=f.backend.prepareOnly;
  f.backend.prepareOnly=async()=>{const p=await prepare();
   if(mode==='raw-inputs')p.fullCalls=[{inputs:['MUST_NOT_PERSIST']}];
   if(mode==='extra-call')p.callCommitments.push({...call});
   if(mode==='missing-call')p.callCommitments.shift();
   if(mode==='caller')p.callCommitments[0].callerContractId='1';
   if(mode==='parameters')p.callCommitments[0].inputsHash=H('other');
   if(mode==='fee-commitment')p.callCommitments.at(-1).inputsHash=H('other fee');
   if(mode==='pack')p.verifierPackSha256=H('other pack');
   if(mode==='nonce')p.walletNonce='9';
   if(mode==='fee')p.actualFee='9000000000';
   if(mode==='fee-in-budget')p.actualFee='1000005001';
   if(mode==='session')p.sessionHash=H('other session');
   if(mode==='network')p.networkHash=H('other network');
   p.manifestSha256=await shaPublic(stablePublic(publicManifest(p)));
   return p;};
 }
 await assert.rejects(f.make().prepare(f.context,f.record));
 const raw=JSON.stringify([...f.memory.values()]);assert.ok(!raw.includes('MUST_NOT_PERSIST'));
 for(const s of f.memory.values())for(const e of s.entries)assert.equal(e.prepared,undefined);
 assert.equal(f.sends,0);
});
test('two service/store wrappers share authority and prevent duplicate preparation or send',async()=>{
 const f=fixture(),a=f.make(),b=f.make({store:{get:f.store.get,set:f.store.set}});
 const [p,q]=await Promise.all([a.prepare(f.context,f.record),b.prepare(f.context,f.record)]);
 assert.deepEqual(p,q);assert.equal(f.prepares,1);
 await Promise.all([a.broadcast(f.context,p.intentId,p.preparedHash),b.broadcast(f.context,q.intentId,q.preparedHash)]);
 assert.equal(f.sends,1);
});
test('storage failure before send refuses transport; failure after send retains intent without resend',async()=>{
 for(const phase of ['broadcast-intent','unresolved']){
  const f=fixture(),p=await f.make().prepare(f.context,f.record);
  f.saveFailure=s=>s.entries.some(e=>e.phase===phase);
  await assert.rejects(f.make().broadcast(f.context,p.intentId,p.preparedHash));
  assert.equal(f.sends,phase==='broadcast-intent'?0:1);
  f.saveFailure=null;
  if(phase==='unresolved'){
   assert.equal((await f.make().list(f.context))[0].phase,'broadcast-intent');
   await f.make().broadcast(f.context,p.intentId,p.preparedHash);
   assert.equal(f.sends,1);
  }
 }
});
test('stale fresh-check, denied approval and wrong original receipt keep the account protected',async()=>{
 const f=fixture(),p=await f.make().prepare(f.context,f.record);
 await assert.rejects(f.make({confirmBroadcast:async()=>({approved:false})}).broadcast(f.context,p.intentId,p.preparedHash));
 const fresh=f.backend.recheck;f.backend.recheck=async(r,p)=>({...await fresh(r,p),fullStateAndNonceVerified:false});
 await assert.rejects(f.make().broadcast(f.context,p.intentId,p.preparedHash));assert.equal(f.sends,0);
 f.backend.recheck=fresh;await f.make().broadcast(f.context,p.intentId,p.preparedHash);f.known=true;
 const reconcile=f.backend.reconcile;f.backend.reconcile=async p=>({...await reconcile(p),contentHash:H('other')});
 await assert.rejects(f.make().reconcile(f.context,p.intentId));
 await assert.rejects(f.make().assertNoPending(f.context));assert.equal(f.sends,1);
});
const wasm=process.env.PSY_PRIVATE_FT_RECOVERY_WASM,source=process.env.PSY_PRIVATE_FT_STACK_FIXTURE;
test('actual preserved complete UPS yields public commitments and rejects secret-bearing JSON before storage',{skip:!wasm||!source},async()=>{
 const native=createRequire(import.meta.url)(resolve(wasm));
 const read=name=>readFileSync(join(source,name+'.json'),'utf8');
 const request=read('request'),approval=read('approval'),bundle=read('bundle');
 const actual=JSON.parse(native.verify_market_prepared(request,approval,bundle));
 assert.equal(actual.publicProjectionBound,true);assert.equal(actual.callCommitments.length,2);
 assert.equal(actual.callCommitments[0].inputCount,86);
 const f=fixture(),a=JSON.parse(approval);
 f.context.userId=actual.userId;f.context.account=a.public_key;f.context.fingerprint=actual.fingerprint;
 Object.assign(f.record.request,{userId:actual.userId});f.record.snapshot.user.publicKeyHash=a.public_key;
 Object.assign(f.record.plan,{userId:actual.userId,recipientId:actual.userId,walletNonce:actual.nonce,startUserLeafHash:a.start_leaf,startCheckpoint:a.checkpoint_min,validUntilCheckpoint:a.checkpoint_max,maxNetworkFee:String(a.max_fee),verifierPackSha256:actual.verifierPackSha256,callCommitments:actual.callCommitments.slice(0,-1)});
 f.backend.prepareOnly=()=>commitmentCapsule({record:f.record,context:f.context,requestJson:request,verificationBundleJson:bundle,report:actual});
 f.backend.verifyPrepared=createNativeCommitmentVerifier({
  native:{identity:()=>native.verifier_identity(),verify:(...args)=>native.verify_market_prepared(...args)},
  expectedVerifierPackSha256:actual.verifierPackSha256,stringify:losslessJson,
  useEphemeralApproval:async(r,p,consume)=>{const a=parseLosslessJson(approval);try{await consume(a);}finally{a.calls.forEach(c=>c.inputs.fill('0'));}},
 });
 assert.equal(actual.claimOutputs[0].amountBaseUnits,String(BigInt(a.calls[0].inputs[4])+(BigInt(a.calls[0].inputs[5])<<62n)));
 const output=actual.claimOutputs[0],catalogue=Object.freeze([Object.freeze({contractId:output.assetId,profile:'u124_private_compact_v2',codeRoot:output.codeRoot,layoutRoot:output.layoutRoot,functionRoot:output.functionRoot,decimals:18,symbol:'QAFT'})]);
 const service=f.make({confirmBroadcast:async terms=>{const reviewed=await reviewCommitmentConfirmation(terms,catalogue);assert.equal(reviewed.rows.find(r=>r.label==='Base units').value,output.amountBaseUnits);return{approved:true,approvalSha256:reviewed.approvalSha256};}});
 const p=await service.prepare(f.context,f.record);assert.equal(p.phase,'prepared');
 await service.broadcast(f.context,p.intentId,p.preparedHash);
 assert.equal(f.sends,1);await assert.rejects(service.assertNoPending(f.context));
 assert.ok(!JSON.stringify([...f.memory.values()]).includes('"inputs":'));
 for(const target of ['request','bundle']){
  const g=fixture();Object.assign(g.context,f.context);Object.assign(g.record,structuredClone(f.record));
  const contaminated=parseLosslessJson(target==='request'?request:bundle);contaminated.sign_witness='MUST_NOT_PERSIST';
  const badRequest=target==='request'?losslessJson(contaminated):request,badBundle=target==='bundle'?losslessJson(contaminated):bundle;
  let result;try{result=JSON.parse(native.verify_market_prepared(badRequest,approval,badBundle));}catch{}
  if(result)assert.equal(result.publicProjectionBound,false);
  const report=actual;
  g.backend.prepareOnly=()=>commitmentCapsule({record:g.record,context:g.context,requestJson:badRequest,verificationBundleJson:badBundle,report});
  g.backend.verifyPrepared=f.backend.verifyPrepared;
  await assert.rejects(g.make().prepare(g.context,g.record));
  assert.ok(!JSON.stringify([...g.memory.values()]).includes('MUST_NOT_PERSIST'));
 }
 const badFull=parseLosslessJson(request);badFull.proof.push(0n);
 assert.throws(()=>native.verify_market_prepared(losslessJson(badFull),approval,bundle));
 const mutated=parseLosslessJson(bundle);mutated.steps[0].cfc_proof_b64=Buffer.concat([Buffer.from(mutated.steps[0].cfc_proof_b64,'base64'),Buffer.from([0])]).toString('base64');
 assert.throws(()=>native.verify_market_prepared(request,approval,losslessJson(mutated)));
});
