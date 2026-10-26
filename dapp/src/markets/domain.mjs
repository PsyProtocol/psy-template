import {
  parseUnits,
  formatUnits,
  encodeAmount,
  MAX_AMOUNT,
} from "../../../token/wide/arithmetic.mjs";
import { swapQuote } from "../../../amm/u124/client.mjs";

export const SDK_MANIFEST =
  "0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425";
export const DEMO_ASSETS = Object.freeze({
  A: Object.freeze({ key: "A", symbol: "QA-A", id: 2483, decimals: 18 }),
  B: Object.freeze({ key: "B", symbol: "QA-B", id: 2484, decimals: 18 }),
});
export const STORAGE_KEY = "psy.markets.demo-orders.v1";
export const LIVE_GATE = Object.freeze({
  enabled: false,
  reason:
    "Live service is not connected; network, identity, contracts, fees and state are unverified.",
});
export const STAGES = Object.freeze({
  submitted: { label: "Awaiting batch", step: 0 },
  frozen: { label: "Batch frozen", step: 1 },
  proving: { label: "Proof stage (demo)", step: 2 },
  broadcast: { label: "Awaiting confirmation", step: 3 },
  unknown: { label: "Awaiting original receipt", step: 3 },
  middle_outbox: { label: "Intermediate claim pending", step: 3 },
  middle_claimed: { label: "Intermediate claimed (demo)", step: 3 },
  second_submitted: { label: "Second hop queued", step: 0 },
  second_frozen: { label: "Second hop frozen", step: 1 },
  second_proving: { label: "Second hop proving (demo)", step: 2 },
  second_broadcast: { label: "Second hop awaiting confirmation", step: 3 },
  claimable: { label: "Ready to claim", step: 4 },
  claimed: { label: "Claimed (demo)", step: 4 },
  cancel_requested: { label: "Awaiting exit confirmation", step: 3 },
  refundable: { label: "Refund ready", step: 4 },
  refunded: { label: "Refunded (demo)", step: 4 },
});
const requireThat = (condition, message) => {
  if (!condition) throw new Error(message);
};
const other = (k) => (k === "A" ? "B" : "A");
export function fullAmount(units, decimals = 18) {
  return formatUnits(BigInt(units), decimals)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}
