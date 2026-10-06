import assert from 'node:assert/strict';
import test from 'node:test';
import { PsyUsdtPoolModel } from './poolModel.mjs';

function seed() {
  const pool = new PsyUsdtPoolModel();
  pool.openAddLiquidity({
    id: 'seed', owner: 11n, amountPsy: 1_000_000n, amountUsdt: 1_000_000n,
    minShares: 998_000n, deadline: 100n,
  });
  pool.claimDeposit({ id: 'seed', inAsset: 'PSY', senderTotal: 1_000_000n });
  pool.claimDeposit({ id: 'seed', inAsset: 'USDT', senderTotal: 1_000_000n });
  pool.settle('seed', 10n);
  return pool;
}

function confirmEffects(pool, effects) {
  for (const effect of effects) {
    const key = `${effect.asset}:${effect.recipient}`;
    const senderTotal = (pool.sentTotals.get(key) ?? 0n) + effect.amount;
    pool.confirmTransfer({ id: effect.id, senderTotal });
  }
}

test('funding, both swap directions, LP add/remove, and vault conservation', () => {
  const pool = seed();
  pool.openSwap({ id: 'psy-to-usdt', owner: 12n, inAsset: 'PSY', amountIn: 10_000n, minAmountOut: 9_000n, deadline: 100n });
  assert.deepEqual(pool.claimDeposit({ id: 'psy-to-usdt', inAsset: 'PSY', senderTotal: 10_000n }), [
    { type: 'claim', asset: 'PSY', sender: 12n, amount: 10_000n },
  ]);
  const first = pool.settle('psy-to-usdt', 20n);
  assert.equal(first.effects[0].asset, 'USDT');
  assert(first.productAfter >= first.productBefore);
  assert.equal(pool.orders.get('psy-to-usdt').status, 'payout_pending');
  assert.equal(pool.vault.USDT, pool.reserves.USDT + first.amountOut);
  confirmEffects(pool, first.effects);
  assert.equal(pool.orders.get('psy-to-usdt').status, 'settled');

  pool.openSwap({ id: 'usdt-to-psy', owner: 13n, inAsset: 'USDT', amountIn: 20_000n, minAmountOut: 15_000n, deadline: 100n });
  pool.claimDeposit({ id: 'usdt-to-psy', inAsset: 'USDT', senderTotal: 20_000n });
  const second = pool.settle('usdt-to-psy', 25n);
  assert.equal(second.effects[0].asset, 'PSY');
  assert(second.productAfter >= second.productBefore);
  confirmEffects(pool, second.effects);

  pool.openAddLiquidity({ id: 'add', owner: 14n, amountPsy: 100_000n, amountUsdt: 100_000n, minShares: 1n, deadline: 100n });
  pool.claimDeposit({ id: 'add', inAsset: 'PSY', senderTotal: 100_000n });
  pool.claimDeposit({ id: 'add', inAsset: 'USDT', senderTotal: 100_000n });
  assert.throws(() => pool.settle('add', 30n), /deposit ratio mismatch/);
  confirmEffects(pool, pool.refund('add'));
  pool.closeOrder('add');

  const amountPsy = pool.reserves.PSY;
  const amountUsdt = pool.reserves.USDT;
  pool.openAddLiquidity({ id: 'proportional-add', owner: 14n, amountPsy,
    amountUsdt, minShares: 1n, deadline: 100n });
  pool.claimDeposit({ id: 'proportional-add', inAsset: 'PSY', senderTotal: 100_000n + amountPsy });
  pool.claimDeposit({ id: 'proportional-add', inAsset: 'USDT', senderTotal: 100_000n + amountUsdt });
  const add = pool.settle('proportional-add', 30n);
  assert(add.minted > 0n);
  assert.equal(add.refundPsy, 0n);
  assert.equal(add.refundUsdt, 0n);
  confirmEffects(pool, add.effects);
  pool.closeOrder('proportional-add');

  pool.openRemoveLiquidity({ id: 'remove', owner: 14n, shares: add.minted, minPsy: 1n, minUsdt: 1n, deadline: 100n });
  const removed = pool.settle('remove', 35n);
  assert.equal(removed.effects.length, 2);
  confirmEffects(pool, [removed.effects[0]]);
  assert.equal(pool.orders.get('remove').status, 'payout_pending');
  confirmEffects(pool, [removed.effects[1]]);
  assert.equal(pool.orders.get('remove').status, 'settled');
  assert.equal(pool.shares.get(14n), 0n);
  assert(pool.assertAccounting());
});

test('expired or out-of-range swaps can refund exactly once without touching reserves', () => {
  const pool = seed();
  pool.openSwap({ id: 'expired', owner: 12n, inAsset: 'PSY', amountIn: 10_000n, minAmountOut: 999_999n, deadline: 5n });
  pool.claimDeposit({ id: 'expired', inAsset: 'PSY', senderTotal: 10_000n });
  const before = { ...pool.reserves };
  assert.throws(() => pool.settle('expired', 6n), /expired/);
  const refund = pool.refund('expired');
  assert.deepEqual(refund, [{ id: 'expired:PSY', orderId: 'expired', type: 'transfer', asset: 'PSY', recipient: 12n, amount: 10_000n }]);
  assert.equal(pool.orders.get('expired').status, 'payout_pending');
  assert.equal(pool.vault.PSY, before.PSY + 10_000n);
  confirmEffects(pool, refund);
  assert.equal(pool.orders.get('expired').status, 'refunded');
  assert.deepEqual(pool.reserves, before);
  assert.throws(() => pool.refund('expired'), /already resolved/);
  assert.throws(() => pool.settle('expired', 4n), /already resolved/);
  assert(pool.assertAccounting());
});

