// Pure review/refusal tests. Native complete proof verification is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../protocol.mjs';
import {reviewCommitmentConfirmation} from './commitmentReview.mjs';
import {AUDIT_CHAIN_ROOT,AUDIT_MANIFEST,AUDIT_PROFILE} from '../nativeProtocol.mjs';
const h='a'.repeat(64);
export async function reviewFixture(){
 const asset={contractId:'42',profile:'u124_private_compact_v2',codeRoot:h,layoutRoot:h,functionRoot:h,decimals:18,symbol:'QAFT'};
 const call={contractId:'42',callerContractId:'4294967296',methodId:'7',methodName:'private_claim',inputCount:86,inputsHash:h};
 const network={name:'testnet',magic:'1384803358401154921',chainRootAt1:AUDIT_CHAIN_ROOT};
 const context={origin:'https://qa.example',account:h,userId:300,networkHash:await digest(network),chainKey:h,fingerprint:h};
 const plan={financialAuthorization:false,userId:300,recipientId:300,network,nativeProtocol:AUDIT_PROFILE,sdkManifestSha256:AUDIT_MANIFEST,verifierPackSha256:h,startUserLeafHash:h,walletNonce:'2',startCheckpoint:100,validUntilCheckpoint:120,maxNetworkFee:'5000000000',callCommitments:[call]};
 const terms={schema:1,context,intentId:h,recordId:h,preparedHash:h,requestSha256:h,callCommitments:[call,{...call,contractId:'0',methodName:'burn',inputCount:1}],claimOutputs:[{kind:'ft-credit',assetId:'42',recipientId:'300',amountBaseUnits:'1000000000000000000000000123',codeRoot:h,layoutRoot:h,functionRoot:h}],actualFee:'1000005000',maxNetworkFee:'5000000000',validUntilCheckpoint:120,review:{request:{userId:300},plan}};
 return{asset,catalogue:Object.freeze([Object.freeze(asset)]),terms};
}
test('review displays full double-limb amount, raw base units, recipient and exact fee',async()=>{
 const f=await reviewFixture(),r=await reviewCommitmentConfirmation(f.terms,f.catalogue);
 assert.equal(r.rows.find(r=>r.label==='Amount').value,'1000000000.000000000000000123 QAFT');
 assert.equal(r.rows.find(r=>r.label==='Network fee').value,'1.000005000 PSY');
 const changed=structuredClone(f.terms);changed.claimOutputs[0].amountBaseUnits='1000000000000000000000000124';
 assert.notEqual((await reviewCommitmentConfirmation(changed,f.catalogue)).approvalSha256,r.approvalSha256);
});
for(const mode of ['recipient','asset','layout','code','function','missing','zero','overflow','rounded','fee','network','expiry','caller','call-order','secret','mutable','duplicate','metadata'])test('review refuses '+mode,async()=>{
 const f=await reviewFixture(),t=structuredClone(f.terms);let catalogue=f.catalogue;
 const o=t.claimOutputs[0];
 if(mode==='recipient')o.recipientId='301';if(mode==='asset')o.assetId='43';
 if(['layout','code','function'].includes(mode))o[mode+'Root']='b'.repeat(64);
 if(mode==='missing')t.claimOutputs=[];
 if(mode==='zero')o.amountBaseUnits='0';if(mode==='overflow')o.amountBaseUnits=String(1n<<124n);if(mode==='rounded')o.amountBaseUnits=1e27;
 if(mode==='fee')t.actualFee='6000000000';if(mode==='network')t.review.plan.network.chainRootAt1='b'.repeat(64);
 if(mode==='expiry')t.validUntilCheckpoint++;if(mode==='caller')t.callCommitments[0].callerContractId='1';if(mode==='call-order')t.callCommitments.reverse();
 if(mode==='secret')t.sign_witness='do not retain';
 if(mode==='mutable')catalogue=[{...f.asset}];if(mode==='duplicate')catalogue=Object.freeze([f.asset,f.asset]);
 if(mode==='metadata')catalogue=Object.freeze([Object.freeze({...f.asset,decimals:19})]);
 await assert.rejects(reviewCommitmentConfirmation(t,catalogue));
});
