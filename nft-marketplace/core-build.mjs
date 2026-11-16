// Fresh selected-order NFT candidates only. No registration, proof generation,
// financial execution, global scan or compatibility update to old deployments.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {generateBatch} from '../batching/v2/generate.mjs';
import {makeBatchPolicy} from '../batching/v2/policy.mjs';
import {bindNativePolicy, validateNativeArtifact, PROFILE} from '../batching/mainnet-beta/native.mjs';
import {assertDeterministicOrdering} from '../batching/random-order/sourceGate.mjs';
import {tokenGate} from '../amm/u124/artifactGate.mjs';
import {validateU124TokenAbi} from '../executor/u124Abi.mjs';
import {sdkRelease} from '../executor/sdkProfiles.mjs';
import {validateNftAbi} from './abi.mjs';
import {ACCOUNT_VERSION_OFFSET} from '../nft/account-initialization.mjs';

export const NFT_CORE_COMPILER_API = 'compile-pair-stream-market-v1';
export const NFT_CORE_INITIALIZATION = 'explicit-account-version-v1';
const release = sdkRelease('sdk-audit-20261102-v1');
const DOMAIN = '1384803358401154921';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const id = n => Number.isSafeInteger(n) && n >= 5 && n < 2 ** 24;
const save = (p, value) => writeFileSync(p, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});

function configuration(marketId, config, chainRootAt1) {
  assertDeterministicOrdering(config);
  for (const name of Object.keys(config)) assert.ok(['nftId', 'tokenId', 'networkMagic', 'ordering'].includes(name), 'unsupported NFT configuration ' + name);
  assert.equal(config.networkMagic, DOMAIN, 'fixed selected network domain');
  assert.ok(id(marketId) && id(config.nftId) && id(config.tokenId));
  assert.equal(new Set([marketId, config.nftId, config.tokenId]).size, 3, 'distinct market, payment and collection contracts');
  assert.match(chainRootAt1 ?? '', /^[a-f0-9]{64}$/, 'explicit chain instance');
  assert.notEqual(chainRootAt1, '0'.repeat(64));
}

function method(abi, name, selector, arity) {
  const m = abi.contract.methods.find(m => m.name === name);
  assert.equal(m?.method_id, selector, 'exact current selector ' + name);
  assert.equal(m.input_felt_count, arity, name + ' arity');
  assert.equal(m.output_felt_count, 0); assert.equal(m.state_mutability, 'external');
  return m;
}

export function validatePreparedCollection(abi) {
  assert.equal(abi.contract.state_tree_height, 30);
  validateNftAbi(abi, 30);
  const f = {name: 'account_version', type: {kind: 'primitive', name: 'Felt'}, offset: ACCOUNT_VERSION_OFFSET, felt_size: 1};
  assert.deepEqual(abi.contract.state.at(-1), f, 'fresh prepared collection required');
  const layout = abi.contract.state_layout;
  assert.equal(layout.field_count, 15); assert.equal(layout.slot_count, ACCOUNT_VERSION_OFFSET + 1);
  assert.equal(layout.fields.length, 15);
  assert.deepEqual(layout.fields.at(-1), {field_id: 15, name: 'account_version', type: f.type,
    start_slot: ACCOUNT_VERSION_OFFSET, payload_offset: 0, slot_count: 1});
  method(abi, 'prepare_account', 1475740684, 0);
  method(abi, 'claim', 4064462786, 2); method(abi, 'transfer', 1129988224, 2);
  method(abi, 'acknowledge', 1344479563, 1);
}

