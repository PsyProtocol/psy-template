// Pure ordinary-wallet call plans for the bounded QA AMM journey. Observations
// and local arithmetic are not authenticated state, wallet approval, complete
// UPS verification or live acceptance. The contract and SD-key enforce execution.
import assert from 'node:assert/strict';
import {call, encodeAmount, integer, user, FEE_ESCROW, swapQuote} from '../../amm/u124/client.mjs';
import {sponsorCalls, activationFunding} from '../../batching/v2/client.mjs';
import {PROFILE} from '../../batching/mainnet-beta/native.mjs';
import {sdkRelease} from '../sdkProfiles.mjs';

const UNIT = 10n ** 18n, LP = 20n * UNIT, INITIAL = 200n * UNIT, TRANSFER = 100n * UNIT;
const release = sdkRelease('sdk-audit-20261102-v1');
const eq = (a, b, message) => assert.equal(BigInt(a), BigInt(b), message);
function checked(c) {
  const p = c.policy;
  eq(p.version, 2n, 'v2 core policy required');
  assert.equal(p.market, 'amm');
  assert.equal(p.execution_scope, 'explicit-selected-orders-v1');
  assert.equal(p.whole_market_completeness, false);
  assert.equal(p.qualified_randomness, false);
  assert.equal(p.native_protocol, PROFILE);
  assert.equal(p.sdk_commit, release.sdkCommit); assert.equal(p.client_commit, release.clientCommit);
  assert.match(p.chain_root_at1 ?? '', /^[a-f0-9]{64}$/); assert.notEqual(p.chain_root_at1, '0'.repeat(64));
  assert.equal(c.config.networkMagic, '1384803358401154921');
  eq(p.config.networkMagic, c.config.networkMagic, 'policy network domain');
  for (const n of [c.marketId, c.vaultId, c.issuerId, c.traderId, c.sponsorId ?? c.issuerId]) user(n);
  assert.ok(c.marketId >= 5n); eq(p.market_id, c.marketId, 'policy market identity');
  assert.equal(new Set([c.vaultId, c.issuerId, c.traderId]).size, 3, 'distinct vault/issuer/trader');
  const sponsor = c.sponsorId ?? c.issuerId;
  assert.notEqual(sponsor, c.vaultId); assert.notEqual(sponsor, c.traderId, 'sponsor cannot be order member');
  const assets = ['assetA', 'assetB'].map(name => {
    const id = BigInt(c.config[name]); integer(id, (1n << 24n) - 1n);
    assert.ok(id >= 5n); assert.notEqual(id, c.marketId); eq(id, p.config[name], 'policy asset binding'); return id;
  });
  assert.notEqual(assets[0], assets[1]);
  return {...c, sponsorId: sponsor, assets};
}
function planned(c, stage, actorId, contract_calls, observations) {
  assert.ok(contract_calls.length > 0 && contract_calls.length <= 8, 'bounded ordinary call count');
  assert.ok(!contract_calls.some(x => x.contract_id === 0n && ['burn', 'simple_burn'].includes(x.method_name)), 'wallet owns automatic fee');
  return {stage, actorId, contract_calls, unsigned: true, proofVerified: false, liveAccepted: false,
    ...(observations ? {observations} : {})};
}
const market = (c, name, inputs = []) => call(c.marketId, c.marketAbi, name, inputs);
const token = (c, side, name, inputs = []) => call(c.assets[side], c.tokenAbi, name, inputs);
// Claims consume cumulative Outbox deltas, not a caller-selected amount. The
// executing owner must verify those actual deltas before approving this plan.
const claimBoth = (c, from) => [token(c, 0, 'claim', [from]), token(c, 1, 'claim', [from])];
const funding = (c, a, b = 0n) => [
  {contract_id: 0n, method_name: 'transfer', inputs: [c.vaultId, FEE_ESCROW]},
  ...(a ? [token(c, 0, 'transfer', [c.vaultId, encodeAmount(a)])] : []),
  ...(b ? [token(c, 1, 'transfer', [c.vaultId, encodeAmount(b)])] : []),
];
function deadline(n) {integer(n, (1n << 32n) - 1n); assert.ok(n > 0n, 'positive deadline'); return n;}

export function coreAmmLpOpen(context, {deadline: end}) {
  const c = checked(context); deadline(end);
  return planned(c, 'lp_open', c.traderId, [...claimBoth(c, c.vaultId),
    market(c, 'open_add', [c.vaultId, encodeAmount(LP), encodeAmount(LP), encodeAmount(LP - 1000n), end, 1n]),
    ...funding(c, LP, LP)]);
}

