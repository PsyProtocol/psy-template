export interface PositionAsset {
  contractId: number;
  symbol: string;
  decimals: number;
  balance: string;
  sentToVault: string;
  settled: string;
  claimable: string;
}
export interface PositionRequest {
  marketId: number;
  userId: number;
  slotStart: number;
  slotCount: number;
}
export interface PositionSnapshot {
  schema: 1;
  registryHash: string;
  assurance: "rpc-observed";
  financialAuthorization: false;
  kind: string;
  marketId: number;
  vaultId: number;
  userId: number;
  checkpoint: number;
  observedAt: number;
  network: unknown;
  user: {
    publicKeyHash: string;
    leafHash: string;
    nonce: string;
    nativeBalance: string;
  };
  assets: PositionAsset[];
  order: Record<string, string | string[]>;
  queue: {
    epoch: string;
    phase: string;
    cutoff: string;
    count: string;
    root: string[];
  };
  lifecycle: Record<string, string>;
  nativeOutbox: { sent: string; claimed: string; claimable: string };
  anchors: { userId: number; contractId: number; root: string }[];
  curve?: Record<string, string>;
  nft?: {
    contractId: number;
    balance: string;
    slotStart: number;
    slotCount: number;
    inventoryComplete: false;
    slots: {
      slot: number;
      active: string;
      tokenId: string[];
      metadataHash: string[];
    }[];
    sent: string;
    claimed: string;
    pending: { sequence: string; tokenId: string[]; metadataHash: string[] }[];
  };
}
export interface PositionRegistry {
  network: unknown;
  markets: {
    marketId: number;
    vaultId: number;
    kind: string;
    nftId?: number;
    assets: { contractId: number; decimals: number; symbol: string }[];
    dependencies: { contract: { contractId: number } }[];
  }[];
}
export function validatePositionSnapshot(
  snapshot: PositionSnapshot,
  request: PositionRequest,
  registry: PositionRegistry,
  registryHash: string,
  now?: number,
): unknown;
export function createPositionClient(options: {
  registry: PositionRegistry;
  registryHash: string;
  fetcher?: typeof fetch;
  now?: () => number;
}): { snapshot: (request: PositionRequest) => Promise<PositionSnapshot> };
