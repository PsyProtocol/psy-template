// Host-only tests. Real-shape public ABI fixtures plus a visibly SYNTHETIC new
// method_id: nothing here compiles, proves, signs, broadcasts or moves funds.
// Passing these tests is not full-UPS, browser or network acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readReviewedAbis} from '../../tests/fixtures/reviewedAbis.mjs';
import {generateBatch, methodSpans} from '../../batching/v2/generate.mjs';
import {makeBatchPolicy} from '../../batching/v2/policy.mjs';
import {bindNativePolicy, PROFILE, METHODS} from '../../batching/mainnet-beta/native.mjs';
import {ACCOUNT_VERSION_OFFSET} from '../../nft/account-initialization.mjs';
import {FEE_ESCROW} from '../../amm/u124/client.mjs';
import {makeCoreNftPolicy} from '../core-build.mjs';
import {generateIdentityBuyCandidate, identityBuyInputs, FROZEN_CAPACITY,
  NFT_IDENTITY_BUY_PROFILE, NFT_IDENTITY_BUY_METHOD} from './identity-buy-candidate.mjs';
import {identityBuyReviewIdentityV1, prepareIdentityBuyV1,
  assertPreparedIdentityBuyV1, NFT_IDENTITY_PENDING_GATES} from './identityClientV1.mjs';
import {makeIdentityBuyPolicyV1, NFT_IDENTITY_POLICY_PROFILE, NFT_IDENTITY_POLICY_DOMAIN,
  NFT_IDENTITY_POLICY_MAX_SPEC_BYTES, NFT_IDENTITY_POLICY_GATES,
  LEGACY_OPEN_BUY_SELECTOR} from './identityPolicyV1.mjs';

// Not a compiled selector: an obviously synthetic uint32 for host shape tests.
const SYNTHETIC_IDENTITY_SELECTOR = 4000000001;
const sha256 = text => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
const felt = name => ({kind: 'primitive', name});
const word = name => ({name, type: felt('Felt'), felt_size: 1});
const hash = name => ({name, type: felt('Hash'), felt_size: 4});
const IDENTITY_INPUTS = [word('pool'), word('seller'), word('listing_nonce'),
  {name: 'price', type: {kind: 'array', item: felt('Felt'), length: 2, item_felt_size: 1}, felt_size: 2},
  word('deadline'), word('nonce'), word('collection_id'), word('recipient'),
  hash('expected_token_id'), hash('expected_metadata_hash')];

// The frozen ABI gate accepts exactly this raw envelope; the projection is a
// no-op for an already raw fixture ABI and never invents ABI content.
function abiText(abi) {
  const c = abi.contract;
  return JSON.stringify({schema_version: String(abi.schema_version ?? '1'),
    contract: {name: c.name, state_tree_height: c.state_tree_height, state: c.state,
      methods: c.methods, ...(c.state_layout ? {state_layout: c.state_layout} : {})},
    types: abi.types ?? []});
}
const fullText = abi => JSON.stringify(abi);

