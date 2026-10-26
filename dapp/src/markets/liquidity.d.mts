export interface LiquidityForm {
  pool: string;
  amountA: string;
  amountB: string;
  receiver: string;
  slippageBps: string;
  feeCap: string;
}
export interface LiquidityPreview {
  source: "demo";
  financialAuthorization: false;
  sdkReference: string;
  pool: string;
  owner: string;
  a: string;
  b: string;
  minted: string;
  minimum: string;
  feeCap: string;
  aLimbs: string[];
  bLimbs: string[];
  mintedLimbs: string[];
}
export const DEMO_POOLS: readonly string[];
export function previewLiquidity(
  form: LiquidityForm,
): Readonly<LiquidityPreview>;
