import { useRef, useState } from "react";
import {
  createMarketWalletClient,
  marketWalletPhase,
  type MarketWalletEntry,
} from "../../../market-client/marketWallet.mjs";
type RecordForWallet = {
  recordId: string;
  registryHash: string;
  plan: { kind: string; marketId: number; network: { chainRootAt1: string } };
};
export function WalletExecution({
  account,
  record,
  expired = false,
}: {
  account: string | null;
  record: RecordForWallet;
  expired?: boolean;
}) {
  const [entry, setEntry] = useState<MarketWalletEntry | null>(null),
    [available, setAvailable] = useState(false),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const pending = useRef(false);
  const client = () => {
    if (!account || !window.psy)
      throw Error("Connect the ordinary browser wallet first");
    return createMarketWalletClient(window.psy, account, record);
  };
  const work = async (
    action:
      | "check"
      | "prepare"
      | "verify"
      | "broadcast"
      | "reconcile"
      | "cancel",
  ) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const c = client();
      if (action === "check") {
        const caps = await c.capabilities();
        setChecked(true);
        setAvailable(caps.usable);
        setStatus(
          caps.usable
            ? "Reviewed wallet execution is available; this is not a trade confirmation."
            : "Wallet execution is closed: a matching reviewed native release or market constraint is missing.",
        );
        const rows = await c.list();
        setEntry(rows[0] ?? null);
        return;
      }
      if (!available && action !== "cancel")
        throw Error("Check the matching wallet release before execution");
      if (action === "prepare") {
        setStatus(
          "Proving and independently verifying in the wallet. No broadcast has been requested.",
        );
        await c.prepare();
      } else {
        if (!entry) throw Error("Original wallet intent unavailable");
        if (action === "verify") await c.verify(entry);
        if (action === "broadcast") {
          setStatus(
            "Waiting for wallet approval, fresh checks and one exact send. A timeout is not a rejection.",
          );
          await c.approveAndBroadcast(entry);
        }
        if (action === "reconcile") await c.reconcile(entry);
        if (action === "cancel") await c.cancel(entry);
      }
      const rows = await c.list();
      setEntry(rows[0] ?? null);
      setStatus("Wallet-owned state refreshed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet operation unavailable");
      // A page timeout cannot decide whether the wallet sent. Recover only by
      // reading its original durable history; never create a replacement here.
      if (action !== "check")
        try {
          const rows = await client().list();
          if (rows[0]) setEntry(rows[0]);
        } catch {}
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const unknown =
    entry && ["broadcast-intent", "unresolved"].includes(entry.phase);
  return (
    <section aria-label="Wallet execution" className="market-wallet-execution">
      <h4>Wallet execution</h4>
      <p role="status" aria-live="polite">
        {status ||
          "A generated plan is unsigned. Check the wallet release before preparing a transaction."}
      </p>
      <button
        className="secondary-button"
        disabled={busy || !account}
        onClick={() => void work("check")}
      >
        Check wallet and original history
      </button>
      {checked && !available && (
        <p className="small-note">
          Writes remain disabled. No fallback to generic wallet transfer or a
          page-supplied verifier is allowed.
        </p>
      )}
      {checked && (
        <>
          <p role="status">{marketWalletPhase(entry?.phase)}</p>
          {available && !entry && (
            <button
              className="primary-button"
              disabled={busy || expired}
              onClick={() => void work("prepare")}
            >
              Prepare in wallet
            </button>
          )}
          {available && entry?.phase === "unverified" && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void work("verify")}
            >
              Verify original preparation
            </button>
          )}
          {available && entry?.phase === "prepared" && (
            <button
              className="primary-button"
              disabled={busy || expired}
              onClick={() => void work("broadcast")}
            >
              Review and approve in wallet
            </button>
          )}
          {unknown && (
            <button
              className="primary-button"
              disabled={busy || !available}
              onClick={() => void work("reconcile")}
            >
              Reconcile original request
            </button>
          )}
          {entry &&
            [
              "preparing",
              "prepared",
              "unverified",
              "preparation-failed",
            ].includes(entry.phase) && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void work("cancel")}
              >
                Cancel unbroadcast preparation
              </button>
            )}
          {entry?.phase === "included" && (
            <p className="small-note">
              The request is confirmed. Refresh the account reader to inspect
              settlement, actual balances and pending claims. This does not mark
              a trade completed.
            </p>
          )}
          {entry && (
            <p className="small-note">
              Original intent: {entry.intentId}. Request:{" "}
              {entry.requestSha256 ?? "not yet prepared"}. Verified network fee:{" "}
              {entry.actualFee ?? "not yet known"} PSY base units. Confirmed
              checkpoint: {entry.confirmedCheckpoint ?? "not yet confirmed"}.
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
