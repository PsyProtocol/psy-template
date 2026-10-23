import test from'node:test';import assert from'node:assert/strict';
import{createRegistry,createIntent,planIntent}from'./intent.mjs';import{fundsFixture}from'./fundsFixtures.mjs';
import{ownerFunding,validateOwnerFunding,publicKeyFelts}from'./funding.mjs';
const root='a'.repeat(64),F=1000100000n;
function fixture(){
 const dependency=contractId=>({contractId,codeRoot:root,layoutRoot:root,functionTreeRoot:root,stateTreeHeight:31n,layoutFieldCount:1n,layoutSlotCount:100n});
 const market=(marketId,vaultId)=>({kind:'amm',marketId,vaultId,fingerprint:root,publicKeyHash:root,assets:[{id:42n,decimals:18},{id:43n,decimals:18}],dependencies:[0n,marketId,42n,43n].map(dependency)});
 const registry=createRegistry({domainHash:root,sdkManifestHash:'0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425',markets:[market(1000n,300n),market(1001n,400n)]});
 const intent=createIntent({version:2,domainHash:root,sdkManifestHash:'0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425',registryHash:registry.hash,owner:200n,receiver:200n,nonce:1n,expiresAtCheckpoint:500n,maxNativeFees:26n*F,input:{id:42n,decimals:18,amount:(1n<<62n)+17n},output:{id:42n,decimals:18,amount:1n},markets:[1000n,1001n],execution:{initialization:{asset:43n,amount:1n,mode:'sender-bound-cancel-before-route'},controllerId:1002n,vaultId:100n,fingerprint:root,publicKeyHash:root,codeRoot:root,layoutRoot:root,functionTreeRoot:root,stateTreeHeight:31n,layoutFieldCount:1n,layoutSlotCount:100n}});
 const snapshots=[1000n,1001n].map((marketId,j)=>({marketId,vaultId:j?400n:300n,checkpoint:100n,stateRoot:root,reserveA:20n*10n**18n,reserveB:20n*10n**18n}));
 const plan=planIntent({intent,registry,snapshots,checkpoint:100n}),{policy,...abis}=fundsFixture(registry.hash);
 return{intent,plan,policy,...abis,networkMagic:1384803358401154921n,controllerBudget:20n*F,ownerFeeReserve:6n*F};
}
test('funding binds both amount limbs, reviewed route and one atomic owner UPS',()=>{
 const input=fixture(),a=ownerFunding(input);assert.equal(a.workflowAtomic,false);assert.equal(a.calls.length,5);assert.deepEqual(a.calls.map(c=>c.method_name),['request_route','simple_transfer','transfer','transfer','bind_funding']);assert.deepEqual(a.calls[2].inputs,[100n,17n,1n]);assert.equal(a.midMinimum,input.plan.steps[0].output);assert.equal(a.finalMinimum,1n);assert.equal(a.maximumOwnerSpend,26n*F);validateOwnerFunding(a,input);
 for(const change of [x=>x.calls[2].inputs[0]++,x=>x.calls[2].inputs[1]++,x=>x.controllerBudget++,x=>x.midMinimum++,x=>x.registryHash='b'.repeat(64)]){const bad=structuredClone(a);change(bad);assert.throws(()=>validateOwnerFunding(bad,input));}
});
test('key wire order matches four canonical little endian SDK limbs; no field reduction',()=>{
 const hash=[44n,33n,22n,11n].map(n=>n.toString(16).padStart(16,'0')).join('');assert.deepEqual(publicKeyFelts(hash),[11n,22n,33n,44n]);assert.throws(()=>publicKeyFelts('ffffffffffffffff'+'0'.repeat(48)));
});
test('route, fee ceilings, one-shot nonce and policy substitution reject before funding',()=>{
 const i=fixture();for(const change of [x=>x.networkMagic++,x=>x.controllerBudget+=1n,x=>x.ownerFeeReserve-=1n,x=>x.policy.operations[1].calls[1].contract_id++,x=>x.plan.steps[1].side=0,x=>x.intent.terms.output.decimals=9,x=>x.intent.terms.nonce=2n]){const bad=structuredClone(i);change(bad);assert.throws(()=>ownerFunding(bad));}
});
test('v2 intent binds refundable initialization and rejects an omitted, wrong or enlarged seed',()=>{const f=fixture(),terms=f.intent.terms;for(const initialization of [undefined,{...terms.execution.initialization,amount:0n},{...terms.execution.initialization,amount:2n},{...terms.execution.initialization,mode:'retain-for-trading'}]){const v=structuredClone(terms);if(initialization===undefined)delete v.execution.initialization;else v.execution.initialization=initialization;assert.throws(()=>createIntent(v));}const v=structuredClone(terms);v.execution.initialization.asset=42n;const intent=createIntent(v),plan=planIntent({intent,registry:f.plan.registry,snapshots:f.plan.snapshots,checkpoint:f.plan.sourceCheckpoint});assert.throws(()=>ownerFunding({...f,intent,plan}),/initialization must/);});
