// Executable specification for a single PSY/USDT pool account. This model does
// not submit transactions or authorize spending on Psy.
import {
  GOLDILOCKS_MAX,
  MINIMUM_LIQUIDITY,
  quoteAddLiquidity,
  quoteExactIn,
  quoteInitialLiquidity,
  quoteRemoveLiquidity,
} from './referenceMath.mjs';

const ASSETS = ['PSY', 'USDT'];

function amount(value, name, positive = false) {
  if (typeof value !== 'bigint' || value < 0n || value > GOLDILOCKS_MAX || (positive && value === 0n)) {
    throw new RangeError(`${name} is outside the supported Felt range`);
  }
  return value;
}

function user(value) {
  if (typeof value !== 'bigint' || value < 1n || value >= 16777216n) {
    throw new RangeError('owner must be a 24-bit registered user ID');
  }
  return value;
}

function asset(value) {
  if (!ASSETS.includes(value)) throw new RangeError('asset must be PSY or USDT');
  return value;
}

function checkedAdd(a, b) {
  const result = a + b;
  if (result > GOLDILOCKS_MAX) throw new RangeError('accounting balance overflow');
  return result;
}

export class PsyUsdtPoolModel {
  constructor({ feeBps = 30n } = {}) {
    amount(feeBps, 'feeBps');
    if (feeBps >= 10000n) throw new RangeError('feeBps must be below 10000');
    this.feeBps = feeBps;
    this.reserves = { PSY: 0n, USDT: 0n };
    this.vault = { PSY: 0n, USDT: 0n };
    this.totalShares = 0n;
    this.shares = new Map();
    this.orders = new Map();
    this.claimedTotals = new Map();
    this.pendingTransfers = new Map();
    this.confirmedTransfers = new Set();
    this.sentTotals = new Map();
  }

