// Host-only planner coverage on public reviewed ABI fixtures and plain memory
// rows. No compiler artifact, Native proof, RPC, registered key, signature or
// funds are involved, and nothing here establishes full UPS, browser, network
// settlement or claim acceptance. Policy doubles come from the real core
// factories at the current Native PROFILE; state rows are labelled host doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readReviewedAbis} from '../../tests/fixtures/reviewedAbis.mjs';
import {generateBatch,methodSpans} from './generate.mjs';
import {makeBatchPolicy,operationCalls} from './policy.mjs';
import {bindNativePolicy,PROFILE} from '../mainnet-beta/native.mjs';
import {makeCoreBookPolicy} from '../../orderbook/u124/core-build.mjs';
import {planSettlement,settlementFields,validFunding} from './planner.mjs';
import {encodeAmount,FEE_ESCROW as F} from '../../amm/u124/client.mjs';

const reviewed=readReviewedAbis().admission;
const U=(1n<<70n)+17n;                 // Every multiple below keeps a nonzero high limb.
const PRICE=(1n<<90n)+17n;
const CUTOFF=100n,BATCH=1n,ROOT=[1n,2n,3n,4n],FEE_FIELD=73,FEE=1000000000n;
const byOwner=(a,b)=>Number(a[0]-b[0]);
const sorted=list=>[...list].sort(byOwner);
const owners=list=>[...list].sort((a,b)=>Number(a-b));
const named=(calls,name)=>calls.filter(c=>c.method_name===name);
const inputs=calls=>calls.map(c=>[...c.inputs]);
const moves=(calls,id)=>inputs(calls.filter(c=>c.contract_id===BigInt(id)&&c.method_name==='transfer'));
const native=calls=>inputs(calls.filter(c=>c.contract_id===0n&&c.method_name==='transfer'));
const refunds=calls=>inputs(named(calls,'refund_funding'));

// Only the selected market's own methods survive, exactly as the reviewed core
// route fixtures do; no global coverage/admission method is introduced.
function selectedAbi(kind,config){
 const abi=structuredClone(reviewed.markets[kind].artifact.abi);
 const names=new Set(methodSpans(generateBatch(kind,config)).map(m=>m.name));
 abi.contract.methods=abi.contract.methods.filter(m=>names.has(m.name));
 return abi;
}
const deterministic=value=>Array.isArray(value)?value.map(deterministic)
 :value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,deterministic(value[k])])):value;

function bookFixture(){
 const source=reviewed.markets.orderbook;
 const config=Object.fromEntries(['assetA','assetB','networkMagic'].map(k=>[k,source.config[k]]));
 const abi=selectedAbi('orderbook',config),token=structuredClone(reviewed.token.abi);
 const policy=makeCoreBookPolicy(1000,config,{state_tree_height:31,abi},{abi:token},'ab'.repeat(32));
 return {market:'orderbook',config,policy};
}
function collectionAbi(){
 const abi=structuredClone(reviewed.nft.abi);
 // Same reviewed host augmentation as executor/coreMarkets.test.mjs: the current
 // maintenance branch prepares an account version slot on the collection.
 if(!abi.contract.state.some(f=>f.name==='account_version')){
  const offset=abi.contract.state_layout.slot_count;
  abi.contract.state.push({name:'account_version',offset,felt_size:1,type:{kind:'primitive',name:'Felt'}});
  abi.contract.state_layout.field_count+=1;abi.contract.state_layout.slot_count=offset+1;
  abi.contract.state_layout.fields.push({field_id:abi.contract.state_layout.field_count,name:'account_version',
   type:{kind:'primitive',name:'Felt'},start_slot:offset,payload_offset:0,slot_count:1});
 }
 if(!abi.contract.methods.some(m=>m.name==='prepare_account'))
  abi.contract.methods.push({name:'prepare_account',method_id:1475740684,input_felt_count:0,output_felt_count:0,
   state_mutability:'external',inputs:[],outputs:[]});
 return abi;
}
function nftFixture(){
 const config=deterministic(structuredClone(reviewed.markets.nftmarket.config));
 const abi=selectedAbi('nftmarket',config),token=structuredClone(reviewed.token.abi);
 const policy=bindNativePolicy(makeBatchPolicy('nftmarket',1000,config,abi,token,collectionAbi()),PROFILE);
 return {market:'nftmarket',config,policy};
}