export function makeCoreNftPolicy(marketId, config, artifact, token, collection, chainRootAt1) {
  configuration(marketId, config, chainRootAt1);
  assert.equal(artifact.state_tree_height, 31); assert.equal(artifact.abi.contract.state_tree_height, 31);
  validateU124TokenAbi(token.abi); validatePreparedCollection(collection.abi);
  method(token.abi, 'claim', 2792756730, 1); method(token.abi, 'transfer', 188091294, 3);
  const methods = artifact.abi.contract.methods;
  assert.equal(new Set(methods.map(m => m.name)).size, methods.length, 'unique NFT market methods');
  assert.equal(new Set(methods.map(m => m.method_id)).size, methods.length, 'unique NFT market selectors');
  assert.ok(!methods.some(m => /stream|admission|source|scan/.test(m.name)), 'selected NFT market has no global coverage methods');
  for (const [name, arity] of [['open_listing', 6], ['open_buy', 7], ['close_listing', 0], ['close_buy', 0], ['request_cancel', 0]]) {
    const m = methods.find(m => m.name === name);
    assert.equal(m?.input_felt_count, arity, 'NFT ordinary method ' + name);
    assert.equal(m.output_felt_count, 0); assert.equal(m.state_mutability, 'external');
  }
  method(artifact.abi, 'activate', 3068320913, 1);
  const previous = bindNativePolicy(makeBatchPolicy('nftmarket', marketId, config, artifact.abi, token.abi, collection.abi), PROFILE);
  const p = structuredClone(previous);
  const index = p.operations.findIndex(o => o.name === 'activate');
  assert.ok(index >= 0); const op = p.operations[index]; assert.equal(op.maintenance, true);
  const acknowledgements = op.calls.filter(c => c.contract_id === config.nftId && c.method_name === 'acknowledge');
  assert.equal(acknowledgements.length, 1, 'exact legacy activation acknowledgement');
  assert.deepEqual(acknowledgements[0].inputs, [{witness: 1}]);
  op.calls = op.calls.map(c => c === acknowledgements[0] ? {contract_id: config.nftId,
    method_id: 1475740684, method_name: 'prepare_account', inputs: []} : c);
  assert.equal(op.calls.length, 9);
  assert.deepEqual(p.branches[2 + index].calls, previous.operations[index].calls, 'exact original activation coverage');
  p.branches[2 + index].calls = structuredClone(op.calls);
  // Descriptor changes bind a different circuit/key. A registered legacy
  // acknowledge fingerprint cannot authorize this prepare_account operation.
  return {...p, sdk_commit: release.sdkCommit, client_commit: release.clientCommit,
    collection_initialization: NFT_CORE_INITIALIZATION,
    execution_scope: 'explicit-selected-orders-v1', chain_root_at1: chainRootAt1,
    whole_market_completeness: false, qualified_randomness: false};
}

