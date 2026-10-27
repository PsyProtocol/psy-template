// Application-owned market policy. This is statically reviewed/vendor-bundled,
// never loaded from an ABI, web request, external URL or verifier report.
import {parseUnits, MAX_AMOUNT} from "../../token/wide/arithmetic.mjs";
import {canonical, digest} from "../protocol.mjs";
const common = ["admit", "cancel", "close", "release", "recover", "claim", "claim-ft", "claim-native"];
const operations = Object.freeze({
 amm: ["swap", "add", "remove", ...common],
 orderbook: ["book-order", ...common],
 bondingcurve: ["curve-buy", "curve-sell", ...common],
});
const rows = bundle => [bundle, ...(bundle.amm ? [bundle.amm] : [])];
const allowed = market => market.quarantined !== true && Object.hasOwn(operations, market.kind);
export function marketCapabilities(bundle) {
 const reviewed = rows(bundle);
 if(reviewed.some(b => canonical(b.registry.network) !== canonical(bundle.registry.network)))throw Error("Reviewed chain domains differ");
 return {registryHashes: reviewed.map(b => b.registryHash),
  chainRootAt1: bundle.registry.network.chainRootAt1,
  enabledMarketIds: reviewed.flatMap(b => b.registry.markets.filter(allowed).map(m => m.marketId)),
  nftWrite: false, liveAcceptanceComplete: false};
}
export function assertMarketPolicyRecord(bundle, record) {
 const plan=record?.plan;
 if(record?.registryHash && record.registryHash!==plan?.registryHash)throw Error("Approved registry identity changed");
 const selected=rows(bundle).find(b=>b.registryHash === (record?.registryHash ?? plan?.registryHash));
 const market=selected?.registry.markets.find(m=>m.marketId===plan?.marketId);
 if(!market || !allowed(market) || !operations[market.kind].includes(plan.kind))
  throw Error("Market identity or action has no accepted application policy");
 return {selected,market};
}
export async function reviewMarketConfirmation(terms, bundle) {
 const plan=terms?.review?.plan, {selected,market}=assertMarketPolicyRecord(bundle,{plan});
 if(await digest(selected.registry)!==selected.registryHash || canonical(plan.network)!==canonical(selected.registry.network))
  throw Error("Confirmation registry or chain changed");
 if(market.assets.some(a=>a.decimals!==18))throw Error("Reviewed wide-token decimals required");
 const assets=[{contractId:0,decimals:9,symbol:"PSY"},...market.assets];
 if(!Array.isArray(plan.debits)||plan.debits.some(d=>!assets.some(a=>a.contractId===d.contractId)||typeof d.amount!=="string"||!/^[1-9]\d*$/.test(d.amount)||BigInt(d.amount)>MAX_AMOUNT))
  throw Error("Reviewed asset debit required");
 const limits=marketLimitRows(terms);
 return {componentId:String(market.marketId),
  assets:assets.map(a=>({contractId:a.contractId,decimals:a.decimals,symbol:a.symbol})),
  limits,
  rows:[{label:"Action",value:plan.kind},{label:"Network",value:plan.network.name},
   {label:"Component",value:String(market.marketId)},{label:"Recipient",value:String(plan.recipientId)},
   {label:"Nonce",value:plan.walletNonce},{label:"Actual network fee",value:terms.actualFee+" PSY base units"},
   {label:"Fee limit",value:terms.maxNetworkFee+" PSY base units"},
   {label:"Valid through",value:"Checkpoint "+terms.validUntilCheckpoint}],
  debits:plan.debits.map(d=>({label:"Contract "+d.contractId,value:d.amount+" base units"}))};
}
export function marketLimitRows(
  terms,
) {
  const { request, plan } = terms.review;
  if (request.kind !== plan.kind) throw Error("Reviewed action changed");
  const base = (value) => {
    if (
      typeof value !== "string" ||
      !/^(0|[1-9]\d*)$/.test(value) ||
      BigInt(value) <= 0n ||
      BigInt(value) > MAX_AMOUNT
    )
      throw Error("Binding U124 base-unit limit required");
    return value + " base units";
  };
  const amount = (value) => {
    if (
      typeof value !== "string" ||
      parseUnits(value, 18) <= 0n ||
      parseUnits(value, 18) > MAX_AMOUNT
    )
      throw Error("Binding positive token limit required");
    return value + " tokens (18 decimals)";
  };
  if (plan.kind === "swap")
    return [{ label: "Minimum swap output", value: base(plan.minimum) }];
  if (plan.kind === "add")
    return [{ label: "Minimum LP shares", value: base(plan.minimum) }];
  if (plan.kind === "remove") {
    const w = plan.withdrawal;
    if (!w) throw Error("Both withdrawal limits are required");
    return [
      { label: "LP shares to burn", value: base(w.burned) },
      { label: "Minimum asset A output", value: base(w.minimumA) },
      { label: "Minimum asset B output", value: base(w.minimumB) },
    ];
  }
  const t = request.terms;
  if (plan.kind === "book-order") {
    if (!t || !["0", "1"].includes(String(t.side)))
      throw Error("Whole-order side and limits required");
    return [
      { label: "Whole-order input", value: amount(t.amount) },
      { label: "Minimum opposite asset output", value: amount(t.minimum) },
      { label: "Partial fills", value: "Not allowed" },
    ];
  }
  if (plan.kind === "curve-buy" || plan.kind === "curve-sell") {
    if (
      !t ||
      typeof t.lots !== "string" ||
      !/^[1-9]\d{0,19}$/.test(t.lots) ||
      BigInt(t.lots) > 18446744069414584320n
    )
      throw Error("Exact Curve lots required");
    return [
      { label: "Curve lots", value: t.lots },
      {
        label:
          plan.kind === "curve-buy"
            ? "Maximum quote spend"
            : "Minimum quote output",
        value: amount(t.quoteLimit),
      },
    ];
  }
  if (
    [
      "admit",
      "cancel",
      "close",
      "release",
      "recover",
      "claim",
      "claim-ft",
      "claim-native",
    ].includes(plan.kind)
  )
    return [
      { label: "Operation", value: plan.kind },
      {
        label: "Settlement and claim",
        value:
          "Original order outcome and actual Outbox balances remain binding; this does not reverse completed trades.",
      },
    ];
  throw Error("This market action has no accepted wallet confirmation policy");
}
