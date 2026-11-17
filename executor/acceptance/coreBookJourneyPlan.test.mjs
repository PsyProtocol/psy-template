// Host-only call/plan reconstruction. No actual bytecode, Native proof, network
// identity, registered key, funds, complete UPS or financial acceptance is implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCoreBookAcceptancePlan, CORE_BOOK_UNIT as U} from './coreBookJourneyPlan.mjs';
import {readReviewedAbis} from '../../tests/fixtures/reviewedAbis.mjs';
import {generateBatch, methodSpans} from '../../batching/v2/generate.mjs';
import {makeCoreBookPolicy} from '../../orderbook/u124/core-build.mjs';
import {orderbookSellCalls} from '../../orderbook/u124/coreClient.mjs';
import {bindCoreDependencies} from '../coreDependencyPolicy.mjs';
import {planSettlement, settlementFields} from '../../batching/v2/planner.mjs';
import {operationCalls} from '../../batching/v2/policy.mjs';
import {encodeAmount, FEE_ESCROW as F} from '../../amm/u124/client.mjs';

function fixture() {
  const abis = readReviewedAbis().admission;
  const old = structuredClone(abis.markets.orderbook);
  const config = Object.fromEntries(['assetA', 'assetB', 'networkMagic'].map(key => [key, old.config[key]]));
  const names = new Set(methodSpans(generateBatch('orderbook', config)).map(method => method.name));
  const marketAbi = old.artifact.abi;
  marketAbi.contract.methods = marketAbi.contract.methods.filter(method => names.has(method.name));
  const tokenAbi = structuredClone(abis.token.abi), marketId = 1000n;
  const base = makeCoreBookPolicy(Number(marketId), config, {state_tree_height: 31, abi: marketAbi}, {abi: tokenAbi}, 'ab'.repeat(32));
  const dependencies = [0, config.assetA, config.assetB, Number(marketId)].sort((a, b) => a - b).map(contractId => ({contractId,
    deployer: contractId ? 201 : 0, codeRoot: '11'.repeat(32), layoutRoot: '22'.repeat(32), functionTreeRoot: '33'.repeat(32),
    stateTreeHeight: contractId ? 31 : 32, layoutFieldCount: 1, layoutSlotCount: 1}));
  return {profile: 'book-core-dependency-bound-v1', marketId, marketAbi, tokenAbi, tokenBAbi: structuredClone(tokenAbi), config,
    policy: bindCoreDependencies(base, dependencies),
    vault: {userId: 100n, publicKeyHash: '11'.repeat(32), fingerprint: '55'.repeat(32), keyProfile: 'selected-dependency-bound-v1'},
    seller: {userId: 201n, publicKeyHash: '22'.repeat(32)}, buyer: {userId: 202n, publicKeyHash: '33'.repeat(32)},
    sponsor: {userId: 203n, publicKeyHash: '44'.repeat(32)},
    assets: [config.assetA, config.assetB].map(contractId => ({contractId, decimals: 18, issuerId: 201n, kind: 'qa-ft'}))};
}
const build = context => buildCoreBookAcceptancePlan(context, {deadline: 1000n});
const row = (c, owner, side, {minimum = U, nonce = 1n, cancelled = 0n, checkpoint = 90n} = {}) => ({owner,
  kind: 1n, side, x: U, y: minimum, nonce, cancelled, deadline: 1000n, pool: c.vault.userId,
  paid_a: side === 0n ? U : 0n, paid_b: side === 1n ? U : 0n, fee_delta: F, fee_sent: F,
  order_checkpoint: checkpoint, done: 0n});
function settlement(c, rows) {
  const padded = [...rows, ...Array.from({length: 4 - rows.length}, () => ({owner: 0n, done: 0n}))];
  const context = {market: 'orderbook', policy: c.policy, config: c.config, rows: padded, cutoff: 100n, pool: {}, batch: 1n, root: [1n, 2n, 3n, 4n]};
  const fields = settlementFields(context); fields[73] = 1000000000n; // Test-only explicit valid fee; real worker computes its actual fee.
  return {plan: planSettlement(context), calls: operationCalls(c.policy, fields)};
}

