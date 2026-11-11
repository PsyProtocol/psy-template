import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildCoreBook, makeCoreBookPolicy, BOOK_COMPILER_API} from './core-build.mjs';
import {generateBatch, methodSpans} from '../../batching/v2/generate.mjs';
import {METHOD_INPUTS} from '../../token/wide/artifactGate.mjs';
import {sdkRelease} from '../../executor/sdkProfiles.mjs';

// Tiny synthetic ABI/IR envelopes exercise host checks only. The injected fake
// compiler below never launches a process or supplies native/proof evidence.
const release = sdkRelease('sdk-audit-20261102-v1');
const config = {assetA: 41, assetB: 42, networkMagic: '1384803358401154921'};
const anchor = 'ab'.repeat(32);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const felt = {kind: 'primitive', name: 'Felt'};
const pair = {kind: 'array', item: felt, length: 2, item_felt_size: 1};
function tokenFixture() {
  const methods = Object.entries(METHOD_INPUTS).map(([name, input_felt_count], i) => ({name, method_id: i + 1,
    input_felt_count, output_felt_count: 0, state_mutability: 'external', outputs: [],
    inputs: (name === 'claim' ? [felt] : name === 'transfer' ? [felt, pair] : []).map(type => ({type, felt_size: type === pair ? 2 : 1}))}));
  const fields = ['balance', 'total_minted', 'total_supply', 'max_supply', 'burn_requested'].map((name, i) => ({name, offset: 2 * i, felt_size: 2, type: pair}));
  fields.push({name: 'other_user_info', offset: 33554453, felt_size: 4 * 16777216,
    type: {kind: 'array', item: {kind: 'struct', name: 'TokenUserInfo'}, length: 16777216, item_felt_size: 4}});
  for (const [name, stride] of [['delegations', 5], ['delegation_spends', 4], ['burn_settled', 2]])
    fields.push({name, offset: 100663317, felt_size: stride, type: {kind: 'array', item_felt_size: stride}});
  return {state_tree_height: 31, abi: {contract: {state_tree_height: 31, methods, state: fields}, types: [
    {name: 'TokenUserInfo', kind: 'struct', felt_size: 4, fields: [
      {name: 'amount_sent', type: pair, offset_within_parent: 0, felt_size: 2},
      {name: 'amount_claimed', type: pair, offset_within_parent: 2, felt_size: 2}]}]},
    circuit_definitions: methods.map(m => ({name: m.name, circuit_inputs: Array(m.input_felt_count).fill(0)}))};
}
const source = generateBatch('orderbook', config);
const marketFixture = () => ({state_tree_height: 31, abi: {contract: {state_tree_height: 31,
  methods: methodSpans(source).map((m, i) => ({name: m.name, method_id: 100 + i, output_felt_count: 0,
    state_mutability: 'external', input_felt_count: [...m.signature.matchAll(/\b\w+:\s*(Felt|Hash|\[Felt;\s*(\d+)\])/g)]
      .reduce((n, match) => n + (match[1] === 'Hash' ? 4 : match[2] ? Number(match[2]) : 1), 0)}))}}});
