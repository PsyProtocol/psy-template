// Independent summation oracle exercises rounding, inventory and graduation edges.
import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteBuy,quoteSell,cumulativeCost,graduationAmounts } from './curveMath.mjs';
function sumPrices(c,start,count){let sum=0n;for(let i=0n;i<count;i++)sum+=c.basePrice+c.stepPrice*(start+i);return sum;}
test('random curve segments agree with independently summed per-lot prices',()=>{
  let seed=0x5293461n;
  const next=max=>{seed=(seed*6364136223846793005n+1n)&((1n<<64n)-1n);return seed%max;};
  for(let i=0;i<1000;i++) {
    const c={maxLots:1000n,liquidityLots:1n+next(1000n),lotSize:1n+next(1_000_000_000n),basePrice:1n+next(1_000_000_000n),stepPrice:1n+next(10_000n),thresholdLots:1n+next(1000n)};
    const sold=next(c.maxLots),count=1n+next(c.maxLots-sold);
    const buy=quoteBuy(c,sold,count),sell=quoteSell(c,sold+count,count);
    assert.equal(buy.cost,sumPrices(c,sold,count));
    assert.equal(sell.payout,buy.cost);
    assert.equal(buy.nextReserve-sell.nextReserve,buy.cost);
    assert.equal(buy.tokenAmount,count*c.lotSize);
    const atThreshold=graduationAmounts(c,c.thresholdLots);
    assert.equal(atThreshold.psyAmount,cumulativeCost(c,c.thresholdLots));
    assert.equal(atThreshold.tokenAmount+c.thresholdLots*c.lotSize,(c.maxLots+c.liquidityLots)*c.lotSize);
    assert.throws(()=>graduationAmounts(c,c.thresholdLots-1n),RangeError);
  }
});
test('maximum curve buy then full sell preserves backing and graduation inventory',()=>{
  const c={maxLots:1_000_000n,liquidityLots:1_000_000n,lotSize:1_000_000_000n,basePrice:1_000_000_000n,stepPrice:10_000n,thresholdLots:1_000_000n};
  const buy=quoteBuy(c,0n,c.maxLots),sell=quoteSell(c,c.maxLots,c.maxLots);
  assert.equal(buy.cost,5_999_995_000_000_000n);
  assert.equal(sell.payout,buy.cost);
  assert.equal(sell.nextReserve,0n);
  assert.equal(graduationAmounts(c,c.maxLots).tokenAmount,1_000_000_000_000_000n);
  assert.throws(()=>quoteBuy(c,c.maxLots,1n),RangeError);
  assert.throws(()=>quoteSell(c,0n,1n),RangeError);
});
