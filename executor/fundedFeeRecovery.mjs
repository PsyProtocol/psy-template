// Planning only. The ordinary funding owner must approve its own grant/payment;
// native CFCs authenticate that grant before the public key can consume it.
import assert from 'node:assert/strict';
const n=(x,label)=>{assert.ok(typeof x==='bigint'||Number.isSafeInteger(x),label);const v=BigInt(x);assert.ok(v>=0n&&v<2n**62n,label);return v;};
export function planFundedFeeRecovery({policy,state,approvedLifetimeCap,requiredFee,recoveryGrantFee=1_000_100_000n,frozenSetSha256=null}){
 assert.equal(BigInt(policy.version),14n);assert.equal(policy.qualified_randomness,false);
 const owner=n(policy.fee_owner,'reviewed fee owner'),used=n(state.feeUsed,'spent'),cap=n(state.feeCap,'cap');
 const fee=n(requiredFee,'fee');assert.ok(fee>=1_000_000_000n&&fee<=1_000_100_000n);assert.ok(used<=cap);
 if(frozenSetSha256!==null)assert.match(frozenSetSha256,/^[a-f0-9]{64}$/);
 const available=n(state.nativeBalance,'balance'),pending=n(state.ownerPending,'original owner funding');
 const result={scope:'explicit owner-authorized recovery; not forced execution or an automatic budget increase',owner:owner.toString(),frozenSetSha256,
  originalSetPreserved:true,deadlineExtended:false,randomReselection:false,canBroadcast:false};
 if(cap-used>=fee&&available>=fee)return{...result,status:'funded'};
 const grantFee=n(recoveryGrantFee,'recovery grant fee');assert.ok(grantFee>=1_000_000_000n&&grantFee<=1_000_100_000n);
 // Recovery itself burns a fee; reserving only the following business fee
 // would consume the entire authorization before that business task can run.
 const needed=fee+grantFee,approved=n(approvedLifetimeCap,'approved lifetime ceiling');
 if(used+needed>=2n**62n)return{...result,status:'lifetime-cap-unrepresentable',reason:'No representable grant covers recovery plus the next task; additional funding cannot reset lifetime spending'};
 if(approved<used+needed)return{...result,status:'needs-budget-authorization',minimumLifetimeCap:(used+needed).toString()};
 const offered=n(state.ownerGrantCap,'owner grant cap'),nonce=n(state.ownerGrantNonce,'owner nonce'),seen=n(state.grantSeen,'applied nonce');
 assert.ok(Array.isArray(state.ownerGrantKey)&&state.ownerGrantKey.length===4&&Array.isArray(state.registeredKey)&&state.registeredKey.length===4);
 if(nonce<=seen||offered<cap||offered<used+needed||offered>approved||!state.ownerGrantKey.every((x,i)=>BigInt(x)===BigInt(state.registeredKey[i])))
  return{...result,status:'needs-owner-grant',maximumLifetimeCap:approved.toString(),nativeFundingRequired:(available>=needed?0n:needed-available).toString()};
 if(available+pending<needed)return{...result,status:'needs-owner-funding',minimumPending:(needed-available).toString()};
 assert.ok(available+pending<2n**62n,'original owner claim would overflow the reviewed Native budget range');
 return{...result,status:'apply-authenticated-grant',mode:13,grantNonce:nonce.toString(),lifetimeCap:offered.toString(),
  claimOriginalOwnerFunding:pending>0n,maximumFee:grantFee.toString(),followingTaskFee:fee.toString(),authority:'On-chain ordinary owner grant/key/nonce; native key and full UPS remain mandatory'};
}
