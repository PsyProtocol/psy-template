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
export interface WithdrawalForm {
  pool: string;
  receiver: string;
  shares: string;
  slippageBps: string;
  feeCap: string;
}
export interface WithdrawalPreview {
  source: "demo";
  financialAuthorization: false;
  pool: string;
  owner: string;
  burned: string;
  owned: string;
  a: string;
  b: string;
  minimumA: string;
  minimumB: string;
  burnedLimbs: string[];
  feeCap: string;
}
export function previewWithdrawal(
  form: WithdrawalForm,
): Readonly<WithdrawalPreview>;
