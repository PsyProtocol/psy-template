import { FEE_ESCROW, graduationAmounts, quoteBuy, quoteSell, validateCurve } from './curveMath.mjs';

export const PSY = 0;
const USER_MAX = 16_777_215;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function integer(value, name, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`${name} is out of range`);
  return value;
}

function asNumber(value, name) {
  if (value < 0n || value > MAX_SAFE) throw new RangeError(`${name} exceeds exact JSON integer range`);
  return Number(value);
}

function ids(args) {
  const contractId = integer(args.contractId, 'contractId', 5);
  const tokenId = integer(args.tokenId, 'tokenId', 5);
  const vaultId = integer(args.vaultId, 'vaultId', 1, USER_MAX);
  const issuerId = integer(args.issuerId, 'issuerId', 1, USER_MAX);
  const targetId = integer(args.targetId, 'targetId', 1, USER_MAX);
  if (tokenId === contractId || new Set([vaultId, issuerId, targetId]).size !== 3) throw new RangeError('invalid distinct contract and user IDs');
  return { contractId, tokenId, vaultId, issuerId, targetId };
}

const call = (contract_id, method_name, ...inputs) => ({ contract_id, method_name, inputs });
const transfer = (tokenId, recipient, amount) => call(tokenId, tokenId === PSY ? 'simple_transfer' : 'transfer', recipient, amount);
const claim = (tokenId, sender) => call(tokenId, tokenId === PSY ? 'simple_claim' : 'claim', sender);

function padded(contractId, calls) {
  while (calls.length < 6) calls.push(call(contractId, 'noop'));
  if (calls.length !== 6) throw new RangeError('vault stack must contain six explicit calls');
  return { contract_calls: calls };
}

function payer(args) {
  const { vaultId } = ids(args);
  const payerId = integer(args.payerId, 'payerId', 1, USER_MAX);
  if (payerId === vaultId) throw new RangeError('payer cannot be vault');
  return payerId;
}

function order(args) {
  const c = validateCurve(args);
  const sold = BigInt(integer(args.expectedSold, 'expectedSold', 0, asNumber(c.maxLots, 'maxLots')));
  const lots = BigInt(integer(args.lots, 'lots', 1, asNumber(c.maxLots, 'maxLots')));
  const deadline = integer(args.deadline, 'deadline', 1);
  const nonce = integer(args.nonce, 'nonce', 1);
  return { c, sold, lots, deadline, nonce };
}

// Signed issuer funding, before the public SD-key initialization stack.
export function fundInventoryCalls(args) {
  const { tokenId, vaultId } = ids(args);
  const c = validateCurve(args);
  return { contract_calls: [
    transfer(tokenId, vaultId, asNumber((c.maxLots + c.liquidityLots) * c.lotSize, 'inventory')),
    transfer(PSY, vaultId, Number(FEE_ESCROW)),
  ] };
}

export function initializeCalls(args) {
  const { contractId, tokenId, issuerId, targetId } = ids(args);
  const c = validateCurve(args);
  return padded(contractId, [
    call(contractId, 'initialize', tokenId, issuerId, targetId,
      asNumber(c.maxLots, 'maxLots'), asNumber(c.liquidityLots, 'liquidityLots'),
      asNumber(c.lotSize, 'lotSize'), asNumber(c.basePrice, 'basePrice'),
      asNumber(c.stepPrice, 'stepPrice'), asNumber(c.thresholdLots, 'thresholdLots')),
    claim(tokenId, issuerId), claim(PSY, issuerId),
  ]);
}

export function openBuyCalls(args) {
  const { contractId, vaultId } = ids(args);
  payer(args);
  const { c, sold, lots, deadline, nonce } = order(args);
  const { cost } = quoteBuy(c, sold, lots);
  return { quote: asNumber(cost, 'cost'), contract_calls: [
    call(contractId, 'open_buy', vaultId, asNumber(lots, 'lots'), asNumber(sold, 'expectedSold'), asNumber(cost, 'cost'), deadline, nonce),
    transfer(PSY, vaultId, asNumber(cost + FEE_ESCROW, 'buy payment')),
  ] };
}

export function openSellCalls(args) {
  const { contractId, tokenId, vaultId } = ids(args);
  payer(args);
  const { c, sold, lots, deadline, nonce } = order(args);
  const { payout, tokenAmount } = quoteSell(c, sold, lots);
  return { quote: asNumber(payout, 'payout'), contract_calls: [
    call(contractId, 'open_sell', vaultId, asNumber(lots, 'lots'), asNumber(sold, 'expectedSold'), asNumber(payout, 'payout'), deadline, nonce),
    transfer(tokenId, vaultId, asNumber(tokenAmount, 'token payment')),
    transfer(PSY, vaultId, Number(FEE_ESCROW)),
  ] };
}

