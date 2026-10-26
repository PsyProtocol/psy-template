import type { ReactNode } from "react";
import { Icon } from "./icons";
export type View =
  | "swap"
  | "liquidity"
  | "orderbook"
  | "curve"
  | "nft"
  | "orders"
  | "assets";
export function WorkbenchShell({
  view,
  onView,
  account,
  connecting,
  onConnect,
  children,
}: {
  view: View;
  onView: (v: View) => void;
  account: string | null;
  connecting: boolean;
  onConnect: () => void;
  children: ReactNode;
}) {
  const nav = [
    ["swap", "Swap", "swap"],
    ["liquidity", "Liquidity", "network"],
    ["orderbook", "Orderbook", "book"],
    ["curve", "Bonding Curve", "curve"],
    ["nft", "NFT Market", "nft"],
    ["orders", "Orders", "orders"],
    ["assets", "Assets & claims", "wallet"],
  ] as const;
  return (
    <div className="workbench">
      <aside className="sidebar">
        <a
          href="#swap"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            onView("swap");
          }}
          aria-label="Psy Markets swap home"
        >
          <img
            className="brand-logo"
            src="/brand/PsyLogo.svg"
            width="70"
            height="32"
            alt="Psy"
          />
          <span className="brand-product">Markets</span>
        </a>
        <nav aria-label="Main navigation">
          {nav.map(([id, label, icon]) => (
            <button
              key={id}
              className={view === id ? "nav-active" : ""}
              aria-current={view === id ? "page" : undefined}
              onClick={() => onView(id)}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <label className="mobile-market-nav">
          Market & activity
          <select
            aria-label="Market navigation"
            value={view}
            onChange={(e) => onView(e.target.value as View)}
          >
            {nav.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="network-status">
          <div>
            <Icon name="network" />
            <span>Psy testnet</span>
          </div>
          <p>
            <span className="status-dot amber" />
            Trading unavailable
          </p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <strong>Trading workspace</strong>
          <button
            className="wallet-button"
            onClick={onConnect}
            disabled={connecting}
            title={account ?? undefined}
          >
            <Icon name="wallet" />
            <span>
              {connecting
                ? "Connecting…"
                : account
                  ? account.length > 14
                    ? `${account.slice(0, 7)}…${account.slice(-5)}`
                    : account
                  : "Connect wallet"}
            </span>
          </button>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
export function DemoNotice() {
  return (
    <div className="demo-notice" role="status">
      <Icon name="info" size={18} />
      <span>Demo mode: local data. Live submission is paused.</span>
    </div>
  );
}
