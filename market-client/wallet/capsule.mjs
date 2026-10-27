// Public ordinary-market capsule projection. Hydrated traces/witnesses stay in
// wallet memory; only the public endcap request and approved manifest survive.
import { prepareOnlyMarketJobs } from "./prepareOnly.mjs";
const ok = (v, m) => {
  if (!v) throw Error(m);
};
const atom = (v) => {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") ok(Number.isSafeInteger(v), "Rounded SDK integer");
  else
    ok(
      typeof v === "string" && /^(0|[1-9]\d*)$/.test(v),
      "Canonical SDK integer",
    );
  return String(v);
};
const stable = (v) => {
  if (v === null || typeof v === "string" || typeof v === "boolean")
    return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "bigint")
    return JSON.stringify(atom(v));
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  return (
    "{" +
    Object.keys(v)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stable(v[k]))
      .join(",") +
    "}"
  );
};
const sha = async (s) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export function validateMarketTrace({
  record,
  context,
  envelope,
  parse,
  dependencies,
}) {
  ok(typeof parse === "function", "Lossless SDK codec required");
  ok(
    Array.isArray(dependencies) && dependencies.length > 0,
    "Pinned contract dependencies required",
  );
  const trace = parse(envelope.trace.payload),
    core = trace.finalization?.submit_end_cap_input?.core;
  ok(
    core && trace.meta && Array.isArray(trace.steps),
    "Complete SDK trace required",
  );
  ok(
    atom(trace.meta.user_id) === String(record.request.userId) &&
      trace.meta.public_key === context.account,
    "Trace caller identity changed",
  );
  ok(
    BigInt(atom(trace.meta.network_magic)) ===
      BigInt(record.plan.network.magic),
    "Trace network changed",
  );
  ok(
    core.state_transition.start_user_leaf_hash ===
      record.plan.startUserLeafHash &&
      atom(core.new_user_leaf.nonce) === record.plan.walletNonce &&
      core.new_user_leaf.public_key === context.account,
    "Trace state/nonce/key differs from approval",
  );
  ok(
    Number(atom(core.checkpoint_id)) >= record.plan.startCheckpoint &&
      Number(atom(core.checkpoint_id)) <= record.plan.validUntilCheckpoint,
    "Trace outside approved checkpoint range",
  );
  ok(
    trace.finalization.sig_hash === envelope.sig_hash &&
      trace.finalization.tx_hash === envelope.tx_hash &&
      core.state_transition.end_user_leaf_hash === envelope.tx_hash,
    "SDK signature/endcap identity mismatch",
  );
  ok(
    Array.isArray(trace.finalization.software_defined_call.inputs) &&
      trace.finalization.software_defined_call.inputs.length === 0,
    "Ordinary signature only",
  );
  const actualFee = String(
    BigInt(atom(core.stats.guta_fees_collected)) +
      BigInt(atom(core.stats.da_fees_collected)),
  );
  ok(
    BigInt(actualFee) > 0n &&
      BigInt(actualFee) <= BigInt(record.plan.maxNetworkFee),
    "Trace fee exceeds approval",
  );
  const expected = [
    ...record.plan.calls,
    { contract_id: "0", method_name: "simple_burn", inputs: [actualFee] },
  ];
  const cfc = trace.steps.filter((s) =>
    ["standard", "burn_fee"].includes(s.kind),
  );
  ok(
    cfc.length === expected.length &&
      trace.steps.every((s) =>
        ["standard", "burn_fee", "zk_sign"].includes(s.kind),
      ),
    "Unexpected inline/deferred/external call scope",
  );
  ok(
    atom(core.stats.total_transactions) === String(cfc.length) &&
      atom(core.stats.user_ops_processed) === "1",
    "Full ordinary UPS call/operation count changed",
  );
  const sign = trace.steps.filter((s) => s.kind === "zk_sign");
  ok(
    sign.length === 1 &&
      sign[0].fingerprint === context.fingerprint &&
      sign[0].sign_circuit_source?.kind === "zk_builtin",
    "Pinned ordinary signing circuit required",
  );
  cfc.forEach((step, i) => {
    const dep = dependencies.find(
      (d) => String(d.contract.contractId) === atom(step.contract_id),
    );
    const inclusion = step.cfc_inclusion_proof?.contract_inclusion_proof;
    const leaf = inclusion?.contract_leaf;
    ok(
      dep &&
        leaf &&
        atom(inclusion.contract_tree_merkle_proof.index) ===
          atom(step.contract_id),
      "Unreviewed contract identity",
    );
    ok(
      leaf.code_root === dep.contract.codeRoot &&
        leaf.state_layout_root === dep.contract.layoutRoot &&
        atom(leaf.state_tree_height) === String(dep.contract.stateTreeHeight) &&
        atom(leaf.state_layout_field_count) === String(dep.layoutFieldCount) &&
        atom(leaf.state_layout_slot_count) === String(dep.layoutSlotCount) &&
        leaf.function_tree_root === dep.functionTreeRoot &&
        step.cfc_inclusion_proof.contract_function_merkle_proof.root ===
          leaf.function_tree_root,
      "Trace code/layout/function identity changed",
    );
    ok(
      !(
        step.parent != null ||
        step.inlined?.length ||
        step.deferred?.length ||
        step.debt_removal_proof
      ),
      "Nested call scope forbidden",
    );
    const wanted = expected[i],
      call =
        step.cfc_witness?.tx_input_ctx?.transaction_call_start_ctx?.call_data;
    ok(
      call && atom(call.caller_contract_id) === "4294967296",
      "Caller contract changed",
    );
    ok(
      atom(step.contract_id) === wanted.contract_id &&
        step.method_name === wanted.method_name,
      "Full trace call order changed",
    );
    if (wanted.method_id !== undefined)
      ok(
        atom(step.method_id) === wanted.method_id,
        "Reviewed method ID changed",
      );
    ok(
      atom(call.contract_id) === wanted.contract_id &&
        atom(call.method_id) === atom(step.method_id),
      "Trace call identity inconsistent",
    );
    ok(
      JSON.stringify(step.cfc_witness.inputs.map(atom)) ===
        JSON.stringify(wanted.inputs),
      "Trace call parameters changed",
    );
    ok(
      i === cfc.length - 1
        ? step.kind === "burn_fee"
        : step.kind === "standard",
      "Automatic fee burn must be last",
    );
  });
  return { trace, expected, actualFee, cfc };
}
export async function prepareMarketCapsule({
  record,
  context,
  provider,
  envelope,
  parse,
  stringify,
  dependencies,
}) {
  ok(typeof stringify === "function", "Lossless SDK serializer required");
  const { trace, expected, actualFee, cfc } = validateMarketTrace({
    record,
    context,
    envelope,
    parse,
    dependencies,
  });
  const proved = await prepareOnlyMarketJobs({
    provider,
    account: context.account,
    envelope,
    parse,
    expectedStepCount: cfc.length,
  });
  const requestJson = stringify({
    user_ec_input: trace.finalization.submit_end_cap_input,
    proof: proved.proof,
  });
  const publicManifest = {
    userId: record.request.userId,
    publicKeyHash: context.account,
    networkHash: context.networkHash,
    registryHash: record.registryHash,
    sdkManifestSha256: record.plan.sdkManifestSha256,
    startUserLeafHash: record.plan.startUserLeafHash,
    walletNonce: record.plan.walletNonce,
    validUntilCheckpoint: record.plan.validUntilCheckpoint,
    actualFee,
    fullCalls: expected,
    endUserLeafHash: proved.txHash,
    sigHash: envelope.sig_hash,
    sessionHash: await sha(stable(trace.anchor)),
    fingerprint: context.fingerprint,
  };
  return {
    schema: 1,
    requestJson,
    requestSha256: await sha(requestJson),
    manifestSha256: await sha(stable(publicManifest)),
    ...publicManifest,
  };
}
