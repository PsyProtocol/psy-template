# Two-hop AMM route

This module plans one A→B→C path across two existing AMM pools. It does not
deploy a contract, submit a transaction, or change Node.

`planExactRoute` quotes each hop with `swapQuote`, the same 0.30% floor the
U124 AMM contract checks. The second hop's input is the first hop's output.
The plan is rejected when that final floor is below the caller's minimum, the
intermediate asset does not match, a market is reused, or a hop floors to zero.

The plan is not atomic. Each hop is an existing AMM order, settlement and
claim. The intermediate asset is claimed before the next order is opened.
Orderbook, curve and NFT are not components of this path, and `invoke_sync`
is not used.

`liveTwoHop.mjs` is now a **read-only historical report reader**. Its former
financial runner bypassed the exact deployment-occurrence gate and is retired.
The original 2026-10-22 run and code at `93ad36f` remain historical evidence,
not dedicated composition authorization or current candidate acceptance.

`planAmmThenBook` adds one resting orderbook cross after that AMM floor. The
intermediate is sold as one order. The fill is the whole crossing bid, because
the orderbook checks the deposited amount against the signed order. There is
no partial fill and no `invoke_sync`. Curve and NFT are still outside this
path. This book hop has not been submitted.

## Strict intent candidate

`intent.mjs` adds a canonical domain/SDK/registry-bound intent, exact U124 units
and a two-AMM planner. Registry commitments include each market, vault, key,
code/layout/function roots, complete dependency metadata and asset decimals.
The v1 receiver is the owner; unsupported NFT/delegation scopes fail closed.
All returned plans explicitly remain **quote-only**, with unauthenticated source
snapshots. A digest is not a signature. The separately proved funded controller/key below
does not automatically authorize these advisory plans; the per-instance financial adapter and new isolated acceptance remain required. See
[CAPABILITIES.md](CAPABILITIES.md) for exact atomicity and compensation limits.

`workflow.mjs` tracks the staged request identities, confirmations and recovery
asset class. `store.mjs` persists append-only, hash-linked snapshots with revision
checks and the Executor's same-host lock. Unknown broadcasts prevent another
prepared task; a confirmed Outbox must be claimed before the next stage. An
observed actual fee breach is retained as `review-required`, not hidden by a
failed local assertion. This is an observation/control scaffold: receipt facts
still need a full-proof/historical/index verifier, and is not used as the financial driver. Local revision tests do not prove multi-host exclusion or
on-chain authorization. The initial store is one intent per dedicated case;
Actual new-instance acceptance remains an uncompleted gate.

Recovery now recomputes the complete advisory plan from its embedded registry
and snapshots, checking that registry against the user's committed hash. Matching
intent IDs and a replacement local plan digest cannot substitute a vault, market,
amount or receiver. Each new stage's source checkpoint must also include all
previous confirmed common checkpoints. Old plans lacking this provenance fail
closed; no persisted original evidence is rewritten. These consistency checks
still do not authenticate supplied snapshots or authorize transfers.

`receipt.mjs` now observes an **already recorded exact broadcast**. It pins the
existing offline verifier, SDK and RPC configuration, verifies the preserved
full UPS, binds request/proof hashes, caller/key, nonce and endpoints, and matches
historical leaf/indexed occurrence and receipt stats/fees before recording common-
checkpoint progress. Unknown inclusion retains the original pending identity;
invalid proof stops before network reads. It never proves, sends or substitutes
a transaction. Historical/index inclusion remains an RPC observation, not an
authenticated finality proof or runtime attestation. It does not certify actual
calls against the business route: the separate funded controller/key must be
connected through the financial adapter before delegated execution. The live read-only smoke uses a synthetic workflow
around an existing QA ordinary request, **not composition economic acceptance**.

## Funded controller / dedicated key candidate

See `CAPABILITIES.md` → Funded candidate checkpoint for current scope.
`contract/funds.mjs` is distinct from the **never-fund** reservation profile.
`funding.mjs` creates an atomic owner request/funding/bind sequence, while
`contract/policy.mjs` binds 18 controller operation templates. Rust
`tests/composition_funds.rs` and `tests/composition_key.rs` prove the current key
and linked controller UPSs. The separate financial adapter/CLI is now implemented below; it is not yet network-accepted.
Evidence is in `executor/verification/2026-10-23-funded-composition-v1/`;
reproduction and remaining gates are in that directory's `README.md`.


## Independent financial route (candidate)

`adapter.mjs`, `execution.mjs`, `selection.mjs` and `run.mjs` connect the funded
controller to the normal Executor journal. They do not wrap the observation-only
workflow. `client.mjs` prepares ordinary-owner atomic funding and exact terminal
FT/native claims without signing or sending. Intents/plans use `codec.mjs` typed
BigInt documents; raw proof/request JSON still uses the protocol lossless codec.

The new controller must be generated with **intentOwner and assetMetadata**.
The adapter rejects legacy unpinned source, recompilation/artifact root mismatch,
mutable token administration, wrong decimals, SDK/network/key/root changes and
changed inputs. `domain.mjs` binds the exact configured network and endpoints;
this is not a running-image or independent genesis attestation.

Run `node composition/run.mjs CONFIG scan|once|watch|reconcile`. CONFIG supplies
absolute or config-relative intent, plan, runtime policy, controller source /
compiled artifact / raw ABI, two raw FT ABIs, native ABI, two market ABIs, RPC
config, the reviewed `composition_wallet` path/SHA256, persistent runtimeDirectory,
profile `composition-funded-v1`, network `sepolia`, frozen SDK hash, existing
staging profile, exact vault/fingerprint/publicKeyHash, controllerBudget,
ownerFeeReserve and the two canonical assetMetadata rows. Base market Executors
run separately. No component is authorized to write another vault account.

A resident proof-only process shares reviewed circuit/session resources between
non-authorizing fee traces and fresh full proofs. Prepared work keeps its exact
window across restart; unknown broadcast reconciles the original request before
planning. Old receipt reconciliation remains available after a dependency update,
while new financial work halts. Locks coordinate the same host only.

Evidence and exact performance boundaries:
`executor/verification/2026-10-23-composition-financial-executor-v1/README.md`.
Initial fresh QA asset bootstrap is `composition/acceptance/bootstrap.mjs`; it
requires an explicitly pinned FT compiler release. It deploys no old updates and
funds no composition controller. An unknown deployment requires reconciliation.
