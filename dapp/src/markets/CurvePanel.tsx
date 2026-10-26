import { useEditingForm } from "../hooks/useEditingForm";
import { FormDraftNotice } from "./FormDraftNotice";
import { useMemo, useState } from "react";
import {
  CURVE,
  curvePoints,
  previewCurve,
  type CurveForm,
  type ProductPreview,
} from "./productDrafts.mjs";
import { fullAmount, displayAmount } from "./domain.mjs";
import { ProductFields, ProductBoundary } from "./ProductCommon";
const INITIAL: CurveForm = {
  side: "buy",
  lots: "10",
  slippageBps: "50",
  userId: "12345",
  feeCap: "5",
  deadlineMinutes: "30",
};
export function CurvePanel({
  onPreview,
}: {
  onPreview: (p: ProductPreview) => void;
}) {
  const editing = useEditingForm("curve", INITIAL);
  const { form, setForm } = editing;
  const [error, setError] = useState("");
  const update = (key: keyof CurveForm, value: string) => {
    setError("");
    setForm({ ...form, [key]: value });
  };
  const quote = useMemo(() => {
      try {
        return previewCurve(form);
      } catch {
        return null;
      }
    }, [form]),
    points = curvePoints();
  const x = (sold: number) => 44 + (sold / CURVE.cap) * 476,
    y = (price: string) =>
      180 -
      (Number((BigInt(price) * 10000n) / BigInt(points.at(-1)!.price)) /
        10000) *
        140;
  const path = points
      .map((p, i) => `${i ? "L" : "M"}${x(p.sold)},${y(p.price)}`)
      .join(" "),
    current = String(
      BigInt(CURVE.base) + BigInt(CURVE.step) * BigInt(CURVE.sold),
    );
  return (
    <>
      <ProductBoundary />
      <div className="product-grid">
        <form
          className="swap-panel product-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            try {
              onPreview(previewCurve(form));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <h2>Trade curve lots</h2>
          <FormDraftNotice
            {...editing}
            onReset={() => {
              editing.reset();
              setError("");
            }}
          />
          <div className="route-tabs" aria-label="Curve direction">
            {(["buy", "sell"] as const).map((side) => (
              <button
                type="button"
                key={side}
                aria-pressed={form.side === side}
                className={form.side === side ? "selected" : ""}
                onClick={() => update("side", side)}
              >
                {side === "buy" ? "Buy QA-A" : "Sell QA-A"}
              </button>
            ))}
          </div>
          <label className="liquidity-pool">
            Whole lots · 1 lot = 1 QA-A
            <input
              aria-label="Curve lots"
              inputMode="numeric"
              value={form.lots}
              onChange={(e) => update("lots", e.target.value)}
            />
          </label>
          <p className="small-note">
            Demo position: {CURVE.ownedLots} lots. Real holdings are unverified.
          </p>
          <label className="liquidity-pool">
            Price tolerance
            <select
              aria-label="Curve price tolerance"
              value={form.slippageBps}
              onChange={(e) => update("slippageBps", e.target.value)}
            >
              <option value="10">0.1%</option>
              <option value="50">0.5%</option>
              <option value="100">1.0%</option>
            </select>
          </label>
          <div className="quote-details">
            <div>
              <span>
                Estimated {form.side === "buy" ? "cost" : "output"} · QA-B
              </span>
              <strong>
                {quote ? displayAmount(String(quote.terms.quote)) : "—"}
              </strong>
            </div>
            <div>
              <span>
                {form.side === "buy" ? "Deposit cap" : "Minimum received"} ·
                QA-B
              </span>
              <strong>
                {quote ? displayAmount(String(quote.terms.limit)) : "—"}
              </strong>
            </div>
          </div>
          <p className="small-note">
            Integer-lot progressive pricing. Earlier orders change sold lots;
            your bound decides execution or refund.
          </p>
          <ProductFields form={form} onChange={update} />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button">Preview curve order</button>
          <p className="form-footnote">No funding or trade is submitted.</p>
        </form>
        <section className="curve-overview">
          <div className="section-heading">
            <h2>Progressive price</h2>
            <span className="fixture-tag">Fixed demo curve</span>
          </div>
          <p className="section-note">
            Price per next lot in QA-B · this is a pricing function, not price
            history.
          </p>
          <svg
            className="curve-chart"
            viewBox="0 0 550 225"
            role="img"
            aria-labelledby="curve-chart-title curve-chart-description"
          >
            <title id="curve-chart-title">
              Demo bonding curve price by sold lots
            </title>
            <desc id="curve-chart-description">
              Linear next-lot price rises from {fullAmount(CURVE.base)} to{" "}
              {fullAmount(points.at(-1)!.price)} QA-B. Current example: 200 sold
              lots. Graduation threshold: 800 lots.
            </desc>
            <path d="M44 25V185H525" className="chart-axis" />
            <path d="M44 110H525M44 40H525" className="chart-grid" />
            <path d={path} className="chart-line" />
            <path
              d={`M${x(CURVE.threshold)} 25V185`}
              className="chart-threshold"
            />
            <circle
              cx={x(CURVE.sold)}
              cy={y(current)}
              r="5"
              className="chart-point"
            />
            <text x="44" y="207">
              0
            </text>
            <text x="252" y="207">
              Sold lots
            </text>
            <text x="493" y="207">
              1,000
            </text>
            <text x={x(CURVE.threshold) - 66} y="20">
              Graduation threshold
            </text>
          </svg>
          <div className="market-stat-grid">
            <div>
              <span>Next-lot price · demo</span>
              <strong>{fullAmount(current)} QA-B</strong>
            </div>
            <div>
              <span>Sold / cap · demo</span>
              <strong>
                {CURVE.sold} / {CURVE.cap} lots
              </strong>
            </div>
          </div>
          <h3>Graduation progress</h3>
          <progress
            value={CURVE.sold}
            max={CURVE.threshold}
            aria-label="Demo graduation progress"
          />
          <p className="section-note">
            {CURVE.sold} of {CURVE.threshold} lots · 25% of the demo graduation
            threshold.
          </p>
          <div className="recovery-note">
            Reaching the threshold does not automatically move liquidity into an
            AMM. Graduation and any AMM handoff require their dedicated verified
            on-chain workflow.
          </div>
          <details>
            <summary>Exact demo pricing parameters</summary>
            <dl className="terms">
              <div>
                <dt>Base per lot</dt>
                <dd>{fullAmount(CURVE.base)} QA-B</dd>
              </div>
              <div>
                <dt>Increment per lot</dt>
                <dd>{fullAmount(CURVE.step)} QA-B</dd>
              </div>
              <div>
                <dt>Token units per lot</dt>
                <dd>{CURVE.unit} raw QA-A units</dd>
              </div>
            </dl>
          </details>
        </section>
      </div>
    </>
  );
}
