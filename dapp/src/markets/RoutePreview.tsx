import type { DraftForm, DemoOrder } from "./domain.mjs";
import { STAGES, DEMO_ASSETS } from "./domain.mjs";
import { Coin, Icon } from "./icons";
const steps = [
  ["Submit order", "Confirm the terms and queue the order for a batch."],
  [
    "Freeze batch",
    "Freeze accepted members and process in deterministic order.",
  ],
  [
    "Generate proof",
    "Verify calls, fees and state changes, then submit to the network.",
  ],
  [
    "Network confirmation",
    "Reconcile the original request. Never pay again while the result is unknown.",
  ],
  [
    "Claim funds",
    "Confirmed pending outputs become spendable only after a claim.",
  ],
];
export function Timeline({ order }: { order?: DemoOrder }) {
  const current = order ? STAGES[order.stage].step : 0;
  return (
    <ol className="timeline">
      {steps.map(([title, help], i) => (
        <li
          key={title}
          className={
            i === current ? "step-current" : i < current ? "step-complete" : ""
          }
        >
          <span className="step-dot">
            {i < current && <Icon name="check" size={11} />}
          </span>
          <div>
            <strong>{title}</strong>
            <p>{help}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
export function RoutePreview({ form }: { form: DraftForm }) {
  const middle = form.sell === "A" ? "B" : "A";
  return (
    <section className="route-preview" aria-labelledby="route-heading">
      <h2 id="route-heading">Route</h2>
      <p className="section-note">
        Local demo route. Pool state and quotes are unverified on-chain.
      </p>
      <div className="route-line">
        <div className="token-node">
          <Coin asset={form.sell} />
          <strong>{DEMO_ASSETS[form.sell].symbol}</strong>
        </div>
        <span className="route-connector">
          <Icon name="arrow" />
        </span>
        <div className="pool-node">
          <span>AMM 2485</span>
          <small>QA pool · 18 decimals</small>
        </div>
        <span className="route-connector">
          <Icon name="arrow" />
        </span>
        <div className="token-node">
          <Coin asset={middle} />
          <strong>{DEMO_ASSETS[middle].symbol}</strong>
        </div>
      </div>
      {form.mode === "double" && (
        <div className="route-line second-hop">
          <div className="token-node">
            <Coin asset={middle} />
            <strong>{DEMO_ASSETS[middle].symbol}</strong>
          </div>
          <span className="route-connector">
            <Icon name="arrow" />
          </span>
          <div className="pool-node">
            <span>AMM 2486</span>
            <small>After intermediate claim</small>
          </div>
          <span className="route-connector">
            <Icon name="arrow" />
          </span>
          <div className="token-node">
            <Coin asset={form.sell} />
            <strong>{DEMO_ASSETS[form.sell].symbol}</strong>
          </div>
        </div>
      )}
      {form.mode === "double" && (
        <p className="route-meta">
          Each hop confirms separately. Claim intermediate assets before use.
        </p>
      )}
      <div className="timeline-section">
        <h2>From order to receipt</h2>
        <p className="section-note">
          {form.mode === "double"
            ? "Two pools use separate transactions. Cross-vault atomic rollback is not provided."
            : "Confirmation and claiming are separate. Broadcast success does not mean funds have arrived."}
        </p>
        <Timeline />
      </div>
    </section>
  );
}
