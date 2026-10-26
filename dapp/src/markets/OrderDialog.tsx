import { useEffect, useRef, type ReactNode } from "react";
import {
  DEMO_ASSETS,
  STAGES,
  fullAmount,
  canCancel,
  remainingAsset,
  remainingUnits,
  LIVE_GATE,
  type Preview,
  type DemoOrder,
} from "./domain.mjs";
import { Timeline } from "./RoutePreview";
import { Icon } from "./icons";
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // Explicit boundaries also cover WebViews whose native dialog lets
    // Shift+Tab from the first control escape to the document body.
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !d) return;
      const controls = [
        ...d.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex]:not([tabindex="-1"])',
        ),
      ].filter((e) => e.getClientRects().length > 0);
      const first = controls[0],
        last = controls.at(-1);
      if (!first) {
        event.preventDefault();
        d.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === d ||
          !d.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    d?.addEventListener("keydown", trap);
    return () => {
      d?.removeEventListener("keydown", trap);
      d?.close();
      if (before?.isConnected) before.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="market-dialog"
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        if (
          e.target === e.currentTarget &&
          (e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom)
        )
          onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Terms({ item }: { item: Preview }) {
  return (
    <dl className="terms">
      <div>
        <dt>Input amount</dt>
        <dd>
          {fullAmount(item.inputUnits)} {DEMO_ASSETS[item.sell].symbol}
        </dd>
      </div>
      <div>
        <dt>Estimated output · demo</dt>
        <dd>
          {fullAmount(item.outputUnits)} {DEMO_ASSETS[item.buy].symbol}
        </dd>
      </div>
      <div>
        <dt>Minimum received · demo</dt>
        <dd>
          {fullAmount(item.minimumUnits)} {DEMO_ASSETS[item.buy].symbol}
        </dd>
      </div>
      <div>
        <dt>Recipient user ID</dt>
        <dd>{item.receiver}</dd>
      </div>
      <div>
        <dt>Fee cap · test PSY</dt>
        <dd>{fullAmount(item.feeCapUnits, 9)} PSY</dd>
      </div>
      <div>
        <dt>Draft expiry</dt>
        <dd>{item.deadlineMinutes} minutes</dd>
      </div>
    </dl>
  );
}
export function PreviewDialog({
  preview,
  onClose,
  onSave,
}: {
  preview: Preview;
  onClose: () => void;
  onSave: () => void;
}) {
  const middle = preview.sell === "A" ? "B" : "A";
  return (
    <Modal title="Preview order" onClose={onClose}>
      <p className="dialog-notice">
        Local demo draft, not a signed intent or an on-chain order.
      </p>
      <p className="dialog-route">
        {DEMO_ASSETS[preview.sell].symbol} → {DEMO_ASSETS[middle].symbol}
        {preview.mode === "double"
          ? ` → ${DEMO_ASSETS[preview.sell].symbol}`
          : ""}
      </p>
      <Terms item={preview} />
      <p className="small-note">
        Minutes are a local draft preference, not an on-chain deadline. Fee
        coverage, pool state, asset identity and wallet network remain
        unverified.
      </p>
      {preview.mode === "double" && (
        <div className="recovery-note">
          Each hop confirms separately. Claim actual intermediate assets before
          the second pool. Later failures return remaining assets; completed
          trades cannot be reversed at their original price.
        </div>
      )}
      <button className="primary-button" onClick={onSave}>
        Add demo order
      </button>
      <button className="blocked-button" disabled aria-describedby="live-block">
        Live submission unavailable
      </button>
      <p id="live-block" className="small-note">
        {LIVE_GATE.reason}
      </p>
    </Modal>
  );
}
export type DemoAction =
  | "advance"
  | "cancel"
  | "claim"
  | "claim_middle"
  | "resolve_original"
  | "resolve_refund";
export function OrderDialog({
  order,
  onClose,
  onAction,
}: {
  order: DemoOrder;
  onClose: () => void;
  onAction: (a: DemoAction) => void;
}) {
  const terminal = ["claimed", "refunded"].includes(order.stage),
    refund = ["refundable", "refunded", "cancel_requested"].includes(
      order.stage,
    ),
    middle = order.stage === "middle_outbox";
  return (
    <Modal title="Order details" onClose={onClose}>
      <div className="detail-identity">
        <strong>{order.id}</strong>
        <span className={`state state-${order.stage}`}>
          {STAGES[order.stage].label}
        </span>
      </div>
      <p className="dialog-notice">
        Demo record only. All progress, claims and refunds change local state
        only.
      </p>
      <Terms item={order} />
      {refund && (
        <div className="recovery-note">
          <strong>
            {order.stage === "refunded"
              ? "Simulated claim complete"
              : "Returnable assets"}
            ：{fullAmount(remainingUnits(order))}{" "}
            {DEMO_ASSETS[remainingAsset(order)].symbol}
          </strong>
          <p>
            {order.completedHops === 1
              ? "The first hop filled. Return actual intermediate assets, not the original input at its previous price."
              : "No fills completed. Return the actual input."}{" "}
            This is not an on-chain balance or refund receipt.
          </p>
        </div>
      )}
      {middle && (
        <div className="recovery-note">
          The first-hop output is still pending claim:{" "}
          {DEMO_ASSETS[order.sell === "A" ? "B" : "A"].symbol}; it cannot yet
          fund the second hop.
        </div>
      )}
      <div className="detail-stages">
        <Timeline order={order} />
      </div>
      <details className="raw-details">
        <summary>Exact amounts & original request</summary>
        <p>
          Original request: {order.requestIdentity}(local ID only, no on-chain
          hash)
        </p>
        <p>Input dual Felt: {order.inputLimbs.join(" / ")}</p>
        <p>Completed hops: {order.completedHops} · No real fees incurred</p>
        <p>
          Local history:
          {order.history.map((h) => STAGES[h.stage].label).join(" → ")}
        </p>
      </details>
      <div className="dialog-actions">
        {["claimable", "refundable"].includes(order.stage) ? (
          <button className="primary-button" onClick={() => onAction("claim")}>
            Simulate claim{" "}
            {
              DEMO_ASSETS[
                order.stage === "refundable" ? remainingAsset(order) : order.buy
              ].symbol
            }
          </button>
        ) : middle ? (
          <button
            className="primary-button"
            onClick={() => onAction("claim_middle")}
          >
            Simulate controller intermediate claim
          </button>
        ) : order.stage === "unknown" ? (
          <button
            className="primary-button"
            onClick={() => onAction("resolve_original")}
          >
            Simulate original receipt: confirmed
          </button>
        ) : !terminal ? (
          <button
            className="primary-button"
            onClick={() => onAction("advance")}
          >
            {order.stage === "cancel_requested"
              ? "Simulate confirmed exit"
              : "Simulate next stage"}
          </button>
        ) : (
          <p className="terminal-note">
            <Icon name="check" />
            Local demo complete. No transaction was sent.
          </p>
        )}
        {!terminal &&
          !["claimable", "refundable", "cancel_requested", "unknown"].includes(
            order.stage,
          ) && (
            <button
              className="secondary-button"
              disabled={!canCancel(order)}
              onClick={() => onAction("cancel")}
              aria-describedby="cancel-help"
            >
              Simulate cancellation request
            </button>
          )}
        {[
          "frozen",
          "proving",
          "broadcast",
          "unknown",
          "second_frozen",
          "second_proving",
          "second_broadcast",
        ].includes(order.stage) && (
          <button
            className="secondary-button"
            onClick={() => onAction("resolve_refund")}
          >
            Simulate original batch result: refund
          </button>
        )}
      </div>
      {!terminal && !canCancel(order) && (
        <p id="cancel-help" className="small-note">
          {order.stage === "unknown"
            ? "Reconcile unknown results using the original identity. Never re-sign or pay twice."
            : "Frozen members cannot be removed. Await the original batch result or complete required claims."}
        </p>
      )}
    </Modal>
  );
}
