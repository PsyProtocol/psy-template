// Public wallet history only. This client cannot prepare, sign or broadcast.
// The extension owns account/origin/chain scoping, receipt checks and locks.
const HASH = /^[0-9a-f]{64}$/;
const phases = new Set([
  "preparing",
  "unverified",
  "prepared",
  "preparation-failed",
  "cancelled",
  "broadcast-intent",
  "unresolved",
  "included",
]);
const optionalHashes = [
  "preparedHash",
  "requestSha256",
  "endUserLeafHash",
  "contentHash",
];
export function publicWalletHistory(rows) {
  if (!Array.isArray(rows) || rows.length > 16)
    throw Error(
      "Bounded wallet recovery history required; originals are preserved",
    );
  const seen = new Set();
  return rows.map((row) => {
    if (
      !row ||
      row.schema !== 1 ||
      !HASH.test(row.intentId ?? "") ||
      !HASH.test(row.recordId ?? "") ||
      !phases.has(row.phase) ||
      seen.has(row.intentId)
    )
      throw Error(
        "Invalid or duplicate wallet history; originals are preserved",
      );
    seen.add(row.intentId);
    const result = {
      schema: 1,
      intentId: row.intentId,
      recordId: row.recordId,
      phase: row.phase,
    };
    for (const key of optionalHashes) {
      if (row[key] != null && !HASH.test(row[key]))
        throw Error("Invalid original wallet identity");
      result[key] = row[key] ?? null;
    }
    if (
      row.actualFee != null &&
      (typeof row.actualFee !== "string" ||
        !/^(0|[1-9]\d{0,37})$/.test(row.actualFee))
    )
      throw Error("Invalid wallet fee amount");
    if (
      row.confirmedCheckpoint != null &&
      (!Number.isSafeInteger(row.confirmedCheckpoint) ||
        row.confirmedCheckpoint < 1 ||
        row.phase !== "included")
    )
      throw Error("Invalid wallet confirmation checkpoint");
    return {
      ...result,
      actualFee: row.actualFee ?? null,
      confirmedCheckpoint: row.confirmedCheckpoint ?? null,
    };
  });
}
export function walletRecoveryAction(phase) {
  if (["broadcast-intent", "unresolved"].includes(phase)) return "reconcile";
  if (
    ["preparing", "prepared", "unverified", "preparation-failed"].includes(
      phase,
    )
  )
    return "cancel";
  return null;
}
export function walletNextStep(phase) {
  if (["broadcast-intent", "unresolved"].includes(phase))
    return "The account remains reserved. Check the original receipt; do not pay again.";
  if (phase === "included")
    return "Request confirmed. Read the market account to check settlement and claimable outputs; receipt inclusion alone does not prove final delivery.";
  if (phase === "cancelled")
    return "Only an unbroadcast preparation was cancelled. This is not a market cancellation or a refund.";
  return "Return to the original reviewed plan to continue, or cancel this unbroadcast preparation. No funds are refunded by cancelling a preparation.";
}
export function createWalletHistoryClient(provider, account) {
  if (typeof provider?.request !== "function" || !HASH.test(account ?? ""))
    throw Error("Connected ordinary browser wallet required");
  const rpc = (method, params) => provider.request({ method, params });
  const list = async () =>
    publicWalletHistory(await rpc("psy_listMarketPreparations", [account]));
  let pending = false;
  return {
    list,
    async recover(entry) {
      if (pending)
        throw Error("Original wallet recovery is already in progress");
      pending = true;
      try {
        const [original] = publicWalletHistory([entry]);
        const rows = await list();
        const fresh = rows.find((row) => row.intentId === original.intentId);
        if (
          !fresh ||
          fresh.recordId !== original.recordId ||
          optionalHashes.some((key) => fresh[key] !== original[key])
        )
          throw Error(
            "Original wallet identity changed; refresh history without replacing the request",
          );
        if (fresh.phase === "included" || fresh.phase === "cancelled")
          return rows;
        const action = walletRecoveryAction(original.phase);
        if (!action || action !== walletRecoveryAction(fresh.phase))
          throw Error(
            "Wallet phase changed; refresh before choosing a recovery action",
          );
        await rpc(
          action === "reconcile"
            ? "psy_reconcileMarketPreparation"
            : "psy_cancelMarketPreparation",
          [account, fresh.intentId],
        );
        return await list();
      } finally {
        pending = false;
      }
    },
  };
}
