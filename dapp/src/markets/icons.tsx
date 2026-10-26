import type { CSSProperties } from "react";
export function Icon({
  name,
  size = 20,
  style,
}: {
  name:
    | "swap"
    | "orders"
    | "wallet"
    | "arrow"
    | "chevron"
    | "close"
    | "info"
    | "check"
    | "download"
    | "network"
    | "book"
    | "curve"
    | "nft";
  size?: number;
  style?: CSSProperties;
}) {
  const paths = {
    swap: (
      <>
        <path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4" />
      </>
    ),
    orders: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
    wallet: (
      <>
        <path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h15v10H6a3 3 0 0 1-3-3V7M21 12h-5v4h5" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h15m-5-5 5 5-5 5" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10v1" />
      </>
    ),
    check: <path d="m5 12 5 5L20 7" />,
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
      </>
    ),
    book: (
      <>
        <path d="M4 5h6v14H4zM14 5h6v14h-6zM6 9h2m-2 4h2m8-4h2m-2 4h2" />
      </>
    ),
    curve: (
      <>
        <path d="M4 3v17h17M6 16c8 0 5-10 14-11" />
      </>
    ),
    nft: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="1" />
        <path d="m7 16 4-6 3 4 3-2M8 7h1" />
      </>
    ),
    network: (
      <>
        <circle cx="12" cy="5" r="3" />
        <circle cx="5" cy="18" r="3" />
        <circle cx="19" cy="18" r="3" />
        <path d="m10 8-4 7m8-7 4 7M8 18h8" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
export function Coin({
  asset,
  small = false,
}: {
  asset: "A" | "B";
  small?: boolean;
}) {
  return (
    <span
      className={`coin coin-${asset}${small ? " coin-small" : ""}`}
      aria-hidden="true"
    >
      {asset}
    </span>
  );
}
