// Runtime metadata only. The operation descriptors and resulting dedicated
// circuit remain identical; no base market policy is modified.
import assert from 'node:assert/strict';
export const COMPOSITION_SDK='0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425';
export const COMPOSITION_MAGIC=1384803358401154921n;
export function runtimePolicy(policy){
 assert.equal(policy.composition_profile,'two-amm-owner-funded-v1');
 assert.equal(policy.operations.length,18);assert.equal(policy.tx_count,40);assert.equal(policy.witness_length,74);
 assert.ok(!Object.hasOwn(policy,'branches')&&!Object.hasOwn(policy,'config'),'canonical financial policy required');
 return{...structuredClone(policy),config:{networkMagic:String(COMPOSITION_MAGIC)},branches:[{calls:policy.commit},{calls:[policy.begin,policy.finish]},...policy.operations.map(o=>({calls:o.calls})),{calls:[policy.burn]}]};
}
