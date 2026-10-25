import assert from 'node:assert/strict';
import {FEE_ESCROW as F} from '../amm/u124/client.mjs';

// Read-only planning. The contract and SD-key reauthenticate these values.
// A pending grant is adopted whole or rejected; never add another transfer.
export async function readSponsorGrant(state,market,payer){
 const at=(user,name,index=0)=>{const field=market.abi.contract.state.find(f=>f.name===name);assert.ok(field,'sponsor ABI '+name);return state.slot(user,market.id,field.offset+index);};
 const keys=['sent','claimed','settledFee','pool','amount','nonce','used','purpose'];
 const values=await Promise.all([state.slot(payer,0,3+2*market.vault),state.slot(market.vault,0,4+2*payer),at(market.vault,'settled_fee',payer),at(payer,'sponsor_pool'),at(payer,'sponsor_amount'),at(payer,'sponsor_nonce'),at(market.vault,'used_sponsorship',payer),at(payer,'sponsor_purpose')]);
 return Object.fromEntries(keys.map((k,i)=>[k,values[i]]));
}
export function sponsorGrant(state,{vault,purpose,amount}){
 assert.ok(Number.isSafeInteger(vault)&&vault>0&&vault<16777216);
 assert.ok([1n,2n].includes(purpose));assert.ok([F,2n*F].includes(amount));assert.ok(purpose!==1n||amount===2n*F);
 for(const key of ['sent','claimed','settledFee','pool','amount','nonce','used','purpose']){assert.equal(typeof state[key],'bigint');assert.ok(state[key]>=0n&&state[key]<(1n<<62n));}
 assert.ok(state.sent>=state.claimed);assert.equal(state.claimed,state.settledFee,'claim cursor differs from market accounting');
 if(state.sent===state.claimed){assert.ok(state.nonce+1n<(1n<<62n),'sponsor nonce exhausted');return{adopt:false,amount,purpose,nonce:state.nonce+1n};}
 assert.equal(state.sent-state.claimed,amount,'unexpected pending sponsorship; recover before adding funds');
 assert.equal(state.pool,BigInt(vault));assert.equal(state.amount,amount);assert.equal(state.purpose,purpose);assert.ok(state.nonce>state.used,'grant already consumed');
 return{adopt:true,amount,purpose,nonce:state.nonce};
}
