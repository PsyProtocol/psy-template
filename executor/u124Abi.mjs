import assert from 'node:assert/strict';
const PEERS=16777216,OUTBOX_BASE=33554453;
const felt={kind:'primitive',name:'Felt'};
const pair={kind:'array',item:felt,length:2,item_felt_size:1};
export function validateU124TokenAbi(abi){
 const c=abi?.contract;assert.equal(c?.state_tree_height,31,'U124 Token ABI height');
 assert.ok(Array.isArray(c.state)&&Array.isArray(c.methods)&&Array.isArray(abi.types),'U124 Token ABI structure');
 for(const [entries,label]of [[c.state,'fields'],[c.methods,'methods'],[abi.types,'types']])assert.equal(new Set(entries.map(x=>x.name)).size,entries.length,`duplicate Token ${label}`);
 const fields=new Map(c.state.map(f=>[f.name,f])),balance=fields.get('balance'),outbox=fields.get('other_user_info');
 assert.ok(balance&&outbox,'U124 Token balance/outbox fields');
 assert.equal(balance.offset,0,'U124 balance offset');assert.equal(balance.felt_size,2,'U124 balance size');assert.deepEqual(balance.type,pair,'U124 balance limbs');
 assert.equal(outbox.offset,OUTBOX_BASE,'U124 outbox offset');assert.equal(outbox.felt_size,4*PEERS,'U124 outbox size');
 assert.equal(outbox.type?.kind,'array','U124 outbox array');assert.equal(outbox.type.length,PEERS,'U124 outbox peers');assert.equal(outbox.type.item_felt_size,4,'U124 outbox stride');assert.equal(outbox.type.item?.kind,'struct','U124 outbox struct');
 const info=abi.types.find(t=>t.name===outbox.type.item.name);assert.equal(info?.kind,'struct','U124 outbox type');assert.equal(info.felt_size,4,'U124 outbox struct size');
 assert.deepEqual(info.fields.map(({name,type,offset_within_parent,felt_size})=>({name,type,offset_within_parent,felt_size})),[
  {name:'amount_sent',type:pair,offset_within_parent:0,felt_size:2},
  {name:'amount_claimed',type:pair,offset_within_parent:2,felt_size:2}
 ],'U124 sent/claimed limbs');
 const ids=new Set();for(const m of c.methods){assert.ok(Number.isSafeInteger(m.method_id)&&m.method_id>=0&&m.method_id<=4294967295,'Token method ID');assert.ok(!ids.has(m.method_id),'duplicate Token method ID');ids.add(m.method_id);}
 for(const [name,types,count]of [['claim',[felt],1],['transfer',[felt,pair],3]]){
  const m=c.methods.find(x=>x.name===name);assert.ok(m,`Token ${name} method`);assert.equal(m.state_mutability,'external',`Token ${name} mutability`);assert.equal(m.input_felt_count,count,`Token ${name} arity`);assert.deepEqual(m.inputs?.map(x=>x.type),types,`Token ${name} inputs`);assert.deepEqual(m.inputs.map(x=>x.felt_size),types.map(t=>t.kind==='array'?2:1),`Token ${name} input sizes`);assert.equal(m.output_felt_count,0,`Token ${name} outputs`);assert.deepEqual(m.outputs,[],`Token ${name} outputs`);
 }
 return abi;
}
