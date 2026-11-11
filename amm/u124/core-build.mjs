// Fresh AMM-only builds. Explicit selected orders; no global account coverage.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {generateBatch} from '../../batching/v2/generate.mjs';
import {makeBatchPolicy} from '../../batching/v2/policy.mjs';
import {bindNativePolicy, validateNativeArtifact, PROFILE} from '../../batching/mainnet-beta/native.mjs';
import {sdkRelease} from '../../executor/sdkProfiles.mjs';
import {tokenGate} from './artifactGate.mjs';
import {assertDeterministicOrdering} from '../../batching/random-order/sourceGate.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const id = n => Number.isSafeInteger(n) && n >= 5 && n < 2 ** 24;
const release = sdkRelease('sdk-audit-20261102-v1');
const save = (p, value) => writeFileSync(p, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});

// Distinct QA assets avoid identical deployment requests/content hashes. This
// does not edit the production FT source or authorize a mint/deployment.
export function qaTokenSource(source, issuer, symbol) {
  assert.ok(Number.isSafeInteger(issuer) && issuer > 0 && issuer < 2 ** 24);
  assert.ok(Number.isSafeInteger(symbol) && symbol > 0 && symbol < 2 ** 32);
  const authority = 'const ISSUER_USER_ID: usize = 5;';
  const metadata = 'pub fn set_metadata(&mut self, ctx: &mut ChainContext, symbol: Felt, decimals: Felt) {';
  assert.equal(source.split(authority).length, 2, 'exact issuer template');
  assert.equal(source.split(metadata).length, 2, 'exact QA metadata method');
  return source.replace(authority, `const ISSUER_USER_ID: usize = ${issuer};`)
    .replace(metadata, metadata + `\nrequire(symbol == ${symbol}, "fixed QA asset symbol");`);
}

export function makeCorePolicy(marketId, config, artifact, token, chainRootAt1) {
  assertDeterministicOrdering(config);
  assert.match(chainRootAt1 ?? '', /^[a-f0-9]{64}$/, 'explicit chain instance');
  assert.notEqual(chainRootAt1, '0'.repeat(64));
  assert.ok(id(marketId) && ![config.assetA, config.assetB].includes(marketId), 'distinct market identity');
  assert.equal(config.networkMagic, '1384803358401154921', 'selected testnet domain');
  assert.ok(id(config.assetA) && id(config.assetB) && config.assetA !== config.assetB, 'distinct U124 assets');
  assert.equal(artifact.state_tree_height, 31);
  const policy = bindNativePolicy(makeBatchPolicy('amm', marketId, config, artifact.abi, token.abi, null), PROFILE);
  return {...policy, sdk_commit: release.sdkCommit, client_commit: release.clientCommit,
    execution_scope: 'explicit-selected-orders-v1', chain_root_at1: chainRootAt1, qualified_randomness: false,
    whole_market_completeness: false};
}

export function buildCore(spec, freshOutput) {
  assert.equal(spec.schema, 1);
  assert.equal(spec.sdkCommit, release.sdkCommit);
  assert.match(spec.chainRootAt1, /^[a-f0-9]{64}$/);
  assert.notEqual(spec.chainRootAt1, '0'.repeat(64));
  assert.ok(id(spec.marketId));
  const inputs = {}, original = {};
  for (const role of ['compiler', 'native', 'tokenA', 'tokenB']) {
    const record = spec[role];
    assert.match(record.sha256, /^[a-f0-9]{64}$/);
    const bytes = readFileSync(record.path);
    assert.equal(sha(bytes), record.sha256, 'exact reviewed input ' + role);
    inputs[role] = role === 'compiler' ? bytes : JSON.parse(bytes);
    original[role] = bytes;
  }
  validateNativeArtifact(inputs.native, PROFILE);
  tokenGate(inputs.tokenA); tokenGate(inputs.tokenB);
  for (const name of ['claim', 'transfer']) {
    assert.equal(inputs.tokenA.abi.contract.methods.find(m => m.name === name).method_id,
      inputs.tokenB.abi.contract.methods.find(m => m.name === name).method_id);
  }
  const source = generateBatch('amm', spec.config);
  assert.ok(!source.includes('stream_') && !source.includes('admission_'), 'no source traversal or admission dependency');
  const out = resolve(freshOutput);
  assert.ok(!existsSync(out), 'fresh AMM build only');
  mkdirSync(out, {recursive: true});
  for (const [path, role] of [['native.json', 'native'], ['token/compilation_artifact.json', 'tokenA'],
      ['token-b/compilation_artifact.json', 'tokenB']]) {
    // JSON.parse above is only for ABI/shape checks. Bytecode contains full
    // u64 constants; never reserialize it through JavaScript Number.
    mkdirSync(dirname(join(out, path)), {recursive: true});
    writeFileSync(join(out, path), original[role], {flag: 'wx'});
    assert.equal(sha(readFileSync(join(out, path))), spec[role].sha256);
  }
  const market = join(out, 'amm'); mkdirSync(market);
  writeFileSync(join(market, 'main.psy.rs'), source, {flag: 'wx'});
  const result = spawnSync(resolve(spec.compiler.path), [join(market, 'main.psy.rs'), join(market, 'compiled'),
    String(spec.config.assetA), String(spec.config.assetB), 'false'], {encoding: 'utf8', timeout: 180000, maxBuffer: 4000000});
  writeFileSync(join(market, 'compile.log'), (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.message ?? ''), {flag: 'wx'});
  assert.equal(result.status, 0, 'preserve failed compiler output; do not overwrite');
  const artifactBytes = readFileSync(join(market, 'compiled/compilation_artifact.json'));
  const policy = makeCorePolicy(spec.marketId, spec.config, JSON.parse(artifactBytes), inputs.tokenA, spec.chainRootAt1);
  save(join(market, 'config.json'), spec.config); save(join(market, 'policy.json'), policy);
  const manifest = {schema: 1, sdkCommit: release.sdkCommit, clientCommit: release.clientCommit,
    chainRootAt1: spec.chainRootAt1, declaredMarketId: spec.marketId, inputs: spec,
    sourceSha256: sha(Buffer.from(source)), artifactSha256: sha(artifactBytes),
    policySha256: sha(readFileSync(join(market, 'policy.json'))), executionScope: policy.execution_scope,
    fullUpsVerified: false, financialOperations: 0, liveAuthorization: false,
    scope: 'New AMM candidate only. Actual deployment, registered key, complete UPSs, funding, settlement, ordinary claims and recovery still require acceptance.'};
  save(join(out, 'BUILD.json'), manifest);
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4, 'REVIEWED_SPEC FRESH_OUTPUT');
  console.log(JSON.stringify(buildCore(JSON.parse(readFileSync(process.argv[2], 'utf8')), process.argv[3])));
}
