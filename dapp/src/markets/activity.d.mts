import type { DemoOrder } from "./domain.mjs";
import type { ProductRecord, ProductMarket } from "./productDrafts.mjs";
export type DraftActivityState = "draft" | "expired" | "cancelled";
export type AmmActivityState = "active" | "pending" | "unknown" | "completed";
export function draftState(
  record: ProductRecord,
  now: number,
): DraftActivityState;
export function ammActivityState(order: DemoOrder): AmmActivityState;
export function filterDraftActivity(
  records: ProductRecord[],
  filters: {
    query?: string;
    market?: "all" | ProductMarket;
    status?: "all" | DraftActivityState;
  },
  now: number,
): ProductRecord[];
export function filterAmmActivity(
  orders: DemoOrder[],
  filters: { query?: string; status?: "all" | AmmActivityState },
): DemoOrder[];
