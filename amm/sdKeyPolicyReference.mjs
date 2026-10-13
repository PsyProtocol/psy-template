// Executable specification for the future AMM fingerprint. This runs off
// chain and CANNOT authorize a public-key pool account by itself.
import {
  POOL_FEE_ESCROW, refundAddCalls, refundSwapCalls,
  settleAddCalls, settleRemoveCalls, settleSwapCalls, cancelRemoveCalls,
} from './operationCalls.mjs';

const MIN_NETWORK_BURN = 1_000_000_000;

function sameCall(actual, expected) {
  return actual?.contract_id === expected.contract_id &&
    actual?.method_name === expected.method_name &&
    Array.isArray(actual.inputs) &&
    actual.inputs.length === expected.inputs.length &&
    actual.inputs.every((value, index) => value === expected.inputs[index]);
}

export function authorizePoolTransaction({ contractCalls, poolContractId, poolUserId }) {
  if (!Array.isArray(contractCalls) || contractCalls.length !== 6) {
    throw new RangeError('pool transaction must have five guarded calls and one fee burn');
  }
  const [first, ...rest] = contractCalls;
  if (first?.contract_id !== poolContractId || !Array.isArray(first.inputs)) {
    throw new Error('first call must be the pool guard');
  }
  const [payerId, ...args] = first.inputs;
  const ids = { poolContractId, poolUserId, payerId };
  let expected;
  switch (first.method_name) {
    case 'swap':
      if (args.length !== 4) throw new Error('invalid swap guard inputs');
      expected = settleSwapCalls({ ...ids, asset: args[0], amountIn: args[1], amountOut: args[2], nonce: args[3] });
      break;
    case 'refund_unclaimed':
      if (args.length !== 2) throw new Error('invalid swap refund guard inputs');
      expected = refundSwapCalls({ ...ids, asset: args[0], amount: args[1] });
      break;
    case 'add_liquidity':
      if (args.length !== 4) throw new Error('invalid add guard inputs');
      expected = settleAddCalls({ ...ids, amountPsy: args[0], amountUsdt: args[1], minted: args[2], nonce: args[3] });
      break;
    case 'refund_add_unclaimed':
      if (args.length !== 2) throw new Error('invalid LP refund guard inputs');
      expected = refundAddCalls({ ...ids, amountPsy: args[0], amountUsdt: args[1] });
      break;
    case 'remove_liquidity':
      if (args.length !== 4) throw new Error('invalid remove guard inputs');
      expected = settleRemoveCalls({ ...ids, shares: args[0], amountPsy: args[1], amountUsdt: args[2], nonce: args[3] });
      break;
    case 'cancel_remove':
      if (args.length !== 1) throw new Error('invalid remove cancellation inputs');
      expected = cancelRemoveCalls({ ...ids, nonce: args[0] });
      break;
    default:
      throw new Error('guard method is not an AMM pool action');
  }
  for (let i = 0; i < 5; i++) {
    if (!sameCall(contractCalls[i], expected.contract_calls[i])) {
      throw new Error(`call ${i} differs from the guarded operation`);
    }
  }
  const burn = rest[4];
  if (burn?.contract_id !== 0 || burn.method_name !== 'simple_burn' ||
      !Array.isArray(burn.inputs) || burn.inputs.length !== 1 ||
      !Number.isSafeInteger(burn.inputs[0]) ||
      burn.inputs[0] < MIN_NETWORK_BURN || burn.inputs[0] > POOL_FEE_ESCROW ||
      (burn.inputs[0] - MIN_NETWORK_BURN) % 1_000 !== 0) {
    throw new Error('invalid final PSY fee burn');
  }
  return { action: first.method_name, payerId, feeBurn: burn.inputs[0] };
}