export function buildCoreNft(spec, freshOutput, {runCompiler = spawnSync} = {}) {
  assert.equal(spec.schema, 1);
  assert.deepEqual(Object.keys(spec).sort(), ['schema', 'sdkCommit', 'clientCommit', 'chainRootAt1', 'marketId',
    'intendedVaultId', 'config', 'compiler', 'native', 'paymentToken', 'collection'].sort(), 'explicit NFT build spec only');
  assert.equal(spec.sdkCommit, release.sdkCommit); assert.equal(spec.clientCommit, release.clientCommit);
  configuration(spec.marketId, spec.config, spec.chainRootAt1);
  assert.ok(Number.isSafeInteger(spec.intendedVaultId) && spec.intendedVaultId > 0 && spec.intendedVaultId < 2 ** 24, 'explicit intended vault');
  // Accounts and contracts are separate namespaces; no numeric inequality is
  // inferred. Runtime gates must check actual account ownership and separation.
  assert.equal(spec.compiler.api, NFT_CORE_COMPILER_API, 'unsupported compiler interface');
  assert.deepEqual(Object.keys(spec.compiler).sort(), ['api', 'path', 'sha256'], 'no arbitrary compiler arguments');
  const out = resolve(freshOutput); assert.ok(!existsSync(out), 'fresh NFT output required');
  const inputs = {}, original = {};
  for (const role of ['compiler', 'native', 'paymentToken', 'collection']) {
    const record = spec[role];
    assert.equal(typeof record.path, 'string'); assert.match(record.sha256, /^[a-f0-9]{64}$/);
    const bytes = readFileSync(record.path); assert.equal(sha(bytes), record.sha256, 'exact reviewed input ' + role);
    original[role] = bytes; inputs[role] = role === 'compiler' ? bytes : JSON.parse(bytes);
  }
  validateNativeArtifact(inputs.native, PROFILE);
  tokenGate(inputs.paymentToken); validateU124TokenAbi(inputs.paymentToken.abi);
  assert.equal(inputs.collection.state_tree_height, 30); validatePreparedCollection(inputs.collection.abi);
  const prepare = inputs.collection.circuit_definitions.find(d => d.name === 'prepare_account');
  assert.equal(prepare?.method_id, 1475740684); assert.deepEqual(prepare.circuit_inputs, []); assert.deepEqual(prepare.circuit_outputs, []);
  const compiler = resolve(spec.compiler.path);
  const domain = runCompiler(compiler, ['network-magic'], {encoding: 'utf8', timeout: 30000, maxBuffer: 100000});
  assert.ok(!domain.error && !domain.signal && domain.status === 0 && /^\d+\s*$/.test(domain.stdout ?? ''), 'compiler network domain probe');
  assert.equal(domain.stdout.trim(), DOMAIN, 'compiler domain differs from selected release');
  const source = generateBatch('nftmarket', spec.config);
  assert.ok(!source.includes('stream_') && !source.includes('admission_'), 'no global source traversal or admission');
  mkdirSync(dirname(out), {recursive: true}); mkdirSync(out);
  for (const [path, role] of [['native.json', 'native'], ['token/compilation_artifact.json', 'paymentToken'], ['nft/compilation_artifact.json', 'collection']]) {
    mkdirSync(dirname(join(out, path)), {recursive: true});
    // Parsing is for host validation only. Preserve exact full-u64 artifacts.
    writeFileSync(join(out, path), original[role], {flag: 'wx'});
    assert.equal(sha(readFileSync(join(out, path))), spec[role].sha256);
  }
  const market = join(out, 'nftmarket'); mkdirSync(market);
  writeFileSync(join(market, 'main.psy.rs'), source, {flag: 'wx'});
  // Actual compile_pair_stream_market API: payment, collection, Rust bool true.
  // Its NFT mode compiles collection reads at height 30, Native at 32, FT at 31.
  const result = runCompiler(compiler, [join(market, 'main.psy.rs'), join(market, 'compiled'),
    String(spec.config.tokenId), String(spec.config.nftId), 'true'],
  {encoding: 'utf8', timeout: 180000, maxBuffer: 4000000});
  writeFileSync(join(market, 'compile.log'), (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.message ?? ''), {flag: 'wx'});
  assert.ok(!result.error && !result.signal && result.status === 0, 'compiler failed; preserve original output');
  const artifactBytes = readFileSync(join(market, 'compiled/compilation_artifact.json'));
  const audit = JSON.parse(readFileSync(join(market, 'compiled/FOREIGN_READ_AUDIT.json')));
  assert.deepEqual({assetA: audit.assetA, assetB: audit.assetB, assetAHeight: audit.assetAHeight, assetBHeight: audit.assetBHeight,
    nativeHeight: audit.nativeHeight, allReadsBound: audit.allReadsBound, financialOperations: audit.financialOperations},
  {assetA: spec.config.tokenId, assetB: spec.config.nftId, assetAHeight: 31, assetBHeight: 30, nativeHeight: 32, allReadsBound: true, financialOperations: 0});
  assert.ok(Number.isSafeInteger(audit.foreignReadCommandsChecked) && audit.foreignReadCommandsChecked > 0);
  const policy = makeCoreNftPolicy(spec.marketId, spec.config, JSON.parse(artifactBytes), inputs.paymentToken, inputs.collection, spec.chainRootAt1);
  save(join(market, 'config.json'), spec.config); save(join(market, 'policy.json'), policy);
  const manifest = {schema: 1, market: 'nftmarket', sdkCommit: release.sdkCommit, clientCommit: release.clientCommit,
    chainRootAt1: spec.chainRootAt1, declaredMarketId: spec.marketId, intendedVaultId: spec.intendedVaultId,
    vaultIdentityBinding: 'reviewed intent only; not a cryptographic policy binding', inputs: spec,
    sourceSha256: sha(Buffer.from(source)), artifactSha256: sha(artifactBytes),
    foreignReadAuditSha256: sha(readFileSync(join(market, 'compiled/FOREIGN_READ_AUDIT.json'))),
    policySha256: sha(readFileSync(join(market, 'policy.json'))), executionScope: policy.execution_scope,
    collectionInitialization: NFT_CORE_INITIALIZATION, newKeyRequired: true,
    fullUpsVerified: false, sdKeyProofVerified: false, financialOperations: 0, liveAuthorization: false,
    scope: 'New selected-order NFT candidate only. Existing buyer priority, unique sale and refunds are preserved within frozen selected members. Fresh collection/key, deployment, full UPSs, sale, refund and ordinary claims require separate acceptance.'};
  save(join(out, 'BUILD.json'), manifest); return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4, 'REVIEWED_SPEC FRESH_OUTPUT');
  console.log(JSON.stringify(buildCoreNft(JSON.parse(readFileSync(process.argv[2], 'utf8')), process.argv[3])));
}
