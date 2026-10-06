import {readFile} from 'node:fs/promises';
import {publicState} from '../executor/publicState.mjs';
import {proposeExpiredRefunds, proposeMatch} from './matcherCore.mjs';

// Read all orders and Outbox cursors at one shared Realm checkpoint.
// This avoids a CLI process per leaf and does not authorize any write.
export async function scanOrderbook(options, readState = publicState) {
  const state = await readState(options.rpcConfig);
  const abi = JSON.parse(await readFile(options.abi, 'utf8'));
  const offsets = new Map(abi.contract.state.map(f => [f.name, f.offset]));
  const indexed = (name, seller) => {
    const field = abi.contract.state.find(f => f.name === name);
    if (!field || field.type.item_felt_size !== 1 || seller >= field.type.length) {
      throw new Error(`invalid cursor field ${name}`);
    }
    return state.slot(options.vaultId, options.contractId, offsets.get(name) + seller);
  };
  const orders = [];
  for (const sellerId of options.users) {
    if (!Number.isSafeInteger(sellerId) || sellerId < 1 || sellerId >= 16_777_216 || sellerId === options.vaultId) {
      throw new RangeError('invalid seller ID');
    }
    const f = await state.fields(sellerId, options.contractId, abi, [
      'order_kind', 'order_pool_user', 'order_sell_asset', 'order_sell_amount',
      'order_min_buy', 'order_deadline', 'order_nonce',
    ]);
    const consumedNonce = await indexed('active_consumed_nonce', sellerId);
    const settledPsy = await indexed('active_settled_psy_sent', sellerId);
    const settledUsdt = await indexed('active_settled_usdt_sent', sellerId);
    const sentPsy = await state.slot(sellerId, 0, 3 + options.vaultId * 2);
    const sentUsdt = f.order_sell_asset === 4n
      ? await state.slot(sellerId, 4, 3 + options.vaultId * 2) : 0n;
    orders.push({sellerId, kind: f.order_kind, poolUser: f.order_pool_user,
      asset: f.order_sell_asset, sellAmount: f.order_sell_amount, minBuy: f.order_min_buy,
      deadline: f.order_deadline, nonce: f.order_nonce, consumedNonce,
      settledPsy, settledUsdt, sentPsy, sentUsdt});
  }
  const context = {checkpoint: state.checkpoint, contractId: options.contractId, escrowId: options.vaultId};
  const match = proposeMatch(orders, context);
  const refund = proposeExpiredRefunds(orders, context)[0];
  return {checkpoint: state.checkpoint, orders,
    action: match ? {kind: 'match', submission: match.submission}
      : refund ? {kind: 'refund', submission: refund.submission} : null};
}
