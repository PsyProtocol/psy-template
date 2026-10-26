import { useFieldFeedback, FieldErrors } from "./FieldFeedback";
import { EXAMPLE_LP_SHARES, rawShareFraction } from "./liquidityControls.mjs";
import { useEditingForm } from "../hooks/useEditingForm";
import { FormDraftNotice } from "./FormDraftNotice";
import { useMemo, useState } from "react";
import {
  previewWithdrawal,
  DEMO_POOLS,
  type WithdrawalForm,
  type WithdrawalPreview,
} from "./liquidity.mjs";
import { fullAmount, displayAmount } from "./domain.mjs";
import { Modal } from "./OrderDialog";
export function RemoveLiquidityPanel({
  onLivePlan,
}: {
  onLivePlan: (form: WithdrawalForm) => void;
}) {
  const editing = useEditingForm<WithdrawalForm>("remove", {
    pool: "2485",
    receiver: "",
    shares: "5000000000000000000",
    slippageBps: "50",
    feeCap: "5",
  });
  const { form, setForm } = editing;
  const [error, setError] = useState(""),
    [preview, setPreview] = useState<Readonly<WithdrawalPreview> | null>(null);
  const feedback = useFieldFeedback("remove", form);
  const update = (key: keyof WithdrawalForm, value: string) => {
    setError("");
    feedback.clear(key);
    setForm({ ...form, [key]: value });
  };
  const quote = useMemo(() => {
    try {
      return previewWithdrawal({ ...form, receiver: form.receiver || "12345" });
    } catch {
      return null;
    }
  }, [form]);
  return (
    <>
      <div className="product-grid">
        <form
          className="swap-panel product-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!feedback.check(e.currentTarget)) return;
            try {
              setPreview(previewWithdrawal(form));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <h2>Remove liquidity</h2>
          <FieldErrors feedback={feedback} />
          <FormDraftNotice
            {...editing}
            onReset={() => {
              editing.reset();
              feedback.reset();
              setError("");
            }}
          />
          <label className="liquidity-pool">
            Pool
            <select
              aria-label="Withdrawal pool"
              value={form.pool}
              onChange={(e) => update("pool", e.target.value)}
            >
              {DEMO_POOLS.map((id) => (
                <option key={id} value={id}>
                  AMM {id} · demo position
                </option>
              ))}
            </select>
          </label>
          <div className="position-source">
            <span>Position source</span>
            <strong>Example position · not your wallet</strong>
            <p className="small-note">
              Live LP ownership is unverified. Example shortcuts never use a
              wallet balance.
            </p>
            <button type="button" className="text-button" disabled>
              Use verified wallet position
            </button>
          </div>
          <fieldset className="share-shortcuts">
            <legend>Example position shortcuts</legend>
            {([25, 50, 75, 100] as const).map((percent) => (
              <button
                type="button"
                key={percent}
                className="secondary-button"
                aria-label={`Use ${percent}% of example LP shares`}
                onClick={() =>
                  update("shares", rawShareFraction(EXAMPLE_LP_SHARES, percent))
                }
              >
                {percent === 100 ? "Max" : `${percent}%`}
              </button>
            ))}
          </fieldset>
          <label className="liquidity-pool">
            LP shares to burn · raw units
            <input
              aria-label="Raw LP shares to remove"
              {...feedback.field("shares")}
              inputMode="numeric"
              value={form.shares}
              onChange={(e) => update("shares", e.target.value)}
            />
          </label>
          <p className="small-note">
            Fixture position: 10,000,000,000,000,000,000 raw shares. Actual LP
            ownership and share supply are unverified.
          </p>
          <div className="two-fields recipient-budget">
            <label>
              LP owner ID
              <input
                aria-label="Withdrawal owner ID"
                {...feedback.field("receiver")}
                inputMode="numeric"
                placeholder="Testnet user ID"
                value={form.receiver}
                onChange={(e) => update("receiver", e.target.value)}
              />
            </label>
            <label>
              Max slippage
              <select
                aria-label="Withdrawal max slippage"
                {...feedback.field("slippageBps")}
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
              aria-label="Withdrawal fee cap"
              {...feedback.field("feeCap")}
              inputMode="decimal"
              value={form.feeCap}
              onChange={(e) => update("feeCap", e.target.value)}
            />
          </label>
          <div className="quote-details">
            <div>
              <span>Minimum QA-A</span>
              <strong>{quote ? displayAmount(quote.minimumA) : "—"}</strong>
            </div>
            <div>
              <span>Minimum QA-B</span>
              <strong>{quote ? displayAmount(quote.minimumB) : "—"}</strong>
            </div>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button">Preview withdrawal</button>
          <button
            className="secondary-button rpc-plan-button"
            type="button"
            onClick={() => onLivePlan({ ...form })}
          >
            Prepare RPC-based withdrawal
          </button>
          <p className="form-footnote">
            No LP burn, transfer or claim is submitted.
          </p>
        </form>
        <section className="route-preview">
          <h2>Proportional withdrawal</h2>
          <p className="section-note">
            The preview reuses the existing integer withdrawal function. Outputs
            round down; the locked minimum supply and owned-share bound are
            enforced.
          </p>
          <div className="market-stat-grid">
            <div>
              <span>Estimated QA-A · demo</span>
              <strong>{quote ? fullAmount(quote.a) : "—"}</strong>
            </div>
            <div>
              <span>Estimated QA-B · demo</span>
              <strong>{quote ? fullAmount(quote.b) : "—"}</strong>
            </div>
          </div>
          <div className="recovery-note">
            Real execution needs authenticated LP ownership, current reserves,
            share supply, a dedicated removal order and verified batch
            settlement. Output tokens then require their ordinary wallet claims.
          </div>
          <p className="section-note">
            This preview is not a withdrawal request. RPC-based planning reads
            the actual position but never signs or submits. LP units are
            internal raw shares, not a token with assumed decimals.
          </p>
        </section>
      </div>
      {preview && (
        <Modal
          title="Liquidity withdrawal preview"
          onClose={() => setPreview(null)}
        >
          <p className="dialog-notice">
            Local demo quote. No LP shares have been burned or locked.
          </p>
          <dl className="terms">
            <div>
              <dt>Pool</dt>
              <dd>AMM {preview.pool} · unverified</dd>
            </div>
            <div>
              <dt>LP owner ID</dt>
              <dd>{preview.owner} · unverified</dd>
            </div>
            <div>
              <dt>Burned raw shares</dt>
              <dd>{BigInt(preview.burned).toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Minimum QA-A</dt>
              <dd>{fullAmount(preview.minimumA)}</dd>
            </div>
            <div>
              <dt>Minimum QA-B</dt>
              <dd>{fullAmount(preview.minimumB)}</dd>
            </div>
            <div>
              <dt>Input limbs</dt>
              <dd>{preview.burnedLimbs.join(" / ")}</dd>
            </div>
          </dl>
          <p className="small-note">
            A successful real settlement creates token outputs. They are not
            spendable wallet balances before claim.
          </p>
          <button className="blocked-button" disabled>
            Withdrawal unavailable
          </button>
        </Modal>
      )}
    </>
  );
}
