// Compiled once for an explicitly reviewed two-AMM registry. The resulting
// fingerprint is a NEW key; existing market keys and vaults are not replaced.
import assert from 'node:assert/strict';
const F='1000100000';
export function fundsPolicy({controllerId,controllerAbi,assetA,assetB,tokenAbi,nativeAbi,markets,registryHash}){
 assert.match(registryHash,/^[0-9a-f]{64}$/);assert.ok(markets.length===2);
 const ids=[controllerId,assetA,assetB,...markets.map(m=>m.id)],vaults=markets.map(m=>m.vault);
 for(const id of [...ids,...vaults])assert.ok(Number.isSafeInteger(id)&&id>0&&id<16777216);
 assert.equal(new Set(ids).size,5);assert.equal(new Set(vaults).size,2);
 const c=n=>({constant:String(n)}),w=n=>({witness:n});
 const descriptor=(id,abi,name,inputs=[])=>{const m=abi.contract.methods.find(m=>m.name===name);assert.ok(m,'missing compiled method '+name);assert.equal(inputs.length,m.input_felt_count,'exact arity '+name);return{contract_id:id,method_id:m.method_id,method_name:name,inputs};};
 const ctrl=(name,args=[])=>descriptor(controllerId,controllerAbi,name,args),native=(name,args)=>descriptor(0,nativeAbi,name,args),ft=(id,name,args)=>descriptor(id,tokenAbi,name,args),market=(hop,name,args=[])=>descriptor(markets[hop-1].id,markets[hop-1].abi,name,args);
 const noop=ctrl('noop'),forbidden=ctrl('forbidden'),operations=[];
 const charge=()=>ctrl('charge',[w(12)]),own=[w(1),w(2)],amount=[w(3),w(4)],minimum=[w(5),w(6)];
 const add=(name,calls)=>{assert.ok(calls.length<=9);operations.push({branch:operations.length+1,name,maintenance:true,calls:[...calls,...Array.from({length:9-calls.length},()=>structuredClone(noop))]});};
 add('fund',[ctrl('begin_funding',own),ft(assetA,'claim',[w(1)]),native('simple_claim',[w(1)]),ft(assetB,'cancel_unclaimed_payment',[w(1)]),ctrl('finish_funding',own),charge()]);
 for(const hop of [1,2]){
  const vault=markets[hop-1].vault,side=hop-1,input=hop===1?assetA:assetB,output=hop===1?assetB:assetA;
  add('open-'+hop,[ctrl('prepare_'+hop,[...own,...amount,...minimum,w(7),w(8)]),market(hop,'open_swap',[c(vault),c(side),...amount,...minimum,w(7),w(8)]),native('simple_transfer',[c(vault),c(F)]),ft(input,'transfer',[c(vault),...amount]),ctrl('finish_send_'+hop,own),charge()]);
  add('consent-'+hop,[ctrl('mark_consent',[...own,c(hop),w(9),w(10)]),market(hop,'request_admission',[w(9),w(10)]),charge()]);
  add('cancel-'+hop,[ctrl('mark_cancel',[...own,c(hop)]),market(hop,'request_cancel'),charge()]);
  add('recover-'+hop,[ctrl('mark_recovery',[...own,c(hop)]),market(hop,'release_unaccepted'),market(hop,'request_recovery',[c(vault)]),charge()]);
  add('success-'+hop,[market(hop,'close_swap_'+side),ft(output,'claim',[c(vault)]),ctrl('record_'+hop+'_success',[...own,...amount]),charge()]);
  add('refund-'+hop,[market(hop,'close_swap_'+side),ft(input,'claim',[c(vault)]),native('simple_claim',[c(vault)]),ctrl('record_'+hop+'_refund',[...own,...amount]),charge()]);
  // release_unaccepted has already cleared the local order in this path. The
  // public market's recovery UPS must confirm before these claims can succeed.
  add('recovered-'+hop,[ft(input,'claim',[c(vault)]),native('simple_claim',[c(vault)]),ctrl('record_'+hop+'_refund',[...own,...amount]),charge()]);
 }
 for(const [mode,id]of [['input',assetA],['middle',assetB],['final',assetA]])add('return-'+mode,[ctrl('begin_return_'+mode,[...own,...amount,w(11),w(12)]),ft(id,'transfer',[w(1),...amount]),native('simple_transfer',[w(1),w(11)]),ctrl('finish_return_'+mode,own)]);
 return{version:2,market:'amm',market_id:controllerId,composition_profile:'two-amm-owner-funded-v1',registry_hash:registryHash,tx_count:40,witness_length:74,fee_min:'1000000000',fee_max:F,operations,commit:[forbidden,noop],begin:forbidden,finish:forbidden,expire:forbidden,noop,burn:native('simple_burn',[w(73)])};
}
export function fundsRequest(policy,name,terms){
 assert.ok(terms&&typeof terms==='object'&&!Array.isArray(terms));assert.ok(Object.keys(terms).every(k=>['owner','nonce','amount','minimum','deadline','orderNonce','epoch','cutoff','nativeRefund','fee'].includes(k)),'unknown composition request field');
 const {owner,nonce,amount=0n,minimum=0n,deadline=0n,orderNonce=0n,epoch=0n,cutoff=0n,nativeRefund=0n,fee}=terms;
 assert.equal(policy.composition_profile,'two-amm-owner-funded-v1');const op=policy.operations.find(o=>o.name===name);assert.ok(op,'unsupported composition operation');
 const B=1n<<62n;for(const n of [owner,nonce,amount,minimum,deadline,orderNonce,epoch,cutoff,nativeRefund,fee])assert.ok(typeof n==='bigint'&&n>=0n);
 assert.ok(owner>0n&&owner<16777216n&&nonce>0n&&nonce<B&&amount<B*B&&minimum<B*B&&fee>=1000000000n&&fee<=BigInt(F)&&fee%1000n===0n);
 assert.ok(deadline<2n**32n&&epoch<2n**32n&&cutoff<2n**32n&&orderNonce<B&&nativeRefund<B,'composition integer bounds');
 const local=[BigInt(op.branch),owner,nonce,amount%B,amount/B,minimum%B,minimum/B,deadline,orderNonce,epoch,cutoff,nativeRefund,fee];
 const used=new Set([0]);for(const c of op.calls)for(const a of c.inputs)if('witness'in a)used.add(a.witness);
 for(let i=1;i<13;i++)if(!used.has(i))assert.equal(local[i],0n,'unused field '+i);
 const fields=Array(74).fill(0n);fields[0]=4n;fields.splice(21,13,...local);fields[73]=fee;
 const calls=op.calls.filter(c=>c.method_name!=='noop'||c.contract_id!==policy.noop.contract_id).map(c=>({contract_id:BigInt(c.contract_id),method_name:c.method_name,inputs:c.inputs.map(a=>'witness'in a?local[a.witness]:BigInt(a.constant))}));
 return{contract_calls:calls,software_defined_call:{inputs:fields}};
}