export function closeOrderCalls(args) {
  const { contractId } = ids(args);
  payer(args);
  if (args.kind !== 'buy' && args.kind !== 'sell') throw new RangeError('kind must be buy or sell');
  return { contract_calls: [call(contractId, args.kind === 'buy' ? 'close_buy' : 'close_sell')] };
}

export function settleBuyCalls(args) {
  const { contractId, tokenId } = ids(args);
  const payerId = payer(args);
  const { c, sold, lots, nonce } = order(args);
  const { cost, tokenAmount } = quoteBuy(c, sold, lots);
  return padded(contractId, [
    call(contractId, 'settle_buy', payerId, asNumber(lots, 'lots'), asNumber(cost, 'cost'), nonce),
    claim(PSY, payerId), transfer(tokenId, payerId, asNumber(tokenAmount, 'token output')),
  ]);
}

export function settleSellCalls(args) {
  const { contractId, tokenId } = ids(args);
  const payerId = payer(args);
  const { c, sold, lots, nonce } = order(args);
  const { payout } = quoteSell(c, sold, lots);
  return padded(contractId, [
    call(contractId, 'settle_sell', payerId, asNumber(lots, 'lots'), asNumber(payout, 'payout'), nonce),
    claim(tokenId, payerId), claim(PSY, payerId), transfer(PSY, payerId, asNumber(payout, 'payout')),
  ]);
}

export function refundBuyCalls(args) {
  const { contractId } = ids(args);
  const payerId = payer(args);
  const { lots, nonce } = order(args);
  const cost = integer(args.quotedPsy, 'quotedPsy', 1, 6_000_000_000_000_000);
  return padded(contractId, [
    call(contractId, 'refund_buy', payerId, asNumber(lots, 'lots'), cost, nonce),
    claim(PSY, payerId), transfer(PSY, payerId, cost),
  ]);
}

export function refundSellCalls(args) {
  const { contractId, tokenId } = ids(args);
  const payerId = payer(args);
  const { c, sold, lots, nonce } = order(args);
  const { tokenAmount } = quoteSell(c, sold, lots);
  return padded(contractId, [
    call(contractId, 'refund_sell', payerId, asNumber(lots, 'lots'), nonce),
    claim(tokenId, payerId), claim(PSY, payerId), transfer(tokenId, payerId, asNumber(tokenAmount, 'refund')),
  ]);
}

export function fundGraduationFeeCalls(args) {
  const { vaultId } = ids(args);
  return { contract_calls: [transfer(PSY, vaultId, Number(FEE_ESCROW))] };
}

export function graduateCalls(args) {
  const { contractId, tokenId, issuerId, targetId } = ids(args);
  const c = validateCurve(args);
  const sold = BigInt(integer(args.soldLots, 'soldLots', asNumber(c.thresholdLots, 'thresholdLots'), asNumber(c.maxLots, 'maxLots')));
  const { psyAmount, tokenAmount } = graduationAmounts(c, sold);
  return padded(contractId, [
    call(contractId, 'graduate', targetId, asNumber(psyAmount, 'PSY reserve'), asNumber(tokenAmount, 'token inventory')),
    claim(PSY, issuerId), transfer(PSY, targetId, asNumber(psyAmount, 'PSY reserve')),
    transfer(tokenId, targetId, asNumber(tokenAmount, 'token inventory')),
  ]);
}

// Six public inputs: branch, actor, lots/token units, quote/PSY reserve,
// nonce, actual fee burn. The wallet replaces a zero fee after proving.
export function withVaultSignInputs(callData, feeBurn = 0) {
  integer(feeBurn, 'feeBurn', 0, Number(FEE_ESCROW));
  if (feeBurn && (feeBurn < 1_000_000_000 || (feeBurn - 1_000_000_000) % 1_000)) throw new RangeError('invalid fee burn');
  const calls = callData?.contract_calls;
  if (!Array.isArray(calls) || calls.length !== 6) throw new RangeError('vault stack needs six explicit calls');
  const first = calls[0];
  let inputs;
  switch (first.method_name) {
    case 'initialize': inputs = [1, 0, 0, 0, 0, feeBurn]; break;
    case 'settle_buy': inputs = [2, ...first.inputs, feeBurn]; break;
    case 'settle_sell': inputs = [3, ...first.inputs, feeBurn]; break;
    case 'refund_buy': inputs = [4, ...first.inputs, feeBurn]; break;
    case 'refund_sell': inputs = [5, first.inputs[0], first.inputs[1], 0, first.inputs[2], feeBurn]; break;
    case 'graduate': inputs = [6, 0, first.inputs[2], first.inputs[1], 0, feeBurn]; break;
    default: throw new RangeError('unsupported vault guard');
  }
  if (inputs.length !== 6) throw new RangeError('invalid vault sign inputs');
  return { contract_calls: calls, software_defined_call: { inputs } };
}
