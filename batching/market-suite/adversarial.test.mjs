// Preserved real compiler output only: no signer, network, new compilation or proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { bindMarketSuite, compileMarketSuite, validateSuiteArtifactValues } from './build.mjs';
import { loadBuildSnapshot, BUILD_FILES, MARKETS } from './manifest.mjs';
import { generateStream } from '../checkpoint-stream/generate.mjs';
import { generatePairOptimized } from '../checkpoint-stream/pair-optimized-generate.mjs';

const build = process.env.MARKET_SUITE_SAVED_BUILD;
const out = process.env.MARKET_SUITE_ADVERSARIAL_OUT;
const specPath = process.env.MARKET_SUITE_SPEC;
assert.ok(build && out && specPath, 'preserved build, spec and fresh output required');
mkdirSync(out);
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const freeze = read(new URL('../dependencies/mainnet-beta-20261027/manifest.json', import.meta.url));
const manifestDigest = sha(readFileSync(join(build, 'BUILD.json')));
const ids = { amm: 6100, bondingcurve: 6101, orderbook: 6102, nftmarket: 6103 };
const original = loadBuildSnapshot(build, freeze, { expectedSha256: manifestDigest });
const clone = name => {
  const target = join(out, name);
  cpSync(build, target, { recursive: true, errorOnExist: true, force: false });
  return target;
};
const save = (path, value) => writeFileSync(path, JSON.stringify(value));

test('incomplete, substituted and contradictory build declarations fail before output', () => {
  const changes = [
    ['empty-files', m => { m.files = {}; }],
    ['extra-path', m => { m.files['../unapproved-input.json'] = '0'.repeat(64); }],
    ['missing-market', m => { delete m.markets.orderbook; }],
    ['source-record', m => { m.markets.amm.sourceSha256 = 'a'.repeat(64); }],
    ['artifact-record', m => { m.markets.nftmarket.artifactSha256 = 'a'.repeat(64); }],
    ['missing-input', m => { delete m.frozenInputs['artifact:nft']; }],
    ['dependency-record', m => { m.frozenInputs['artifact:tokenA'].sha256 = 'a'.repeat(64); }],
    ['false-readiness', m => { m.fullUpsVerified = true; }],
  ];
  for (const [name, change] of changes) {
    const copy = clone(name), m = read(join(copy, 'BUILD.json'));
    change(m); save(join(copy, 'BUILD.json'), m);
    const target = join(out, name + '-bound');
    assert.throws(() => bindMarketSuite({ build: copy, marketIds: ids, out: target }));
    assert.equal(existsSync(target), false, name);
  }
});

test('a reviewed manifest pin and failed-build marker reject adoption', () => {
  const copy = clone('failed-build');
  writeFileSync(join(copy, 'FAILURE.json'), '{}', { flag: 'wx' });
  assert.throws(() => loadBuildSnapshot(copy, freeze), /failed build/);
  const target = join(out, 'wrong-pin-bound');
  assert.throws(() => bindMarketSuite({ build, marketIds: ids, out: target, buildManifestSha256: '0'.repeat(64) }), /unreviewed build manifest/);
  assert.equal(existsSync(target), false);
});

test('one loaded snapshot stays byte-exact after its filesystem input changes', () => {
  const copy = clone('snapshot'), before = loadBuildSnapshot(copy, freeze, { expectedSha256: manifestDigest });
  writeFileSync(join(copy, 'config.json'), '{}');
  const artifact = 'amm/compiled/compilation_artifact.json';
  writeFileSync(join(copy, artifact), '{}');
  assert.equal(sha(before.files.get(artifact)), original.manifest.files[artifact]);
  assert.equal(sha(before.files.get('config.json')), original.manifest.files['config.json']);
  assert.throws(() => loadBuildSnapshot(copy, freeze), /changed build input/);
});

test('all dependency functions require unambiguous complete ABI identity and arity', () => {
  const artifacts = Object.fromEntries(['native', 'tokenA', 'tokenB', 'nft'].map(role => [role, read(join(build, 'dependencies', role + '.json'))]));
  const changes = [
    ['native', a => { a.circuit_definitions.push(structuredClone(a.circuit_definitions.find(d => d.name === 'claim'))); }],
    ['tokenA', a => { a.circuit_definitions.push({ ...structuredClone(a.circuit_definitions[0]), name: 'extra_selector_alias' }); }],
    ['tokenB', a => { a.circuit_definitions = a.circuit_definitions.filter(d => d.name !== 'mint'); }],
    ['tokenA', a => { a.circuit_definitions.find(d => d.name === 'mint').method_id += 1; }],
    ['tokenA', a => { a.circuit_definitions.find(d => d.name === 'mint').circuit_inputs.pop(); }],
    ['tokenB', a => { a.circuit_definitions.find(d => d.name === 'mint').circuit_outputs.push(0); }],
    ['nft', a => { a.circuit_definitions.push(structuredClone(a.circuit_definitions[0])); }],
  ];
  for (const [role, change] of changes) {
    const bad = structuredClone(artifacts);
    change(bad[role]);
    assert.throws(() => validateSuiteArtifactValues(bad));
  }
  validateSuiteArtifactValues(artifacts);
});

