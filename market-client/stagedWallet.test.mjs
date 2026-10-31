// Synthetic backend tests; native complete proofs are tested separately.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createStagedWallet } from "./wallet/staged.mjs";
import { prepareOnlyMarketJobs } from "./wallet/prepareOnly.mjs";
import { canonical } from "./protocol.mjs";
import { rpcEnvelope } from "./rpcWire.mjs";
const H = (s) => createHash("sha256").update(s).digest("hex");
// Synthetic shared lock authority. It models the Browser LockManager contract;
// it is not a browser-worker or cross-machine acceptance claim.
function lockAuthority(){const tails=new Map();return async(key,work)=>{const prior=tails.get(key)??Promise.resolve();const next=prior.catch(()=>{}).then(work);tails.set(key,next);try{return await next;}finally{if(tails.get(key)===next)tails.delete(key);}};}
function fixture() {
  const memory = new Map(),
    network = { name: "synthetic", magic: "1" },
    context = {
      origin: "https://market.example",
      account: H("public"),
      fingerprint: H("key"),
      chainKey: H("chain"),
      userId: 12345,
      networkHash: H(canonical(network)),
    };
  const record = {
    recordId: H("record"),
    registryHash: H("registry"),
    request: { userId: 12345 },
    snapshot: { user: { publicKeyHash: context.account } },
    plan: {
      financialAuthorization: false,
      userId: 12345,
      recipientId: 12345,
      network,
      sdkManifestSha256: H("sdk"),
      startUserLeafHash: H("start"),
      walletNonce: "8",
      startCheckpoint: 100,
      validUntilCheckpoint: 164,
      maxNetworkFee: "5000000000",
      calls: [
        { contract_id: "2497", method_name: "request_cancel", inputs: [] },
      ],
    },
  };
  let prepares = 0,
    sends = 0,
    valid = true,
    fresh = true,
    known = false,
    saveFail = false;
  const store = {
    get: async (k) => structuredClone(memory.get(k)),
    set: async (k, v) => {
      if (saveFail) throw Error("synthetic persistence failure");
      memory.set(k, structuredClone(v));
    },
  };
  const backend = {
    prepareOnly: async (r) => {
      prepares++;
      const requestJson = JSON.stringify({
        user_ec_input: { core: { nonce: 8 } },
        proof: [1, 2, 3],
      });
      return {
        schema: 1,
        requestJson,
        requestSha256: H(requestJson),
        manifestSha256: H("manifest"),
        endUserLeafHash: H("end"),
        sigHash: H("sig"),
        sessionHash: H("session"),
        fingerprint: H("key"),
        userId: 12345,
        publicKeyHash: context.account,
        networkHash: context.networkHash,
        registryHash: r.registryHash,
        sdkManifestSha256: r.plan.sdkManifestSha256,
        startUserLeafHash: r.plan.startUserLeafHash,
        walletNonce: "8",
        validUntilCheckpoint: 164,
        actualFee: "1000001000",
        fullCalls: [
          ...r.plan.calls,
          {
            contract_id: "0",
            method_name: "simple_burn",
            inputs: ["1000001000"],
          },
        ],
      };
    },
    verifyPrepared: async (r, p) => ({
      fullProofVerified: valid,
      fullCallsBound: valid,
      sessionBound: valid,
      sigHashBound: valid,
      endpointsAndFeesBound: valid,
      requestSha256: p.requestSha256,
      manifestSha256: p.manifestSha256,
      sdkManifestSha256: p.sdkManifestSha256,
    }),
    recheck: async (r, p) => ({
      requestSha256: p.requestSha256,
      checkpoint: 101,
      identityAndDependenciesVerified: fresh,
      fullStateAndNonceVerified: fresh,
      feesVerified: fresh,
    }),
    broadcastExact: async () => {
      sends++;
      throw Error("synthetic lost response");
    },
    reconcile: async (p) =>
      known
        ? {
            status: "included",
            success: true,
            requestSha256: p.requestSha256,
            userId: 12345,
            endUserLeafHash: p.endUserLeafHash,
            contentHash: H("content"),
            networkHash: context.networkHash,
            checkpoint: 102,
            commonCheckpoint: 102,
            commonNonce: "8",
            commonLeafHash: p.endUserLeafHash,
          }
        : { status: "unresolved" },
  };
  const exclusive=lockAuthority();
  const make = (options={}) =>
    createStagedWallet({
      store,
      backend,
      exclusive,
      confirmBroadcast: async terms => ({approved:true,approvalSha256:H(canonical(terms))}),
      verifyRecord: async (r) => assert.equal(r.recordId, record.recordId),
      ...options,
    });
  return {
    make,
    context,
    record,
    backend,
    memory,
    exclusive,
    set valid(x) {
      valid = x;
    },
    set fresh(x) {
      fresh = x;
    },
    set known(x) {
      known = x;
    },
    set saveFail(x) {
      saveFail = x;
    },
    get prepares() {
      return prepares;
    },
    get sends() {
      return sends;
    },
  };
}
test("wallet persists exact preparation, sends once and reconciles original across restart", async () => {
  const f = fixture(),
    p = await f.make().prepare(f.context, f.record);
  assert.equal(p.phase, "prepared");
  assert.equal(f.prepares, 1);
  assert.equal(f.sends, 0);
  assert.deepEqual(await f.make().prepare(f.context, f.record), p);
  assert.equal(f.prepares, 1);
  assert.equal(
    (await f.make().broadcast(f.context, p.intentId, p.preparedHash)).phase,
    "unresolved",
  );
  assert.equal(f.sends, 1);
  await f.make().broadcast(f.context, p.intentId, p.preparedHash);
  assert.equal(f.sends, 1);
  await assert.rejects(f.make().assertNoPending(f.context));
  assert.equal(
    (await f.make().reconcile(f.context, p.intentId)).phase,
    "unresolved",
  );
  f.known = true;
  assert.equal(
    (await f.make().reconcile(f.context, p.intentId)).phase,
    "included",
  );
  assert.equal(await f.make().assertNoPending(f.context), true);
  assert.equal(f.prepares, 1);
});

