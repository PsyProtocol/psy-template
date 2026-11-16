// Explicit selected-order routes. These names do not authorize a deployment,
// accepted key, live execution or more capacity than its compiled policy.
import assert from 'node:assert/strict';
import {makeCorePolicy} from '../amm/u124/core-build.mjs';
import {makeCurveCorePolicy} from '../bondingcurve/u124/core-build.mjs';
import {makeCoreBookPolicy} from '../orderbook/u124/core-build.mjs';

export const CORE_PROFILE_KINDS = Object.freeze({
  'amm-core-compact-v1': 'amm',
  'curve-core-compact-v1': 'bondingcurve',
  'book-core-compact-v1': 'orderbook',
  'nft-core-compact-v1': 'nftmarket',
});
export const isCoreProfile = profile => Object.hasOwn(CORE_PROFILE_KINDS, profile);

export function assertCoreRoute(options) {
  assert.ok(isCoreProfile(options.profile), 'explicit selected-order core profile required');
  assert.equal(options.kind, CORE_PROFILE_KINDS[options.profile], 'core profile/market differ');
  assert.equal(options.network, 'testnet', 'selected core testnet domain required');
  assert.equal(options.testnetProfile, 'sdk-audit-20261102-v1', 'exact frozen core SDK profile required');
  assert.match(options.chainRootAt1 ?? '', /^[a-f0-9]{64}$/);
  assert.notEqual(options.chainRootAt1, '0'.repeat(64));
  assert.equal(options.admissionPlan, undefined, 'core route has no admission/source plan');
  assert.equal(options.usersFile, undefined, 'core route has bounded explicit hints only');
  assert.ok(Array.isArray(options.users) && options.users.length <= 4 &&
    options.users.every(id => Number.isSafeInteger(id) && id > 0 && id < 2 ** 24 && id !== options.vaultId),
  'at most four valid explicit core hints required');
}

export async function canonicalCorePolicy(options, files, tokenAbi, otherAbi) {
  assertCoreRoute(options);
  const artifact = {state_tree_height: 31, abi: files.abi}, token = {abi: tokenAbi};
  const args = [options.contractId, files.config, artifact, token];
  if (options.kind === 'amm') return makeCorePolicy(...args, options.chainRootAt1);
  if (options.kind === 'bondingcurve') return makeCurveCorePolicy(...args, options.chainRootAt1);
  if (options.kind === 'orderbook') return makeCoreBookPolicy(...args, options.chainRootAt1);
  // The dedicated prepared-collection factory validates this exact ABI.
  // Legacy/v21 keys are never converted by this route or admitted through
  // ABI-name equivalence; a fresh key and separate acceptance are required.
  const {makeCoreNftPolicy} = await import('../nft-marketplace/core-build.mjs');
  return makeCoreNftPolicy(...args, {abi: otherAbi}, options.chainRootAt1);
}
