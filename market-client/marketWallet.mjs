// Page-side requests only. The extension owns verification, locks, approval,
// persistence and transport. Never accept an adapter or treat an ACK as a fill.
export function createMarketWalletClient(provider, account, record) {
  record = structuredClone(record);
  if (
    typeof provider?.request !== "function" ||
    !/^[0-9a-f]{64}$/.test(account ?? "") ||
    !/^[0-9a-f]{64}$/.test(record?.recordId ?? "")
  )
    throw Error("Connected ordinary wallet and reviewed record required");
  const rpc = (method, params) => provider.request({ method, params });
  const original = (entry) => {
    if (
      !entry ||
      entry.recordId !== record.recordId ||
      !/^[0-9a-f]{64}$/.test(entry.intentId ?? "")
    )
      throw Error("Original wallet intent does not match this record");
    return entry;
  };
  return {
    async capabilities() {
      const c = await rpc("psy_getMarketWriteCapabilities", []);
      return {
        ...c,
        usable:
          c?.prepareOnly === false &&
          c?.broadcast === true &&
          c?.nativeFullCallVerifier === true &&
          Array.isArray(c.registryHashes) &&
          c.registryHashes.includes(record.registryHash) &&
          Array.isArray(c.enabledMarketIds) &&
          c.enabledMarketIds.includes(record.plan.marketId) &&
          c.chainRootAt1 === record.plan.network.chainRootAt1 &&
          !(record.plan.kind.startsWith("nft-") && c.nftWrite !== true),
      };
    },
    prepare: () => rpc("psy_prepareMarketTransaction", [account, record]),
    async list() {
      const rows = await rpc("psy_listMarketPreparations", [account]);
      if (!Array.isArray(rows))
        throw Error("Wallet recovery history unavailable");
      return rows.filter((e) => e.recordId === record.recordId);
    },
    verify: (entry) =>
      rpc("psy_verifyMarketPreparation", [account, original(entry).intentId]),
    approveAndBroadcast: (entry) => {
      const e = original(entry);
      if (
        e.phase !== "prepared" ||
        !/^[0-9a-f]{64}$/.test(e.preparedHash ?? "")
      )
        throw Error("Exact verified preparation required");
      return rpc("psy_broadcastMarketPreparation", [
        account,
        e.intentId,
        e.preparedHash,
      ]);
    },
    reconcile: (entry) =>
      rpc("psy_reconcileMarketPreparation", [
        account,
        original(entry).intentId,
      ]),
    cancel: (entry) =>
      rpc("psy_cancelMarketPreparation", [account, original(entry).intentId]),
  };
}
export const marketWalletPhase = (phase) =>
  ({
    preparing: "Proving",
    unverified: "Awaiting complete verification",
    prepared: "Ready for wallet approval",
    "broadcast-intent": "Broadcast intent saved — result unknown",
    unresolved: "Result unknown — reconcile original request",
    included: "Request confirmed — refresh settlement and claim state",
    cancelled: "Unbroadcast preparation cancelled",
    "preparation-failed": "Preparation failed — original record retained",
  })[phase] ?? "No wallet transaction";
