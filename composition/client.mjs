// Ordinary owner wallet boundary. These builders neither sign nor broadcast.
// The dedicated adapter rechecks the reviewed deployment; actual ordinary UPS
// proofs still authenticate calls, nonce, state and the automatic fee burn.
import assert from'node:assert/strict';import{decodeAmount}from'../amm/u124/client.mjs';
const offset=(abi,name)=>{const f=abi.contract.state.find(f=>f.name===name);assert.ok(f,name);return f.offset;};
const wide=async(s,u,c,o)=>decodeAmount(await Promise.all([s.slot(u,c,o),s.slot(u,c,o+1)]));
function binding(model,id){const t=model.intent.terms;if(id===t.execution.controllerId){const e=t.execution;return{contract:{contractId:Number(id),codeRoot:e.codeRoot,layoutRoot:e.layoutRoot,stateTreeHeight:Number(e.stateTreeHeight)},functionTreeRoot:e.functionTreeRoot,layoutFieldCount:Number(e.layoutFieldCount),layoutSlotCount:Number(e.layoutSlotCount)};}const d=model.plan.registry.value.markets.flatMap(m=>m.dependencies).find(d=>d.contractId===id);assert.ok(d);return{contract:{contractId:Number(id),codeRoot:d.codeRoot,layoutRoot:d.layoutRoot,stateTreeHeight:Number(d.stateTreeHeight)},functionTreeRoot:d.functionTreeRoot,layoutFieldCount:Number(d.layoutFieldCount),layoutSlotCount:Number(d.layoutSlotCount)};}
function input(model,s,calls){const ids=[...new Set([0n,...calls.map(c=>c.contract_id)])],cp=BigInt(s.checkpoint);return{calls:{contract_calls:calls,software_defined_call:{inputs:[]}},contracts:ids.map(id=>binding(model,id)),validUntilCheckpoint:Number(cp+64n)};}
export async function prepareOwnerFunding(adapter){
 const s=await adapter.snapshot(),m=adapter.model,t=m.intent.terms,U=Number(t.owner),V=Number(t.execution.vaultId),C=Number(t.execution.controllerId),at=(u,n)=>s.slot(u,C,offset(m.controllerAbi,n));
 assert.ok(BigInt(s.checkpoint)<t.expiresAtCheckpoint,'intent expired before owner funding');assert.equal(await at(V,'phase'),0n);assert.equal(await at(U,'request_nonce'),0n,'one-shot request already exists; reconcile original funding');
 assert.ok(await s.slot(U,0,0)>=m.controllerBudget+m.ownerFeeReserve,'explicit owner funding and ordinary recovery fee reserve');assert.ok(await wide(s,U,Number(m.assetA),0)>=t.input.amount,'owner spendable input, not an Outbox');
 // Never silently add to a partially submitted deposit. Nonzero original
 // cursors require exact reconciliation, even if the controller is still empty.
 assert.equal(await wide(s,U,Number(m.assetA),33554453+4*V),0n,'prior input deposit requires reconciliation');assert.equal(await s.slot(U,0,3+2*V),0n,'prior native deposit requires reconciliation');
 const prepared=input(m,s,m.funding.calls);prepared.validUntilCheckpoint=Number(BigInt(prepared.validUntilCheckpoint)<t.expiresAtCheckpoint?BigInt(prepared.validUntilCheckpoint):t.expiresAtCheckpoint);
 return{status:'owner-signature-required',intentId:m.intent.id,owner:t.owner,authorization:m.funding,input:prepared,sourceCheckpoint:s.checkpoint,sourceAuthenticated:false,scope:'ordinary owner UPS request + exact FT/native funding + binding; not a composition settlement or broadcast'};
}
export async function prepareOwnerClaim(adapter){
 const s=await adapter.snapshot(),m=adapter.model,t=m.intent.terms,U=Number(t.owner),V=Number(t.execution.vaultId),C=Number(t.execution.controllerId),at=n=>s.slot(V,C,offset(m.controllerAbi,n));
 assert.equal(await at('phase'),99n,'controller must be terminal');assert.equal(await at('owner'),t.owner);assert.equal(await at('intent_nonce'),t.nonce);assert.equal(await s.slot(V,0,0),0n);for(const id of[m.assetA,m.assetB])assert.equal(await wide(s,V,Number(id),0),0n,'controller residual');
 const final=await wide(s,V,C,offset(m.controllerAbi,'final_amount')),middle=await wide(s,V,C,offset(m.controllerAbi,'middle')),expectedAsset=final>0n?m.assetA:middle>0n?m.assetB:m.assetA,expectedAmount=final>0n?final:middle>0n?middle:t.input.amount;
 const calls=[],pending=[];
 for(const id of[m.assetA,m.assetB]){const sent=await wide(s,V,Number(id),33554453+4*U),claimed=await wide(s,U,Number(id),33554455+4*V);assert.equal(sent,id===expectedAsset?expectedAmount:0n,'exact terminal owner asset Outbox');assert.ok(claimed===0n||claimed===sent,'unexpected partial owner claim');if(sent>claimed){calls.push({contract_id:id,method_name:'claim',inputs:[BigInt(V)]});pending.push({asset:id,amount:sent-claimed});}}
 const nativeSent=await s.slot(V,0,3+2*U),nativeClaimed=await s.slot(U,0,4+2*V);assert.ok(nativeSent>=nativeClaimed);if(nativeSent>nativeClaimed)calls.push({contract_id:0n,method_name:'simple_claim',inputs:[BigInt(V)]});
 return{status:calls.length?'owner-signature-required':'owner-outboxes-claimed',intentId:m.intent.id,owner:t.owner,pending,nativePending:nativeSent-nativeClaimed,...(calls.length?{input:input(m,s,calls)}:{}),sourceCheckpoint:s.checkpoint,sourceAuthenticated:false,scope:'exact terminal FT/native cursor observation; final inclusion and whole-workflow asset/fee audit remain separate; no price reversal or broadcast'};
}
