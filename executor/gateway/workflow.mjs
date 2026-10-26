// Integration seam for a future reviewed browser exact-proof transport. It uses
// the existing financial journal, not browser localStorage. Production gateway
// does not instantiate this until that transport and full UPS are accepted.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ExecutionJournal } from "../journal.mjs";
import { executeCycle } from "../worker.mjs";
import {
  buildAmmPlan,
  validateSnapshot,
} from "../../market-client/ammPlan.mjs";
import {
  canonical,
  hashPattern,
  WRITE_BOUNDARY,
} from "../../market-client/protocol.mjs";
const sha = (x) => createHash("sha256").update(canonical(x)).digest("hex");
export function createExactUserWorkflow({
  directory,
  registry,
  registryHash,
  userId,
  fingerprint,
  readSnapshot,
  transport,
  now = Date.now,
}) {
  assert.ok(transport, WRITE_BOUNDARY);
  for (const f of [
    "prepare",
    "verifyPrepared",
    "recheck",
    "broadcastPrepared",
    "reconcile",
  ])
    assert.equal(
      typeof transport[f],
      "function",
      "Exact transport method required: " + f,
    );
  const journal = new ExecutionJournal({
    directory,
    network: registry.network.name,
    vaultId: userId,
    fingerprint,
  });
  async function verified(task, p) {
    assert.equal(task.request.userId, userId);
    assert.deepEqual(
      task.plan,
      buildAmmPlan(task.snapshot, task.request, registry, {
        now: task.snapshot.observedAt,
        registryHash,
      }),
      "Persisted authorized plan changed",
    );
    assert.equal(p.schema, 1);
    for (const k of [
      "requestSha256",
      "manifestSha256",
      "endUserLeafHash",
      "sigHash",
      "sessionHash",
    ])
      assert.match(p[k] ?? "", hashPattern, "Missing exact proof " + k);
    assert.equal(p.userId, userId);
    assert.equal(p.fingerprint, fingerprint);
    assert.equal(p.publicKeyHash, task.snapshot.user.publicKeyHash);
    assert.equal(p.registryHash, registryHash);
    assert.equal(p.sdkManifestSha256, registry.sdkManifestSha256);
    assert.equal(p.startUserLeafHash, task.plan.startUserLeafHash);
    assert.equal(p.walletNonce, task.plan.walletNonce);
    assert.equal(p.validUntilCheckpoint, task.plan.validUntilCheckpoint);
    assert.match(p.actualFee ?? "", /^[1-9]\d{0,20}$/);
    assert.ok(
      BigInt(p.actualFee) <= BigInt(task.plan.maxNetworkFee),
      "Actual fee exceeds intent budget",
    );
    assert.deepEqual(
      p.fullCalls,
      [
        ...task.plan.calls,
        { contract_id: "0", method_name: "simple_burn", inputs: [p.actualFee] },
      ],
      "Full ordinary stack, including automatic burn, must match exactly",
    );
    assert.equal(
      await transport.verifyPrepared(structuredClone(task), structuredClone(p)),
      true,
      "Independent full-UPS/call-stack/session/sig_hash verification required",
    );
    return true;
  }
  const current = async (task) => {
    const fresh = await readSnapshot(task.request.marketId, userId);
    validateSnapshot(fresh, registry, {
      marketId: task.request.marketId,
      userId,
      now: now(),
      registryHash,
    });
    if (fresh.checkpoint > task.plan.validUntilCheckpoint) return false;
    return [
      "user",
      "pool",
      "queue",
      "order",
      "assets",
      "funding",
      "anchors",
    ].every((k) => canonical(fresh[k]) === canonical(task.snapshot[k]));
  };
  const reconcile = async (attempt) => {
    await verified(attempt.task, attempt.proof);
    const result = await transport.reconcile(structuredClone(attempt));
    // Missing/negative indexes never authorize a replacement operation.
    if (result?.status !== "included")
      return {
        status: "unresolved",
        reason: "Original exact identity remains unresolved",
      };
    assert.equal(result.userId, userId);
    assert.equal(result.endUserLeafHash, attempt.proof.endUserLeafHash);
    assert.match(result.contentHash ?? "", hashPattern);
    assert.ok(
      Number.isSafeInteger(result.checkpoint) &&
        result.checkpoint >= attempt.task.plan.startCheckpoint,
    );
    const common = await readSnapshot(attempt.task.request.marketId, userId);
    validateSnapshot(common, registry, {
      marketId: attempt.task.request.marketId,
      userId,
      now: now(),
      registryHash,
    });
    if (
      common.checkpoint < result.checkpoint ||
      BigInt(common.user.nonce) < BigInt(attempt.proof.walletNonce)
    )
      return {
        status: "unresolved",
        reason: "Exact receipt awaits common-state visibility",
      };
    if (common.user.nonce === attempt.proof.walletNonce)
      assert.equal(
        common.user.leafHash,
        attempt.proof.endUserLeafHash,
        "Confirmed nonce has another state endpoint",
      );
    return result;
  };
  const run = async (input) => {
    const request = structuredClone(input);
    assert.equal(request.userId, userId);
    const adapter = {
      reconcile,
      scan: async () => {
        const snapshot = await readSnapshot(request.marketId, userId),
          plan = buildAmmPlan(snapshot, request, registry, {
            now: now(),
            registryHash,
          });
        return {
          checkpoint: snapshot.checkpoint,
          action: {
            profile: "ordinary-market-client-v1",
            request,
            snapshot,
            plan,
          },
        };
      },
      isCurrent: current,
      prove: async (task) => {
        const p = await transport.prepare(structuredClone(task));
        await verified(task, p);
        return p;
      },
      validateProof: async (task, p) => {
        try {
          await verified(task, p);
          return await current(task);
        } catch {
          return false;
        }
      },
      submit: async (task, p) => {
        await verified(task, p);
        assert.equal(
          await current(task),
          true,
          "Fresh state changed before exact broadcast",
        );
        assert.equal(
          await transport.recheck(structuredClone(task), structuredClone(p)),
          true,
          "Native endpoint/nonce/fee/session recheck failed",
        );
        const ack = await transport.broadcastPrepared(
          structuredClone(task),
          structuredClone(p),
        );
        return { ack, requestSha256: p.requestSha256 };
      },
    };
    return executeCycle({ adapter, journal });
  };
  return {
    run,
    reconcile: () => journal.reconcile(reconcile),
    unresolved: () => journal.unresolved(),
    scope: { userId, fingerprint, network: registry.network.name },
    requestIdentity: sha,
  };
}