function fixture() {
  const reviewed = readReviewedAbis().admission;
  const historical = structuredClone(reviewed.markets.nftmarket);
  const config = {nftId: historical.config.nftId, tokenId: historical.config.tokenId,
    networkMagic: NFT_IDENTITY_POLICY_DOMAIN};
  const names = methodSpans(generateBatch('nftmarket', config)).map(m => m.name);
  const legacyAbi = historical.artifact.abi;
  legacyAbi.contract.methods = legacyAbi.contract.methods.filter(m => names.includes(m.name));
  assert.deepEqual(legacyAbi.contract.methods.map(m => m.name).sort(), [...names].sort(),
    'reviewed fixture must cover every current selected method');
  const marketAbi = structuredClone(legacyAbi);
  const buy = marketAbi.contract.methods.findIndex(m => m.name === 'open_buy');
  assert.ok(buy >= 0, 'reviewed fixture must carry the current ordinary buy entry');
  marketAbi.contract.methods[buy] = {name: NFT_IDENTITY_BUY_METHOD,
    method_id: SYNTHETIC_IDENTITY_SELECTOR, state_mutability: 'external',
    inputs: structuredClone(IDENTITY_INPUTS), outputs: [], input_felt_count: 17, output_felt_count: 0};

  // Prepared collection projection exactly as executor/coreMarkets.test.mjs.
  const collectionAbi = structuredClone(reviewed.nft.abi);
  collectionAbi.contract.state.push({name: 'account_version', offset: ACCOUNT_VERSION_OFFSET,
    felt_size: 1, type: felt('Felt')});
  collectionAbi.contract.state_layout.field_count = 15;
  collectionAbi.contract.state_layout.slot_count = ACCOUNT_VERSION_OFFSET + 1;
  collectionAbi.contract.state_layout.fields.push({field_id: 15, name: 'account_version',
    type: felt('Felt'), start_slot: ACCOUNT_VERSION_OFFSET, payload_offset: 0, slot_count: 1});
  collectionAbi.contract.methods.push({name: 'prepare_account', method_id: 1475740684,
    input_felt_count: 0, output_felt_count: 0, state_mutability: 'external', inputs: [], outputs: []});
  const paymentAbi = structuredClone(reviewed.token.abi);
  // Native ABI shape from the frozen exported protocol table, not invented ids.
  const nativeAbi = {schema_version: '1', types: [], contract: {name: 'Native', state_tree_height: 32,
    state: [], methods: Object.values(METHODS).map(m => ({name: m.name, method_id: m.id,
      state_mutability: 'external', input_felt_count: m.arity, output_felt_count: 0,
      inputs: Array.from({length: m.arity}, (_, i) => word('arg_' + i)), outputs: []}))}};

  const marketId = 1000, vaultId = 100;
  const leaf = (contractId, height, deployer, fieldCount, slotCount) => ({contractId, deployer,
    code_root: 'a'.repeat(64), state_layout_root: 'b'.repeat(64), function_tree_root: 'c'.repeat(64),
    state_tree_height: height, state_layout_field_count: fieldCount, state_layout_slot_count: slotCount});
  const leaves = [leaf(0, 32, 0, 3, 1048576), leaf(config.tokenId, 31, 11, 5, 33554457),
    leaf(config.nftId, 30, 12, 15, ACCOUNT_VERSION_OFFSET + 1), leaf(marketId, 31, 13, 20, 1048576)];
  return {historical, config, legacyAbi, marketAbi, collectionAbi, paymentAbi, nativeAbi,
    leaves, marketId, vaultId, chainInstance: 'selected-testnet-instance', chainRootAt1: 'ab'.repeat(32)};
}

function specOf(f, over = {}) {
  const marketAbiJson = over.marketAbiJson ?? abiText(f.marketAbi);
  const base = {schema: 1, marketId: f.marketId, vaultId: f.vaultId,
    chainInstance: f.chainInstance, chainRootAt1: f.chainRootAt1,
    configJson: JSON.stringify(f.config), marketAbiJson,
    collectionAbiJson: fullText(f.collectionAbi), paymentAbiJson: fullText(f.paymentAbi),
    nativeAbiJson: fullText(f.nativeAbi), dependencyLeaves: f.leaves,
    expectedPins: {marketAbiSha256: sha256(marketAbiJson),
      sourceSha256: generateIdentityBuyCandidate(f.config).manifest.sourceSha256}};
  return JSON.stringify({...base, ...over});
}
const request = (f, vaultId = f.vaultId) => ({signingBuyerId: 201n, approved: {
  actor: 201n, pool: BigInt(vaultId), seller: 202n, listingNonce: 1n, price: (1n << 70n) + 17n,
  deadline: 120n, nonce: 1n, collectionId: BigInt(f.config.nftId), recipient: 201n,
  tokenId: [7n, 0n, 0n, 0n], metadataHash: [0n, 0n, 0n, 0n]}});
const CLOSED = ['compiled', 'vmVerified', 'dependencyTrustVerified', 'sdKeyProofVerified',
  'fullUpsVerified', 'liveAccepted', 'nftPurchaseWritesEnabled', 'wholeMarketCompleteness',
  'qualifiedRandomness'];

