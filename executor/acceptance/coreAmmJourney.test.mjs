import test from 'node:test';
import assert from 'node:assert/strict';
import {coreAmmLpOpen, coreAmmSwapOpen, coreAmmCancelledSwapOpen, coreAmmSwapClaimClose,
  coreAmmRefundClaimClose, planCoreAmmStage} from './coreAmmJourney.mjs';
import {decodeAmount, FEE_ESCROW, swapQuote, losslessJson, parseLosslessJson} from '../../amm/u124/client.mjs';
import {sdkRelease} from '../sdkProfiles.mjs';

const U = 10n ** 18n, release = sdkRelease('sdk-audit-20261102-v1');
const abi = arities => ({contract: {methods: Object.entries(arities).map(([name, input_felt_count], i) =>
  ({name, input_felt_count, method_id: i + 1}))}});
const marketAbi = abi({open_add: 9, open_swap: 8, close_add: 0, close_swap_0: 0,
  request_cancel: 0, authorize_sponsor: 4});
const tokenAbi = abi({set_metadata: 2, set_max_supply: 2, mint: 2, transfer: 3, claim: 1});
const config = {assetA: 41, assetB: 42, networkMagic: '1384803358401154921'};
const policy = {version: 2, market: 'amm', market_id: 1000, config,
  execution_scope: 'explicit-selected-orders-v1', whole_market_completeness: false, qualified_randomness: false,
  native_protocol: 'mainnet-beta-20261027', sdk_commit: release.sdkCommit, client_commit: release.clientCommit,
  chain_root_at1: 'ab'.repeat(32)};
const context = {policy, config, marketId: 1000n, vaultId: 100n, issuerId: 200n, traderId: 201n, marketAbi, tokenAbi};
const quote = swapQuote(U, 20n * U, 20n * U);
const terms = {deadline: 500n, minOut: quote - 1n, reserveA: 20n * U, reserveB: 20n * U, quote};
const methods = plan => plan.contract_calls.map(c => [c.contract_id, c.method_name]);

test('issuer and initial claim plans conserve fixed QA caps without Native burns', () => {
  const p = planCoreAmmStage(context, 'issuer_setup', {symbolA: 123n, symbolB: 124n});
  assert.equal(p.actorId, 200n); assert.equal(p.contract_calls.length, 8);
  for (let i = 0; i < 2; i++) {
    const calls = p.contract_calls.slice(4 * i, 4 * i + 4);
    assert.deepEqual(calls.map(c => c.method_name), ['set_metadata', 'set_max_supply', 'mint', 'transfer']);
    assert.equal(decodeAmount(calls[1].inputs), 200n * U);
    assert.equal(decodeAmount(calls[2].inputs), 200n * U);
    assert.deepEqual(calls[3].inputs.slice(0, 1), [201n]);
    assert.equal(decodeAmount(calls[3].inputs.slice(1)), 100n * U);
  }
  assert.deepEqual(methods(planCoreAmmStage(context, 'trader_claim_assets')), [[41n, 'claim'], [42n, 'claim']]);
  assert.equal(p.unsigned, true); assert.equal(p.liveAccepted, false); assert.equal(p.proofVerified, false);
});

test('activation, LP and sponsor plans retain exact funding and distinct fee ownership', () => {
  const activation = planCoreAmmStage(context, 'activation_funding');
  assert.deepEqual(activation.contract_calls.map(c => c.inputs), [[100n, FEE_ESCROW], [100n, 1n, 0n], [100n, 1n, 0n]]);
  const lp = coreAmmLpOpen(context, {deadline: 500n});
  assert.deepEqual(methods(lp), [[41n, 'claim'], [42n, 'claim'], [1000n, 'open_add'], [0n, 'transfer'], [41n, 'transfer'], [42n, 'transfer']]);
  const inputs = lp.contract_calls[2].inputs;
  assert.equal(decodeAmount(inputs.slice(1, 3)), 20n * U);
  assert.equal(decodeAmount(inputs.slice(3, 5)), 20n * U);
  assert.equal(decodeAmount(inputs.slice(5, 7)), 20n * U - 1000n);
  assert.deepEqual(inputs.slice(7), [500n, 1n]);
  const sponsor = planCoreAmmStage(context, 'sponsor_batch', {nonce: 4n});
  assert.equal(sponsor.actorId, 200n);
  assert.deepEqual(sponsor.contract_calls.map(c => c.inputs), [[100n, 2n * FEE_ESCROW, 4n, 1n], [100n, 2n * FEE_ESCROW]]);
});

