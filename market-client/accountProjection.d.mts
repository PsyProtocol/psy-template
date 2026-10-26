import type { MarketSnapshot, MarketRequest } from "./client.mjs";
export interface AmmAccountView {
  schema: 1;
  source: "rpc-observed";
  financialAuthorization: false;
  marketId: number;
  vaultId: number;
  userId: number;
  checkpoint: number;
  observedAt: number;
  stale: boolean;
  order: {
    type: string;
    state: string;
    nonce: string;
    pool: string;
    consentEpoch: string;
  };
  queue: { phase: string; epoch: string; cutoff: string; members: string };
  lp: { rawShares: string; totalRawShares: string };
  assets: {
    contractId: number;
    symbol: string;
    decimals: number;
    balance: string;
    claimable: string;
    unusedDeposit: string;
  }[];
  native: { symbol: string; balance: string; claimable: string };
  recoveryEnrolled: boolean;
}
export function projectAmmAccount(
  snapshot: MarketSnapshot,
  registry: unknown,
  registryHash: string,
  now?: number,
): AmmAccountView;
export function makeAccountAction(
  snapshot: MarketSnapshot,
  kind: MarketRequest["kind"],
  assetIn: number,
  options?: { feeCap?: string; validForCheckpoints?: number },
): MarketRequest;