test('identity policy bundle feeds the frozen client into the exact four-call 17-word stack', () => {
  const f = fixture(), b = makeIdentityBuyPolicyV1(specOf(f));
  assert.equal(b.profile, NFT_IDENTITY_POLICY_PROFILE);
  assert.deepEqual(Object.keys(b.reviewed).sort(),
    ['collectionAbi', 'component', 'marketAbi', 'nativeAbi', 'paymentAbi', 'policy'].sort());
  assert.deepEqual(b.reviewIdentity, identityBuyReviewIdentityV1(b.reviewed));
  const p = b.reviewed.policy;
  assert.equal(p.version, 2); assert.equal(p.market, 'nftmarket');
  assert.equal(p.identity_buy_profile, NFT_IDENTITY_BUY_PROFILE);
  assert.equal(p.sdk_commit, FROZEN_CAPACITY.sdkCommit);
  assert.equal(p.client_commit, FROZEN_CAPACITY.clientCommit);
  assert.equal(p.native_protocol, PROFILE);
  assert.equal(p.key_profile, 'selected-dependency-bound-v1');
  assert.equal(p.source_sha256, b.sourceSha256);
  assert.equal(p.identity_buy_method_id, SYNTHETIC_IDENTITY_SELECTOR);
  assert.deepEqual(b.reviewed.component, p.dependency_bindings.find(x => x.contractId === f.marketId));

  const r = request(f), words = identityBuyInputs(f.config, r.approved);
  assert.equal(words.length, 17);
  const prepared = prepareIdentityBuyV1(b.reviewed, b.reviewIdentity, r);
  const calls = prepared.contract_calls;
  assert.deepEqual(calls.map(c => [c.contract_id, c.method_name]),
    [[BigInt(f.config.nftId), 'prepare_account'], [BigInt(f.marketId), NFT_IDENTITY_BUY_METHOD],
      [0n, 'transfer'], [BigInt(f.config.tokenId), 'transfer']]);
  // U124 FT transfer takes recipient + TWO amount limbs; the full approved
  // amount is carried, never truncated to fit a smaller expected count.
  assert.deepEqual(calls.map(c => c.inputs.length), [0, 17, 2, 3]);
  assert.deepEqual(calls[1].inputs, words);
  assert.equal(calls[1].method_id, BigInt(SYNTHETIC_IDENTITY_SELECTOR));
  assert.deepEqual(calls[2].inputs, [BigInt(f.vaultId), FEE_ESCROW]);
  assert.deepEqual(calls[3].inputs, [BigInt(f.vaultId), words[3], words[4]]);
  assert.equal(prepared.unsigned, true);
  assert.equal(prepared.financialOperations, 0);
  for (const key of CLOSED) assert.equal(prepared[key], false, key);
  assert.deepEqual(assertPreparedIdentityBuyV1(b.reviewed, b.reviewIdentity, r, prepared), prepared);
});

test('candidate envelope keeps every acceptance gate closed and requires a new contract/key', () => {
  const b = makeIdentityBuyPolicyV1(specOf(fixture()));
  for (const key of CLOSED) assert.equal(b[key], false, key);
  assert.equal(b.newContractRequired, true); assert.equal(b.newKeyRequired, true);
  assert.equal(b.sourceOnly, true); assert.equal(b.prepareOnly, true);
  assert.equal(b.financialOperations, 0); assert.equal(b.feeBudget, 0);
  assert.ok(b.unverified.includes('compiled-bytecode'));
  assert.ok(b.requiredGates.length > 0);
});

test('policy bundle and prepared stack share the one frozen client gate list', () => {
  const f = fixture(), b = makeIdentityBuyPolicyV1(specOf(f));
  const prepared = prepareIdentityBuyV1(b.reviewed, b.reviewIdentity, request(f));
  assert.equal(NFT_IDENTITY_POLICY_GATES, NFT_IDENTITY_PENDING_GATES);
  assert.ok(Object.isFrozen(b.requiredGates));
  assert.deepEqual(b.requiredGates, NFT_IDENTITY_PENDING_GATES);
  assert.deepEqual(prepared.requiredGates, NFT_IDENTITY_PENDING_GATES);
  assert.deepEqual(b.requiredGates, prepared.requiredGates);
  // The previously missing browser boundary and the exact audit spelling.
  assert.ok(b.requiredGates.includes('reviewed-browser-plain-data-approval-and-persistence-boundary'));
  assert.ok(b.requiredGates.includes('actual-compiled-bytecode-abi-selector-and-eight-foreign-read-audit'));
  assert.ok(!b.requiredGates.includes('actual-compiled-bytecode-abi-selector-and-foreign-read-audit'));
  // Sharing the gate list never promotes a trust, proof or write flag.
  for (const key of CLOSED) {
    assert.equal(b[key], false, 'bundle ' + key);
    assert.equal(prepared[key], false, 'prepared ' + key);
  }
  assert.equal(b.financialOperations, 0); assert.equal(b.feeBudget, 0);
  assert.equal(prepared.financialOperations, 0);
  assert.ok(b.unverified.includes('compiled-bytecode'));
});

