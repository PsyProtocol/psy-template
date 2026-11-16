import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildCoreNft, makeCoreNftPolicy, validatePreparedCollection, NFT_CORE_COMPILER_API, NFT_CORE_INITIALIZATION} from './core-build.mjs';
import {generateBatch, methodSpans} from '../batching/v2/generate.mjs';
import {makeBatchPolicy} from '../batching/v2/policy.mjs';
import {bindNativePolicy, PROFILE} from '../batching/mainnet-beta/native.mjs';
import {ACCOUNT_VERSION_OFFSET} from '../nft/account-initialization.mjs';
import {sdkRelease} from '../executor/sdkProfiles.mjs';
import {readReviewedAbis} from '../tests/fixtures/reviewedAbis.mjs';

// Historical unit ABI projections and synthetic IR envelopes are HOST TESTS
// ONLY. The injected compiler never executes a process. None of these fixtures
// is bytecode acceptance, a circuit fingerprint, a VM test or full UPS evidence.
const reviewed = readReviewedAbis().admission;
const release = sdkRelease('sdk-audit-20261102-v1');
const config = {nftId: 42, tokenId: 41, networkMagic: '1384803358401154921'};
const anchor = 'ab'.repeat(32);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const source = generateBatch('nftmarket', config);
const felt = {kind: 'primitive', name: 'Felt'};
function artifact(abi) {
  return {state_tree_height: abi.contract.state_tree_height, abi, circuit_definitions: abi.contract.methods.map(m => ({
    name: m.name, method_id: m.method_id, circuit_inputs: Array(m.input_felt_count).fill(0), circuit_outputs: []}))};
}
const tokenFixture = () => artifact(structuredClone(reviewed.token.abi));
function collectionFixture() {
  const abi = structuredClone(reviewed.nft.abi), c = abi.contract;
  c.state.push({name: 'account_version', type: felt, offset: ACCOUNT_VERSION_OFFSET, felt_size: 1});
  c.state_layout.fields.push({field_id: 15, name: 'account_version', type: felt,
    start_slot: ACCOUNT_VERSION_OFFSET, payload_offset: 0, slot_count: 1});
  c.state_layout.field_count++; c.state_layout.slot_count++;
  c.methods.push({name: 'prepare_account', method_id: 1475740684, input_felt_count: 0,
    output_felt_count: 0, state_mutability: 'external', inputs: [], outputs: []});
  return artifact(abi);
}
function marketFixture() {
  const abi = structuredClone(reviewed.markets.nftmarket.artifact.abi);
  const names = methodSpans(source).map(m => m.name);
  abi.contract.methods = names.map(name => {
    const m = abi.contract.methods.find(m => m.name === name);
    assert.ok(m, 'historical unit ABI covers selected method ' + name); return m;
  });
  return artifact(abi);
}
const nativeFixture = {state_tree_height: 32, circuit_definitions: [
  ['claim', 3824212239, 1], ['transfer', 2789897329, 2], ['burn', 3998182541, 1],
].map(([name, method_id, count]) => ({name, method_id, circuit_inputs: Array(count).fill(0), circuit_outputs: []}))};
const bytesWithU64 = value => Buffer.from(JSON.stringify({...value, bytecode_test_constant: '18446744069414584320'})
  .replace('"18446744069414584320"', '18446744069414584320'));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'nft-core-host-')); t.after(() => rmSync(root, {recursive: true, force: true}));
  const data = {compiler: Buffer.from('HOST FAKE: never execute'), native: bytesWithU64(nativeFixture),
    paymentToken: bytesWithU64(tokenFixture()), collection: bytesWithU64(collectionFixture())};
  const records = Object.fromEntries(Object.entries(data).map(([name, bytes]) => {
    const path = join(root, name); writeFileSync(path, bytes); return [name, {path, sha256: digest(bytes)}];
  }));
  const spec = {schema: 1, sdkCommit: release.sdkCommit, clientCommit: release.clientCommit, chainRootAt1: anchor,
    marketId: 1000, intendedVaultId: 100, config, ...records, compiler: {...records.compiler, api: NFT_CORE_COMPILER_API}};
  const calls = [];
  const runCompiler = (compiler, args) => {
    calls.push({compiler, args});
    if (args.length === 1 && args[0] === 'network-magic') return {status: 0, stdout: config.networkMagic + '\n'};
    assert.equal(args.length, 5); assert.deepEqual(args.slice(2), ['41', '42', 'true']);
    assert.match(args[0], /nftmarket\/main\.psy\.rs$/); assert.equal(readFileSync(args[0], 'utf8'), source);
    mkdirSync(args[1]); writeFileSync(join(args[1], 'compilation_artifact.json'), bytesWithU64(marketFixture()));
    writeFileSync(join(args[1], 'FOREIGN_READ_AUDIT.json'), JSON.stringify({assetA: 41, assetB: 42,
      assetAHeight: 31, assetBHeight: 30, nativeHeight: 32, allReadsBound: true, financialOperations: 0, foreignReadCommandsChecked: 1}));
    return {status: 0, stdout: 'HOST FAKE compiler output only'};
  };
  return {root, spec, data, calls, runCompiler, out: join(root, 'fresh')};
}

