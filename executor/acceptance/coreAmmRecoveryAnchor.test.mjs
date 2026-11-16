// Synthetic public artifacts only: no native verification, RPC or transmission.
import test from 'node:test';
import assert from 'node:assert/strict';
import {losslessJson,FEE_ESCROW} from '../../amm/u124/client.mjs';
import {sha256} from '../requestBinding.mjs';
import {verifyFirstSponsorRecoveryAnchor as verify} from './coreAmmRecoveryAnchor.mjs';
const h=n=>String(n).repeat(64),bytes=v=>Buffer.from(losslessJson(v)+'\n');
function fixture(){
 const historical={userId:971904,nonce:4,endUserLeafHash:h(1),publicKeyHash:h(2)},
  expected={chainRootAt1:h(3),verifierFingerprint:h(4),policySha256:h(5),dependenciesSha256:h(6)},
  contracts=[0,51].map(contractId=>({contract:{contractId,codeRoot:h(7),layoutRoot:h(8),stateTreeHeight:contractId?31:32},functionTreeRoot:h(9),layoutFieldCount:8,layoutSlotCount:99}));
 expected.contracts=contracts;
 const calls=[{contract_id:51,method_id:2870336142,method_name:'authorize_sponsor',inputs:[1182848,2n*FEE_ESCROW,2,1]},
  {contract_id:0,method_name:'transfer',inputs:[1182848,2n*FEE_ESCROW]}],
  canonicalPlan={stage:'sponsor_batch',actorId:971904,contract_calls:calls,unsigned:true,proofVerified:false,liveAccepted:false,policySha256:expected.policySha256,dependenciesSha256:expected.dependenciesSha256},
  input={calls:{contract_calls:calls,software_defined_call:{inputs:[]}},contracts,validUntilCheckpoint:220},inputBytes=bytes(input),
  core={checkpoint_id:100,new_user_leaf:{user_id:971904,nonce:5,public_key:historical.publicKeyHash},
   state_transition:{user_id:971904,start_user_leaf_hash:historical.endUserLeafHash,end_user_leaf_hash:h('a')},
   stats:{guta_fees_collected:1000000000,da_fees_collected:3000,total_transactions:3,slots_modified:3,user_ops_processed:1}},
  preflight={broadcast:false,fullUpsVerified:true,chainRootAt1:expected.chainRootAt1,inputSha256:sha256(inputBytes),core,userId:971904,nonce:5,endUserLeafHash:h('a'),
   proofProfile:{profile:'sdk-audit-20261102-v1',networkMagic:'1384803358401154921',bundledNodeVerifierFingerprint:expected.verifierFingerprint,fullProofVerifiedWithPinnedCommonData:true,verifierOnlyMatches:true}},
  request={user_ec_input:{core},proof:'public synthetic proof placeholder'},requestBytes=bytes(request),
  intent={status:'broadcast_intent',retryAllowed:false,userId:971904,nonce:5,endUserLeafHash:h('a')},
  independentReport={broadcast:false,fullProofVerifiedAgainstPinnedNodeKeyAndCommon:true,metadataEndpointsAndFeesVerified:true,requestSha256:sha256(requestBytes),userId:971904,nonce:5,publicKeyHash:historical.publicKeyHash,startUserLeafHash:historical.endUserLeafHash,endUserLeafHash:h('a'),sourceCheckpoint:100},
  included={status:'included',userId:971904,endUserLeafHash:h('a'),checkpoint:110,commonCheckpoint:111,contentHash:h('b'),receipt:{success:true,data:{status:'included',tx_type:'UserEndcap',content_hash:h('b'),owner_user_id:971904,included_checkpoint_id:110,result:{user_id:971904,fees_collected:1000003000,slots_modified:3,total_transactions:3,user_ops_processed:1}}}};
 const x={historical,expected,canonicalPlan,inputBytes,preflightBytes:bytes(preflight),requestBytes,intentBytes:bytes(intent),independentReportBytes:bytes(independentReport),laterStageFiles:[]};
 expected.inputSha256=sha256(inputBytes);expected.preflightSha256=sha256(x.preflightBytes);expected.independentReportSha256=sha256(x.independentReportBytes);
 return {x,input,preflight,request,intent,independentReport,included};
}
test('a verified proof without exact inclusion keeps the historical actor anchor and never permits submission',()=>{
 const {x}=fixture(),r=verify(x);assert.equal(r.status,'unresolved');assert.equal(r.expectedActorLeafHash,x.historical.endUserLeafHash);
 assert.equal(r.nonce,5n);assert.equal(r.feeBaseUnits,1000003000n);assert.equal(r.maySubmit,false);
});
test('only exact independently verified first-sponsor inclusion advances the root-owned anchor',()=>{
 const {x,included}=fixture(),r=verify({...x,included});assert.equal(r.status,'included');assert.equal(r.expectedActorLeafHash,included.endUserLeafHash);
 assert.equal(r.includedCheckpoint,110n);assert.equal(r.maySubmit,false);assert.equal(r.requestSha256,sha256(x.requestBytes));
});
test('modified raw artifacts, self-issued verification reports and resource substitutions fail closed',()=>{
 for(const role of ['inputBytes','preflightBytes','requestBytes','intentBytes','independentReportBytes']){
  const {x}=fixture();x[role]=Buffer.concat([x[role],Buffer.from(' ')]);
  if(role==='intentBytes') {const v=JSON.parse(x[role]);v.nonce=6;x[role]=bytes(v);}
  assert.throws(()=>verify(x),undefined,role);
 }
 for(const field of ['chainRootAt1','verifierFingerprint','policySha256','dependenciesSha256','independentReportSha256','preflightSha256','inputSha256']){
  const {x}=fixture();x.expected[field]=h('c');assert.throws(()=>verify(x),undefined,field);
 }
});
test('noncanonical spend, authorization nonce, purpose, recipient, calls or dependency projection cannot be adopted',()=>{
 const edits=[v=>v.contract_calls[0].inputs[0]=1,v=>v.contract_calls[0].inputs[1]=1,v=>v.contract_calls[0].inputs[2]=3,
  v=>v.contract_calls[0].inputs[3]=2,v=>v.contract_calls[0].method_id=1,v=>v.contract_calls[1].inputs[0]=1,
  v=>v.contract_calls.reverse(),v=>v.contract_calls.push(v.contract_calls[1]),v=>v.actorId=668800,v=>v.stage='renewed-sponsor-v1'];
 for(const edit of edits){const {x}=fixture();edit(x.canonicalPlan);assert.throws(()=>verify(x));}
 // Even a freshly repinned input and preflight cannot change the reviewed
 // Native/market identity or broaden the saved software-defined inputs.
 for(const edit of [v=>v.contracts[1].contract.codeRoot=h('d'),v=>v.calls.software_defined_call.inputs.push(1)]){
  const {x,input,preflight}=fixture();x.expected.contracts=structuredClone(x.expected.contracts);edit(input);x.inputBytes=bytes(input);x.expected.inputSha256=sha256(x.inputBytes);preflight.inputSha256=x.expected.inputSha256;x.preflightBytes=bytes(preflight);x.expected.preflightSha256=sha256(x.preflightBytes);assert.throws(()=>verify(x));
 }
});
test('relabeling public endpoints, nonce, original window, fee or proof markers is rejected',()=>{
 const edits=[p=>p.core.new_user_leaf.nonce=6,p=>p.core.state_transition.start_user_leaf_hash=h('d'),p=>p.core.new_user_leaf.public_key=h('d'),
  p=>p.core.stats.total_transactions=2,p=>p.core.stats.guta_fees_collected=4000000000,p=>p.fullUpsVerified=false,
  p=>p.proofProfile.fullProofVerifiedWithPinnedCommonData=false,p=>p.proofProfile.verifierOnlyMatches=false];
 for(const edit of edits){const {x,preflight}=fixture();edit(preflight);x.preflightBytes=bytes(preflight);x.expected.preflightSha256=sha256(x.preflightBytes);assert.throws(()=>verify(x));}
 for(const edit of [v=>v.nonce=6,v=>v.retryAllowed=true,v=>v.status='not_submitted']){const {x,intent}=fixture();edit(intent);x.intentBytes=bytes(intent);assert.throws(()=>verify(x));}
 for(const edit of [v=>v.fullProofVerifiedAgainstPinnedNodeKeyAndCommon=false,v=>v.metadataEndpointsAndFeesVerified=false,v=>v.sourceCheckpoint=101]){
  const {x,independentReport}=fixture();edit(independentReport);x.independentReportBytes=bytes(independentReport);x.expected.independentReportSha256=sha256(x.independentReportBytes);assert.throws(()=>verify(x));
 }
 for(const end of [100,229]){const {x,input,preflight}=fixture();input.validUntilCheckpoint=end;x.inputBytes=bytes(input);x.expected.inputSha256=sha256(x.inputBytes);preflight.inputSha256=x.expected.inputSha256;x.preflightBytes=bytes(preflight);x.expected.preflightSha256=sha256(x.preflightBytes);assert.throws(()=>verify(x));}
});
test('wrong, unconfirmed, stale or fee-inconsistent receipts cannot move the actor anchor',()=>{
 const edits=[v=>v.status='unresolved',v=>v.userId=668800,v=>v.endUserLeafHash=h('c'),v=>v.receipt.success=false,
  v=>v.receipt.data.tx_type='DeployContract',v=>v.receipt.data.content_hash=h('c'),v=>v.receipt.data.owner_user_id=668800,
  v=>v.receipt.data.result.user_id=668800,v=>v.receipt.data.result.fees_collected=1000003001,
  v=>v.receipt.data.result.total_transactions=2,v=>v.commonCheckpoint=109,v=>{v.checkpoint=99;v.receipt.data.included_checkpoint_id=99;}];
 for(const edit of edits){const {x,included}=fixture();edit(included);assert.throws(()=>verify({...x,included}));}
 const {x}=fixture();assert.throws(()=>verify({...x,laterStageFiles:['expired-commit-v1-task.json']}),/separate manual/);
});
