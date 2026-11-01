// Planning and early rejection only. Authentic grants, tagged credit and exact
// calls are enforced again by the candidate CFCs, SD-key and complete UPS.
import assert from 'node:assert/strict';
const integer=(x,b,label)=>{assert.ok(typeof x==='bigint'||Number.isSafeInteger(x),label);const n=BigInt(x);assert.ok(n>=0n&&n<2n**BigInt(b),label);return n;};
const fee=x=>{const n=integer(x,62,'fee');assert.ok(n>=1_000_000_000n&&n<=1_000_100_000n);return n;};
export const hasIndependentExit=policy=>[18n,19n].includes(BigInt(policy.version));
export function validateExitStage(policy,request){
 const f=request.fields;assert.equal(f.length,80);const enabled=hasIndependentExit(policy),mode=BigInt(f[0]),payer=integer(f[74],24,'fee payer');
 if(!enabled){assert.ok(mode<15n&&payer===0n,'new exit modes require their new key and layout');return;}
 assert.equal(BigInt(policy.exit_policy?.auxiliary_fee_field??-1),74n);
 assert.equal(policy.exit_policy?.owner_return_authority,'exhausted-or-explicit-owner-v1');assert.equal(policy.exit_policy?.only_original_credit_returns,true);assert.equal(policy.exit_policy?.owner_return_fee_separate_from_service_cap,true);
 const ops=policy.base.operations??[],safe=name=>name.startsWith('recover_funding')||['recover_nft','ack_delivery'].includes(name);
 if(payer!==0n){
  assert.ok([4n,6n,8n,9n,15n,16n,17n].includes(mode),'exit credit cannot open, trade or reorder');
  if(mode===4n)assert.ok(ops.some(o=>o.branch===f[21]&&o.maintenance===true&&safe(o.name)),'exit-only maintenance');
  if(mode===8n){const count=integer(f[2],3,'refund rows');assert.ok(count>0n&&count<=(BigInt(policy.version)===19n?2n:4n));for(let i=0;i<Number(count);i++)assert.ok(ops.some(o=>o.branch===f[21+13*i]&&o.maintenance===false&&(o.name.startsWith('refund_funding')||o.name.startsWith('batch_refund_'))),'exit credit cannot settle trades');}
 }
 if(mode===15n)assert.ok(payer!==0n&&payer===f[21],'grant pays only its original sponsor');
 if(mode===17n)assert.ok(payer!==0n,'explicit return fee payer');
}
export function planTaggedCreditReturn({policy,state,owner,payer=0n,exactFee,checkpoint}){
 assert.ok(hasIndependentExit(policy),'new identities only');const nativeFee=fee(exactFee),recipient=integer(owner,24,'original credit owner'),gas=integer(payer,24,'fee payer'),cp=integer(checkpoint,32,'checkpoint');
 assert.ok(recipient!==0n,'nonzero original credit owner');assert.ok(gas===0n||gas!==BigInt(policy.fee_owner),'original fee owner is not an auxiliary sponsor');
 const primary=recipient===BigInt(policy.fee_owner);assert.ok(primary||gas!==0n,'sponsor return requires an explicit exit fee payer');
 const credit=integer(state.credit,62,'original tagged credit'),deadline=integer(state.returnAfter??0n,32,'signed return deadline');
 const base={scope:'tagged original Native credit only; not pool reserves, customer escrow or unclaimed revenue',mode:primary?16:17,recipient:recipient.toString(),payer:gas.toString(),canBroadcast:false,ordinaryClaimRequired:true};
 if(!primary&&cp<=deadline)return{...base,status:'waiting-signed-deadline',returnAfter:deadline.toString()};
 if(credit===0n)return{...base,status:'nothing-to-return'};
 if(primary){const cap=integer(state.feeCap,62,'service cap'),used=integer(state.feeUsed,62,'service spending');assert.ok(used<=cap);
  const seen=integer(state.grantSeen??0n,62,'applied grant'),permit=integer(state.ownerExitGrant??0n,62,'explicit exit grant'),latest=integer(state.latestOwnerGrant??0n,62,'current owner grant');
  if(cap-used>=1_000_000_000n&&!(seen>0n&&permit===seen&&latest===seen))return{...base,status:'needs-owner-exit-approval',requiresOwnerApproval:true,grantEpoch:seen.toString(),automaticPayment:false,reason:'Public treasury return cannot stop an otherwise live funded service'};
 }

 const selfPays=primary?gas===0n:gas===recipient;
 if(selfPays&&credit<=nativeFee)return{...base,status:'needs-independent-exit-sponsor',deficit:(nativeFee+1n-credit).toString()};
 if(!selfPays){assert.ok(gas!==0n);const available=integer(state.payerCredit,62,'independent payer credit'),after=integer(state.payerAfter,32,'payer deadline');if(available<nativeFee||cp>after)return{...base,status:'needs-active-exit-sponsor',minimumFee:nativeFee.toString()};}
 return{...base,status:'prepare-exact-return',amount:(credit-(selfPays?nativeFee:0n)).toString(),exactFee:nativeFee.toString(),ownerServiceCapChanged:false,returnFeeIsAdditionalToOwnerServiceCap:primary&&selfPays,
  authority:'Fresh authenticated tagged credit and dedicated key; final amount must be recomputed with the exact final fee and complete state before approval'};
}
export function planIndependentExitGrant({policy,state,payer,checkpoint,maximumAmount,followingFees}){
 assert.ok(hasIndependentExit(policy),'new identities only');const who=integer(payer,24,'sponsor'),cp=integer(checkpoint,32,'checkpoint'),amount=integer(state.amount,62,'grant amount'),limit=integer(maximumAmount,62,'explicit ordinary sponsor ceiling'),next=integer(followingFees,62,'following exit fees');
 assert.ok(who!==0n&&who!==BigInt(policy.fee_owner));assert.ok(amount<=limit,'no silent sponsor budget increase');
 const base={scope:'explicit independent exit-only sponsor; never implicitly charged to customer escrow',payer:who.toString(),mode:15,canBroadcast:false,originalSetPreserved:true,deadlineExtended:false};
 if(state.activeOrderForVault)return{...base,status:'sponsor-must-close-own-order'};
 const nonce=integer(state.nonce,62,'grant nonce'),seen=integer(state.seen,62,'applied nonce'),after=integer(state.after,32,'return deadline');
 assert.ok(Array.isArray(state.key)&&state.key.length===4&&Array.isArray(state.registeredKey)&&state.registeredKey.length===4);assert.ok(state.registeredKey.some(n=>BigInt(n)!==0n),'actual nonzero registered identity');
 const pending=integer(state.pending,62,'original pending Native');
 if(nonce<=seen||after<=cp||after>cp+4096n||!state.key.every((n,i)=>BigInt(n)===BigInt(state.registeredKey[i])))return{...base,status:'needs-authenticated-sponsor-grant',requiresSponsorApproval:true,existingPendingExact:pending===amount,automaticPayment:false,reason:'An expired/unapplied grant needs a new explicit sponsor authorization. Existing exact Native funding must not be paid again. No permissionless withdrawal of unapplied funding is implemented.'};
 const existing=integer(state.credit,62,'existing sponsor credit'),grantFee=fee(state.grantFee);
 if(amount<1_000_100_000n||existing+amount>=2n**62n||existing+amount<grantFee+next)return{...base,status:'needs-explicit-exit-budget',minimumCredit:(grantFee+next).toString()};
 if(pending!==amount)return{...base,status:'needs-exact-original-funding',expectedPending:amount.toString(),additionalNativeRequired:(amount>pending?amount-pending:0n).toString(),automaticPayment:false,excessPendingNeedsReview:pending>amount};
 return{...base,status:'apply-authenticated-exit-grant',nonce:nonce.toString(),amount:amount.toString(),returnAfter:after.toString(),maximumFee:grantFee.toString(),followingFees:next.toString()};
}
