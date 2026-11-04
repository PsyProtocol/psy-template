// Public commitment records for the existing wallet journal. No hydrated
// calls, trace, receive randoms, signing witness or page callbacks are admitted.
const ok = (v, m) => { if (!v) throw Error(m); };
const HASH = /^[0-9a-f]{64}$/;
const integer = v => typeof v === "string" && /^(0|[1-9]\d{0,20})$/.test(v);
const keys = (v, names) => ok(v && Object.getPrototypeOf(v) === Object.prototype &&
  Object.keys(v).sort().join(",") === names.sort().join(","), "Public commitment fields required");
export function validateCallCommitments(calls) {
  ok(Array.isArray(calls) && calls.length >= 1 && calls.length <= 17, "Bounded call commitments required");
  for (const c of calls) {
    keys(c, ["callerContractId", "contractId", "methodId", "methodName", "inputCount", "inputsHash"]);
    ok([c.callerContractId,c.contractId,c.methodId].every(integer) &&
      typeof c.methodName === "string" && /^[A-Za-z_][A-Za-z_0-9]{0,63}$/.test(c.methodName) &&
      Number.isSafeInteger(c.inputCount) && c.inputCount >= 0 && c.inputCount <= 1024 &&
      HASH.test(c.inputsHash), "Invalid public call commitment");
  }
}
export function validateCommitmentRecord(r) {
  keys(r, ["schema","recordId","registryHash","request","snapshot","plan"]);
  ok(r.schema === 3 && HASH.test(r.recordId) && HASH.test(r.registryHash), "Commitment record identity");
  keys(r.request, ["userId"]); keys(r.snapshot,["user"]); keys(r.snapshot.user,["publicKeyHash"]);
  const p = r.plan;
  keys(p, ["financialAuthorization","userId","recipientId","network","nativeProtocol",
    "sdkManifestSha256","verifierPackSha256","startUserLeafHash","walletNonce",
    "startCheckpoint","validUntilCheckpoint","maxNetworkFee","callCommitments"]);
  keys(p.network,["name","magic","chainRootAt1"]);
  ok(p.network.name === "testnet" && integer(p.network.magic) && HASH.test(p.network.chainRootAt1), "Explicit chain instance required");
  ok([r.request.userId,p.userId,p.recipientId,p.startCheckpoint,p.validUntilCheckpoint].every(v => Number.isSafeInteger(v) && v >= 0) &&
    p.startCheckpoint <= p.validUntilCheckpoint && p.userId === p.recipientId && p.userId === r.request.userId &&
    p.financialAuthorization === false && typeof p.nativeProtocol === "string" &&
    [r.snapshot.user.publicKeyHash,p.sdkManifestSha256,p.verifierPackSha256,p.startUserLeafHash].every(v=>HASH.test(v)) &&
    integer(p.walletNonce) && integer(p.maxNetworkFee) && BigInt(p.maxNetworkFee)>0n, "Public commitment identity/budget required");
  validateCallCommitments(p.callCommitments);
  // The final fee call is added separately and checked against full verification.
  ok(p.callCommitments.length <= 16, "Commitment call capacity");
}

export function validateCommitmentContext(c) {
  keys(c,["origin","account","networkHash","fingerprint","chainKey","userId"]);
}