test('all four unchanged candidates reuse exact bytecode with zero source compilations', () => {
  const target = join(out, 'exact-reuse');
  const spec = read(specPath);
  // Stop before invoking the builder if any source would require compilation.
  for (const market of MARKETS) {
    const generated = ['orderbook', 'nftmarket'].includes(market) ? generatePairOptimized(market, spec.config) : generateStream(market, spec.config);
    assert.equal(sha(generated), original.manifest.files[market + '/main.psy.rs']);
  }
  const result = compileMarketSuite({ spec, out: target, reuse: { build, manifestSha256: manifestDigest } });
  for (const market of MARKETS) {
    assert.equal(result.markets[market].compilerInvoked, false);
    assert.equal(result.markets[market].reusedBuildSha256, manifestDigest);
    const name = market + '/compiled/compilation_artifact.json';
    assert.equal(sha(readFileSync(join(target, name))), original.manifest.files[name]);
  }
  loadBuildSnapshot(target, freeze);
  assert.equal(result.liveAuthorization, false);
});

test('partial output remains untouched; recovery uses a separate complete output', () => {
  const partial = join(out, 'interrupted-bound');
  mkdirSync(partial);
  writeFileSync(join(partial, 'original-partial.txt'), 'Preserve interrupted output.\n', { flag: 'wx' });
  const digest = sha(readFileSync(join(partial, 'original-partial.txt')));
  assert.throws(() => bindMarketSuite({ build, marketIds: ids, out: partial, buildManifestSha256: manifestDigest }), /fresh bound output/);
  assert.equal(existsSync(join(partial, 'BOUND.json')), false);
  assert.equal(sha(readFileSync(join(partial, 'original-partial.txt'))), digest);
  const result = bindMarketSuite({ build, marketIds: ids, out: join(out, 'recovered-bound'), buildManifestSha256: manifestDigest });
  assert.equal(result.expectedBuildDigestMatched, true);
  assert.deepEqual(result.marketIds, ids);
});

test('two actual local bind processes publish one coherent assignment without mixing policies', { timeout: 20000 }, async () => {
  const target = join(out, 'contended-bound'), barrier = join(out, 'start-barrier');
  const moduleUrl = pathToFileURL(resolve('batching/market-suite/build.mjs')).href;
  const script = `import {bindMarketSuite} from ${JSON.stringify(moduleUrl)};
import {writeFileSync,existsSync} from 'node:fs';
writeFileSync(process.env.READY,'ready',{flag:'wx'});
const stop=Date.now()+10000;
while(!existsSync(process.env.BARRIER)){if(Date.now()>stop)throw Error('bounded barrier expired');await new Promise(r=>setTimeout(r,10));}
try{console.log(JSON.stringify(bindMarketSuite({build:process.env.BUILD,out:process.env.OUT,marketIds:JSON.parse(process.env.IDS),buildManifestSha256:process.env.PIN})));}
catch(e){console.error(e.message);process.exitCode=1;}`;
  const assignments = [ids, Object.fromEntries(MARKETS.map((m, i) => [m, 6200 + i]))];
  const children = assignments.map((assignment, i) => {
    const ready = join(out, 'ready-' + i);
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, BUILD: build, OUT: target, IDS: JSON.stringify(assignment), PIN: manifestDigest, READY: ready, BARRIER: barrier }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve({ code, stdout, stderr })); });
    return { child, ready, done };
  });
  const stop = Date.now() + 10000;
  try {
    while (!children.every(c => existsSync(c.ready))) {
      assert.ok(Date.now() < stop, 'both local processes must reach bounded start barrier');
      await new Promise(r => setTimeout(r, 10));
    }
    writeFileSync(barrier, 'start', { flag: 'wx' });
    const results = await Promise.all(children.map(c => c.done));
    save(join(out, 'local-bind-results.json'), results);
    assert.equal(results.filter(r => r.code === 0).length, 1);
    assert.equal(results.filter(r => r.code === 1).length, 1);
    const winner = results.findIndex(r => r.code === 0), bound = read(join(target, 'BOUND.json'));
    assert.deepEqual(bound.marketIds, assignments[winner]);
    for (const [name, digest] of Object.entries(bound.files)) assert.equal(sha(readFileSync(join(target, name))), digest);
    for (const market of MARKETS) {
      const policy = read(join(target, market, 'stream-policy.json'));
      assert.equal(policy.base.market_id, assignments[winner][market]);
      for (const value of Object.values(policy.stream)) assert.equal(value.contract_id, assignments[winner][market]);
    }
    assert.equal(bound.liveAuthorization, false);
  } finally {
    for (const { child } of children) if (child.exitCode === null) child.kill('SIGTERM');
  }
});

test('all preserved original members and the original manifest remain byte-identical', () => {
  assert.equal(sha(readFileSync(join(build, 'BUILD.json'))), manifestDigest);
  for (const name of BUILD_FILES) assert.equal(sha(readFileSync(join(build, name))), original.manifest.files[name]);
});
