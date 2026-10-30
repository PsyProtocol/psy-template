import type { MarketWalletEntry } from "./marketWallet.mjs";
export function publicWalletHistory(rows: unknown): MarketWalletEntry[];
export function walletRecoveryAction(
  phase: string,
): "reconcile" | "cancel" | null;
export function walletNextStep(phase: string): string;
export function createWalletHistoryClient(
  provider: {
    request(args: { method: string; params: unknown[] }): Promise<unknown>;
  },
  account: string,
): {
  list(): Promise<MarketWalletEntry[]>;
  recover(entry: MarketWalletEntry): Promise<MarketWalletEntry[]>;
};