function swap(context, terms, cancelled) {
  const c = checked(context), {deadline: end, minOut, reserveA, reserveB, quote} = terms;
  const nonce = cancelled ? 3n : 2n;
  if (terms.nonce !== undefined) assert.equal(terms.nonce, nonce, 'fixed journey order nonce');
  deadline(end);
  for (const n of [minOut, reserveA, reserveB, quote]) {integer(n); assert.ok(n > 0n, 'positive observed quote/reserves/minimum');}
  // The one-unit trade follows a 20/20 initial LP; keep observations inside
  // this QA case's bounds. This comparison does not authenticate the observations.
  assert.ok(reserveA <= LP + UNIT && reserveB <= LP, 'journey reserve cap');
  assert.equal(quote, swapQuote(UNIT, reserveA, reserveB), 'inconsistent observed quote');
  assert.ok(minOut <= quote, 'minimum exceeds observed quote');
  return planned(c, cancelled ? 'cancelled_swap_open' : 'swap_open', c.traderId, [
    ...(!cancelled ? [market(c, 'close_add')] : []),
    market(c, 'open_swap', [c.vaultId, 0n, encodeAmount(UNIT), encodeAmount(minOut), end, nonce]),
    ...funding(c, UNIT), ...(cancelled ? [market(c, 'request_cancel')] : []),
  ], {reserveA, reserveB, quote, minOut, trusted: false});
}
export const coreAmmSwapOpen = (context, terms) => swap(context, terms, false);
export const coreAmmCancelledSwapOpen = (context, terms) => swap(context, terms, true);
export function coreAmmSwapClaimClose(context) {
  const c = checked(context);
  return planned(c, 'swap_claim_close', c.traderId,
    [token(c, 1, 'claim', [c.vaultId]), market(c, 'close_swap_0')]);
}
export function coreAmmRefundClaimClose(context, {observedNativePending = 0n} = {}) {
  const c = checked(context); integer(observedNativePending, FEE_ESCROW);
  return planned(c, 'refund_claim_close', c.traderId, [token(c, 0, 'claim', [c.vaultId]),
    ...(observedNativePending > 0n ? [{contract_id: 0n, method_name: 'claim', inputs: [c.vaultId]}] : []),
    market(c, 'close_swap_0')], {nativePending: observedNativePending, trusted: false});
}

export function planCoreAmmStage(context, stage, terms = {}) {
  if (stage === 'lp_open') return coreAmmLpOpen(context, terms);
  if (stage === 'swap_open') return coreAmmSwapOpen(context, terms);
  if (stage === 'cancelled_swap_open') return coreAmmCancelledSwapOpen(context, terms);
  if (stage === 'swap_claim_close') return coreAmmSwapClaimClose(context);
  if (stage === 'refund_claim_close') return coreAmmRefundClaimClose(context, terms);
  const c = checked(context);
  if (stage === 'trader_claim_assets') return planned(c, stage, c.traderId, claimBoth(c, c.issuerId));
  if (stage === 'activation_funding') return planned(c, stage, c.traderId,
    activationFunding({market: 'amm', config: c.config, tokenAbi: c.tokenAbi, vaultId: c.vaultId, nativeProtocol: PROFILE}));
  if (stage === 'sponsor_batch') {
    integer(terms.nonce, (1n << 62n) - 1n); assert.ok(terms.nonce > 0n);
    return planned(c, stage, c.sponsorId, sponsorCalls({marketId: c.marketId, abi: c.marketAbi,
      vaultId: c.vaultId, nonce: terms.nonce, purpose: 1n, amount: 2n * FEE_ESCROW, nativeProtocol: PROFILE}));
  }
  if (stage === 'issuer_setup') {
    for (const n of [terms.symbolA, terms.symbolB]) {integer(n, (1n << 32n) - 1n); assert.ok(n > 0n);}
    assert.notEqual(terms.symbolA, terms.symbolB, 'distinct fixed QA symbols');
    const calls = [terms.symbolA, terms.symbolB].flatMap((symbol, side) => [
      token(c, side, 'set_metadata', [symbol, 18n]), token(c, side, 'set_max_supply', [encodeAmount(INITIAL)]),
      token(c, side, 'mint', [encodeAmount(INITIAL)]), token(c, side, 'transfer', [c.traderId, encodeAmount(TRANSFER)]),
    ]);
    return planned(c, stage, c.issuerId, calls);
  }
  throw Error('unknown bounded core AMM journey stage');
}
