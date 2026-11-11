import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {generateBatch} from '../../batching/v2/generate.mjs';
import {validateCurveCoreSpec, makeCurveCorePolicy, prepareCurveCoreBuild, buildCurveCore, CURVE_COMPILER_API} from './core-build.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const config = {assetA: 60, assetB: 61, issuer: 5, target: 400, cap: 10, liquidity: 2,
  threshold: 8, unit: String(1n << 80n), base: '1000', step: '10', networkMagic: '1384803358401154921'};
// Synthetic ABI checks policy construction only; it is not compiled bytecode.
const methods = {noop: 0, initialize: 0, open_buy: 7, open_sell: 7, close_buy: 0, close_sell: 0,
  settle_buy: 7, settle_sell: 7, settle_limit_buy: 9, settle_limit_sell: 7,
  batch_refund_curve_buy: 7, batch_refund_curve_sell: 7, graduate: 5, activate_batch_vault: 1,
  refund_funding: 8, fund_gas: 2, recover_funding: 7, commit_batch: 12,
  begin_batch: 5, finish_batch: 1, expire_batch: 1, open_limit_buy: 7, open_limit_sell: 7,
  request_cancel: 0, request_recovery: 1};
const abi = arities => ({contract: {name: 'U124Curve', state_tree_height: 31,
  methods: Object.entries(arities).map(([name, input_felt_count], i) => ({name,
    method_id: i + 1, input_felt_count, output_felt_count: 0, state_mutability: 'external'}))}});
const artifact = {state_tree_height: 31, abi: abi(methods)};
const token = {abi: abi({claim: 1, transfer: 3})};
const anchor = '1'.repeat(64);
const policy = (c = config, a = artifact, root = anchor, marketId = 1000) =>
  makeCurveCorePolicy(marketId, c, a, token, root);

test('selected Curve policy keeps fixed issuer/target/assets, limit refunds and current Native calls', () => {
  const p = policy();
  assert.equal(p.market, 'bondingcurve'); assert.deepEqual(p.config, config);
  assert.equal(p.execution_scope, 'explicit-selected-orders-v1');
  assert.equal(p.sdk_commit, '01b8f2b0a077367a7b9879baba1a72aea8ab5510');
  assert.equal(p.client_commit, '7058070057c3242b5d8b29e1a31d498aaa4202c0');
  for (const key of ['whole_market_completeness', 'qualified_randomness', 'formal_executor_integrated', 'live_authorization']) assert.equal(p[key], false);
  const init = p.operations.find(o => o.name === 'initialize');
  assert.deepEqual(init.calls.filter(c => c.method_name === 'claim').map(c => [c.contract_id, c.inputs]),
    [[0, [{constant: '5'}]], [60, [{constant: '5'}]]]);
  const graduation = p.operations.find(o => o.name === 'graduate');
  assert.deepEqual(graduation.calls[0].inputs[0], {constant: '400'});
  assert.deepEqual(graduation.calls.filter(c => c.method_name === 'transfer')
    .map(c => [c.contract_id, c.inputs[0]]), [[61, {constant: '400'}], [60, {constant: '400'}]]);
  for (const name of ['settle_buy', 'settle_sell', 'settle_limit_buy_exact', 'settle_limit_buy_change',
    'settle_limit_sell', 'refund_buy', 'refund_sell']) assert.ok(p.operations.some(o => o.name === name));
  const native = {claim: 3824212239, transfer: 2789897329, burn: 3998182541};
  const ids = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'contract_id')) {
      ids.add(value.contract_id);
      if (value.contract_id === 0) assert.equal(value.method_id, native[value.method_name]);
    }
    Object.values(value).forEach(visit);
  };
  visit(p); assert.deepEqual([...ids].sort((a, b) => a - b), [0, 60, 61, 1000]);
});

