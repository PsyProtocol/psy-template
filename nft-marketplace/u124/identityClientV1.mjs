// Node-only, unsigned preparation boundary for an explicitly reviewed candidate.
// A supplied digest pins data; it does not establish who reviewed it or prove
// bytecode, dependency trust, the signing session, or any network acceptance.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {FEE_ESCROW} from '../../amm/u124/client.mjs';
import {requireCoreDependencyPolicy} from '../../executor/coreDependencyPolicy.mjs';
import {generateIdentityBuyCandidate, identityBuyInputs, FROZEN_CAPACITY,
  NFT_IDENTITY_BUY_PROFILE, NFT_IDENTITY_BUY_METHOD} from './identity-buy-candidate.mjs';

export const NFT_IDENTITY_CLIENT_PROFILE = 'selected-nft-identity-client-v1';
// Fixed source-only limits per argument snapshot, not caller-adjustable knobs.
// Depth counts the root as zero. The aggregate budget counts every visited
// value and every own key (including array length), even for repeated aliases.
// These bound structural copying, not the size of strings or caller storage.
export const NFT_IDENTITY_DATA_LIMITS = Object.freeze({
  maxArrayLength: 4096, maxOwnKeys: 8192, maxDepth: 64,
  maxVisitedNodesAndProperties: 100000,
});
export const NFT_IDENTITY_PENDING_GATES = Object.freeze([
  'actual-compiled-bytecode-abi-selector-and-eight-foreign-read-audit',
  'new-instance-new-sd-key-and-authenticated-dependency-chain-bindings',
  'actual-wallet-session-signature-hash-ordered-stack-deadline-and-fee-binding',
  'adversarial-bytecode-and-complete-buy-sale-refund-ordinary-claim-ups',
  'separately-authorized-new-instance-network-acceptance',
  'reviewed-browser-plain-data-approval-and-persistence-boundary',
]);
const PIN_FIELDS = ['policySha256', 'componentSha256', 'marketAbiSha256',
  'collectionAbiSha256', 'paymentAbiSha256', 'nativeAbiSha256'];
const REVIEW_FIELDS = ['policy', 'component', 'marketAbi', 'collectionAbi', 'paymentAbi', 'nativeAbi'];
const USER_MAX = (1n << 24n) - 1n;

