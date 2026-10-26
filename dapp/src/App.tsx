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
function hashView(): View {
  return location.hash === "#liquidity"
    ? "liquidity"
    : location.hash === "#orders"
      ? "orders"
      : location.hash === "#assets"
        ? "assets"
        : "swap";
}
export default function App() {
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
    const changed = () => setView(hashView());
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
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
      history.replaceState(null, "", "#" + v);
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
  const filtered =
    filter === "pending"
      ? orders.filter((o) => ["claimable", "refundable"].includes(o.stage))
      : filter === "active"
        ? orders.filter((o) => !["claimed", "refunded"].includes(o.stage))
        : orders;
  return (
    <>
      <a className="skip-link" href="#main-content">
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
          <h1>
            {view === "swap"
              ? "Swap"
              : view === "liquidity"
                ? "Liquidity"
                : view === "orders"
                  ? "Orders"
                  : "Assets & claims"}
          </h1>
          <p>
            {view === "swap"
              ? "Set your amount, minimum received and recipient."
              : view === "liquidity"
                ? "Preview balanced deposits and minimum LP shares."
                : view === "orders"
                  ? "Follow each stage and reconcile the original request."
                  : "Track balances, pending claims and actual refund assets."}
          </p>
        </div>
        <DemoNotice />
        <LiveAccess
          account={wallet.account}
          draft={liveDraft}
          onClose={() => setLiveDraft(null)}
        />
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
        ) : view === "orders" ? (
          <>
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
          <AssetsPanel orders={orders} onSelect={setSelected} />
        )}
        <footer className="app-footer">
          QA FT are test assets, separate from existing pUSDT. Demo quotes do
          not authorize execution.
        </footer>
      </WorkbenchShell>
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
