import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBatchPolicy,witness,signingRequest,operationCalls,validateFields,TX_COUNT,WITNESS_LENGTH,OP_START,OP_WIDTH,BURN_INDEX} from './policy.mjs';
import {generateBatch} from './generate.mjs';
import {readReviewedAbis} from '../../tests/fixtures/reviewedAbis.mjs';
import {encodeAmount} from '../../amm/u124/client.mjs';
import {operation} from './planner.mjs';

const fixture=readReviewedAbis().admission;
const abiFor=market=>structuredClone(fixture.markets[market].artifact.abi);
const configFor=market=>structuredClone(fixture.markets[market].config);
const token=structuredClone(fixture.token.abi),nft=structuredClone(fixture.nft.abi);
const markets=['amm','orderbook','bondingcurve','nftmarket'];
const policies=new Map(markets.map(market=>[market,makeBatchPolicy(market,1000,configFor(market),abiFor(market),token,nft)]));
const policy=policies.get('amm'),book=policies.get('orderbook'),nftMarket=policies.get('nftmarket');
const op=(branch,payer=200n)=>{const f=Array(OP_WIDTH).fill(0n);f[0]=BigInt(branch);f[1]=payer;return f;};
const namedOperation=(p,name,args={})=>operation(p,name,{payer:200n,...args});
const firstSettlementName=p=>p.market==='orderbook'?'match_orders':p.market==='bondingcurve'?'settle_buy':p.market==='nftmarket'?'settle_sale':'swap_0';
const settlementArgs=(p,name)=>name==='match_orders'?{peer:201n,x:10n,y:10n,nonce:1n,peerNonce:2n}:name==='settle_sale'?{peer:201n,x:10n,nonce:1n,peerNonce:2n}:{x:10n,y:1n,nonce:1n};
const settle=(p,operations=[namedOperation(p,firstSettlementName(p),settlementArgs(p,firstSettlementName(p)))],rank=[0n,0n,0n,0n])=>witness({mode:2,batch:1n,root:[1n,2n,3n,4n],rank,operations,burn:0n});
const maintenance=p=>witness({mode:4,operations:[namedOperation(p,p.operations.find(o=>o.maintenance).name)],burn:0n});
const clone=a=>[...a];
const feeFilled=fields=>fields.map((n,i)=>i===BURN_INDEX?1000000000n:n);

test('witness rejects overflow into every adjacent segment before copying',()=>{
 const fifth=5n;
 assert.throws(()=>witness({mode:1,batch:1n,users:[1n,2n,3n,4n,fifth],nonces:[1n,2n,3n,4n]}),/commit users capacity/);
 assert.throws(()=>witness({mode:1,batch:1n,users:[1n,2n,3n,4n],nonces:[1n,2n,3n,4n,fifth]}),/commit nonces capacity/);
 assert.throws(()=>witness({mode:2,root:[1n,2n,3n,4n,fifth]}),/batch root capacity/);
 assert.throws(()=>witness({mode:2,rank:[0n,0n,0n,0n,fifth]}),/batch rank capacity/);
 assert.throws(()=>witness({mode:2,operations:[op(1),op(2),op(3),op(4),op(5)]}),/batch operations capacity/);
 const wide=Array(OP_WIDTH+1).fill(0n);wide[0]=1n;
 assert.throws(()=>witness({mode:2,operations:[wide]}),/batch operation vector capacity/);
});

test('witness requires coherent commit cardinality and exact root/rank shapes',()=>{
 assert.throws(()=>witness({mode:1,batch:1n,users:[200n,201n],nonces:[1n]}),/commit member nonce cardinality/);
 assert.throws(()=>witness({mode:1,batch:1n,users:[200n],nonces:[1n,2n]}),/commit member nonce cardinality/);
 for(const root of [[],[1n],[1n,2n,3n]])assert.throws(()=>witness({mode:2,root}),/batch root capacity/);
 for(const rank of [[],[0n],[0n,0n,0n]])assert.throws(()=>witness({mode:2,rank}),/batch rank capacity/);
 assert.doesNotThrow(()=>witness({mode:1,batch:1n,users:[],nonces:[]}));
 assert.doesNotThrow(()=>witness({mode:2,rank:[0n,0n,0n,0n]}),'NFT zero rank sentinel remains valid');
});

