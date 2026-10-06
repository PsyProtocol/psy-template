export const PSY = 0;
export const PUSDT = 4;
export const FEE_ESCROW = 1_000_100_000;
export const AMOUNT_CAP = 10_000_000;
const USER_CAP = 16_777_215;

function integer(value, label, min, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function ids(args) {
  const contractId = integer(args.contractId, 'contractId', 5);
  const escrowId = integer(args.escrowId, 'escrowId', 1, USER_CAP);
  return { contractId, escrowId };
}

function seller(value, escrowId) {
  integer(value, 'sellerId', 1, USER_CAP);
  if (value === escrowId) throw new RangeError('seller and escrow must differ');
  return value;
}

function amount(value, label) {
  return integer(value, label, 1, AMOUNT_CAP);
}

function asset(value) {
  if (value !== PSY && value !== PUSDT) throw new RangeError('asset must be PSY or pUSDT');
  return value;
}

const call = (contract_id, method_name, ...inputs) => ({ contract_id, method_name, inputs });
const claim = (assetId, from) => call(assetId, 'simple_claim', from);
const transfer = (assetId, to, value) => call(assetId, 'simple_transfer', to, value);

function pad(contractId, calls) {
  while (calls.length < 6) calls.push(call(contractId, 'noop'));
  if (calls.length !== 6) throw new RangeError('escrow stack must have six calls before fee burn');
  return { contract_calls: calls };
}

// Payer signs this entire opening stack with an ordinary private key.
export function openSellCalls(args) {
  const { contractId, escrowId } = ids(args);
  const sellerId = seller(args.sellerId, escrowId);
  const sellAsset = asset(args.sellAsset);
  const sellAmount = amount(args.sellAmount, 'sellAmount');
  const minBuy = amount(args.minBuy, 'minBuy');
  const deadline = integer(args.deadline, 'deadline', 1);
  const nonce = integer(args.nonce, 'nonce', 1);
  const calls = [call(contractId, 'open_sell', escrowId, sellAsset, sellAmount, minBuy, deadline, nonce)];
  if (sellAsset === PSY) {
    calls.push(transfer(PSY, escrowId, sellAmount + FEE_ESCROW));
  } else {
    calls.push(transfer(PUSDT, escrowId, sellAmount));
    calls.push(transfer(PSY, escrowId, FEE_ESCROW));
  }
  return { sellerId, contract_calls: calls };
}

export function closeOrderCalls(args) {
  const { contractId, escrowId } = ids(args);
  seller(args.sellerId, escrowId);
  const sellAsset = asset(args.sellAsset);
  return { contract_calls: [call(contractId, sellAsset === PSY ? 'close_psy_order' : 'close_usdt_order')] };
}

// Public SD-key escrow executes these complete stacks only after the contract
// guard checks both limit prices, both order nonces, and exact Outbox deltas.
export function matchCalls(args) {
  const { contractId, escrowId } = ids(args);
  const psySeller = seller(args.psySeller, escrowId);
  const usdtSeller = seller(args.usdtSeller, escrowId);
  if (psySeller === usdtSeller) throw new RangeError('match needs distinct sellers');
  const amountPsy = amount(args.amountPsy, 'amountPsy');
  const amountUsdt = amount(args.amountUsdt, 'amountUsdt');
  const psyNonce = integer(args.psyNonce, 'psyNonce', 1);
  const usdtNonce = integer(args.usdtNonce, 'usdtNonce', 1);
  return pad(contractId, [
    call(contractId, 'match_orders', psySeller, usdtSeller, amountPsy, amountUsdt, psyNonce, usdtNonce),
    claim(PSY, psySeller),
    claim(PSY, usdtSeller),
    claim(PUSDT, usdtSeller),
    transfer(PSY, usdtSeller, amountPsy + FEE_ESCROW),
    transfer(PUSDT, psySeller, amountUsdt),
  ]);
}

export function cancelCalls(args) {
  const { contractId, escrowId } = ids(args);
  const sellerId = seller(args.sellerId, escrowId);
  const sellAsset = asset(args.sellAsset);
  const sellAmount = amount(args.sellAmount, 'sellAmount');
  const nonce = integer(args.nonce, 'nonce', 1);
  const calls = [
    call(contractId, sellAsset === PSY ? 'cancel_psy_order' : 'cancel_usdt_order', sellerId, sellAmount, nonce),
    claim(PSY, sellerId),
  ];
  if (sellAsset === PUSDT) calls.push(claim(PUSDT, sellerId));
  calls.push(transfer(sellAsset, sellerId, sellAmount));
  return pad(contractId, calls);
}

// Eight public witness inputs: branch, PSY seller/seller, pUSDT seller/zero,
// PSY amount/sell amount, pUSDT amount/zero, two nonces, measured fee burn.
export function withEscrowSignInputs(callData, feeBurn = 0) {
  integer(feeBurn, 'feeBurn', 0, FEE_ESCROW);
  if (feeBurn && (feeBurn < 1_000_000_000 || (feeBurn - 1_000_000_000) % 1_000)) {
    throw new RangeError('invalid fee burn');
  }
  const calls = callData?.contract_calls;
  if (!Array.isArray(calls) || calls.length !== 6) throw new RangeError('escrow stack needs six explicit calls');
  const guard = calls[0];
  let inputs;
  if (guard.method_name === 'match_orders') {
    inputs = [1, ...guard.inputs, feeBurn];
  } else if (guard.method_name === 'cancel_psy_order' || guard.method_name === 'cancel_usdt_order') {
    const [who, sellAmount, nonce] = guard.inputs;
    inputs = [guard.method_name === 'cancel_psy_order' ? 2 : 3, who, 0, sellAmount, 0, nonce, 0, feeBurn];
  } else throw new RangeError('unsupported escrow guard');
  if (inputs.length !== 8 || inputs[0] === 0) throw new RangeError('invalid escrow sign inputs');
  return { contract_calls: calls, software_defined_call: { inputs } };
}
