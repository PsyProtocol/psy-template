import {WalletExecution} from "./WalletExecution";
import { useEffect, useRef, useState } from "react";
import {
  createPublicMarketClient,
  type MarketSnapshot,
  type MarketRequest,
  type PlanRecord,
} from "../../../market-client/client.mjs";
import { readWalletContext } from "../../../market-client/readWallet.mjs";
import expectedRpcConfig from "../../../market-client/reviewed/mainnet-beta-amm-20261027-v2/rpc-config.json";
import registry from "../../../market-client/reviewed/mainnet-beta-amm-20261027-v2/registry.json";
import pin from "../../../market-client/reviewed/mainnet-beta-amm-20261027-v2/client-pin.json";
import type { DraftForm } from "./domain.mjs";
import { ObservedAccount } from "./ObservedAccount";
import type { WithdrawalForm } from "./liquidity.mjs";
import type { LiquidityForm } from "./liquidity.mjs";
import { fullAmount } from "./domain.mjs";
import { Modal } from "./OrderDialog";
const client = createPublicMarketClient({
  registry,
  registryHash: pin.registrySha256,
});
export type LiveDraft =
  | { kind: "swap"; form: DraftForm }
  | { kind: "add"; form: LiquidityForm }
  | { kind: "remove"; form: WithdrawalForm };
export function LiveAccess({
  account,
  draft,
  onClose,
  page,
  readerRequest = 0,
}: {
  page: string;
  readerRequest?: number;
  account: string | null;
  draft: LiveDraft | null;
  onClose: () => void;
}) {
  const [user, setUser] = useState(""),
    [market, setMarket] = useState(String(registry.markets[0].marketId)),
    [checkpoints, setCheckpoints] = useState("64"),
    [status, setStatus] = useState("Not checked"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [state, setState] = useState<MarketSnapshot | null>(null),
    [plan, setPlan] = useState<PlanRecord | null>(null),
    [originalLeaf, setOriginalLeaf] = useState(""),
    [sourceCheckpoint, setSourceCheckpoint] = useState(""),
    [receipt, setReceipt] = useState(""),
    [actionRequest, setActionRequest] = useState<MarketRequest | null>(null),
    [actionFee, setActionFee] = useState("5"),
    [observedNow, setObservedNow] = useState(Date.now());
  const modalOpen = Boolean(draft || actionRequest);
  const readerRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!readerRequest || !readerRef.current) return;
    readerRef.current.open = true;
    readerRef.current
      .querySelector<HTMLInputElement>(
        'input[aria-label="Live public user ID"]',
      )
      ?.focus();
  }, [readerRequest]);
  useEffect(() => {
    if (!state) return;
    const timer = window.setInterval(() => setObservedNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state]);
  const generation = useRef(0),
    pending = useRef(false);
  useEffect(() => {
    generation.current++;
    setUser("");
    setState(null);
    setPlan(null);
    setReceipt("");
    setActionRequest(null);
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
  const closePlan = () => {
    generation.current++;
    setActionRequest(null);
    setPlan(null);
    setError("");
    onClose();
  };
  const prepare = () =>
    void run(async () => {
      if (!draft && !actionRequest) throw Error("Select an action first");
      const owner = actionRequest?.userId ?? userId();
      if (!/^[1-9]\d{0,2}$/.test(checkpoints) || Number(checkpoints) > 128)
        throw Error("Plan validity must be 1..128 checkpoints");
      if (draft?.kind === "swap" && draft.form.mode !== "single")
        throw Error(
          "Two-pool execution needs the independent controller workflow; it is not a single-pool plan",
        );
      if (actionRequest) {
        const result = await client.plan({
          ...actionRequest,
          feeCap: actionFee,
          validForCheckpoints: Number(checkpoints),
        });
        return () => {
          setPlan(result);
          setState(result.snapshot);
          setObservedNow(Date.now());
          setStatus(
            "Unsigned action plan checked; submission remains unavailable",
          );
        };
      }
      if (!draft) throw Error("No form selected");
      const f = draft.form;
      const target =
        draft.kind === "add" || draft.kind === "remove"
          ? Number(draft.form.pool)
          : registry.markets[0].marketId;
      const m = registry.markets.find((m) => m.marketId === target);
      if (!m) throw Error("Unreviewed pool");
      const request: MarketRequest = {
        kind: draft.kind,
        marketId: target,
        userId: owner,
        recipientId: f.receiver ? Number(f.receiver) : owner,
        amountA:
          draft.kind === "add"
            ? draft.form.amountA
            : draft.kind === "remove"
              ? draft.form.shares
              : draft.form.amount,
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
        setObservedNow(Date.now());
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
        setObservedNow(Date.now());
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
      <details ref={readerRef} className="live-access" open={page === "assets"}>
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
        {error && !modalOpen && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </details>
      {state && (
        <ObservedAccount
          snapshot={state}
          now={observedNow}
          onRefresh={read}
          onPlan={(request) => {
            generation.current++;
            setActionRequest(request);
            setPlan(null);
            setError("");
          }}
        />
      )}
      {modalOpen && (
        <Modal title="Prepare RPC-based plan" onClose={closePlan}>
          <p className="dialog-notice">
            Reads real configured RPC state and prepares exact calls. This never
            signs, funds, admits or submits an order.
          </p>
          {actionRequest ? (
            <>
              <p>
                Action: {actionRequest.kind} · public user{" "}
                {actionRequest.userId} · AMM {actionRequest.marketId}. The
                original owner and selected vault are fixed.
              </p>
              <label>
                Maximum wallet network fee · test PSY
                <input
                  aria-label="Action network fee cap"
                  inputMode="decimal"
                  value={actionFee}
                  onChange={(e) => {
                    generation.current++;
                    setActionFee(e.target.value);
                    setPlan(null);
                    setError("");
                  }}
                />
              </label>
            </>
          ) : (
            fields
          )}
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
              {plan.plan.withdrawal && (
                <dl className="terms">
                  <div>
                    <dt>Raw LP shares</dt>
                    <dd>{plan.plan.withdrawal.burned}</dd>
                  </div>
                  <div>
                    <dt>Minimum QA-A</dt>
                    <dd>{fullAmount(plan.plan.withdrawal.minimumA)}</dd>
                  </div>
                  <div>
                    <dt>Minimum QA-B</dt>
                    <dd>{fullAmount(plan.plan.withdrawal.minimumB)}</dd>
                  </div>
                </dl>
              )}
              <details>
                <summary>Exact planned calls</summary>
                <pre>{JSON.stringify(plan.plan, null, 2)}</pre>
              </details>
            </>
          )}
          {plan && <WalletExecution key={`${account}:${plan.recordId}`} account={account} record={plan}/> }
        </Modal>
      )}
    </>
  );
}
