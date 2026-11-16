// Root-owned acceptance artifact adoption gate, not a wallet proof verifier.
// The independent native verifier must already have produced the exact report
// pinned by the caller. This helper cannot authorize proving or transmission.
import assert from 'node:assert/strict';
import {parseLosslessJson,losslessJson,FEE_ESCROW} from '../../amm/u124/client.mjs';
import {sha256} from '../requestBinding.mjs';

const USER=971904n,VAULT=1182848n,MARKET=51n,NONCE=5n,AMOUNT=2n*FEE_ESCROW;
const hash=(value,label)=>{assert.match(value??'',/^[a-f0-9]{64}$/,label);return value;};
const integer=(value,label)=>{assert.ok(typeof value==='bigint'||Number.isSafeInteger(value)||typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value),label);return BigInt(value);};
const same=(a,b,label)=>assert.deepEqual(parseLosslessJson(losslessJson(a)),parseLosslessJson(losslessJson(b)),label);
const parse=bytes=>{assert.ok(typeof bytes==='string'||Buffer.isBuffer(bytes),'exact public artifact bytes required');return parseLosslessJson(bytes.toString());};

export function verifyFirstSponsorRecoveryAnchor({historical,expected,canonicalPlan,inputBytes,preflightBytes,requestBytes,intentBytes,independentReportBytes,included,laterStageFiles=[]}){
 assert.ok(Array.isArray(laterStageFiles)&&laterStageFiles.length===0,'later stages require separate manual recovery review');
 assert.equal(integer(historical.userId,'historical user'),USER);assert.equal(integer(historical.nonce,'historical nonce'),4n);
 const start=hash(historical.endUserLeafHash,'historical leaf'),publicKey=hash(historical.publicKeyHash,'historical key');
 for(const field of ['chainRootAt1','verifierFingerprint','policySha256','dependenciesSha256','independentReportSha256','preflightSha256','inputSha256'])hash(expected[field],'pinned '+field);
 assert.notEqual(expected.chainRootAt1,'0'.repeat(64));
 assert.equal(sha256(independentReportBytes),expected.independentReportSha256,'independent verifier artifact changed');
 assert.equal(sha256(preflightBytes),expected.preflightSha256,'saved preflight changed');assert.equal(sha256(inputBytes),expected.inputSha256,'saved unsigned input changed');
 const input=parse(inputBytes),pre=parse(preflightBytes),request=parse(requestBytes),intent=parse(intentBytes),verified=parse(independentReportBytes),core=pre.core;
 const requestSha256=sha256(requestBytes),inputSha256=sha256(inputBytes);
 const calls=[{contract_id:MARKET,method_id:2870336142n,method_name:'authorize_sponsor',inputs:[VAULT,AMOUNT,2n,1n]},
  {contract_id:0n,method_name:'transfer',inputs:[VAULT,AMOUNT]}];
 assert.equal(canonicalPlan.stage,'sponsor_batch');assert.equal(integer(canonicalPlan.actorId,'plan actor'),USER);
 assert.equal(canonicalPlan.unsigned,true);assert.equal(canonicalPlan.proofVerified,false);assert.equal(canonicalPlan.liveAccepted,false);
 assert.equal(canonicalPlan.policySha256,expected.policySha256);assert.equal(canonicalPlan.dependenciesSha256,expected.dependenciesSha256);
 same(canonicalPlan.contract_calls,calls,'only exact first nonce-2 sponsor calls permitted');
 same(input.calls,{contract_calls:calls,software_defined_call:{inputs:[]}},'saved unsigned sponsor calls changed');
 assert.ok(Array.isArray(expected.contracts)&&expected.contracts.length===2,'pinned Native/market dependency projection required');
 same(input.contracts,expected.contracts,'saved dependency identities changed');
 same(input.contracts.map(b=>integer(b.contract.contractId,'dependency id')),[0n,MARKET],'only exact Native/market dependencies permitted');
 for(const b of input.contracts){for(const name of ['codeRoot','layoutRoot'])hash(b.contract[name],'dependency '+name);hash(b.functionTreeRoot,'dependency function root');}
 assert.equal(pre.broadcast,false);assert.equal(pre.fullUpsVerified,true);assert.equal(pre.chainRootAt1,expected.chainRootAt1);
 assert.equal(pre.inputSha256,inputSha256,'preflight input digest');
 assert.equal(pre.proofProfile?.profile,'sdk-audit-20261102-v1');assert.equal(pre.proofProfile.networkMagic,'1384803358401154921');
 assert.equal(pre.proofProfile.bundledNodeVerifierFingerprint,expected.verifierFingerprint);
 assert.equal(pre.proofProfile.fullProofVerifiedWithPinnedCommonData,true);assert.equal(pre.proofProfile.verifierOnlyMatches,true);
 same(request.user_ec_input?.core,core,'request/preflight public core mismatch');
 assert.equal(core.state_transition.start_user_leaf_hash,start);assert.equal(core.state_transition.user_id,USER);
 const end=hash(core.state_transition.end_user_leaf_hash,'verified end leaf');assert.notEqual(end,start);
 assert.equal(core.new_user_leaf.user_id,USER);assert.equal(core.new_user_leaf.nonce,NONCE);assert.equal(core.new_user_leaf.public_key,publicKey);
 assert.equal(pre.userId,USER);assert.equal(pre.nonce,NONCE);assert.equal(pre.endUserLeafHash,end);
 assert.equal(intent.status,'broadcast_intent');assert.equal(intent.retryAllowed,false);assert.equal(intent.userId,USER);assert.equal(intent.nonce,NONCE);assert.equal(intent.endUserLeafHash,end);
 assert.equal(verified.broadcast,false);assert.equal(verified.fullProofVerifiedAgainstPinnedNodeKeyAndCommon,true);assert.equal(verified.metadataEndpointsAndFeesVerified,true);
 for(const [name,value]of Object.entries({requestSha256,userId:USER,nonce:NONCE,publicKeyHash:publicKey,startUserLeafHash:start,endUserLeafHash:end,sourceCheckpoint:core.checkpoint_id}))assert.equal(verified[name],value,'independent verified endpoint '+name);
 assert.ok(core.checkpoint_id>0n&&core.checkpoint_id<2n**32n,'source checkpoint bound');
 assert.ok(input.validUntilCheckpoint>core.checkpoint_id&&input.validUntilCheckpoint<=core.checkpoint_id+128n,'original ordinary validity window');
 const stats=core.stats,fee=stats.guta_fees_collected+stats.da_fees_collected;
 assert.ok(stats.guta_fees_collected>=1000000000n&&stats.da_fees_collected>=0n&&fee<=3000000000n,'one reserved fee ceiling');
 assert.equal(stats.total_transactions,3n);assert.equal(stats.user_ops_processed,1n);assert.equal(stats.slots_modified,3n);
 const result={stage:'expired-sponsor-v1',status:'unresolved',expectedActorLeafHash:start,startUserLeafHash:start,endUserLeafHash:end,
  userId:USER,nonce:NONCE,requestSha256,inputSha256,feeBaseUnits:fee,maySubmit:false,
  scope:'Adopt only this independently verified first sponsor after exact inclusion; no send, re-sign, replacement or later-stage authorization.'};
 if(included===undefined||included===null)return result;
 const receipt=parseLosslessJson(losslessJson(included)),data=receipt.receipt?.data;
 assert.equal(receipt.status,'included');assert.equal(receipt.userId,USER);assert.equal(receipt.endUserLeafHash,end);
 assert.equal(receipt.receipt.success,true);assert.equal(data.status,'included');assert.equal(data.tx_type,'UserEndcap');
 hash(receipt.contentHash,'receipt content identity');assert.equal(receipt.contentHash,data.content_hash);
 assert.equal(data.owner_user_id,USER);assert.equal(data.result.user_id,USER);
 assert.equal(receipt.checkpoint,data.included_checkpoint_id);assert.ok(receipt.checkpoint>=core.checkpoint_id);
 assert.ok(receipt.commonCheckpoint>=receipt.checkpoint,'common state must observe inclusion');
 assert.equal(data.result.fees_collected,fee);
 for(const name of ['slots_modified','total_transactions','user_ops_processed'])assert.equal(data.result[name],stats[name],'receipt stats '+name);
 return {...result,status:'included',expectedActorLeafHash:end,includedCheckpoint:receipt.checkpoint,contentHash:receipt.contentHash};
}
