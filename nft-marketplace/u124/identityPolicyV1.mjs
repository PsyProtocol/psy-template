// Opt-in SOURCE-ONLY policy adapter for the reviewed identity-buy candidate.
// Nothing in production imports this module and it adds no executor profile.
// It assembles a versioned candidate policy plus a review bundle from
// explicitly supplied raw ABI JSON text and typed dependency leaves.
// Digest pins are EQUALITY METADATA ONLY: they never establish review
// provenance, compiled bytecode, function roots, authenticated dependency
// leaves, SD-key binding, wallet session approval or network acceptance.
// No compiler, filesystem, RPC, signer, prover, broadcaster or write authority.
import assert from 'node:assert/strict';
import {makeBatchPolicy} from '../../batching/v2/policy.mjs';
import {bindNativePolicy, PROFILE, METHODS} from '../../batching/mainnet-beta/native.mjs';
import {bindCoreDependencies, fullCoreDependency} from '../../executor/coreDependencyPolicy.mjs';
import {validateU124TokenAbi} from '../../executor/u124Abi.mjs';
import {validatePreparedCollection} from '../core-build.mjs';
import {inspectIdentityBuyAbiV1, ABI_GATE_MAX_ABI_BYTES, ABI_GATE_MAX_CONFIG_BYTES} from './identityAbiGateV1.mjs';
import {identityBuyReviewIdentityV1, NFT_IDENTITY_PENDING_GATES} from './identityClientV1.mjs';
import {FROZEN_CAPACITY, NFT_IDENTITY_BUY_PROFILE, NFT_IDENTITY_BUY_METHOD,
  NFT_IDENTITY_BUY_FELTS} from './identity-buy-candidate.mjs';

export const NFT_IDENTITY_POLICY_PROFILE = 'selected-nft-identity-policy-v1';
export const NFT_IDENTITY_POLICY_DOMAIN = '1384803358401154921';
export const NFT_IDENTITY_POLICY_MAX_SPEC_BYTES = 4 * ABI_GATE_MAX_ABI_BYTES;
// The retired ordinary buy selector must not survive under any method name.
export const LEGACY_OPEN_BUY_SELECTOR = 2946376578;
const PREPARE_ACCOUNT_SELECTOR = 1475740684;
const COLLECTION_INITIALIZATION = 'explicit-account-version-v1';
const USER_MAX = 2 ** 24 - 1;
const ZERO_DIGEST = '0'.repeat(64);
const DIGEST = /^[a-f0-9]{64}$/;
const SPEC_FIELDS = ['schema', 'marketId', 'vaultId', 'chainInstance', 'chainRootAt1',
  'configJson', 'marketAbiJson', 'collectionAbiJson', 'paymentAbiJson', 'nativeAbiJson',
  'dependencyLeaves', 'expectedPins'];
const LEAF_FIELDS = ['contractId', 'deployer', 'code_root', 'state_layout_root',
  'function_tree_root', 'state_tree_height', 'state_layout_field_count', 'state_layout_slot_count'];
export const NFT_IDENTITY_POLICY_UNVERIFIED = Object.freeze([
  'compiled-bytecode', 'compiled-selector-provenance', 'function-root',
  'authenticated-dependency-leaves', 'sd-key-binding', 'signature-session-approval',
  'abi-to-source-correspondence', 'real-settlement-and-ordinary-claim',
]);
// The single frozen gate list owned by the unsigned preparation client. It is
// reused verbatim so the policy bundle and the prepared stack can never
// advertise different pending gates. No gate is marked passed here.
export const NFT_IDENTITY_POLICY_GATES = NFT_IDENTITY_PENDING_GATES;
assert.ok(Object.isFrozen(NFT_IDENTITY_POLICY_GATES), 'frozen client gate list required');

