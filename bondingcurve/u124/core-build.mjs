// Fresh deterministic Curve candidates only. No network calls or registration.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {generateBatch} from '../../batching/v2/generate.mjs';
import {makeBatchPolicy} from '../../batching/v2/policy.mjs';
import {bindNativePolicy, validateNativeArtifact, PROFILE} from '../../batching/mainnet-beta/native.mjs';
import {assertDeterministicOrdering} from '../../batching/random-order/sourceGate.mjs';
import {validateConfig} from '../../amm/u124/build.mjs';
import {tokenGate} from '../../amm/u124/artifactGate.mjs';
import {sdkRelease} from '../../executor/sdkProfiles.mjs';

const release = sdkRelease('sdk-audit-20261102-v1');
export const CURVE_COMPILER_API = 'compile-pair-stream-market-v1';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const id = n => Number.isSafeInteger(n) && n >= 5 && n < 2 ** 24;
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
function curveConfig(marketId, config, chainRootAt1) {
  assertDeterministicOrdering(config);
  validateConfig(config);
  assert.equal(config.networkMagic, '1384803358401154921', 'selected network domain');
  assert.ok(!config.bootstrap, 'AMM bootstrap requires separate acceptance');
  assert.ok(id(marketId) && ![config.assetA, config.assetB].includes(marketId), 'distinct Curve market identity');
  assert.match(chainRootAt1 ?? '', /^[a-f0-9]{64}$/, 'explicit chain instance');
  assert.notEqual(chainRootAt1, '0'.repeat(64));
}

export function validateCurveCoreSpec(spec) {
  assert.equal(spec.schema, 1);
  assert.equal(spec.sdkCommit, release.sdkCommit);
  assert.equal(spec.clientCommit, release.clientCommit);
  curveConfig(spec.marketId, spec.config, spec.chainRootAt1);
  assert.equal(spec.compiler?.api, CURVE_COMPILER_API, 'unsupported Curve compiler interface');
  assert.deepEqual(Object.keys(spec.compiler).sort(), ['api', 'path', 'sha256'], 'no arbitrary compiler arguments');
  for (const role of ['compiler', 'native', 'tokenA', 'tokenB']) {
    assert.equal(typeof spec[role]?.path, 'string', 'reviewed input path ' + role);
    assert.ok(spec[role].path.length > 0);
    assert.match(spec[role].sha256 ?? '', /^[a-f0-9]{64}$/, 'reviewed input hash ' + role);
  }
  return spec;
}

export function makeCurveCorePolicy(marketId, config, artifact, token, chainRootAt1) {
  curveConfig(marketId, config, chainRootAt1);
  assert.equal(artifact.state_tree_height, 31);
  assert.equal(artifact.abi.contract.name, 'U124Curve');
  assert.equal(artifact.abi.contract.state_tree_height, 31);
  assert.ok(!artifact.abi.contract.methods.some(m => /stream|admission|source|scan/.test(m.name)), 'selected-order Curve ABI only');
  const methods = artifact.abi.contract.methods;
  assert.equal(new Set(methods.map(m => m.name)).size, methods.length, 'unique Curve methods');
  // These are emitted by the existing v2 generator and used by the ordinary
  // client. Policy construction alone validates only vault-side operations.
  for (const [name, arity] of [['open_limit_buy', 7], ['open_limit_sell', 7], ['request_cancel', 0], ['request_recovery', 1]]) {
    const m = methods.find(m => m.name === name);
    assert.equal(m?.input_felt_count, arity, 'Curve ordinary method ' + name);
    assert.equal(m.output_felt_count, 0); assert.equal(m.state_mutability, 'external');
  }
  const base = makeBatchPolicy('bondingcurve', marketId, config, artifact.abi, token.abi, null);
  const policy = bindNativePolicy(base, PROFILE);
  return {...policy, sdk_commit: release.sdkCommit, client_commit: release.clientCommit,
    execution_scope: 'explicit-selected-orders-v1', chain_root_at1: chainRootAt1,
    qualified_randomness: false, whole_market_completeness: false,
    formal_executor_integrated: false, live_authorization: false};
}

function reviewedBytes(record, role) {
  const bytes = readFileSync(record.path);
  assert.equal(hash(bytes), record.sha256, 'exact reviewed input ' + role);
  return bytes;
}

