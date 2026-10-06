import assert from 'node:assert/strict';
import test from 'node:test';
import { PsyUsdtPoolModel } from './poolModel.mjs';

function fundedPool() {
  const pool = new PsyUsdtPoolModel();
  pool.openAddLiquidity({ id: 'seed', owner: 11n, amountPsy: 1_000_000n,
    amountUsdt: 1_000_000n, minShares: 999_000n, deadline: 1_000n });
  pool.claimDeposit({ id: 'seed', inAsset: 'PSY', senderTotal: 1_000_000n });
  pool.claimDeposit({ id: 'seed', inAsset: 'USDT', senderTotal: 1_000_000n });
  pool.settle('seed', 1n);
  return pool;
}

function confirm(pool, effects) {
  for (const effect of effects) {
    const key = `${effect.asset}:${effect.recipient}`;
    pool.confirmTransfer({
      id: effect.id,
      senderTotal: (pool.sentTotals.get(key) ?? 0n) + effect.amount,
    });
  }
}

test('50 rounds of four simultaneous payers settle or refund without mixing balances', () => {
  const pool = fundedPool();
  const paid = new Map();
  let state = 0x5eed1234;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  let settled = 0;
  let refunded = 0;

  for (let round = 0; round < 50; round++) {
    const pending = [];
    for (let index = 0; index < 4; index++) {
      const owner = BigInt(index + 12);
      const inAsset = (round + index) % 2 ? 'USDT' : 'PSY';
      const amountIn = BigInt(500 + next() % 3_500);
      const id = `round-${round}-user-${owner}`;
      pool.openSwap({ id, owner, inAsset, amountIn, minAmountOut: 1n,
        deadline: BigInt(round + 10) });
      pending.push({ id, owner, inAsset, amountIn });
    }

    // All four orders exist before any pool-account operation. Reverse the
    // processing order each round to exercise competing users and both assets.
    if (round % 2) pending.reverse();
    for (const [index, order] of pending.entries()) {
      const key = `${order.inAsset}:${order.owner}`;
      const total = (paid.get(key) ?? 0n) + order.amountIn;
      assert.throws(() => pool.cancelUnclaimedPayment({
        id: order.id, inAsset: order.inAsset, senderTotal: total + 1n,
      }), /does not match/);
      paid.set(key, total);
      if (index === round % 4) {
        const [claim, refund] = pool.cancelUnclaimedPayment({
          id: order.id, inAsset: order.inAsset, senderTotal: total,
        });
        assert.equal(claim.sender, order.owner);
        assert.equal(refund.recipient, order.owner);
        assert.equal(refund.amount, order.amountIn);
        confirm(pool, [refund]);
        assert.throws(() => pool.cancelUnclaimedPayment({
          id: order.id, inAsset: order.inAsset, senderTotal: total,
        }), /already resolved/);
        refunded++;
      } else {
        pool.claimDeposit({ id: order.id, inAsset: order.inAsset, senderTotal: total });
        const before = pool.reserves.PSY * pool.reserves.USDT;
        const result = pool.settle(order.id, BigInt(round + 2));
        assert(pool.reserves.PSY * pool.reserves.USDT >= before);
        confirm(pool, result.effects);
        assert.throws(() => pool.settle(order.id, BigInt(round + 2)), /already resolved/);
        settled++;
      }
      assert(pool.assertAccounting());
      pool.closeOrder(order.id);
    }
  }
  assert.equal(settled, 150);
  assert.equal(refunded, 50);
  assert.equal(pool.pendingTransfers.size, 0);
  assert.equal(pool.totalShares, 1_000_000n);
});

test('20 LP add/remove cycles preserve locked shares and pool accounting', () => {
  const pool = fundedPool();
  const owner = 20n;
  let psyPaid = 0n;
  let usdtPaid = 0n;
  for (let round = 0; round < 20; round++) {
    const addId = `add-${round}`;
    psyPaid += 10_000n;
    usdtPaid += 10_000n;
    pool.openAddLiquidity({ id: addId, owner, amountPsy: 10_000n,
      amountUsdt: 10_000n, minShares: 1n, deadline: 1_000n });
    pool.claimDeposit({ id: addId, inAsset: 'PSY', senderTotal: psyPaid });
    pool.claimDeposit({ id: addId, inAsset: 'USDT', senderTotal: usdtPaid });
    const added = pool.settle(addId, BigInt(round + 2));
    confirm(pool, added.effects);
    pool.closeOrder(addId);
    const removeId = `remove-${round}`;
    pool.openRemoveLiquidity({ id: removeId, owner, shares: added.minted,
      minPsy: 1n, minUsdt: 1n, deadline: 1_000n });
    const removed = pool.settle(removeId, BigInt(round + 2));
    assert.equal(removed.effects.length, 2);
    confirm(pool, removed.effects);
    pool.closeOrder(removeId);
    assert.equal(pool.shares.get(owner), 0n);
    assert.equal(pool.totalShares, 1_000_000n);
    assert(pool.assertAccounting());
  }
});
