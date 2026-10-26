import type { ContractCallArgs } from "./callTypes";
import type { PsyAccount, PsyAccountsResult, PsyProvider } from "../psy";

export class PsyWalletNotInstalledError extends Error {
  constructor() {
    super(
      "PSY wallet not detected. Install the psy-wallet extension and reload.",
    );
    this.name = "PsyWalletNotInstalledError";
  }
}

export function normalizeAccounts(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object" && "accounts" in value
      ? value.accounts
      : null;
  if (
    !Array.isArray(list) ||
    list.length > 64 ||
    list.some((a) => typeof a !== "string" || a.length === 0 || a.length > 512)
  )
    throw new Error("Wallet returned an invalid account list");
  return [...new Set(list)] as string[];
}

// Resolve with the provider, or wait up to `timeoutMs` for the extension's
// `psy#initialized` event. The wallet may inject window.psy after the page
// has parsed, so polling/event-listening is required.
export function waitForPsy(timeoutMs = 3000): Promise<PsyProvider> {
  if (window.psy) return Promise.resolve(window.psy);
  return new Promise((resolve, reject) => {
    let done = false;
    let poll = 0;
    const onInit = () => {
      if (done) return;
      if (window.psy) {
        done = true;
        cleanup();
        resolve(window.psy);
      }
    };
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new PsyWalletNotInstalledError());
    }, timeoutMs);
    const cleanup = () => {
      window.removeEventListener("psy#initialized", onInit);
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
    window.addEventListener("psy#initialized", onInit);
    // also poll in case the event already fired before we attached
    poll = window.setInterval(() => {
      if (window.psy) {
        window.clearInterval(poll);
        onInit();
      }
    }, 100);
  });
}

export async function connect(): Promise<PsyAccount[]> {
  const psy = await waitForPsy();
  const result: PsyAccountsResult = await psy.requestAccounts();
  return normalizeAccounts(result);
}

export async function sendCall(
  account: PsyAccount,
  call: ContractCallArgs | ContractCallArgs[],
): Promise<string> {
  const psy = await waitForPsy();
  return psy.sendTransaction(account, call);
}
