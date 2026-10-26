import { useMemo, useState } from "react";
import {
  BOOK_ROWS,
  rankBookRows,
  decimalPrice,
  previewBook,
  type BookForm,
  type ProductPreview,
} from "./productDrafts.mjs";
import { fullAmount, displayAmount } from "./domain.mjs";
import { ProductFields, ProductBoundary } from "./ProductCommon";
const INITIAL: BookForm = {
  side: "buy",
  amount: "10",
  limitPrice: "1.1",
  userId: "12345",
  feeCap: "5",
  deadlineMinutes: "30",
};
export function OrderbookPanel({
  onPreview,
}: {
  onPreview: (p: ProductPreview) => void;
}) {
  const [form, setForm] = useState(INITIAL),
    [error, setError] = useState("");
  const update = (key: keyof BookForm, value: string) => {
    setError("");
    setForm({ ...form, [key]: value });
  };
  const quote = useMemo(() => {
    try {
      return previewBook(form);
    } catch {
      return null;
    }
  }, [form]);
  const ranked = rankBookRows(BOOK_ROWS);
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
              onPreview(previewBook(form));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <h2>Limit order</h2>
          <div className="route-tabs" aria-label="Order side">
            {(["buy", "sell"] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={side === form.side}
                className={side === form.side ? "selected" : ""}
                onClick={() => update("side", side)}
              >
                {side === "buy" ? "Buy QA-A" : "Sell QA-A"}
              </button>
            ))}
          </div>
          <label className="liquidity-pool">
            {form.side === "buy"
              ? "Minimum QA-A to receive"
              : "QA-A offered · whole order"}
            <input
              aria-label="Orderbook QA-A amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => update("amount", e.target.value)}
            />
          </label>
          <label className="liquidity-pool">
            Limit price · QA-B per QA-A
            <input
              aria-label="Orderbook limit price"
              inputMode="decimal"
              value={form.limitPrice}
              onChange={(e) => update("limitPrice", e.target.value)}
            />
          </label>
          <div className="quote-details">
            <div>
              <span>
                {form.side === "buy"
                  ? "QA-B offered · spent in full if matched"
                  : "Minimum QA-B received"}
              </span>
              <strong>
                {quote
                  ? displayAmount(
                      form.side === "buy"
                        ? quote.spend.units
                        : quote.receive.units,
                    )
                  : "—"}
              </strong>
            </div>
          </div>
          <p className="small-note">
            Whole orders only. Both parties receive the complete counter-offer;
            no partial fill or maker-price change refund.
          </p>
          <ProductFields form={form} onChange={update} />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button">Preview limit order</button>
          <p className="form-footnote">
            Preview never signs or submits an order.
          </p>
        </form>
        <section className="orderbook-depth">
          <div className="section-heading">
            <h2>Example orderbook</h2>
            <span className="fixture-tag">Fixed demo snapshot</span>
          </div>
          <p className="section-note">
            QA-A / QA-B · individual whole orders, not aggregated live depth.
          </p>
          {(["ask", "bid"] as const).map((side) => (
            <section key={side} className="book-side">
              <h3>
                {side === "ask"
                  ? "Asks · lowest price first"
                  : "Bids · highest price first"}
              </h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Price B / A</th>
                      <th>QA-A</th>
                      <th>QA-B</th>
                      <th>Use</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked
                      .filter((r) => r.side === side)
                      .map((row) => (
                        <tr key={row.id}>
                          <td
                            className={side === "ask" ? "ask-ink" : "bid-ink"}
                          >
                            {decimalPrice(row.quote, row.base)}
                          </td>
                          <td title={fullAmount(row.base)}>
                            {displayAmount(row.base)}
                          </td>
                          <td title={fullAmount(row.quote)}>
                            {displayAmount(row.quote)}
                          </td>
                          <td>
                            <button
                              className="text-button"
                              type="button"
                              onClick={() => {
                                setError("");
                                setForm({
                                  ...form,
                                  side: side === "ask" ? "buy" : "sell",
                                  amount: fullAmount(row.base),
                                  limitPrice: decimalPrice(
                                    row.quote,
                                    row.base,
                                    18,
                                  ),
                                });
                              }}
                              aria-label={`Use ${row.id} terms`}
                            >
                              Use terms
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <div className="recovery-note">
            Within an accepted batch: price priority, then order checkpoint,
            then owner ID. Settlement selects the earliest compatible whole
            pair. A better price alone does not guarantee matching size.
          </div>
          <p className="section-note">
            An unmatched live order may carry. Real cancellation waits for the
            original batch or lawful epoch closure before funds can be returned
            and claimed.
          </p>
        </section>
      </div>
    </>
  );
}