test('unclaimed refund claims only Alice\'s exact outbox delta and returns it to Alice', () => {
  const pool = seed();
  pool.openSwap({ id: 'alice', owner: 12n, inAsset: 'PSY', amountIn: 100n, minAmountOut: 1n, deadline: 100n });
  pool.openSwap({ id: 'bob', owner: 13n, inAsset: 'PSY', amountIn: 100n, minAmountOut: 1n, deadline: 100n });
  const before = { ...pool.reserves };

  assert.throws(() => pool.cancelUnclaimedPayment({ id: 'bob', inAsset: 'PSY', senderTotal: 0n }), /does not match/);
  assert.throws(() => pool.cancelUnclaimedPayment({ id: 'alice', inAsset: 'PSY', senderTotal: 99n }), /does not match/);
  assert.equal(pool.vault.PSY, before.PSY);

  const [claim, transfer] = pool.cancelUnclaimedPayment({ id: 'alice', inAsset: 'PSY', senderTotal: 100n });
  assert.deepEqual(claim, { type: 'claim', asset: 'PSY', sender: 12n, amount: 100n });
  assert.deepEqual(transfer, {
    id: 'alice:PSY', orderId: 'alice', type: 'transfer', asset: 'PSY', recipient: 12n, amount: 100n,
  });
  assert.equal(pool.orders.get('alice').status, 'payout_pending');
  assert.equal(pool.vault.PSY, before.PSY + 100n);
  assert.deepEqual(pool.reserves, before);
  assert.throws(() => pool.cancelUnclaimedPayment({ id: 'alice', inAsset: 'PSY', senderTotal: 100n }), /already resolved/);
  assert.throws(() => pool.refund('alice'), /already resolved/);
  assert.throws(() => pool.confirmTransfer({ id: transfer.id, senderTotal: 99n }), /does not match/);
  pool.confirmTransfer({ id: transfer.id, senderTotal: 100n });
  assert.equal(pool.orders.get('alice').status, 'refunded');
  assert.equal(pool.vault.PSY, before.PSY);
  assert(pool.assertAccounting());
});

test('cumulative claims reject stale reads, mixed payments, duplicate funding and competing orders', () => {
  const pool = seed();
  pool.openSwap({ id: 'first', owner: 12n, inAsset: 'PSY', amountIn: 100n, minAmountOut: 1n, deadline: 100n });
  assert.throws(() => pool.openSwap({ id: 'competing', owner: 12n, inAsset: 'USDT', amountIn: 100n, minAmountOut: 1n, deadline: 100n }), /active order slot/);
  assert.throws(() => pool.claimDeposit({ id: 'first', inAsset: 'PSY', senderTotal: 99n }), /does not match/);
  assert.equal(pool.vault.PSY, pool.reserves.PSY);
  pool.claimDeposit({ id: 'first', inAsset: 'PSY', senderTotal: 100n });
  assert.throws(() => pool.claimDeposit({ id: 'first', inAsset: 'PSY', senderTotal: 200n }), /duplicate deposit/);
  confirmEffects(pool, pool.refund('first'));
  assert.throws(() => pool.openSwap({ id: 'too-early', owner: 12n, inAsset: 'PSY', amountIn: 100n, minAmountOut: 1n, deadline: 100n }), /active order slot/);
  pool.closeOrder('first');
  pool.openSwap({ id: 'second', owner: 12n, inAsset: 'PSY', amountIn: 100n, minAmountOut: 1n, deadline: 100n });
  assert.throws(() => pool.claimDeposit({ id: 'second', inAsset: 'PSY', senderTotal: 100n }), /does not match/);
  pool.claimDeposit({ id: 'second', inAsset: 'PSY', senderTotal: 200n });
  assert(pool.assertAccounting());
});

test('a deferred payout is a locked liability until its exact token outbox delta is confirmed', () => {
  const pool = seed();
  pool.openSwap({ id: 'first', owner: 12n, inAsset: 'PSY', amountIn: 10_000n, minAmountOut: 1n, deadline: 100n });
  pool.claimDeposit({ id: 'first', inAsset: 'PSY', senderTotal: 10_000n });
  const first = pool.settle('first', 20n);
  const pending = first.effects[0];
  assert.equal(pool.pendingTransfers.size, 1);
  assert.equal(pool.vault.USDT, pool.reserves.USDT + pending.amount);
  assert.throws(() => pool.confirmTransfer({ id: pending.id, senderTotal: pending.amount - 1n }), /does not match/);
  assert.equal(pool.pendingTransfers.size, 1);
  assert.throws(() => pool.refund('first'), /already resolved/);

  assert.throws(() => pool.openSwap({ id: 'second', owner: 12n, inAsset: 'PSY', amountIn: 10_000n, minAmountOut: 1n, deadline: 100n }), /active order slot/);
  assert.throws(() => pool.closeOrder('first'), /not finished/);
  assert.equal(pool.pendingTransfers.size, 1);
  pool.confirmTransfer({ id: pending.id, senderTotal: pending.amount });
  assert.throws(() => pool.confirmTransfer({ id: pending.id, senderTotal: pending.amount }), /already confirmed/);
  pool.closeOrder('first');
  pool.openSwap({ id: 'second', owner: 12n, inAsset: 'PSY', amountIn: 10_000n, minAmountOut: 1n, deadline: 100n });
  pool.claimDeposit({ id: 'second', inAsset: 'PSY', senderTotal: 20_000n });
  const second = pool.settle('second', 22n);
  confirmEffects(pool, second.effects);
  assert(pool.assertAccounting());
});
