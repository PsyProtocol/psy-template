import type {
  MarketSnapshot,
  MarketRequest,
} from "../../../market-client/client.mjs";
import {
  projectAmmAccount,
  makeAccountAction,
} from "../../../market-client/accountProjection.mjs";
import registry from "../../../market-client/reviewed/staging-qa-20261026-account-v2/registry.json";
import pin from "../../../market-client/reviewed/staging-qa-20261026-account-v2/client-pin.json";
export function ObservedAccount({
  snapshot,
  now,
  onPlan,
  onRefresh,
}: {
  snapshot: MarketSnapshot;
  now: number;
  onPlan: (r: MarketRequest) => void;
  onRefresh: () => void;
}) {
  let view;
  try {
    view = projectAmmAccount(snapshot, registry, pin.registrySha256, now);
  } catch {
    return (
      <p className="form-error" role="alert">
        Account observation is invalid or the local clock changed. Read fresh
        state before continuing.
      </p>
    );
  }
  const action = (
    kind: MarketRequest["kind"],
    assetIn = registry.markets.find((m) => m.marketId === view.marketId)!
      .assets[0].contractId,
  ) => onPlan(makeAccountAction(snapshot, kind, assetIn));
  return (
    <section
      className="observed-account"
      aria-label="AMM account RPC observations"
    >
      <div className="section-heading">
        <h2>AMM account</h2>
        <span className="fixture-tag">
          RPC observations · {view.stale ? "stale" : "recent"}
        </span>
      </div>
      <p className="section-note">
        Public user {view.userId} · AMM {view.marketId} · vault {view.vaultId} ·
        checkpoint {view.checkpoint}. These reads are not a cryptographic state
        proof or wallet authorization.
      </p>
      {view.stale && (
        <p className="storage-note" role="status">
          This observation is over 30 seconds old. Refresh before preparing
          another action.
        </p>
      )}
      <div
        className="table-scroll"
        role="region"
        aria-label="Observed balances and pending outputs, scroll horizontally"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Wallet balance · observed</th>
              <th>Pending from this vault</th>
              <th>Unused deposit to vault</th>
            </tr>
          </thead>
          <tbody>
            {view.assets.map((a) => (
              <tr key={a.contractId}>
                <th>
                  {a.symbol}{" "}
                  <small>
                    #{a.contractId} · {a.decimals} decimals
                  </small>
                </th>
                <td className="exact-observed-amount">{a.balance}</td>
                <td className="exact-observed-amount">{a.claimable}</td>
                <td className="exact-observed-amount">{a.unusedDeposit}</td>
              </tr>
            ))}
            <tr>
              <th>
                test PSY <small>#0 · 9 decimals</small>
              </th>
              <td className="exact-observed-amount">{view.native.balance}</td>
              <td className="exact-observed-amount">{view.native.claimable}</td>
              <td>Shown separately in fee cursors</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="small-note">
        Pending outputs require a separate wallet claim. An unused deposit is
        not a refund. The same wallet balance is not summed across pools.
      </p>
      <div className="observed-position-grid">
        <section>
          <h3>LP position</h3>
          <strong className="exact-observed-amount">
            {BigInt(view.lp.rawShares).toLocaleString("en-US")}
          </strong>
          <p className="small-note">
            Raw internal shares, without assumed token decimals. Supply:{" "}
            {BigInt(view.lp.totalRawShares).toLocaleString("en-US")}.
          </p>
        </section>
        <section>
          <h3>Order nonce {view.order.nonce}</h3>
          <strong>{view.order.type}</strong>
          <p className="small-note">{view.order.state}</p>
        </section>
        <section>
          <h3>Queue epoch {view.queue.epoch}</h3>
          <strong>
            {view.queue.phase} · {view.queue.members}/4 members
          </strong>
          <p className="small-note">
            Cutoff {view.queue.cutoff}. Signed consent epoch{" "}
            {view.order.consentEpoch}; membership and a unique execution result
            are not inferred.
          </p>
        </section>
      </div>
      <h3>Prepare the next action</h3>
      <p className="small-note">
        Each button reads fresh state and produces an unsigned plan only.
        Contract rules may reject it; no signature, funding or transaction is
        sent.
      </p>
      <div className="live-actions observed-actions">
        {view.assets.map((a) => (
          <button
            key={a.contractId}
            className="secondary-button"
            disabled={
              view.stale ||
              BigInt(
                snapshot.assets.find((x) => x.contractId === a.contractId)!
                  .claimableFromVault,
              ) === 0n
            }
            onClick={() => action("claim", a.contractId)}
          >
            Prepare {a.symbol} claim
          </button>
        ))}
        <button
          className="secondary-button"
          disabled={
            view.stale || BigInt(snapshot.funding.nativeClaimable) === 0n
          }
          onClick={() => action("claim-native", 0)}
        >
          Prepare test PSY claim
        </button>
        {(
          [
            ["admit", "Prepare admission consent"],
            ["cancel", "Prepare cancellation request"],
            ["release", "Prepare lawful order release"],
            ["recover", "Prepare funding recovery"],
            ["close", "Prepare order closure"],
          ] as const
        ).map(([kind, label]) => (
          <button
            key={kind}
            className="secondary-button"
            disabled={view.stale}
            onClick={() => action(kind)}
          >
            {label}
          </button>
        ))}
        <button className="text-button" onClick={onRefresh}>
          Refresh account observation
        </button>
      </div>
      <p className="small-note">
        Recovery enrollment:{" "}
        {view.recoveryEnrolled
          ? "recorded for this vault; not a completed refund"
          : "not recorded for this vault"}
        . Recovery needs the original order outcome or lawful release,
        authorized execution fees and separate claims. A completed trade cannot
        be reversed at its original price.
      </p>
    </section>
  );
}