test('witness rejects sparse vectors and non-BigInt scalar elements without coercion',()=>{
 const sparseUsers=[200n,,202n,203n],sparseNonces=[1n,,3n,4n];
 assert.throws(()=>witness({mode:1,batch:1n,users:sparseUsers,nonces:sparseNonces}),/commit users must be dense/);
 const sparseRoot=[1n,,3n,4n];assert.throws(()=>witness({mode:2,root:sparseRoot}),/batch root must be dense/);
 const sparseRank=[0n,,0n,0n];assert.throws(()=>witness({mode:2,rank:sparseRank}),/batch rank must be dense/);
 const sparseOp=op(1);delete sparseOp[1];assert.throws(()=>witness({mode:2,operations:[sparseOp]}),/batch operation vector must be dense/);
 const sparseOps=[op(1),,op(3),op(4)];assert.throws(()=>witness({mode:2,operations:sparseOps}),/batch operations must be dense/);
 const P=18446744069414584321n;
 // Root words use the full Goldilocks range; other scalar fields stay below 2^62.
 for(const bad of ['1',1,null,undefined,true,{},P,-1n]){
  assert.throws(()=>witness({mode:2,root:[bad,2n,3n,4n]}),/canonical batch witness/);
 }
 for(const bad of ['1',1,null,undefined,true,{},1n<<62n,-1n]){
  assert.throws(()=>witness({mode:2,rank:[bad,0n,0n,0n]}),/canonical batch witness/);
  assert.throws(()=>witness({mode:1,batch:1n,users:[bad],nonces:[1n]}),/canonical batch witness/);
 }
 assert.doesNotThrow(()=>witness({mode:2,root:[1n<<62n,2n,3n,4n]}));
 assert.throws(()=>witness({mode:'2'}),/canonical batch mode/);
 assert.throws(()=>witness({mode:2,batch:'1'}),/canonical batch witness/);
 assert.throws(()=>witness({mode:2,burn:'0'}),/canonical batch witness/);
});

test('validateFields and signingRequest reject sparse or overlong full frames before semantic use',()=>{
 const good=settle(policy);
 for(const makeBad of [
  f=>{f.push(0n);return f;},
  f=>{f.length=WITNESS_LENGTH-1;return f;},
  f=>{delete f[0];return f;},
  f=>{delete f[13];return f;},
  f=>{delete f[OP_START];return f;},
  f=>{f[0]='2';return f;},
  f=>{f[13]=18446744069414584321n;return f;},
  f=>{f[17]=-1n;return f;}
 ]){
  const bad=makeBad(clone(good));
  assert.throws(()=>validateFields(policy,bad));
  assert.throws(()=>signingRequest(policy,bad));
 }
 const overBurn=clone(good);overBurn[BURN_INDEX]=1000100001n;
 assert.throws(()=>validateFields(policy,overBurn),/burn fee/);
 assert.throws(()=>signingRequest(policy,overBurn),/burn fee/);
});

test('all four legitimate modes keep deterministic request/call output and burn-zero placeholder',()=>{
 const cases=[
  [policy,witness({mode:1,batch:1n,users:[200n,201n],nonces:[2n,1n],expiry:120n,sponsor:300n,burn:0n})],
  [book,settle(book,[op(book.operations.find(o=>o.name==='match_orders').branch)],[3n,1n,0n,2n])],
  [policy,witness({mode:3,batch:1n,burn:0n})],
  [nftMarket,maintenance(nftMarket)]
 ];
 for(const [p,fields] of cases){
  assert.equal(fields[BURN_INDEX],0n);
  assert.throws(()=>validateFields(p,fields),/burn fee/);
  const funded=feeFilled(fields);
  validateFields(p,funded);
  const request=signingRequest(p,fields),again=signingRequest(p,clone(fields));
  assert.deepEqual(request,again);
  assert.equal(request.software_defined_call.inputs[BURN_INDEX],0n,'ordinary request keeps burn-zero placeholder');
  const calls=operationCalls(p,funded);
  assert.equal(calls.length,TX_COUNT);
  assert.deepEqual(request.contract_calls,calls.slice(0,-1).map(({contract_id,method_name,inputs})=>({contract_id,method_name,inputs})));
  assert.equal(calls.at(-1).method_name,'simple_burn');
  assert.deepEqual(calls.at(-1).inputs,[1000000000n]);
 }
});

