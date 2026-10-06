import { graduationAmounts, validateCurve } from '../bondingcurve/curveMath.mjs';
import { quoteInitialLiquidity } from '../amm/referenceMath.mjs';
export const POOL_FEE_ESCROW = 1_000_100_000;
export const POOL_AMOUNT_CAP = 10_000_000;
export function validateConfig(config) {
  for (const key of ['poolContractId','tokenId','curveContractId']) if (!Number.isSafeInteger(config[key]) || config[key] < 5) throw new RangeError('invalid '+key);
  if (new Set([config.poolContractId,config.tokenId,config.curveContractId]).size !== 3) throw new RangeError('contract IDs must differ');
  for (const key of ['poolUserId','issuerId','curveVaultId']) if (!Number.isSafeInteger(config[key]) || config[key] < 1 || config[key] >= 16_777_216) throw new RangeError('invalid '+key);
  if (new Set([config.poolUserId,config.issuerId,config.curveVaultId]).size !== 3) throw new RangeError('user IDs must differ');
  for (const key of ['psyUnit','tokenUnit']) if (!Number.isSafeInteger(config[key]) || config[key] < 1 || config[key] > 100_000_000) throw new RangeError('invalid '+key);
  return Object.freeze({...config});
}
export function createPoolCalls(inputConfig) {
const config = validateConfig(inputConfig);
const PSY_CONTRACT_ID = 0;
const TOKEN_CONTRACT_ID = config.tokenId;
function payPsy(recipient, principal) { return call(0, 'simple_transfer', recipient, principal * config.psyUnit + POOL_FEE_ESCROW); }
const USER_ID_LIMIT = 16_777_216;

function integer(value, name, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function poolArgs(args) {
  const poolContractId = config.poolContractId;
  const poolUserId = config.poolUserId;
  const payerId = integer(args.payerId, 'payerId', 1, USER_ID_LIMIT - 1);
  if (poolUserId === payerId) throw new RangeError('payer and pool must differ');
  return { poolContractId, poolUserId, payerId };
}

function amount(value, name) {
  return integer(value, name, 1, POOL_AMOUNT_CAP);
}

function token(asset) {
  if (asset !== PSY_CONTRACT_ID && asset !== TOKEN_CONTRACT_ID) throw new RangeError('asset must be PSY or the configured launch token');
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
  return call(asset, asset === 0 ? 'simple_claim' : 'claim', payer);
}

function transfer(asset, recipient, value) {
  return call(asset, asset === 0 ? 'simple_transfer' : 'transfer', recipient, value * (asset === 0 ? config.psyUnit : config.tokenUnit));
}

// Submit with the payer's ordinary private key. The payer's automatic network
// fee burn is separate and is appended by the wallet.
function openSwapCalls(args) {
  const { poolContractId, poolUserId } = poolArgs(args);
  const asset = token(args.asset);
  const amountIn = amount(args.amountIn, 'amountIn');
  const minOut = amount(args.minOut, 'minOut');
  const deadline = integer(args.deadline, 'deadline', 1);
  const nonce = integer(args.nonce, 'nonce', 1);
  const calls = [guard(poolContractId, 'open_swap', poolUserId, asset, amountIn, minOut, deadline, nonce)];
  if (asset === PSY_CONTRACT_ID) {
    calls.push(payPsy(poolUserId, amountIn));
  } else {
    calls.push(transfer(TOKEN_CONTRACT_ID, poolUserId, amountIn));
    calls.push(payPsy(poolUserId, 0));
  }
  return { contract_calls: calls };
}

// Submit from the pool account only with the custom SD-key policy. The wallet
// appends its PSY simple_burn call; the fingerprint must constrain that call.
function settleSwapCalls(args) {
  const { poolContractId, payerId } = poolArgs(args);
  const asset = token(args.asset);
  const amountIn = amount(args.amountIn, 'amountIn');
  const amountOut = amount(args.amountOut, 'amountOut');
  const nonce = integer(args.nonce, 'nonce', 1);
  const calls = [guard(poolContractId, 'swap', payerId, asset, amountIn, amountOut, nonce)];
  calls.push(claim(PSY_CONTRACT_ID, payerId));
  if (asset === TOKEN_CONTRACT_ID) calls.push(claim(TOKEN_CONTRACT_ID, payerId));
  calls.push(transfer(asset === PSY_CONTRACT_ID ? TOKEN_CONTRACT_ID : PSY_CONTRACT_ID, payerId, amountOut));
  return poolCalls(poolContractId, calls);
}

function refundSwapCalls(args) {
  const { poolContractId, payerId } = poolArgs(args);
  const asset = token(args.asset);
  const value = amount(args.amount, 'amount');
  const calls = [guard(poolContractId, 'refund_unclaimed', payerId, asset, value), claim(PSY_CONTRACT_ID, payerId)];
  if (asset === TOKEN_CONTRACT_ID) calls.push(claim(TOKEN_CONTRACT_ID, payerId));
  calls.push(transfer(asset, payerId, value));
  return poolCalls(poolContractId, calls);
}

function openAddCalls(args) {
  const { poolContractId, poolUserId } = poolArgs(args);
  const amountPsy = amount(args.amountPsy, 'amountPsy');
  const amountToken = amount(args.amountToken, 'amountToken');
  const minShares = amount(args.minShares, 'minShares');
  const deadline = integer(args.deadline, 'deadline', 1);
  const nonce = integer(args.nonce, 'nonce', 1);
  return { contract_calls: [
    guard(poolContractId, 'open_add', poolUserId, amountPsy, amountToken, minShares, deadline, nonce),
    payPsy(poolUserId, amountPsy),
    transfer(TOKEN_CONTRACT_ID, poolUserId, amountToken),
  ] };
}

function settleAddCalls(args) {
  const { poolContractId, payerId } = poolArgs(args);
  const amountPsy = amount(args.amountPsy, 'amountPsy');
  const amountToken = amount(args.amountToken, 'amountToken');
  const minted = amount(args.minted, 'minted');
  const nonce = integer(args.nonce, 'nonce', 1);
  return poolCalls(poolContractId, [
    guard(poolContractId, 'add_liquidity', payerId, amountPsy, amountToken, minted, nonce),
    claim(PSY_CONTRACT_ID, payerId), claim(TOKEN_CONTRACT_ID, payerId),
  ]);
}

function refundAddCalls(args) {
  const { poolContractId, payerId } = poolArgs(args);
  const amountPsy = integer(args.amountPsy, 'amountPsy', 0, POOL_AMOUNT_CAP);
  const amountToken = integer(args.amountToken, 'amountToken', 0, POOL_AMOUNT_CAP);
  if (amountPsy === 0 && amountToken === 0) throw new RangeError('at least one deposit leg must be present');
  const calls = [guard(poolContractId, 'refund_add_unclaimed', payerId, amountPsy, amountToken), claim(PSY_CONTRACT_ID, payerId)];
  if (amountToken > 0) calls.push(claim(TOKEN_CONTRACT_ID, payerId));
  if (amountPsy > 0) calls.push(transfer(PSY_CONTRACT_ID, payerId, amountPsy));
  if (amountToken > 0) calls.push(transfer(TOKEN_CONTRACT_ID, payerId, amountToken));
  return poolCalls(poolContractId, calls);
}

function openRemoveCalls(args) {
  const { poolContractId, poolUserId } = poolArgs(args);
  const shares = amount(args.shares, 'shares');
  const minPsy = amount(args.minPsy, 'minPsy');
  const minToken = amount(args.minToken, 'minToken');
  const deadline = integer(args.deadline, 'deadline', 1);
  const nonce = integer(args.nonce, 'nonce', 1);
  return { contract_calls: [
    guard(poolContractId, 'open_remove', poolUserId, shares, minPsy, minToken, deadline, nonce),
    payPsy(poolUserId, 0),
  ] };
}

// The payer signs this after the pool's guarded cursors cover every payment
// belonging to the previous order. Closing releases the one-order-per-user slot; the next
// opening must use a strictly higher nonce.
function closeOrderCalls(args) {
  const { poolContractId } = poolArgs(args);
  let method;
  if (args.kind === 'swap') {
    method = token(args.asset) === PSY_CONTRACT_ID ? 'close_psy_swap' : 'close_token_swap';
  } else if (args.kind === 'add') {
    method = 'close_add';
  } else if (args.kind === 'remove') {
    method = 'close_remove';
  } else {
    throw new RangeError('kind must be swap, add, or remove');
  }
  return { contract_calls: [guard(poolContractId, method)] };
}

function settleRemoveCalls(args) {
  const { poolContractId, payerId } = poolArgs(args);
  const shares = amount(args.shares, 'shares');
  const amountPsy = amount(args.amountPsy, 'amountPsy');
  const amountToken = amount(args.amountToken, 'amountToken');
  const nonce = integer(args.nonce, 'nonce', 1);
  return poolCalls(poolContractId, [
    guard(poolContractId, 'remove_liquidity', payerId, shares, amountPsy, amountToken, nonce),
    claim(PSY_CONTRACT_ID, payerId),
    transfer(PSY_CONTRACT_ID, payerId, amountPsy),
    transfer(TOKEN_CONTRACT_ID, payerId, amountToken),
  ]);
}

// Converts one of the exact five-call pool stacks above into the seven public
// witness inputs expected by the custom SD-key circuit. A zero fee tells the
// direct wallet client to fill in the actual automatic burn after proving.
function withPoolSignInputs(callData, feeBurn = 0) {
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
      branch = a === PSY_CONTRACT_ID ? 1 : a === TOKEN_CONTRACT_ID ? 2 : 0;
      [x, y, orderNonce] = [b, c, nonce];
      break;
    case 'refund_unclaimed':
      branch = a === PSY_CONTRACT_ID ? 3 : a === TOKEN_CONTRACT_ID ? 4 : 0;
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
    default:
      throw new RangeError('unsupported pool guard');
  }
  if (!branch) throw new RangeError('invalid asset or refund branch');
  [payer, x, y, z, orderNonce].forEach((value, index) => integer(value, `sign input ${index}`));
  return { contract_calls: calls, software_defined_call: { inputs: [branch, payer, x, y, z, orderNonce, feeBurn] } };
}

function fundSeedFeeCalls() { return {contract_calls:[payPsy(config.poolUserId,0)]}; }
function cancelRemoveCalls(args) {
 const {poolContractId,payerId}=poolArgs(args);const nonce=integer(args.nonce,'nonce',1);
 return {...poolCalls(poolContractId,[guard(poolContractId,'cancel_remove',payerId,nonce),claim(0,payerId)]),software_defined_call:{inputs:[11,payerId,0,0,0,nonce,0]}};
}
function seedFromCurveCalls({launch,soldLots}) {
  if (launch.tokenId!==config.tokenId || launch.issuerId!==config.issuerId || launch.targetId!==config.poolUserId) throw new Error('launch binding mismatch');
  const amounts=graduationAmounts(validateCurve(launch),BigInt(integer(soldLots,'soldLots',1)));
  if (amounts.psyAmount%BigInt(config.psyUnit) || amounts.tokenAmount%BigInt(config.tokenUnit)) throw new Error('inexact graduation units');
  const x=Number(amounts.psyAmount/BigInt(config.psyUnit)),y=Number(amounts.tokenAmount/BigInt(config.tokenUnit));
  amount(x,'PSY reserve units');amount(y,'token reserve units');
  const minted=Number(quoteInitialLiquidity({amountPsy:BigInt(x),amountUsdt:BigInt(y)}).providerShares);
  return {...poolCalls(config.poolContractId,[
    guard(config.poolContractId,'seed_from_curve',config.curveContractId,config.curveVaultId,config.tokenId,config.issuerId,config.psyUnit,config.tokenUnit,x,y,minted),
    claim(0,config.curveVaultId),claim(config.tokenId,config.curveVaultId),claim(0,config.issuerId),
  ]),software_defined_call:{inputs:[10,config.issuerId,x,y,minted,0,0]}};
}
return Object.freeze({openSwapCalls,settleSwapCalls,refundSwapCalls,openAddCalls,settleAddCalls,refundAddCalls,openRemoveCalls,closeOrderCalls,settleRemoveCalls,withPoolSignInputs,seedFromCurveCalls,fundSeedFeeCalls,cancelRemoveCalls,config});
}
