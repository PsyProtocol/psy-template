import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createPoolCallBuilder } from '../callBuilder.mjs';
import * as live from '../operationCalls.mjs';
import * as wide from './operationCalls.mjs';
import { CAP,swapQuote,initialQuote,addQuote,removeQuote } from './quote.mjs';
const ids = {poolContractId:2000,poolUserId:100,payerId:200};
test('wide candidate supports 1000 PSY without changing the staging profile', () => {
  assert.equal(live.POOL_AMOUNT_CAP,10_000_000);
  const args={...ids,asset:0,amountIn:1e11,minOut:1,deadline:200,nonce:1};
  assert.throws(()=>live.openSwapCalls(args),RangeError);
  const tx=wide.openSwapCalls(args);
  assert.equal(tx.contract_calls[1].inputs[1],1e11+live.POOL_FEE_ESCROW);
  assert.equal(wide.settleSwapCalls({...args,amountOut:90_000_000_000}).contract_calls.length,5);
  assert.throws(()=>wide.openSwapCalls({...args,amountIn:1e12+1}),RangeError);
  assert.throws(()=>createPoolCallBuilder({amountCap:Number.MAX_SAFE_INTEGER}),RangeError);
});
test('candidate quote enforces reserve limits and exact deposit ratio', () => {
  assert.throws(()=>swapQuote({reserveIn:CAP,reserveOut:CAP,amountIn:1n}),/cap/);
  assert.throws(()=>addQuote({reservePsy:10n,reserveUsdt:11n,totalShares:1000n,amountPsy:10n,amountUsdt:10n}),/ratio/);
  const init=initialQuote({amountPsy:CAP,amountUsdt:CAP});
  assert.equal(init.totalShares,CAP);
  assert.equal(init.providerShares,CAP-1000n);
  const out=removeQuote({reservePsy:CAP,reserveUsdt:CAP,totalShares:CAP,shares:CAP-1000n});
  assert.equal(out.nextReservePsy,1000n);
  assert.equal(out.nextTotalShares,1000n);
});
test('wide quotes preserve integer product through repeated large swaps', () => {
  let rp=500_000_000_000n, ru=500_000_000_000n;
  for (let i=0;i<1000;i++) {
    const forward=i%2===0;
    const q=swapQuote({reserveIn:forward?rp:ru,reserveOut:forward?ru:rp,amountIn:100_000_000n});
    assert.ok(q.productAfter>=q.productBefore);
    [rp,ru]=forward?[q.nextReserveIn,q.nextReserveOut]:[q.nextReserveOut,q.nextReserveIn];
  }
});

test('candidate and proof probe are reproducible from the reviewed base source', async () => {
  const {execFileSync}=await import('node:child_process');
  execFileSync(process.execPath,[fileURLToPath(new URL('./generate.mjs',import.meta.url)),'--check']);
});