// Preparation is available separately for host review. It does not execute the
// compiler, construct a proof, fetch identities or authorize any financial use.
export function prepareCurveCoreBuild(spec, freshOutput) {
  validateCurveCoreSpec(spec);
  const out = resolve(freshOutput);
  assert.ok(!existsSync(out), 'fresh Curve output required; preserve prior evidence');
  const bytes = Object.fromEntries(['compiler', 'native', 'tokenA', 'tokenB']
    .map(role => [role, reviewedBytes(spec[role], role)]));
  const native = JSON.parse(bytes.native), tokenA = JSON.parse(bytes.tokenA), tokenB = JSON.parse(bytes.tokenB);
  validateNativeArtifact(native, PROFILE);
  tokenGate(tokenA); tokenGate(tokenB);
  for (const name of ['claim', 'transfer']) assert.equal(
    tokenA.abi.contract.methods.find(m => m.name === name).method_id,
    tokenB.abi.contract.methods.find(m => m.name === name).method_id, 'matching U124 method ' + name);
  const source = generateBatch('bondingcurve', spec.config);
  assert.ok(!source.includes('stream_') && !source.includes('admission_'), 'no source traversal or admission dependency');
  mkdirSync(out, {recursive: true});
  for (const [path, role] of [['native.json', 'native'], ['token/compilation_artifact.json', 'tokenA'],
    ['token-b/compilation_artifact.json', 'tokenB']]) {
    mkdirSync(dirname(join(out, path)), {recursive: true});
    // Full-u64 bytecode constants cannot survive JavaScript Number round trips.
    // Parsed objects above are for ABI checks; copy the reviewed bytes verbatim.
    writeFileSync(join(out, path), bytes[role], {flag: 'wx'});
    assert.equal(hash(readFileSync(join(out, path))), spec[role].sha256);
  }
  mkdirSync(join(out, 'bondingcurve'));
  writeFileSync(join(out, 'bondingcurve/main.psy.rs'), source, {flag: 'wx'});
  const prepared = {schema: 1, sdkCommit: release.sdkCommit, clientCommit: release.clientCommit,
    chainRootAt1: spec.chainRootAt1, declaredMarketId: spec.marketId, inputs: spec,
    sourceSha256: hash(Buffer.from(source)), executionScope: 'explicit-selected-orders-v1',
    compilerRan: false, compilerDomainVerified: false, fullUpsVerified: false, financialOperations: 0, liveAuthorization: false,
    actualDeploymentBound: false, formalExecutorIntegrated: false};
  save(join(out, 'PREPARED.json'), prepared);
  return prepared;
}

export function buildCurveCore(spec, freshOutput, {runCompiler = spawnSync} = {}) {
  const prepared = prepareCurveCoreBuild(spec, freshOutput), out = resolve(freshOutput);
  const market = join(out, 'bondingcurve');
  reviewedBytes(spec.compiler, 'compiler');
  const compiler = resolve(spec.compiler.path);
  const domain = runCompiler(compiler, ['network-magic'], {encoding: 'utf8', timeout: 30000, maxBuffer: 100000});
  writeFileSync(join(market, 'compiler-domain.log'), (domain.stdout ?? '') + (domain.stderr ?? '') + (domain.error?.message ?? ''), {flag: 'wx'});
  assert.ok(!domain.error && !domain.signal && domain.status === 0 && /^\d+\s*$/.test(domain.stdout ?? ''), 'Curve compiler network domain probe');
  assert.equal(domain.stdout.trim(), spec.config.networkMagic, 'Curve compiler domain differs from selected release');
  // compile_pair_stream_market.rs parses the fifth argument as a Rust bool.
  // compile_market and compile_batch use incompatible CLI argument contracts.
  const result = runCompiler(compiler, [join(market, 'main.psy.rs'), join(market, 'compiled'),
    String(spec.config.assetA), String(spec.config.assetB), 'false'],
    {encoding: 'utf8', timeout: 180000, maxBuffer: 4000000});
  writeFileSync(join(market, 'compile.log'), (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.message ?? ''), {flag: 'wx'});
  assert.ok(!result.error && !result.signal && result.status === 0, 'preserve failed compiler output; never overwrite');
  const artifactBytes = readFileSync(join(market, 'compiled/compilation_artifact.json'));
  const auditBytes = readFileSync(join(market, 'compiled/FOREIGN_READ_AUDIT.json'));
  const audit = JSON.parse(auditBytes);
  assert.deepEqual({assetA: audit.assetA, assetB: audit.assetB, assetAHeight: audit.assetAHeight,
    assetBHeight: audit.assetBHeight, nativeHeight: audit.nativeHeight,
    allReadsBound: audit.allReadsBound, financialOperations: audit.financialOperations},
  {assetA: spec.config.assetA, assetB: spec.config.assetB, assetAHeight: 31, assetBHeight: 31,
    nativeHeight: 32, allReadsBound: true, financialOperations: 0}, 'Curve compiler foreign-read audit');
  assert.ok(Number.isSafeInteger(audit.foreignReadCommandsChecked) && audit.foreignReadCommandsChecked > 0, 'positive foreign-read audit count');
  const tokenBytes = readFileSync(join(out, 'token/compilation_artifact.json'));
  assert.equal(hash(tokenBytes), spec.tokenA.sha256);
  const policy = makeCurveCorePolicy(spec.marketId, spec.config, JSON.parse(artifactBytes), JSON.parse(tokenBytes), spec.chainRootAt1);
  save(join(market, 'config.json'), spec.config); save(join(market, 'policy.json'), policy);
  const report = {...prepared, compilerRan: true, compilerDomainVerified: true, artifactSha256: hash(artifactBytes),
    foreignReadAuditSha256: hash(auditBytes),
    policySha256: hash(readFileSync(join(market, 'policy.json'))),
    scope: 'New Curve candidate only. Confirmed asset/issuer/target identities, deployment roots, actual market ID, registered key, native scope and formal Executor integration, complete UPSs, funding, settlement/refunds/graduation and ordinary final claims still require acceptance.'};
  save(join(out, 'BUILD.json'), report);
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4, 'REVIEWED_SPEC FRESH_OUTPUT');
  console.log(JSON.stringify(buildCurveCore(JSON.parse(readFileSync(process.argv[2], 'utf8')), process.argv[3])));
}
