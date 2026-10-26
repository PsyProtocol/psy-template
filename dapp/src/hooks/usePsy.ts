import { useCallback, useEffect, useRef, useState } from "react";
import {
  connect,
  waitForPsy,
  PsyWalletNotInstalledError,
  normalizeAccounts,
} from "../lib/psy";
import type { PsyProvider } from "../psy";

export type PsyStatus = "detecting" | "available" | "missing";

export function usePsy() {
  const [status, setStatus] = useState<PsyStatus>("detecting");
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let provider: PsyProvider | undefined;
    const onAccounts = (accounts: unknown) => {
      if (cancelled) return;
      try {
        setAccount(normalizeAccounts(accounts)[0] ?? null);
      } catch {
        setAccount(null);
        setError("Invalid wallet account update. Reconnect your wallet.");
      }
    };
    waitForPsy(3000)
      .then((p) => {
        if (cancelled) return;
        setStatus("available");
        provider = p;
        p.on("accountsChanged", onAccounts);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof PsyWalletNotInstalledError) {
          setStatus("missing");
        } else {
          setError(String(e));
        }
      });
    return () => {
      cancelled = true;
      provider?.removeListener("accountsChanged", onAccounts);
    };
  }, []);

  const doConnect = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setConnecting(true);
    setError(null);
    try {
      const accounts = await connect();
      setAccount(accounts[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setConnecting(false);
    }
  }, []);

  return { status, account, error, connecting, connect: doConnect };
}