// Reject executable inputs before invoking getters, iterators, toJSON or Proxy
// traps. This deliberately does not claim a browser-safe equivalent.
function data(value, state = {seen: new Set(), visited: 0}, depth = 0) {
  assert.ok(depth <= NFT_IDENTITY_DATA_LIMITS.maxDepth, 'plain data depth limit exceeded');
  assert.ok(++state.visited <= NFT_IDENTITY_DATA_LIMITS.maxVisitedNodesAndProperties, 'plain data aggregate traversal limit exceeded');
  if (value === null || ['string', 'boolean', 'bigint'].includes(typeof value)) return value;
  if (typeof value === 'number') { assert.ok(Number.isSafeInteger(value), 'safe integer data required'); return value; }
  assert.ok(value && typeof value === 'object' && !types.isProxy(value), 'plain non-Proxy data required');
  assert.ok(!state.seen.has(value), 'acyclic data required'); state.seen.add(value);
  const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
  assert.ok(array ? proto === Array.prototype : proto === null || proto === Object.prototype, 'plain data prototype required');
  // Array length is an own, non-accessor scalar after the non-Proxy check.
  // Check it before own-key enumeration or allocating expected dense indexes.
  if (array) assert.ok(value.length <= NFT_IDENTITY_DATA_LIMITS.maxArrayLength, 'plain data array length limit exceeded');
  const keys = Reflect.ownKeys(value);
  assert.ok(keys.length <= NFT_IDENTITY_DATA_LIMITS.maxOwnKeys, 'plain data own-key count limit exceeded');
  state.visited += keys.length;
  assert.ok(state.visited <= NFT_IDENTITY_DATA_LIMITS.maxVisitedNodesAndProperties, 'plain data aggregate traversal limit exceeded');
  assert.ok(keys.every(k => typeof k === 'string'), 'symbol properties are unsupported');
  const result = array ? [] : Object.create(null);
  if (array) assert.deepEqual(keys.filter(k => k !== 'length').sort(),
    Array.from({length: value.length}, (_, i) => String(i)).sort(), 'dense own array data required');
  for (const key of keys) {
    if (array && key === 'length') continue;
    const d = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(d && Object.hasOwn(d, 'value') && d.enumerable, 'enumerable own data properties required');
    Object.defineProperty(result, key, {value: data(d.value, state, depth + 1), enumerable: true, writable: true, configurable: true});
  }
  state.seen.delete(value); return result;
}
function exact(record, fields, label) {
  assert.ok(record && !Array.isArray(record) && typeof record === 'object', label + ' record required');
  assert.deepEqual(Object.keys(record).sort(), [...fields].sort(), 'exact ' + label + ' fields');
}
function digest(value) {
  // Type tags distinguish BigInt from strings and Numbers; sorted keys make
  // identity independent of property insertion order. This is a local format.
  function encode(v) {
    if (v === null) return ['null'];
    if (Array.isArray(v)) return ['array', v.map(encode)];
    if (typeof v === 'object') return ['object', Object.keys(v).sort().map(k => [k, encode(v[k])])];
    return [typeof v, String(v)];
  }
  return createHash('sha256').update(JSON.stringify(encode(value))).digest('hex');
}
function hex(value, label) {
  assert.equal(typeof value, 'string', label); assert.match(value, /^[a-f0-9]{64}$/, label);
  assert.notEqual(value, '0'.repeat(64), label);
}
function identity(reviewed) {
  return Object.fromEntries(REVIEW_FIELDS.map((field, i) => [PIN_FIELDS[i], digest(reviewed[field])]));
}
// This computes comparison pins only. The caller must obtain and review the
// expected pins independently; recomputing both sides from RPC is not trust.
export function identityBuyReviewIdentityV1(reviewed) {
  reviewed = data(reviewed); exact(reviewed, REVIEW_FIELDS, 'review');
  return Object.freeze(identity(reviewed));
}
function method(abi, name, arity, expectedId) {
  assert.ok(Array.isArray(abi?.contract?.methods), 'ABI methods required');
  const methods = abi.contract.methods;
  const names = new Set(), ids = new Set();
  for (const m of methods) {
    assert.ok(typeof m.name === 'string' && m.name.length > 0 && !names.has(m.name), 'unique ABI method names'); names.add(m.name);
    assert.ok(Number.isSafeInteger(m.method_id) && m.method_id > 0 && m.method_id <= 0xffffffff && !ids.has(m.method_id), 'unique canonical ABI selectors'); ids.add(m.method_id);
  }
  const m = methods.find(m => m.name === name); assert.ok(m, 'reviewed method required: ' + name);
  assert.equal(m.input_felt_count, arity, name + ' arity'); assert.equal(m.output_felt_count, 0, name + ' outputs');
  assert.equal(m.state_mutability, 'external', name + ' mutability');
  if (expectedId !== undefined) assert.equal(m.method_id, expectedId, name + ' selector');
  return m;
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); }
  return value;
}
function checked(reviewed, expectedIdentity) {
  reviewed = data(reviewed); expectedIdentity = data(expectedIdentity);
  exact(reviewed, REVIEW_FIELDS, 'review'); exact(expectedIdentity, PIN_FIELDS, 'independently supplied identity');
  for (const field of PIN_FIELDS) hex(expectedIdentity[field], field);
  assert.deepEqual(identity(reviewed), {...expectedIdentity}, 'exact supplied review identity changed');
  const p = reviewed.policy;
  assert.equal(p.version, 2); assert.equal(p.market, 'nftmarket');
  assert.equal(p.identity_buy_profile, NFT_IDENTITY_BUY_PROFILE, 'explicit identity-buy policy required');
  assert.equal(p.execution_scope, 'explicit-selected-orders-v1');
  assert.equal(p.whole_market_completeness, false); assert.equal(p.qualified_randomness, false);
  assert.equal(p.collection_initialization, 'explicit-account-version-v1');
  assert.equal(p.sdk_commit, FROZEN_CAPACITY.sdkCommit); assert.equal(p.client_commit, FROZEN_CAPACITY.clientCommit);
  assert.equal(p.native_protocol, 'mainnet-beta-20261027');
  hex(p.chain_root_at1, 'explicit chain anchor');
  assert.ok(typeof p.chain_instance === 'string' && p.chain_instance.trim().length > 0, 'explicit chain instance required');
  for (const field of ['market_id', 'vault_id']) assert.ok(Number.isSafeInteger(p[field]) && p[field] > 0 && p[field] <= Number(USER_MAX), field);
  assert.ok(p.market_id >= 5);
  const candidate = generateIdentityBuyCandidate(p.config);
  assert.equal(p.source_sha256, candidate.manifest.sourceSha256, 'exact generated identity-buy source required');
  assert.ok(![p.config.nftId, p.config.tokenId].includes(p.market_id), 'distinct component contracts');
  const bindings = requireCoreDependencyPolicy(p);
  const component = bindings.find(b => b.contractId === p.market_id);
  assert.deepEqual(reviewed.component, component, 'exact full market dependency leaf required');
  const buy = method(reviewed.marketAbi, NFT_IDENTITY_BUY_METHOD, 17);
  assert.ok(!reviewed.marketAbi.contract.methods.some(m => m.name === 'open_buy' || m.method_id === 2946376578), 'legacy unbound buy ABI rejected');
  const prepare = method(reviewed.collectionAbi, 'prepare_account', 0, 1475740684);
  const payment = method(reviewed.paymentAbi, 'transfer', 3, 188091294);
  const fee = method(reviewed.nativeAbi, 'transfer', 2, 2789897329);
  return {reviewed, pins: {...expectedIdentity}, buy, prepare, payment, fee};
}

