import {SCENARIOS} from './scenarios.mjs';
// Read-only historical ordinary-owner claim audit after actual route completion.
// Indexed balance deltas are compared with full-proof endpoints, not treated as
// proof generation, runtime attestation or an alternative receipt identity.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseLosslessJson, decodeAmount} from '../../amm/u124/client.mjs';
import {MAX_AMOUNT} from '../../token/wide/arithmetic.mjs';
import {decodeFeltSlot} from '../../orderbook/matcherCore.mjs';
import {publicState} from '../../executor/publicState.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {save} from '../../batching/admission/liveSupport.mjs';
import {controllerDirectory} from './controllerDirectory.mjs';
import {COMPOSITION_MAGIC} from '../contract/runtimePolicy.mjs';

const exact = p => parseLosslessJson(readFileSync(p, 'utf8'));
export function checkClaimAmounts({before, after, sent, claimed, newClaimed, fee=0n, wide=true}) {
  for (const value of [before, after, sent, claimed, newClaimed, fee]) {
    assert.ok(typeof value === 'bigint' && value >= 0n, 'nonnegative exact claim amount');
    if (wide) assert.ok(value <= MAX_AMOUNT, 'U124 claim bound');
  }
  assert.ok(sent >= claimed, 'claim cursor exceeds sender Outbox');
  assert.equal(newClaimed, sent, 'owner must claim the exact sender Outbox');
  assert.equal(after, before + sent - claimed - fee, 'actual owner spendable balance delta');
  return sent - claimed;
}
export async function auditOwnerClaims(base, verificationSummary, scenarios=['success','recovery']) {
  assert.ok(Array.isArray(scenarios) && scenarios.length > 0 && scenarios.length <= SCENARIOS.length);
  assert.equal(new Set(scenarios).size, scenarios.length);
  assert.ok(scenarios.every(s => SCENARIOS.includes(s)), 'explicit known claim scenarios only');
  const verified = exact(verificationSummary), rows = [];
  assert.equal(verified.mutatedActualFeeRejected, true);
  assert.equal(verified.broadcast, false);
  const actors = JSON.parse(readFileSync(join(base, 'public/BOOTSTRAP-v1.json'), 'utf8')).actors;
  const state = await publicState(join(base, 'public/rpc.json'));
  assert.equal(BigInt(state.network.magic), COMPOSITION_MAGIC);
  for (const scenario of scenarios) {
    const home = join(controllerDirectory(base), scenario);
    const done = exact(join(home, 'public/LIVE-ROUTE-COMPLETE-v1.json'));
    assert.equal(done.ordinaryOwnerClaimIncluded, true);
    assert.equal(done.controllerPhase, 99n);
    const beforeReport = exact(join(home, 'public/FINAL-OWNER-OUTBOX-v1.json'));
    assert.equal(beforeReport.intentId, done.intentId);
    assert.equal(beforeReport.owner, done.owner);
    assert.equal(new Set(beforeReport.pending.map(p => p.asset)).size, beforeReport.pending.length);
    const attempt = join(home, 'attempts/owner-claim-v1');
    const included = exact(join(attempt, 'included.json'));
    const p = exact(join(attempt, 'preflight.json')), c = p.core;
    assert.equal(included.status, 'included');
    assert.ok(BigInt(state.checkpoint) >= included.checkpoint);
    assert.equal(c.new_user_leaf.user_id, done.owner);
    const actor = actors.find(a => BigInt(a.userId) === done.owner);
    assert.ok(actor, 'claim owner must be an explicitly pinned ordinary actor');
    assert.equal(c.new_user_leaf.public_key, actor.identity.publicKeyHash);
    const proof = verified.rows.find(r => r.contentHash === included.contentHash);
    assert.ok(proof, 'ordinary owner claim must independently verify first');
    assert.equal(proof.requestSha256, sha256(readFileSync(join(attempt, 'request.json'))));
    assert.equal(proof.endUserLeafHash, c.state_transition.end_user_leaf_hash);
    assert.equal(proof.userId, done.owner);
    const U = Number(done.owner), V = Number(done.vaultId);
    const frame = checkpoint => {
      const cache = new Map();
      const rpc = async (user, method, params) => {
        const realm = state.network.realm_configs.find(r => r.id === Math.floor(user/state.network.users_per_realm));
        assert.ok(realm);
        return state.rpc(realm.rpc_url[0], method,
          {checkpoint_id:Number(checkpoint), user_id:user, ...params});
      };
      const slot = async (user, asset, offset) => {
        const key = [user, asset, Math.floor(offset/4)].join(':');
        if (!cache.has(key)) cache.set(key, rpc(user, 'psy_get_user_contract_state_tree_leaf_hash',
          {contract_id:asset, leaf_id:Math.floor(offset/4)}));
        return decodeFeltSlot(await cache.get(key), offset);
      };
      return {rpc, slot, wide:async (user, asset, offset) => decodeAmount(await Promise.all([0,1].map(j => slot(user, asset, offset+j))))};
    };
    const old = frame(c.checkpoint_id), next = frame(included.checkpoint);
    assert.equal(await old.rpc(U, 'psy_get_user_tree_leaf_hash', {}), c.state_transition.start_user_leaf_hash);
    assert.equal(await next.rpc(U, 'psy_get_user_tree_leaf_hash', {}), c.state_transition.end_user_leaf_hash);
    const assets = [];
    const configuration = JSON.parse(readFileSync(join(home, 'route/executor.json'), 'utf8'));
    for (const pending of beforeReport.pending) assert.ok(configuration.assetMetadata.some(m => BigInt(m.contractId) === pending.asset));
    for (const metadata of configuration.assetMetadata) {
      const asset = metadata.contractId;
      const [before, after, sent, claimed, newClaimed] = await Promise.all([
        old.wide(U, asset, 0), next.wide(U, asset, 0), old.wide(V, asset, 33554453+4*U),
        old.wide(U, asset, 33554455+4*V), next.wide(U, asset, 33554455+4*V)]);
      const pending = checkClaimAmounts({before, after, sent, claimed, newClaimed});
      assert.equal(beforeReport.pending.find(p => p.asset === BigInt(asset))?.amount ?? 0n, pending);
      assert.equal(await next.wide(V, asset, 0), 0n);
      assets.push({asset, decimals:metadata.decimals, before, after, sent, claimed, newClaimed, received:pending});
    }
    const [before, after, sent, claimed, newClaimed] = await Promise.all([
      old.slot(U, 0, 0), next.slot(U, 0, 0), old.slot(V, 0, 3+2*U),
      old.slot(U, 0, 4+2*V), next.slot(U, 0, 4+2*V)]);
    const fee = c.stats.guta_fees_collected+c.stats.da_fees_collected;
    assert.equal(fee, proof.fee);
    assert.equal(fee, included.receipt.data.result.fees_collected);
    const received = checkClaimAmounts({before, after, sent, claimed, newClaimed, fee, wide:false});
    assert.equal(beforeReport.nativePending, received);
    assert.equal(await next.slot(V, 0, 0), 0n);
    rows.push({scenario, owner:done.owner, publicKeyHash:c.new_user_leaf.public_key,
      nonce:c.new_user_leaf.nonce, vault:done.vaultId, contentHash:included.contentHash,
      requestSha256:proof.requestSha256, sourceCheckpoint:c.checkpoint_id,
      includedCheckpoint:included.checkpoint, startUserLeafHash:c.state_transition.start_user_leaf_hash,
      endUserLeafHash:c.state_transition.end_user_leaf_hash,
      endUserStateRoot:c.new_user_leaf.user_state_tree_root, assets,
      native:{asset:0, decimals:9, before, after, sent, claimed, newClaimed, received, fee}});
  }
  return {checkedAt:new Date().toISOString(), verificationSummarySha256:sha256(readFileSync(verificationSummary)),
    rows, broadcast:false, scope:'actual ordinary-owner FT/native spendable increases and exact sender cursor consumption at historical checkpoints, tied to independently verified UPS start/end leaves and exact fees; public state observations, not runtime attestation or cross-UPS atomicity'};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [base, proofs, out, scenario] = process.argv.slice(2);
  assert.ok(base && proofs && out);
  save(out, await auditOwnerClaims(base, proofs, scenario === 'all' ? ['success','recovery','partial-recovery'] : scenario ? [scenario] : undefined));
}
