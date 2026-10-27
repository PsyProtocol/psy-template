import {WalletExecution} from "./WalletExecution";
import { useEffect, useRef, useState } from "react";
import {
  createMarketActionClient,
  type MarketActionRequest,
  type MarketActionRecord,
} from "../../../market-client/marketActionClient.mjs";
import {
  createPositionClient,
  type PositionSnapshot,
} from "../../../market-client/positionSnapshot.mjs";
import registry from "../../../market-client/reviewed/mainnet-beta-markets-20261027-v3/registry.json";
import pin from "../../../market-client/reviewed/mainnet-beta-markets-20261027-v3/client-pin.json";
import { marketActionAbis } from "./marketActionBindings";
import { fullAmount } from "./domain.mjs";
const client = createMarketActionClient({
  registry,
  registryHash: pin.registrySha256,
  abis: marketActionAbis,
});
const reader = createPositionClient({
  registry,
  registryHash: pin.registrySha256,
});
const maintenance = [
  ["admit", "Consent to open queue"],
  ["cancel", "Request order cancellation"],
  ["release", "Release a cancelled, unlocked order"],
  ["recover", "Enroll sender-bound recovery"],
  ["close", "Close a fully settled order"],
  ["claim-ft", "Claim pending FT"],
  ["claim-native", "Claim pending test PSY"],
];
export function MarketActionPlan({
  marketId,
  user,
  account,
  snapshot,
}: {
  marketId: number;
  user: string;
  account: string | null;
  snapshot: PositionSnapshot | null;
}) {
  const m = registry.markets.find((m) => m.marketId === marketId)!;
  const [kind, setKind] = useState("cancel"),
    [side, setSide] = useState("0"),
    [amount, setAmount] = useState(""),
    [minimum, setMinimum] = useState(""),
    [lots, setLots] = useState("1"),
    [limit, setLimit] = useState(""),
    [price, setPrice] = useState(""),
    [sellerId, setSellerId] = useState(""),
    [slot, setSlot] = useState("0"),
    [asset, setAsset] = useState(String(m.assets[0].contractId)),
    [fee, setFee] = useState("5"),
    [expiry, setExpiry] = useState("64"),
    [record, setRecord] = useState<MarketActionRecord | null>(null),
    [seller, setSeller] = useState<PositionSnapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [clock, setClock] = useState(Date.now());
  const generation = useRef(0),
    pending = useRef(false),
    errorRef = useRef<HTMLParagraphElement>(null);
  const clear = () => {
    generation.current++;
    setRecord(null);
    setError("");
  };
  useEffect(() => {
    clear();
    setSeller(null);
    setKind("cancel");
    setAsset(String(m.assets[0].contractId));
  }, [marketId, user, account, snapshot]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (!record) return;
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [record]);
  const edit = (fn: () => void) => {
    clear();
    fn();
  };
  const ordinaryId = (text: string) => {
    if (!/^[1-9]\d{0,7}$/.test(text) || BigInt(text) >= 16777216n)
      throw Error(
        "Enter a public user ID from 1 to 16777215 in the account reader.",
      );
    return Number(text);
  };
  const work = async (fn: () => Promise<() => void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setRecord(null);
    const token = generation.current;
    try {
      const apply = await fn();
      if (token === generation.current) apply();
    } catch (e) {
      if (token === generation.current) {
        setError((e as Error).message);
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const readSeller = () =>
    void work(async () => {
      const id = ordinaryId(sellerId);
      const result = await reader.snapshot({
        marketId,
        userId: id,
        slotStart: 0,
        slotCount: 8,
      });
      return () => {
        setSeller(result);
        setClock(Date.now());
      };
    });
  const prepare = () =>
    void work(async () => {
      const userId = ordinaryId(user);
      if (!/^[1-9]\d{0,2}$/.test(expiry) || Number(expiry) > 128)
        throw Error("Validity must be 1..128 checkpoints, not minutes.");
      let terms: Record<string, unknown> = {};
      if (kind === "book-order") terms = { side, amount, minimum };
      if (kind === "curve-buy" || kind === "curve-sell")
        terms = { lots, quoteLimit: limit };
      if (kind === "claim-ft") terms = { assetId: Number(asset) };
      if (kind === "nft-list" || kind === "claim-nft") {
        if (!/^(0|[1-9]\d{0,2})$/.test(slot) || Number(slot) > 127)
          throw Error("NFT slot must be 0..127.");
        const owned = snapshot?.nft?.slots.find((x) => x.slot === Number(slot));
        if (!owned)
          throw Error("Read the NFT page containing this slot first.");
        if (kind === "nft-list")
          terms = {
            slot: Number(slot),
            price,
            tokenId: owned.tokenId,
            metadataHash: owned.metadataHash,
          };
        else {
          const next = snapshot?.nft?.pending[0];
          if (!next) throw Error("Read an actual pending NFT delivery first.");
          terms = {
            slot: Number(slot),
            sequence: next.sequence,
            tokenId: next.tokenId,
            metadataHash: next.metadataHash,
          };
        }
      }
      if (kind === "nft-buy") {
        if (
          !seller ||
          seller.userId !== ordinaryId(sellerId) ||
          Date.now() - seller.observedAt > 30000
        )
          throw Error(
            "Read the selected seller listing again before preparing.",
          );
        terms = {
          sellerId: seller.userId,
          listingNonce: seller.order.nonce,
          price: fullAmount(String(seller.order.price), 18),
          tokenId: seller.order.tokenId,
          metadataHash: seller.order.metadataHash,
        };
      }
      const request: MarketActionRequest = {
        kind,
        marketId,
        userId,
        recipientId: userId,
        validForCheckpoints: Number(expiry),
        feeCap: fee,
        terms,
      };
      const result = await client.plan(request);
      return () => {
        setRecord(result);
        setClock(Date.now());
      };
    });
  const expired =
    record &&
    (clock < record.snapshot.observedAt ||
      clock - record.snapshot.observedAt > 30000);
  return (
    <section
      className="market-action-plan"
      aria-label="Real unsigned action planner"
    >
      <h4>Prepare a real unsigned action</h4>
      <p className="small-note">
        Uses fresh state for the pinned QA market #{marketId} and owner{" "}
        {user || "not entered"}. This does not sign, submit, settle or claim.
        Demonstration form values are not copied.
      </p>
      <div className="market-read-fields">
        <label>
          Action
          <select
            aria-label="Real market action"
            value={kind}
            onChange={(e) => edit(() => setKind(e.target.value))}
          >
            {m.kind === "orderbook" && (
              <option value="book-order">Open whole-order limit</option>
            )}
            {m.kind === "bondingcurve" && (
              <>
                <option value="curve-buy">Open Curve limit buy</option>
                <option value="curve-sell">Open Curve limit sell</option>
              </>
            )}
            {m.kind === "nftmarket" && (
              <>
                <option value="nft-list">List an observed NFT</option>
                <option value="nft-buy">Buy an observed listing</option>
                <option value="claim-nft">Claim next NFT delivery</option>
              </>
            )}
            {maintenance.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {kind === "book-order" && (
          <>
            <label>
              Offered asset
              <select
                aria-label="Real order offered asset"
                value={side}
                onChange={(e) => edit(() => setSide(e.target.value))}
              >
                {m.assets.map((a, i) => (
                  <option value={i} key={a.contractId}>
                    {a.symbol} #{a.contractId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Offered amount
              <input
                aria-label="Real order amount"
                value={amount}
                onChange={(e) => edit(() => setAmount(e.target.value))}
              />
            </label>
            <label>
              Minimum received · {m.assets[1 - Number(side)].symbol}
              <input
                aria-label="Real order minimum"
                value={minimum}
                onChange={(e) => edit(() => setMinimum(e.target.value))}
              />
            </label>
          </>
        )}
        {kind.startsWith("curve-") && (
          <>
            <label>
              Whole lots
              <input
                aria-label="Real Curve lots"
                value={lots}
                onChange={(e) => edit(() => setLots(e.target.value))}
              />
            </label>
            <label>
              {kind === "curve-buy" ? "Maximum spend" : "Minimum received"} ·
              QA-B
              <input
                aria-label="Real Curve quote limit"
                value={limit}
                onChange={(e) => edit(() => setLimit(e.target.value))}
              />
            </label>
          </>
        )}
        {(kind === "nft-list" || kind === "claim-nft") && (
          <label>
            {kind === "nft-list" ? "Owned NFT slot" : "Empty destination slot"}
            <input
              aria-label="Real NFT action slot"
              value={slot}
              onChange={(e) => edit(() => setSlot(e.target.value))}
            />
          </label>
        )}
        {kind === "nft-list" && (
          <label>
            Exact price · QA-A
            <input
              aria-label="Real NFT listing price"
              value={price}
              onChange={(e) => edit(() => setPrice(e.target.value))}
            />
          </label>
        )}
        {kind === "nft-buy" && (
          <label>
            Seller public user ID
            <input
              aria-label="Real NFT seller ID"
              value={sellerId}
              onChange={(e) =>
                edit(() => {
                  setSellerId(e.target.value);
                  setSeller(null);
                })
              }
            />
          </label>
        )}
        {kind === "claim-ft" && (
          <label>
            Pending asset
            <select
              aria-label="Real claim FT asset"
              value={asset}
              onChange={(e) => edit(() => setAsset(e.target.value))}
            >
              {m.assets.map((a) => (
                <option value={a.contractId} key={a.contractId}>
                  {a.symbol} #{a.contractId}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Maximum network fee · test PSY
          <input
            aria-label="Real action fee cap"
            value={fee}
            onChange={(e) => edit(() => setFee(e.target.value))}
          />
        </label>
        <label>
          Validity · checkpoints
          <input
            aria-label="Real action validity"
            value={expiry}
            onChange={(e) => edit(() => setExpiry(e.target.value))}
          />
        </label>
      </div>
      {kind === "nft-buy" && (
        <>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={readSeller}
          >
            Read seller listing
          </button>
          {seller && (
            <p className="small-note">
              Observed seller {seller.userId}, listing nonce{" "}
              {String(seller.order.nonce)}, exact price{" "}
              {fullAmount(String(seller.order.price), 18)} QA-A; token{" "}
              {String(seller.order.tokenId)}. The planner rechecks these exact
              terms.
            </p>
          )}
        </>
      )}
      <button className="secondary-button" disabled={busy} onClick={prepare}>
        {busy ? "Reading and checking plan…" : "Prepare unsigned market action"}
      </button>
      {error && (
        <p ref={errorRef} role="alert" tabIndex={-1} className="form-error">
          {error}
        </p>
      )}
      {record && (
        <section aria-label="Unsigned real market action">
          <h4>
            Unsigned action ·{" "}
            {expired
              ? "expired observation — prepare again"
              : "recent observation"}
          </h4>
          <p>{record.plan.effect}</p>
          <p className="small-note">
            {record.plan.callCount} calls before the wallet fee burn; maximum
            network fee {fullAmount(record.plan.maxNetworkFee, 9)} test PSY.
            Record {record.recordId}. Actual proof cost and fees are not
            estimated.
          </p>
          <details>
            <summary>Exact request, calls and state endpoints</summary>
            <pre className="product-json">
              {JSON.stringify(record, null, 2)}
            </pre>
          </details>
          <WalletExecution key={`${account}:${record.recordId}`} account={account} record={record} expired={Boolean(expired)}/>
        </section>
      )}
    </section>
  );
}
