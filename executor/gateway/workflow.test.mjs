import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExactUserWorkflow } from "./workflow.mjs";
import { VaultBusy } from "../journal.mjs";
import {
  fixtureRegistry,
  fixturePin,
  observed,
  swapRequest,
  H,
  NOW,
} from "./fixtures.mjs";
const registry = await fixtureRegistry(),
  { registrySha256: registryHash } = await fixturePin(),
  fingerprint = H("ordinary circuit test fixture");
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), "psy-user-workflow-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let s = observed(registry, registryHash),
    prepares = 0,
    sends = 0,
    known = false,
    fail = false,
    alter,
    preparing,
    release;
  const waitStarted = new Promise((r) => (preparing = r));
  let hold = null;
  const transport = {
    prepare: async (task) => {
      prepares++;
      preparing();
      if (hold) await hold;
      const p = {
        schema: 1,
        userId: 12345,
        fingerprint,
        publicKeyHash: task.snapshot.user.publicKeyHash,
        registryHash,
        sdkManifestSha256: registry.sdkManifestSha256,
        startUserLeafHash: task.plan.startUserLeafHash,
        walletNonce: task.plan.walletNonce,
        validUntilCheckpoint: task.plan.validUntilCheckpoint,
        actualFee: "1000000000",
        fullCalls: [
          ...task.plan.calls,
          {
            contract_id: "0",
            method_name: "simple_burn",
            inputs: ["1000000000"],
          },
        ],
        requestSha256: H("exact request"),
        manifestSha256: H("prepared manifest"),
        endUserLeafHash: H("end leaf"),
        sigHash: H("sig context"),
        sessionHash: H("session"),
      };
      alter?.(p);
      return p;
    },
    verifyPrepared: async (_task, p) =>
      p.sigHash === H("sig context") && p.sessionHash === H("session"),
    recheck: async () => true,
    broadcastPrepared: async () => {
      sends++;
      if (fail) throw Error("synthetic lost response");
      return { accepted: true };
    },
    reconcile: async () =>
      known
        ? {
            status: "included",
            userId: 12345,
            endUserLeafHash: H("end leaf"),
            contentHash: H("content"),
            checkpoint: 1001,
          }
        : { status: "unresolved" },
  };
  const make = () =>
    createExactUserWorkflow({
      directory,
      registry,
      registryHash,
      userId: 12345,
      fingerprint,
      readSnapshot: async () => structuredClone(s),
      transport,
      now: () => NOW,
    });
  return {
    make,
    transport,
    get prepares() {
      return prepares;
    },
    get sends() {
      return sends;
    },
    get snapshot() {
      return s;
    },
    set snapshot(v) {
      s = v;
    },
    set fail(v) {
      fail = v;
    },
    set alter(v) {
      alter = v;
    },
    waitStarted,
    hold: () => {
      hold = new Promise((r) => (release = r));
    },
    release: () => release(),
    confirm: () => {
      known = true;
      s = {
        ...s,
        checkpoint: 1001,
        user: { ...s.user, nonce: "8", leafHash: H("end leaf") },
        order: {
          ...s.order,
          kind: "1",
          pool: String(registry.markets[0].vaultId),
          nonce: "1",
          deadline: "1064",
        },
      };
    },
    knownWithoutCommon: () => {
      known = true;
    },
  };
}
test("production workflow cannot instantiate without an explicit exact-proof transport", () =>
  assert.throws(
    () => createExactUserWorkflow({ transport: null }),
    /No financial submission/,
  ));
test("lost ACK, restart and duplicate request reconcile original only, without another proof/payment", async (t) => {
  const f = await setup(t);
  f.fail = true;
  const first = await f.make().run(swapRequest());
  assert.equal(first.status, "unresolved");
  assert.equal(f.sends, 1);
  assert.equal(f.prepares, 1);
  const second = await f.make().run(swapRequest());
  assert.equal(second.status, "unresolved");
  assert.equal(f.sends, 1);
  assert.equal(f.prepares, 1);
  f.confirm();
  const recovered = await f.make().reconcile();
  assert.equal(recovered[0].result.status, "included");
  assert.equal((await f.make().unresolved()).length, 0);
  await assert.rejects(f.make().run(swapRequest()), /existing order/);
  assert.equal(f.sends, 1);
});
test("exact receipt alone waits for common-state nonce and endpoint visibility", async (t) => {
  const f = await setup(t);
  await f.make().run(swapRequest());
  f.knownWithoutCommon();
  const out = await f.make().reconcile();
  assert.equal(out[0].result.status, "unresolved");
  assert.equal((await f.make().unresolved()).length, 1);
  f.confirm();
  assert.equal((await f.make().reconcile())[0].result.status, "included");
});
test("full stack, actual fees and session/sig_hash tampering reject before broadcast", async (t) => {
  for (const change of [
    (p) => (p.fullCalls[2].inputs = ["223344", "17", "1"]),
    (p) => (p.actualFee = "5000000001"),
    (p) => (p.sigHash = H("wrong context")),
    (p) => (p.sessionHash = H("wrong session")),
    (p) => (p.walletNonce = "9"),
    (p) => (p.registryHash = H("wrong registry")),
  ]) {
    const f = await setup(t);
    f.alter = change;
    await assert.rejects(f.make().run(swapRequest()));
    assert.equal(f.sends, 0);
  }
});
test("nonce, wrong network and state-root changes during proof stop the send", async (t) => {
  for (const change of [
    (s) => (s.user.nonce = "8"),
    (s) => (s.network = { ...s.network, magic: "42" }),
    (s) => (s.anchors[0].root = H("changed state")),
    (s) => (s.lifecycle.consumed = "1"),
    (s) => (s.lifecycle.recoveryPool = "1012928"),
    (s) => (s.lifecycle.batchReady = "0"),
    (s) => (s.lifecycle.batchPhase = "2"),
  ]) {
    const f = await setup(t);
    const prepare = f.transport.prepare;
    f.transport.prepare = async (task) => {
      const p = await prepare(task);
      const s = structuredClone(f.snapshot);
      change(s);
      f.snapshot = s;
      return p;
    };
    await assert.rejects(f.make().run(swapRequest()));
    assert.equal(f.sends, 0);
  }
});
test("same-machine two Executors share the ordinary payer lock and do not duplicate proof", async (t) => {
  const f = await setup(t);
  f.hold();
  const first = f.make().run(swapRequest());
  await f.waitStarted;
  await assert.rejects(f.make().run(swapRequest()), VaultBusy);
  assert.equal(f.prepares, 1);
  f.release();
  assert.equal((await first).status, "unresolved");
  assert.equal(f.sends, 1);
});
