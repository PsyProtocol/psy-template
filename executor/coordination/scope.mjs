import assert from 'node:assert/strict';
import {sha256} from '../requestBinding.mjs';
import {assertDurableRuntimeDirectory} from '../runtimeStorage.mjs';
import {resolve} from 'node:path';
export function coordinationScope(value) {
  const keys=['network','domainHash','sdkManifestHash','vaultId','fingerprint','publicKeyHash',
    'intentId','registryHash','walletSha256','artifactRoot'];
  assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),'exact coordinator scope');
  assert.equal(value.network,'sepolia');
  assert.ok(Number.isSafeInteger(value.vaultId)&&value.vaultId>0&&value.vaultId<2**24);
  for(const key of keys.filter(k=>!['network','vaultId','artifactRoot'].includes(k)))
    assert.match(value[key],/^[0-9a-f]{64}$/,key);
  assertDurableRuntimeDirectory(value.artifactRoot);
  assert.equal(resolve(value.artifactRoot),value.artifactRoot,'same absolute artifact mount on every host');
  const scope=Object.fromEntries(keys.map(k=>[k,value[k]]));
  return {scope,key:sha256(JSON.stringify(scope))};
}
