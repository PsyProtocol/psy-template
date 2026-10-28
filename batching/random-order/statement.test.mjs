import test from 'node:test';import assert from 'node:assert/strict';
import {encodeCandidateStatement,hashLimbs,validateBeaconEnvelope,authorizeRandomBatch} from './statement.mjs';
import {assertDeterministicOrdering} from './sourceGate.mjs';
import {generateBatch} from '../v2/generate.mjs';import {generateAdmission} from '../admission/generate.mjs';
import {fixture} from '../../amm/u124/generate.mjs';import {validateAdmissionPlan} from '../../executor/admissionReader.mjs';
const h=n=>BigInt(n).toString(16).padStart(64,'0');
const candidate=()=>({version:1,networkMagic:'1384803358401154921',market:'amm',marketId:'1000',vaultId:'100',epoch:'1',cutoff:'100',sealByCheckpoint:'110',drawCheckpoint:'120',round:'3',settleUntil:'150',recoveryAt:'160',maxFee:'2000200000',sourceId:h(1),chainRootAt1:h(2),codeRoot:h(3),layoutRoot:h(4),functionRoot:h(5),keyFingerprint:h(6),publicKeyHash:h(7),queueRoot:h(8),batchRoot:h(9),members:[200,201,202,203].map((owner,i)=>({owner:String(owner),nonce:i===2?((1n<<62n)-1n).toString():String(i+1),termsRoot:h(i+10)}))});
const envelope=c=>({format:'psy-market-beacon-certificate-v1',sourceId:c.sourceId,chainRootAt1:c.chainRootAt1,round:c.round,drawCheckpoint:c.drawCheckpoint,sealIncludedCheckpoint:'105',seed:h(13),beaconProof:'AAAA',sealInclusionProof:'AAAA',finalityProof:'AAAA'});
test('candidate binds every scope and full member hash with canonical frozen padding',()=>{
 const c=candidate(),v=encodeCandidateStatement(c);assert.equal(v.fields.length,74);assert.equal(v.fields[13],'4');assert.equal(v.fields[63],((1n<<62n)-1n).toString());
 for(const key of ['sourceId','chainRootAt1','codeRoot','layoutRoot','functionRoot','keyFingerprint','publicKeyHash','queueRoot','batchRoot'])assert.notDeepEqual(encodeCandidateStatement({...c,[key]:h(55)}).fields,v.fields);
 for(const [key,value]of [['epoch','2'],['cutoff','99'],['sealByCheckpoint','109'],['drawCheckpoint','121'],['round','4'],['settleUntil','149'],['recoveryAt','161'],['maxFee','2']])assert.notDeepEqual(encodeCandidateStatement({...c,[key]:value}).fields,v.fields);
 c.members[0].nonce='9';assert.equal(v.snapshot.members[0].nonce,'1');assert.throws(()=>{v.fields[0]='2';});assert.throws(()=>{v.snapshot.members.push({});});
 for(const count of [1,2,3,4]){const x=candidate();x.members=x.members.slice(0,count);const fields=encodeCandidateStatement(x).fields;assert.ok(fields.slice(50+6*count).every(x=>x==='0'));}
});
test('wrong domains, late seal, cutoff edits, duplicate/extra members and injected seed reject',()=>{
 const c=candidate();for(const patch of [{version:2},{networkMagic:'1'},{market:'orderbook'},{market:'nftmarket'},{epoch:'01'},{cutoff:100},{drawCheckpoint:'110'},{sealByCheckpoint:'100'},{settleUntil:'120'},{recoveryAt:'150'},{maxFee:String(1n<<62n)},{seed:h(1)},{members:[]},{members:[...c.members,c.members[0]]}])assert.throws(()=>encodeCandidateStatement({...c,...patch}));
 for(const members of [[c.members[1],c.members[0]], [c.members[0],c.members[0]], [{...c.members[0],owner:'100'}], [{...c.members[0],nonce:'0'}], [{...c.members[0],termsRoot:h(0)}]])assert.throws(()=>encodeCandidateStatement({...c,members}));
 assert.throws(()=>hashLimbs(h(0xffffffff00000001n)));assert.deepEqual(hashLimbs(h(0xffffffff00000000n)),['18446744069414584320','0','0','0']);
});
test('certificate parsing never authenticates randomness, seal inclusion or finality',()=>{
 const c=candidate(),e=envelope(c);assert.match(validateBeaconEnvelope(c,e).assurance,/unverified/);
 assert.throws(()=>authorizeRandomBatch(c,e),x=>x.code==='RANDOM_SOURCE_UNAVAILABLE');
 for(const patch of [{round:'2'},{drawCheckpoint:'119'},{sourceId:h(2)},{chainRootAt1:h(3)},{sealIncludedCheckpoint:'120'},{sealIncludedCheckpoint:'100'},{beaconProof:''},{beaconProof:'not-base64'},{sealInclusionProof:''},{finalityProof:''},{certificate:'AAAA'},{verified:true},{verifier:()=>true},{resourceUrl:'https://untrusted.invalid/'}])assert.throws(()=>validateBeaconEnvelope(c,{...e,...patch}));
 for(const key of ['beaconProof','sealInclusionProof','finalityProof']){const x={...e};delete x[key];assert.throws(()=>validateBeaconEnvelope(c,x));}
 for(const seed of [h(0),h(1),h(2),h(3)])assert.throws(()=>authorizeRandomBatch(c,{...e,seed}),x=>x.code==='RANDOM_SOURCE_UNAVAILABLE','no seed can be chosen, retried or accepted after restart');
});
test('all market generation paths refuse random hints and preserve deterministic bytes',()=>{
 const forbidden=['seed','randomSeed','randomSource','randomness','randomnessProof','randomSeedProof','beacon','beaconProof','drawCheckpoint','randomRound','randomOrdering','seedCommitment'];
 for(const market of ['amm','bondingcurve','orderbook','nftmarket']){
  const c=market==='nftmarket'?{nftId:41,tokenId:42,networkMagic:'1'}:{...fixture,networkMagic:'1'};
  for(const generate of [generateBatch,generateAdmission]){
   assert.equal(generate(market,c),generate(market,{...c,ordering:'deterministic'}));
   assert.throws(()=>generate(market,{...c,ordering:'random'}),/deterministic only/);
   for(const key of forbidden)assert.throws(()=>generate(market,{...c,[key]:null}),/not attested/);
  }
 }
 const plan={version:1,epoch:1,cutoff:100,members:[]};assert.equal(validateAdmissionPlan(plan),plan);
 for(const patch of [{ordering:'random'},{randomSeed:'1'},{randomSource:{verified:true}}])assert.throws(()=>validateAdmissionPlan({...plan,...patch}));
 for(const value of [null,[],false])assert.throws(()=>assertDeterministicOrdering(value));
});