test('Curve builder rejects invalid fixed terms, aliases, bootstrap, random mode and chain substitution', () => {
  for (const change of [{issuer: 0}, {target: 0}, {target: 5}, {assetB: 60}, {assetA: 0},
    {assetA: 2 ** 24}, {cap: 0}, {threshold: 11}, {liquidity: 1000001}, {unit: 1},
    {unit: String((1n << 124n) - 1n)}, {base: String((1n << 124n) - 1n)},
    {networkMagic: '1'}, {ordering: 'random'}, {seed: '1'}, {bootstrap: {}}]) assert.throws(() => policy({...config, ...change}));
  for (const root of [undefined, '0'.repeat(64), 'x'.repeat(64)])
    assert.throws(() => makeCurveCorePolicy(1000, config, artifact, token, root));
  for (const marketId of [4, 60, 61, 2 ** 24]) assert.throws(() => policy(config, artifact, anchor, marketId));
  assert.throws(() => policy(config, {...artifact, state_tree_height: 32}));
  assert.throws(() => policy(config, {state_tree_height: 31, abi: abi({...methods, stream_open: 1})}));
  assert.throws(() => policy(config, {state_tree_height: 31, abi: abi({...methods, settle_limit_buy: 8})}));
});

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'psy-curve-core-host-'));
  try {
    const tokenBytes = readFileSync(new URL('../../token/wide/verification-2026-10-12/compiled-reviewed/compilation_artifact.json', import.meta.url));
    // This deliberate full-u64 literal would change under JSON Number output.
    const bytes = Buffer.concat([Buffer.from('{"host_u64_probe":18446744069414584321,'), tokenBytes.subarray(1)]);
    const native = {state_tree_height: 32, host_u64_probe: '18446744069414584321', circuit_definitions:
      [['claim', 3824212239, 1], ['transfer', 2789897329, 2], ['burn', 3998182541, 1]]
        .map(([name, method_id, arity]) => ({name, method_id, circuit_inputs: Array(arity).fill(0), circuit_outputs: []}))};
    const inputs = {compiler: Buffer.from('Host fixture: never execute this file.\n'),
      native: Buffer.from(JSON.stringify(native)), tokenA: bytes, tokenB: bytes};
    const spec = {schema: 1, sdkCommit: '01b8f2b0a077367a7b9879baba1a72aea8ab5510',
      clientCommit: '7058070057c3242b5d8b29e1a31d498aaa4202c0', marketId: 1000, config, chainRootAt1: anchor};
    for (const [role, value] of Object.entries(inputs)) {
      const path = join(directory, role); writeFileSync(path, value);
      spec[role] = {path, sha256: sha(value)};
    }
    spec.compiler.api = CURVE_COMPILER_API;
    run({directory, spec, inputs});
  } finally {rmSync(directory, {recursive: true, force: true});}
}

test('host preparation pins bytes and emits exactly the existing deterministic Curve source without a compiler', () => fixture(({directory, spec, inputs}) => {
  const output = join(directory, 'prepared'), p = prepareCurveCoreBuild(spec, output);
  for (const [path, role] of [['native.json', 'native'], ['token/compilation_artifact.json', 'tokenA'],
    ['token-b/compilation_artifact.json', 'tokenB']]) assert.deepEqual(readFileSync(join(output, path)), inputs[role]);
  const source = readFileSync(join(output, 'bondingcurve/main.psy.rs'), 'utf8');
  assert.equal(source, generateBatch('bondingcurve', config));
  assert.equal(sha(Buffer.from(source)), p.sourceSha256);
  assert.ok(!source.includes('stream_') && !source.includes('admission_'));
  for (const name of ['compilerRan', 'compilerDomainVerified', 'fullUpsVerified', 'actualDeploymentBound', 'formalExecutorIntegrated', 'liveAuthorization']) assert.equal(p[name], false);
  assert.equal(p.financialOperations, 0);
  assert.ok(!existsSync(join(output, 'BUILD.json')) && !existsSync(join(output, 'bondingcurve/compiled')));
  assert.throws(() => prepareCurveCoreBuild(spec, output), /fresh Curve output/);
  assert.equal(readFileSync(join(output, 'bondingcurve/main.psy.rs'), 'utf8'), source);
}));

test('spec and dependency substitution fail before preparation or any compiler invocation', () => fixture(({directory, spec}) => {
  for (const change of [{schema: 2}, {sdkCommit: '0'.repeat(40)}, {clientCommit: '0'.repeat(40)},
    {compiler: {...spec.compiler, sha256: 'invalid'}}, {compiler: {...spec.compiler, api: 'compile-market-v1'}},
    {compiler: {...spec.compiler, args: ['0']}}]) assert.throws(() => validateCurveCoreSpec({...spec, ...change}));
  for (const role of ['compiler', 'native', 'tokenA', 'tokenB']) {
    const output = join(directory, 'changed-' + role);
    assert.throws(() => prepareCurveCoreBuild({...spec, [role]: {...spec[role], sha256: '0'.repeat(64)}}, output), /exact reviewed input/);
    assert.ok(!existsSync(output));
  }
  const mismatch = JSON.parse(readFileSync(spec.tokenB.path));
  mismatch.abi.contract.methods.find(m => m.name === 'transfer').method_id += 1;
  const changed = Buffer.from(JSON.stringify(mismatch)), path = join(directory, 'changed-token');
  writeFileSync(path, changed);
  assert.throws(() => prepareCurveCoreBuild({...spec, tokenB: {path, sha256: sha(changed)}}, join(directory, 'bad-method')), /matching U124 method/);
  assert.ok(!existsSync(join(directory, 'bad-method')));
}));