// Host doubles for committed frozen rows; amounts stay whole BigInt U124 values.
const pad=rows=>[...rows,...Array.from({length:4-rows.length},()=>({owner:0n,done:0n}))];
const base=(owner,extra)=>({owner,kind:1n,nonce:1n,cancelled:0n,deadline:1000n,done:0n,order_checkpoint:90n,
 pool:100n,paid_a:0n,paid_b:0n,fee_delta:F,fee_sent:F,...extra});
const bookRow=(owner,side,x,y,extra={})=>base(owner,{kind:1n,side,x,y,
 paid_a:side===0n?x:0n,paid_b:side===1n?x:0n,...extra});
const listing=(owner,price,extra={})=>base(owner,{kind:1n,price,nft_sent:1n,nft_claimed:0n,nft_matches:1n,
 order_checkpoint:89n,...extra});
const offer=(owner,seller,price,extra={})=>base(owner,{kind:2n,seller,price,listing_nonce:1n,paid_a:price,
 nft_sent:0n,nft_claimed:0n,nft_matches:0n,...extra});

function context(fixture,rows){return {market:fixture.market,policy:fixture.policy,config:fixture.config,
 rows,cutoff:CUTOFF,pool:{},batch:BATCH,root:ROOT};}
function run(fixture,rows){
 const ctx=context(fixture,pad(rows)),plan=planSettlement(ctx),fields=settlementFields(ctx);
 fields[FEE_FIELD]=FEE; // Explicit valid host fee; a real worker computes its own.
 const calls=operationCalls(fixture.policy,fields);
 assert.equal(calls.length,40,'canonical complete stack length is unchanged');
 assert.equal(calls.at(-1).method_name,'burn');
 assert.ok(plan.operations.length<=4);
 assert.equal(new Set(plan.terminal).size,plan.terminal.length,'no member is consumed twice');
 assert.ok(plan.terminal.every(o=>rows.some(r=>r.owner===o)),'terminal members stay inside the selected set');
 return {plan,calls};
}

test('orderbook: rational price priority beats earlier time and the worse ask is legally carried',()=>{
 const f=bookFixture();
 assert.equal(f.policy.native_protocol,PROFILE);assert.equal(f.policy.qualified_randomness,false);
 assert.ok(encodeAmount(3n*U)[1]>0n,'fixture really exercises the high limb');
 // 201 asks 2/3 later, 202 asks 3/4 earlier, 203 bids 1 and crosses both.
 const rows=[bookRow(201n,0n,3n*U,2n*U,{order_checkpoint:95n}),
  bookRow(202n,0n,4n*U,3n*U,{order_checkpoint:90n}),
  bookRow(203n,1n,3n*U,3n*U,{order_checkpoint:91n})];
 const {plan,calls}=run(f,rows);
 assert.deepEqual(plan.terminal,[201n,203n]);
 assert.deepEqual(inputs(named(calls,'match_orders')),[[201n,203n,...encodeAmount(3n*U),...encodeAmount(3n*U),1n,1n]]);
 assert.deepEqual(refunds(calls),[],'a valid unmatched order is carried, never refunded');
 assert.deepEqual(moves(calls,f.config.assetA),[[203n,...encodeAmount(3n*U)]]);
 assert.deepEqual(moves(calls,f.config.assetB),[[201n,...encodeAmount(3n*U)]]);
 assert.ok(native(calls).every(i=>i[0]!==202n),'the carried ask receives nothing');
 assert.deepEqual(plan.rank,[0n,1n,2n,3n]);
});

