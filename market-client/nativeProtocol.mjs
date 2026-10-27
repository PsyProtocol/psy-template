// Explicit protocol selection from a reviewed registry/approved plan. Never
// retry a rejected native call under an alternative ABI or network name.
import { requireThat as ok } from './protocol.mjs';
export const MAINNET_BETA_PROFILE = 'mainnet-beta-20261027';
export const MAINNET_BETA_MANIFEST = '06d86a86775bef1f217e61a2192b525d657bc8de2d3687e5c28d93e7abfaec8f';
export const MAINNET_BETA_NATIVE_ROOT = 'f54490d8ed6ccd5bb06f3c42193a5b11ce7bd252c9eae2c3697f9f3e483e26ee';
const methods = Object.freeze({ transfer: 'transfer', claim: 'claim', burn: 'burn' });
export function nativeProfile(context) {
  const profile = context.nativeProtocol ?? 'legacy-v1';
  ok(['legacy-v1', MAINNET_BETA_PROFILE].includes(profile), 'Unreviewed native protocol');
  if (profile === MAINNET_BETA_PROFILE) {
    ok(context.sdkManifestSha256 === MAINNET_BETA_MANIFEST, 'Native SDK identity mismatch');
    ok(context.network?.name === 'testnet' && BigInt(context.network.magic) === 1384803358401154921n,
      'Native network mismatch');
  } else {
    ok(context.sdkManifestSha256 !== MAINNET_BETA_MANIFEST, 'Selected SDK requires explicit native protocol');
  }
  return profile;
}
export function nativeMethod(context, operation) {
  ok(Object.hasOwn(methods, operation), 'Unknown native operation');
  return nativeProfile(context) === MAINNET_BETA_PROFILE ? operation : 'simple_' + operation;
}
export function nativeManifestPath(registry) {
  const profile = nativeProfile(registry);
  if (profile === MAINNET_BETA_PROFILE) {
    ok(Array.isArray(registry.markets) && registry.markets.length > 0, 'Reviewed markets required');
    for (const market of registry.markets) {
      const native = market.dependencies?.find(d => d.contract?.contractId === 0)?.contract;
      ok(native?.codeRoot === MAINNET_BETA_NATIVE_ROOT && native.stateTreeHeight === 32,
        'Reviewed native bytecode identity required');
    }
  }
  return profile === MAINNET_BETA_PROFILE
    ? 'batching/dependencies/mainnet-beta-20261027/manifest.json'
    : 'batching/dependencies/session-bound-sdk-20261020/manifest.json';
}