test('formal settlement/refund/priority descriptors stay exactly current; only activation changes', () => {
  const f = fixture(), b = makeIdentityBuyPolicyV1(specOf(f));
  const baseline = bindNativePolicy(makeBatchPolicy('nftmarket', f.marketId, f.config,
    f.legacyAbi, f.paymentAbi, f.collectionAbi), PROFILE);
  const p = b.reviewed.policy, act = baseline.operations.findIndex(o => o.name === 'activate');
  assert.ok(act >= 0);
  assert.equal(p.operations.length, baseline.operations.length);
  assert.equal(p.branches.length, baseline.branches.length);
  for (let i = 0; i < baseline.operations.length; i++)
    if (i !== act) assert.deepEqual(p.operations[i], baseline.operations[i], 'operation ' + i);
  for (let i = 0; i < baseline.branches.length; i++)
    if (i !== 2 + act) assert.deepEqual(p.branches[i], baseline.branches[i], 'branch ' + i);
  const op = p.operations[act];
  assert.equal(op.calls.length, 9);
  assert.ok(!op.calls.some(c => c.method_name === 'acknowledge'));
  assert.deepEqual(op.calls.filter(c => c.method_name === 'prepare_account'),
    [{contract_id: f.config.nftId, method_id: 1475740684, method_name: 'prepare_account', inputs: []}]);
  assert.deepEqual(p.branches[2 + act].calls, op.calls);
});

test('frozen core factory produces the same formal operations and branches for the same selection', () => {
  const f = fixture(), b = makeIdentityBuyPolicyV1(specOf(f));
  // HOST ABI PROJECTION ONLY: the historical unit fixture carries ABI shape,
  // not full compiled artifact metadata. This supplies just the declared tree
  // height the canonical factory reads; it fabricates no bytecode, code root
  // or compiled acceptance.
  const hostArtifactProjection = {state_tree_height: 31, abi: f.legacyAbi};
  const reference = makeCoreNftPolicy(f.marketId, f.config,
    hostArtifactProjection, {abi: f.paymentAbi}, {abi: f.collectionAbi}, f.chainRootAt1);
  assert.deepEqual(b.reviewed.policy.operations, reference.operations);
  assert.deepEqual(b.reviewed.policy.branches, reference.branches);
});

test('old market ABI, wrong pins and a retired buy selector are refused', () => {
  const f = fixture();
  assert.throws(() => makeIdentityBuyPolicyV1(specOf(f, {marketAbiJson: abiText(f.legacyAbi)})));
  const good = JSON.parse(specOf(f));
  assert.throws(() => makeIdentityBuyPolicyV1(JSON.stringify({...good,
    expectedPins: {...good.expectedPins, marketAbiSha256: 'd'.repeat(64)}})));
  assert.throws(() => makeIdentityBuyPolicyV1(JSON.stringify({...good,
    expectedPins: {...good.expectedPins, sourceSha256: 'd'.repeat(64)}})));
  const reused = structuredClone(f.marketAbi);
  reused.contract.methods.find(m => m.name === NFT_IDENTITY_BUY_METHOD).method_id = LEGACY_OPEN_BUY_SELECTOR;
  assert.throws(() => makeIdentityBuyPolicyV1(specOf(f, {marketAbiJson: abiText(reused)})));
});

test('identity method name, arity and typed signature substitutions are refused', () => {
  const f = fixture();
  const renamed = structuredClone(f.marketAbi);
  renamed.contract.methods.find(m => m.name === NFT_IDENTITY_BUY_METHOD).name = 'open_buy_v2';
  assert.throws(() => makeIdentityBuyPolicyV1(specOf(f, {marketAbiJson: abiText(renamed)})));
  const short = structuredClone(f.marketAbi);
  const entry = short.contract.methods.find(m => m.name === NFT_IDENTITY_BUY_METHOD);
  entry.inputs = entry.inputs.slice(0, -1); entry.input_felt_count = 13;
  assert.throws(() => makeIdentityBuyPolicyV1(specOf(f, {marketAbiJson: abiText(short)})));
  const retyped = structuredClone(f.marketAbi);
  retyped.contract.methods.find(m => m.name === NFT_IDENTITY_BUY_METHOD).inputs[8] = word('expected_token_id');
  retyped.contract.methods.find(m => m.name === NFT_IDENTITY_BUY_METHOD).input_felt_count = 14;
  assert.throws(() => makeIdentityBuyPolicyV1(specOf(f, {marketAbiJson: abiText(retyped)})));
});

