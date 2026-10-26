export type AssetKey = "A" | "B";
export type RouteMode = "single" | "double";
export type Stage =
  | "submitted"
  | "frozen"
  | "proving"
  | "broadcast"
  | "unknown"
  | "middle_outbox"
  | "middle_claimed"
  | "second_submitted"
  | "second_frozen"
  | "second_proving"
  | "second_broadcast"
  | "claimable"
  | "claimed"
  | "cancel_requested"
  | "refundable"
  | "refunded";
export interface DraftForm {
  mode: RouteMode;
  sell: AssetKey;
  amount: string;
  receiver: string;
  slippageBps: string;
  deadlineMinutes: string;
  feeCap: string;
}
export interface Preview {
  schema: 1;
  source: "demo";
  mode: RouteMode;
  sell: AssetKey;
  buy: AssetKey;
  inputUnits: string;
  middleUnits: string;
  outputUnits: string;
  minimumUnits: string;
  receiver: string;
  slippageBps: string;
  deadlineMinutes: string;
  feeCapUnits: string;
  createdAt: string;
  expiresAt: string;
  sdkReference: string;
  network: "sepolia";
  inputLimbs: string[];
  financialAuthorization: false;
}
export interface DemoOrder extends Preview {
  id: string;
  requestIdentity: string;
  stage: Stage;
  completedHops: number;
  history: { stage: Stage; at: string }[];
}
export const SDK_MANIFEST: string;
export const STORAGE_KEY: string;
export const LIVE_GATE: Readonly<{ enabled: false; reason: string }>;
export const DEMO_ASSETS: Readonly<
  Record<AssetKey, { key: AssetKey; symbol: string; id: number; decimals: 18 }>
>;
export const STAGES: Readonly<Record<Stage, { label: string; step: number }>>;
export function fullAmount(units: string | bigint, decimals?: number): string;
export function displayAmount(
  units: string | bigint,
  decimals?: number,
  digits?: number,
): string;
export function previewDraft(form: DraftForm, now?: number): Preview;
export function makeDemoOrder(preview: Preview, orders: DemoOrder[]): DemoOrder;
export function remainingAsset(order: DemoOrder): AssetKey;
export function remainingUnits(order: DemoOrder): string;
export function pendingTotals(
  orders: DemoOrder[],
): Record<AssetKey, { amount: string; withinU124: boolean }>;
export function canCancel(order: DemoOrder): boolean;
export function demoAction(
  order: DemoOrder,
  action:
    | "advance"
    | "cancel"
    | "claim"
    | "claim_middle"
    | "resolve_original"
    | "resolve_refund",
  now?: number,
): DemoOrder;
export function seedOrders(now?: number): DemoOrder[];
export function serializeOrders(orders: DemoOrder[]): string;
export function hydrateOrders(raw: string): DemoOrder[];
export function submitLive(): Promise<never>;
