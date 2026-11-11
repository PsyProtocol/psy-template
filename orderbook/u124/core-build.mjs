// Fresh selected-order Book candidates only. No deployment, key registration,
// proof generation, account-universe traversal or financial authorization.
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
import {tokenGate} from '../../amm/u124/artifactGate.mjs';
import {validateU124TokenAbi} from '../../executor/u124Abi.mjs';
import {sdkRelease} from '../../executor/sdkProfiles.mjs';

export const BOOK_COMPILER_API = 'compile-pair-stream-market-v1';
const release = sdkRelease('sdk-audit-20261102-v1');
const DOMAIN = '1384803358401154921';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const id = n => Number.isSafeInteger(n) && n >= 5 && n < 2 ** 24;
const save = (p, value) => writeFileSync(p, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});

function configuration(marketId, config, chainRootAt1) {
  assertDeterministicOrdering(config);
  for (const name of Object.keys(config)) assert.ok(['assetA', 'assetB', 'networkMagic', 'ordering'].includes(name), 'unsupported Book configuration ' + name);
  assert.equal(config.networkMagic, DOMAIN, 'fixed selected network domain');
  assert.ok(id(marketId) && id(config.assetA) && id(config.assetB));
  assert.equal(new Set([marketId, config.assetA, config.assetB]).size, 3, 'distinct market and U124 assets');
  assert.match(chainRootAt1 ?? '', /^[a-f0-9]{64}$/, 'explicit chain instance');
  assert.notEqual(chainRootAt1, '0'.repeat(64));
}

export function makeCoreBookPolicy(marketId, config, artifact, token, chainRootAt1) {
  configuration(marketId, config, chainRootAt1);
  assert.equal(artifact.state_tree_height, 31);
  assert.equal(artifact.abi.contract.state_tree_height, 31);
  validateU124TokenAbi(token.abi);
  const methods = artifact.abi.contract.methods;
  assert.equal(new Set(methods.map(m => m.name)).size, methods.length, 'unique Book methods');
  assert.ok(!methods.some(m => /stream|admission|source|scan/.test(m.name)), 'selected Book has no global coverage methods');
  for (const [name, arity] of [['open_sell', 8], ['close_0', 0], ['close_1', 0], ['request_cancel', 0]]) {
    const m = methods.find(m => m.name === name);
    assert.equal(m?.input_felt_count, arity, 'Book ordinary method ' + name);
    assert.equal(m.output_felt_count, 0);
    assert.equal(m.state_mutability, 'external');
  }
  const p = bindNativePolicy(makeBatchPolicy('orderbook', marketId, config, artifact.abi, token.abi, null), PROFILE);
  return {...p, sdk_commit: release.sdkCommit, client_commit: release.clientCommit,
    execution_scope: 'explicit-selected-orders-v1', chain_root_at1: chainRootAt1,
    whole_market_completeness: false, qualified_randomness: false};
}