// No signer, RPC, proof, broadcaster, production factory or write-enabling
// option exists here. Funding and identity approval are one ordered candidate
// stack; the actual wallet still must bind this exact stack in a complete UPS.
export function prepareIdentityBuyV1(reviewed, expectedIdentity, request) {
  const c = checked(reviewed, expectedIdentity), p = c.reviewed.policy;
  request = data(request); exact(request, ['signingBuyerId', 'approved'], 'request');
  assert.ok(typeof request.signingBuyerId === 'bigint' && request.signingBuyerId > 0n && request.signingBuyerId <= USER_MAX, 'explicit signing buyer');
  assert.equal(request.approved.actor, request.signingBuyerId, 'approval must match signing buyer');
  assert.equal(request.approved.pool, BigInt(p.vault_id), 'exact reviewed vault');
  const inputs = identityBuyInputs(p.config, request.approved);
  const call = (id, m, words) => ({contract_id: BigInt(id), method_id: BigInt(m.method_id), method_name: m.name, inputs: words});
  const calls = [call(p.config.nftId, c.prepare, []), call(p.market_id, c.buy, inputs),
    call(0, c.fee, [BigInt(p.vault_id), FEE_ESCROW]),
    call(p.config.tokenId, c.payment, [BigInt(p.vault_id), inputs[3], inputs[4]])];
  return freeze({schema: 1, profile: NFT_IDENTITY_CLIENT_PROFILE, kind: 'nft-buy-identity-v1',
    reviewIdentity: c.pins, component: c.reviewed.component,
    network: {nativeProtocol: p.native_protocol, chainInstance: p.chain_instance, chainRootAt1: p.chain_root_at1, networkMagic: p.config.networkMagic},
    signingBuyerId: request.signingBuyerId, approved: request.approved, contract_calls: calls,
    preparationSha256: digest({reviewIdentity: c.pins, request, contract_calls: calls}),
    unsigned: true, prepareOnly: true, sourceOnly: true, nftPurchaseWritesEnabled: false,
    newContractRequired: true, newKeyRequired: true, compiled: false, vmVerified: false,
    dependencyTrustVerified: false, sdKeyProofVerified: false, fullUpsVerified: false, liveAccepted: false,
    wholeMarketCompleteness: false, qualifiedRandomness: false, financialOperations: 0,
    requiredGates: [...NFT_IDENTITY_PENDING_GATES]});
}

// Compare persisted/transported data with a fresh preparation. This checks
// equality only; passing it never upgrades the pending gates to approval.
export function assertPreparedIdentityBuyV1(reviewed, expectedIdentity, request, prepared) {
  const expected = prepareIdentityBuyV1(reviewed, expectedIdentity, request);
  assert.deepEqual(data(prepared), data(expected), 'prepared identity-buy stack or approval changed');
  return expected;
}
