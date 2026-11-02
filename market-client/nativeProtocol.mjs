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
// Explicit audit release and reset-chain identity. Historical profiles remain immutable.
export const AUDIT_PROFILE = 'audit-reset-20261102';
export const AUDIT_MANIFEST = '246cfcb12788fe0d0eb79594556acdfcc7781d01641890e47836db1fbc93c467';
export const AUDIT_CHAIN_ROOT = '81bac9934a1c18579519b5297c94c7e7d25cb53973ac67befefe8b7a86f96b5c';
export const AUDIT_NATIVE_BINDING = Object.freeze({
 contract:Object.freeze({contractId:0,codeRoot:'30f06e6c5c897af41c08f0f86677c66096e533ce490c9817b5ddf7b5812a3ea6',layoutRoot:'cd6931e5422fb07be012e3d0642bbffd0880bf499ecc87bcb822276d7426771c',stateTreeHeight:32}),
 functionTreeRoot:'03c697aa1180e94b046ffcbf0272cd12ce0fee948b216afceb8e1ef524cdcd7e',layoutFieldCount:8,layoutSlotCount:8594128984,
});
export const isReviewedNativeProfile = profile => isMainnetBetaProfile(profile) || profile===AUDIT_PROFILE;
export const reviewedSdkManifest = value => [MAINNET_BETA_MANIFEST,AUDIT_MANIFEST].includes(value);
const methods = Object.freeze({ transfer: 'transfer', claim: 'claim', burn: 'burn' });
export function nativeProfile(context) {
  const profile = context.nativeProtocol ?? 'legacy-v1';
  ok(['legacy-v1', MAINNET_BETA_PROFILE, RESET_BETA_PROFILE, AUDIT_PROFILE].includes(profile), 'Unreviewed native protocol');
  if (isReviewedNativeProfile(profile)) {
    ok(context.sdkManifestSha256 === (profile===AUDIT_PROFILE?AUDIT_MANIFEST:MAINNET_BETA_MANIFEST), 'Native SDK identity mismatch');
    ok(context.network?.name === 'testnet' && BigInt(context.network.magic) === 1384803358401154921n,
      'Native network mismatch');
    if(profile===RESET_BETA_PROFILE||profile===AUDIT_PROFILE)ok(context.network.chainRootAt1===(profile===AUDIT_PROFILE?AUDIT_CHAIN_ROOT:RESET_CHAIN_ROOT),'Reset chain instance mismatch');
  } else {
    ok(!reviewedSdkManifest(context.sdkManifestSha256), 'Selected SDK requires explicit native protocol');
  }
  return profile;
}
export function nativeMethod(context, operation) {
  ok(Object.hasOwn(methods, operation), 'Unknown native operation');
  return isReviewedNativeProfile(nativeProfile(context)) ? operation : 'simple_' + operation;
}
export function nativeManifestPath(registry) {
  const profile = nativeProfile(registry);
  if (isReviewedNativeProfile(profile)) {
    ok(Array.isArray(registry.markets) && registry.markets.length > 0, 'Reviewed markets required');
    for (const market of registry.markets) {
      const binding = market.dependencies?.find(d => d.contract?.contractId === 0);
      if(profile===RESET_BETA_PROFILE||profile===AUDIT_PROFILE)ok(canonical(binding)===canonical(profile===AUDIT_PROFILE?AUDIT_NATIVE_BINDING:RESET_NATIVE_BINDING),'Reviewed reset native endpoints required');
      else ok(binding?.contract.codeRoot === MAINNET_BETA_NATIVE_ROOT && binding.contract.stateTreeHeight === 32,
        'Reviewed native bytecode identity required');
    }
  }
  return profile===AUDIT_PROFILE ? 'batching/dependencies/audit-20261102/manifest.json' : isMainnetBetaProfile(profile)
    ? 'batching/dependencies/mainnet-beta-20261027/manifest.json'
    : 'batching/dependencies/session-bound-sdk-20261020/manifest.json';
}
