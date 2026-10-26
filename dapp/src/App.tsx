import { useEffect, useState } from "react";
import { usePsy } from "./hooks/usePsy";
import { WorkbenchShell, DemoNotice, type View } from "./markets/Shell";
import { SwapPanel, INITIAL_FORM } from "./markets/SwapPanel";
import { RoutePreview } from "./markets/RoutePreview";
import { OrderTable } from "./markets/OrderTable";
import {
  OrderDialog,
  PreviewDialog,
  type DemoAction,
} from "./markets/OrderDialog";
import { LiveAccess, type LiveDraft } from "./markets/LiveAccess";
import { LiquidityPanel } from "./markets/LiquidityPanel";
import { AssetsPanel } from "./markets/AssetsPanel";
import { useProductDrafts } from "./hooks/useProductDrafts";
import { OrderbookPanel } from "./markets/OrderbookPanel";
import { CurvePanel } from "./markets/CurvePanel";
import { NftMarketPanel } from "./markets/NftMarketPanel";
import {
  ProductPreviewDialog,
  ProductDrafts,
  ProductDetailDialog,
} from "./markets/ProductCommon";
import type { ProductPreview } from "./markets/productDrafts.mjs";
import { Icon } from "./markets/icons";
import {
  STORAGE_KEY,
  seedOrders,
  hydrateOrders,
  serializeOrders,
  makeDemoOrder,
  demoAction,
  type DemoOrder,
  type Preview,
  type DraftForm,
} from "./markets/domain.mjs";

function initialRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return {
      orders: raw === null ? seedOrders() : hydrateOrders(raw),
      issue: "",
    };
  } catch {
    return {
      orders: [] as DemoOrder[],
      issue:
        "Local demo records could not be read. Originals are preserved; autosave is paused and this session uses memory only.",
    };
  }
}
const VIEW_COPY: Record<View, [string, string]> = {
  swap: ["Swap", "Set your amount, minimum received and recipient."],
  liquidity: ["Liquidity", "Preview deposits, LP shares and proportional withdrawals."],
  orderbook: ["Orderbook", "Set whole-order offers and minimum returns."],
  curve: [
    "Bonding Curve",
    "Trade integer lots with a progressive price bound.",
  ],
  nft: ["NFT Market", "Review exact NFT listings or prepare a listing draft."],
  orders: [
    "Orders",
    "Review local drafts and clearly labelled AMM demo activity.",
  ],
  assets: [
    "Assets & claims",
    "Track balances, pending claims and actual refund assets.",
  ],
};
function hashView(): View {
  const key = location.hash.slice(1);
  return Object.hasOwn(VIEW_COPY, key) ? (key as View) : "swap";
}
export default function App() {
  const products = useProductDrafts();
  const [productPreview, setProductPreview] = useState<ProductPreview | null>(
      null,
    ),
    [productDetail, setProductDetail] = useState<ProductPreview | null>(null),
    [productError, setProductError] = useState(""),
    [productFilter, setProductFilter] = useState("all");
  const wallet = usePsy(),
    [view, setView] = useState<View>(hashView),
    [form, setForm] = useState<DraftForm>(INITIAL_FORM),
    [initial] = useState(initialRecords),
    [orders, setOrders] = useState(initial.orders),
    [storageIssue, setStorageIssue] = useState(initial.issue),
    [preview, setPreview] = useState<Preview | null>(null),
    [liveDraft, setLiveDraft] = useState<LiveDraft | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [toast, setToast] = useState(""),
    [filter, setFilter] = useState("all");
  useEffect(() => {
    const changed = () => {
      if (location.hash !== "#main-content") setView(hashView());
    };
    window.addEventListener("hashchange", changed);
    window.addEventListener("popstate", changed);
    return () => {
      window.removeEventListener("hashchange", changed);
      window.removeEventListener("popstate", changed);
    };
  }, []);
  useEffect(() => {
    if (storageIssue) return;
    try {
      localStorage.setItem(STORAGE_KEY, serializeOrders(orders));
    } catch {
      setStorageIssue(
        "Browser storage is unavailable. This demo session uses memory only.",
      );
    }
  }, [orders, storageIssue]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  const navigate = (v: View) => {
      setView(v);
      if (location.hash !== "#" + v) history.pushState(null, "", "#" + v);
    },
    order = orders.find((o) => o.id === selected);
  const save = () => {
    if (!preview) return;
    try {
      const made = makeDemoOrder(preview, orders);
      setOrders([made, ...orders]);
      setPreview(null);
      setToast("Demo order added. No transaction was signed or sent.");
    } catch (e) {
      setToast((e as Error).message);
    }
  };
  const act = (action: DemoAction) => {
    if (!order) return;
    try {
      const updated = demoAction(order, action);
      setOrders(orders.map((o) => (o.id === order.id ? updated : o)));
      setToast("Local demo state updated. The wallet was not called.");
    } catch (e) {
      setToast((e as Error).message);
    }
  };
  const exportRecords = () => {
    const blob = new Blob([serializeOrders(orders)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "psy-markets-demo-orders-v1.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast(
      "Demo records exported. The file contains no keys or real transaction proofs.",
    );
  };
  const openProduct = (preview: ProductPreview) => {
    setProductError("");
    setProductPreview(preview);
  };
  const saveProduct = () => {
    if (!productPreview) return;
    try {
      products.add(productPreview);
      setProductPreview(null);
      setToast("Local draft saved. Nothing was signed, funded or submitted.");
    } catch (e) {
      setProductError((e as Error).message);
    }
  };
  const cancelProduct = (id: string) => {
    products.cancel(id);
    setToast("Draft cancelled locally. No chain order or funds were changed.");
  };
  const exportProduct = () => {
    const url = URL.createObjectURL(
        new Blob([products.exportText()], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "psy-markets-local-drafts-v1.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast(
      "Local market drafts exported. No keys or transaction proofs are included.",
    );
  };
  const productRows = products.records.filter((r) =>
    ["orderbook", "curve", "nft"].includes(view)
      ? r.preview.market === view
      : productFilter === "all" || r.preview.market === productFilter,
  );
  const productTable = (compact = false) => (
    <ProductDrafts
      records={compact ? productRows.slice(0, 5) : productRows}
      onOpen={setProductDetail}
      onCancel={cancelProduct}
      onExport={exportProduct}
      compact={compact}
    />
  );
  const filtered =
    filter === "pending"
      ? orders.filter((o) => ["claimable", "refundable"].includes(o.stage))
      : filter === "active"
        ? orders.filter((o) => !["claimed", "refunded"].includes(o.stage))
        : orders;
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to main content
      </a>
      <WorkbenchShell
        view={view}
        onView={navigate}
        account={wallet.account}
        connecting={wallet.connecting}
        onConnect={() => {
          void wallet.connect();
        }}
      >
        <div className="page-heading">
          <h1>{VIEW_COPY[view][0]}</h1>
          <p>{VIEW_COPY[view][1]}</p>
        </div>
        <DemoNotice />
        {!["orderbook", "curve", "nft"].includes(view) && (
          <LiveAccess
            account={wallet.account}
            draft={liveDraft}
            onClose={() => setLiveDraft(null)}
          />
        )}
        {wallet.error && (
          <p className="form-error" role="alert">
            {wallet.status === "missing"
              ? "psy-wallet was not detected. Install and unlock the browser extension, then retry."
              : wallet.error}
          </p>
        )}
        {wallet.account && (
          <p className="wallet-scope-note">
            Wallet connected. Network and on-chain identity remain unverified;
            live submission is paused.
          </p>
        )}
        {products.issue && (
          <p className="storage-note" role="status">
            {products.issue}
          </p>
        )}
        {storageIssue && (
          <p className="storage-note" role="status">
            {storageIssue}
          </p>
        )}
        {view === "swap" ? (
          <>
            <div className="trade-grid">
              <SwapPanel
                form={form}
                setForm={setForm}
                onPreview={setPreview}
                account={wallet.account}
                onLivePlan={(form) => setLiveDraft({ kind: "swap", form })}
              />
              <RoutePreview form={form} />
            </div>
            <OrderTable
              orders={orders.slice(0, 3)}
              onSelect={setSelected}
              onAll={() => navigate("orders")}
              recent
            />
          </>
        ) : view === "liquidity" ? (
          <LiquidityPanel
            onLivePlan={(form) => setLiveDraft({ kind: "add", form })}
          />
        ) : view === "orderbook" || view === "curve" || view === "nft" ? (
          <>
            {view === "orderbook" ? (
              <OrderbookPanel onPreview={openProduct} />
            ) : view === "curve" ? (
              <CurvePanel onPreview={openProduct} />
            ) : (
              <NftMarketPanel onPreview={openProduct} />
            )}{" "}
            {productTable(true)}
            <button
              className="text-button all-drafts-link"
              onClick={() => navigate("orders")}
            >
              View all market drafts
            </button>
          </>
        ) : view === "orders" ? (
          <>
            <label className="draft-filter">
              Draft market
              <select
                aria-label="Filter draft market"
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
              >
                <option value="all">All markets</option>
                <option value="orderbook">Orderbook</option>
                <option value="curve">Bonding Curve</option>
                <option value="nft">NFT Market</option>
              </select>
            </label>
            {productTable()}
            <h2 className="amm-activity-title">AMM demo activity</h2>
            <div className="order-toolbar">
              <label>
                Filter orders
                <select
                  aria-label="Filter orders"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All demo orders</option>
                  <option value="pending">Claims & refunds</option>
                  <option value="active">In progress</option>
                </select>
              </label>
              <button className="secondary-button" onClick={exportRecords}>
                <Icon name="download" size={16} />
                Export demo records
              </button>
            </div>
            <OrderTable orders={filtered} onSelect={setSelected} />
          </>
        ) : (
          <>
            <AssetsPanel orders={orders} onSelect={setSelected} />
            <section className="other-market-claims">
              <h2>Other market assets</h2>
              <p className="section-note">
                Orderbook, Curve and NFT drafts hold no assets. Live positions,
                NFT deliveries and claims are not connected.
              </p>
              <button
                className="text-button"
                onClick={() => navigate("orders")}
              >
                Review local market drafts
              </button>
            </section>
          </>
        )}
        <footer className="app-footer">
          QA FT are test assets, separate from existing pUSDT. Demo quotes do
          not authorize execution.
        </footer>
      </WorkbenchShell>
      {productPreview && (
        <ProductPreviewDialog
          preview={productPreview}
          onClose={() => setProductPreview(null)}
          onSave={saveProduct}
          error={productError}
        />
      )}
      {productDetail && (
        <ProductDetailDialog
          preview={productDetail}
          onClose={() => setProductDetail(null)}
        />
      )}
      {preview && (
        <PreviewDialog
          preview={preview}
          onClose={() => setPreview(null)}
          onSave={save}
        />
      )}{" "}
      {order && (
        <OrderDialog
          order={order}
          onClose={() => setSelected(null)}
          onAction={act}
        />
      )}{" "}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