test("a malformed ACK retains the original account hold across restart until exact reconciliation", async () => {
  const f = fixture(); let sends = 0;
  f.backend.broadcastExact = async () => {
    sends++;
    return rpcEnvelope({ jsonrpc: "2.0", id: 2, result: "unrelated response" });
  };
  const service = f.make(), prepared = await service.prepare(f.context, f.record);
  assert.equal((await service.broadcast(f.context, prepared.intentId, prepared.preparedHash)).phase, "unresolved");
  const restarted = f.make();
  await restarted.broadcast(f.context, prepared.intentId, prepared.preparedHash);
  await assert.rejects(restarted.cancelPreparation(f.context, prepared.intentId));
  await assert.rejects(restarted.assertNoPending(f.context));
  await assert.rejects(restarted.prepare({ ...f.context, origin: "https://other.example" }, f.record), /nonce reserved/);
  assert.equal(sends, 1); assert.equal(f.prepares, 1);
  f.known = true;
  assert.equal((await restarted.reconcile(f.context, prepared.intentId)).phase, "included");
  assert.equal(await restarted.assertNoPending(f.context), true);
  assert.equal(sends, 1);
});
test("failed native verification preserves completed exact proof for verification without another proof", async () => {
  const f = fixture();
  f.valid = false;
  await assert.rejects(f.make().prepare(f.context, f.record));
  const [p] = await f.make().list(f.context);
  assert.equal(p.phase, "unverified");
  assert.equal(f.prepares, 1);
  await assert.rejects(
    f.make().broadcast(f.context, p.intentId, p.preparedHash),
  );
  f.valid = true;
  assert.equal(
    (await f.make().verify(f.context, p.intentId)).phase,
    "prepared",
  );
  assert.equal(f.prepares, 1);
});
test("origin, account, request bytes, state, persistence and unknown-broadcast cancellation fail closed", async () => {
  const f = fixture(),
    p = await f.make().prepare(f.context, f.record);
  await assert.rejects(
    f
      .make()
      .broadcast(
        { ...f.context, origin: "https://other.example" },
        p.intentId,
        p.preparedHash,
      ),
  );
  await assert.rejects(
    f.make().broadcast(f.context, p.intentId, H("substituted")),
  );
  f.fresh = false;
  await assert.rejects(
    f.make().broadcast(f.context, p.intentId, p.preparedHash),
  );
  assert.equal(f.sends, 0);
  f.fresh = true;
  f.saveFail = true;
  await assert.rejects(
    f.make().broadcast(f.context, p.intentId, p.preparedHash),
  );
  assert.equal(f.sends, 0);
  f.saveFail = false;
  await f.make().broadcast(f.context, p.intentId, p.preparedHash);
  await assert.rejects(f.make().cancelPreparation(f.context, p.intentId));
  assert.equal(f.sends, 1);
});
test("same account across origins shares the nonce gate and explicit unbroadcast cancellation releases it", async () => {
  const f = fixture(),
    service = f.make(),
    p = await service.prepare(f.context, f.record);
  await assert.rejects(
    service.prepare(
      { ...f.context, origin: "https://other.example" },
      f.record,
    ),
    /nonce reserved/,
  );
  assert.deepEqual(
    await service.list({ ...f.context, origin: "https://other.example" }),
    [],
  );
  await service.cancelPreparation(f.context, p.intentId);
  await service.prepare(
    { ...f.context, origin: "https://other.example" },
    f.record,
  );
  assert.equal(f.prepares, 2);
  assert.equal(f.sends, 0);
});
test("prepare-only SDK runner never invokes a submit-capable convenience or trace-step method", async () => {
  const invoked = [],
    raw = (type, data = {}) => JSON.stringify({ type, data }),
    provider = {
      prepareTraceProofSchedule: async () => {
        invoked.push("schedule");
        return "{}";
      },
      getTraceProofJobStepIndices: async () => ({
        cfc_step_indices: [0, 1],
        external_step_indices: [],
      }),
      proveUpsStartJob: async () => raw("ups_start"),
      proveZkSignJob: async () => raw("zk_sign"),
      proveCfcJobWithScheduleStep: async (a, e, s, i) =>
        raw("cfc_step", { step_index: i }),
      proveEndcapJobFromOutputJsons: async () =>
        raw("end_cap", { tx_hash: H("end"), proof: [1, 2, 3] }),
      submitEndcapJob: () => {
        throw Error("MUST NEVER BE CALLED");
      },
      proveTraceStep: () => {
        throw Error("MUST NEVER BE CALLED");
      },
      proveTraceJobsConcurrent: () => {
        throw Error("MUST NEVER BE CALLED");
      },
    };
  const r = await prepareOnlyMarketJobs({
    provider,
    account: H("public"),
    fingerprint: H("key"),
    envelope: { tx_hash: H("end") },
    parse: JSON.parse,
    expectedStepCount: 2,
  });
  assert.deepEqual(r.proof, [1, 2, 3]);
  provider.getTraceProofJobStepIndices = async () => ({
    cfc_step_indices: [0, 1],
    external_step_indices: [2],
  });
  await assert.rejects(
    prepareOnlyMarketJobs({
      provider,
      account: H("public"),
      fingerprint: H("key"),
      envelope: { tx_hash: H("end") },
      parse: JSON.parse,
      expectedStepCount: 2,
    }),
  );
});
test("same-background service replacement shares the durable account preparation mutex", async () => {
  const f = fixture(),
    results = await Promise.allSettled([
      f.make().prepare(f.context, f.record),
      f
        .make()
        .prepare({ ...f.context, origin: "https://other.example" }, f.record),
    ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(f.prepares, 1);
  assert.equal(f.sends, 0);
});
test("recovered preparation without a saved proof may be cancelled but not broadcast", async () => {
  const f = fixture(),
    p = await f.make().prepare(f.context, f.record);
  const [key, state] = [...f.memory.entries()][0];
  state.entries[0].phase = "preparing";
  delete state.entries[0].prepared;
  delete state.entries[0].preparedHash;
  f.memory.set(key, state);
  await assert.rejects(
    f.make().broadcast(f.context, p.intentId, p.preparedHash),
  );
  assert.equal(
    (await f.make().cancelPreparation(f.context, p.intentId)).phase,
    "cancelled",
  );
  assert.equal(f.sends, 0);
});
test("altered receipt or same-nonce conflicting endpoint cannot release the unknown-send reservation", async () => {
  const f = fixture(),
    s = f.make(),
    p = await s.prepare(f.context, f.record);
  await s.broadcast(f.context, p.intentId, p.preparedHash);
  f.known = true;
  const original = f.backend.reconcile;
  f.backend.reconcile = async (p) => ({
    ...(await original(p)),
    endUserLeafHash: H("wrong"),
  });
  await assert.rejects(s.reconcile(f.context, p.intentId));
  await assert.rejects(s.assertNoPending(f.context));
  f.backend.reconcile = async (p) => ({
    ...(await original(p)),
    commonLeafHash: H("wrong"),
  });
  await assert.rejects(s.reconcile(f.context, p.intentId));
  assert.equal(f.sends, 1);
});
test("persistence failure after the only send leaves original broadcast intent and cannot authorize a resend", async () => {
  const f = fixture(),
    s = f.make(),
    p = await s.prepare(f.context, f.record);
  let sends = 0;
  f.backend.broadcastExact = async () => {
    sends++;
    f.saveFail = true;
    throw Error("lost ACK then storage failure");
  };
  await assert.rejects(s.broadcast(f.context, p.intentId, p.preparedHash));
  f.saveFail = false;
  const replacement = f.make();
  assert.equal(
    (await replacement.list(f.context))[0].phase,
    "broadcast-intent",
  );
  await replacement.broadcast(f.context, p.intentId, p.preparedHash);
  assert.equal(sends, 1);
  f.known = true;
  assert.equal(
    (await replacement.reconcile(f.context, p.intentId)).phase,
    "included",
  );
  assert.equal(sends, 1);
});

test("broadcast requires wallet-owned approval of exact calls and fee",async()=>{
 const f=fixture(), service=createStagedWallet({store:{get:async k=>structuredClone(f.memory.get(k)),set:async(k,v)=>f.memory.set(k,structuredClone(v))},backend:f.backend,exclusive:f.exclusive,verifyRecord:async()=>{}});
 const p=await service.prepare(f.context,f.record);
 await assert.rejects(service.broadcast(f.context,p.intentId,p.preparedHash),/approval is not connected/);
 assert.equal(f.sends,0);
 for(const confirmation of [{approved:false},{approved:true,approvalSha256:H("substituted terms")}]){
  const denied=createStagedWallet({store:{get:async k=>structuredClone(f.memory.get(k)),set:async(k,v)=>f.memory.set(k,structuredClone(v))},backend:f.backend,exclusive:f.exclusive,verifyRecord:async()=>{},confirmBroadcast:async()=>confirmation});
  await assert.rejects(denied.broadcast(f.context,p.intentId,p.preparedHash),/confirmation denied/);assert.equal(f.sends,0);
 }
});

test("one exact approval is durable before send and cannot replay in the same store",async()=>{
 const f=fixture();let approvals=0,sends=0;
 const service=f.make({confirmBroadcast:async terms=>{approvals++;assert.equal(terms.actualFee,"1000001000");assert.equal(terms.fullCalls.length,2);assert.equal(terms.context.origin,f.context.origin);return{approved:true,approvalSha256:H(canonical(terms))};}});
 const p=await service.prepare(f.context,f.record);
 f.backend.broadcastExact=async()=>{sends++;const e=[...f.memory.values()][0].entries[0];assert.equal(e.phase,"broadcast-intent");assert.equal(e.approval.preparedHash,p.preparedHash);assert.match(e.approval.approvalSha256,/^[0-9a-f]{64}$/);throw Error("reply lost");};
 await Promise.all([service.broadcast(f.context,p.intentId,p.preparedHash),service.broadcast(f.context,p.intentId,p.preparedHash)]);
 await f.make().broadcast(f.context,p.intentId,p.preparedHash);assert.equal(approvals,1);assert.equal(sends,1);
});

test("separate store wrappers share the authority before reading durable intent",async()=>{
 const f=fixture();let approvals=0,sends=0;
 const make=()=>createStagedWallet({store:{get:async k=>structuredClone(f.memory.get(k)),set:async(k,v)=>{await new Promise(r=>setTimeout(r,1));f.memory.set(k,structuredClone(v));}},exclusive:f.exclusive,backend:f.backend,verifyRecord:async()=>{},confirmBroadcast:async terms=>{approvals++;return{approved:true,approvalSha256:H(canonical(terms))};}});
 const a=make(),b=make(),p=await a.prepare(f.context,f.record);
 f.backend.broadcastExact=async()=>{sends++;throw Error("reply lost");};
 await Promise.all([a.broadcast(f.context,p.intentId,p.preparedHash),b.broadcast(f.context,p.intentId,p.preparedHash)]);
 await make().broadcast(f.context,p.intentId,p.preparedHash);assert.equal(approvals,1);assert.equal(sends,1);
 const g=fixture(),q=await g.make().prepare(g.context,g.record);
 await assert.rejects(g.make({exclusive:undefined}).broadcast(g.context,q.intentId,q.preparedHash),/Authoritative wallet lock/);assert.equal(g.sends,0);
});
