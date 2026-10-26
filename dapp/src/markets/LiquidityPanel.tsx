import { useMemo, useState } from "react";
import {
  previewLiquidity,
  DEMO_POOLS,
  type LiquidityForm,
  type LiquidityPreview,
} from "./liquidity.mjs";
import { fullAmount, LIVE_GATE } from "./domain.mjs";
import { Coin } from "./icons";
import { RemoveLiquidityPanel } from "./RemoveLiquidityPanel";
import { Modal } from "./OrderDialog";
const INITIAL: LiquidityForm = {
  pool: "2485",
  amountA: "10",
  amountB: "10",
  receiver: "",
  slippageBps: "50",
  feeCap: "35.0035",
};
function AddLiquidityPanel({
  onLivePlan,
}: {
  onLivePlan: (form: LiquidityForm) => void;
}) {
  const [form, setForm] = useState(INITIAL),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<Readonly<LiquidityPreview> | null>(null);
  const update = (key: keyof LiquidityForm, value: string) => {
    setError("");
    setForm({ ...form, [key]: value });
  };
  const quote = useMemo(() => {
    try {
      return previewLiquidity({
        ...form,
        receiver: form.receiver || "1717440",
      });
    } catch {
      return null;
    }
  }, [form]);
  return (
    <>
      <div className="trade-grid">
        <form
          className="swap-panel liquidity-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            try {
              setPreview(previewLiquidity(form));
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <h2>Add liquidity</h2>
          <p className="section-note">
            Supply both assets to an existing pool.
          </p>
          <label className="liquidity-pool">
            Pool
            <select
              aria-label="Liquidity pool"
              value={form.pool}
              onChange={(e) => update("pool", e.target.value)}
            >
              {DEMO_POOLS.map((id) => (
                <option key={id} value={id}>
                  AMM {id} · QA-A / QA-B · demo
                </option>
              ))}
            </select>
          </label>
          {(["A", "B"] as const).map((asset) => (
            <div key={asset}>
              <label className="field-label" htmlFor={"deposit-" + asset}>
                Deposit QA-{asset}
              </label>
              <div className="asset-input">
                <input
                  id={"deposit-" + asset}
                  inputMode="decimal"
                  autoComplete="off"
                  value={form[asset === "A" ? "amountA" : "amountB"]}
                  onChange={(e) =>
                    update(
                      asset === "A" ? "amountA" : "amountB",
                      e.target.value,
                    )
                  }
                  aria-describedby="liquidity-ratio"
                />
                <span className="asset-select">
                  <Coin asset={asset} small />
                  QA-{asset}
                </span>
              </div>
              <p className="balance-note">Balance: unverified</p>
            </div>
          ))}
          <p className="small-note" id="liquidity-ratio">
            Demo reserve ratio 1:1. Deposits must match exactly; no automatic
            excess refund.
          </p>
          <div className="two-fields recipient-budget">
            <label htmlFor="lp-owner">
              LP owner ID
              <input
                id="lp-owner"
                placeholder="Testnet user ID"
                inputMode="numeric"
                value={form.receiver}
                onChange={(e) => update("receiver", e.target.value)}
              />
            </label>
            <label>
              Max slippage
              <select
                aria-label="Liquidity max slippage"
                value={form.slippageBps}
                onChange={(e) => update("slippageBps", e.target.value)}
              >
                <option value="10">0.1%</option>
                <option value="50">0.5%</option>
                <option value="100">1.0%</option>
              </select>
            </label>
          </div>
          <label className="liquidity-pool">
            Fee cap · test PSY
            <input
              aria-label="Liquidity fee cap"
              inputMode="decimal"
              value={form.feeCap}
              onChange={(e) => update("feeCap", e.target.value)}
            />
          </label>
          <p className="small-note">
            Your budget; fee coverage and owner identity are unverified.
          </p>
          <div className="quote-details">
            <div>
              <span>Estimated LP shares · raw units</span>
              <strong>
                {quote ? BigInt(quote.minted).toLocaleString("en-US") : "—"}
              </strong>
            </div>
            <div>
              <span>Minimum LP shares · raw units</span>
              <strong>
                {quote ? BigInt(quote.minimum).toLocaleString("en-US") : "—"}
              </strong>
            </div>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" type="submit">
            Preview liquidity
          </button>
          <button
            type="button"
            className="secondary-button rpc-plan-button"
            onClick={() => onLivePlan({ ...form })}
          >
            Prepare RPC-based plan
          </button>
          <p className="form-footnote">
            Preview only. No deposits, signatures or orders are sent.
          </p>
        </form>
        <section className="route-preview" aria-labelledby="lp-flow">
          <h2 id="lp-flow">How liquidity is added</h2>
          <p className="section-note">
            Contract flow reference. This screen does not execute these steps.
          </p>
          <ol className="liquidity-steps">
            <li>
              <strong>Verify the pool and funding</strong>
              <p>
                Authenticate network, assets, pool, vault, SD-key and fresh
                state. Fund both token inputs and authorize fees.
              </p>
            </li>
            <li>
              <strong>Open a liquidity order</strong>
              <p>
                The owner binds both deposits and minimum shares. The contract
                credits shares to that authenticated owner; it does not accept
                an arbitrary LP recipient.
              </p>
            </li>
            <li>
              <strong>Freeze and settle the batch</strong>
              <p>
                Executor and SD-key enforce the accepted set, exact reserve
                ratio, U124 arithmetic, calls and minimum shares.
              </p>
            </li>
            <li>
              <strong>Confirm shares or recover deposits</strong>
              <p>
                LP shares update in the pool ledger after settlement confirms.
                An unfilled order must exit under contract rules before actual
                refundable deposits can be claimed.
              </p>
            </li>
          </ol>
          <div className="recovery-note">
            Live deposits and withdrawals are not connected. Pool reserves, LP
            supply, positions and ownership have not been read or verified.
          </div>
          <h2 className="liquidity-position">Your liquidity</h2>
          <p className="section-note">
            Connect and verify the live service to read LP positions. No
            position or yield is implied by this preview.
          </p>
        </section>
      </div>
      {preview && (
        <Modal title="Liquidity preview" onClose={() => setPreview(null)}>
          <p className="dialog-notice">
            Local demo quote. No signed intent, funding or liquidity order
            exists.
          </p>
          <dl className="terms">
            <div>
              <dt>Pool reference</dt>
              <dd>AMM {preview.pool} · unverified</dd>
            </div>
            <div>
              <dt>Deposit QA-A</dt>
              <dd>{fullAmount(preview.a)}</dd>
            </div>
            <div>
              <dt>Deposit QA-B</dt>
              <dd>{fullAmount(preview.b)}</dd>
            </div>
            <div>
              <dt>Estimated LP shares</dt>
              <dd>{preview.minted} raw units</dd>
            </div>
            <div>
              <dt>Minimum LP shares</dt>
              <dd>{preview.minimum} raw units</dd>
            </div>
            <div>
              <dt>LP owner ID</dt>
              <dd>{preview.owner} · unverified</dd>
            </div>
            <div>
              <dt>Fee cap · test PSY</dt>
              <dd>{fullAmount(preview.feeCap, 9)}</dd>
            </div>
          </dl>
          <details>
            <summary>Exact dual Felt amounts</summary>
            <p>QA-A: {preview.aLimbs.join(" / ")}</p>
            <p>QA-B: {preview.bLimbs.join(" / ")}</p>
            <p>LP shares: {preview.mintedLimbs.join(" / ")}</p>
          </details>
          <p className="small-note">
            LP shares are internal pool units, not a wallet FT with assumed
            decimals. A live quote requires fresh authenticated reserves and
            total share supply.
          </p>
          <button className="blocked-button" disabled>
            Add liquidity unavailable
          </button>
          <p className="small-note">{LIVE_GATE.reason}</p>
        </Modal>
      )}
    </>
  );
}

export function LiquidityPanel(props: {
  onLivePlan: (form: LiquidityForm) => void;
}) {
  const [mode, setMode] = useState("add");
  return (
    <>
      <div
        className="route-tabs liquidity-action-tabs"
        aria-label="Liquidity action"
      >
        <button
          aria-pressed={mode === "add"}
          className={mode === "add" ? "selected" : ""}
          onClick={() => setMode("add")}
        >
          Add liquidity
        </button>
        <button
          aria-pressed={mode === "remove"}
          className={mode === "remove" ? "selected" : ""}
          onClick={() => setMode("remove")}
        >
          Remove liquidity
        </button>
      </div>
      <div hidden={mode !== "add"}>
        <AddLiquidityPanel {...props} />
      </div>
      <div hidden={mode !== "remove"}>
        <RemoveLiquidityPanel />
      </div>
    </>
  );
}
