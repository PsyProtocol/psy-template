// Explicit proof-only SDK job runner. Never calls trace-step, convenience
// proveTraceJobsConcurrent or any submit method: those may broadcast.
const ok = (v, m) => {
  if (!v) throw Error(m);
};
export async function prepareOnlyMarketJobs({
  provider,
  account,
  envelope,
  parse,
  expectedStepCount,
}) {
  ok(typeof parse === "function", "Lossless SDK parser required");
  ok(
    Number.isSafeInteger(expectedStepCount) &&
      expectedStepCount >= 2 &&
      expectedStepCount <= 17,
    "Bounded full call count required",
  );
  const [schedule, indices] = await Promise.all([
    provider.prepareTraceProofSchedule(envelope),
    provider.getTraceProofJobStepIndices(envelope),
  ]);
  ok(
    Array.isArray(indices.cfc_step_indices) &&
      indices.cfc_step_indices.length === expectedStepCount &&
      new Set(indices.cfc_step_indices).size === expectedStepCount,
    "Complete CFC schedule required",
  );
  ok(
    indices.cfc_step_indices.every(
      (x) => Number.isSafeInteger(x) && x >= 0 && x < 64,
    ) &&
      Array.isArray(indices.external_step_indices) &&
      indices.external_step_indices.length === 0,
    "Unexpected external proof or step",
  );
  const outputs = [];
  const check = (raw, type, index) => {
    const parsed = parse(raw);
    ok(
      parsed?.type === type && parsed.data && typeof parsed.data === "object",
      "Unexpected proof job type",
    );
    if (index !== undefined)
      ok(
        Number(parsed.data.step_index) === index,
        "CFC proof job identity changed",
      );
    return raw;
  };
  outputs.push(
    check(await provider.proveUpsStartJob(account, envelope), "ups_start"),
  );
  outputs.push(
    check(await provider.proveZkSignJob(account, envelope), "zk_sign"),
  );
  // Bounded serial resource use; later independent scheduling needs its own
  // memory/nonce acceptance. Every witness/session is for this exact envelope.
  for (const index of indices.cfc_step_indices)
    outputs.push(
      check(
        await provider.proveCfcJobWithScheduleStep(
          account,
          envelope,
          schedule,
          index,
        ),
        "cfc_step",
        index,
      ),
    );
  const endcapOutput = check(
    await provider.proveEndcapJobFromOutputJsons(
      account,
      envelope,
      schedule,
      outputs,
    ),
    "end_cap",
  );
  const endcap = parse(endcapOutput);
  ok(
    endcap.data.tx_hash === envelope.tx_hash,
    "Endcap belongs to another envelope",
  );
  ok(
    Array.isArray(endcap.data.proof) &&
      endcap.data.proof.length > 0 &&
      endcap.data.proof.length <= 2000000 &&
      endcap.data.proof.every(
        (x) =>
          (typeof x === "bigint" && x >= 0n && x <= 255n) ||
          (Number.isInteger(x) && x >= 0 && x <= 255),
      ),
    "Invalid public endcap proof bytes",
  );
  return {
    endcapOutput,
    proof: endcap.data.proof.map(Number),
    txHash: endcap.data.tx_hash,
  };
}
