import type {
  PositionRegistry,
  PositionSnapshot,
} from "./positionSnapshot.mjs";
export interface MarketActionRequest {
  kind: string;
  marketId: number;
  userId: number;
  recipientId: number;
  validForCheckpoints: number;
  feeCap: string;
  terms: Record<string, unknown>;
}
export interface MarketActionRecord {
  schema: 1;
  request: MarketActionRequest;
  snapshot: PositionSnapshot;
  context: Record<string, unknown>;
  registryHash: string;
  recordId: string;
  plan: {
    kind: string;
    callCount: number;
    maxNetworkFee: string;
    effect: string;
    validUntilCheckpoint: number;
    financialAuthorization: false;
    calls: {
      contract_id: string;
      method_id?: string;
      method_name: string;
      inputs: string[];
    }[];
  };
}
export function createMarketActionClient(options: {
  registry: PositionRegistry;
  registryHash: string;
  abis: Record<string, unknown>;
  fetcher?: typeof fetch;
  now?: () => number;
}): {
  validate: (record: MarketActionRecord) => Promise<MarketActionRecord>;
  plan: (request: MarketActionRequest) => Promise<MarketActionRecord>;
};