test('chain instance, chain root, domain and contract identity substitutions are refused', () => {
  const f = fixture();
  for (const over of [{chainRootAt1: '0'.repeat(64)}, {chainRootAt1: 'zz'.repeat(32)},
    {chainInstance: '   '}, {marketId: f.config.nftId}, {marketId: 4}, {vaultId: 0},
    {configJson: JSON.stringify({...f.config, networkMagic: '1'})},
    {configJson: JSON.stringify({...f.config, nftId: f.config.tokenId})}])
    assert.throws(() => makeIdentityBuyPolicyV1(specOf(f, over)), JSON.stringify(over).slice(0, 60));
});

test('vault accounts and contract ids are separate namespaces', () => {
  const f = fixture(), b = makeIdentityBuyPolicyV1(specOf(f, {vaultId: f.marketId}));
  assert.equal(b.vaultId, b.marketId);
  const prepared = prepareIdentityBuyV1(b.reviewed, b.reviewIdentity, request(f, f.marketId));
  assert.deepEqual(prepared.contract_calls[2].inputs, [BigInt(f.marketId), FEE_ESCROW]);
});

test('dependency leaf substitutions, heights, deployers and roots are refused', () => {
  const f = fixture();
  const withLeaves = leaves => makeIdentityBuyPolicyV1(specOf(f, {dependencyLeaves: leaves}));
  assert.throws(() => withLeaves(f.leaves.slice(0, 3)));
  const wrongHeight = structuredClone(f.leaves);
  wrongHeight.find(l => l.contractId === f.config.nftId).state_tree_height = 31;
  assert.throws(() => withLeaves(wrongHeight));
  const nativeDeployer = structuredClone(f.leaves);
  nativeDeployer.find(l => l.contractId === 0).deployer = 7;
  assert.throws(() => withLeaves(nativeDeployer));
  const zeroDeployer = structuredClone(f.leaves);
  zeroDeployer.find(l => l.contractId === f.marketId).deployer = 0;
  assert.throws(() => withLeaves(zeroDeployer));
  const zeroRoot = structuredClone(f.leaves);
  zeroRoot.find(l => l.contractId === f.marketId).function_tree_root = '0'.repeat(64);
  assert.throws(() => withLeaves(zeroRoot));
  const shuffled = makeIdentityBuyPolicyV1(specOf(f, {dependencyLeaves: [...f.leaves].reverse()}));
  assert.deepEqual(shuffled.reviewed.policy.dependency_bindings.map(b => b.contractId),
    [0, f.config.tokenId, f.config.nftId, f.marketId].sort((a, b) => a - b));
});

test('collection, payment and native ABI substitutions are refused', () => {
  const f = fixture();
  const unprepared = structuredClone(f.collectionAbi);
  unprepared.contract.methods = unprepared.contract.methods.filter(m => m.name !== 'prepare_account');
  assert.throws(() => makeIdentityBuyPolicyV1(specOf(f, {collectionAbiJson: fullText(unprepared)})));
  const wrongHeight = structuredClone(f.collectionAbi);
  wrongHeight.contract.state_tree_height = 31;
  assert.throws(() => makeIdentityBuyPolicyV1(specOf(f, {collectionAbiJson: fullText(wrongHeight)})));
  const payment = structuredClone(f.paymentAbi);
  payment.contract.methods.find(m => m.name === 'transfer').method_id = 188091295;
  assert.throws(() => makeIdentityBuyPolicyV1(specOf(f, {paymentAbiJson: fullText(payment)})));
  const native = structuredClone(f.nativeAbi);
  native.contract.methods.find(m => m.name === 'transfer').method_id = 354447671;
  assert.throws(() => makeIdentityBuyPolicyV1(specOf(f, {nativeAbiJson: fullText(native)})));
});