export function displayAmount(units, decimals = 18, digits = 6) {
  requireThat(
    Number.isInteger(digits) && digits >= 0 && digits <= 18,
    "Invalid display precision",
  );
  const full = fullAmount(units, decimals),
    [whole, fraction = ""] = full.split(".");
  if (
    BigInt(units) > 0n &&
    whole === "0" &&
    !/[1-9]/.test(fraction.slice(0, digits))
  )
    return digits ? "< 0." + "0".repeat(digits - 1) + "1" : "< 1";
  return whole + (fraction ? "." + fraction.slice(0, digits) : "");
}
export function previewDraft(raw, now = Date.now()) {
  requireThat(
    raw && typeof raw === "object" && !Array.isArray(raw),
    "Invalid order draft",
  );
  requireThat(
    Object.keys(raw).sort().join(",") ===
      "amount,deadlineMinutes,feeCap,mode,receiver,sell,slippageBps",
    "Unknown order draft fields",
  );
  requireThat(
    ["single", "double"].includes(raw.mode) && ["A", "B"].includes(raw.sell),
    "Unsupported route or asset",
  );
  requireThat(
    typeof raw.amount === "string" && raw.amount.length <= 64,
    "Enter a valid amount",
  );
  let amount;
  try {
    amount = parseUnits(raw.amount, 18);
  } catch {
    throw Error(
      "Amount must be positive, use at most 18 decimals and fit U124",
    );
  }
  requireThat(amount > 0n, "Input amount must be greater than zero");
  requireThat(
    typeof raw.receiver === "string" &&
      /^[1-9]\d{0,7}$/.test(raw.receiver) &&
      BigInt(raw.receiver) < 16777216n,
    "Recipient must be a testnet user ID from 1 to 16777215",
  );
  requireThat(
    ["10", "50", "100"].includes(raw.slippageBps),
    "Unsupported slippage limit",
  );
  requireThat(
    ["15", "30", "60"].includes(raw.deadlineMinutes),
    "Unsupported draft expiry",
  );
  requireThat(
    typeof raw.feeCap === "string" && raw.feeCap.length <= 32,
    "Enter a valid fee budget",
  );
  let fee;
  try {
    fee = parseUnits(raw.feeCap, 9);
  } catch {
    throw Error("Fee cap uses test PSY with at most 9 decimals");
  }
  requireThat(
    fee > 0n && fee <= 50n * 10n ** 9n,
    "Fee cap must be positive and at most 50 test PSY (demo limit)",
  );
  requireThat(Number.isSafeInteger(now) && now > 0, "Invalid draft timestamp");
  const reserve = 1000n * 10n ** 18n;
  requireThat(
    amount + reserve <= MAX_AMOUNT,
    "Input plus pool reserves exceeds U124",
  );
  const middle = swapQuote(amount, reserve, reserve),
    output =
      raw.mode === "double" ? swapQuote(middle, reserve, reserve) : middle;
  requireThat(output > 0n, "Amount too small: rounded output is zero");
  const min = (output * (10000n - BigInt(raw.slippageBps))) / 10000n;
  requireThat(min > 0n, "Amount too small: minimum received is zero");
  return {
    schema: 1,
    source: "demo",
    mode: raw.mode,
    sell: raw.sell,
    buy: raw.mode === "double" ? raw.sell : other(raw.sell),
    inputUnits: String(amount),
    middleUnits: String(middle),
    outputUnits: String(output),
    minimumUnits: String(min),
    receiver: raw.receiver,
    slippageBps: raw.slippageBps,
    deadlineMinutes: raw.deadlineMinutes,
    feeCapUnits: String(fee),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(
      now + Number(raw.deadlineMinutes) * 60000,
    ).toISOString(),
    sdkReference: SDK_MANIFEST,
    network: "sepolia",
    inputLimbs: encodeAmount(amount).map(String),
    financialAuthorization: false,
  };
}
export function makeDemoOrder(preview, orders) {
  hydrateOrders(serializeOrders(orders));
  requireThat(
    preview.source === "demo" && preview.financialAuthorization === false,
    "Only demo drafts are accepted",
  );
  const checked = previewDraft(
    {
      mode: preview.mode,
      sell: preview.sell,
      amount: fullAmount(preview.inputUnits),
      receiver: preview.receiver,
      slippageBps: preview.slippageBps,
      deadlineMinutes: preview.deadlineMinutes,
      feeCap: fullAmount(preview.feeCapUnits, 9),
    },
    Date.parse(preview.createdAt),
  );
  requireThat(
    Object.keys(checked).every(
      (k) => JSON.stringify(checked[k]) === JSON.stringify(preview[k]),
    ),
    "Demo preview amount or route was modified",
  );
  requireThat(
    orders.length < 100,
    "Demo record limit of 100 reached; export records first",
  );
  const last = Math.max(0, ...orders.map((o) => Number(o.id.slice(5))));
  requireThat(
    last < 99999999,
    "Demo identifiers exhausted; export records first",
  );
  const id = "DEMO-" + String(last + 1).padStart(4, "0");
  return {
    ...preview,
    id,
    requestIdentity: "LOCAL-" + id,
    stage: "submitted",
    completedHops: 0,
    history: [{ stage: "submitted", at: preview.createdAt }],
  };
}
export function remainingAsset(order) {
  return order.completedHops === 1 && order.mode === "double"
    ? other(order.sell)
    : order.sell;
}
export function remainingUnits(order) {
  return order.completedHops === 1 && order.mode === "double"
    ? order.middleUnits
    : order.inputUnits;
}
export function canCancel(order) {
  return ["submitted", "second_submitted", "middle_claimed"].includes(
    order.stage,
  );
}
export function pendingTotals(orders) {
  return Object.fromEntries(
    ["A", "B"].map((asset) => {
      const total = orders
        .filter(
          (o) =>
            ["claimable", "refundable", "middle_outbox"].includes(o.stage) &&
            (o.stage === "claimable" ? o.buy : remainingAsset(o)) === asset,
        )
        .reduce(
          (sum, o) =>
            sum +
            BigInt(
              o.stage === "claimable" ? o.outputUnits : remainingUnits(o),
            ),
          0n,
        );
      return [
        asset,
        { amount: String(total), withinU124: total <= MAX_AMOUNT },
      ];
    }),
  );
}
export function demoAction(order, action, now = Date.now()) {
  hydrateOrders(serializeOrders([order]));
  requireThat(
    order.source === "demo" && order.financialAuthorization === false,
    "On-chain records cannot be changed",
  );
  requireThat(
    [
      "advance",
      "cancel",
      "claim",
      "claim_middle",
      "resolve_original",
      "resolve_refund",
    ].includes(action),
    "Unsupported action",
  );
  let stage = order.stage,
    hops = order.completedHops;
  if (action === "cancel") {
    requireThat(
      canCancel(order),
      "Cannot cancel a frozen set; await the settlement result",
    );
    stage = "cancel_requested";
  } else if (action === "claim") {
    requireThat(
      ["claimable", "refundable"].includes(stage),
      "No claimable assets, or already claimed",
    );
    stage = stage === "claimable" ? "claimed" : "refunded";
  } else if (action === "claim_middle") {
    requireThat(
      stage === "middle_outbox" && order.mode === "double",
      "Intermediate assets cannot be claimed yet",
    );
    stage = "middle_claimed";
  } else if (action === "resolve_original") {
    requireThat(
      stage === "unknown",
      "Reconcile only the original unknown request",
    );
    stage = order.mode === "double" ? "middle_outbox" : "claimable";
    hops = 1;
  } else if (action === "resolve_refund") {
    requireThat(
      [
        "frozen",
        "proving",
        "broadcast",
        "unknown",
        "second_frozen",
        "second_proving",
        "second_broadcast",
      ].includes(stage),
      "Not awaiting the original batch result",
    );
    stage = "refundable";
  } else {
    requireThat(
      Date.parse(order.expiresAt) > now || stage === "cancel_requested",
      "Draft expired; exit and return actual remaining assets",
    );
    const next = {
      submitted: "frozen",
      frozen: "proving",
      proving: "broadcast",
      broadcast: order.mode === "double" ? "middle_outbox" : "claimable",
      middle_claimed: "second_submitted",
      second_submitted: "second_frozen",
      second_frozen: "second_proving",
      second_proving: "second_broadcast",
      second_broadcast: "claimable",
      cancel_requested: "refundable",
    };
    requireThat(
      next[stage],
      stage === "unknown"
        ? "Unknown broadcast requires the original identity; do not resubmit"
        : "Cannot advance; claim assets or await the original result",
    );
    stage = next[stage];
    if (
      stage === "middle_outbox" ||
      (stage === "claimable" && order.mode === "single")
    )
      hops = 1;
    if (stage === "claimable" && order.mode === "double") hops = 2;
  }
  return {
    ...order,
    stage,
    completedHops: hops,
    history: [...order.history, { stage, at: new Date(now).toISOString() }],
  };
}
export function seedOrders(now = Date.now()) {
  const raw = {
    mode: "single",
    sell: "A",
    amount: "2.5",
    receiver: "1717440",
    slippageBps: "50",
    deadlineMinutes: "30",
    feeCap: "35.0035",
  };
  const make = (i, patch, stage, hops) => ({
    ...previewDraft({ ...raw, ...patch }, now - 180000 + i * 1000),
    id: "DEMO-000" + i,
    requestIdentity: "LOCAL-DEMO-000" + i,
    stage,
    completedHops: hops,
    history: [{ stage, at: new Date(now - 120000).toISOString() }],
  });
  return [
    make(3, {}, "claimable", 1),
    make(2, { mode: "double", amount: "1" }, "refundable", 1),
    make(1, { amount: "0.75" }, "unknown", 0),
  ];
}
export function serializeOrders(orders) {
  return JSON.stringify({ schema: 1, source: "demo", orders });
}
export function hydrateOrders(raw) {
  requireThat(
    typeof raw === "string" && raw.length <= 400000,
    "Demo records exceed local storage limits",
  );
  const data = JSON.parse(raw);
  requireThat(
    data.schema === 1 &&
      data.source === "demo" &&
      Array.isArray(data.orders) &&
      data.orders.length <= 100,
    "Invalid local demo records",
  );
  const ids = new Set();
  for (const o of data.orders) {
    requireThat(
      o &&
        o.source === "demo" &&
        o.financialAuthorization === false &&
        /^DEMO-\d{4,8}$/.test(o.id) &&
        !ids.has(o.id),
      "Duplicate or invalid demo identity",
    );
    ids.add(o.id);
    requireThat(
      o.requestIdentity === "LOCAL-" + o.id,
      "Demo original request identity mismatch",
    );
    requireThat(
      Object.hasOwn(STAGES, o.stage) &&
        ["single", "double"].includes(o.mode) &&
        ["A", "B"].includes(o.sell),
      "Invalid demo stage or route",
    );
    requireThat(
      o.buy === (o.mode === "double" ? o.sell : other(o.sell)),
      "Output asset mismatch",
    );
    const expected = previewDraft(
      {
        mode: o.mode,
        sell: o.sell,
        amount: fullAmount(o.inputUnits),
        receiver: o.receiver,
        slippageBps: o.slippageBps,
        deadlineMinutes: o.deadlineMinutes,
        feeCap: fullAmount(o.feeCapUnits, 9),
      },
      Date.parse(o.createdAt),
    );
    for (const name of [
      "inputUnits",
      "middleUnits",
      "outputUnits",
      "minimumUnits",
      "feeCapUnits",
      "createdAt",
      "expiresAt",
      "sdkReference",
      "network",
    ])
      requireThat(
        o[name] === expected[name],
        "Demo amounts, expiry or dependencies were modified",
      );
    requireThat(
      JSON.stringify(o.inputLimbs) === JSON.stringify(expected.inputLimbs),
      "Input dual Felt limbs were modified",
    );
    requireThat(
      [0, 1, 2].includes(o.completedHops) &&
        !(o.mode === "single" && o.completedHops > 1),
      "Invalid completed hop count",
    );
    if (
      ["submitted", "frozen", "proving", "broadcast", "unknown"].includes(
        o.stage,
      )
    )
      requireThat(
        o.completedHops === 0,
        "First hop marked complete without confirmation",
      );
    if (
      [
        "middle_outbox",
        "middle_claimed",
        "second_submitted",
        "second_frozen",
        "second_proving",
        "second_broadcast",
      ].includes(o.stage)
    )
      requireThat(
        o.mode === "double" && o.completedHops === 1,
        "Intermediate or second hop state mismatch",
      );
    if (["claimable", "claimed"].includes(o.stage))
      requireThat(
        o.completedHops === (o.mode === "double" ? 2 : 1),
        "All fills must complete before final claim",
      );
    if (["cancel_requested", "refundable", "refunded"].includes(o.stage))
      requireThat(
        o.completedHops <= (o.mode === "double" ? 1 : 0),
        "Completed fills cannot be refunded at the original price",
      );
    requireThat(
      Array.isArray(o.history) &&
        o.history.length > 0 &&
        o.history.length <= 64 &&
        o.history.every(
          (e) =>
            Object.hasOwn(STAGES, e.stage) &&
            typeof e.at === "string" &&
            Number.isFinite(Date.parse(e.at)),
        ) &&
        o.history.at(-1).stage === o.stage,
      "Invalid demo stage history",
    );
  }
  return data.orders;
}
export async function submitLive() {
  throw new Error(LIVE_GATE.reason);
}