test('orderbook: equal prices fall back to checkpoint then owner, with exact whole-order amounts',()=>{
 const f=bookFixture();
 const timed=[bookRow(201n,0n,3n*U,2n*U,{order_checkpoint:92n}),bookRow(202n,0n,3n*U,2n*U,{order_checkpoint:91n}),
  bookRow(203n,1n,2n*U,3n*U,{order_checkpoint:92n}),bookRow(204n,1n,2n*U,3n*U,{order_checkpoint:91n})];
 const a=run(f,timed);
 assert.deepEqual(inputs(named(a.calls,'match_orders')),[
  [202n,204n,...encodeAmount(3n*U),...encodeAmount(2n*U),1n,1n],
  [201n,203n,...encodeAmount(3n*U),...encodeAmount(2n*U),1n,1n]]);
 assert.deepEqual(a.plan.rank,[1n,0n,3n,2n]);
 assert.deepEqual(owners(a.plan.terminal),[201n,202n,203n,204n]);
 assert.deepEqual(sorted(moves(a.calls,f.config.assetA)),sorted([[203n,...encodeAmount(3n*U)],[204n,...encodeAmount(3n*U)]]));
 assert.deepEqual(sorted(moves(a.calls,f.config.assetB)),sorted([[201n,...encodeAmount(2n*U)],[202n,...encodeAmount(2n*U)]]));
 const tied=timed.map(r=>({...r,order_checkpoint:90n}));
 const b=run(f,tied);
 assert.deepEqual(inputs(named(b.calls,'match_orders')).map(i=>i.slice(0,2)),[[201n,203n],[202n,204n]],
  'identical price and checkpoint are resolved by ascending owner');
 assert.deepEqual(b.plan.rank,[0n,1n,2n,3n]);
});

test('orderbook: cancelled and expired higher-priority members refund their own funding without blocking the pair',()=>{
 const f=bookFixture();
 const rows=[bookRow(201n,0n,2n*U,U,{cancelled:1n,nonce:7n,order_checkpoint:80n}),
  bookRow(202n,1n,9n*U,U,{deadline:99n,nonce:3n,order_checkpoint:81n}),
  bookRow(203n,0n,3n*U,2n*U,{order_checkpoint:95n}),
  bookRow(204n,1n,2n*U,3n*U,{nonce:2n,order_checkpoint:96n})];
 const {plan,calls}=run(f,rows);
 assert.equal(plan.operations.length,3);
 assert.deepEqual(owners(plan.terminal),[201n,202n,203n,204n]);
 assert.deepEqual(refunds(calls),[
  [201n,...encodeAmount(2n*U),...encodeAmount(0n),F,7n,5n],
  [202n,...encodeAmount(0n),...encodeAmount(9n*U),F,3n,6n]],'refunds follow committed row order and original owners');
 assert.deepEqual(inputs(named(calls,'match_orders')),[[203n,204n,...encodeAmount(3n*U),...encodeAmount(2n*U),1n,2n]]);
 assert.deepEqual(sorted(moves(calls,f.config.assetA)),sorted([[201n,...encodeAmount(2n*U)],[204n,...encodeAmount(3n*U)]]));
 assert.deepEqual(sorted(moves(calls,f.config.assetB)),sorted([[202n,...encodeAmount(9n*U)],[203n,...encodeAmount(2n*U)]]));
 for(const owner of [201n,202n])assert.ok(native(calls).some(i=>i[0]===owner&&i[1]===F),'escrow returns to its own owner');
});

test('orderbook: an underfunded best ask refunds only its actual funding and the valid pair still settles',()=>{
 const f=bookFixture(),paid=4n*U-1n;
 const rows=[bookRow(201n,0n,4n*U,U,{paid_a:paid,order_checkpoint:80n}),
  bookRow(202n,1n,2n*U,4n*U,{order_checkpoint:81n}),
  bookRow(203n,0n,4n*U,2n*U,{order_checkpoint:90n})];
 const {plan,calls}=run(f,rows);
 assert.deepEqual(refunds(calls),[[201n,...encodeAmount(paid),...encodeAmount(0n),F,1n,5n]]);
 assert.ok(encodeAmount(paid)[1]>0n);
 assert.deepEqual(inputs(named(calls,'match_orders')),[[203n,202n,...encodeAmount(4n*U),...encodeAmount(2n*U),1n,1n]]);
 assert.deepEqual(sorted(moves(calls,f.config.assetA)),sorted([[201n,...encodeAmount(paid)],[202n,...encodeAmount(4n*U)]]));
 assert.deepEqual(moves(calls,f.config.assetB),[[203n,...encodeAmount(2n*U)]]);
 assert.deepEqual(owners(plan.terminal),[201n,202n,203n]);
});

