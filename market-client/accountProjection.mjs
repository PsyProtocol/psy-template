// Readonly account presentation. Never infer a fill/refund from consumed alone,
// sum the same wallet balance across pools, or treat an Outbox as spendable.
import { validateSnapshot, marketFor } from "./ammPlan.mjs";
import { canonical, requireThat as ok } from "./protocol.mjs";
import { formatUnits } from "../token/wide/arithmetic.mjs";
export function projectAmmAccount(
  snapshot,
  registry,
  registryHash,
  now = Date.now(),
) {
  ok(
    Number.isSafeInteger(now) && now >= snapshot.observedAt,
    "Invalid observation clock",
  );
  // Old observations may be displayed explicitly as stale, never authorized or
  // passed to the planner with a rewritten timestamp.
  const m = validateSnapshot(snapshot, registry, {
    marketId: snapshot.marketId,
    userId: snapshot.userId,
    registryHash,
    now: snapshot.observedAt,
  });
  const order = snapshot.order,
    own = order.pool === String(m.vaultId),
    processed = BigInt(snapshot.lifecycle.consumed) >= BigInt(order.nonce);
  const type = {
    0: "Empty order slot",
    1: "Swap",
    2: "Add liquidity",
    3: "Remove liquidity",
  }[order.kind];
  let state =
    "No open order; earlier admission consent may still lock new terms";
  if (order.kind !== "0")
    state = !own
      ? "Order belongs to another vault; use its original pool"
      : processed
        ? "Processed by vault; fill or refund is not inferred"
        : order.cancelled === "1"
          ? "Cancellation requested; no refund is implied"
          : Number(order.deadline) < snapshot.checkpoint
            ? "Admission deadline passed; an already frozen batch may still finish"
            : "Open order; consent alone does not prove queue admission";
  return JSON.parse(
    canonical({
      schema: 1,
      source: "rpc-observed",
      financialAuthorization: false,
      marketId: m.marketId,
      vaultId: m.vaultId,
      userId: snapshot.userId,
      checkpoint: snapshot.checkpoint,
      observedAt: snapshot.observedAt,
      stale: now - snapshot.observedAt > 30000,
      order: {
        type,
        state,
        nonce: order.nonce,
        pool: order.pool,
        consentEpoch: order.admission_epoch,
      },
      queue: {
        phase: { 0: "Not open", 1: "Open", 2: "Sealed", 3: "Closed" }[
          snapshot.queue.phase
        ],
        epoch: snapshot.queue.epoch,
        cutoff: snapshot.queue.cutoff,
        members: snapshot.queue.count,
      },
      lp: {
        rawShares: snapshot.pool.ownedShares,
        totalRawShares: snapshot.pool.totalShares,
      },
      assets: snapshot.assets.map((a) => ({
        contractId: a.contractId,
        symbol: a.symbol,
        decimals: a.decimals,
        balance: formatUnits(BigInt(a.balance), a.decimals),
        claimable: formatUnits(BigInt(a.claimableFromVault), a.decimals),
        unusedDeposit: formatUnits(
          BigInt(a.sentToVault) - BigInt(a.vaultSettled),
          a.decimals,
        ),
      })),
      native: {
        symbol: "test PSY",
        balance: formatUnits(BigInt(snapshot.user.nativeBalance), 9),
        claimable: formatUnits(BigInt(snapshot.funding.nativeClaimable), 9),
      },
      recoveryEnrolled: snapshot.lifecycle.recoveryPool === String(m.vaultId),
    }),
  );
}
export function makeAccountAction(
  snapshot,
  kind,
  assetIn,
  { feeCap = "5", validForCheckpoints = 64 } = {},
) {
  return {
    kind,
    marketId: snapshot.marketId,
    userId: snapshot.userId,
    recipientId: snapshot.userId,
    amountA: "",
    amountB: "",
    assetIn,
    slippageBps: 50,
    validForCheckpoints,
    feeCap,
  };
}
