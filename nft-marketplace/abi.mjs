import assert from 'node:assert/strict';
import {validateU124TokenAbi} from '../executor/u124Abi.mjs';
export {validateU124TokenAbi};
export const METHODS={noop:0,open_listing:6,open_buy:7,request_cancel:0,close_listing:0,close_buy:0,abandon_unfunded:0,settle_sale:6,refund_listing:2,refund_listing_fee:2,refund_buy:4,refund_buy_fee:2,ack_delivery:1};
const unique=(rows,key)=>assert.equal(new Set(rows.map(x=>x[key])).size,rows.length,`duplicate ABI ${key}`);
export function validateNftAbi(abi,height=30){
 assert.equal(height,30,'NFT height');unique(abi.contract.state,'name');unique(abi.contract.methods,'name');unique(abi.contract.methods,'method_id');unique(abi.types,'name');
 const fields=new Map(abi.contract.state.map(f=>[f.name,f]));
 for(const [name,offset,stride,length]of [['owned_tokens',30,9,128],['outbox',1182,35,16777216]]){const f=fields.get(name);assert.equal(f.offset,offset);assert.equal(f.type.kind,'array');assert.equal(f.type.item_felt_size,stride);assert.equal(f.type.length,length);assert.equal(f.felt_size,stride*length);}
 for(const [name,offset,size]of [['balance',0,1],['total_minted',3,1]]){assert.equal(fields.get(name).offset,offset);assert.equal(fields.get(name).felt_size,size);}
 const structs=[['NFTSlot',9,[['token_id',0,4],['is_active',4,1],['metadata_hash',5,4]]],['NFTOutbox',35,[...Array.from({length:4},(_,i)=>[[`token_id_${i}`,8*i,4],[`metadata_hash_${i}`,8*i+4,4]]).flat(),['nonce_sent',32,1],['nonce_claimed',33,1],['nonce_acked',34,1]]]];
 for(const [name,size,expected]of structs){const t=abi.types.find(t=>t.name===name);assert.equal(t.felt_size,size);assert.deepEqual(t.fields.map(f=>[f.name,f.offset_within_parent,f.felt_size]),expected);for(const f of t.fields){assert.equal(f.type.kind,'primitive');assert.equal(f.type.name,f.felt_size===4?'Hash':'Felt');}}
 assert.equal(fields.get('owned_tokens').type.item.name,'NFTSlot');assert.equal(fields.get('outbox').type.item.name,'NFTOutbox');
 for(const [name,count]of [['claim',2],['transfer',2],['acknowledge',1]]){const m=abi.contract.methods.find(m=>m.name===name);assert.equal(m.input_felt_count,count);assert.equal(m.output_felt_count,0);assert.equal(m.state_mutability,'external');assert.equal(m.inputs.length,count);for(const f of m.inputs)assert.deepEqual(f.type,{kind:'primitive',name:'Felt'});}
}
export function marketGate(a,c){
 assert.equal(a.state_tree_height,31);unique(a.abi.contract.state,'name');unique(a.abi.contract.methods,'name');unique(a.abi.contract.methods,'method_id');
 assert.deepEqual(a.abi.contract.methods.map(m=>[m.name,m.input_felt_count]).sort(),Object.entries(METHODS).sort());
 assert.equal(a.circuit_definitions.length,Object.keys(METHODS).length);
 const view=a.abi.contract.state.find(f=>f.name==='external_view');assert.equal(view.offset,0);assert.equal(view.felt_size,1073741824);
 for(const def of a.circuit_definitions){let next=0;for(const n of def.definitions)if(n.data_type===0)assert.equal(n.index,next++,'dense Felt targets');assert.equal(def.circuit_inputs.length,METHODS[def.name]);const constants=new Map(def.definitions.filter(n=>n.data_type===0&&n.op_type===1).map(n=>[n.index,n.inputs[0]])),current=new Set(def.definitions.filter(n=>n.data_type===0&&n.op_type===47).map(n=>n.index));for(const [i,s]of def.state_commands.entries()){if(!s.type.startsWith('GetOtherUserContractStateSlot')&&!s.type.startsWith('GetSelfUserExternalContractStateSlot'))continue;const cid=constants.get(s.contract_id);if(!current.has(s.contract_id))assert.equal(s.length??1,1,'scalar asset read');assert.equal(constants.get(s.contract_state_tree_height),cid===0?32:cid===c.nftId?30:31,'foreign proof height');assert.ok([0,c.nftId,c.tokenId].includes(cid)||current.has(s.contract_id),'foreign ID');assert.ok(def.definitions.findIndex(n=>n.data_type===0&&n.index===s.contract_state_tree_height)<def.state_command_resolution_indices[i],'height precedes read');}}
 return {valid:true,methods:Object.keys(METHODS).length,amountBits:124,heights:{market:31,nft:30,token:31,psy:32},deploymentReady:false,fullUpsVerified:false,broadcast:false};
}
