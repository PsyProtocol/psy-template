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
  capabilities(): {
    schema: 1; prepareOnly: boolean; broadcast: boolean;
    nativeFullCallVerifier: boolean; financialAuthorization: false;
    registryHash: string; requiredSdkManifestSha256: string; boundary: string;
  };
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
  assertChain(): Promise<{chainRootAt1: string; scope: string}>;
}
export function createPrepareOnlyMarketService(options: {
  store: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<unknown>;
  };
  bundle: unknown;
  provider: unknown;
  fetcher?: typeof fetch;
  prepareTrace(
    record: PreparationRecord,
    context: PreparationContext,
  ): Promise<unknown>;
  parse(text: string): unknown;
  stringify(value: unknown): string;
}): PreparationService;

/** Extension-internal only. Never accept these functions from a page RPC. */
export interface MarketWalletService extends PreparationService {
 verify(context: PreparationContext,intentId: string): Promise<unknown>;
 broadcast(context: PreparationContext,intentId: string,preparedHash: string): Promise<unknown>;
 reconcile(context: PreparationContext,intentId: string): Promise<unknown>;
}
export function createMarketWalletService(options: Parameters<typeof createPrepareOnlyMarketService>[0] & {
 native: {identity(): Promise<string>;identify(request: string): Promise<string>;verify(request: string,approval: string,bundle: string): Promise<string>};
 expectedVerifierPackSha256: string;
 confirmBroadcast(terms: unknown): Promise<{approved:boolean;approvalSha256?:string}>;
 fetcher?: typeof fetch;
}): MarketWalletService;