const nativeFixture = {state_tree_height: 32, circuit_definitions: [
  ['claim', 3824212239, 1], ['transfer', 2789897329, 2], ['burn', 3998182541, 1],
].map(([name, method_id, count]) => ({name, method_id, circuit_inputs: Array(count).fill(0), circuit_outputs: []}))};
const bytesWithU64 = value => Buffer.from(JSON.stringify({...value, bytecode_test_constant: '18446744069414584320'})
  .replace('"18446744069414584320"', '18446744069414584320'));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'book-core-host-')); t.after(() => rmSync(root, {recursive: true, force: true}));
  const data = {compiler: Buffer.from('host fake compiler; never execute'), native: bytesWithU64(nativeFixture),
    tokenA: bytesWithU64(tokenFixture()), tokenB: bytesWithU64(tokenFixture())};
  const records = Object.fromEntries(Object.entries(data).map(([name, bytes]) => {
    const path = join(root, name); writeFileSync(path, bytes); return [name, {path, sha256: digest(bytes)}];
  }));
  const spec = {schema: 1, sdkCommit: release.sdkCommit, clientCommit: release.clientCommit, chainRootAt1: anchor,
    marketId: 1000, intendedVaultId: 100, config, ...records, compiler: {...records.compiler, api: BOOK_COMPILER_API}};
  const calls = [];
  const runCompiler = (compiler, args) => {
    calls.push({compiler, args});
    if (args.length === 1 && args[0] === 'network-magic') return {status: 0, stdout: config.networkMagic + '\n'};
    assert.equal(args.length, 5); assert.deepEqual(args.slice(2), ['41', '42', 'false']);
    assert.match(args[0], /orderbook\/main\.psy\.rs$/);
    assert.equal(readFileSync(args[0], 'utf8'), source);
    mkdirSync(args[1]);
    writeFileSync(join(args[1], 'compilation_artifact.json'), bytesWithU64(marketFixture()));
    writeFileSync(join(args[1], 'FOREIGN_READ_AUDIT.json'), JSON.stringify({assetA: 41, assetB: 42,
      assetAHeight: 31, assetBHeight: 31, nativeHeight: 32, allReadsBound: true, financialOperations: 0, foreignReadCommandsChecked: 1}));
    return {status: 0, stdout: 'host fake compiler output only'};
  };
  return {root, spec, data, calls, runCompiler, out: join(root, 'fresh')};
}

test('selected Book policy preserves deterministic whole-order scope and fixed release', () => {
  const p = makeCoreBookPolicy(1000, config, marketFixture(), tokenFixture(), anchor);
  assert.equal(p.market, 'orderbook'); assert.equal(p.version, 2);
  assert.equal(p.execution_scope, 'explicit-selected-orders-v1');
  assert.equal(p.whole_market_completeness, false); assert.equal(p.qualified_randomness, false);
  assert.equal(p.sdk_commit, release.sdkCommit); assert.equal(p.client_commit, release.clientCommit);
  assert.equal(p.native_protocol, 'mainnet-beta-20261027');
  assert.ok(!Object.hasOwn(p, 'intendedVaultId'));
  assert.match(source, /price time ranking/); assert.match(source, /earlier compatible ask/);
  assert.match(source, /earlier compatible bid/); assert.match(source, /compatible pair left unfilled/);
  assert.match(source, /pub fn request_cancel/); assert.match(source, /pub fn refund_funding/);
  assert.doesNotMatch(source, /stream_|admission_/);
  for (const b of p.branches) for (const c of b.calls) if (c.contract_id === 0)
    assert.ok(['claim', 'transfer', 'burn'].includes(c.method_name));
});

test('host fake build copies original full-u64 dependency/artifact bytes and records no acceptance', t => {
  const f = fixture(t), report = buildCoreBook(f.spec, f.out, {runCompiler: f.runCompiler});
  for (const [path, role] of [['native.json', 'native'], ['token/compilation_artifact.json', 'tokenA'], ['token-b/compilation_artifact.json', 'tokenB']])
    assert.deepEqual(readFileSync(join(f.out, path)), f.data[role]);
  const artifact = readFileSync(join(f.out, 'orderbook/compiled/compilation_artifact.json'));
  assert.ok(artifact.includes(Buffer.from('18446744069414584320')));
  assert.equal(report.artifactSha256, digest(artifact));
  assert.equal(report.intendedVaultId, 100); assert.match(report.vaultIdentityBinding, /not a cryptographic/);
  for (const field of ['fullUpsVerified', 'sdKeyProofVerified', 'liveAuthorization']) assert.equal(report[field], false);
  assert.equal(report.financialOperations, 0); assert.equal(f.calls.length, 2);
  assert.throws(() => buildCoreBook(f.spec, f.out, {runCompiler: f.runCompiler}), /fresh Book/);
  assert.equal(f.calls.length, 2);
});

