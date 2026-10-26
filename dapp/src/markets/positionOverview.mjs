import { draftState, ammActivityState } from "./activity.mjs";
// Presentation boundaries, not a portfolio index or authenticated holdings feed.
export function positionOverview(drafts, orders, now) {
  const definitions = [
    {
      market: "amm",
      name: "AMM",
      position: "LP shares and pending token outputs",
      source: "AMM RPC observation panel",
      route: "liquidity",
    },
    {
      market: "orderbook",
      name: "Orderbook",
      position: "Open orders and locked assets",
      source: "Local draft records only",
      route: "orderbook",
    },
    {
      market: "curve",
      name: "Bonding Curve",
      position: "Token balance and curve lots",
      source: "Local draft records only",
      route: "curve",
    },
    {
      market: "nft",
      name: "NFT Market",
      position: "Owned NFTs, escrow and deliveries",
      source: "Local draft records only",
      route: "nft",
    },
  ];
  return definitions.map((d) => {
    const rows = drafts.filter((r) => r.preview.market === d.market);
    return {
      ...d,
      verifiedPosition: null,
      financialAuthorization: false,
      local: {
        open: rows.filter((r) => draftState(r, now) === "draft").length,
        expired: rows.filter((r) => draftState(r, now) === "expired").length,
        cancelled: rows.filter((r) => draftState(r, now) === "cancelled")
          .length,
      },
      demoOrders: d.market === "amm" ? orders.length : 0,
      demoPending:
        d.market === "amm"
          ? orders.filter((o) => ammActivityState(o) === "pending").length
          : 0,
    };
  });
}