test('high valid Goldilocks root words and full U124 amount limbs remain unchanged',()=>{
 const P=18446744069414584321n,root=[P-1n,P-2n,0n,1n];
 const amount=(1n<<124n)-1n,limbs=encodeAmount(amount);
 const branch=policy.operations.find(o=>o.name==='swap_0'),f=op(branch.branch);
 f[3]=limbs[0];f[4]=limbs[1];f[5]=limbs[0];f[6]=limbs[1];f[10]=7n;
 const fields=witness({mode:2,batch:1n,root,operations:[f],burn:0n});
 assert.deepEqual(fields.slice(13,17),root);
 const request=signingRequest(policy,fields),calls=operationCalls(policy,fields.map((n,i)=>i===BURN_INDEX?1000000000n:n));
 assert.deepEqual(request.software_defined_call.inputs.slice(13,17),root);
 assert.deepEqual(calls[1].inputs.slice(1,5),[...limbs,...limbs]);
 assert.equal(fields.length,WITNESS_LENGTH);
});

test('witness accepts Number and BigInt modes 1..4 identically for real policy operations',()=>{
 const cases=[
  p=>({batch:1n,users:[200n,201n],nonces:[2n,1n],expiry:120n,sponsor:300n}),
  p=>{const name=firstSettlementName(p);return {batch:1n,root:[1n,2n,3n,4n],rank:p.market==='orderbook'?[3n,1n,0n,2n]:[0n,0n,0n,0n],operations:[namedOperation(p,name,settlementArgs(p,name))]};},
  ()=>({batch:1n}),
  p=>({operations:[namedOperation(p,p.operations.find(o=>o.maintenance).name)]})
 ];
 for(const market of markets){
  const p=policies.get(market);
  for(let mode=1;mode<=4;mode++){
   const args=cases[mode-1](p);
   const fromNumber=witness({...args,mode,burn:0n}),fromBigInt=witness({...args,mode:BigInt(mode),burn:0n});
   assert.deepEqual(fromNumber,fromBigInt,'Number and BigInt modes produce one frame');
   assert.equal(fromNumber[0],BigInt(mode));
   assert.equal(fromNumber[BURN_INDEX],0n);
   if(mode===2||mode===4){
    const selected=args.operations[0],branch=p.operations.find(o=>BigInt(o.branch)===selected[0]);
    const used=new Set([0,...branch.calls.flatMap(c=>c.inputs.filter(v=>v.witness!==undefined).map(v=>v.witness))]);
    assert.deepEqual(selected,selected.map((n,i)=>used.has(i)?n:0n),'operation vector keeps exactly the policy-used fields');
   }
   assert.throws(()=>validateFields(p,fromNumber),/burn fee/);
   validateFields(p,feeFilled(fromNumber));
   const request=signingRequest(p,fromNumber),again=signingRequest(p,fromBigInt);
   assert.deepEqual(request,again);
   assert.equal(request.software_defined_call.inputs[BURN_INDEX],0n);
   const calls=operationCalls(p,feeFilled(fromNumber));
   assert.equal(calls.length,TX_COUNT);
   assert.deepEqual(calls,operationCalls(p,feeFilled(fromBigInt)));
   assert.deepEqual(request.contract_calls,calls.slice(0,-1).map(({contract_id,method_name,inputs})=>({contract_id,method_name,inputs})));
  }
 }
 for(const bad of ['2',2.5,NaN,Infinity,null,undefined,true,{},[],0,5,-1,0n,5n,-1n,1n<<62n]){
  assert.throws(()=>witness({mode:bad,batch:1n,users:[],nonces:[]}));
 }
});