// Primitive JSON text only: parsing produces plain data, so no caller getter,
// Proxy trap, iterator or toJSON hook can run inside this adapter.
function bounded(value, limit, label) {
  assert.equal(typeof value, 'string', label + ' must be a primitive JSON string');
  const size = Buffer.byteLength(value, 'utf8');
  assert.ok(size > 0 && size <= limit, label + ' must fit the fixed UTF-8 byte bound');
  return value;
}
function object(json, label) {
  let value;
  try {
    value = JSON.parse(json);
  } catch {
    assert.fail(label + ' must be well-formed JSON');
  }
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), label + ' must be a JSON object');
  return value;
}
function exact(record, fields, label) {
  assert.ok(record && typeof record === 'object' && !Array.isArray(record), label + ' must be an object');
  assert.deepEqual(Object.keys(record).sort(), [...fields].sort(), 'exact ' + label + ' fields');
}
function integer(value, min, max, label) {
  assert.ok(Number.isSafeInteger(value) && value >= min && value <= max, label);
}
function digest(value, label) {
  assert.equal(typeof value, 'string', label);
  assert.ok(DIGEST.test(value) && value !== ZERO_DIGEST, label + ' must be a nonzero lowercase 64-hex digest');
}
function method(abi, name, selector, arity) {
  const methods = abi?.contract?.methods;
  assert.ok(Array.isArray(methods), 'ABI methods required for ' + name);
  const m = methods.find(x => x.name === name);
  assert.ok(m, 'reviewed method required: ' + name);
  assert.equal(m.method_id, selector, 'exact current selector ' + name);
  assert.equal(m.input_felt_count, arity, name + ' arity');
  assert.equal(m.output_felt_count, 0, name + ' outputs');
  assert.equal(m.state_mutability, 'external', name + ' mutability');
  return m;
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

// The current formal factory is fed the genuine NEW market ABI. The retired
// makeCoreNftPolicy path is never given a forged legacy ABI or a mutated old
// artifact; only the canonical activation acknowledgement is substituted, and
// every settlement/refund/priority descriptor stays exactly as generated.
function formalPolicy(marketId, config, marketAbi, paymentAbi, collectionAbi) {
  const previous = bindNativePolicy(
    makeBatchPolicy('nftmarket', marketId, config, marketAbi, paymentAbi, collectionAbi), PROFILE);
  const policy = structuredClone(previous);
  assert.equal(policy.version, 2, 'current formal policy version');
  assert.equal(policy.market, 'nftmarket');
  assert.equal(policy.market_id, marketId, 'exact selected market identity');
  assert.equal(policy.config.nftId, config.nftId);
  assert.equal(policy.config.tokenId, config.tokenId);
  assert.equal(policy.config.networkMagic, config.networkMagic);
  const index = policy.operations.findIndex(o => o.name === 'activate');
  assert.ok(index >= 0, 'current formal activation operation required');
  const op = policy.operations[index];
  assert.equal(op.maintenance, true, 'activation is maintenance');
  const acknowledgements = op.calls.filter(c => c.contract_id === config.nftId && c.method_name === 'acknowledge');
  assert.equal(acknowledgements.length, 1, 'exact legacy activation acknowledgement');
  assert.deepEqual(acknowledgements[0].inputs, [{witness: 1}]);
  op.calls = op.calls.map(c => c === acknowledgements[0]
    ? {contract_id: config.nftId, method_id: PREPARE_ACCOUNT_SELECTOR, method_name: 'prepare_account', inputs: []}
    : c);
  assert.equal(op.calls.length, 9, 'exact activation call count');
  const branch = policy.branches[2 + index];
  assert.ok(branch, 'mirrored activation branch required');
  assert.deepEqual(branch.calls, previous.operations[index].calls, 'exact original activation coverage');
  branch.calls = structuredClone(op.calls);
  return policy;
}

export function makeIdentityBuyPolicyV1(specJson) {
  bounded(specJson, NFT_IDENTITY_POLICY_MAX_SPEC_BYTES, 'specJson');
  const spec = object(specJson, 'specJson');
  exact(spec, SPEC_FIELDS, 'identity policy spec');
  assert.equal(spec.schema, 1, 'explicit identity policy spec schema');
  integer(spec.marketId, 5, USER_MAX, 'market contract identity');
  // Vault is an ACCOUNT identity: numeric equality with a contract id is not
  // forbidden here. Ownership/separation remain separate runtime gates.
  integer(spec.vaultId, 1, USER_MAX, 'vault account identity');
  const configJson = bounded(spec.configJson, ABI_GATE_MAX_CONFIG_BYTES, 'configJson');
  const config = object(configJson, 'configJson');
  assert.equal(config.networkMagic, NFT_IDENTITY_POLICY_DOMAIN, 'fixed selected network domain');
  integer(config.nftId, 5, USER_MAX, 'collection contract identity');
  integer(config.tokenId, 5, USER_MAX, 'payment contract identity');
  assert.equal(new Set([spec.marketId, config.nftId, config.tokenId]).size, 3,
    'distinct market, collection and payment contracts');
  assert.equal(typeof spec.chainInstance, 'string', 'explicit chain instance');
  assert.ok(spec.chainInstance.trim().length > 0 && spec.chainInstance.length <= 128, 'explicit chain instance');
  digest(spec.chainRootAt1, 'chainRootAt1');
  exact(spec.expectedPins, ['marketAbiSha256', 'sourceSha256'], 'expected pins');
  digest(spec.expectedPins.marketAbiSha256, 'marketAbiSha256');
  digest(spec.expectedPins.sourceSha256, 'sourceSha256');

  const marketAbiJson = bounded(spec.marketAbiJson, ABI_GATE_MAX_ABI_BYTES, 'marketAbiJson');
  const gate = inspectIdentityBuyAbiV1(marketAbiJson, configJson,
    spec.expectedPins.marketAbiSha256, spec.expectedPins.sourceSha256);
  const marketAbi = object(marketAbiJson, 'marketAbiJson');
  assert.equal(marketAbi.contract.state_tree_height, 31, 'selected market state tree height');
  assert.ok(!marketAbi.contract.methods.some(m => m.name === 'open_buy' || m.method_id === LEGACY_OPEN_BUY_SELECTOR),
    'legacy unbound buy entry must not survive');
  assert.notEqual(gate.identityMethodId, LEGACY_OPEN_BUY_SELECTOR, 'retired buy selector');
  method(marketAbi, NFT_IDENTITY_BUY_METHOD, gate.identityMethodId, NFT_IDENTITY_BUY_FELTS);

  const collectionAbi = object(bounded(spec.collectionAbiJson, ABI_GATE_MAX_ABI_BYTES, 'collectionAbiJson'), 'collectionAbiJson');
  validatePreparedCollection(collectionAbi);
  const paymentAbi = object(bounded(spec.paymentAbiJson, ABI_GATE_MAX_ABI_BYTES, 'paymentAbiJson'), 'paymentAbiJson');
  validateU124TokenAbi(paymentAbi);
  method(paymentAbi, 'claim', 2792756730, 1);
  method(paymentAbi, 'transfer', 188091294, 3);
  const nativeAbi = object(bounded(spec.nativeAbiJson, ABI_GATE_MAX_ABI_BYTES, 'nativeAbiJson'), 'nativeAbiJson');
  assert.equal(nativeAbi.contract.state_tree_height, 32, 'native state tree height');
  for (const m of Object.values(METHODS)) method(nativeAbi, m.name, m.id, m.arity);

  assert.ok(Array.isArray(spec.dependencyLeaves) && spec.dependencyLeaves.length === 4,
    'exact four typed dependency leaves required');
  const ids = [0, config.tokenId, config.nftId, spec.marketId].sort((a, b) => a - b);
  const bindings = spec.dependencyLeaves.map(leaf => {
    exact(leaf, LEAF_FIELDS, 'dependency leaf');
    return fullCoreDependency(leaf.contractId, leaf);
  }).sort((a, b) => a.contractId - b.contractId);
  assert.deepEqual(bindings.map(b => b.contractId), ids, 'sorted exact dependency identity set required');

  const base = formalPolicy(spec.marketId, config, marketAbi, paymentAbi, collectionAbi);
  const policy = bindCoreDependencies({...base,
    sdk_commit: FROZEN_CAPACITY.sdkCommit, client_commit: FROZEN_CAPACITY.clientCommit,
    collection_initialization: COLLECTION_INITIALIZATION,
    identity_buy_profile: NFT_IDENTITY_BUY_PROFILE,
    identity_buy_method: NFT_IDENTITY_BUY_METHOD,
    identity_buy_method_id: gate.identityMethodId,
    source_sha256: gate.sourceSha256,
    execution_scope: 'explicit-selected-orders-v1',
    whole_market_completeness: false, qualified_randomness: false,
    chain_root_at1: spec.chainRootAt1, chain_instance: spec.chainInstance,
    vault_id: spec.vaultId, new_contract_required: true, new_key_required: true,
    financial_operations: 0}, bindings);
  const component = policy.dependency_bindings.find(b => b.contractId === spec.marketId);
  assert.ok(component, 'exact market dependency leaf required');

  const reviewed = {policy, component, marketAbi, collectionAbi, paymentAbi, nativeAbi};
  // Comparison pins only. The caller must obtain and review the expected pins
  // independently; recomputing both sides from the same supply is not trust.
  const reviewIdentity = identityBuyReviewIdentityV1(reviewed);
  return deepFreeze({
    schema: 1, profile: NFT_IDENTITY_POLICY_PROFILE, kind: 'nft-identity-policy-v1',
    marketId: spec.marketId, vaultId: spec.vaultId, config,
    chainInstance: spec.chainInstance, chainRootAt1: spec.chainRootAt1,
    reviewed, reviewIdentity, abiGate: gate,
    sourceSha256: gate.sourceSha256, marketAbiSha256: gate.abiSha256,
    identityMethod: NFT_IDENTITY_BUY_METHOD, identityMethodId: gate.identityMethodId,
    identityInputFelts: NFT_IDENTITY_BUY_FELTS,
    sourceOnly: true, prepareOnly: true, unsigned: true,
    newContractRequired: true, newKeyRequired: true,
    compiled: false, vmVerified: false, dependencyTrustVerified: false,
    sdKeyProofVerified: false, fullUpsVerified: false, liveAccepted: false,
    nftPurchaseWritesEnabled: false, wholeMarketCompleteness: false, qualifiedRandomness: false,
    financialOperations: 0, feeBudget: 0,
    unverified: NFT_IDENTITY_POLICY_UNVERIFIED, requiredGates: NFT_IDENTITY_POLICY_GATES,
    note: 'Source/host assembly only; no compiled bytecode, function-root, SD-key, '
      + 'session or network acceptance, and no production write authority.',
  });
}
