export function readWalletContext(
  provider: {
    request(args: { method: string; params?: unknown }): Promise<unknown>;
  },
  address: string,
  expectedConfig: unknown,
): Promise<{
  account: string;
  userId: number;
  networkMetadataMatches: true;
  buildId: string;
  assurance: "wallet-reported-metadata";
  sdkAttested: false;
  keyAttested: false;
  exactProofTransportAvailable: false;
  financialAuthorization: false;
}>;
