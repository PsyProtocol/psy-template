import { useEffect, useRef, useState, useId } from "react";
import {
  createPositionClient,
  type PositionSnapshot,
} from "../../../market-client/positionSnapshot.mjs";
import registry from "../../../market-client/reviewed/staging-position-readers-20261027-v2/registry.json";
import pin from "../../../market-client/reviewed/staging-position-readers-20261027-v2/client-pin.json";
import { fullAmount } from "./domain.mjs";
const client = createPositionClient({
  registry,
  registryHash: pin.registrySha256,
});
const labels: Record<string, string> = {
  orderbook: "Orderbook",
  bondingcurve: "Bonding Curve",
  nftmarket: "NFT Market",
};
const pageMarket: Record<string, number> = {
  orderbook: 2497,
  curve: 2498,
  nft: 2499,
};
export function MarketAccountRead({
  page,
  account,
  readerRequest,
}: {
  page: string;
  account: string | null;
  readerRequest?: { marketId: number; revision: number } | null;
}) {
  const [market, setMarket] = useState(pageMarket[page] ?? 2497),
    [user, setUser] = useState(""),
    [slotStart, setSlotStart] = useState("0"),
    [snapshot, setSnapshot] = useState<PositionSnapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [clock, setClock] = useState(Date.now());
  const errorId = useId(),
    userRef = useRef<HTMLInputElement>(null),
    slotRef = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState<"user" | "slot" | null>(null);
  const generation = useRef(0),
    pending = useRef(false);
  const panelRef = useRef<HTMLDetailsElement>(null),
    handled = useRef(readerRequest?.revision ?? 0);
  useEffect(() => {
    if (!readerRequest || readerRequest.revision <= handled.current) return;
    handled.current = readerRequest.revision;
    generation.current++;
    setSnapshot(null);
    setError("");
    setInvalid(null);
    setMarket(readerRequest.marketId);
    if (panelRef.current) {
      panelRef.current.open = true;
      panelRef.current
        .querySelector<HTMLInputElement>(
          'input[aria-label="Position public user ID"]',
        )
        ?.focus();
    }
  }, [readerRequest]);
  useEffect(() => {
    generation.current++;
    setSnapshot(null);
    setError("");
    setInvalid(null);
    if (pageMarket[page]) setMarket(pageMarket[page]);
  }, [page]);
  useEffect(() => {
    generation.current++;
    setSnapshot(null);
    setUser("");
    setError("");
    setInvalid(null);
  }, [account]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (!snapshot) return;
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [snapshot]);
  const edit = (change: () => void) => {
    generation.current++;
    change();
    setInvalid(null);
    setSnapshot(null);
    setError("");
  };
  const m = registry.markets.find((m) => m.marketId === market)!;
  const read = async () => {
    if (pending.current) return;
    const g = generation.current;
    setError("");
    setInvalid(null);
    setSnapshot(null);
    try {
      if (!/^[1-9]\d{0,7}$/.test(user) || BigInt(user) >= 16777216n) {
        setInvalid("user");
        userRef.current?.focus();
        throw Error("Enter a public user ID from 1 to 16777215.");
      }
      if (
        m.kind === "nftmarket" &&
        (!/^(0|[1-9]\d{0,2})$/.test(slotStart) || Number(slotStart) > 120)
      ) {
        setInvalid("slot");
        slotRef.current?.focus();
        throw Error(
          "NFT slot start must be 0..120; each request reads eight slots.",
        );
      }
      pending.current = true;
      setBusy(true);
      const s = await client.snapshot({
        marketId: market,
        userId: Number(user),
        slotStart: m.kind === "nftmarket" ? Number(slotStart) : 0,
        slotCount: m.kind === "nftmarket" ? 8 : 0,
      });
      if (g === generation.current) {
        setSnapshot(s);
        setClock(Date.now());
      }
    } catch (e) {
      if (g === generation.current) setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const stale =
    snapshot &&
    (clock < snapshot.observedAt || clock - snapshot.observedAt > 30000);
  return (
    <section
      className="market-account-read"
      aria-label="Reviewed market account reader"
    >
      <details ref={panelRef} open={page !== "assets"}>
        <summary>Read {labels[m.kind]} account · read-only</summary>
        <p className="small-note">
          Existing isolated QA instances. Code, layout, function roots, vault
          key mapping and asset metadata are rechecked. RPC observations are not
          cryptographic state proofs or wallet authorization. Local fixture
          forms below remain separate.
        </p>
        <div className="market-read-fields">
          <label>
            Reviewed market
            <select
              aria-label="Reviewed position market"
              value={market}
              onChange={(e) => edit(() => setMarket(Number(e.target.value)))}
            >
              {registry.markets.map((x) => (
                <option key={x.marketId} value={x.marketId}>
                  {labels[x.kind]} #{x.marketId} · vault {x.vaultId}
                </option>
              ))}
            </select>
          </label>
          <label>
            Public user ID
            <input
              aria-label="Position public user ID"
              ref={userRef}
              aria-invalid={invalid === "user" || undefined}
              aria-describedby={invalid === "user" ? errorId : undefined}
              inputMode="numeric"
              value={user}
              onChange={(e) => edit(() => setUser(e.target.value))}
            />
          </label>
          {m.kind === "nftmarket" && (
            <label>
              First NFT slot
              <input
                aria-label="First NFT slot"
                ref={slotRef}
                aria-invalid={invalid === "slot" || undefined}
                aria-describedby={invalid === "slot" ? errorId : undefined}
                inputMode="numeric"
                value={slotStart}
                onChange={(e) => edit(() => setSlotStart(e.target.value))}
              />
            </label>
          )}
        </div>
        {m.kind === "nftmarket" && (
          <p className="small-note">
            Each NFT request reads eight slots. Choose a first slot from 0 to
            120; the result is a bounded page, not a complete inventory.
          </p>
        )}
        <p className="small-note">
          Pinned reader assets:{" "}
          {m.assets
            .map((a) => `${a.symbol} #${a.contractId} · ${a.decimals} decimals`)
            .join("; ")}
          . These isolated QA identities are not assigned to the demonstration
          trading forms.
        </p>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void read()}
        >
          {busy ? "Reading fixed checkpoint…" : "Read market account"}
        </button>
        <p className="small-note">
          This reads one user order slot and selected vault state. It does not
          prove global order inclusion, discover every contract or enable a
          transaction.
        </p>
        {error && (
          <p className="form-error" role="alert" id={errorId}>
            {error}
          </p>
        )}
        {snapshot && (
          <section
            className="position-observation"
            aria-label="Market account RPC observation"
          >
            <h3>
              {labels[snapshot.kind]} #{snapshot.marketId}
            </h3>
            <p className="section-note">
              User {snapshot.userId} · vault {snapshot.vaultId} · checkpoint{" "}
              {snapshot.checkpoint} ·{" "}
              {stale ? "stale — read again" : "recent RPC observation"}.{" "}
              {snapshot.order.kind === "0"
                ? "Current order slot is empty."
                : "Consumed or cancellation flags alone do not prove a successful fill or refund."}
            </p>
            <div
              className="table-scroll"
              role="region"
              aria-label="Observed market token balances"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Observed wallet</th>
                    <th>Pending from vault</th>
                    <th>Unused incoming deposit</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.assets.map((a) => (
                    <tr key={a.contractId}>
                      <th>
                        {a.symbol} #{a.contractId}
                      </th>
                      <td>{fullAmount(a.balance, a.decimals)}</td>
                      <td>{fullAmount(a.claimable, a.decimals)}</td>
                      <td>
                        {fullAmount(
                          String(BigInt(a.sentToVault) - BigInt(a.settled)),
                          a.decimals,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small-note">
              Pending test PSY: {fullAmount(snapshot.nativeOutbox.claimable, 9)}
              . Pending outputs require separate ordinary claims. Native
              balance: {fullAmount(snapshot.user.nativeBalance, 9)} test PSY;
              network fees are not estimated here.
            </p>
            <dl className="terms">
              <div>
                <dt>Order nonce / pool / kind</dt>
                <dd>
                  {String(snapshot.order.nonce)} / {String(snapshot.order.pool)}{" "}
                  / {String(snapshot.order.kind)}
                </dd>
              </div>
              <div>
                <dt>Queue epoch / phase / members</dt>
                <dd>
                  {snapshot.queue.epoch} / {snapshot.queue.phase} /{" "}
                  {snapshot.queue.count}
                </dd>
              </div>
              <div>
                <dt>Consumed nonce</dt>
                <dd>{snapshot.lifecycle.consumed} · outcome not inferred</dd>
              </div>
            </dl>
            {snapshot.curve && (
              <p className="small-note">
                Curve phase {snapshot.curve.phase}; sold lots{" "}
                {snapshot.curve.soldLots}; observed quote reserve{" "}
                {fullAmount(snapshot.curve.quoteReserve)} QA-B.
              </p>
            )}
            {snapshot.nft && (
              <>
                <h4>
                  NFT #{snapshot.nft.contractId} · observed balance{" "}
                  {snapshot.nft.balance}
                </h4>
                <p className="small-note">
                  Only slots {snapshot.nft.slotStart}–
                  {snapshot.nft.slotStart + snapshot.nft.slotCount - 1} of 128
                  are read. This is not a complete inventory scan.{" "}
                  {snapshot.nft.pending.length} pending vault deliveries require
                  their own claims.
                </p>
                <ul className="nft-observed-slots">
                  {snapshot.nft.slots.map((x) => (
                    <li key={x.slot}>
                      Slot {x.slot}:{" "}
                      {x.active === "1"
                        ? `observed active · token ${x.tokenId.join(" / ")}`
                        : "inactive"}
                      {x.active === "1" && (
                        <small>
                          Metadata hash words: {x.metadataHash.join(" / ")}
                        </small>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <details>
              <summary>Exact observed order, cursors and state anchors</summary>
              <pre className="product-json">
                {JSON.stringify(snapshot, null, 2)}
              </pre>
            </details>
          </section>
        )}
        <p className="market-boundary">
          Wallet execution is not accepted in this candidate: complete proof
          preparation without broadcasting, independent verification, exact
          one-shot broadcast and original-identity recovery must be connected
          and tested first. No direct signing fallback.
        </p>
      </details>
    </section>
  );
}