test('component-only substitution breaks equality; self-derived pins show consistency, not authentication', () => {
  const f = fixture(), b = makeIdentityBuyPolicyV1(specOf(f));
  // Evidence limit: the adapter shares one frozen leaf object between
  // reviewed.component and reviewed.policy.dependency_bindings, and
  // structuredClone preserves that alias graph. The earlier failure of this
  // case ("Missing expected exception") was a fixture mistake: mutating the
  // clone's component also mutated the recorded policy leaf, so re-pinning
  // produced a consistent candidate. Detach the component explicitly so this
  // is a COMPONENT-ONLY substitution. Pins are equality metadata, not trust.
  const tampered = structuredClone(b.reviewed);
  const recorded = tampered.policy.dependency_bindings.find(x => x.contractId === f.marketId);
  const originalRoot = recorded.functionTreeRoot;
  tampered.component = {...tampered.component, functionTreeRoot: 'd'.repeat(64)};
  assert.equal(recorded.functionTreeRoot, originalRoot, 'recorded policy leaf must stay unchanged');
  assert.notEqual(tampered.component.functionTreeRoot, originalRoot, 'detached component leaf changed');
  const pins = identityBuyReviewIdentityV1(tampered);
  assert.throws(() => prepareIdentityBuyV1(tampered, pins, request(f)), /exact full market dependency leaf/);
  assert.throws(() => prepareIdentityBuyV1(b.reviewed, pins, request(f)), /review identity changed/);

  // A consistently changed, re-pinned candidate is accepted for preparation
  // only: every trust gate stays closed, and the ORIGINAL independently
  // supplied pins still reject it. This proves no authentication claim.
  const consistent = structuredClone(b.reviewed);
  const aliased = consistent.policy.dependency_bindings.find(x => x.contractId === f.marketId);
  assert.equal(consistent.component, aliased, 'clone preserves the frozen alias graph');
  consistent.component.functionTreeRoot = 'd'.repeat(64);
  assert.equal(aliased.functionTreeRoot, 'd'.repeat(64), 'both sides changed together');
  const prepared = prepareIdentityBuyV1(consistent, identityBuyReviewIdentityV1(consistent), request(f));
  assert.equal(prepared.prepareOnly, true); assert.equal(prepared.unsigned, true);
  assert.equal(prepared.sourceOnly, true); assert.equal(prepared.financialOperations, 0);
  for (const key of ['dependencyTrustVerified', 'fullUpsVerified', 'liveAccepted', 'nftPurchaseWritesEnabled'])
    assert.equal(prepared[key], false, key);
  assert.throws(() => prepareIdentityBuyV1(consistent, b.reviewIdentity, request(f)), /review identity changed/);
  // An unknown snake_case field is still an exact-shape violation, not a
  // silently accepted alternative spelling of the typed leaf.
  const unknownField = structuredClone(b.reviewed);
  unknownField.component.function_tree_root = 'd'.repeat(64);
  assert.throws(() => prepareIdentityBuyV1(unknownField, identityBuyReviewIdentityV1(unknownField), request(f)),
    /exact full contract leaf projection/);
});

test('prepared stack tampering and caller trust promotion are refused', () => {
  const f = fixture(), b = makeIdentityBuyPolicyV1(specOf(f)), r = request(f);
  const prepared = prepareIdentityBuyV1(b.reviewed, b.reviewIdentity, r);
  const changed = structuredClone(prepared);
  changed.contract_calls[1].inputs[8] = 999n;
  assert.throws(() => assertPreparedIdentityBuyV1(b.reviewed, b.reviewIdentity, r, changed));
  const promoted = JSON.parse(specOf(f));
  assert.throws(() => makeIdentityBuyPolicyV1(JSON.stringify({...promoted, liveAccepted: true})));
  assert.throws(() => makeIdentityBuyPolicyV1(JSON.stringify({...promoted, compiled: true})));
  assert.throws(() => makeIdentityBuyPolicyV1({...promoted, get marketId() {return 1000;}}));
  assert.throws(() => makeIdentityBuyPolicyV1(' '.repeat(NFT_IDENTITY_POLICY_MAX_SPEC_BYTES + 1)));
  assert.throws(() => makeIdentityBuyPolicyV1(specOf(f).slice(0, -1)));
});