// These control-flow checks inject a host fake compiler. No compiler process
// runs, and these fixtures supply no native compilation or proof evidence.
function fakeCompiler(spec, calls, {domain = config.networkMagic, audit = {}, reject = false} = {}) {
  return (path, args) => {
    assert.equal(path, spec.compiler.path); calls.push(args);
    if (args.length === 1 && args[0] === 'network-magic') return {status: 0, stdout: domain + '\n'};
    assert.equal(args.length, 5); assert.deepEqual(args.slice(2), ['60', '61', 'false']);
    assert.equal(readFileSync(args[0], 'utf8'), generateBatch('bondingcurve', config));
    if (reject) return {status: 7, stderr: 'host fake unsupported bool argument'};
    mkdirSync(args[1]);
    const bytes = Buffer.from(JSON.stringify({...artifact, host_u64_probe: '18446744069414584321'})
      .replace('"18446744069414584321"', '18446744069414584321'));
    writeFileSync(join(args[1], 'compilation_artifact.json'), bytes);
    writeFileSync(join(args[1], 'FOREIGN_READ_AUDIT.json'), JSON.stringify({assetA: 60, assetB: 61,
      assetAHeight: 31, assetBHeight: 31, nativeHeight: 32, allReadsBound: true,
      foreignReadCommandsChecked: 1, financialOperations: 0, ...audit}));
    return {status: 0, stdout: 'host fake compilation only'};
  };
}

test('host fake compiler uses the exact declared API and retains full-u64 output bytes', () => fixture(({directory, spec}) => {
  const calls = [], output = join(directory, 'fake-built');
  const report = buildCurveCore(spec, output, {runCompiler: fakeCompiler(spec, calls)});
  assert.deepEqual(calls[0], ['network-magic']); assert.equal(calls.length, 2);
  const bytes = readFileSync(join(output, 'bondingcurve/compiled/compilation_artifact.json'));
  assert.ok(bytes.includes(Buffer.from('18446744069414584321')));
  assert.equal(report.artifactSha256, sha(bytes)); assert.equal(report.compilerDomainVerified, true);
  assert.equal(report.foreignReadAuditSha256, sha(readFileSync(join(output, 'bondingcurve/compiled/FOREIGN_READ_AUDIT.json'))));
  for (const key of ['fullUpsVerified', 'actualDeploymentBound', 'formalExecutorIntegrated', 'liveAuthorization']) assert.equal(report[key], false);
}));

test('wrong compiler domain stops before compile and preserves prepared evidence', () => fixture(({directory, spec}) => {
  const calls = [], output = join(directory, 'wrong-domain');
  assert.throws(() => buildCurveCore(spec, output, {runCompiler: fakeCompiler(spec, calls, {domain: '1'})}), /domain differs/);
  assert.equal(calls.length, 1); assert.ok(existsSync(join(output, 'PREPARED.json')));
  assert.equal(existsSync(join(output, 'bondingcurve/compiled')), false);
  assert.equal(existsSync(join(output, 'BUILD.json')), false);
  assert.throws(() => buildCurveCore(spec, output, {runCompiler: fakeCompiler(spec, calls)}), /fresh Curve/);
  assert.equal(calls.length, 1);
}));

test('unsupported fake compiler invocation and wrong foreign-read audit cannot publish success', () => fixture(({directory, spec}) => {
  const rejected = join(directory, 'fake-reject');
  assert.throws(() => buildCurveCore(spec, rejected, {runCompiler: fakeCompiler(spec, [], {reject: true})}), /preserve failed compiler/);
  assert.equal(readFileSync(join(rejected, 'bondingcurve/compile.log'), 'utf8'), 'host fake unsupported bool argument');
  assert.equal(existsSync(join(rejected, 'BUILD.json')), false);
  for (const [i, audit] of [{assetBHeight: 30}, {assetA: 99}, {allReadsBound: false}, {foreignReadCommandsChecked: 0}].entries()) {
    const output = join(directory, 'bad-audit-' + i);
    assert.throws(() => buildCurveCore(spec, output, {runCompiler: fakeCompiler(spec, [], {audit})}));
    assert.ok(existsSync(join(output, 'bondingcurve/compiled/compilation_artifact.json')));
    assert.equal(existsSync(join(output, 'bondingcurve/policy.json')), false);
    assert.equal(existsSync(join(output, 'BUILD.json')), false);
  }
}));

test('Curve ordinary client methods must exist with the emitted v2 arities before publishing policy', () => {
  for (const name of ['open_limit_buy', 'open_limit_sell', 'request_cancel', 'request_recovery']) {
    const missing = structuredClone(artifact);
    missing.abi.contract.methods = missing.abi.contract.methods.filter(m => m.name !== name);
    assert.throws(() => policy(config, missing), /Curve ordinary method/);
    const wrong = structuredClone(artifact); wrong.abi.contract.methods.find(m => m.name === name).input_felt_count += 1;
    assert.throws(() => policy(config, wrong), /Curve ordinary method/);
  }
  const generated = generateBatch('bondingcurve', config);
  for (const name of ['open_limit_buy', 'open_limit_sell', 'request_cancel', 'request_recovery'])
    assert.ok(generated.includes('pub fn ' + name + '('), 'existing generator method ' + name);
});
