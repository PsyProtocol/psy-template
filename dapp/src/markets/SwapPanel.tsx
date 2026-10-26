import { useMemo, useState, type ReactNode } from "react";
import {
  DEMO_ASSETS,
  previewDraft,
  displayAmount,
  fullAmount,
  type DraftForm,
  type Preview,
} from "./domain.mjs";
import { Coin, Icon } from "./icons";
export const INITIAL_FORM: DraftForm = {
  mode: "single",
  sell: "A",
  amount: "4.611686018427387921",
  receiver: "",
  slippageBps: "50",
  deadlineMinutes: "30",
  feeCap: "35.0035",
};
export function SwapPanel({
  form,
  setForm,
  onPreview,
  account,
  onLivePlan,
  editingNotice,
}: {
  editingNotice?: ReactNode;
  form: DraftForm;
  setForm: (v: DraftForm) => void;
  onPreview: (v: Preview) => void;
  account: string | null;
  onLivePlan: (form: DraftForm) => void;
}) {
  const [error, setError] = useState("");
  const buy =
    form.mode === "double" ? form.sell : form.sell === "A" ? "B" : "A";
  const quote = useMemo(() => {
    try {
      return previewDraft({ ...form, receiver: form.receiver || "1717440" });
    } catch {
      return null;
    }
  }, [form]);
  const update = (key: keyof DraftForm, value: string) => {
    setError("");
    setForm({ ...form, [key]: value });
  };
  return (
    <form
      className="swap-panel"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onPreview(previewDraft(form));
          setError("");
        } catch (e) {
          setError((e as Error).message);
        }
      }}
      noValidate
    >
      {editingNotice}
      <div className="route-tabs" aria-label="Swap route">
        {(["single", "double"] as const).map((mode) => (
          <button
            type="button"
            key={mode}
            aria-pressed={form.mode === mode}
            className={form.mode === mode ? "selected" : ""}
            onClick={() => update("mode", mode)}
          >
            {mode === "single" ? "Single-pool AMM" : "Two-pool route"}
          </button>
        ))}
      </div>
      <label className="field-label" htmlFor="pay-amount">
        You pay
      </label>
      <div className="asset-input">
        <input
          id="pay-amount"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          value={form.amount}
          onChange={(e) => update("amount", e.target.value)}
          aria-describedby="amount-note"
        />
        <button
          type="button"
          className="asset-select"
          aria-label="Change input asset"
          onClick={() => update("sell", form.sell === "A" ? "B" : "A")}
        >
          <Coin asset={form.sell} small />
          <span>{DEMO_ASSETS[form.sell].symbol}</span>
          <Icon
            name="chevron"
            size={14}
            style={{ transform: "rotate(90deg)" }}
          />
        </button>
      </div>
      <p className="balance-note" id="amount-note">
        Balance: unverified
      </p>
      <div className="direction-divider">
        <button
          type="button"
          className="direction-button"
          aria-label="Reverse assets"
          onClick={() => update("sell", form.sell === "A" ? "B" : "A")}
        >
          <Icon name="swap" size={18} />
        </button>
      </div>
      <label className="field-label" htmlFor="receive-amount">
        Estimated output <span className="muted">· Demo quote</span>
      </label>
      <div className="asset-input">
        <output
          id="receive-amount"
          title={quote ? fullAmount(quote.outputUnits) : ""}
        >
          {quote ? displayAmount(quote.outputUnits) : "—"}
        </output>
        <span className="asset-select">
          <Coin asset={buy} small />
          <span>{DEMO_ASSETS[buy].symbol}</span>
        </span>
      </div>
      <p className="balance-note">Balance: unverified</p>
      <div className="two-fields">
        <label>
          Max slippage
          <select
            aria-label="Max slippage"
            value={form.slippageBps}
            onChange={(e) => update("slippageBps", e.target.value)}
          >
            <option value="10">0.1%</option>
            <option value="50">0.5%</option>
            <option value="100">1.0%</option>
          </select>
        </label>
        <label>
          Expiry
          <select
            aria-label="Draft expiry"
            value={form.deadlineMinutes}
            onChange={(e) => update("deadlineMinutes", e.target.value)}
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </label>
      </div>
      <div className="two-fields recipient-budget">
        <label htmlFor="receiver">
          Recipient
          <input
            id="receiver"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Testnet user ID"
            value={form.receiver}
            onChange={(e) => update("receiver", e.target.value)}
          />
        </label>
        <label htmlFor="fee-cap">
          Fee cap · test PSY
          <input
            id="fee-cap"
            inputMode="decimal"
            value={form.feeCap}
            onChange={(e) => update("feeCap", e.target.value)}
            aria-describedby="fee-note"
          />
        </label>
      </div>
      {account &&
        /^[1-9]\d{0,7}$/.test(account) &&
        BigInt(account) < 16777216n && (
          <button
            type="button"
            className="text-button use-account"
            onClick={() => update("receiver", account)}
          >
            Use connected account ID (identity unverified)
          </button>
        )}
      <p id="fee-note" className="small-note">
        Your budget; coverage of the full route is unverified.
      </p>
      <div className="quote-details">
        <div>
          <span>Minimum received (demo quote)</span>
          <strong title={quote ? fullAmount(quote.minimumUnits) : ""}>
            {quote ? displayAmount(quote.minimumUnits) : "—"}{" "}
            {DEMO_ASSETS[buy].symbol}
          </strong>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" type="submit">
        Preview order
      </button>
      <button
        type="button"
        className="secondary-button rpc-plan-button"
        disabled={form.mode !== "single"}
        onClick={() => onLivePlan({ ...form })}
      >
        Prepare RPC-based plan
      </button>
      <p className="small-note">
        Read-only planning for single-pool swaps. The two-pool controller is not
        connected to this UI.
      </p>
      <p className="form-footnote">
        Preview never signs or sends a transaction
      </p>
    </form>
  );
}
