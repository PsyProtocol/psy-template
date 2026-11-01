import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExitStage,planTaggedCreditReturn,planIndependentExitGrant} from './fundedExit.mjs';
import {fundedProfile} from './fundedProfiles.mjs';
const F=1_000_100_000n;
const policy={version:18,fee_owner:600,qualified_randomness:false,exit_policy:{auxiliary_fee_field:74n,only_original_credit_returns:true,owner_return_fee_separate_from_service_cap:true,owner_return_authority:'exhausted-or-explicit-owner-v1'},base:{operations:[{branch:1n,name:'recover_funding_5',maintenance:true},{branch:2n,name:'batch_refund_5',maintenance:false},{branch:3n,name:'batch_swap',maintenance:false},{branch:4n,name:'initialize',maintenance:true}]}};
const fields=(mode,payer=601n,branch=0n)=>{const f=Array(80).fill(0n);f[0]=BigInt(mode);f[74]=payer;f[21]=branch;f[73]=F;return{fields:f};};
test('separate new keys preserve legacy profile boundaries',()=>{
 assert.equal(fundedProfile('source-authorized-exit-v18','amm').version,18n);assert.equal(fundedProfile('source-pair-authorized-exit-v19','nftmarket').version,19n);
 assert.throws(()=>fundedProfile('source-authorized-exit-v18','nftmarket'));
 for(const version of [14,15,16,17])assert.throws(()=>validateExitStage({...policy,version},fields(16,0n)));
 for(const profile of ['source-independent-exit-v16','source-pair-independent-exit-v17'])assert.throws(()=>fundedProfile(profile,'amm'));
});
test('auxiliary fees cannot open, trade, initialize or reorder; full frozen refund rows remain necessary',()=>{
 for(const mode of [5,10,11,14])assert.throws(()=>validateExitStage(policy,fields(mode)));
 validateExitStage(policy,fields(4,601n,1n));assert.throws(()=>validateExitStage(policy,fields(4,601n,4n)));
 const r=fields(8,601n,2n);r.fields[2]=2n;r.fields[34]=2n;validateExitStage(policy,r);r.fields[34]=3n;assert.throws(()=>validateExitStage(policy,r));
 const empty=fields(8,601n,2n);assert.throws(()=>validateExitStage(policy,empty));empty.fields[2]=5n;assert.throws(()=>validateExitStage(policy,empty));
 for(const mode of [6,9,16])validateExitStage(policy,fields(mode));
 assert.throws(()=>validateExitStage(policy,fields(15,601n,602n)));validateExitStage(policy,fields(15,601n,601n));
 assert.throws(()=>validateExitStage(policy,fields(17,0n)));
});
test('owner absence and exhausted service cap do not authorize customer/pool sweeps',()=>{
 const p=planTaggedCreditReturn({policy,state:{feeCap:F,feeUsed:F,credit:9n*F},owner:600n,exactFee:F,checkpoint:100n});assert.equal(p.amount,(8n*F).toString());assert.equal(p.recipient,'600');assert.equal(p.canBroadcast,false);assert.equal(p.ordinaryClaimRequired,true);assert.equal(p.ownerServiceCapChanged,false);
 const funded=planTaggedCreditReturn({policy,state:{feeCap:F,feeUsed:F,credit:F,payerCredit:F,payerAfter:110n},owner:600n,payer:601n,exactFee:F,checkpoint:100n});assert.equal(funded.amount,F.toString());
 assert.equal(planTaggedCreditReturn({policy,state:{feeCap:F,feeUsed:F,credit:F},owner:600n,exactFee:F,checkpoint:100n}).status,'needs-independent-exit-sponsor');
});
test('signed sponsor deadline survives owner exit, and independently paid returns preserve original recipient',()=>{
 const args={policy,state:{feeCap:F,feeUsed:F,credit:2n*F,returnAfter:100n,payerCredit:F,payerAfter:120n},owner:601n,payer:602n,exactFee:F,checkpoint:100n};
 assert.equal(planTaggedCreditReturn(args).status,'waiting-signed-deadline');const p=planTaggedCreditReturn({...args,checkpoint:101n});assert.equal(p.amount,(2n*F).toString());assert.equal(p.recipient,'601');
 assert.equal(planTaggedCreditReturn({...args,checkpoint:121n}).status,'needs-active-exit-sponsor');
 assert.throws(()=>planTaggedCreditReturn({...args,payer:0n}));
});
test('sponsor must sign, close its own active order, pay exact original funding and cover grant plus exit',()=>{
 const args={policy,payer:601n,checkpoint:100n,maximumAmount:4n*F,followingFees:F,state:{amount:3n*F,grantFee:F,nonce:1n,seen:0n,after:110n,credit:0n,pending:3n*F,key:[1,2,3,4],registeredKey:[1,2,3,4],activeOrderForVault:false}};
 assert.equal(planIndependentExitGrant(args).status,'apply-authenticated-exit-grant');
 for(const change of [{nonce:0n},{after:100n},{after:5000n},{key:[4,3,2,1]}])assert.equal(planIndependentExitGrant({...args,state:{...args.state,...change}}).status,'needs-authenticated-sponsor-grant');
 assert.equal(planIndependentExitGrant({...args,state:{...args.state,activeOrderForVault:true}}).status,'sponsor-must-close-own-order');
 assert.equal(planIndependentExitGrant({...args,state:{...args.state,pending:2n*F}}).status,'needs-exact-original-funding');
 assert.equal(planIndependentExitGrant({...args,state:{...args.state,amount:F,pending:F}}).status,'needs-explicit-exit-budget');
 assert.throws(()=>planIndependentExitGrant({...args,maximumAmount:2n*F}));
});