test('orderbook: a fully invalid batch refunds everyone and still refuses capacity expansion',()=>{
 const f=bookFixture();
 const rows=[201n,202n,203n,204n].map((owner,i)=>bookRow(owner,0n,2n*U,U,{cancelled:1n,nonce:BigInt(i+1)}));
 const {plan,calls}=run(f,rows);
 assert.equal(plan.operations.length,4);assert.deepEqual(owners(plan.terminal),[201n,202n,203n,204n]);
 assert.deepEqual(refunds(calls).map(i=>i[0]),[201n,202n,203n,204n]);
 assert.deepEqual(named(calls,'match_orders'),[]);
 assert.throws(()=>planSettlement(context(f,[...rows,bookRow(205n,0n,2n*U,U,{cancelled:1n})])),/operation stack capacity/);
});

test('orderbook and nftmarket: committed row permutation cannot change selected work or terminal members',()=>{
 const cases=[[bookFixture(),[bookRow(201n,0n,3n*U,2n*U,{order_checkpoint:92n}),bookRow(202n,0n,3n*U,2n*U,{order_checkpoint:91n}),
   bookRow(203n,1n,2n*U,3n*U,{order_checkpoint:92n}),bookRow(204n,1n,2n*U,3n*U,{order_checkpoint:91n})]],
  [nftFixture(),[listing(201n,PRICE),offer(202n,201n,PRICE,{order_checkpoint:90n}),offer(203n,201n,PRICE,{order_checkpoint:91n})]]];
 for(const [fixture,short] of cases){
  const rows=pad(short),reference=run(fixture,rows);
  // Market-specific rank contract: Orderbook publishes a committed row-index
  // permutation that the core consumes, so its member order must survive any
  // permitted row permutation. NFT deliberately publishes the unused
  // [0,0,0,0] sentinel; its buyer priority comes from timeCompare and the
  // policy's direct listing/buyer checks, never from rank.
  const orderbook=fixture.market==='orderbook';
  const sequence=orderbook?reference.plan.rank.map(i=>rows[Number(i)].owner):null;
  if(orderbook)assert.deepEqual(reference.plan.rank,[1n,0n,3n,2n],'canonical Orderbook rank permutation');
  else assert.deepEqual(reference.plan.rank,[0n,0n,0n,0n],'NFT rank stays the unused sentinel');
  for(const permutation of [[3,2,1,0],[2,0,3,1],[1,3,0,2]]){
   const shuffled=permutation.map(i=>rows[i]),actual=run(fixture,shuffled);
   assert.deepEqual(actual.plan.operations,reference.plan.operations,'selection is order independent');
   assert.deepEqual(owners(actual.plan.terminal),owners(reference.plan.terminal));
   if(orderbook)assert.deepEqual(actual.plan.rank.map(i=>shuffled[Number(i)].owner),sequence,'rank keeps the same member order');
   else assert.deepEqual(actual.plan.rank,[0n,0n,0n,0n],'permuted rows cannot give the NFT sentinel meaning');
   assert.deepEqual(inputs(named(actual.calls,'match_orders')),inputs(named(reference.calls,'match_orders')));
   assert.deepEqual(inputs(named(actual.calls,'settle_sale')),inputs(named(reference.calls,'settle_sale')));
   assert.deepEqual(refunds(actual.calls),refunds(reference.calls));
   if(!orderbook){
    // Same winner, same single delivery and same complete loser refund under
    // every permitted permutation, independent of the unused rank sentinel.
    assert.deepEqual(owners(actual.plan.terminal),[201n,202n,203n]);
    assert.deepEqual(inputs(named(actual.calls,'settle_sale')),[[201n,202n,...encodeAmount(PRICE),1n,1n]]);
    assert.deepEqual(moves(actual.calls,fixture.config.nftId),[[0n,202n]]);
    assert.deepEqual(refunds(actual.calls),[[203n,...encodeAmount(PRICE),...encodeAmount(0n),F,1n,5n]]);
    assert.deepEqual(sorted(moves(actual.calls,fixture.config.tokenId)),
     sorted([[201n,...encodeAmount(PRICE)],[203n,...encodeAmount(PRICE)]]));
   }
  }
 }
});

