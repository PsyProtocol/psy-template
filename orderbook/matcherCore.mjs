// Read-only matching rules for contract 64. The contract and registered
// SD-key fingerprint remain the authority when a proposed stack is proved.
import { AMOUNT_CAP, FEE_ESCROW, PSY, PUSDT, cancelCalls, matchCalls, withEscrowSignInputs } from './operationCalls.mjs';

const cap = BigInt(AMOUNT_CAP);
const feeEscrow = BigInt(FEE_ESCROW);

export function decodeFeltSlot(leafValue, slot) {
  if (!Number.isSafeInteger(slot) || slot < 0 || !/^[0-9a-fA-F]{64}$/.test(leafValue)) {
    throw new RangeError('invalid state slot or Merkle leaf value');
  }
  const limb = leafValue.slice((3 - slot % 4) * 16, (4 - slot % 4) * 16);
  return BigInt(`0x${limb}`);
}

function amount(value) {
  return typeof value === 'bigint' && value > 0n && value <= cap;
}

export function checkOrder(order, checkpoint, escrowId) {
  const reasons = [];
  if (!Number.isSafeInteger(order?.sellerId) || order.sellerId < 1 || order.sellerId >= 16_777_216 || order.sellerId === escrowId) reasons.push('invalid seller');
  if (order?.kind !== 1n) reasons.push('not active');
  if (order?.poolUser !== BigInt(escrowId)) reasons.push('wrong escrow');
  if (order?.asset !== BigInt(PSY) && order?.asset !== BigInt(PUSDT)) reasons.push('unsupported asset');
  if (!amount(order?.sellAmount) || !amount(order?.minBuy)) reasons.push('invalid amount');
  if (typeof order?.deadline !== 'bigint' || order.deadline < BigInt(checkpoint)) reasons.push('expired');
  if (typeof order?.nonce !== 'bigint' || typeof order?.consumedNonce !== 'bigint' || order.nonce <= order.consumedNonce) reasons.push('already consumed');
  if (typeof order?.sentPsy !== 'bigint' || typeof order?.settledPsy !== 'bigint' ||
      order.sentPsy < order.settledPsy ||
      (order.asset === BigInt(PSY) && order.sentPsy - order.settledPsy !== order.sellAmount + feeEscrow) ||
      (order.asset === BigInt(PUSDT) && order.sentPsy - order.settledPsy !== feeEscrow)) reasons.push('PSY payment mismatch');
  if (order?.asset === BigInt(PUSDT) &&
      (typeof order.sentUsdt !== 'bigint' || typeof order.settledUsdt !== 'bigint' ||
       order.sentUsdt < order.settledUsdt || order.sentUsdt - order.settledUsdt !== order.sellAmount)) reasons.push('pUSDT payment mismatch');
  return reasons;
}

function callNumber(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new RangeError(`${label} exceeds a safe integer`);
  return number;
}

export function proposeMatch(orders, { checkpoint, contractId, escrowId }) {
  if (!Array.isArray(orders) || !Number.isSafeInteger(checkpoint)) throw new TypeError('invalid order snapshot');
  const eligible = orders.filter(order => checkOrder(order, checkpoint, escrowId).length === 0);
  const psy = eligible.filter(order => order.asset === BigInt(PSY));
  const usdt = eligible.filter(order => order.asset === BigInt(PUSDT));
  for (const p of psy) {
    for (const u of usdt) {
      if (p.sellerId === u.sellerId || u.sellAmount < p.minBuy || p.sellAmount < u.minBuy) continue;
      const args = {
        contractId, escrowId, psySeller: p.sellerId, usdtSeller: u.sellerId,
        amountPsy: callNumber(p.sellAmount, 'PSY amount'), amountUsdt: callNumber(u.sellAmount, 'pUSDT amount'),
        psyNonce: callNumber(p.nonce, 'PSY nonce'), usdtNonce: callNumber(u.nonce, 'pUSDT nonce'),
      };
      return { checkpoint, args, submission: withEscrowSignInputs(matchCalls(args)) };
    }
  }
  return null;
}

export function proposeExpiredRefunds(orders, { checkpoint, contractId, escrowId }) {
  const expiredAt = BigInt(checkpoint);
  return orders.flatMap(order => {
    if (order?.deadline >= expiredAt) return [];
    const reasons = checkOrder(order, 0, escrowId).filter(reason => reason !== 'expired');
    if (reasons.length) return [];
    const args = {
      contractId, escrowId, sellerId: order.sellerId,
      sellAsset: Number(order.asset), sellAmount: callNumber(order.sellAmount, 'sell amount'),
      nonce: callNumber(order.nonce, 'nonce'),
    };
    return [{ checkpoint, args, submission: withEscrowSignInputs(cancelCalls(args)) }];
  });
}
