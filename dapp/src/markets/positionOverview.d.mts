import type { ProductRecord, ProductMarket } from "./productDrafts.mjs";
import type { DemoOrder } from "./domain.mjs";
export interface PositionCard {
  market: "amm" | ProductMarket;
  name: string;
  position: string;
  source: string;
  route: "liquidity" | ProductMarket;
  verifiedPosition: null;
  financialAuthorization: false;
  local: { open: number; expired: number; cancelled: number };
  demoOrders: number;
  demoPending: number;
}
export function positionOverview(
  drafts: ProductRecord[],
  orders: DemoOrder[],
  now: number,
): PositionCard[];
