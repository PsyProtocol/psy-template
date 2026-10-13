import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeCurveAction} from './chainReader.mjs';
import {FEE_ESCROW,cumulativeCost,quoteBuy,quoteSell} from './curveMath.mjs';
const launch={tokenId:65,issuerId:456,targetId:789,maxLots:10,liquidityLots:2,lotSize:100,basePrice:1000,stepPrice:10,thresholdLots:8};
const fields={token_contract_id:65n,issuer_user:456n,graduation_target:789n,max_lots:10n,liquidity_lots:2n,lot_size:100n,base_price:1000n,step_price:10n,threshold_lots:8n};
function fixture(sold=2n){return {contractId:66,vaultId:123,launch,pool:{...fields,phase:1n,sold_lots:sold,psy_reserve:cumulativeCost(launch,sold),issuerSettledPsy:0n},
 checkpoint:50,issuerSentPsy:0n,issuerSentToken:1200n,orders:[]};}
function order(kind=1n,sold=2n){const q=kind===1n?quoteBuy(launch,sold,1n).cost:quoteSell(launch,sold,1n).payout;
 return {payerId:111,kind,vault:123n,lots:1n,expectedSold:sold,quote:q,deadline:50n,nonce:2n,consumedNonce:1n,
 settledPsy:100n,settledToken:0n,sentPsy:100n+FEE_ESCROW+(kind===1n?q:0n),sentToken:kind===2n?100n:0n};}
test('fresh buy and sell select exact guarded UPS; deadline equality is valid',()=>{
 for(const kind of [1n,2n]){const f=fixture();f.orders=[order(kind)];const task=proposeCurveAction(f);
  assert.equal(task.kind,kind===1n?'buy':'sell');assert.equal(task.submission.contract_calls.length,6);
  assert.equal(task.submission.contract_calls[0].inputs[0],111);
  assert.equal(task.submission.software_defined_call.inputs[1],111);
 }
});
test('stale, expired and graduated orders refund only their original payment and payer',()=>{
 for(const kind of [1n,2n])for(const reason of ['stale','expired','graduated']){
  const f=fixture(),o=order(kind);f.orders=[o];
  if(reason==='stale'){f.pool.sold_lots=3n;f.pool.psy_reserve=cumulativeCost(launch,3n);}
  if(reason==='expired')f.checkpoint=51;
  if(reason==='graduated'){f.pool.phase=2n;f.pool.psy_reserve=0n;}
  const t=proposeCurveAction(f);assert.equal(t.kind,kind===1n?'refund-buy':'refund-sell');
  const transfer=t.submission.contract_calls.find(x=>['transfer','simple_transfer'].includes(x.method_name));
  assert.deepEqual(transfer.inputs,[111,kind===1n?Number(o.quote):100]);
 }
});
test('underfunded, overfunded, consumed and wrong-vault orders cannot trigger execution',()=>{
 for(const change of [o=>o.sentPsy--,o=>o.sentPsy++,o=>o.consumedNonce=2n,o=>o.vault=999n,o=>o.sentToken=99n]){
  const f=fixture();f.orders=[order(2n)];change(f.orders[0]);assert.equal(proposeCurveAction(f),null);
 }
});
test('initialization and graduation require explicit switches and exact issuer fee',()=>{
 const f=fixture(8n);f.issuerSentPsy=FEE_ESCROW;
 assert.equal(proposeCurveAction(f),null);f.automaticGraduation=true;
 assert.equal(proposeCurveAction(f).kind,'graduate');f.issuerSentPsy--;
 assert.equal(proposeCurveAction(f),null);
 f.pool.phase=0n;f.issuerSentPsy=FEE_ESCROW;
 assert.equal(proposeCurveAction(f),null);f.automaticInitialize=true;
 assert.equal(proposeCurveAction(f).kind,'initialize');f.issuerSentToken--;
 assert.equal(proposeCurveAction(f),null);
});
test('parameter or reserve mismatch halts planning rather than changing policy',()=>{
 const f=fixture();f.pool.graduation_target=111n;
 assert.throws(()=>proposeCurveAction(f),/parameter changed/);f.pool.graduation_target=789n;f.pool.psy_reserve--;
 assert.throws(()=>proposeCurveAction(f),/backing mismatch/);
});
test('signed funded orders with impossible sell quotes or lots above the sale cap remain refundable',()=>{
 for(const kind of [1n,2n]){
  const f=fixture(),o=order(kind);o.expectedSold=0n;o.lots=11n;
  if(kind===2n)o.sentToken=1100n;
  f.orders=[o];const task=proposeCurveAction(f);
  assert.equal(task.kind,kind===1n?'refund-buy':'refund-sell');
  assert.equal(task.submission.contract_calls[0].inputs[1],11);
 }
 const f=fixture(),o=order(1n);o.quote++;o.sentPsy++;f.orders=[o];
 assert.equal(proposeCurveAction(f).kind,'refund-buy');
});
