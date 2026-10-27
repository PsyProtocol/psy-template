// SDK-shaped synthetic trace mutation tests. Full native proof evidence lives in
// the ignored Rust fixture suite; these mocks never claim native verification.
import test from "node:test";
import assert from "node:assert/strict";
import { validateMarketTrace, prepareMarketCapsule } from "./capsule.mjs";
import { createHash } from "node:crypto";
const H = (s) => createHash("sha256").update(s).digest("hex");
function fixture() {
  const record = {
    registryHash: H("reg"),
    request: { userId: 201 },
    plan: {
      network: { magic: "1" },
      sdkManifestSha256: H("sdk"),
      startUserLeafHash: H("start"),
      walletNonce: "1",
      startCheckpoint: 100,
      validUntilCheckpoint: 164,
      maxNetworkFee: "1000009000",
      calls: [
        {
          contract_id: "42",
          method_id: "3",
          method_name: "transfer",
          inputs: ["100", "17", "1"],
        },
      ],
    },
  };
  const context = {
    account: H("public"),
    networkHash: H("network"),
    fingerprint: H("key"),
  };
  const dependencies = [42, 0].map((id) => ({
    contract: {
      contractId: id,
      codeRoot: H("code" + id),
      layoutRoot: H("layout" + id),
      stateTreeHeight: 31,
    },
    functionTreeRoot: H("function" + id),
    layoutFieldCount: 1,
    layoutSlotCount: 2,
  }));
  const core = {
    state_transition: {
      start_user_leaf_hash: H("start"),
      end_user_leaf_hash: H("end"),
    },
    new_user_leaf: { nonce: "1", public_key: context.account },
    checkpoint_id: "100",
    stats: {
      guta_fees_collected: "1000000000",
      da_fees_collected: "8000",
      total_transactions: "2",
      user_ops_processed: "1",
    },
  };
  const expected = [
    ...record.plan.calls,
    {
      contract_id: "0",
      method_id: "4",
      method_name: "simple_burn",
      inputs: ["1000008000"],
    },
  ];
  const steps = expected.map((c, i) => {
    const d = dependencies.find(
      (d) => String(d.contract.contractId) === c.contract_id,
    );
    return {
      kind: i ? "burn_fee" : "standard",
      contract_id: c.contract_id,
      method_id: c.method_id,
      method_name: c.method_name,
      cfc_witness: {
        inputs: structuredClone(c.inputs),
        tx_input_ctx: {
          transaction_call_start_ctx: {
            call_data: {
              caller_contract_id: "4294967296",
              contract_id: c.contract_id,
              method_id: c.method_id,
            },
          },
        },
      },
      cfc_inclusion_proof: {
        contract_inclusion_proof: {
          contract_tree_merkle_proof: { index: c.contract_id },
          contract_leaf: {
            code_root: d.contract.codeRoot,
            state_layout_root: d.contract.layoutRoot,
            state_tree_height: "31",
            state_layout_field_count: "1",
            state_layout_slot_count: "2",
            function_tree_root: d.functionTreeRoot,
          },
        },
        contract_function_merkle_proof: { root: d.functionTreeRoot },
      },
    };
  });
  steps.push({
    kind: "zk_sign",
    fingerprint: context.fingerprint,
    sign_circuit_source: { kind: "zk_builtin" },
    sign_witness: "PRIVATE-WITNESS-MUST-NOT-SURVIVE",
  });
  const trace = {
    meta: { user_id: "201", public_key: context.account, network_magic: "1" },
    anchor: { checkpoint_id: "100" },
    steps,
    finalization: {
      submit_end_cap_input: { core, contract_state_updates: [], events: [] },
      sig_hash: H("sig"),
      tx_hash: H("end"),
      software_defined_call: { inputs: [] },
    },
  };
  const envelope = {
    sig_hash: H("sig"),
    tx_hash: H("end"),
    trace: { payload: JSON.stringify(trace) },
  };
  let proofs = 0;
  const job = (type, data) => {
    proofs++;
    return JSON.stringify({ type, data });
  };
  const provider = {
    prepareTraceProofSchedule: async () => ({}),
    getTraceProofJobStepIndices: async () => ({
      cfc_step_indices: [0, 1],
      external_step_indices: [],
    }),
    proveUpsStartJob: async () => job("ups_start", {}),
    proveZkSignJob: async () => job("zk_sign", {}),
    proveCfcJobWithScheduleStep: async (_a, _e, _s, i) =>
      job("cfc_step", { step_index: i }),
    proveEndcapJobFromOutputJsons: async () =>
      job("end_cap", { tx_hash: H("end"), proof: [1, 2, 3] }),
    proveTraceStep: () => assert.fail("auto-submit API invoked"),
    submitEndcapJob: () => assert.fail("submit invoked"),
  };
  return {
    record,
    context,
    dependencies,
    trace,
    envelope,
    provider,
    parse: JSON.parse,
    stringify: JSON.stringify,
    get proofs() {
      return proofs;
    },
  };
}
test("SDK-shaped exact trace projects only public proof/request and manifest, no hydrated signing witness", async () => {
  const f = fixture(),
    p = await prepareMarketCapsule(f);
  assert.equal(f.proofs, 5);
  assert.equal(p.actualFee, "1000008000");
  assert.equal(p.fullCalls.length, 2);
  const request = JSON.parse(p.requestJson);
  assert.deepEqual(Object.keys(request).sort(), ["proof", "user_ec_input"]);
  assert.ok(!JSON.stringify(p).includes("PRIVATE-WITNESS"));
  assert.ok(!JSON.stringify(p).includes("cfc_witness"));
  assert.equal(p.requestSha256, H(p.requestJson));
});
test("network, code/layout/key/fee/state/caller/stack/parameter/sig mutations stop before any proof job", async () => {
  const mutations = [
    (f) => (f.trace.meta.network_magic = "2"),
    (f) => (f.trace.meta.public_key = H("other")),
    (f) =>
      (f.trace.finalization.submit_end_cap_input.core.new_user_leaf.nonce =
        "2"),
    (f) => (f.trace.finalization.sig_hash = H("wrong")),
    (f) =>
      (f.trace.finalization.submit_end_cap_input.core.checkpoint_id = "165"),
    (f) =>
      (f.trace.finalization.submit_end_cap_input.core.stats.da_fees_collected =
        "999999"),
    (f) => (f.trace.steps[0].cfc_witness.inputs[1] = "18"),
    (f) =>
      (f.trace.steps[0].cfc_witness.tx_input_ctx.transaction_call_start_ctx.call_data.caller_contract_id =
        "0"),
    (f) =>
      (f.trace.steps[0].cfc_inclusion_proof.contract_inclusion_proof.contract_leaf.code_root =
        H("wrong-code")),
    (f) =>
      (f.trace.steps[0].cfc_inclusion_proof.contract_inclusion_proof.contract_leaf.state_layout_root =
        H("wrong-layout")),
    (f) => (f.trace.steps[2].fingerprint = H("wrong-key")),
    (f) => (f.trace.steps[0].deferred = [2]),
    (f) => f.trace.steps.push({ ...f.trace.steps[0] }),
    (f) => (f.trace.steps[0].kind = "deferred"),
    (f) => (f.dependencies = []),
  ];
  for (const [i, mutate] of mutations.entries()) {
    const f = fixture();
    mutate(f);
    f.envelope.trace.payload = JSON.stringify(f.trace);
    await assert.rejects(prepareMarketCapsule(f), "mutation " + i);
    assert.equal(f.proofs, 0);
  }
});
test("rounded SDK numeric values are rejected before proving", () => {
  const f = fixture();
  f.trace.steps[0].cfc_witness.inputs[0] = Number.MAX_SAFE_INTEGER + 1;
  f.envelope.trace.payload = JSON.stringify(f.trace);
  assert.throws(() => validateMarketTrace(f), /Rounded/);
  assert.equal(f.proofs, 0);
});
