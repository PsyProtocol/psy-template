import {
  DEMO_ASSETS,
  displayAmount,
  STAGES,
  remainingAsset,
  remainingUnits,
  type DemoOrder,
} from "./domain.mjs";
import { Icon } from "./icons";
export function OrderTable({
  orders,
  onSelect,
  onAll,
  recent = false,
}: {
  orders: DemoOrder[];
  onSelect: (id: string) => void;
  onAll?: () => void;
  recent?: boolean;
}) {
  return (
    <section
      className={`orders-section${recent ? " orders-recent" : ""}`}
      aria-labelledby={recent ? "recent-heading" : "orders-heading"}
    >
      <div className="section-heading">
        <h2 id={recent ? "recent-heading" : "orders-heading"}>
          {recent ? "Recent orders" : "Order history"}{" "}
          <span>Demo records only</span>
        </h2>
        {onAll && (
          <button className="text-button" onClick={onAll}>
            View all <Icon name="chevron" size={14} />
          </button>
        )}
      </div>
      <div
        className="table-scroll"
        role="region"
        aria-label="Demo orders, scroll horizontally"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Route</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <strong>{o.id}</strong>
                  <small>
                    {new Date(o.createdAt).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · Local
                  </small>
                </td>
                <td>
                  <span className="table-route">
                    {DEMO_ASSETS[o.sell].symbol}
                    <Icon name="arrow" size={13} />
                    {o.mode === "double" ? "Two pools" : "AMM 2485"}
                    <Icon name="arrow" size={13} />
                    {DEMO_ASSETS[o.buy].symbol}
                  </span>
                </td>
                <td>
                  <span>
                    {displayAmount(o.inputUnits, 18, 4)}{" "}
                    {DEMO_ASSETS[o.sell].symbol}
                  </span>
                  <small>
                    {o.stage === "refundable" || o.stage === "refunded"
                      ? `Return ${displayAmount(remainingUnits(o), 18, 4)} ${DEMO_ASSETS[remainingAsset(o)].symbol}`
                      : `Est. ${displayAmount(o.outputUnits, 18, 4)} ${DEMO_ASSETS[o.buy].symbol}`}
                  </small>
                </td>
                <td>
                  <span className={`state state-${o.stage}`}>
                    {STAGES[o.stage].label}
                  </span>
                </td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => onSelect(o.id)}
                    aria-label={`View details ${o.id}`}
                  >
                    View details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orders.length && (
          <p className="empty-state">
            No matching demo orders. Preview and add an order on the Swap page.
          </p>
        )}
      </div>
    </section>
  );
}
