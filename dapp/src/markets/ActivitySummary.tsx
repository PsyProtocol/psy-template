import { draftState, ammActivityState } from "./activity.mjs";
import type { ProductRecord } from "./productDrafts.mjs";
import type { DemoOrder } from "./domain.mjs";
export function ActivitySummary({
  drafts,
  orders,
  now,
}: {
  drafts: ProductRecord[];
  orders: DemoOrder[];
  now: number;
}) {
  const items = [
    [
      "Open local drafts",
      drafts.filter((r) => draftState(r, now) === "draft").length,
      "Not submitted or funded",
    ],
    [
      "Pending demo claims",
      orders.filter((o) => ammActivityState(o) === "pending").length,
      "Includes intermediate outputs",
    ],
    [
      "Demo receipt checks",
      orders.filter((o) => ammActivityState(o) === "unknown").length,
      "Original identity must be reconciled",
    ],
  ];
  return (
    <section className="activity-summary" aria-label="Local activity summary">
      {items.map(([label, count, note]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{count}</strong>
          <small>{note}</small>
        </div>
      ))}
    </section>
  );
}
