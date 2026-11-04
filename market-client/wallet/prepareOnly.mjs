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
  collectPublicProofs = false,
  externalPrefixLength = 0,
}) {
  ok(typeof collectPublicProofs === "boolean", "Public proof projection mode");
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
  ok(Number.isSafeInteger(externalPrefixLength) && externalPrefixLength >= 0 &&
    externalPrefixLength <= 3 && (externalPrefixLength === 0 || expectedStepCount === 2),
    "Only the reviewed compact external prefix is supported");
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
      indices.external_step_indices.length === externalPrefixLength &&
      indices.external_step_indices.every((v,i) => v === i) &&
      (externalPrefixLength === 0 || indices.cfc_step_indices.every((v,i)=>v===externalPrefixLength+i)),
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
  for (const index of indices.external_step_indices)
    outputs.push(check(await provider.proveExternalProofJob(envelope,index), "external_proof", index));
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
    ...(collectPublicProofs ? { publicProofOutputs: outputs } : {}),
    endcapOutput,
    proof: endcap.data.proof.map(Number),
    txHash: endcap.data.tx_hash,
  };
}
