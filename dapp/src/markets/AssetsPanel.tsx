import {
  DEMO_ASSETS,
  displayAmount,
  fullAmount,
  remainingAsset,
  remainingUnits,
  pendingTotals,
  type DemoOrder,
  type AssetKey,
} from "./domain.mjs";
import { Coin } from "./icons";
export function AssetsPanel({
  orders,
  onSelect,
}: {
  orders: DemoOrder[];
  onSelect: (id: string) => void;
}) {
  const pending = orders.filter((o) =>
    ["claimable", "refundable"].includes(o.stage),
  );
  return (
    <>
      <section className="assets-section">
        <h2>Asset overview</h2>
        <p className="section-note">
          Wallet balances have not been read or verified. Pending amounts below
          summarize local demo records only.
        </p>
        <div className="asset-list">
          {(["A", "B"] as const).map((key) => {
            const total = pendingTotals(orders)[key];
            return (
              <div className="asset-row" key={key}>
                <Coin asset={key} />
                <div>
                  <strong>{DEMO_ASSETS[key].symbol}</strong>
                  <small>QA test FT · 18 decimals</small>
                </div>
                <div>
                  <small>On-chain balance</small>
                  <strong>Unverified</strong>
                </div>
                <div>
                  <small>Demo claimable</small>
                  <strong
                    title={
                      total.withinU124
                        ? fullAmount(total.amount)
                        : "Demo total exceeds single-account U124 range; this is not an on-chain balance"
                    }
                  >
                    {total.withinU124
                      ? displayAmount(total.amount)
                      : "Exceeds account range"}{" "}
                    {DEMO_ASSETS[key].symbol}
                  </strong>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="claims-section">
        <h2>Claims & refunds</h2>
        <p className="section-note">
          Confirmed pending outputs are not spendable balances. Simulated claims
          do not call the wallet.
        </p>
        {pending.length ? (
          pending.map((o) => {
            const key: AssetKey =
              o.stage === "refundable" ? remainingAsset(o) : o.buy;
            return (
              <div className="claim-row" key={o.id}>
                <Coin asset={key} small />
                <div>
                  <strong>{o.id}</strong>
                  <small>
                    {o.stage === "refundable"
                      ? "Actual remaining asset refund"
                      : "Final output claim"}{" "}
                    · Demo only
                  </small>
                </div>
                <strong
                  title={fullAmount(
                    o.stage === "refundable"
                      ? remainingUnits(o)
                      : o.outputUnits,
                  )}
                >
                  {displayAmount(
                    o.stage === "refundable"
                      ? remainingUnits(o)
                      : o.outputUnits,
                  )}{" "}
                  {DEMO_ASSETS[key].symbol}
                </strong>
                <button className="text-button" onClick={() => onSelect(o.id)}>
                  View details
                </button>
              </div>
            );
          })
        ) : (
          <p className="empty-state">No demo assets to claim.</p>
        )}
      </section>
    </>
  );
}