test('orderbook: replanning consumed members neither refunds nor rematches them',()=>{
 const f=bookFixture();
 const first=[bookRow(201n,0n,3n*U,2n*U,{order_checkpoint:95n}),bookRow(202n,0n,4n*U,3n*U,{order_checkpoint:90n}),
  bookRow(203n,1n,3n*U,3n*U,{order_checkpoint:91n})];
 assert.deepEqual(owners(run(f,first).plan.terminal),[201n,203n]);
 const retry=[{...first[0],done:1n,cancelled:1n},first[1],{...first[2],done:1n},
  bookRow(204n,1n,3n*U,4n*U,{order_checkpoint:93n})];
 const {plan,calls}=run(f,retry);
 assert.deepEqual(plan.terminal,[202n,204n]);
 assert.deepEqual(refunds(calls),[],'a consumed member is never refunded again');
 assert.deepEqual(inputs(named(calls,'match_orders')),[[202n,204n,...encodeAmount(4n*U),...encodeAmount(3n*U),1n,1n]]);
 for(const id of [f.config.assetA,f.config.assetB])assert.ok(moves(calls,id).every(i=>i[0]!==201n&&i[0]!==203n));
 assert.equal(plan.rank.length,4,'consumed and padding rows keep their rank slots');
 const settled=retry.map(r=>({...r,done:1n})),empty=run(f,settled);
 assert.deepEqual(empty.plan.operations,[]);assert.deepEqual(empty.plan.terminal,[]);
 assert.deepEqual(refunds(empty.calls),[]);assert.deepEqual(named(empty.calls,'match_orders'),[]);
});

for(const scenario of ['competing','expired','cancelled','underfunded'])
test('nftmarket: '+scenario+' priority keeps one sale per listing and one complete loser refund',()=>{
 const f=nftFixture(),loserPaid=scenario==='underfunded'?PRICE-1n:PRICE;
 const early=offer(202n,201n,PRICE,{order_checkpoint:90n,
  ...(scenario==='expired'?{deadline:99n}:scenario==='cancelled'?{cancelled:1n}:scenario==='underfunded'?{paid_a:loserPaid}:{})});
 const rows=[listing(201n,PRICE),early,offer(203n,201n,PRICE,{order_checkpoint:91n})];
 const winner=scenario==='competing'?202n:203n,loser=scenario==='competing'?203n:202n;
 const {plan,calls}=run(f,rows);
 assert.equal(plan.operations.length,2);
 assert.deepEqual(owners(plan.terminal),[201n,202n,203n]);
 assert.deepEqual(inputs(named(calls,'settle_sale')),[[201n,winner,...encodeAmount(PRICE),1n,1n]],'exactly one whole listing sale');
 assert.deepEqual(moves(calls,f.config.nftId),[[0n,winner]],'one unique NFT delivery');
 assert.deepEqual(refunds(calls),[[loser,...encodeAmount(loserPaid),...encodeAmount(0n),F,1n,5n]]);
 assert.deepEqual(sorted(moves(calls,f.config.tokenId)),sorted([[201n,...encodeAmount(PRICE)],[loser,...encodeAmount(loserPaid)]]));
 assert.ok(native(calls).some(i=>i[0]===loser&&i[1]===F));
});

test('nftmarket: wrong listing nonce or price refunds the buyer and leaves the listing unconsumed',()=>{
 const f=nftFixture();
 const rows=[listing(201n,PRICE),offer(202n,201n,PRICE,{listing_nonce:2n,order_checkpoint:90n}),
  offer(203n,201n,PRICE+1n,{order_checkpoint:91n})];
 const {plan,calls}=run(f,rows);
 assert.deepEqual(plan.terminal,[202n,203n],'the seller is legally retained, not consumed or refunded');
 assert.deepEqual(named(calls,'settle_sale'),[]);assert.deepEqual(moves(calls,f.config.nftId),[]);
 assert.deepEqual(refunds(calls),[
  [202n,...encodeAmount(PRICE),...encodeAmount(0n),F,1n,5n],
  [203n,...encodeAmount(PRICE+1n),...encodeAmount(0n),F,1n,5n]]);
 assert.deepEqual(sorted(moves(calls,f.config.tokenId)),sorted([[202n,...encodeAmount(PRICE)],[203n,...encodeAmount(PRICE+1n)]]));
});