export function buildCoreBook(spec, freshOutput, {runCompiler = spawnSync} = {}) {
  assert.equal(spec.schema, 1);
  assert.deepEqual(Object.keys(spec).sort(), ['schema', 'sdkCommit', 'clientCommit', 'chainRootAt1', 'marketId',
    'intendedVaultId', 'config', 'compiler', 'native', 'tokenA', 'tokenB'].sort(), 'explicit Book build spec only');
  assert.equal(spec.sdkCommit, release.sdkCommit); assert.equal(spec.clientCommit, release.clientCommit);
  configuration(spec.marketId, spec.config, spec.chainRootAt1);
  // This is reviewed deployment intent only. It is not a vault binding in the
  // existing v2 contract/SD-key, and is deliberately excluded from the policy.
  assert.ok(Number.isSafeInteger(spec.intendedVaultId) && spec.intendedVaultId > 0 && spec.intendedVaultId < 2 ** 24, 'explicit intended vault');
  assert.ok(![spec.marketId, spec.config.assetA, spec.config.assetB].includes(spec.intendedVaultId), 'distinct intended identity numbers');
  assert.equal(spec.compiler.api, BOOK_COMPILER_API, 'unsupported compiler interface');
  assert.deepEqual(Object.keys(spec.compiler).sort(), ['api', 'path', 'sha256'], 'no arbitrary compiler arguments');
  const out = resolve(freshOutput);
  assert.ok(!existsSync(out), 'fresh Book output required');
  const inputs = {}, original = {};
  for (const role of ['compiler', 'native', 'tokenA', 'tokenB']) {
    const record = spec[role];
    assert.equal(typeof record.path, 'string'); assert.match(record.sha256, /^[a-f0-9]{64}$/);
    const bytes = readFileSync(record.path);
    assert.equal(sha(bytes), record.sha256, 'exact reviewed input ' + role);
    original[role] = bytes; inputs[role] = role === 'compiler' ? bytes : JSON.parse(bytes);
  }
  validateNativeArtifact(inputs.native, PROFILE);
  for (const token of [inputs.tokenA, inputs.tokenB]) {tokenGate(token); validateU124TokenAbi(token.abi);}
  for (const name of ['claim', 'transfer']) assert.equal(
    inputs.tokenA.abi.contract.methods.find(m => m.name === name).method_id,
    inputs.tokenB.abi.contract.methods.find(m => m.name === name).method_id, 'same U124 token interface');
  const compiler = resolve(spec.compiler.path);
  const domain = runCompiler(compiler, ['network-magic'], {encoding: 'utf8', timeout: 30000, maxBuffer: 100000});
  assert.ok(!domain.error && !domain.signal && domain.status === 0 && /^\d+\s*$/.test(domain.stdout ?? ''), 'compiler network domain probe');
  assert.equal(domain.stdout.trim(), DOMAIN, 'compiler domain differs from selected release');
  const source = generateBatch('orderbook', spec.config);
  assert.ok(!source.includes('stream_') && !source.includes('admission_'), 'no global source traversal or admission');
  mkdirSync(dirname(out), {recursive: true});
  mkdirSync(out); // Atomic fresh directory claim after the read-only checks.
  for (const [path, role] of [['native.json', 'native'], ['token/compilation_artifact.json', 'tokenA'], ['token-b/compilation_artifact.json', 'tokenB']]) {
    mkdirSync(dirname(join(out, path)), {recursive: true});
    // Parsing is solely for host checks. Full-u64 bytecode constants must never
    // be rewritten through JavaScript Number serialization.
    writeFileSync(join(out, path), original[role], {flag: 'wx'});
    assert.equal(sha(readFileSync(join(out, path))), spec[role].sha256);
  }
  const market = join(out, 'orderbook'); mkdirSync(market);
  writeFileSync(join(market, 'main.psy.rs'), source, {flag: 'wx'});
  // Matches compile_pair_stream_market.rs, whose last argument parses a Rust
  // bool. compile_market and compile_batch have different incompatible APIs.
  const result = runCompiler(compiler, [join(market, 'main.psy.rs'), join(market, 'compiled'),
    String(spec.config.assetA), String(spec.config.assetB), 'false'],
  {encoding: 'utf8', timeout: 180000, maxBuffer: 4000000});
  writeFileSync(join(market, 'compile.log'), (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.message ?? ''), {flag: 'wx'});
  assert.ok(!result.error && !result.signal && result.status === 0, 'compiler failed; preserve original output');
  const artifactBytes = readFileSync(join(market, 'compiled/compilation_artifact.json'));
  const audit = JSON.parse(readFileSync(join(market, 'compiled/FOREIGN_READ_AUDIT.json')));
  assert.deepEqual({assetA: audit.assetA, assetB: audit.assetB, assetAHeight: audit.assetAHeight, assetBHeight: audit.assetBHeight,
    nativeHeight: audit.nativeHeight, allReadsBound: audit.allReadsBound, financialOperations: audit.financialOperations},
  {assetA: spec.config.assetA, assetB: spec.config.assetB, assetAHeight: 31, assetBHeight: 31, nativeHeight: 32, allReadsBound: true, financialOperations: 0});
  assert.ok(Number.isSafeInteger(audit.foreignReadCommandsChecked) && audit.foreignReadCommandsChecked > 0);
  const policy = makeCoreBookPolicy(spec.marketId, spec.config, JSON.parse(artifactBytes), inputs.tokenA, spec.chainRootAt1);
  save(join(market, 'config.json'), spec.config); save(join(market, 'policy.json'), policy);
  const manifest = {schema: 1, market: 'orderbook', sdkCommit: release.sdkCommit, clientCommit: release.clientCommit,
    chainRootAt1: spec.chainRootAt1, declaredMarketId: spec.marketId, intendedVaultId: spec.intendedVaultId,
    vaultIdentityBinding: 'reviewed intent only; not a cryptographic policy binding', inputs: spec,
    sourceSha256: sha(Buffer.from(source)), artifactSha256: sha(artifactBytes),
    foreignReadAuditSha256: sha(readFileSync(join(market, 'compiled/FOREIGN_READ_AUDIT.json'))),
    policySha256: sha(readFileSync(join(market, 'policy.json'))), executionScope: policy.execution_scope,
    fullUpsVerified: false, sdKeyProofVerified: false, financialOperations: 0, liveAuthorization: false,
    scope: 'New selected-order Book candidate only. Priority is within frozen selected members. Deployment, registered key, complete UPSs, fills, refunds and ordinary claims require separate acceptance.'};
  save(join(out, 'BUILD.json'), manifest);
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4, 'REVIEWED_SPEC FRESH_OUTPUT');
  console.log(JSON.stringify(buildCoreBook(JSON.parse(readFileSync(process.argv[2], 'utf8')), process.argv[3])));
}