test('real reviewed fixture generators still produce accepted bounded policies',()=>{
 for(const market of markets){
  const p=policies.get(market),generated=generateBatch(market,configFor(market));
  assert.ok(generated);
  assert.equal(p.tx_count,TX_COUNT);
  assert.equal(p.witness_length,WITNESS_LENGTH);
  const fields=maintenance(p);
  assert.equal(operationCalls(p,fields.map((n,i)=>i===BURN_INDEX?1000000000n:n)).length,TX_COUNT);
  assert.equal(signingRequest(p,fields).contract_calls.length,TX_COUNT-1);
 }
});

test('full-frame consumers refuse an own-iterator frame before the iterator is invoked',()=>{
 let iterations=0;
 const approved=witness({mode:3,batch:1n,burn:0n}),alternate=approved.slice();
 alternate[1]=2n;
 Object.defineProperty(approved,Symbol.iterator,{value:function*(){iterations++;yield* alternate;},enumerable:true,configurable:true});
 // An own Symbol.iterator is an extra own property, so every consumer must
 // refuse the raw frame rather than read through the substituted iterator.
 assert.throws(()=>validateFields(policy,approved),/batch witness extra own properties/);
 assert.throws(()=>signingRequest(policy,approved),/batch witness extra own properties/);
 assert.throws(()=>operationCalls(policy,approved),/batch witness extra own properties/);
 assert.equal(iterations,0);
 // The untouched frame still produces exactly the approved batch.
 const clean=witness({mode:3,batch:1n,burn:0n});
 const request=signingRequest(policy,clean);
 assert.deepEqual(request.software_defined_call.inputs,clean);
 assert.equal(request.software_defined_call.inputs[1],1n);
 assert.deepEqual(request.contract_calls[0].inputs,[1n]);
 assert.deepEqual(operationCalls(policy,feeFilled(clean))[0].inputs,[1n]);
 assert.doesNotThrow(()=>validateFields(policy,feeFilled(clean)));
});

test('array boundaries reject accessor indices without invoking getters',()=>{
 let reads=0;
 const withAccessor=(array,index)=>{
  Object.defineProperty(array,index,{get(){reads++;return 1n;},enumerable:true,configurable:true});
  return array;
 };
 const badFull=withAccessor(clone(settle(policy)),13);
 // Fund the burn slot in place: Array.map would invoke the getter and hand
 // operationCalls a sanitized data-only copy instead of this same frame.
 badFull[BURN_INDEX]=1000000000n;
 assert.throws(()=>validateFields(policy,badFull),/batch witness must be dense/);
 assert.throws(()=>signingRequest(policy,badFull),/batch witness must be dense/);
 assert.throws(()=>operationCalls(policy,badFull),/batch witness must be dense/);
 assert.throws(()=>witness({mode:1,batch:1n,users:withAccessor([200n],0),nonces:[1n]}),/commit users must be dense/);
 assert.throws(()=>witness({mode:2,root:withAccessor([1n,2n,3n,4n],0)}),/batch root must be dense/);
 assert.throws(()=>witness({mode:2,operations:[withAccessor(op(1),1)]}),/batch operation vector must be dense/);
 assert.equal(reads,0);
});

test('array boundaries reject Proxy arrays before trap-producing properties are read',()=>{
 let traps=0;
 const trap=()=>{traps++;throw Error('proxy trap invoked');};
 const proxy=value=>new Proxy(value,{
  get:trap,getOwnPropertyDescriptor:trap,ownKeys:trap,has:trap,getPrototypeOf:trap
 });
 assert.throws(()=>validateFields(policy,proxy(settle(policy))),/batch witness must be a non-Proxy array/);
 assert.throws(()=>signingRequest(policy,proxy(settle(policy))),/batch witness must be a non-Proxy array/);
 assert.throws(()=>operationCalls(policy,proxy(feeFilled(settle(policy)))),/batch witness must be a non-Proxy array/);
 assert.throws(()=>witness({mode:1,batch:1n,users:proxy([200n]),nonces:[1n]}),/commit users must be a non-Proxy array/);
 assert.throws(()=>witness({mode:2,root:proxy([1n,2n,3n,4n])}),/batch root must be a non-Proxy array/);
 assert.throws(()=>witness({mode:2,operations:proxy([op(1)])}),/batch operations must be a non-Proxy array/);
 assert.throws(()=>witness({mode:2,operations:[proxy(op(1))]}),/batch operation vector must be a non-Proxy array/);
 assert.equal(traps,0);
});

