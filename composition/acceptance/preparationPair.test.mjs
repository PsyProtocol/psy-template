// Report binding tests only; live proofs are independently verified separately.
import test from 'node:test';import assert from 'node:assert/strict';
import{assertSamePreparation}from'./preparationPair.mjs';
const fixture=()=>({fullUpsVerified:true,exactStackAndSessionVerified:true,broadcast:false,fee:1000011000n,actualCalls:9n,callsSha256:'a'.repeat(64),core:{new_user_leaf:{nonce:7n,user_state_tree_root:'b'.repeat(64)},state_transition:{start_user_leaf_hash:'c'.repeat(64)},stats:{slots_modified:11n,total_transactions:9n,guta_fees_collected:1000000000n,da_fees_collected:11000n}}});
test('matched full UPS pair rejects fee, calls, nonce, start/end state or verification substitution',()=>{
 const b=fixture();assert.doesNotThrow(()=>assertSamePreparation(b,fixture()));
 for(const alter of[a=>a.fullUpsVerified=false,a=>a.exactStackAndSessionVerified=false,a=>a.broadcast=true,a=>a.fee++,a=>a.actualCalls++,a=>a.callsSha256='d'.repeat(64),a=>a.core.new_user_leaf.nonce++,a=>a.core.new_user_leaf.user_state_tree_root='d'.repeat(64),a=>a.core.state_transition.start_user_leaf_hash='d'.repeat(64),a=>a.core.stats.slots_modified++]){const a=fixture();alter(a);assert.throws(()=>assertSamePreparation(b,a));}
});
