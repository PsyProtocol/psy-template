import { useMemo, useRef, useState } from "react";
import {
  createWalletHistoryClient,
  walletNextStep,
  walletRecoveryAction,
} from "../../../market-client/walletHistory.mjs";
import {
  marketWalletPhase,
  type MarketWalletEntry,
} from "../../../market-client/marketWallet.mjs";

export function WalletActivity({ account }: { account: string | null }) {
  // Identity changes discard page observations, never extension-owned history.
  return (
    <WalletActivityScope key={account ?? "disconnected"} account={account} />
  );
}
function WalletActivityScope({ account }: { account: string | null }) {
  const [rows, setRows] = useState<MarketWalletEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState(false);
  const pending = useRef(false);
  const provider = window.psy;
  const validAccount = /^[0-9a-f]{64}$/.test(account ?? "");
  const client = useMemo(
    () =>
      account && validAccount && provider
        ? createWalletHistoryClient(provider, account)
        : null,
    [account, validAccount, provider],
  );
  const work = async (entry?: MarketWalletEntry) => {
    if (!client || pending.current) return;
    pending.current = true;
    setBusy(true);
    setFresh(false);
    setError("");
    try {
      setRows(entry ? await client.recover(entry) : await client.list());
      setLoaded(true);
      setFresh(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Wallet history unavailable. Originals are preserved.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      className="wallet-activity"
      aria-label="Wallet transaction recovery"
      aria-busy={busy}
    >
      <div className="wallet-activity-heading">
        <div>
          <p className="eyebrow">
            WALLET RECORDS · SEPARATE FROM DEMO ACTIVITY
          </p>
          <h2>Transactions & recovery</h2>
        </div>
        <button
          className="secondary-button"
          disabled={!client || busy}
          onClick={() => void work()}
        >
          {busy ? "Reading wallet…" : "Read original wallet history"}
        </button>
      </div>
      <p>
        Read the connected wallet's records for this origin and its configured
        chain. No transaction is prepared or sent here. A confirmed request is
        not proof that a market trade or claim has completed.
      </p>
      {!account && (
        <p role="status">
          Connect your ordinary browser wallet to find original requests after a
          refresh or restart.
        </p>
      )}
      {account && !validAccount && (
        <p role="status">
          This wallet did not return the public key hash required for scoped
          recovery. Reconnect with the supported ordinary wallet; no history has
          been changed.
        </p>
      )}
      {account && !provider && (
        <p role="status">
          The wallet provider is unavailable. Reconnect without resetting wallet
          history.
        </p>
      )}
      {loaded && !rows.length && (
        <p role="status">
          No wallet preparations were returned for this account, origin and
          configured chain. This is not a full chain-history search.
        </p>
      )}
      {loaded && !fresh && (
        <p role="status">
          Previous wallet observation retained. Refresh before taking another
          recovery action.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <ul className="wallet-activity-list">
        {rows.map((entry) => (
          <li key={entry.intentId}>
            <h3>{marketWalletPhase(entry.phase)}</h3>
            <p>{walletNextStep(entry.phase)}</p>
            <details>
              <summary>Original request and fee identity</summary>
              <dl>
                <dt>Intent</dt>
                <dd>{entry.intentId}</dd>
                <dt>Reviewed plan record</dt>
                <dd>{entry.recordId}</dd>
                <dt>Exact request SHA256</dt>
                <dd>{entry.requestSha256 ?? "Not prepared"}</dd>
                <dt>Prepared capsule SHA256</dt>
                <dd>{entry.preparedHash ?? "Not prepared"}</dd>
                <dt>Verified fee</dt>
                <dd>
                  {entry.actualFee ?? "Unknown"} PSY base units (not an
                  aggregate fee total)
                </dd>
                <dt>Confirmation checkpoint</dt>
                <dd>{entry.confirmedCheckpoint ?? "Not confirmed"}</dd>
              </dl>
            </details>
            {walletRecoveryAction(entry.phase) && (
              <button
                className="secondary-button"
                disabled={busy || !fresh}
                onClick={() => void work(entry)}
              >
                {walletRecoveryAction(entry.phase) === "reconcile"
                  ? "Check original receipt — no resend"
                  : "Cancel unbroadcast preparation"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
