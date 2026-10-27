export interface PreparationContext {
  origin: string;
  account: string;
  userId: number;
  networkHash: string;
  fingerprint: string;
  chainKey: string;
}
export interface PreparationRecord {
  plan: { marketId: number; calls: unknown[] };
  [key: string]: unknown;
}
export interface PreparationService {
  capabilities(): Record<string, unknown>;
  prepare(
    context: PreparationContext,
    record: PreparationRecord,
  ): Promise<unknown>;
  list(context: PreparationContext): Promise<unknown>;
  cancelPreparation(
    context: PreparationContext,
    intentId: string,
  ): Promise<unknown>;
  contextFor(
    identity: Omit<PreparationContext, "networkHash">,
  ): Promise<PreparationContext>;
  assertNoPending(account: string, chainKey: string): Promise<unknown>;
  assertNetwork(config: unknown): Promise<void>;
}
export function createPrepareOnlyMarketService(options: {
  store: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<unknown>;
  };
  bundle: unknown;
  provider: unknown;
  prepareTrace(
    record: PreparationRecord,
    context: PreparationContext,
  ): Promise<unknown>;
  parse(text: string): unknown;
  stringify(value: unknown): string;
}): PreparationService;