test('swap uses caller observations and exact one-unit input, with close before new order', () => {
  const p = coreAmmSwapOpen(context, terms);
  assert.deepEqual(methods(p), [[1000n, 'close_add'], [1000n, 'open_swap'], [0n, 'transfer'], [41n, 'transfer']]);
  const inputs = p.contract_calls[1].inputs;
  assert.equal(decodeAmount(inputs.slice(2, 4)), U);
  assert.equal(decodeAmount(inputs.slice(4, 6)), terms.minOut);
  assert.deepEqual(inputs.slice(6), [500n, 2n]);
  assert.equal(p.observations.trusted, false);
  const parsed = parseLosslessJson(losslessJson({policy, config}));
  assert.deepEqual(coreAmmSwapOpen({...context, ...parsed}, terms), p);
  assert.deepEqual(methods(coreAmmSwapClaimClose(context)), [[42n, 'claim'], [1000n, 'close_swap_0']]);
});

test('cancelled swap and refund claim preserve actual owner and explicit Native pending', () => {
  const p = coreAmmCancelledSwapOpen(context, {...terms, nonce: 3n});
  assert.deepEqual(methods(p), [[1000n, 'open_swap'], [0n, 'transfer'], [41n, 'transfer'], [1000n, 'request_cancel']]);
  assert.equal(p.contract_calls[0].inputs.at(-1), 3n);
  assert.deepEqual(methods(coreAmmRefundClaimClose(context)), [[41n, 'claim'], [1000n, 'close_swap_0']]);
  const refund = coreAmmRefundClaimClose(context, {observedNativePending: FEE_ESCROW});
  assert.deepEqual(methods(refund), [[41n, 'claim'], [0n, 'claim'], [1000n, 'close_swap_0']]);
  assert.ok(refund.contract_calls.every(c => c.inputs.length === 0 || c.inputs[0] === context.vaultId));
  assert.equal(refund.actorId, context.traderId);
});

test('plans reject wrong release/scope/domain/assets/actors and unsupported ordinary ABI', () => {
  for (const patch of [{market: 'orderbook'}, {version: 19}, {execution_scope: 'source-covered'},
    {sdk_commit: '0'.repeat(40)}, {client_commit: '0'.repeat(40)}, {native_protocol: 'legacy-v1'},
    {whole_market_completeness: true}, {qualified_randomness: true}, {chain_root_at1: '0'.repeat(64)}])
    assert.throws(() => coreAmmSwapOpen({...context, policy: {...policy, ...patch}}, terms));
  for (const patch of [{marketId: 1001n}, {traderId: 100n}, {issuerId: 201n}, {sponsorId: 201n},
    {config: {...config, assetA: 43}}, {config: {...config, networkMagic: '1'}},
    {marketAbi: abi({open_swap: 8})}, {tokenAbi: abi({transfer: 2})}])
    assert.throws(() => coreAmmSwapOpen({...context, ...patch}, terms));
});

test('stage bounds reject unsafe quotes, deadlines, nonces and optional Native overclaims', () => {
  for (const patch of [{quote: quote + 1n}, {reserveA: 21n * U + 1n}, {reserveB: 20n * U + 1n},
    {reserveA: 0n}, {minOut: 0n}, {minOut: quote + 1n}, {quote: Number(quote)},
    {deadline: 1n << 32n}, {deadline: 0n}, {nonce: 3n}])
    assert.throws(() => coreAmmSwapOpen(context, {...terms, ...patch}));
  for (const pending of [-1n, FEE_ESCROW + 1n, 1])
    assert.throws(() => coreAmmRefundClaimClose(context, {observedNativePending: pending}));
  assert.throws(() => coreAmmCancelledSwapOpen(context, {...terms, nonce: 2n}));
  assert.throws(() => coreAmmLpOpen(context, {deadline: 1n << 32n}));
  assert.throws(() => planCoreAmmStage(context, 'sponsor_batch', {nonce: 0n}));
  assert.throws(() => planCoreAmmStage(context, 'issuer_setup', {symbolA: 1n, symbolB: 1n}));
  assert.throws(() => planCoreAmmStage(context, 'send'));
});