test('prepared selected NFT policy replaces only activation collection call and mirrored coverage', () => {
  const market = marketFixture(), token = tokenFixture(), collection = collectionFixture();
  const previous = bindNativePolicy(makeBatchPolicy('nftmarket', 1000, config, market.abi, token.abi, collection.abi), PROFILE);
  const p = makeCoreNftPolicy(1000, config, market, token, collection, anchor);
  assert.equal(p.version, 2); assert.equal(p.market, 'nftmarket'); assert.equal(p.tx_count, 40); assert.equal(p.witness_length, 74);
  assert.equal(p.execution_scope, 'explicit-selected-orders-v1'); assert.equal(p.chain_root_at1, anchor);
  assert.equal(p.whole_market_completeness, false); assert.equal(p.qualified_randomness, false);
  assert.equal(p.sdk_commit, release.sdkCommit); assert.equal(p.client_commit, release.clientCommit);
  assert.equal(p.collection_initialization, NFT_CORE_INITIALIZATION);
  const i = p.operations.findIndex(o => o.name === 'activate'), op = p.operations[i];
  assert.equal(op.maintenance, true); assert.equal(op.calls.length, 9);
  assert.deepEqual(op.calls.map(c => [c.contract_id, c.method_name]), [
    [1000, 'noop'], [0, 'claim'], [42, 'prepare_account'], [41, 'claim'], [1000, 'activate'],
    [41, 'transfer'], [1000, 'noop'], [1000, 'noop'], [1000, 'noop']]);
  assert.deepEqual(op.calls[2].inputs, []); assert.equal(op.calls[2].method_id, 1475740684);
  assert.deepEqual(op.calls[5].inputs, [{witness: 1}, {constant: '1'}, {constant: '0'}]);
  assert.deepEqual(p.branches[2 + i].calls, op.calls);
  assert.notEqual(digest(JSON.stringify(op.calls)), digest(JSON.stringify(previous.operations[i].calls)), 'descriptors change; actual fingerprint requires a real circuit build');
  for (let j = 0; j < p.operations.length; j++) if (i !== j) assert.deepEqual(p.operations[j], previous.operations[j]);
  for (let j = 0; j < p.branches.length; j++) if (2 + i !== j) assert.deepEqual(p.branches[j], previous.branches[j]);
  assert.match(source, /earlier competing buyer/); assert.match(source, /unprocessed purchase or refund/);
  assert.match(source, /pub fn request_cancel/); assert.match(source, /pub fn refund_funding/);
  assert.doesNotMatch(source, /stream_|admission_/);
});

test('legacy collection, altered preparation, wrong selectors and global coverage fail closed', () => {
  const make = collection => makeCoreNftPolicy(1000, config, marketFixture(), tokenFixture(), collection, anchor);
  assert.throws(() => make(reviewed.nft), /prepared collection/);
  for (const mutate of [c => c.abi.contract.state.at(-1).offset++, c => c.abi.contract.state_layout.fields.at(-1).field_id++,
    c => c.abi.contract.methods.find(m => m.name === 'prepare_account').method_id++,
    c => c.abi.contract.methods.find(m => m.name === 'prepare_account').input_felt_count++,
    c => c.abi.contract.methods.find(m => m.name === 'prepare_account').state_mutability = 'view',
    c => c.abi.contract.methods.find(m => m.name === 'claim').method_id++]) {
    const c = collectionFixture(); mutate(c); assert.throws(() => make(c));
  }
  const a = marketFixture(); a.abi.contract.methods.push({name: 'stream_seal'});
  assert.throws(() => makeCoreNftPolicy(1000, config, a, tokenFixture(), collectionFixture(), anchor));
  const token = tokenFixture(); token.abi.contract.methods.find(m => m.name === 'transfer').method_id++;
  assert.throws(() => makeCoreNftPolicy(1000, config, marketFixture(), token, collectionFixture(), anchor));
  const c = collectionFixture(); c.abi.contract.state_tree_height = 31;
  assert.throws(() => validatePreparedCollection(c.abi));
});

