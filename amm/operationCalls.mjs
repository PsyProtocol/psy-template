// Unsigned call construction for the staging PSY (0) / pUSDT (4) pool.
// These calls are safe to submit from a public pool key only after the
// matching complete-transaction SD-key fingerprint is registered and proved.
export const PSY_CONTRACT_ID = 0;
export const PUSDT_CONTRACT_ID = 4;
export const POOL_FEE_ESCROW = 1_000_100_000;
export const POOL_AMOUNT_CAP = 10_000_000;
const USER_ID_LIMIT = 16_777_216;

function integer(value, name, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function poolArgs(args) {
  const poolContractId = integer(args.poolContractId, 'poolContractId', 5);
  const poolUserId = integer(args.poolUserId, 'poolUserId', 1, USER_ID_LIMIT - 1);
  const payerId = integer(args.payerId, 'payerId', 1, USER_ID_LIMIT - 1);
  if (poolUserId === payerId) throw new RangeError('payer and pool must differ');
  return { poolContractId, poolUserId, payerId };
}

function amount(value, name) {
  return integer(value, name, 1, POOL_AMOUNT_CAP);
}

function token(asset) {
  if (asset !== PSY_CONTRACT_ID && asset !== PUSDT_CONTRACT_ID) throw new RangeError('asset must be PSY (0) or pUSDT (4)');
  return asset;
}

function call(contract_id, method_name, ...inputs) {
  return { contract_id, method_name, inputs };
}

function guard(contract, method, ...inputs) {
  return call(contract, method, ...inputs);
}

function poolCalls(poolContractId, calls) {
  if (calls.length > 5) throw new RangeError('pool call stack exceeds five calls before fee burn');
  while (calls.length < 5) calls.push(guard(poolContractId, 'noop'));
  return { contract_calls: calls };
}

function claim(asset, payer) {
  return call(asset, 'simple_claim', payer);
}

function transfer(asset, recipient, value) {
  return call(asset, 'simple_transfer', recipient, value);
}

// Submit with the payer's ordinary private key. The payer's automatic network
// fee burn is separate and is appended by the wallet.
export function openSwapCalls(args) {
  const { poolContractId, poolUserId } = poolArgs(args);
  const asset = token(args.asset);
  const amountIn = amount(args.amountIn, 'amountIn');
  const minOut = amount(args.minOut, 'minOut');
  const deadline = integer(args.deadline, 'deadline', 1);
  const nonce = integer(args.nonce, 'nonce', 1);
  const calls = [guard(poolContractId, 'open_swap', poolUserId, asset, amountIn, minOut, deadline, nonce)];
  if (asset === PSY_CONTRACT_ID) {
    calls.push(transfer(PSY_CONTRACT_ID, poolUserId, amountIn + POOL_FEE_ESCROW));
  } else {
    calls.push(transfer(PUSDT_CONTRACT_ID, poolUserId, amountIn));
    calls.push(transfer(PSY_CONTRACT_ID, poolUserId, POOL_FEE_ESCROW));
  }
  return { contract_calls: calls };
}

// Submit from the pool account only with the custom SD-key policy. The wallet
// appends its PSY simple_burn call; the fingerprint must constrain that call.
export function settleSwapCalls(args) {
  const { poolContractId, payerId } = poolArgs(args);
  const asset = token(args.asset);
  const amountIn = amount(args.amountIn, 'amountIn');
  const amountOut = amount(args.amountOut, 'amountOut');
  const nonce = integer(args.nonce, 'nonce', 1);
  const calls = [guard(poolContractId, 'swap', payerId, asset, amountIn, amountOut, nonce)];
  calls.push(claim(PSY_CONTRACT_ID, payerId));
  if (asset === PUSDT_CONTRACT_ID) calls.push(claim(PUSDT_CONTRACT_ID, payerId));
  calls.push(transfer(asset === PSY_CONTRACT_ID ? PUSDT_CONTRACT_ID : PSY_CONTRACT_ID, payerId, amountOut));
  return poolCalls(poolContractId, calls);
}

export function refundSwapCalls(args) {
  const { poolContractId, payerId } = poolArgs(args);
  const asset = token(args.asset);
  const value = amount(args.amount, 'amount');
  const calls = [guard(poolContractId, 'refund_unclaimed', payerId, asset, value), claim(PSY_CONTRACT_ID, payerId)];
  if (asset === PUSDT_CONTRACT_ID) calls.push(claim(PUSDT_CONTRACT_ID, payerId));
  calls.push(transfer(asset, payerId, value));
  return poolCalls(poolContractId, calls);
}

export function openAddCalls(args) {
  const { poolContractId, poolUserId } = poolArgs(args);
  const amountPsy = amount(args.amountPsy, 'amountPsy');
  const amountUsdt = amount(args.amountUsdt, 'amountUsdt');
  const minShares = amount(args.minShares, 'minShares');
  const deadline = integer(args.deadline, 'deadline', 1);
  const nonce = integer(args.nonce, 'nonce', 1);
  return { contract_calls: [
    guard(poolContractId, 'open_add', poolUserId, amountPsy, amountUsdt, minShares, deadline, nonce),
    transfer(PSY_CONTRACT_ID, poolUserId, amountPsy + POOL_FEE_ESCROW),
    transfer(PUSDT_CONTRACT_ID, poolUserId, amountUsdt),
  ] };
}

export function settleAddCalls(args) {
  const { poolContractId, payerId } = poolArgs(args);
  const amountPsy = amount(args.amountPsy, 'amountPsy');
  const amountUsdt = amount(args.amountUsdt, 'amountUsdt');
  const minted = amount(args.minted, 'minted');
  const nonce = integer(args.nonce, 'nonce', 1);
  return poolCalls(poolContractId, [
    guard(poolContractId, 'add_liquidity', payerId, amountPsy, amountUsdt, minted, nonce),
    claim(PSY_CONTRACT_ID, payerId), claim(PUSDT_CONTRACT_ID, payerId),
  ]);
}

export function refundAddCalls(args) {
  const { poolContractId, payerId } = poolArgs(args);
  const amountPsy = integer(args.amountPsy, 'amountPsy', 0, POOL_AMOUNT_CAP);
  const amountUsdt = integer(args.amountUsdt, 'amountUsdt', 0, POOL_AMOUNT_CAP);
  if (amountPsy === 0 && amountUsdt === 0) throw new RangeError('at least one deposit leg must be present');
  const calls = [guard(poolContractId, 'refund_add_unclaimed', payerId, amountPsy, amountUsdt), claim(PSY_CONTRACT_ID, payerId)];
  if (amountUsdt > 0) calls.push(claim(PUSDT_CONTRACT_ID, payerId));
  if (amountPsy > 0) calls.push(transfer(PSY_CONTRACT_ID, payerId, amountPsy));
  if (amountUsdt > 0) calls.push(transfer(PUSDT_CONTRACT_ID, payerId, amountUsdt));
  return poolCalls(poolContractId, calls);
}

export function openRemoveCalls(args) {
  const { poolContractId, poolUserId } = poolArgs(args);
  const shares = amount(args.shares, 'shares');
  const minPsy = amount(args.minPsy, 'minPsy');
  const minUsdt = amount(args.minUsdt, 'minUsdt');
  const deadline = integer(args.deadline, 'deadline', 1);
  const nonce = integer(args.nonce, 'nonce', 1);
  return { contract_calls: [
    guard(poolContractId, 'open_remove', poolUserId, shares, minPsy, minUsdt, deadline, nonce),
    transfer(PSY_CONTRACT_ID, poolUserId, POOL_FEE_ESCROW),
  ] };
}

// The payer signs this after the pool's guarded cursors cover every payment
// belonging to the previous order. Closing releases the one-order-per-user slot; the next
// opening must use a strictly higher nonce.
export function closeOrderCalls(args) {
  const { poolContractId } = poolArgs(args);
  let method;
  if (args.kind === 'swap') {
    method = token(args.asset) === PSY_CONTRACT_ID ? 'close_psy_swap' : 'close_usdt_swap';
  } else if (args.kind === 'add') {
    method = 'close_add';
  } else if (args.kind === 'remove') {
    method = 'close_remove';
  } else {
    throw new RangeError('kind must be swap, add, or remove');
  }
  return { contract_calls: [guard(poolContractId, method)] };
}

export function settleRemoveCalls(args) {
  const { poolContractId, payerId } = poolArgs(args);
  const shares = amount(args.shares, 'shares');
  const amountPsy = amount(args.amountPsy, 'amountPsy');
  const amountUsdt = amount(args.amountUsdt, 'amountUsdt');
  const nonce = integer(args.nonce, 'nonce', 1);
  return poolCalls(poolContractId, [
    guard(poolContractId, 'remove_liquidity', payerId, shares, amountPsy, amountUsdt, nonce),
    claim(PSY_CONTRACT_ID, payerId),
    transfer(PSY_CONTRACT_ID, payerId, amountPsy),
    transfer(PUSDT_CONTRACT_ID, payerId, amountUsdt),
  ]);
}

export function cancelRemoveCalls(args) {
  const { poolContractId, payerId } = poolArgs(args);
  const nonce = integer(args.nonce, 'nonce', 1);
  return poolCalls(poolContractId, [
    guard(poolContractId, 'cancel_remove', payerId, nonce),
    claim(PSY_CONTRACT_ID, payerId),
  ]);
}

// Converts one of the exact five-call pool stacks above into the seven public
// witness inputs expected by the custom SD-key circuit. A zero fee tells the
// direct wallet client to fill in the actual automatic burn after proving.
export function withPoolSignInputs(callData, feeBurn = 0) {
  integer(feeBurn, 'feeBurn', 0, POOL_FEE_ESCROW);
  if (feeBurn !== 0 && (feeBurn < 1_000_000_000 || (feeBurn - 1_000_000_000) % 1_000 !== 0)) throw new RangeError('invalid DA fee increment');
  const calls = callData?.contract_calls;
  if (!Array.isArray(calls) || calls.length !== 5) throw new RangeError('pool stack needs five explicit calls');
  const guard = calls[0];
  if (!guard || !Array.isArray(guard.inputs)) throw new TypeError('missing pool guard');
  const [payer, a, b, c, nonce] = guard.inputs;
  let branch, x = 0, y = 0, z = 0, orderNonce = 0;
  switch (guard.method_name) {
    case 'swap':
      branch = a === PSY_CONTRACT_ID ? 1 : a === PUSDT_CONTRACT_ID ? 2 : 0;
      [x, y, orderNonce] = [b, c, nonce];
      break;
    case 'refund_unclaimed':
      branch = a === PSY_CONTRACT_ID ? 3 : a === PUSDT_CONTRACT_ID ? 4 : 0;
      x = b;
      break;
    case 'add_liquidity':
      branch = 5;
      [x, y, z, orderNonce] = [a, b, c, nonce];
      break;
    case 'remove_liquidity':
      branch = 6;
      [x, y, z, orderNonce] = [a, b, c, nonce];
      break;
    case 'refund_add_unclaimed':
      branch = a > 0 && b > 0 ? 9 : a > 0 ? 7 : b > 0 ? 8 : 0;
      [x, y] = [a, b];
      break;
    case 'cancel_remove':
      branch = 10;
      orderNonce = a;
      break;
    default:
      throw new RangeError('unsupported pool guard');
  }
  if (!branch) throw new RangeError('invalid asset or refund branch');
  [payer, x, y, z, orderNonce].forEach((value, index) => integer(value, `sign input ${index}`));
  return { contract_calls: calls, software_defined_call: { inputs: [branch, payer, x, y, z, orderNonce, feeBurn] } };
}