test('array boundaries reject sparse, oversized, and extra-key segments and full frames',()=>{
 const extraKey=(array,key,value)=>{array[key]=value;return array;};
 const sparseUsers=[200n,,202n,203n],sparseRoot=[1n,,3n,4n],sparseOp=op(1);delete sparseOp[1];
 assert.throws(()=>witness({mode:1,batch:1n,users:sparseUsers,nonces:[1n,2n,3n,4n]}),/commit users must be dense/);
 assert.throws(()=>witness({mode:2,root:sparseRoot}),/batch root must be dense/);
 assert.throws(()=>witness({mode:2,operations:[sparseOp]}),/batch operation vector must be dense/);
 assert.throws(()=>witness({mode:1,batch:1n,users:[1n,2n,3n,4n,5n],nonces:[1n,2n,3n,4n]}),/commit users capacity/);
 assert.throws(()=>witness({mode:2,root:[1n,2n,3n,4n,5n]}),/batch root capacity/);
 assert.throws(()=>witness({mode:2,operations:[op(1),op(2),op(3),op(4),op(5)]}),/batch operations capacity/);
 assert.throws(()=>witness({mode:2,operations:[Array(OP_WIDTH+1).fill(0n)]}),/batch operation vector capacity/);
 assert.throws(()=>witness({mode:1,batch:1n,users:extraKey([200n],'note',1n),nonces:[1n]}),/commit users extra own properties/);
 assert.throws(()=>witness({mode:2,root:extraKey([1n,2n,3n,4n],Symbol('note'),1n)}),/batch root extra own properties/);
 const long=clone(settle(policy));long.push(0n);
 const short=clone(settle(policy));short.length=WITNESS_LENGTH-1;
 const hole=clone(settle(policy));delete hole[13];
 const extra=extraKey(clone(settle(policy)),'note',0n);
 for(const bad of [long,short,hole,extra]){
  assert.throws(()=>validateFields(policy,bad));
  assert.throws(()=>signingRequest(policy,bad));
  assert.throws(()=>operationCalls(policy,bad));
 }
});

test('benign frozen arrays remain stable snapshots for witness and full-frame consumers',()=>{
 // Recurse objects as well as arrays so the nested root/rank/operation segments
 // really are frozen, not just the outer argument object.
 const freezeTree=value=>{
  if(value!==null&&typeof value==='object'){for(const key of Reflect.ownKeys(value))freezeTree(value[key]);Object.freeze(value);}
  return value;
 };
 const name=firstSettlementName(policy),selected=namedOperation(policy,name,settlementArgs(policy,name));
 const args=freezeTree({mode:2,batch:1n,root:[1n,2n,3n,4n],rank:[0n,0n,0n,0n],operations:[selected],burn:0n});
 for(const segment of [args,args.root,args.rank,args.operations,...args.operations])assert.ok(Object.isFrozen(segment),'argument segment must be frozen');
 const fields=witness(args),funded=feeFilled(fields);
 Object.freeze(fields);Object.freeze(funded);
 assert.deepEqual(fields,witness(args));
 assert.doesNotThrow(()=>validateFields(policy,funded));
 const request=signingRequest(policy,fields),again=signingRequest(policy,fields);
 assert.deepEqual(request,again);
 assert.equal(request.software_defined_call.inputs[BURN_INDEX],0n);
 assert.deepEqual(operationCalls(policy,funded),operationCalls(policy,funded));
});