test('nftmarket: retry after a consumed listing cannot produce a second sale',()=>{
 const f=nftFixture(),rows=[listing(201n,PRICE),offer(202n,201n,PRICE,{order_checkpoint:90n}),
  offer(203n,201n,PRICE,{order_checkpoint:91n})];
 assert.deepEqual(inputs(named(run(f,rows).calls,'settle_sale')).map(i=>i.slice(0,2)),[[201n,202n]]);
 const pending=[{...rows[0],done:1n},{...rows[1],done:1n},rows[2]];
 const retry=run(f,pending);
 assert.deepEqual(retry.plan.terminal,[203n]);
 assert.deepEqual(named(retry.calls,'settle_sale'),[]);assert.deepEqual(moves(retry.calls,f.config.nftId),[]);
 assert.deepEqual(refunds(retry.calls),[[203n,...encodeAmount(PRICE),...encodeAmount(0n),F,1n,5n]]);
 const closed=pending.map(r=>({...r,done:1n})),empty=run(f,closed);
 assert.deepEqual(empty.plan.operations,[]);assert.deepEqual(empty.plan.terminal,[]);
 assert.deepEqual(refunds(empty.calls),[]);assert.deepEqual(moves(empty.calls,f.config.tokenId),[]);
});

test('planner: repeated planning is pure and market-specific coverage keeps every committed member',()=>{
 for(const [fixture,rows] of [[bookFixture(),[bookRow(201n,0n,3n*U,2n*U,{order_checkpoint:92n}),
   bookRow(202n,0n,3n*U,2n*U,{order_checkpoint:91n,cancelled:1n}),bookRow(203n,1n,2n*U,3n*U,{order_checkpoint:92n}),
   bookRow(204n,1n,2n*U,3n*U,{done:1n})]],
  [nftFixture(),[listing(201n,PRICE),offer(202n,201n,PRICE,{order_checkpoint:90n}),offer(203n,201n,PRICE,{done:1n})]]]){
  const padded=pad(rows),snapshot=structuredClone({rows:padded,policy:fixture.policy,config:fixture.config});
  const first=run(fixture,padded),second=run(fixture,padded);
  assert.deepEqual(second.plan,first.plan);assert.deepEqual(second.calls,first.calls);
  assert.deepEqual(structuredClone({rows:padded,policy:fixture.policy,config:fixture.config}),snapshot,
   'planning must not mutate committed rows, policy or configuration');
  assert.ok(first.plan.terminal.every(o=>padded.some(r=>r.owner===o&&r.done===0n)));
  if(fixture.market==='orderbook'){
   // Orderbook rank is a real committed row-index permutation, so it must
   // cover every slot, including cancelled, consumed and padding rows.
   assert.deepEqual([...first.plan.rank].sort((a,b)=>Number(a-b)),[0n,1n,2n,3n],
    'no committed member, including consumed rows, is dropped from the rank');
  }else{
   // NFT rank is an unused sentinel, so member and accounting coverage is
   // shown by the unchanged committed rows asserted above plus exact terminal
   // owners, the single whole sale, the delivered NFT and no repeat refund.
   assert.deepEqual(first.plan.rank,[0n,0n,0n,0n],'NFT rank stays the unused sentinel');
   assert.deepEqual(first.plan.terminal,[201n,202n],'only the live listing and its winning buyer are consumed');
   assert.deepEqual(inputs(named(first.calls,'settle_sale')),[[201n,202n,...encodeAmount(PRICE),1n,1n]]);
   assert.deepEqual(moves(first.calls,fixture.config.nftId),[[0n,202n]]);
   assert.deepEqual(moves(first.calls,fixture.config.tokenId),[[201n,...encodeAmount(PRICE)]]);
   assert.deepEqual(refunds(first.calls),[],'the already consumed offer is never refunded again');
   assert.deepEqual(padded.map(r=>r.owner),[201n,202n,203n,0n],'committed rows and padding keep their slots');
   assert.equal(padded[2].done,1n,'the consumed offer stays consumed in the committed rows');
  }
 }
});