test('host fake build preserves full-u64 bytes and never records full UPS or live acceptance', t => {
  const f = fixture(t), report = buildCoreNft(f.spec, f.out, {runCompiler: f.runCompiler});
  for (const [path, role] of [['native.json', 'native'], ['token/compilation_artifact.json', 'paymentToken'], ['nft/compilation_artifact.json', 'collection']])
    assert.deepEqual(readFileSync(join(f.out, path)), f.data[role]);
  const bytes = readFileSync(join(f.out, 'nftmarket/compiled/compilation_artifact.json'));
  assert.ok(bytes.includes(Buffer.from('18446744069414584320'))); assert.equal(report.artifactSha256, digest(bytes));
  for (const name of ['fullUpsVerified', 'sdKeyProofVerified', 'liveAuthorization']) assert.equal(report[name], false);
  assert.equal(report.financialOperations, 0); assert.equal(report.newKeyRequired, true);
  assert.equal(report.collectionInitialization, NFT_CORE_INITIALIZATION);
  assert.equal(report.intendedVaultId, 100); assert.match(report.vaultIdentityBinding, /not a cryptographic/);
  assert.equal(f.calls.length, 2);
  assert.throws(() => buildCoreNft(f.spec, f.out, {runCompiler: f.runCompiler}), /fresh NFT/); assert.equal(f.calls.length, 2);
});

test('wrong compiler API/hash/domain, release, chain or random configuration rejects before fresh output', t => {
  const f = fixture(t);
  for (const change of [{sdkCommit: '0'.repeat(40)}, {clientCommit: '0'.repeat(40)}, {chainRootAt1: '0'.repeat(64)},
    {marketId: 41}, {intendedVaultId: 0}, {config: {...config, nftId: 41}}, {config: {...config, networkMagic: '1'}},
    {config: {...config, ordering: 'random'}}, {config: {...config, seed: '1'}}, {config: {...config, bootstrap: {}}},
    {compiler: {...f.spec.compiler, api: 'compile-nft-market-v1'}}, {compiler: {...f.spec.compiler, args: ['true']}},
    {compiler: {...f.spec.compiler, sha256: '0'.repeat(64)}}])
    assert.throws(() => buildCoreNft({...f.spec, ...change}, f.out, {runCompiler: f.runCompiler}));
  assert.equal(f.calls.length, 0); assert.equal(existsSync(f.out), false);
  assert.throws(() => buildCoreNft(f.spec, f.out, {runCompiler: () => ({status: 0, stdout: '1\n'})}), /domain differs/);
  assert.equal(existsSync(f.out), false);
});

test('failed compiler and wrong NFT foreign-read heights preserve failed originals without successful policy', t => {
  const f = fixture(t);
  const fail = (_compiler, args) => args[0] === 'network-magic' ? {status: 0, stdout: config.networkMagic} : {status: 2, stderr: 'HOST FAKE failure'};
  assert.throws(() => buildCoreNft(f.spec, f.out, {runCompiler: fail}), /compiler failed/);
  assert.equal(readFileSync(join(f.out, 'nftmarket/compile.log'), 'utf8'), 'HOST FAKE failure');
  assert.throws(() => buildCoreNft(f.spec, f.out, {runCompiler: f.runCompiler}), /fresh NFT/);
  const runner = (compiler, args) => {
    const result = f.runCompiler(compiler, args);
    if (args.length === 5) writeFileSync(join(args[1], 'FOREIGN_READ_AUDIT.json'), JSON.stringify({assetA: 41, assetB: 42,
      assetAHeight: 31, assetBHeight: 31, nativeHeight: 32, allReadsBound: true, financialOperations: 0, foreignReadCommandsChecked: 1}));
    return result;
  };
  const wrong = f.out + '-wrong'; assert.throws(() => buildCoreNft(f.spec, wrong, {runCompiler: runner}));
  assert.equal(existsSync(join(wrong, 'nftmarket/policy.json')), false); assert.equal(existsSync(join(wrong, 'BUILD.json')), false);
  assert.ok(existsSync(join(wrong, 'nftmarket/compiled/compilation_artifact.json')));
});

test('vault account may share a number with a separate contract namespace', t => {
  const f = fixture(t);
  for (const intendedVaultId of [1000, 41, 42]) {
    const result = buildCoreNft({...f.spec, intendedVaultId}, f.out + intendedVaultId, {runCompiler: f.runCompiler});
    assert.equal(result.intendedVaultId, intendedVaultId); assert.equal(result.liveAuthorization, false);
  }
});