test('unsigned Book plan has exact ordered stages, caller identities and bounded selected scope', () => {
  const c = fixture(), p = build(c);
  assert.equal(p.executionAuthorized, false); assert.equal(p.requiresBudgetDeclaration, true);
  assert.deepEqual(p.requiredUps, {ordinary: 15, formal: 7, total: 22});
  assert.deepEqual(p.policyCapacity, {members: 4, matchedPairs: 2});
  assert.deepEqual(p.plannedCapacity, {members: 2, matchedPairs: 1});
  for (let i = 0; i < p.stages.length; i++) assert.equal(p.stages[i].dependsOnConfirmed, i ? p.stages[i - 1].label : null);
  assert.equal(p.stages.length, 22); assert.equal(new Set(p.stages.map(stage => stage.label)).size, 22);
  assert.equal(p.stages.filter(stage => stage.kind === 'ordinary').length, 15);
  assert.ok(p.stages.every(stage => stage.unsigned && !stage.proofVerified && !stage.liveAccepted && stage.requireFreshAccountNonceAndState));
  assert.deepEqual(p.amount, {baseUnits: U, limbs: encodeAmount(U), decimals: 18});
  const opens = p.stages.filter(stage => /-open-v1$/.test(stage.label));
  assert.deepEqual(opens.map(stage => [stage.actorId, stage.contract_calls[0].inputs]), [
    [201n, [100n, 0n, ...encodeAmount(U), ...encodeAmount(U), 1000n, 1n]],
    [202n, [100n, 1n, ...encodeAmount(U), ...encodeAmount(U), 1000n, 1n]],
    [201n, [100n, 0n, ...encodeAmount(U), ...encodeAmount(2n * U), 1000n, 2n]],
    [202n, [100n, 1n, ...encodeAmount(U), ...encodeAmount(U), 1000n, 2n]],
  ]);
  const sponsors = p.stages.filter(stage => stage.sponsorshipNonce);
  assert.deepEqual(sponsors.map(stage => [stage.actorId, stage.sponsorshipNonce]), [[203n, 1n], [203n, 2n], [203n, 3n]]);
  for (const stage of sponsors) {
    assert.deepEqual(stage.contract_calls[0].inputs, [100n, 2n * F, stage.sponsorshipNonce, 1n]);
    assert.deepEqual(stage.contract_calls[1].inputs, [100n, 2n * F]);
  }
  assert.ok(p.stages.filter(stage => stage.kind === 'formal-core').every(stage => stage.actorId === 100n && stage.requireDependencyOpening));
  assert.match(p.scope, /within the frozen selected set only/);
  c.policy.dependency_bindings[0].codeRoot = '66'.repeat(32);
  assert.equal(p.policy.dependency_bindings[0].codeRoot, '11'.repeat(32), 'returned policy detached from caller mutation');
});

test('existing planner and canonical 40-call stack produce exact match then legal carry then complete refunds', () => {
  const c = fixture();
  const match = settlement(c, [row(c, 201n, 0n), row(c, 202n, 1n)]);
  assert.deepEqual(match.plan.terminal, [201n, 202n]); assert.equal(match.calls.length, 40);
  assert.deepEqual(match.calls.filter(call => call.method_name === 'match_orders').map(call => call.inputs),
    [[201n, 202n, ...encodeAmount(U), ...encodeAmount(U), 1n, 1n]]);
  assert.deepEqual(match.calls.filter(call => call.method_name === 'transfer' && call.contract_id !== 0n).map(call => [call.contract_id, call.inputs]),
    [[BigInt(c.config.assetA), [202n, ...encodeAmount(U)]], [BigInt(c.config.assetB), [201n, ...encodeAmount(U)]]]);
  assert.ok(match.calls.some(call => call.contract_id === 0n && call.method_name === 'transfer' && call.inputs[0] === 202n && call.inputs[1] === F));
  const mismatched = [row(c, 201n, 0n, {minimum: 2n * U, nonce: 2n}), row(c, 202n, 1n, {nonce: 2n})];
  const carry = settlement(c, mismatched);
  assert.deepEqual(carry.plan.operations, []); assert.deepEqual(carry.plan.terminal, []);
  const refund = settlement(c, mismatched.map(order => ({...order, cancelled: 1n})));
  assert.deepEqual(refund.plan.terminal, [201n, 202n]);
  assert.deepEqual(refund.calls.filter(call => call.method_name === 'refund_funding').map(call => call.inputs),
    [[201n, ...encodeAmount(U), ...encodeAmount(0n), F, 2n, 5n], [202n, ...encodeAmount(0n), ...encodeAmount(U), F, 2n, 6n]]);
  assert.equal(refund.calls.filter(call => call.contract_id === 0n && call.method_name === 'transfer' && call.inputs[1] === F).length, 2);
});

test('claims cover activation dust, matched buyer Native return, both cancellation refunds and side-specific closes', () => {
  const p = build(fixture());
  const matched = p.stages.find(stage => stage.label === 'book-match-buyer-claim-close-v1');
  assert.deepEqual(matched.contract_calls.map(call => call.method_name), ['claim', 'claim', 'close_1']);
  assert.equal(matched.expectedNativeOutboxDelta, F);
  for (const role of ['seller', 'buyer']) {
    const cancel = p.stages.findIndex(stage => stage.label === `book-${role}-cancel-v1`);
    const carry = p.stages.findIndex(stage => stage.label === 'book-mismatch-carry-v1');
    const refund = p.stages.findIndex(stage => stage.label === 'book-refund-settle-v1');
    const claim = p.stages.findIndex(stage => stage.label === `book-${role}-refund-claim-close-v1`);
    assert.ok(carry < cancel && cancel < refund && refund < claim);
    assert.deepEqual(p.stages[claim].contract_calls.map(call => call.method_name), ['claim', 'claim', role === 'seller' ? 'close_0' : 'close_1']);
    assert.equal(p.stages[claim].expectedNativeOutboxDelta, F);
  }
});

