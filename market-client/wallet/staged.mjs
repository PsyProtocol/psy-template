import { nativeMethod } from "../nativeProtocol.mjs";
// Background-only wallet service. Storage and native/prover adapters are owned
// by the extension, never supplied through a page request. No automatic retry.
const storeLocks = new WeakMap();
const HASH = /^[0-9a-f]{64}$/;
const ok = (v, m) => {
  if (!v) throw Error(m);
};
const clone = structuredClone;
const canon = (v) => {
  if (v === null || typeof v === "string" || typeof v === "boolean")
    return JSON.stringify(v);
  if (typeof v === "number" && Number.isSafeInteger(v)) return String(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  ok(
    v && Object.getPrototypeOf(v) === Object.prototype,
    "Canonical public data required",
  );
  return (
    "{" +
    Object.keys(v)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canon(v[k]))
      .join(",") +
    "}"
  );
};
const hash = async (text) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
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
const terminal = (s) => ["cancelled", "included"].includes(s);
function identity(context, record) {
  const origin = new URL(context.origin);
  ok(
    origin.origin === context.origin &&
      ["https:", "http:"].includes(origin.protocol),
    "Exact web origin required",
  );
  ok(
    origin.protocol === "https:" ||
      origin.hostname === "127.0.0.1" ||
      origin.hostname === "localhost",
    "Unsafe origin",
  );
  ok(
    HASH.test(context.account) &&
      HASH.test(context.networkHash) &&
      HASH.test(context.fingerprint) &&
      HASH.test(context.chainKey),
    "Wallet identity required",
  );
  ok(
    record.request.userId === context.userId &&
      record.snapshot.user.publicKeyHash === context.account,
    "Selected wallet identity changed",
  );
  ok(
    record.plan.userId === context.userId &&
      record.plan.recipientId === context.userId &&
      record.plan.financialAuthorization === false,
    "Ordinary-owner plan required",
  );
  return context;
}
export function createStagedWallet({
  store,
  backend,
  verifyRecord,
  maxRecords = 8,
  exclusive,
  confirmBroadcast = async () => { throw Error("Wallet-owned exact approval is not connected"); },
}) {
  for (const name of ["get", "set"])
    ok(typeof store?.[name] === "function", "Durable wallet store required");
  for (const name of [
    "prepareOnly",
    "verifyPrepared",
    "recheck",
    "broadcastExact",
    "reconcile",
  ])
    ok(
      typeof backend?.[name] === "function",
      "Missing reviewed wallet backend " + name,
    );
  ok(
    typeof verifyRecord === "function" &&
      Number.isSafeInteger(maxRecords) &&
      maxRecords >= 1 &&
      maxRecords <= 16,
    "Reviewed record verifier and finite store required",
  );
  const tails = storeLocks.get(store) ?? new Map();
  storeLocks.set(store, tails);
  const keyFor = async (c) =>
    "psy_market_prepared_v1:" +
    (await hash(
      canon({
        account: c.account,
        networkHash: c.networkHash,
        chainKey: c.chainKey,
      }),
    ));
  const locked = async (c, fn) => {
    const key = await keyFor(c),
      previous = tails.get(key) ?? Promise.resolve();
    const work = async () => {
        const state = clone(
          (await store.get(key)) ?? { schema: 1, revision: 0, entries: [] },
        );
        ok(
          state.schema === 1 &&
            Number.isSafeInteger(state.revision) &&
            state.revision >= 0 &&
            Array.isArray(state.entries) &&
            state.entries.length <= maxRecords,
          "Prepared store corrupt; preserve and stop",
        );
        ok(
          state.entries.every(
            (x) => phases.has(x.phase) && HASH.test(x.intentId),
          ),
          "Prepared state corrupt",
        );
        const save = async () => {
          state.revision++;
          const raw = canon(state);
          ok(raw.length <= 16000000, "Prepared wallet storage limit");
          await store.set(key, clone(state));
          ok(
            canon(await store.get(key)) === raw,
            "Prepared persistence/readback failed",
          );
        };
        return fn(state, save);
      };
    const run = previous.catch(() => {}).then(() => exclusive ? exclusive(key,work) : work());
    tails.set(key, run);
    try {
      return clone(await run);
    } finally {
      if (tails.get(key) === run) tails.delete(key);
    }
  };
  const scoped = (s, c, id) => {
    const e = s.entries.find((e) => e.intentId === id);
    ok(
      e &&
        e.context.origin === c.origin &&
        e.context.account === c.account &&
        e.context.userId === c.userId &&
        e.context.networkHash === c.networkHash &&
        e.context.chainKey === c.chainKey &&
        e.context.fingerprint === c.fingerprint,
      "Prepared identity unavailable for this origin/account",
    );
    return e;
  };
  const summary = (e) => ({
    schema: 1,
    intentId: e.intentId,
    phase: e.phase,
    recordId: e.record.recordId,
    preparedHash: e.preparedHash ?? null,
    requestSha256: e.prepared?.requestSha256 ?? null,
    endUserLeafHash: e.prepared?.endUserLeafHash ?? null,
    actualFee: e.prepared?.actualFee ?? null,
    contentHash: e.prepared?.contentHash ?? null,
    confirmedCheckpoint: e.phase === "included" ? e.receipt?.checkpoint ?? null : null,
  });
  const validatePrepared = async (e, p) => {
    identity(e.context, e.record);
    await verifyRecord(clone(e.record));
    ok(
      (await hash(
        canon({ context: e.context, recordId: e.record.recordId }),
      )) === e.intentId,
      "Stored intent identity changed",
    );
    ok(
      (await hash(canon(e.record.plan.network))) === e.context.networkHash,
      "Stored network changed",
    );
    ok(
      p?.fingerprint === e.context.fingerprint,
      "Prepared signing key changed",
    );
    ok(
      p &&
        [1, 2].includes(p.schema) &&
        typeof p.requestJson === "string" &&
        p.requestJson.length > 0 &&
        p.requestJson.length <= 6000000,
      "Bounded exact public request required",
    );
    for (const k of [
      "requestSha256",
      "manifestSha256",
      "endUserLeafHash",
      "sigHash",
      "sessionHash",
      "fingerprint",
    ])
      ok(HASH.test(p[k] ?? ""), "Missing prepared " + k);
    ok(
      (await hash(p.requestJson)) === p.requestSha256,
      "Exact request bytes changed",
    );
    for (const [k, v] of Object.entries({
      userId: e.context.userId,
      publicKeyHash: e.context.account,
      networkHash: e.context.networkHash,
      registryHash: e.record.registryHash,
      sdkManifestSha256: e.record.plan.sdkManifestSha256,
      startUserLeafHash: e.record.plan.startUserLeafHash,
      walletNonce: e.record.plan.walletNonce,
      validUntilCheckpoint: e.record.plan.validUntilCheckpoint,
    }))
      ok(p[k] === v, "Prepared " + k + " changed");
    ok(
      typeof p.actualFee === "string" &&
        /^[1-9]\d{0,20}$/.test(p.actualFee) &&
        BigInt(p.actualFee) <= BigInt(e.record.plan.maxNetworkFee),
      "Prepared actual fee exceeds approval",
    );
    ok(
      canon(p.fullCalls) ===
        canon([
          ...e.record.plan.calls,
          {
            contract_id: "0",
            method_name: nativeMethod(e.record.plan, "burn"),
            inputs: [p.actualFee],
          },
        ]),
      "Prepared full stack changed",
    );
    if(p.schema===2){
      ok(HASH.test(p.contentHash??"")&&HASH.test(p.verifierPackSha256??"")&&HASH.test(p.verificationBundleSha256??"")&&typeof p.verificationBundleJson==="string"&&p.verificationBundleJson.length<=10000000,"Public verification capsule required");
      ok(await hash(p.verificationBundleJson)===p.verificationBundleSha256,"Public proof bundle changed");
    }
    const native = await backend.verifyPrepared(clone(e.record), clone(p));
    ok(
      native?.fullProofVerified === true &&
        native.fullCallsBound === true &&
        native.sessionBound === true &&
        native.sigHashBound === true &&
        native.endpointsAndFeesBound === true,
      "Independent native full UPS/call/session verification incomplete",
    );
    ok(
      native.requestSha256 === p.requestSha256 &&
        native.manifestSha256 === p.manifestSha256 &&
        native.sdkManifestSha256 === p.sdkManifestSha256,
      "Native verification belongs to another artifact/dependency",
    );
    if(p.schema===2)ok(native.contentHash===p.contentHash,"Native original content hash mismatch");
  };
  return {
    list: async (context) =>
      locked(clone(context), async (s) =>
        s.entries
          .filter(
            (e) =>
              e.context.origin === context.origin &&
              e.context.account === context.account &&
              e.context.userId === context.userId &&
              e.context.networkHash === context.networkHash &&
              e.context.chainKey === context.chainKey,
          )
          .map(summary),
      ),
    prepare: async (context, input) => {
      const c = clone(context),
        record = clone(input);
      identity(c, record);
      await verifyRecord(clone(record));
      ok(
        (await hash(canon(record.plan.network))) === c.networkHash,
        "Approved network changed",
      );
      return locked(c, async (s, save) => {
        const intentId = await hash(
          canon({ context: c, recordId: record.recordId }),
        );
        const prior = s.entries.find((x) => x.intentId === intentId);
        if (prior) {
          scoped(s, c, intentId);
          return summary(prior);
        }
        ok(
          !s.entries.some((e) => !terminal(e.phase)),
          "Wallet nonce reserved; reconcile or cancel original preparation",
        );
        ok(
          s.entries.length < maxRecords,
          "Prepared history capacity reached; preserve originals",
        );
        const e = { intentId, context: c, record, phase: "preparing" };
        s.entries.push(e);
        await save();
        try {
          const p = clone(await backend.prepareOnly(clone(record)));
          const allowed = [
            "schema",
            "requestJson",
            "requestSha256",
            "manifestSha256",
            "endUserLeafHash",
            "sigHash",
            "sessionHash",
            "fingerprint",
            "userId",
            "publicKeyHash",
            "networkHash",
            "registryHash",
            "sdkManifestSha256",
            "startUserLeafHash",
            "walletNonce",
            "validUntilCheckpoint",
            "actualFee",
            "fullCalls",
            ...(p?.schema===2?["contentHash","verificationBundleJson","verificationBundleSha256","verifierPackSha256"]:[]),
          ];
          ok(
            p && Object.keys(p).sort().join(",") === allowed.sort().join(","),
            "Only a public prepared capsule may be retained",
          );
          e.prepared = p;
          e.preparedHash = await hash(canon(p));
          e.phase = "unverified";
          await save();
          await validatePrepared(e, p);
          e.phase = "prepared";
          await save();
          return summary(e);
        } catch {
          e.phase = e.prepared ? "unverified" : "preparation-failed";
          await save();
          throw Error(
            "Prepare-only operation or verification failed; no broadcast path was invoked. Original state preserved.",
          );
        }
      });
    },
    verify: async (context, intentId) =>
      locked(clone(context), async (s, save) => {
        const e = scoped(s, context, intentId);
        ok(
          ["unverified", "prepared"].includes(e.phase),
          "Only an existing exact capsule can be verified",
        );
        ok(
          (await hash(canon(e.prepared))) === e.preparedHash,
          "Prepared capsule changed",
        );
        e.phase = "unverified";
        await save();
        await validatePrepared(e, e.prepared);
        e.phase = "prepared";
        await save();
        return summary(e);
      }),
    broadcast: async (context, intentId, preparedHash) =>
      locked(clone(context), async (s, save) => {
        const c = clone(context),
          e = scoped(s, c, intentId);
        if (["broadcast-intent", "unresolved", "included"].includes(e.phase))
          return summary(e);
        ok(
          e.phase === "prepared" &&
            e.preparedHash === preparedHash &&
            (await hash(canon(e.prepared))) === preparedHash,
          "Exact prepared identity required",
        );
        ok(typeof exclusive === "function", "Authoritative wallet lock is not connected");
        identity(c, e.record);
        await validatePrepared(e, e.prepared);
        const approvalTerms = {
          schema: 1, context: c, intentId: e.intentId,
          recordId: e.record.recordId, preparedHash: e.preparedHash,
          requestSha256: e.prepared.requestSha256,
          fullCalls: e.prepared.fullCalls, actualFee: e.prepared.actualFee,
          maxNetworkFee: e.record.plan.maxNetworkFee,
          review: {request: clone(e.record.request), plan: clone(e.record.plan)},
          validUntilCheckpoint: e.prepared.validUntilCheckpoint,
        };
        const approvalSha256 = await hash(canon(approvalTerms));
        const confirmation = await confirmBroadcast(clone(approvalTerms));
        ok(confirmation?.approved === true && confirmation.approvalSha256 === approvalSha256,
          "Wallet confirmation denied or belongs to another exact transaction");
        const approvedAt = Date.now();
        const fresh = await backend.recheck(clone(e.record), clone(e.prepared));
        ok(
          fresh?.requestSha256 === e.prepared.requestSha256 &&
            fresh.identityAndDependenciesVerified === true &&
            fresh.fullStateAndNonceVerified === true &&
            fresh.feesVerified === true &&
            Number.isSafeInteger(fresh.checkpoint) &&
            fresh.checkpoint >= e.record.plan.startCheckpoint &&
            fresh.checkpoint <= e.prepared.validUntilCheckpoint,
          "Fresh native identity/state/nonce/expiry/fee recheck required",
        );
        // Persist before the only transport invocation. A thrown/unknown result is
        // never permission to regenerate or resend this or another operation.
        ok(Date.now() - approvedAt <= 30000, "Fresh approval/recheck expired; confirm again");
        e.approval = { approvalSha256, approvedAt, preparedHash: e.preparedHash };
        e.phase = "broadcast-intent";
        await save();
        try {
          await backend.broadcastExact(
            e.prepared.requestJson,
            e.prepared.requestSha256,
          );
        } catch {}
        e.phase = "unresolved";
        await save();
        return summary(e);
      }),
    reconcile: async (context, intentId) =>
      locked(clone(context), async (s, save) => {
        const e = scoped(s, context, intentId);
        if (e.phase === "included") return summary(e);
        ok(
          ["broadcast-intent", "unresolved"].includes(e.phase),
          "No original broadcast intent",
        );
        await validatePrepared(e, e.prepared);
        ok(
          (await hash(canon(e.prepared))) === e.preparedHash,
          "Original prepared capsule changed",
        );
        const r = await backend.reconcile(clone(e.prepared));
        if (r?.status !== "included" || r.success !== true) return summary(e);
        ok(
          r.requestSha256 === e.prepared.requestSha256 &&
            r.userId === e.context.userId &&
            r.endUserLeafHash === e.prepared.endUserLeafHash &&
            HASH.test(r.contentHash ?? "") &&
            (e.prepared.schema!==2 || r.contentHash===e.prepared.contentHash) &&
            r.networkHash === e.context.networkHash,
          "Original exact receipt identity mismatch",
        );
        ok(
          Number.isSafeInteger(r.checkpoint) &&
            r.checkpoint >= e.record.plan.startCheckpoint &&
            Number.isSafeInteger(r.commonCheckpoint) &&
            r.commonCheckpoint >= r.checkpoint,
          "Receipt not yet visible in common state",
        );
        ok(
          BigInt(r.commonNonce) >= BigInt(e.prepared.walletNonce),
          "Common nonce has not advanced",
        );
        if (String(r.commonNonce) === e.prepared.walletNonce)
          ok(
            r.commonLeafHash === e.prepared.endUserLeafHash,
            "Same nonce has another endpoint",
          );
        e.phase = "included";
        e.receipt = clone(r);
        await save();
        return summary(e);
      }),
    cancelPreparation: async (context, intentId) =>
      locked(clone(context), async (s, save) => {
        const e = scoped(s, context, intentId);
        ok(
          [
            "preparing",
            "prepared",
            "unverified",
            "preparation-failed",
          ].includes(e.phase),
          "Only wholly unbroadcast preparation can be cancelled",
        );
        e.phase = "cancelled";
        await save();
        return summary(e);
      }),
    assertNoPending: async (context) =>
      locked(clone(context), async (s) => {
        ok(
          !s.entries.some((e) => !terminal(e.phase)),
          "Original market operation reserves this account; reconcile before another wallet write",
        );
        return true;
      }),
  };
}
