import { nativeMethod } from "./nativeProtocol.mjs";
import {
  parseUnits,
  decodeAmount,
  MAX_AMOUNT,
  RADIX,
} from "../token/wide/arithmetic.mjs";
import {
  swapQuote,
  withdraw,
  addShares,
  encodeAmount,
  FEE_ESCROW,
  call,
} from "../amm/u124/client.mjs";
import {
  canonical,
  requireThat as ok,
  id,
  exactFields,
  hashPattern,
} from "./protocol.mjs";
const units = (s) => {
  ok(typeof s === "string" && s.length <= 64, "Invalid decimal amount");
  return parseUnits(s, 18);
};
const integer = (s, max = MAX_AMOUNT) => {
  ok(
    typeof s === "string" && /^(0|[1-9]\d*)$/.test(s) && s.length <= 40,
    "Canonical unsigned amount required",
  );
  const n = BigInt(s);
  ok(n <= max, "Amount overflow");
  return n;
};
export function marketFor(registry, marketId) {
  id(marketId);
  const market = registry.markets.find((m) => m.marketId === marketId);
  ok(market?.kind === "amm", "Unreviewed market");
  return market;
}
export function validateSnapshot(
  snapshot,
  registry,
  { marketId, userId, now = Date.now(), registryHash },
) {
  const m = marketFor(registry, marketId);
  id(userId);
  ok(
    hashPattern.test(registryHash ?? "") &&
      snapshot.registryHash === registryHash,
    "Snapshot registry mismatch",
  );
  ok(userId !== m.vaultId, "The public vault is not an ordinary user");
  ok(
    snapshot?.schema === 2 &&
      snapshot.marketId === marketId &&
      snapshot.userId === userId,
    "Snapshot identity mismatch",
  );
  ok(
    snapshot.assurance === "rpc-observed" &&
      snapshot.financialAuthorization === false,
    "RPC data is not authorization",
  );
  ok(
    canonical(snapshot.network) === canonical(registry.network),
    "Snapshot network mismatch",
  );
  ok(
    Number.isSafeInteger(snapshot.checkpoint) &&
      snapshot.checkpoint > 0 &&
      snapshot.checkpoint < 4294967296,
    "Invalid snapshot checkpoint",
  );
  ok(
    Number.isSafeInteger(now) &&
      Number.isSafeInteger(snapshot.observedAt) &&
      now >= snapshot.observedAt &&
      now - snapshot.observedAt <= 30000,
    "Snapshot expired",
  );
  ok(
    hashPattern.test(snapshot.user.publicKeyHash) &&
      hashPattern.test(snapshot.user.leafHash),
    "Missing user state identity",
  );
  integer(snapshot.user.nonce, RADIX - 2n);
  integer(snapshot.user.nativeBalance);
  ok(snapshot.assets.length === m.assets.length, "Snapshot asset count");
  m.assets.forEach((a, i) => {
    const actual = snapshot.assets[i];
    ok(
      actual.contractId === a.contractId &&
        actual.decimals === a.decimals &&
        actual.symbol === a.symbol,
      "Snapshot asset/decimals mismatch",
    );
    for (const f of [
      "balance",
      "sentToVault",
      "vaultSettled",
      "claimableFromVault",
    ])
      integer(actual[f]);
    ok(
      BigInt(actual.sentToVault) >= BigInt(actual.vaultSettled),
      "Noncanonical funding cursor",
    );
  });
  for (const field of ["reserveA", "reserveB", "totalShares", "ownedShares"])
    integer(snapshot.pool[field]);
  for (const field of [
    "kind",
    "pool",
    "nonce",
    "side",
    "deadline",
    "cancelled",
    "admission_epoch",
    "admission_cutoff",
    "admission_nonce",
  ])
    integer(snapshot.order[field], RADIX - 1n);
  for (const field of ["epoch", "phase", "cutoff", "count"])
    integer(snapshot.queue[field], RADIX - 1n);
  ok(
    BigInt(snapshot.order.deadline) < 4294967296n &&
      BigInt(snapshot.queue.cutoff) < 4294967296n,
    "Checkpoint field overflow",
  );
  ok(
    ["0", "1", "2", "3"].includes(snapshot.order.kind) &&
      ["0", "1"].includes(snapshot.order.side) &&
      ["0", "1"].includes(snapshot.order.cancelled) &&
      ["0", "1", "2", "3"].includes(snapshot.queue.phase),
    "Invalid order/queue state",
  );
  ok(BigInt(snapshot.queue.count) <= 4n, "Queue capacity");
  integer(snapshot.funding.feeSent);
  integer(snapshot.funding.feeSettled);
  integer(snapshot.funding.feeClaimed);
  for (const f of ["nativeSent", "nativeClaimed", "nativeClaimable"])
    integer(snapshot.funding[f], RADIX - 1n);
  ok(
    BigInt(snapshot.funding.nativeSent) >=
      BigInt(snapshot.funding.nativeClaimed) &&
      BigInt(snapshot.funding.nativeSent) -
        BigInt(snapshot.funding.nativeClaimed) ===
        BigInt(snapshot.funding.nativeClaimable),
    "Native output cursor mismatch",
  );
  for (const f of ["consumed", "recoveryPool", "batchReady", "batchPhase"])
    integer(snapshot.lifecycle?.[f], RADIX - 1n);
  ok(
    ["0", "1"].includes(snapshot.lifecycle.batchReady) &&
      ["0", "1", "2", "3", "4"].includes(snapshot.lifecycle.batchPhase),
    "Invalid vault lifecycle",
  );
  ok(
    BigInt(snapshot.lifecycle.recoveryPool) < 16777216n,
    "Recovery user ID overflow",
  );

  ok(
    BigInt(snapshot.funding.feeSent) >= BigInt(snapshot.funding.feeSettled),
    "Noncanonical fee cursor",
  );
  ok(
    Array.isArray(snapshot.anchors) &&
      snapshot.anchors.length === 2 * m.dependencies.length,
    "Complete user and vault state anchors required",
  );
  const seen = new Set();
  for (const a of snapshot.anchors) {
    ok(
      [userId, m.vaultId].includes(a.userId) &&
        m.dependencies.some((d) => d.contract.contractId === a.contractId) &&
        hashPattern.test(a.root),
      "Invalid state anchor",
    );
    const k = a.userId + ":" + a.contractId;
    ok(!seen.has(k), "Duplicate state anchor");
    seen.add(k);
  }
  return m;
}
export function buildAmmPlan(
  snapshot,
  request,
  registry,
  { now = Date.now(), registryHash } = {},
) {
  exactFields(request, [
    "kind",
    "marketId",
    "userId",
    "recipientId",
    "amountA",
    "amountB",
    "assetIn",
    "slippageBps",
    "validForCheckpoints",
    "feeCap",
  ]);
  const { kind, marketId, userId } = request,
    m = validateSnapshot(snapshot, registry, {
      marketId,
      userId,
      now,
      registryHash,
    });
  ok(
    [
      "swap",
      "add",
      "remove",
      "admit",
      "cancel",
      "close",
      "claim",
      "claim-native",
      "release",
      "recover",
    ].includes(kind),
    "Unsupported AMM action",
  );
  id(request.recipientId);
  ok(
    request.recipientId === userId,
    "This AMM credits the authenticated owner; an arbitrary recipient requires a separate authorized transfer",
  );
  ok(
    Number.isSafeInteger(request.validForCheckpoints) &&
      request.validForCheckpoints >= 1 &&
      request.validForCheckpoints <= 128,
    "Expiry must be 1..128 checkpoints, not minutes",
  );
  ok([10, 50, 100].includes(request.slippageBps), "Unsupported slippage limit");
  ok(
    kind === "claim-native"
      ? request.assetIn === 0
      : m.assets.some((a) => a.contractId === request.assetIn),
    "Unreviewed input asset",
  );
  const [a, b] = snapshot.assets,
    va = BigInt(m.vaultId),
    C = BigInt(marketId),
    order = snapshot.order;
  ok(
    typeof request.feeCap === "string" && request.feeCap.length <= 32,
    "Invalid fee cap",
  );
  const feeCap = parseUnits(request.feeCap, 9);
  ok(
    feeCap > 0n && feeCap <= 50n * 10n ** 9n,
    "Fee cap must be 0..50 test PSY",
  );
  const end = snapshot.checkpoint + request.validForCheckpoints;
  ok(end < 4294967296, "Checkpoint overflow");
  const abi = { contract: { methods: m.methods } },
    tokenAbi = (asset) => ({
      contract: {
        methods: m.assets.find((a) => a.contractId === asset).methods,
      },
    });
  const market = (name, args = []) => call(C, abi, name, args),
    token = (asset, name, args) =>
      call(BigInt(asset), tokenAbi(asset), name, args);
  const calls = [],
    debits = [],
    balance = (x) => BigInt(x.balance),
    outstanding = (x) => BigInt(x.sentToVault) - BigInt(x.vaultSettled);
  let withdrawal = null;
  let quote = null,
    minimum = null,
    next = "Confirm the original request before planning another stage.";
  const newOrder = () => {
    ok(
      order.kind === "0",
      "An existing order must settle/exit and close before a new order",
    );
    ok(
      order.pool === "0" || order.pool === String(m.vaultId),
      "Previous pool consent requires its own authenticated closure snapshot",
    );
    const consent = BigInt(order.admission_epoch);
    ok(
      order.admission_nonce !== order.nonce ||
        consent === 0n ||
        BigInt(snapshot.queue.epoch) > consent ||
        (BigInt(snapshot.queue.epoch) === consent &&
          snapshot.queue.phase === "3"),
      "Previous admission consent still locks terms",
    );
    ok(
      outstanding(a) === 0n &&
        outstanding(b) === 0n &&
        snapshot.funding.feeSent === snapshot.funding.feeSettled &&
        snapshot.funding.feeClaimed === snapshot.funding.feeSettled,
      "Unreconciled deposits or fees; never fund again",
    );
    ok(
      snapshot.queue.phase === "1" &&
        Number(snapshot.queue.cutoff) >= snapshot.checkpoint &&
        BigInt(snapshot.queue.count) < 4n,
      "No open queue capacity; do not fund an unavailable queue",
    );
    ok(
      end >= Number(snapshot.queue.cutoff),
      "Order expires before the selected queue cutoff",
    );
    ok(BigInt(order.nonce) + 1n < RADIX, "Order nonce exhausted");
  };
  const funding = (asset, amount) => {
    ok(
      amount > 0n && balance(asset) >= amount,
      "Insufficient input token balance",
    );
    calls.push(token(asset.contractId, "transfer", [va, encodeAmount(amount)]));
    debits.push({ contractId: asset.contractId, amount: String(amount) });
  };
  const escrow = () => {
    calls.push({
      contract_id: 0n,
      method_name: nativeMethod(registry, "transfer"),
      inputs: [va, FEE_ESCROW],
    });
    debits.push({
      contractId: 0,
      amount: String(FEE_ESCROW),
      purpose: "market escrow, separate from wallet network fee",
    });
  };
  if (kind === "swap") {
    newOrder();
    ok(request.amountB === "", "Unexpected second amount for swap");
    const input = units(request.amountA);
    ok(input > 0n, "Positive swap amount required");
    const side = request.assetIn === a.contractId ? 0n : 1n,
      rin = BigInt(side ? snapshot.pool.reserveB : snapshot.pool.reserveA),
      rout = BigInt(side ? snapshot.pool.reserveA : snapshot.pool.reserveB);
    quote = swapQuote(input, rin, rout);
    minimum = (quote * (10000n - BigInt(request.slippageBps))) / 10000n;
    ok(minimum > 0n, "Output rounds to zero");
    calls.push(
      market("open_swap", [
        va,
        side,
        encodeAmount(input),
        encodeAmount(minimum),
        BigInt(end),
        BigInt(order.nonce) + 1n,
      ]),
    );
    escrow();
    funding(side ? b : a, input);
    next =
      "After confirmation, consent to the then-current open queue. Membership is not guaranteed by an unsigned plan.";
  } else if (kind === "add") {
    newOrder();
    ok(
      request.assetIn === a.contractId,
      "Liquidity asset order is fixed by the reviewed pool",
    );
    const x = units(request.amountA),
      y = units(request.amountB);
    quote = addShares(
      x,
      y,
      BigInt(snapshot.pool.reserveA),
      BigInt(snapshot.pool.reserveB),
      BigInt(snapshot.pool.totalShares),
    );
    ok(
      BigInt(snapshot.pool.ownedShares) + quote <= MAX_AMOUNT,
      "Owned LP shares overflow",
    );
    minimum = (quote * (10000n - BigInt(request.slippageBps))) / 10000n;
    ok(minimum > 0n, "Minimum LP shares round to zero");
    calls.push(
      market("open_add", [
        va,
        encodeAmount(x),
        encodeAmount(y),
        encodeAmount(minimum),
        BigInt(end),
        BigInt(order.nonce) + 1n,
      ]),
    );
    escrow();
    funding(a, x);
    funding(b, y);
    next =
      "After confirmation, consent to an open queue. Shares are internal pool units, not an FT balance.";
  } else if (kind === "remove") {
    newOrder();
    ok(
      request.amountB === "" && request.assetIn === a.contractId,
      "Withdrawal uses raw shares and fixed asset order",
    );
    const burned = integer(request.amountA);
    const result = withdraw(
      burned,
      BigInt(snapshot.pool.reserveA),
      BigInt(snapshot.pool.reserveB),
      BigInt(snapshot.pool.totalShares),
      BigInt(snapshot.pool.ownedShares),
    );
    const minA = (result.a * (10000n - BigInt(request.slippageBps))) / 10000n,
      minB = (result.b * (10000n - BigInt(request.slippageBps))) / 10000n;
    ok(minA > 0n && minB > 0n, "Withdrawal minimum rounds to zero");
    calls.push(
      market("open_remove", [
        va,
        encodeAmount(burned),
        encodeAmount(minA),
        encodeAmount(minB),
        BigInt(end),
        BigInt(order.nonce) + 1n,
      ]),
    );
    escrow();
    withdrawal = {
      burned: String(burned),
      outputA: String(result.a),
      outputB: String(result.b),
      minimumA: String(minA),
      minimumB: String(minB),
    };
    next =
      "An unsigned withdrawal does not burn LP. After order confirmation, consent to the open queue; only confirmed settlement creates claimable token outputs.";
  } else {
    ok(
      request.amountA === "" && request.amountB === "",
      "Amounts are not accepted for this action",
    );

    const consentUnlocked = () =>
      order.admission_nonce !== order.nonce ||
      order.admission_epoch === "0" ||
      BigInt(snapshot.queue.epoch) > BigInt(order.admission_epoch) ||
      (snapshot.queue.epoch === order.admission_epoch &&
        snapshot.queue.phase === "3");
    if (kind === "claim-native") {
      ok(
        BigInt(snapshot.funding.nativeClaimable) > 0n,
        "No confirmed native Outbox delta to claim",
      );
      calls.push({
        contract_id: 0n,
        method_name: nativeMethod(registry, "claim"),
        inputs: [va],
      });
      next =
        "Claim the actual native Outbox delta, then check receipt and net balance after the ordinary wallet fee. A pending return is not spendable.";
    } else if (kind === "recover") {
      ok(
        order.kind === "0" ||
          order.pool !== String(m.vaultId) ||
          BigInt(snapshot.lifecycle.consumed) >= BigInt(order.nonce),
        "Active order must first settle, refund or lawfully release",
      );
      ok(
        snapshot.lifecycle.recoveryPool !== String(m.vaultId),
        "Recovery already enrolled; reconcile the original request and wait for sender-bound recovery",
      );
      ok(
        outstanding(a) > 0n ||
          outstanding(b) > 0n ||
          BigInt(snapshot.funding.feeSent) >
            BigInt(snapshot.funding.feeSettled),
        "No unused incoming funding to recover",
      );
      ok(
        snapshot.lifecycle.batchReady === "1" &&
          ["0", "3", "4"].includes(snapshot.lifecycle.batchPhase),
        "Committed batch blocks recovery; await its outcome or lawful expiry",
      );
      calls.push(market("request_recovery", [va]));
      next =
        "This enrolls only the original payer; it does not refund assets. The restricted Executor must recover actual unused deposits with sufficient authorized fees, then the owner separately claims outputs. Completed trades are not undone.";
    } else if (kind === "release") {
      ok(
        order.kind !== "0" &&
          order.pool === String(m.vaultId) &&
          order.cancelled === "1",
        "Cancel the selected order before releasing it",
      );
      ok(
        consentUnlocked(),
        "Original admission consent locks release until epoch closure",
      );
      calls.push(market("release_unaccepted"));
      next =
        "This clears an order only after lawful consent closure; no funds move. Refresh before requesting sender-bound recovery and later claims. It cannot remove frozen members.";
    } else if (kind === "claim") {
      const asset = request.assetIn === a.contractId ? a : b;
      ok(
        BigInt(asset.claimableFromVault) > 0n,
        "No confirmed Outbox delta to claim",
      );
      calls.push(token(asset.contractId, "claim", [va]));
      next =
        "Verify the exact receipt and fresh token balance. An Outbox delta is not spendable until claimed.";
    } else {
      ok(
        ["1", "2", "3"].includes(order.kind) &&
          order.pool === String(m.vaultId),
        "No matching active swap/add/remove order",
      );
      if (kind === "admit") {
        ok(
          order.cancelled === "0" &&
            snapshot.queue.phase === "1" &&
            BigInt(snapshot.queue.count) < 4n &&
            Number(snapshot.queue.cutoff) >= snapshot.checkpoint,
          "Queue cannot accept this order",
        );
        ok(
          Number(order.deadline) >= Number(snapshot.queue.cutoff),
          "Order expires before queue cutoff",
        );
        ok(
          order.admission_epoch !== snapshot.queue.epoch ||
            order.admission_nonce !== order.nonce,
          "Already consented; reconcile admission instead of reauthorizing",
        );
        calls.push(
          market("request_admission", [
            BigInt(snapshot.queue.epoch),
            BigInt(snapshot.queue.cutoff),
          ]),
        );
        next =
          "Executor must admit this exact owner/nonce, then seal and settle the full accepted queue. Consent alone is not admission.";
      } else if (kind === "cancel") {
        ok(
          order.cancelled === "0",
          "Cancellation already requested; reconcile the original order",
        );
        calls.push(market("request_cancel"));
        next =
          "Cancellation is a request, not immediate withdrawal. Await original batch outcome or lawful epoch closure; claim actual remaining assets.";
      } else {
        ok(
          outstanding(a) === 0n &&
            outstanding(b) === 0n &&
            snapshot.funding.feeSent === snapshot.funding.feeSettled,
          "Outstanding deposits prevent closure",
        );
        const epoch = BigInt(order.admission_epoch);
        ok(
          order.admission_nonce !== order.nonce ||
            epoch === 0n ||
            BigInt(snapshot.queue.epoch) > epoch ||
            (BigInt(snapshot.queue.epoch) === epoch &&
              snapshot.queue.phase === "3"),
          "Accepted epoch still locks closure",
        );
        calls.push(
          market(
            order.kind === "3"
              ? "close_remove"
              : order.kind === "2"
                ? "close_add"
                : order.side === "0"
                  ? "close_swap_0"
                  : "close_swap_1",
          ),
        );
        next =
          "A new order requires a fresh snapshot. Claim any pending outputs separately.";
      }
    }
  }
  const nativeDebit = debits
    .filter((d) => d.contractId === 0)
    .reduce((sum, d) => sum + BigInt(d.amount), 0n);
  ok(
    BigInt(snapshot.user.nativeBalance) >= nativeDebit + feeCap,
    "Insufficient native balance for escrow plus the declared maximum network-fee budget",
  );
  const exactCalls = calls.map((c) => ({
    contract_id: String(c.contract_id),
    method_name: c.method_name,
    inputs: c.inputs.map(String),
  }));
  return {
    schema: 1,
    kind,
    marketId,
    userId,
    recipientId: userId,
    source: "rpc-observed-unsigned",
    financialAuthorization: false,
    registryHash: snapshot.registryHash,
    sdkManifestSha256: registry.sdkManifestSha256,
    ...(registry.nativeProtocol ? {nativeProtocol: registry.nativeProtocol} : {}),
    network: registry.network,
    startCheckpoint: snapshot.checkpoint,
    validUntilCheckpoint: end,
    startUserLeafHash: snapshot.user.leafHash,
    walletNonce: (BigInt(snapshot.user.nonce) + 1n).toString(),
    orderNonce:
      kind === "swap" || kind === "add" || kind === "remove"
        ? (BigInt(order.nonce) + 1n).toString()
        : order.nonce,
    vault: {
      userId: m.vaultId,
      publicKeyHash: m.publicKeyHash,
      fingerprint: m.fingerprint,
    },
    anchors: snapshot.anchors,
    calls: exactCalls,
    callCount: exactCalls.length,
    debits,
    withdrawal,
    quote: quote === null ? null : String(quote),
    minimum: minimum === null ? null : String(minimum),
    maxNetworkFee: String(feeCap),
    actualNetworkFee: null,
    next,
    requiredBeforeBroadcast: [
      "fresh exact identity/dependencies/state/nonce/expiry and wallet context",
      "complete call stack and session/sig_hash proof",
      "independent full UPS and actual fee verification",
      "durable exact prepared identity and one-shot broadcast",
      "original-identity receipt reconciliation; no automatic replacement",
    ],
  };
}