test('expired unapplied funding requires sponsor approval, preserves pending money and never suggests another full payment',()=>{
 const args={policy,payer:601n,checkpoint:100n,maximumAmount:4n*F,followingFees:F,state:{amount:3n*F,grantFee:F,nonce:1n,seen:0n,after:99n,credit:0n,pending:3n*F,key:[1,2,3,4],registeredKey:[1,2,3,4]}};
 const p=planIndependentExitGrant(args);assert.equal(p.status,'needs-authenticated-sponsor-grant');assert.equal(p.requiresSponsorApproval,true);assert.equal(p.existingPendingExact,true);assert.equal(p.automaticPayment,false);
 const short=planIndependentExitGrant({...args,state:{...args.state,after:110n,pending:2n*F}});assert.equal(short.additionalNativeRequired,F.toString());assert.equal(short.automaticPayment,false);
});

test('a public or auxiliary payer cannot retire a live budget without the exact owner permit',()=>{
 const args={policy,state:{feeCap:100n*F,feeUsed:F,credit:9n*F,grantSeen:1n,ownerExitGrant:0n,latestOwnerGrant:1n,payerCredit:F,payerAfter:120n},owner:600n,payer:0n,exactFee:F,checkpoint:100n};
 assert.equal(planTaggedCreditReturn(args).status,'needs-owner-exit-approval');
 assert.equal(planTaggedCreditReturn({...args,payer:601n}).status,'needs-owner-exit-approval');
 assert.equal(planTaggedCreditReturn({...args,state:{...args.state,ownerExitGrant:1n,latestOwnerGrant:2n}}).status,'needs-owner-exit-approval');
 assert.equal(planTaggedCreditReturn({...args,state:{...args.state,ownerExitGrant:1n}}).status,'prepare-exact-return');
});


test('zero recipients and the primary owner disguised as an auxiliary payer reject before planning',()=>{
 const args={policy,state:{feeCap:F,feeUsed:F,credit:9n*F,payerCredit:F,payerAfter:120n},owner:600n,exactFee:F,checkpoint:100n};
 assert.throws(()=>planTaggedCreditReturn({...args,owner:0n,payer:601n}),/nonzero original/);
 assert.throws(()=>planTaggedCreditReturn({...args,payer:600n}),/not an auxiliary/);
});
