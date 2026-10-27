import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAmmPlan } from './ammPlan.mjs';
import { fixtureRegistry, observed, swapRequest, NOW } from '../executor/gateway/fixtures.mjs';
import { nativeMethod, nativeManifestPath, MAINNET_BETA_PROFILE,
  MAINNET_BETA_MANIFEST, MAINNET_BETA_NATIVE_ROOT } from './nativeProtocol.mjs';
async function registry() {
  const r = await fixtureRegistry();
  r.nativeProtocol = MAINNET_BETA_PROFILE;
  r.sdkManifestSha256 = MAINNET_BETA_MANIFEST;
  r.network.name = 'testnet';
  for (const m of r.markets) m.dependencies.find(d => d.contract.contractId === 0).contract.codeRoot = MAINNET_BETA_NATIVE_ROOT;
  return r;
}
test('selected SDK registry drives new native calls without changing U124 trade terms', async () => {
  const r = await registry(), hash = 'a'.repeat(64), s = observed(r, hash);
  const p = buildAmmPlan(s, swapRequest(), r, { now: NOW, registryHash: hash });
  assert.deepEqual(p.calls.map(c => c.method_name), ['open_swap', 'transfer', 'transfer']);
  assert.deepEqual(p.calls[2].inputs.slice(1), ['17', '1']);
  assert.equal(p.nativeProtocol, MAINNET_BETA_PROFILE);
  assert.equal(nativeMethod(p, 'burn'), 'burn');
  assert.match(nativeManifestPath(r), /mainnet-beta-20261027/);
  assert.equal(p.financialAuthorization, false);
});
test('no network alias, SDK fallback, ABI fallback or substituted native code', async () => {
  for (const change of [r => r.sdkManifestSha256 = '0'.repeat(64),
    r => r.network.name = 'sepolia', r => r.network.magic = '7',
    r => delete r.nativeProtocol, r => r.nativeProtocol = 'unknown',
    r => r.markets[0].dependencies.find(d => d.contract.contractId === 0).contract.codeRoot = '0'.repeat(64)]) {
    const r = await registry(); change(r);
    assert.throws(() => nativeManifestPath(r));
  }
  assert.throws(() => nativeMethod({}, 'constructor'));
});