test('sponsor cannot alias either trading role, vault, or another signing identity', () => {
  for (const role of ['seller', 'buyer', 'vault']) {
    const c = fixture(); c.sponsor.userId = c[role].userId; assert.throws(() => build(c), /distinct accounts/);
    const d = fixture(); d.sponsor.publicKeyHash = d[role].publicKeyHash; assert.throws(() => build(d), /signing identity/);
  }
  const valid = fixture(); valid.sponsor.userId = valid.marketId;
  assert.doesNotThrow(() => build(valid), 'contract IDs and account IDs occupy distinct namespaces');
});

test('plan rejects wrong release, domain, randomness, policy, metadata, dependencies and token ABI', () => {
  const mutations = [c => c.profile = 'book-core-compact-v1', c => delete c.policy.key_profile,
    c => c.policy.sdk_commit = '00'.repeat(20), c => c.policy.qualified_randomness = true,
    c => c.config.networkMagic = '1', c => c.config.ordering = 'random', c => c.policy.chain_root_at1 = '0'.repeat(64),
    c => c.assets[0].decimals = 9, c => c.assets[0].kind = 'pusdt', c => c.assets[0].contractId++, c => c.assets[0].issuerId++,
    c => c.policy.dependency_bindings.pop(), c => c.policy.dependency_bindings[0].deployer = 201,
    c => c.policy.operations[0].calls[0].inputs[0] = {constant: 777}, c => c.marketAbi.contract.state_tree_height = 30,
    c => c.tokenBAbi.contract.methods.find(method => method.name === 'transfer').method_id++];
  for (const mutate of mutations) {const c = fixture(); mutate(c); assert.throws(() => build(c));}
  for (const deadline of [0n, 1n << 32n, 1000, '1000']) assert.throws(() => buildCoreBookAcceptancePlan(fixture(), {deadline}));
});

test('reused whole-order constructor preserves nonzero U124 high limbs and rejects single-limb truncation/overflow', () => {
  const c = fixture(), amount = (1n << 90n) + 17n, minimum = (1n << 80n) + 19n;
  const args = {marketId: c.marketId, marketAbi: c.marketAbi, tokenAbi: c.tokenAbi, config: c.config,
    vaultId: c.vault.userId, side: 0n, amount, minimum, deadline: 1000n, nonce: 1n};
  const calls = orderbookSellCalls(c.policy, args);
  assert.deepEqual(calls[0].inputs.slice(2, 6), [...encodeAmount(amount), ...encodeAmount(minimum)]);
  assert.deepEqual(calls[2].inputs, [100n, ...encodeAmount(amount)]);
  assert.ok(calls[0].inputs[3] > 0n && calls[0].inputs[5] > 0n);
  for (const change of [{amount: 1n << 124n}, {minimum: 1n << 124n}, {amount: Number(amount)}, {minimum: 0n}])
    assert.throws(() => orderbookSellCalls(c.policy, {...args, ...change}));
});

test('formal stages own their selected-owner and retained-owner arrays', () => {
  const p = build(fixture());
  const commit = p.stages.find(stage => stage.label === 'book-match-commit-v1');
  const settle = p.stages.find(stage => stage.label === 'book-match-settle-v1');
  const carry = p.stages.find(stage => stage.label === 'book-mismatch-carry-v1');
  const refund = p.stages.find(stage => stage.label === 'book-refund-settle-v1');
  assert.deepEqual(commit.selectedOwners, [201n, 202n]);
  commit.selectedOwners.push(999n);
  assert.deepEqual(settle.selectedOwners, [201n, 202n], 'stages must not share one mutable owner array');
  assert.deepEqual(refund.selectedOwners, [201n, 202n]);
  assert.deepEqual(carry.expectedOutcome.legallyRetained, [201n, 202n]);
  carry.expectedOutcome.legallyRetained.length = 0;
  assert.deepEqual(carry.selectedOwners, [201n, 202n]);
  assert.deepEqual(settle.selectedOwners, [201n, 202n]);
});

test('cancel stages carry bigint sides consistent with their refund claim and close', () => {
  const p = build(fixture());
  for (const [role, side] of [['seller', 0n], ['buyer', 1n]]) {
    const cancel = p.stages.find(stage => stage.label === `book-${role}-cancel-v1`);
    assert.equal(cancel.side, side, 'plan numeric fields stay bigint');
    assert.equal(cancel.orderNonce, 2n);
    const claim = p.stages.find(stage => stage.label === `book-${role}-refund-claim-close-v1`);
    assert.equal(claim.contract_calls.at(-1).method_name, `close_${side}`);
    assert.equal(claim.contract_calls[0].contract_id, BigInt(p.assets[side ? 1 : 0].contractId));
    assert.deepEqual(claim.expectedQaDeltas, side ? [0n, U] : [U, 0n]);
  }
});

test('market id must be an explicit bigint, not a coercible number or string', () => {
  for (const marketId of [1000, '1000']) {
    const c = fixture(); c.marketId = marketId;
    assert.throws(() => build(c), /bounded BigInt required/);
  }
  const reserved = fixture(); reserved.marketId = 4n;
  assert.throws(() => build(reserved));
});
