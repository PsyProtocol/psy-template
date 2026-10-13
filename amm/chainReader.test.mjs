import assert from 'node:assert/strict';
import test from 'node:test';
import {proposeAmmAction,scanAmm} from './chainReader.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {POOL_FEE_ESCROW} from './operationCalls.mjs';
const fee = BigInt(POOL_FEE_ESCROW);
const pool = {reservePsy: 1_000_000n, reserveUsdt: 1_000_000n, totalShares: 1_000_000n};
const order = {payerId: 200, pool: 100n, kind: 1n, asset: 0n,
  amountPsy: 10_000n, amountUsdt: 0n, minOut: 1n, deadline: 200n, nonce: 1n,
  consumedNonce: 0n, sentPsy: fee + 10_000n, settledPsy: 0n, sentUsdt: 0n,
  settledUsdt: 0n, ownedShares: 100_000n, shares: 100_000n, minPsy: 1n, minUsdt: 1n};
const propose = (orders, checkpoint = 100, p = pool) => proposeAmmAction({contractId: 1759, vaultId: 100, orders, pool: p, checkpoint});

test('AMM scanner rejects partial payment, replay and impossible output until expiry', () => {
  assert.equal(propose([{...order, sentPsy: fee + 9_999n}]), null);
  assert.equal(propose([{...order, consumedNonce: 1n}]), null);
  assert.equal(propose([{...order, minOut: 10_000n}]), null);
  const swap = propose([order]);
  assert.equal(swap.kind, 'swap');
  assert.deepEqual(swap.submission.contract_calls[0].inputs, [200, 0, 10_000, 9_871, 1]);
  const refund = propose([{...order, minOut: 10_000n}], 201);
  assert.equal(refund.kind, 'refund');
  assert.deepEqual(refund.submission.contract_calls[2].inputs, [200, 10_000]);
});

test('LP cancellation is proposed only after expiry and has no transfer', () => {
  const removal = {...order, kind: 3n, sentPsy: fee, minPsy: 1_000_000n};
  assert.equal(propose([removal]), null);
  const cancel = propose([removal], 201);
  assert.equal(cancel.kind, 'cancel-remove');
  assert.deepEqual(cancel.submission.software_defined_call.inputs, [10, 200, 0, 0, 0, 1, 0]);
  assert.equal(cancel.submission.contract_calls.some(c => c.method_name === 'simple_transfer'), false);
});

test('AMM initial LP locks 1000 shares and preserves exact-ratio subsequent adds', () => {
  const add = {...order, kind: 2n, amountPsy: 1_000_000n, amountUsdt: 1_000_000n,
    sentPsy: fee + 1_000_000n, sentUsdt: 1_000_000n, minOut: 999_000n};
  assert.deepEqual(propose([add], 100, {reservePsy: 0n, reserveUsdt: 0n, totalShares: 0n})
    .submission.contract_calls[0].inputs, [200, 1_000_000, 1_000_000, 999_000, 1]);
  assert.equal(propose([{...add, amountUsdt: 500_000n, sentUsdt: 500_000n}]), null);
  const refunded = propose([{...add, sentPsy: fee}], 201);
  assert.equal(refunded.kind, 'refund-add');
  assert.deepEqual(refunded.submission.contract_calls[0].inputs, [200, 0, 1_000_000]);
});
test('parallel funded-user scans retain request priority and do not plan from partial reads',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'psy-amm-scan-')),abi=join(directory,'abi.json');
 try{
  await writeFile(abi,JSON.stringify({contract:{state:['consumed_nonce','shares','settled_psy_sent','settled_usdt_sent'].map((name,i)=>({name,offset:10000+i*1000}))}}));
  let fail=false;
  const state={checkpoint:100,fields:async user=>{
   if(user===500)return {reserve_psy:pool.reservePsy,reserve_usdt:pool.reserveUsdt,total_shares:pool.totalShares};
   await new Promise(r=>setTimeout(r,user===111?10:1));if(fail&&user===222)throw Error('missing order');
   return {order_kind:1n,order_pool_user:500n,order_asset:0n,order_amount_psy:10000n,order_amount_usdt:0n,order_min_out:1n,order_deadline:200n,order_nonce:1n,order_shares:0n,order_min_psy:0n,order_min_usdt:0n};
  },slot:async(user,contract)=>user===500?0n:contract===0?fee+10000n:0n};
  const options={rpcConfig:'test',abi,vaultId:500,contractId:1758,users:[111,222]};
  const result=await scanAmm(options,async()=>state);assert.deepEqual(result.orders.map(x=>x.payerId),[111,222]);
  assert.equal(result.action.kind,'swap');assert.equal(result.action.submission.contract_calls[0].inputs[0],111);
  fail=true;await assert.rejects(scanAmm(options,async()=>state),/missing order/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