  #create(id, owner, kind, expected, limits, deadline) {
    if (typeof id !== 'string' || id.length === 0 || this.orders.has(id)) throw new Error('duplicate or empty order ID');
    user(owner);
    amount(deadline, 'deadline');
    if ([...this.orders.values()].some(order => order.owner === owner && !order.closed)) {
      throw new Error('user already has an active order slot');
    }
    for (const key of Object.keys(expected)) {
      asset(key);
      amount(expected[key], `${key} deposit`, true);
    }
    const order = { id, owner, kind, expected, funded: {}, limits, deadline, status: 'open', closed: false };
    this.orders.set(id, order);
    return order;
  }

  openSwap({ id, owner, inAsset, amountIn, minAmountOut, deadline }) {
    asset(inAsset);
    amount(minAmountOut, 'minAmountOut', true);
    return this.#create(id, owner, 'swap', { [inAsset]: amountIn }, { inAsset, minAmountOut }, deadline);
  }

  openAddLiquidity({ id, owner, amountPsy, amountUsdt, minShares, deadline }) {
    amount(minShares, 'minShares', true);
    return this.#create(id, owner, 'add', { PSY: amountPsy, USDT: amountUsdt }, { minShares }, deadline);
  }

  openRemoveLiquidity({ id, owner, shares, minPsy, minUsdt, deadline }) {
    amount(shares, 'shares', true);
    amount(minPsy, 'minPsy', true);
    amount(minUsdt, 'minUsdt', true);
    return this.#create(id, owner, 'remove', {}, { shares, minPsy, minUsdt }, deadline);
  }

  // Mirrors the payer's explicit close_* call. This model conservatively
  // requires completed pool settlement and any outgoing transfer confirmation.
  closeOrder(id) {
    const order = this.orders.get(id);
    if (!order || order.closed) throw new Error('order is missing or already closed');
    if (order.status !== 'settled' && order.status !== 'refunded') {
      throw new Error('order has not finished settlement or refund');
    }
    order.closed = true;
  }

  // Mirrors token.claim(sender): claim the entire new cumulative outbox delta.
  // The delta must equal one order's declared deposit before a claim is made.
  claimDeposit({ id, inAsset, senderTotal }) {
    const order = this.#open(id);
    asset(inAsset);
    if (!(inAsset in order.expected) || inAsset in order.funded) throw new Error('unexpected or duplicate deposit');
    amount(senderTotal, 'senderTotal');
    const key = `${inAsset}:${order.owner}`;
    const previous = this.claimedTotals.get(key) ?? 0n;
    if (senderTotal <= previous || senderTotal - previous !== order.expected[inAsset]) {
      throw new Error('cumulative token outbox does not match order deposit');
    }
    const nextVault = checkedAdd(this.vault[inAsset], order.expected[inAsset]);
    this.claimedTotals.set(key, senderTotal);
    this.vault[inAsset] = nextVault;
    order.funded[inAsset] = order.expected[inAsset];
    this.assertAccounting();
    return [{ type: 'claim', asset: inAsset, sender: order.owner, amount: order.expected[inAsset] }];
  }

  // Reference shape for the AMM SD-key's unclaimed-payment refund branch.
  // `senderTotal` must come from authenticated token state in a real circuit.
  // The authorized transaction claims the exact delta, then transfers it to
  // the original payer; the transfer remains a liability until confirmed.
  cancelUnclaimedPayment({ id, inAsset, senderTotal }) {
    const order = this.#open(id);
    asset(inAsset);
    if (order.kind !== 'swap' || !(inAsset in order.expected) || inAsset in order.funded) {
      throw new Error('order has no unclaimed swap payment');
    }
    amount(senderTotal, 'senderTotal');
    const key = `${inAsset}:${order.owner}`;
    const previous = this.claimedTotals.get(key) ?? 0n;
    const expected = order.expected[inAsset];
    if (senderTotal <= previous || senderTotal - previous !== expected) {
      throw new Error('cumulative token outbox does not match order deposit');
    }
    const nextVault = checkedAdd(this.vault[inAsset], expected);
    if ([...this.pendingTransfers.values()].some(item => item.asset === inAsset && item.recipient === order.owner)) {
      throw new Error('a transfer to this recipient and asset is already pending');
    }
    const transferId = `${order.id}:${inAsset}`;
    if (this.pendingTransfers.has(transferId) || this.confirmedTransfers.has(transferId)) {
      throw new Error('duplicate transfer ID');
    }

    this.claimedTotals.set(key, senderTotal);
    this.vault[inAsset] = nextVault;
    order.funded[inAsset] = expected;
    const transfer = this.#scheduleTransfer(order, inAsset, order.owner, expected);
    order.status = 'payout_pending';
    order.resolution = 'refunded';
    this.assertAccounting();
    return [
      { type: 'claim', asset: inAsset, sender: order.owner, amount: expected },
      transfer,
    ];
  }

  settle(id, checkpoint) {
    const order = this.#open(id);
    amount(checkpoint, 'checkpoint');
    if (checkpoint > order.deadline) throw new Error('order expired; refund its claimed deposits');
    for (const key of Object.keys(order.expected)) {
      if (order.funded[key] !== order.expected[key]) throw new Error('order is not fully funded');
    }
    let result;
    if (order.kind === 'swap') result = this.#settleSwap(order);
    else if (order.kind === 'add') result = this.#settleAdd(order);
    else result = this.#settleRemove(order);
    order.status = result.effects.length === 0 ? 'settled' : 'payout_pending';
    order.resolution = 'settled';
    this.assertAccounting();
    return result;
  }

  refund(id) {
    const order = this.#open(id);
    const effects = [];
    for (const [inAsset, value] of Object.entries(order.funded)) {
      this.#canSchedule(inAsset, order.owner, value);
    }
    for (const [inAsset, value] of Object.entries(order.funded)) {
      effects.push(this.#scheduleTransfer(order, inAsset, order.owner, value));
    }
    order.status = effects.length === 0 ? 'refunded' : 'payout_pending';
    order.resolution = 'refunded';
    this.assertAccounting();
    return effects;
  }

  // Represents an authenticated confirmation of the pool account's token
  // outbox. The model cannot fetch or prove this value from the chain itself.
  confirmTransfer({ id, senderTotal }) {
    const transfer = this.pendingTransfers.get(id);
    if (!transfer) throw new Error('transfer is missing or already confirmed');
    amount(senderTotal, 'senderTotal');
    const key = `${transfer.asset}:${transfer.recipient}`;
    const previous = this.sentTotals.get(key) ?? 0n;
    if (senderTotal <= previous || senderTotal - previous !== transfer.amount) {
      throw new Error('cumulative token outbox does not match pending transfer');
    }
    if (this.vault[transfer.asset] < transfer.amount) throw new Error('insufficient vault balance for transfer');
    this.sentTotals.set(key, senderTotal);
    this.vault[transfer.asset] -= transfer.amount;
    this.pendingTransfers.delete(id);
    this.confirmedTransfers.add(id);
    const order = this.orders.get(transfer.orderId);
    if (![...this.pendingTransfers.values()].some(item => item.orderId === order.id)) {
      order.status = order.resolution;
    }
    this.assertAccounting();
    return transfer;
  }

  #canSchedule(inAsset, recipient, value) {
    if (this.vault[inAsset] < value) throw new Error('insufficient vault balance for transfer');
    if ([...this.pendingTransfers.values()].some(item => item.asset === inAsset && item.recipient === recipient)) {
      throw new Error('a transfer to this recipient and asset is already pending');
    }
  }

  #scheduleTransfer(order, inAsset, recipient, value) {
    this.#canSchedule(inAsset, recipient, value);
    const id = `${order.id}:${inAsset}`;
    if (this.pendingTransfers.has(id) || this.confirmedTransfers.has(id)) throw new Error('duplicate transfer ID');
    const transfer = { id, orderId: order.id, type: 'transfer', asset: inAsset, recipient, amount: value };
    this.pendingTransfers.set(id, transfer);
    return transfer;
  }

  #settleSwap(order) {
    const inAsset = order.limits.inAsset;
    const outAsset = inAsset === 'PSY' ? 'USDT' : 'PSY';
    const quote = quoteExactIn({
      reserveIn: this.reserves[inAsset],
      reserveOut: this.reserves[outAsset],
      amountIn: order.expected[inAsset],
      minAmountOut: order.limits.minAmountOut,
      feeBps: this.feeBps,
    });
    this.#canSchedule(outAsset, order.owner, quote.amountOut);
    this.reserves[inAsset] = quote.nextReserveIn;
    this.reserves[outAsset] = quote.nextReserveOut;
    return { ...quote, effects: [this.#scheduleTransfer(order, outAsset, order.owner, quote.amountOut)] };
  }

  #settleAdd(order) {
    const { PSY: amountPsy, USDT: amountUsdt } = order.expected;
    const first = this.totalShares === 0n;
    // The deployed contract accepts only exact reserve-ratio deposits.
    // A generic quote may propose unused-token refunds, but that path is
    // unavailable in the on-chain add_liquidity method.
    if (!first && amountPsy * this.reserves.USDT !== amountUsdt * this.reserves.PSY) {
      throw new Error('deposit ratio mismatch');
    }
    const quote = first
      ? quoteInitialLiquidity({ amountPsy, amountUsdt })
      : quoteAddLiquidity({
          reservePsy: this.reserves.PSY,
          reserveUsdt: this.reserves.USDT,
          totalShares: this.totalShares,
          amountPsy,
          amountUsdt,
        });
    const minted = first ? quote.providerShares : quote.shares;
    if (minted < order.limits.minShares) throw new Error('LP share limit exceeded');
    const refundPsy = first ? 0n : quote.refundPsy;
    const refundUsdt = first ? 0n : quote.refundUsdt;
    if (refundPsy) this.#canSchedule('PSY', order.owner, refundPsy);
    if (refundUsdt) this.#canSchedule('USDT', order.owner, refundUsdt);
    const nextShares = checkedAdd(this.shares.get(order.owner) ?? 0n, minted);
    this.reserves.PSY = quote.nextReservePsy;
    this.reserves.USDT = quote.nextReserveUsdt;
    this.totalShares = first ? quote.totalShares : quote.nextTotalShares;
    this.shares.set(order.owner, nextShares);
    const effects = [];
    if (refundPsy) effects.push(this.#scheduleTransfer(order, 'PSY', order.owner, refundPsy));
    if (refundUsdt) effects.push(this.#scheduleTransfer(order, 'USDT', order.owner, refundUsdt));
    return { ...quote, minted, effects };
  }

  #settleRemove(order) {
    const { shares, minPsy, minUsdt } = order.limits;
    const owned = this.shares.get(order.owner) ?? 0n;
    if (shares > owned) throw new Error('insufficient LP shares');
    const quote = quoteRemoveLiquidity({
      reservePsy: this.reserves.PSY,
      reserveUsdt: this.reserves.USDT,
      totalShares: this.totalShares,
      shares,
    });
    if (quote.amountPsy < minPsy || quote.amountUsdt < minUsdt) throw new Error('withdrawal limit exceeded');
    if (this.vault.PSY < quote.amountPsy || this.vault.USDT < quote.amountUsdt) throw new Error('insufficient vault balance');
    this.#canSchedule('PSY', order.owner, quote.amountPsy);
    this.#canSchedule('USDT', order.owner, quote.amountUsdt);
    this.reserves.PSY = quote.nextReservePsy;
    this.reserves.USDT = quote.nextReserveUsdt;
    this.totalShares = quote.nextTotalShares;
    this.shares.set(order.owner, owned - shares);
    return {
      ...quote,
      effects: [
        this.#scheduleTransfer(order, 'PSY', order.owner, quote.amountPsy),
        this.#scheduleTransfer(order, 'USDT', order.owner, quote.amountUsdt),
      ],
    };
  }

  #open(id) {
    const order = this.orders.get(id);
    if (!order || order.status !== 'open') throw new Error('order is missing or already resolved');
    return order;
  }

  assertAccounting() {
    for (const key of ASSETS) {
      let escrow = 0n;
      for (const order of this.orders.values()) {
        if (order.status === 'open') escrow += order.funded[key] ?? 0n;
      }
      const payouts = [...this.pendingTransfers.values()]
        .filter(item => item.asset === key)
        .reduce((sum, item) => sum + item.amount, 0n);
      if (this.vault[key] !== this.reserves[key] + escrow + payouts) {
        throw new Error(`${key} vault does not equal reserves plus pending deposits and payouts`);
      }
    }
    const owned = [...this.shares.values()].reduce((sum, shares) => sum + shares, 0n);
    if (this.totalShares !== 0n && this.totalShares !== owned + MINIMUM_LIQUIDITY) {
      throw new Error('LP shares do not equal circulating plus locked shares');
    }
    return true;
  }
}
