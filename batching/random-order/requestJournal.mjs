// Local candidate pinning only. These records never establish chain inclusion,
// accepted entropy, terminal order state, signing, spending or refund authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {ExecutionJournal} from '../../executor/journal.mjs';
import {encodeCandidateStatement,hashLimbs,validateBeaconEnvelope} from './statement.mjs';
import {requireQualifiedRandomSource} from './sourceGate.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const id=(domain,value)=>sha(domain+'\0'+JSON.stringify(value));
const exact=(v,keys)=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));assert.deepEqual(Object.keys(v).sort(),[...keys].sort(),'exact public record fields required');};
const digest=v=>{assert.equal(typeof v,'string');assert.match(v,/^[0-9a-f]{64}$/);};
const checkpoint=v=>{assert.equal(typeof v,'string');assert.match(v,/^[1-9]\d*$/);assert.ok(BigInt(v)<=0xffffffffn);return BigInt(v);};
const MAX_OBSERVATIONS=32;
const clone=v=>JSON.parse(JSON.stringify(v));
const observationKeys=['sourceId','chainRootAt1','round','drawCheckpoint','sealIncludedCheckpoint','seed','beaconProofSha256','sealInclusionProofSha256','finalityProofSha256'];
function observation(candidate,envelope){
 validateBeaconEnvelope(candidate,envelope);
 const value=Object.fromEntries(observationKeys.slice(0,6).map(k=>[k,envelope[k]]));
 // Normalize proof encodings to bytes before digesting; aliases cannot become
 // different observations. No raw proof or signing witness is saved here.
 for(const k of ['beaconProof','sealInclusionProof','finalityProof'])value[k+'Sha256']=sha(Buffer.from(envelope[k],'base64'));
 return value;
}
function validateObservation(candidate,value){
 exact(value,observationKeys);
 for(const k of ['sourceId','chainRootAt1','round','drawCheckpoint'])assert.equal(value[k],candidate[k],'original draw request changed');
 const cp=checkpoint(value.sealIncludedCheckpoint);assert.ok(cp>BigInt(candidate.cutoff)&&cp<=BigInt(candidate.sealByCheckpoint),'observed seal outside original schedule');hashLimbs(value.seed);
 for(const k of observationKeys.slice(6))digest(value[k]);
}
export class RandomRequestJournal{
 #journal;#encoded;#request;
 constructor(options){
  exact(options,['directory','candidate']);const {directory,candidate}=options;
  assert.equal(typeof directory,'string');assert.ok(directory.length);
  this.#encoded=encodeCandidateStatement(candidate);const c=this.#encoded.snapshot;
  this.#request=id('psy-random-candidate-request-v1',this.#encoded.fields);
  this.#journal=new ExecutionJournal({directory:join(directory,'random-candidates-v1'),network:'psy-random-candidate-v1:'+c.networkMagic+':'+c.chainRootAt1,vaultId:Number(c.vaultId),fingerprint:c.keyFingerprint});
 }
 #read=async()=>{
  const records=await this.#journal.records();let fixed=false;const seen=new Set();
  for(const record of records){
   const common=['status','requestSha256','scope','at'];assert.equal(typeof record.at,'string');
   if(record.status==='random-candidate-fixed'){
    exact(record,[...common,'candidate']);assert.equal(fixed,false,'duplicate fixed candidate');const stored=encodeCandidateStatement(record.candidate),storedId=id('psy-random-candidate-request-v1',stored.fields);assert.equal(record.requestSha256,storedId,'stored original candidate digest mismatch');
    if(storedId!==this.#request){const error=Error('original candidate must be retained; no new set, epoch, source or draw');error.code='RANDOM_CANDIDATE_IDENTITY_CONFLICT';error.retainedRequestSha256=storedId;error.requestedRequestSha256=this.#request;throw error;}
    assert.deepEqual(stored.fields,this.#encoded.fields,'stored candidate changed');fixed=true;
   }else{
    assert.ok(fixed,'candidate must be fixed before any observation');assert.equal(record.requestSha256,this.#request,'observation belongs to another request');
    if(record.status==='random-evidence-observed'){
     exact(record,[...common,'observationId','observation']);validateObservation(this.#encoded.snapshot,record.observation);assert.equal(record.observationId,id('psy-random-evidence-observation-v1',[this.#request,...observationKeys.map(k=>record.observation[k])]));
    }else if(record.status==='random-timeout-observed'){
     exact(record,[...common,'observationId','checkpoint']);assert.ok(checkpoint(record.checkpoint)>=BigInt(this.#encoded.snapshot.recoveryAt),'premature recovery observation');assert.equal(record.observationId,id('psy-random-timeout-observation-v1',[this.#request,record.checkpoint]));
    }else throw Error('unsupported random candidate record; no financial or terminal event accepted');
    assert.ok(!seen.has(record.observationId),'duplicate observation record');seen.add(record.observationId);assert.ok(seen.size<=MAX_OBSERVATIONS,'candidate observation capacity exceeded');
   }
  }
  return records;
 };
 get requestSha256(){return this.#request;}
 #report(records){
  const claims=records.filter(r=>r.status==='random-evidence-observed').map(r=>r.observation);const seeds=new Set(claims.map(o=>o.seed));
  return {schema:1,scope:'local candidate records, not chain sealing or authorization',requestSha256:this.#request,status:records.length?'fixed-awaiting-qualified-source':'not-fixed',candidate:clone(this.#encoded.snapshot),evidenceObservations:claims.length,conflictingUnverifiedSeedClaims:seeds.size>1,timeoutObservations:records.filter(r=>r.status==='random-timeout-observed').length,chainSealVerified:false,qualifiedSource:false,randomAuthorization:false,canSign:false,canBroadcast:false,canRefund:false};
 }
 async freeze(){return this.#journal.locked(async()=>{let records=await this.#read();if(!records.length){await this.#journal.append({status:'random-candidate-fixed',requestSha256:this.#request,candidate:this.#encoded.snapshot});records=await this.#read();}return this.#report(records);});}
 async inspect(){return this.#journal.locked(async()=>this.#report(await this.#read()));}
 async observe(envelope){
  const value=observation(this.#encoded.snapshot,envelope),observationId=id('psy-random-evidence-observation-v1',[this.#request,...observationKeys.map(k=>value[k])]);
  return this.#journal.locked(async()=>{const records=await this.#read();assert.ok(records.length,'candidate must be fixed first');if(!records.some(r=>r.observationId===observationId)){assert.ok(records.length-1<MAX_OBSERVATIONS,'candidate observation capacity reached; retain original request');await this.#journal.append({status:'random-evidence-observed',requestSha256:this.#request,observationId,observation:value});}return this.#report(await this.#read());});
 }
 async observeTimeout(cp){
  assert.ok(checkpoint(cp)>=BigInt(this.#encoded.snapshot.recoveryAt),'recovery checkpoint not reached');const observationId=id('psy-random-timeout-observation-v1',[this.#request,cp]);
  return this.#journal.locked(async()=>{const records=await this.#read();assert.ok(records.length,'candidate must be fixed first');if(!records.some(r=>r.observationId===observationId)){assert.ok(records.length-1<MAX_OBSERVATIONS,'candidate observation capacity reached; retain original request');await this.#journal.append({status:'random-timeout-observed',requestSha256:this.#request,observationId,checkpoint:cp});}return this.#report(await this.#read());});
 }
 async executionPlan(){await this.inspect();requireQualifiedRandomSource();}
 async recoveryPlan(){const report=await this.inspect();return {...report,recoveryStatus:'blocked-pending-authenticated-state-and-approved-contract',required:['authenticated original seal and current terminal state','reviewed timeout/refund contract and SD-key','fresh original-identity nonce, fees and exact UPS verification'],nextAction:'retain original candidate and reconcile authenticated state; no reroll, reseal or deterministic fallback'};}
}
