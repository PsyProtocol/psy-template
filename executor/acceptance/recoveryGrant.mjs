import assert from 'node:assert/strict';
import {FEE_ESCROW as F} from '../../amm/u124/client.mjs';
// Pure authorization check before a recovery sponsor UPS. Existing pending
// value may only be adopted whole; it must never be blindly topped up.
export function recoveryGrant({sent,claimed,settledFee,pool,amount,nonce,used,purpose},vault) {
 for(const n of [sent,claimed,settledFee,pool,amount,nonce,used,purpose])assert.equal(typeof n,'bigint');
 assert.ok(sent>=claimed&&claimed>=0n);assert.equal(claimed,settledFee,'claim cursor differs from market accounting');
 if(sent===claimed)return {adopt:false,amount:2n*F,nonce:nonce+1n};
 assert.equal(sent-claimed,2n*F,'unexpected pending grant; inspect without top-up');
 assert.equal(pool,BigInt(vault));assert.equal(amount,2n*F);assert.equal(purpose,2n);assert.ok(nonce>used,'grant already consumed');
 return {adopt:true,amount:2n*F,nonce};
}