test('planner: unsupported market strings are refused instead of using Book fallback rules',()=>{
 const f=bookFixture(),row=bookRow(201n,0n,3n*U,2n*U);
 for(const market of ['stream','amm-core','ORDERBOOK','',undefined,null]){
  assert.throws(()=>validFunding(market,row,f.config),/unsupported batch market/);
  const ctx={...context(f,pad([row])),market};
  assert.throws(()=>planSettlement(ctx),/unsupported batch market/);
  assert.throws(()=>settlementFields(ctx),/unsupported batch market/);
 }
 // Every supported market keeps its own funding rule and still answers normally.
 for(const market of ['amm','bondingcurve','orderbook','nftmarket'])
  assert.equal(typeof validFunding(market,row,f.config),'boolean');
 assert.equal(validFunding('orderbook',row,f.config),true);
});

test('planner: a repeated active owner is refused before selection, self-match or double sale',()=>{
 const book=bookFixture();
 const selfMatch=[bookRow(201n,0n,3n*U,2n*U),bookRow(201n,1n,3n*U,3n*U,{nonce:2n})];
 assert.throws(()=>planSettlement(context(book,pad(selfMatch))),/duplicate active batch owner/);
 assert.throws(()=>settlementFields(context(book,pad(selfMatch))),/duplicate active batch owner/);
 const nft=nftFixture();
 const duplicateListing=[listing(201n,PRICE),listing(201n,PRICE,{nonce:2n}),offer(202n,201n,PRICE)];
 assert.throws(()=>planSettlement(context(nft,pad(duplicateListing))),/duplicate active batch owner/);
 assert.throws(()=>settlementFields(context(nft,pad(duplicateListing))),/duplicate active batch owner/);
 const duplicateOffer=[listing(201n,PRICE),offer(202n,201n,PRICE),offer(202n,201n,PRICE,{nonce:2n})];
 assert.throws(()=>planSettlement(context(nft,pad(duplicateOffer))),/duplicate active batch owner/);
});

// Host doubles only: these rows are malformed planner inputs, not observed
// reader output. The guard rejects them before selection; it does not authorize
// a transaction or prove reader/network correctness.
test('planner: a Number active owner is refused instead of being coerced into a call',()=>{
 const f=bookFixture();
 const rows=pad([{...bookRow(201n,0n,3n*U,2n*U),owner:201},bookRow(203n,1n,3n*U,3n*U,{order_checkpoint:91n})]);
 assert.throws(()=>planSettlement(context(f,rows)),/malformed active batch owner/);
 assert.throws(()=>settlementFields(context(f,rows)),/malformed active batch owner/);
 const n=nftFixture(),nftRows=pad([listing(201n,PRICE),{...offer(202n,201n,PRICE,{order_checkpoint:90n}),owner:202}]);
 assert.throws(()=>planSettlement(context(n,nftRows)),/malformed active batch owner/);
 assert.throws(()=>settlementFields(context(n,nftRows)),/malformed active batch owner/);
});

test('planner: a mixed Number/BigInt same-id owner cannot bypass uniqueness into a self-match or self-sale',()=>{
 const f=bookFixture();
 // Set treats 201 and 201n as distinct, but operation() coerces both to 201n.
 const mixed=pad([bookRow(201n,0n,3n*U,2n*U),{...bookRow(201n,1n,3n*U,3n*U,{nonce:2n}),owner:201}]);
 assert.throws(()=>planSettlement(context(f,mixed)),/malformed active batch owner/);
 assert.throws(()=>settlementFields(context(f,mixed)),/malformed active batch owner/);
 const bothNumbers=pad([{...bookRow(201n,0n,3n*U,2n*U),owner:201},{...bookRow(201n,1n,3n*U,3n*U,{nonce:2n}),owner:201}]);
 assert.throws(()=>planSettlement(context(f,bothNumbers)),/malformed active batch owner/);
 const n=nftFixture(),nftRows=pad([listing(201n,PRICE),{...offer(201n,201n,PRICE,{nonce:2n}),owner:201}]);
 assert.throws(()=>planSettlement(context(n,nftRows)),/malformed active batch owner/);
 assert.throws(()=>settlementFields(context(n,nftRows)),/malformed active batch owner/);
});

