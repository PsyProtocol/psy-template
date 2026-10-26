// Local activity presentation only. Filtering never changes persisted records,
// expires a chain order, releases funds or resolves an unknown request.
import { DEMO_ASSETS, STAGES, fullAmount } from "./domain.mjs";
const names = {
  orderbook: "Orderbook",
  curve: "Bonding Curve",
  nft: "NFT Market",
};
export function draftState(record, now) {
  return record.status === "cancelled"
    ? "cancelled"
    : record.preview.expiresAt <= now
      ? "expired"
      : "draft";
}
export function ammActivityState(order) {
  if (["claimed", "refunded"].includes(order.stage)) return "completed";
  if (["claimable", "refundable", "middle_outbox"].includes(order.stage))
    return "pending";
  if (order.stage === "unknown") return "unknown";
  return "active";
}
const matches = (query, values) => {
  const text = values.join(" ").toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((term) => text.includes(term));
};
export function filterDraftActivity(
  records,
  { query = "", market = "all", status = "all" },
  now,
) {
  return records.filter(
    (r) =>
      (market === "all" || r.preview.market === market) &&
      (status === "all" || draftState(r, now) === status) &&
      matches(query, [
        r.id,
        r.preview.owner,
        names[r.preview.market],
        r.preview.action,
        r.preview.spend.asset,
        r.preview.receive.asset,
        r.preview.spend.units,
        r.preview.receive.units,
        r.preview.terms.collection ?? "",
        r.preview.terms.collectionRef ?? "",
        ...(r.preview.terms.tokenWords ?? []),
      ]),
  );
}
export function filterAmmActivity(orders, { query = "", status = "all" }) {
  return orders.filter(
    (o) =>
      (status === "all" || ammActivityState(o) === status) &&
      matches(query, [
        o.id,
        o.requestIdentity,
        o.receiver,
        STAGES[o.stage].label,
        o.mode === "double" ? "Two pools 2485 2486" : "AMM 2485",
        DEMO_ASSETS[o.sell].symbol,
        DEMO_ASSETS[o.buy].symbol,
        o.inputUnits,
        fullAmount(o.inputUnits),
        o.outputUnits,
        fullAmount(o.outputUnits),
      ]),
  );
}