test('compiler interface, hash and domain failures reject before candidate creation', t => {
  const f = fixture(t);
  for (const compiler of [{...f.spec.compiler, api: 'compile-market-v1'}, {...f.spec.compiler, args: ['false']},
    {...f.spec.compiler, sha256: '0'.repeat(64)}])
    assert.throws(() => buildCoreBook({...f.spec, compiler}, f.out, {runCompiler: f.runCompiler}));
  assert.throws(() => buildCoreBook({...f.spec, compilerArgs: ['0']}, f.out, {runCompiler: f.runCompiler}));
  assert.equal(f.calls.length, 0); assert.equal(existsSync(f.out), false);
  assert.throws(() => buildCoreBook(f.spec, f.out, {runCompiler: () => ({status: 0, stdout: '1\n'})}), /domain differs/);
  assert.equal(existsSync(f.out), false);
});

test('failed compiler artifacts remain immutable and unsupported flag result is rejected', t => {
  const f = fixture(t);
  const fakeReject = (_compiler, args) => args[0] === 'network-magic'
    ? {status: 0, stdout: config.networkMagic} : {status: 9, stderr: 'host fake unsupported bool argument'};
  assert.throws(() => buildCoreBook(f.spec, f.out, {runCompiler: fakeReject}), /compiler failed/);
  const log = join(f.out, 'orderbook/compile.log'); assert.equal(readFileSync(log, 'utf8'), 'host fake unsupported bool argument');
  assert.throws(() => buildCoreBook(f.spec, f.out, {runCompiler: f.runCompiler}), /fresh Book/);
  assert.equal(readFileSync(log, 'utf8'), 'host fake unsupported bool argument');
});

test('wrong identities, chain/release, random mechanisms and altered ABI fail closed', t => {
  const f = fixture(t);
  for (const change of [{sdkCommit: '0'.repeat(40)}, {clientCommit: '0'.repeat(40)}, {chainRootAt1: '0'.repeat(64)},
    {marketId: 41}, {intendedVaultId: 42}, {config: {...config, assetB: 41}}, {config: {...config, networkMagic: '1'}},
    {config: {...config, ordering: 'random'}}, {config: {...config, seed: '1'}}, {config: {...config, bootstrap: {}}}])
    assert.throws(() => buildCoreBook({...f.spec, ...change}, f.out, {runCompiler: f.runCompiler}));
  assert.equal(f.calls.length, 0);
  const a = marketFixture(); a.abi.contract.methods.find(m => m.name === 'open_sell').input_felt_count = 6;
  assert.throws(() => makeCoreBookPolicy(1000, config, a, tokenFixture(), anchor));
  a.abi.contract.methods.push({name: 'stream_seal'});
  assert.throws(() => makeCoreBookPolicy(1000, config, a, tokenFixture(), anchor));
});

test('wrong compiler foreign-read audit cannot publish a policy or successful manifest', t => {
  const f = fixture(t), runner = (compiler, args) => {
    const result = f.runCompiler(compiler, args);
    if (args.length === 5) writeFileSync(join(args[1], 'FOREIGN_READ_AUDIT.json'), JSON.stringify({
      assetA: 41, assetB: 42, assetAHeight: 31, assetBHeight: 30, nativeHeight: 32,
      allReadsBound: true, financialOperations: 0, foreignReadCommandsChecked: 1}));
    return result;
  };
  assert.throws(() => buildCoreBook(f.spec, f.out, {runCompiler: runner}));
  assert.ok(existsSync(join(f.out, 'orderbook/compiled/compilation_artifact.json')));
  assert.equal(existsSync(join(f.out, 'orderbook/policy.json')), false);
  assert.equal(existsSync(join(f.out, 'BUILD.json')), false);
});
