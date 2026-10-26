import { useEffect, useRef, useState } from "react";
import {
  createPublicMarketClient,
  type MarketSnapshot,
  type MarketRequest,
  type PlanRecord,
} from "../../../market-client/client.mjs";
import { readWalletContext } from "../../../market-client/readWallet.mjs";
import expectedRpcConfig from "../../../market-client/reviewed/staging-qa-20261026/rpc-config.json";
import registry from "../../../market-client/reviewed/staging-qa-20261026/registry.json";
import pin from "../../../market-client/reviewed/staging-qa-20261026/client-pin.json";
import type { DraftForm } from "./domain.mjs";
import type { LiquidityForm } from "./liquidity.mjs";
import { fullAmount } from "./domain.mjs";
import { Modal } from "./OrderDialog";
const client = createPublicMarketClient({
  registry,
  registryHash: pin.registrySha256,
});
export type LiveDraft =
  | { kind: "swap"; form: DraftForm }
  | { kind: "add"; form: LiquidityForm };
export function LiveAccess({
  account,
  draft,
  onClose,
}: {
  account: string | null;
  draft: LiveDraft | null;
  onClose: () => void;
}) {
  const [user, setUser] = useState(""),
    [market, setMarket] = useState("2485"),
    [checkpoints, setCheckpoints] = useState("64"),
    [status, setStatus] = useState("Not checked"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [state, setState] = useState<MarketSnapshot | null>(null),
    [plan, setPlan] = useState<PlanRecord | null>(null),
    [originalLeaf, setOriginalLeaf] = useState(""),
    [sourceCheckpoint, setSourceCheckpoint] = useState(""),
    [receipt, setReceipt] = useState("");
  const generation = useRef(0),
    pending = useRef(false);
  useEffect(() => {
    generation.current++;
    setUser("");
    setState(null);
    setPlan(null);
    setReceipt("");
    setError("");
    setStatus(
      account
        ? "Account context changed; check again"
        : "No wallet identity verified; read-only access available",
    );
  }, [account]);
  useEffect(() => {
    generation.current++;
    setPlan(null);
    setError("");
  }, [draft]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const userId = () => {
    if (!/^[1-9]\d{0,7}$/.test(user) || BigInt(user) >= 16777216n)
      throw Error("Enter a testnet user ID from 1 to 16777215");
    return Number(user);
  };
  const run = async (action: () => Promise<() => void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const token = generation.current;
    try {
      const apply = await action();
      if (token === generation.current) apply();
    } catch (e) {
      if (token === generation.current) {
        setState(null);
        setPlan(null);
        setReceipt("");
        setError((e as Error).message);
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const editUser = (value: string) => {
    generation.current++;
    setUser(value);
    setStatus("User context changed; read again");
    setState(null);
    setPlan(null);
    setReceipt("");
    setError("");
  };
  const prepare = () =>
    void run(async () => {
      if (!draft) throw Error("Select a swap or liquidity draft first");
      const owner = userId(),
        f = draft.form;
      if (!/^[1-9]\d{0,2}$/.test(checkpoints) || Number(checkpoints) > 128)
        throw Error("Plan validity must be 1..128 checkpoints");
      if (draft.kind === "swap" && draft.form.mode !== "single")
        throw Error(
          "Two-pool execution needs the independent controller workflow; it is not a single-pool plan",
        );
      const target = draft.kind === "add" ? Number(draft.form.pool) : 2485;
      const m = registry.markets.find((m) => m.marketId === target);
      if (!m) throw Error("Unreviewed pool");
      const request: MarketRequest = {
        kind: draft.kind,
        marketId: target,
        userId: owner,
        recipientId: f.receiver ? Number(f.receiver) : owner,
        amountA: draft.kind === "add" ? draft.form.amountA : draft.form.amount,
        amountB: draft.kind === "add" ? draft.form.amountB : "",
        assetIn:
          draft.kind === "swap" && draft.form.sell === "B"
            ? m.assets[1].contractId
            : m.assets[0].contractId,
        slippageBps: Number(f.slippageBps),
        validForCheckpoints: Number(checkpoints),
        feeCap: f.feeCap,
      };
      const result = await client.plan(request);
      return () => {
        setPlan(result);
        setState(result.snapshot);
        setStatus("Unsigned RPC-based plan checked; trading unavailable");
      };
    });
  const check = () =>
    void run(async () => {
      const result = await client.status();
      return () =>
        setStatus(
          result.capabilities.financialSubmission
            ? "Unexpected write capability"
            : "Read-only gateway connected; chain state not checked",
        );
    });
  const read = () =>
    void run(async () => {
      const result = await client.snapshot(Number(market), userId());
      return () => {
        setState(result);
        setStatus(
          "Reviewed bindings matched RPC observations; no state proof verified",
        );
      };
    });
  const inspectWallet = () =>
    void run(async () => {
      if (!account || !window.psy)
        throw Error("Connect the browser wallet first");
      const context = await readWalletContext(
        window.psy,
        account,
        expectedRpcConfig,
      );
      return () => {
        setUser(String(context.userId));
        setState(null);
        setPlan(null);
        setStatus(
          "Wallet-reported user and endpoints match; SDK, key and full UPS still unverified",
        );
      };
    });
  const readReceipt = () =>
    void run(async () => {
      if (
        !/^[1-9]\d{0,9}$/.test(sourceCheckpoint) ||
        Number(sourceCheckpoint) >= 4294967296
      )
        throw Error("Enter the original source checkpoint");
      const result = await client.receipt({
        userId: userId(),
        endUserLeafHash: originalLeaf,
        minCheckpoint: Number(sourceCheckpoint),
      });
      return () =>
        setReceipt(
          result.status === "included"
            ? "Exact historical receipt matched. Verify resulting balances separately."
            : "Original result unresolved. Do not re-sign, pay again or replace the request.",
        );
    });
  const fields = (
    <>
      <label>
        Public user ID
        <input
          aria-label="Live public user ID"
          inputMode="numeric"
          value={user}
          placeholder="Testnet user ID"
          onChange={(e) => editUser(e.target.value)}
        />
      </label>
      <p className="small-note">
        A public ID is for reads and unsigned planning. It is not wallet
        authorization.
      </p>
    </>
  );
  return (
    <>
      <details className="live-access">
        <summary>Live connection · read-only</summary>
        <p className="small-note">
          Psy testnet · pinned QA registry {pin.registrySha256.slice(0, 12)}… ·
          runtime and full UPS not attested. Demo quotes stay separate from RPC
          data.
        </p>
        <p role="status">{status}</p>
        <div className="live-actions">
          <button className="secondary-button" disabled={busy} onClick={check}>
            Check gateway
          </button>
          <button
            className="secondary-button"
            disabled={busy || !account}
            onClick={inspectWallet}
          >
            Read wallet identity
          </button>
        </div>
        {fields}
        <label>
          Reviewed pool
          <select
            aria-label="Live reviewed pool"
            value={market}
            onChange={(e) => {
              generation.current++;
              setMarket(e.target.value);
              setState(null);
              setPlan(null);
              setReceipt("");
            }}
          >
            {registry.markets.map((m) => (
              <option key={m.marketId} value={m.marketId}>
                AMM {m.marketId}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" disabled={busy} onClick={read}>
          {busy ? "Reading…" : "Read pool & account"}
        </button>
        {state && (
          <div className="live-state">
            <p>
              RPC snapshot at checkpoint {state.checkpoint}. Observed data, not
              a cryptographic state proof.
            </p>
            {state.assets.map((a) => (
              <p key={a.contractId}>
                {a.symbol}: balance {fullAmount(a.balance, a.decimals)} ·
                pending claim {fullAmount(a.claimableFromVault, a.decimals)}
              </p>
            ))}
            <p>
              LP position:{" "}
              {BigInt(state.pool.ownedShares).toLocaleString("en-US")} raw
              units. Wallet nonce: {state.user.nonce}.
            </p>
          </div>
        )}
        <details>
          <summary>Reconcile an original request</summary>
          <label>
            End-user leaf hash
            <input
              aria-label="Original end-user leaf hash"
              value={originalLeaf}
              onChange={(e) => {
                generation.current++;
                setOriginalLeaf(e.target.value);
                setReceipt("");
              }}
              placeholder="64 lowercase hex characters"
            />
          </label>
          <label>
            Original source checkpoint
            <input
              aria-label="Original source checkpoint"
              inputMode="numeric"
              value={sourceCheckpoint}
              onChange={(e) => {
                generation.current++;
                setSourceCheckpoint(e.target.value);
                setReceipt("");
              }}
            />
          </label>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={readReceipt}
          >
            Read original receipt
          </button>
          {receipt && <p role="status">{receipt}</p>}
        </details>
        <p className="small-note">
          Financial submission is unavailable. No direct signing fallback. The
          Executor service has not been attached to this UI.
        </p>
        {error && !draft && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </details>
      {draft && (
        <Modal title="Prepare RPC-based plan" onClose={onClose}>
          <p className="dialog-notice">
            Reads real configured RPC state and prepares exact calls. This never
            signs, funds, admits or submits an order.
          </p>
          {fields}
          <label>
            Plan validity · checkpoints
            <input
              aria-label="Live plan validity checkpoints"
              inputMode="numeric"
              value={checkpoints}
              onChange={(e) => {
                generation.current++;
                setCheckpoints(e.target.value);
                setPlan(null);
              }}
            />
          </label>
          <p className="small-note">
            Separate from demo draft minutes. This AMM pays/credits the
            authenticated owner; an arbitrary recipient requires another
            authorized transfer.
          </p>
          <button className="primary-button" disabled={busy} onClick={prepare}>
            {busy ? "Reading and checking…" : "Build unsigned plan"}
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {plan && (
            <>
              <p>Record {plan.recordId.slice(0, 16)}…</p>
              <p className="small-note">{plan.plan.next}</p>
              <details>
                <summary>Exact planned calls</summary>
                <pre>{JSON.stringify(plan.plan, null, 2)}</pre>
              </details>
            </>
          )}
          <button className="blocked-button" disabled>
            Financial submission unavailable
          </button>
        </Modal>
      )}
    </>
  );
}
