// Ordinary three-market Executor adapter. Requires a separately accepted exact
// wallet transport and independent native verifier; the public HTTP server never
// instantiates it. No direct signer or replacement-operation fallback exists.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ExecutionJournal } from "../journal.mjs";
import { executeCycle } from "../worker.mjs";
import { canonical, hashPattern } from "../../market-client/protocol.mjs";
import {
  actionQuery,
  validateMarketRequest,
  buildMarketPlan,
} from "../../market-client/marketPlan.mjs";
import { validatePositionSnapshot } from "../../market-client/positionSnapshot.mjs";
const sha = (x) => createHash("sha256").update(canonical(x)).digest("hex");
const stateOnly = (x) => {
  const copy = structuredClone(x);
  delete copy.checkpoint;
  delete copy.observedAt;
  if (copy.seller) copy.seller = stateOnly(copy.seller);
  return copy;
};
export function createExactMarketWorkflow({
  directory,
  registry: inputRegistry,
  registryHash,
  userId,
  fingerprint,
  abis: inputAbis,
  readPlanRecord,
  readSnapshot,
  transport,
  now = Date.now,
}) {
  const registry = structuredClone(inputRegistry),
    abis = structuredClone(inputAbis);
  assert.equal(sha(registry), registryHash, "Pinned market registry required");
  const abiHash = (x) =>
    createHash("sha256")
      .update(canonical(x) + "\n")
      .digest("hex");
  for (const m of registry.markets) {
    assert.equal(abiHash(abis[m.marketId]), m.abiSha256, "Market ABI changed");
    for (const a of m.assets)
      assert.equal(
        abiHash(abis[a.contractId]),
        a.abiSha256,
        "Asset ABI changed",
      );
    if (m.nftId)
      assert.equal(abiHash(abis[m.nftId]), m.nftAbiSha256, "NFT ABI changed");
  }
  assert.match(fingerprint, hashPattern);
  for (const method of [
    "prepare",
    "verifyPrepared",
    "recheck",
    "broadcastPrepared",
    "reconcile",
  ])
    assert.equal(
      typeof transport?.[method],
      "function",
      "Missing exact wallet transport " + method,
    );
  assert.equal(typeof readPlanRecord, "function");
  assert.equal(typeof readSnapshot, "function");
  const journal = new ExecutionJournal({
    directory,
    network: registry.network.name,
    vaultId: userId,
    fingerprint,
  });
  const rebuild = (task) => {
    assert.equal(task.request.userId, userId);
    validateMarketRequest(task.request, registry);
    const expected = buildMarketPlan(
      task.snapshot,
      task.context,
      task.request,
      registry,
      abis,
      { registryHash, now: task.snapshot.observedAt },
    );
    assert.deepEqual(task.plan, expected, "Authorized plan changed");
    return expected;
  };
  const verify = async (task, p) => {
    const plan = rebuild(task);
    assert.equal(p.schema, 1);
    for (const key of [
      "requestSha256",
      "manifestSha256",
      "endUserLeafHash",
      "sigHash",
      "sessionHash",
    ])
      assert.match(p[key] ?? "", hashPattern, "Missing exact proof " + key);
    for (const [key, value] of Object.entries({
      userId,
      fingerprint,
      registryHash,
      publicKeyHash: task.snapshot.user.publicKeyHash,
      sdkManifestSha256: registry.sdkManifestSha256,
      startUserLeafHash: plan.startUserLeafHash,
      walletNonce: plan.walletNonce,
      validUntilCheckpoint: plan.validUntilCheckpoint,
    }))
      assert.equal(p[key], value, "Prepared " + key + " changed");
    assert.match(p.actualFee ?? "", /^[1-9]\d{0,20}$/);
    assert.ok(
      BigInt(p.actualFee) <= BigInt(plan.maxNetworkFee),
      "Fee exceeds maximum",
    );
    assert.deepEqual(
      p.fullCalls,
      [
        ...plan.calls,
        { contract_id: "0", method_name: "simple_burn", inputs: [p.actualFee] },
      ],
      "Full stack including fee burn changed",
    );
    assert.equal(
      await transport.verifyPrepared(structuredClone(task), structuredClone(p)),
      true,
      "Independent full UPS, caller, calls and session/sig_hash verification required",
    );
  };
  const fresh = async (task) => {
    const record = structuredClone(
      await readPlanRecord(structuredClone(task.request)),
    );
    const copy = {
      profile: "ordinary-reviewed-markets-v1",
      request: record.request,
      snapshot: record.snapshot,
      context: record.context,
      plan: record.plan,
    };
    rebuild(copy);
    assert.deepEqual(
      record.request,
      task.request,
      "Fresh plan changed request",
    );
    if (record.snapshot.checkpoint > task.plan.validUntilCheckpoint)
      return false;
    return (
      canonical(stateOnly(record.snapshot)) ===
        canonical(stateOnly(task.snapshot)) &&
      canonical(stateOnly(record.context)) ===
        canonical(stateOnly(task.context))
    );
  };
  const reconcile = async (attempt) => {
    await verify(attempt.task, attempt.proof);
    const result = await transport.reconcile(structuredClone(attempt));
    if (result?.status !== "included" || result.success !== true)
      return {
        status: "unresolved",
        reason:
          "Original exact successful request not established; no replacement authorized",
      };
    assert.equal(result.userId, userId);
    assert.equal(result.endUserLeafHash, attempt.proof.endUserLeafHash);
    assert.match(result.contentHash ?? "", hashPattern);
    assert.ok(
      Number.isSafeInteger(result.checkpoint) &&
        result.checkpoint >= attempt.task.plan.startCheckpoint,
    );
    const observed = await readSnapshot(
      actionQuery(attempt.task.request, registry),
    );
    validatePositionSnapshot(
      observed,
      actionQuery(attempt.task.request, registry),
      registry,
      registryHash,
      now(),
    );
    if (
      observed.checkpoint < result.checkpoint ||
      BigInt(observed.user.nonce) < BigInt(attempt.proof.walletNonce)
    )
      return {
        status: "unresolved",
        reason: "Exact receipt awaits common-state visibility",
      };
    if (observed.user.nonce === attempt.proof.walletNonce)
      assert.equal(
        observed.user.leafHash,
        attempt.proof.endUserLeafHash,
        "Same nonce has another state endpoint",
      );
    return result;
  };
  const run = async (input) => {
    const request = structuredClone(input);
    assert.equal(request.userId, userId);
    validateMarketRequest(request, registry);
    return executeCycle({
      journal,
      adapter: {
        reconcile,
        scan: async () => {
          const record = structuredClone(
            await readPlanRecord(structuredClone(request)),
          );
          assert.equal(record.registryHash, registryHash);
          assert.deepEqual(record.request, request);
          const { recordId, registryHash: _, ...body } = record;
          assert.equal(sha(body), recordId, "Unsigned record changed");
          const action = {
            profile: "ordinary-reviewed-markets-v1",
            request: record.request,
            snapshot: record.snapshot,
            context: record.context,
            plan: record.plan,
          };
          rebuild(action);
          return { checkpoint: record.snapshot.checkpoint, action };
        },
        isCurrent: fresh,
        prove: async (task) => {
          const p = structuredClone(
            await transport.prepare(structuredClone(task)),
          );
          await verify(task, p);
          return p;
        },
        validateProof: async (task, p) => {
          try {
            await verify(task, p);
            return await fresh(task);
          } catch {
            return false;
          }
        },
        submit: async (task, p) => {
          await verify(task, p);
          assert.equal(
            await fresh(task),
            true,
            "Fresh market state changed before broadcast",
          );
          assert.equal(
            await transport.recheck(structuredClone(task), structuredClone(p)),
            true,
            "Native identity/state/nonce/fee recheck failed",
          );
          const ack = await transport.broadcastPrepared(
            structuredClone(task),
            structuredClone(p),
          );
          return { ack, requestSha256: p.requestSha256 };
        },
      },
    });
  };
  return {
    run,
    reconcile: () => journal.reconcile(reconcile),
    unresolved: () => journal.unresolved(),
    scope: { userId, fingerprint, network: registry.network.name },
    requestIdentity: sha,
  };
}
