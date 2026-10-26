import { positionOverview } from "./positionOverview.mjs";
import type { ProductRecord, ProductMarket } from "./productDrafts.mjs";
import type { DemoOrder } from "./domain.mjs";
export function MarketPositions({
  drafts,
  orders,
  now,
  onMarket,
  onDrafts,
  onAmmRead,
}: {
  drafts: ProductRecord[];
  orders: DemoOrder[];
  now: number;
  onMarket: (v: "liquidity" | ProductMarket) => void;
  onDrafts: (v: ProductMarket) => void;
  onAmmRead: () => void;
}) {
  return (
    <section
      className="market-positions"
      aria-labelledby="market-positions-title"
    >
      <div className="section-heading">
        <h2 id="market-positions-title">Positions by market</h2>
        <span className="fixture-tag">Holdings not verified</span>
      </div>
      <p className="section-note">
        Unknown is not zero. Local drafts do not lock funds or prove ownership;
        the cards below never aggregate them into a portfolio balance. Confirmed
        outputs still require their separate claims.
      </p>
      <div className="market-position-grid">
        {positionOverview(drafts, orders, now).map((card) => (
          <article
            key={card.market}
            className="market-position-card"
            aria-label={`${card.name} position boundary`}
          >
            <h3>{card.name}</h3>
            <span className="position-source-label">{card.source}</span>
            <dl>
              <div>
                <dt>{card.position}</dt>
                <dd>Not verified</dd>
              </div>
              {card.market === "amm" ? (
                <div>
                  <dt>Local simulation</dt>
                  <dd>
                    {card.demoOrders} demo orders · {card.demoPending} pending
                    outputs
                  </dd>
                </div>
              ) : (
                <>
                  <div>
                    <dt>Open local drafts</dt>
                    <dd>{card.local.open} · never submitted</dd>
                  </div>
                  <div>
                    <dt>Saved history</dt>
                    <dd>
                      {card.local.expired} expired · {card.local.cancelled}{" "}
                      cancelled locally
                    </dd>
                  </div>
                </>
              )}
            </dl>
            <p className="small-note">
              {card.market === "amm"
                ? "Use the AMM reader for fresh checkpoint observations. RPC reads alone are not proof of an authorized position."
                : "No reviewed on-chain position feed is attached. Drafts cannot establish live orders, balances, escrow or NFT ownership."}
            </p>
            <div className="position-actions">
              <button
                className="secondary-button"
                onClick={() => onMarket(card.route)}
              >
                {card.market === "amm" ? "Open liquidity" : `Open ${card.name}`}
              </button>
              {card.market === "amm" ? (
                <button className="text-button" onClick={onAmmRead}>
                  Open AMM account reader
                </button>
              ) : (
                <button
                  className="text-button"
                  onClick={() => onDrafts(card.market as ProductMarket)}
                >
                  Review {card.name} drafts
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