test('planner: an active owner outside the positive 24-bit account range is refused',()=>{
 const f=bookFixture(),n=nftFixture();
 for(const owner of [1n<<24n,(1n<<24n)+1n,1n<<62n,-1n<<24n]){
  const rows=pad([{...bookRow(201n,0n,3n*U,2n*U),owner}]);
  if(owner>0n){
   assert.throws(()=>planSettlement(context(f,rows)),/malformed active batch owner/);
   assert.throws(()=>settlementFields(context(f,rows)),/malformed active batch owner/);
   const nftRows=pad([listing(201n,PRICE),{...offer(202n,201n,PRICE),owner}]);
   assert.throws(()=>planSettlement(context(n,nftRows)),/malformed active batch owner/);
  }
 }
 for(const owner of [201.5,(1<<24)+1,'201']){
  const rows=pad([{...bookRow(201n,0n,3n*U,2n*U),owner}]);
  assert.throws(()=>planSettlement(context(f,rows)),/malformed active batch owner/);
 }
});

test('planner: boundary owners stay valid and inert done/padding rows keep their existing semantics',()=>{
 const f=bookFixture(),max=(1n<<24n)-1n;
 const boundary=run(f,[bookRow(1n,0n,3n*U,2n*U,{order_checkpoint:95n}),bookRow(max,1n,3n*U,3n*U,{order_checkpoint:91n})]);
 assert.deepEqual(owners(boundary.plan.terminal),[1n,max]);
 assert.deepEqual(inputs(named(boundary.calls,'match_orders')),[[1n,max,...encodeAmount(3n*U),...encodeAmount(3n*U),1n,1n]]);
 const inert=[bookRow(201n,0n,3n*U,2n*U,{order_checkpoint:95n}),bookRow(203n,1n,3n*U,3n*U,{order_checkpoint:91n}),
  {owner:0n,done:0n},{...bookRow(204n,0n,3n*U,2n*U),owner:204,done:1n}];
 const settled=run(f,inert);
 assert.deepEqual(owners(settled.plan.terminal),[201n,203n]);
 assert.deepEqual(refunds(settled.calls),[],'an inert done row is never refunded');
 assert.deepEqual(inputs(named(settled.calls,'match_orders')),[[201n,203n,...encodeAmount(3n*U),...encodeAmount(3n*U),1n,1n]]);
 const n=nftFixture(),nftBoundary=run(n,[listing(1n,PRICE),offer(max,1n,PRICE,{order_checkpoint:90n})]);
 assert.deepEqual(owners(nftBoundary.plan.terminal),[1n,max]);
 assert.deepEqual(inputs(named(nftBoundary.calls,'settle_sale')),[[1n,max,...encodeAmount(PRICE),1n,1n]]);
 assert.deepEqual(moves(nftBoundary.calls,n.config.nftId),[[0n,max]]);
 assert.deepEqual(nftBoundary.plan.rank,[0n,0n,0n,0n],'NFT rank stays the unused sentinel');
});

test('planner: zero padding and already-done rows stay legal reader inputs',()=>{
 const f=bookFixture();
 const rows=[bookRow(201n,0n,3n*U,2n*U,{order_checkpoint:95n}),bookRow(203n,1n,3n*U,3n*U,{order_checkpoint:91n})];
 const reference=run(f,rows);
 assert.deepEqual(owners(reference.plan.terminal),[201n,203n]);
 assert.deepEqual(run(f,[...rows,{owner:0n,done:0n},{owner:0n,done:0n}]).plan.operations,reference.plan.operations,
  'repeated zero padding is not a member');
 const retry=[{...rows[0],done:1n},rows[1],bookRow(204n,0n,3n*U,2n*U,{order_checkpoint:96n})];
 const settled=run(f,retry);
 assert.deepEqual(owners(settled.plan.terminal),[203n,204n]);
 assert.deepEqual(refunds(settled.calls),[],'a consumed row is never refunded again');
 assert.deepEqual(inputs(named(settled.calls,'match_orders')),
  [[204n,203n,...encodeAmount(3n*U),...encodeAmount(3n*U),1n,1n]]);
});
