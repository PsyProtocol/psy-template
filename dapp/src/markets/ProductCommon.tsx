import type {
  CommonProductForm,
  ProductPreview,
  ProductRecord,
} from "./productDrafts.mjs";
import { fullAmount } from "./domain.mjs";
import { Modal } from "./OrderDialog";
import { draftState } from "./activity.mjs";
const DRAFT_LABELS = {
  draft: "Local draft",
  expired: "Draft expired",
  cancelled: "Cancelled locally",
};
export const MARKET_NAMES = {
  orderbook: "Orderbook",
  curve: "Bonding Curve",
  nft: "NFT Market",
};
export function ProductFields({
  form,
  onChange,
}: {
  form: CommonProductForm;
  onChange: (key: keyof CommonProductForm, value: string) => void;
}) {
  return (
    <>
      <div className="two-fields recipient-budget">
        <label>
          Demo user ID
          <input
            aria-label="Demo user ID"
            inputMode="numeric"
            value={form.userId}
            onChange={(e) => onChange("userId", e.target.value)}
          />
        </label>
        <label>
          Draft expiry
          <select
            aria-label="Market draft expiry"
            value={form.deadlineMinutes}
            onChange={(e) => onChange("deadlineMinutes", e.target.value)}
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </label>
      </div>
      <label className="liquidity-pool">
        Fee cap · test PSY
        <input
          aria-label="Market fee cap"
          inputMode="decimal"
          value={form.feeCap}
          onChange={(e) => onChange("feeCap", e.target.value)}
        />
      </label>
      <p className="small-note">
        Draft preferences only. Balances, fees and identity are unverified.
        Minutes are not an on-chain deadline.
      </p>
    </>
  );
}
export function ProductBoundary() {
  return (
    <p className="market-boundary">
      Local fixtures only. No live route, signing, submission or claims are
      connected for this market.
    </p>
  );
}
export function ProductPreviewDialog({
  preview,
  onClose,
  onSave,
  error,
}: {
  preview: ProductPreview;
  onClose: () => void;
  onSave: () => void;
  error?: string;
}) {
  return (
    <Modal title={`${MARKET_NAMES[preview.market]} preview`} onClose={onClose}>
      <p className="dialog-notice">
        Unsigned local fixture draft. This is not a chain order or a reserved
        fill.
      </p>
      <dl className="terms">
        <div>
          <dt>Action</dt>
          <dd>{preview.action}</dd>
        </div>
        <div>
          <dt>Demo owner</dt>
          <dd>{preview.owner}</dd>
        </div>
        <div>
          <dt>
            {preview.market === "curve" && preview.action === "buy"
              ? "Deposit cap"
              : "Offered asset"}
          </dt>
          <dd>
            {preview.spend.asset.startsWith("QA-")
              ? fullAmount(preview.spend.units)
              : preview.spend.units}{" "}
            {preview.spend.asset}
          </dd>
        </div>
        <div>
          <dt>
            {preview.action === "list" ? "Listing price" : "Minimum / target"}
          </dt>
          <dd>
            {preview.receive.asset.startsWith("QA-")
              ? fullAmount(preview.receive.units)
              : preview.receive.units}{" "}
            {preview.receive.asset}
          </dd>
        </div>
        <div>
          <dt>Fee cap</dt>
          <dd>{fullAmount(preview.feeCap, 9)} test PSY · unverified</dd>
        </div>
        <div>
          <dt>Draft expires</dt>
          <dd>
            {new Date(preview.expiresAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · local preference
          </dd>
        </div>
      </dl>
      <div className="recovery-note">{preview.note}</div>
      <details>
        <summary>Exact amounts and asset references</summary>
        <pre className="product-json">
          {JSON.stringify(preview.terms, null, 2)}
        </pre>
        <p className="small-note">
          All references are fixture data. Contract, vault, SD-key and chain
          nonce are not assigned.
        </p>
      </details>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" onClick={onSave}>
        Save local draft
      </button>
      <button className="blocked-button" disabled>
        Live {preview.action === "list" ? "listing" : "submission"} unavailable
      </button>
    </Modal>
  );
}
export function ProductDrafts({
  records,
  onOpen,
  onCancel,
  onExport,
  compact = false,
  now,
  emptyText = "No local drafts yet. Preview an order to save one.",
}: {
  records: ProductRecord[];
  onOpen: (id: string) => void;
  onCancel: (id: string) => void;
  onExport: () => void;
  compact?: boolean;
  now: number;
  emptyText?: string;
}) {
  return (
    <section className="product-drafts">
      <div className="section-heading">
        <h2>
          {compact ? "Local drafts" : "Market drafts"}{" "}
          <span>Never submitted</span>
        </h2>
        <button className="text-button" onClick={onExport}>
          Export drafts
        </button>
      </div>
      <p className="section-note">
        Saving or cancelling a local draft does not create, cancel or refund an
        on-chain order.
      </p>
      {records.length ? (
        <div
          className="table-scroll"
          role="region"
          aria-label="Local market drafts, scroll horizontally"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Draft / market</th>
                <th>Intent</th>
                <th>Offered asset</th>
                <th>State</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.id}</strong>
                    <small>{MARKET_NAMES[r.preview.market]}</small>
                  </td>
                  <td>
                    {r.preview.action} · {r.preview.receive.asset}
                  </td>
                  <td>
                    {r.preview.spend.asset.startsWith("QA-")
                      ? fullAmount(r.preview.spend.units)
                      : r.preview.spend.units}{" "}
                    {r.preview.spend.asset}
                  </td>
                  <td>
                    <span className="status-badge">
                      {DRAFT_LABELS[draftState(r, now)]}
                    </span>
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => onOpen(r.id)}
                      aria-label={`Open ${r.id}`}
                    >
                      Details
                    </button>
                    {r.status === "draft" && (
                      <button
                        className="text-button"
                        onClick={() => onCancel(r.id)}
                        aria-label={`Cancel ${r.id} locally`}
                      >
                        Cancel draft
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-state">{emptyText}</p>
      )}
    </section>
  );
}
export function ProductDetailDialog({
  record,
  now,
  onClose,
  onMarket,
}: {
  record: ProductRecord;
  now: number;
  onClose: () => void;
  onMarket: () => void;
}) {
  const preview = record.preview;
  return (
    <Modal
      title={`${MARKET_NAMES[preview.market]} draft details`}
      onClose={onClose}
    >
      <p className="dialog-notice">
        Local draft only. No funds, NFT escrow, proof or receipt exists.
      </p>
      <p>{preview.note}</p>
      <dl className="terms">
        <div>
          <dt>Draft ID</dt>
          <dd>{record.id}</dd>
        </div>
        <div>
          <dt>Current local state</dt>
          <dd>{DRAFT_LABELS[draftState(record, now)]}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{preview.owner} · unverified</dd>
        </div>
        <div>
          <dt>Offered asset</dt>
          <dd>
            {preview.spend.asset.startsWith("QA-")
              ? fullAmount(preview.spend.units)
              : preview.spend.units}{" "}
            {preview.spend.asset}
          </dd>
        </div>
        <div>
          <dt>Minimum / target</dt>
          <dd>
            {preview.receive.asset.startsWith("QA-")
              ? fullAmount(preview.receive.units)
              : preview.receive.units}{" "}
            {preview.receive.asset}
          </dd>
        </div>
        <div>
          <dt>Local expiry</dt>
          <dd>{new Date(preview.expiresAt).toLocaleString("en-US")}</dd>
        </div>
      </dl>
      <button className="secondary-button" onClick={onMarket}>
        Open {MARKET_NAMES[preview.market]}
      </button>
      <p className="small-note">
        Opens the market form without submitting or reactivating this draft.
        Expiry and local cancellation do not release on-chain funds.
      </p>
      <details>
        <summary>Original draft data</summary>
        <pre className="product-json">{JSON.stringify(preview, null, 2)}</pre>
      </details>
    </Modal>
  );
}
