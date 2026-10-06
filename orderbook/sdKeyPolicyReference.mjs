// Readable reference for the three registered SD-key branches. The Rust
// fingerprint is the authority; this module is for local adversarial tests.
import { FEE_ESCROW, PSY, PUSDT, cancelCalls, matchCalls } from './operationCalls.mjs';

const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function authorizeEscrowTransaction({ contractCalls, contractId, escrowId }) {
  if (!Array.isArray(contractCalls) || contractCalls.length !== 7) {
    throw new Error('expected six guarded calls and one fee burn');
  }
  const burn = contractCalls[6];
  const fee = burn?.inputs?.[0];
  if (burn?.contract_id !== PSY || burn.method_name !== 'simple_burn' ||
      !Number.isSafeInteger(fee) || fee < 1_000_000_000 || fee > FEE_ESCROW ||
      (fee - 1_000_000_000) % 1_000) {
    throw new Error('invalid fee burn');
  }
  const guard = contractCalls[0];
  if (guard?.contract_id !== contractId) throw new Error('wrong guard contract');
  let expected;
  let action;
  if (guard.method_name === 'match_orders') {
    const [psySeller, usdtSeller, amountPsy, amountUsdt, psyNonce, usdtNonce] = guard.inputs;
    expected = matchCalls({ contractId, escrowId, psySeller, usdtSeller,
      amountPsy, amountUsdt, psyNonce, usdtNonce }).contract_calls;
    action = 'match';
  } else if (guard.method_name === 'cancel_psy_order' || guard.method_name === 'cancel_usdt_order') {
    const [sellerId, sellAmount, nonce] = guard.inputs;
    const sellAsset = guard.method_name === 'cancel_psy_order' ? PSY : PUSDT;
    expected = cancelCalls({ contractId, escrowId, sellerId, sellAsset, sellAmount, nonce }).contract_calls;
    action = 'cancel';
  } else throw new Error('unsupported escrow guard');
  if (!equal(contractCalls.slice(0, 6), expected)) throw new Error('transaction differs from authorized escrow stack');
  return { action, fee };
}
