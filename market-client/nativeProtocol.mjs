// Explicit protocol selection from a reviewed registry/approved plan. Never
// retry a rejected native call under an alternative ABI or network name.
import { canonical, requireThat as ok } from './protocol.mjs';
export const MAINNET_BETA_PROFILE = 'mainnet-beta-20261027';
export const MAINNET_BETA_MANIFEST = '06d86a86775bef1f217e61a2192b525d657bc8de2d3687e5c28d93e7abfaec8f';
export const MAINNET_BETA_NATIVE_ROOT = 'f54490d8ed6ccd5bb06f3c42193a5b11ce7bd252c9eae2c3697f9f3e483e26ee';
// Explicit reset-chain identity from the reviewed native preflight. This does
// not change the frozen SDK or reinterpret any historical registry/request.
export const RESET_BETA_PROFILE = 'mainnet-beta-reset-20261027';
export const RESET_CHAIN_ROOT = '919896e18690246e20307f68cf2e5725aee496755366bbafff88eccaea975f12';
export const RESET_NATIVE_BINDING = Object.freeze({
 contract: Object.freeze({contractId:0,codeRoot:'5df4b10ccf59e25f3c44b4164edb9597455da33b925c3981881c280f2636ebd1',layoutRoot:'cd6931e5422fb07be012e3d0642bbffd0880bf499ecc87bcb822276d7426771c',stateTreeHeight:32}),
 functionTreeRoot:'1ad1a069434cf058a419f4d874615c6fc47170471069f5d232874099ef13c5b1',layoutFieldCount:8,layoutSlotCount:8594128984,
});
export const isMainnetBetaProfile = profile => [MAINNET_BETA_PROFILE, RESET_BETA_PROFILE].includes(profile);
const methods = Object.freeze({ transfer: 'transfer', claim: 'claim', burn: 'burn' });
export function nativeProfile(context) {
  const profile = context.nativeProtocol ?? 'legacy-v1';
  ok(['legacy-v1', MAINNET_BETA_PROFILE, RESET_BETA_PROFILE].includes(profile), 'Unreviewed native protocol');
  if (isMainnetBetaProfile(profile)) {
    ok(context.sdkManifestSha256 === MAINNET_BETA_MANIFEST, 'Native SDK identity mismatch');
    ok(context.network?.name === 'testnet' && BigInt(context.network.magic) === 1384803358401154921n,
      'Native network mismatch');
    if(profile===RESET_BETA_PROFILE)ok(context.network.chainRootAt1===RESET_CHAIN_ROOT,'Reset chain instance mismatch');
  } else {
    ok(context.sdkManifestSha256 !== MAINNET_BETA_MANIFEST, 'Selected SDK requires explicit native protocol');
  }
  return profile;
}
export function nativeMethod(context, operation) {
  ok(Object.hasOwn(methods, operation), 'Unknown native operation');
  return isMainnetBetaProfile(nativeProfile(context)) ? operation : 'simple_' + operation;
}
export function nativeManifestPath(registry) {
  const profile = nativeProfile(registry);
  if (isMainnetBetaProfile(profile)) {
    ok(Array.isArray(registry.markets) && registry.markets.length > 0, 'Reviewed markets required');
    for (const market of registry.markets) {
      const binding = market.dependencies?.find(d => d.contract?.contractId === 0);
      if(profile===RESET_BETA_PROFILE)ok(canonical(binding)===canonical(RESET_NATIVE_BINDING),'Reviewed reset native endpoints required');
      else ok(binding?.contract.codeRoot === MAINNET_BETA_NATIVE_ROOT && binding.contract.stateTreeHeight === 32,
        'Reviewed native bytecode identity required');
    }
  }
  return isMainnetBetaProfile(profile)
    ? 'batching/dependencies/mainnet-beta-20261027/manifest.json'
    : 'batching/dependencies/session-bound-sdk-20261020/manifest.json';
}
