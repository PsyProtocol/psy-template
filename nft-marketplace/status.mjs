import assert from 'node:assert/strict';
import {decodeAmount,integer,user} from '../amm/u124/client.mjs';
import {readTogether} from '../executor/readConcurrency.mjs';
import {NFT} from './generate.mjs';
export const RESULT_KINDS={1:'sold',2:'purchased',3:'nft-refunded',4:'payment-refunded',5:'listing-fee-refunded',6:'purchase-fee-refunded'};
export const RESULT_FIELDS=[['nonce',0,1],['kind',1,1],['peer',2,1],['quote_amount',3,2],['ft_output_cursor',5,2],['nft_output_nonce',7,1],['token_id',8,4],['metadata_hash',12,4],['fee_output_cursor',16,1]];
export function validateResultsAbi(abi){const f=abi.contract.state.find(f=>f.name==='results');assert.ok(f,'settlement results ABI required');assert.equal(f.type.kind,'array');assert.equal(f.type.length,16777216);assert.equal(f.type.item_felt_size,17);assert.equal(f.felt_size,17*16777216);const t=abi.types.find(t=>t.name===f.type.item.name);assert.equal(t.felt_size,17);assert.deepEqual(t.fields.map(f=>[f.name,f.offset_within_parent,f.felt_size]),RESULT_FIELDS);for(const field of t.fields){const expected=field.felt_size===4?{kind:'primitive',name:'Hash'}:field.felt_size===2?{kind:'array',item:{kind:'primitive',name:'Felt'},length:2,item_felt_size:1}:{kind:'primitive',name:'Felt'};assert.deepEqual(field.type,expected,'receipt field type');}return f;}
export function classifyStatus({order,consumed,result,expectedNonce=order.nonce,claims}){
 integer(expectedNonce,(1n<<62n)-1n);if(!expectedNonce)return {status:'empty',final:false};
 if(result.nonce===expectedNonce){
  assert.equal(consumed,result.nonce,'receipt/consumed cursor mismatch');const status=RESULT_KINDS[Number(result.kind)];assert.ok(status,'invalid result kind');
  return {status,final:true,cancellationRequested:order.nonce===expectedNonce&&order.cancelled===1n,cancellationLostRace:order.nonce===expectedNonce&&order.cancelled===1n&&[1n,2n].includes(result.kind),deliveryComplete:claims.every(c=>c.claimed),claims,result};
 }
 if(consumed>=expectedNonce)return {status:'historical-result',final:true,detailAvailable:false};
 if(order.nonce!==expectedNonce)return {status:'superseded',final:false,detailAvailable:false};
 if(order.kind===0n)return {status:'abandoned',final:true};
 return {status:order.cancelled===1n?'cancellation-requested':'open',final:false};
}
// Reads one immutable checkpoint; claim cursors describe delivery, not current
// ownership (the recipient may already have sold/burned a claimed NFT).
export async function readOrderStatus(s,{contractId,vaultId,userId,abi,config,nonce}){
 user(BigInt(userId));user(BigInt(vaultId));assert.notEqual(userId,vaultId);
 const fields=new Map(abi.contract.state.map(f=>[f.name,f])),r=validateResultsAbi(abi);
 const scalar=(u,name)=>s.slot(u,contractId,fields.get(name).offset);
 const [kind,currentNonce,cancelled,consumed,...values]=await readTogether([scalar(userId,'kind'),scalar(userId,'nonce'),scalar(userId,'cancelled'),s.slot(vaultId,contractId,fields.get('consumed').offset+userId),...Array.from({length:17},(_,i)=>s.slot(vaultId,contractId,r.offset+17*userId+i))]);
 const result={nonce:values[0],kind:values[1],peer:values[2],quoteAmount:decodeAmount(values.slice(3,5)),ftOutputCursor:decodeAmount(values.slice(5,7)),nftOutputNonce:values[7],tokenId:values.slice(8,12),metadataHash:values.slice(12,16),feeOutputCursor:values[16]},claims=[];
 if(result.ftOutputCursor){const base=33554455+4*vaultId,[lo,hi]=await readTogether([s.slot(userId,config.tokenId,base),s.slot(userId,config.tokenId,base+1)]);const current=decodeAmount([lo,hi]);claims.push({asset:'ft',claimed:current>=result.ftOutputCursor,target:result.ftOutputCursor,cursor:current});}
 if(result.nftOutputNonce){const current=await s.slot(userId,config.nftId,NFT.outbox+NFT.stride*vaultId+NFT.claimed);claims.push({asset:'nft',claimed:current>=result.nftOutputNonce,target:result.nftOutputNonce,cursor:current});}
 if(result.feeOutputCursor){const current=await s.slot(userId,0,4+2*vaultId);claims.push({asset:'psy',claimed:current>=result.feeOutputCursor,target:result.feeOutputCursor,cursor:current});}
 return {checkpoint:s.checkpoint,userId,nonce:nonce??currentNonce,...classifyStatus({order:{kind,nonce:currentNonce,cancelled},consumed,result,expectedNonce:nonce??currentNonce,claims})};
}
