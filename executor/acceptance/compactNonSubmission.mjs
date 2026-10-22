// Explicit operator resolution of ONE unresolved compact broadcast whose
// connection was never established. Never re-sends, re-proves or signs. Every
// condition below must hold; otherwise the intent stays unresolved.
// Usage: compactNonSubmission.mjs EXECUTOR_CONFIG FRESH_EVIDENCE_JSON
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadOptions} from '../config.mjs';
import {ExecutionJournal} from '../journal.mjs';
import {publicState} from '../publicState.mjs';
import {receiptReader} from '../chainReceipts.mjs';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {save} from '../../batching/admission/liveSupport.mjs';

// TCP connect failure: the HTTP request body cannot have left this host.
export const CONNECT_STAGE = /client error \(Connect\): tcp connect error/;
// The send window must be strictly behind the common checkpoint by this margin.
export const WINDOW_MARGIN = 4;

export function assertConnectStageFailure(failure) {
 assert.equal(failure.ok, false);
 assert.equal(failure.phase, 'broadcast-compact-ups');
 assert.match(failure.reason, CONNECT_STAGE, 'only a connection that was never established can be resolved here');
}

const [config, evidence] = process.argv.slice(2);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 assert.ok(config && evidence, 'usage: compactNonSubmission.mjs EXECUTOR_CONFIG FRESH_EVIDENCE_JSON');
 assert.ok(!existsSync(evidence), 'fresh evidence path required');
 const o = await loadOptions(config), journal = new ExecutionJournal({directory: o.runtimeDirectory, network: o.network, vaultId: o.vaultId, fingerprint: o.fingerprint});
 const pending = await journal.unresolved();
 assert.equal(pending.length, 1, 'exactly one unresolved broadcast');
 const attempt = pending[0], p = attempt.proof, out = p.submissionDirectory, sha = b => createHash('sha256').update(b).digest('hex');
 const lossless = f => parseLosslessJson(readFileSync(f, 'utf8'));
 const failure = JSON.parse(readFileSync(join(out, 'failure.json'), 'utf8'));
 assertConnectStageFailure(failure);
 const intent = lossless(join(out, 'intent.json')), pre = lossless(join(p.preparedDirectory, 'preflight.json'));
 assert.equal(sha(readFileSync(join(out, 'request.json'))), intent.requestSha256);
 assert.equal(intent.userId, BigInt(o.vaultId));
 assert.equal(intent.endUserLeafHash, pre.core.state_transition.end_user_leaf_hash);
 assert.equal(intent.nonce, pre.core.new_user_leaf.nonce);
 const s = await publicState(o.rpcConfig), validUntil = Number(attempt.task.validUntilCheckpoint);
 assert.ok(s.checkpoint > validUntil + WINDOW_MARGIN, 'original send window must be closed');
 const realm = s.network.realm_configs.find(r => r.id === Math.floor(o.vaultId / s.network.users_per_realm));
 const args = {checkpoint_id: s.checkpoint, user_id: o.vaultId};
 const leaf = await s.rpc(realm.rpc_url[0], 'psy_get_user_leaf_data', args, {exactIntegers: true}), leafHash = await s.rpc(realm.rpc_url[0], 'psy_get_user_tree_leaf_hash', args);
 // An unchanged start leaf means the intent is unapplied. Any later UPS from
 // this leaf (including a fresh replacement) makes the original permanently unincludable.
 assert.equal(leafHash, pre.core.state_transition.start_user_leaf_hash, 'vault leaf moved; reconcile by receipt instead');
 assert.equal(BigInt(leaf.nonce) + 1n, intent.nonce);
 const receipt = await (await receiptReader(o.rpcConfig, {maxPages: o.receiptMaxPages ?? 20}))({userId: o.vaultId, endUserLeafHash: intent.endUserLeafHash, minCheckpoint: Number(pre.core.checkpoint_id)});
 assert.notEqual(receipt.status, 'included');
 const record = {checkedAt: new Date().toISOString(), taskId: attempt.taskId, vaultId: o.vaultId, failure, requestSha256: intent.requestSha256, intentNonce: String(intent.nonce),
  endUserLeafHash: intent.endUserLeafHash, startUserLeafHash: pre.core.state_transition.start_user_leaf_hash, sourceCheckpoint: String(pre.core.checkpoint_id), validUntilCheckpoint: validUntil,
  commonCheckpoint: s.checkpoint, currentLeafHash: leafHash, currentNonce: String(leaf.nonce), receiptStatus: receipt.status, resent: false, reproved: false,
  scope: 'connect-stage failure, closed send window, unchanged start leaf and no indexed receipt; a replacement shares the start leaf, so at most one of the two can ever apply'};
 save(evidence, record);
 await journal.locked(async () => {
  const again = await journal.unresolved();
  assert.deepEqual(again.map(x => x.taskId), [attempt.taskId], 'journal changed during resolution');
  await journal.append({status: 'not-submitted', taskId: attempt.taskId, reason: failure.reason, source: 'operator-connect-failure-closed-window-unapplied', evidence});
 });
 assert.equal((await journal.unresolved()).length, 0);
 console.log(JSON.stringify({resolved: attempt.taskId, evidence}));
}
