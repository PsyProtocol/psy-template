export interface MarketSnapshot {
  schema: 2;
  registryHash: string;
  marketId: number;
  userId: number;
  checkpoint: number;
  observedAt: number;
  assurance: "rpc-observed";
  financialAuthorization: false;
  user: {
    publicKeyHash: string;
    leafHash: string;
    nonce: string;
    nativeBalance: string;
  };
  pool: {
    reserveA: string;
    reserveB: string;
    totalShares: string;
    ownedShares: string;
  };
  assets: {
    contractId: number;
    symbol: string;
    decimals: number;
    balance: string;
    claimableFromVault: string;
    sentToVault: string;
    vaultSettled: string;
  }[];
  order: {
    kind: string;
    pool: string;
    nonce: string;
    cancelled: string;
    side: string;
    deadline: string;
    admission_epoch: string;
    admission_cutoff: string;
    admission_nonce: string;
  };
  funding: {
    feeSent: string;
    feeSettled: string;
    feeClaimed: string;
    nativeSent: string;
    nativeClaimed: string;
    nativeClaimable: string;
  };
  lifecycle: {
    consumed: string;
    recoveryPool: string;
    batchReady: string;
    batchPhase: string;
  };
  queue: { phase: string; epoch: string; count: string; cutoff: string };
}
export interface MarketRequest {
  kind:
    | "swap"
    | "add"
    | "remove"
    | "admit"
    | "cancel"
    | "close"
    | "claim"
    | "claim-native"
    | "release"
    | "recover";
  marketId: number;
  userId: number;
  recipientId: number;
  amountA: string;
  amountB: string;
  assetIn: number;
  slippageBps: number;
  validForCheckpoints: number;
  feeCap: string;
}
export interface PlanRecord {
  recordId: string;
  registryHash: string;
  snapshot: MarketSnapshot;
  plan: {
    financialAuthorization: false;
    kind: MarketRequest["kind"];
    marketId: number;
    userId: number;
    withdrawal: null | {
      burned: string;
      outputA: string;
      outputB: string;
      minimumA: string;
      minimumB: string;
    };
    calls: { contract_id: string; method_name: string; inputs: string[] }[];
    quote: string | null;
    minimum: string | null;
    next: string;
    maxNetworkFee: string;
    actualNetworkFee: null;
  };
}
export interface GatewayStatus {
  registryHash: string;
  capabilities: {
    financialSubmission: false;
    publicReads: boolean;
    unsignedPlans: boolean;
  };
  writeBoundary: string;
  executor: { status: string };
}
export function createPublicMarketClient(options: {
  registry: unknown;
  registryHash: string;
  fetcher?: typeof fetch;
  base?: string;
  now?: () => number;
}): {
  status(): Promise<GatewayStatus>;
  snapshot(marketId: number, userId: number): Promise<MarketSnapshot>;
  plan(request: MarketRequest): Promise<PlanRecord>;
  receipt(identity: {
    userId: number;
    endUserLeafHash: string;
    minCheckpoint: number;
  }): Promise<{ status: string; [key: string]: unknown }>;
  submit(): Promise<never>;
};
