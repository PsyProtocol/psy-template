# Authenticated bounded admission candidate

Distinct new market layouts/code roots. Isolated staging deployments and paired
fixture receipts are recorded in the live acceptance review. These are not
compatible with an existing V2 vault or the ordinary Executor/wallet fixed-count signing route.
The explicit formal Executor profile is now `batch-admission-compact-v1`.
See `executor/README.md` and the 2026-10-21 production candidate review for the
new entry, journal and proof-cache boundaries. It requires reviewed roots and
new keys/vaults; source presence is not production acceptance. The generic
SDK exact-count route is not disabled or bypassed.

The application now contains `isolated_wallet` (fresh ordinary test identities,
initial deploys and ordinary calls) and `compact_market_wallet` (explicit compact
policy signing). Compile/live results are tracked in the release review rather
than inferred from source presence. Other Executor profiles are unchanged.
`reader.mjs` reconstructs a proposal from all sealed queue entries, ignoring
discovery hints and member limits; `proofVerified:false` remains until the full
contract/SD-key UPS is proved. `queueMaintenance` includes the sponsored gas
prefix. `makeAdmissionPolicy` accepts the actual newly deployed contract ID;
do not register the offline fixture's hard-coded ID 1000 as a live policy.

Both clients require the staging domain/endpoints and fresh output directories.
They persist requests, broadcast intent and returned RPC receipts separately.
An RPC acknowledgement is not inclusion. Ambiguous outcomes must be reconciled
against the exact public identity/end leaf before any subsequent mutation.
Private ordinary-wallet files stay outside tracked evidence; never export them.

## Scope and lifecycle

- The proven universe is **up to four accepted entries in one vault epoch**.
  Unaccepted user intents, users absent from the queue, and other markets are
  outside this scope. Admission can still be censored. This is not a proof that
  every market order was included or that admission itself is globally fair.
- `start_epoch` fixes a monotonically increasing epoch and checkpoint cutoff
  (at most 128 checkpoints ahead). User `request_admission(epoch, cutoff)` binds
  consent to the current signed order nonce and requires that epoch already open.
  Consent immediately locks immutable terms until proven epoch closure, including
  a sender omitted from the accepted queue. Historical nonmembership is not an
  exit authorization. Opening an order alone is not
  sufficient queue consent. An ordinary wallet must prove that consent call.
- `admit_entry` reads authenticated foreign user order/consent state, requires
  the correct vault, unconsumed nonce, explicit epoch/cutoff consent, no duplicate
  owner, room in the queue, and checkpoint <= cutoff. Insertions sort unique
  owners. It records a Poseidon commitment to immutable order terms.
- Cancellation is excluded from that immutable-terms hash so cancellation before
  batch commitment can yield a refund. Cancellation after batch commitment
  follows the existing frozen-snapshot rule. Funding is snapshotted by the batch
  commit, not represented as having been frozen at the admission cutoff.
- `seal_epoch` requires checkpoint > cutoff and a nonempty queue. It derives the
  root from network/contract/vault domain, epoch/cutoff/count, all owners/nonces
  and order hashes. The Executor cannot supply a replacement root or append
  entries after sealing.
- `commit_batch` must contain exactly the sealed queue's sorted owners/nonces,
  and authenticated current terms must match the admission hashes. Its batch
  commitment also binds queue root/epoch/cutoff/count. No implicit NFT listing
  references with nonce zero are accepted: sellers and buyers must each consent.
- Market contracts retain their own verifiable execution order and price/time
  checks. On `finish_batch`, every admitted member is trade=1, refund=2, or
  legal carry=3. Only existing Book/NFT carry rules permit carry. There is no
  arbitrary exclusion branch. The queue root and results fold into a history
  commitment. External history blobs are needed to reconstruct old epochs.
- Batch expiry keeps the accepted queue sealed. Recommit cannot change scope.
  A nonempty queue cannot be discarded through the empty-epoch abort method.
  An expired empty queue can abort. A new epoch requires terminal queue state.

Admission state writes share the vault and must serialize. Users can submit
intents in parallel; receipt into the single authenticated queue is not fully
parallel. Local compare-and-commit race tests are not network scheduler tests.

## Fees and key

The new maintenance templates prepend `fund_gas(payer,F)` and native claim to
each start/admit/seal/empty-abort operation, with F=1,000,100,000 base units.
The payer must authorize that sponsorship and fund the outbox with a fresh
nonce. The full stack includes the final automatic burn. The original spending
policy caps burn at the budget for <=100 modified leaves. Operator sponsorship
is separate from user order escrow; admission is not represented as free.

All logical slots remain constrained. `compact-v1` skips only the exact market
zero-input noop identity after canonical slot binding; it reconstructs the
actual stack/count and UPS session digest. This is a new key/fingerprint and
must be registered with a new vault after release gates are satisfied.

## Evidence boundaries

See `docs/security/MARKET_BATCH_RELEASE_REVIEW_20261020.md` for current results.
The VM suite covers explicit consent, omission, duplicate/forged owner, swapped
batch root, legal carry, cancellation/refund, expired empty queue, timeout and
recommit, and eight workers racing one vault anchor. Full vault admission UPS
proofs run separately; ordinary user/sponsor calls in those synthetic fixtures
are VM-only. Separate real ordinary consent, admission, settlement and payout
claims are recorded in `MARKET_BATCH_LIVE_ACCEPTANCE_20261020.md`; do not
interpret the synthetic proof count as network acceptance.

Randomness is disabled, including rejection of seed/source configuration. A
future mode needs authenticated pre-seed inclusion, unbiased future source,
full permutation checks, tie rules and anti-abort recovery before activation.

## Real deployment build path

`liveSupport.mjs` and `liveMarket.mjs` provide explicit isolated acceptance
helpers for the new ordinary-wallet and compact signing clients. Callers supply
reviewed dependency roots, new deployment receipts, binary paths and owned test
wallet paths. Wallet secrets are never copied into the public output directory.
They do not change the existing Executor daemon's routing or Node.

Every mutation has a fresh directory and durable request/intent. An RPC `ok`
means submitted. UPS completion requires a matching historical user leaf and
indexed content-hash receipt; deployment completion requires the initial-layout
proof's exact code, whitelist, layout, height and counts to match the assigned
contract leaf. Registration acknowledgement is reconciled against the public
identity mapping and indexed registration receipt. Failed or unknown mutations
are never automatically retried. A restart reconciles the saved attempt first.

Timing metadata uses integer milliseconds. Payload serialization rejects unsafe
numeric values rather than silently rounding a two-limb amount. Real acceptance
logs may overlap proving jobs; they are not a controlled throughput comparison.

`build.mjs compile` builds one fresh candidate before its ID is assigned. It
validates the domain, asset ABIs/heights and native used-method identities, and
freezes source/config/assets/artifact hashes. `build.mjs bind` requires the actual
assigned market ID and rejects changed inputs or asset aliases. Its output is
not a deployment receipt or verified live dependency set. The runtime guards
still verify actual registered identity and code/layout/function roots.

```sh
node batching/admission/build.mjs compile --market amm \
  --compiler /absolute/frozen/compile_batch --native /absolute/native.json \
  --token-a /absolute/token-a.json --token-b /absolute/token-b.json \
  --nft /absolute/nft.json --config /absolute/config.json --out /absolute/fresh-build
node batching/admission/build.mjs bind --build /absolute/fresh-build \
  --market-id ACTUAL_ID_FROM_CONFIRMED_DEPLOYMENT --out /absolute/fresh-policy
```

The explicit isolated profile in
`batching/dependencies/staging-bundled-regtest-20261020-v1/` matches the stable
source Node verifier and Type-E common data. It is selected explicitly, never
by trying domains until a request succeeds. Domain checks, full key/session/stack
checks, fee/end-point and live root checks remain. The default sepolia-config
profile does not match that bundled verifier and must not be broadcast by the
new clients. Regtest-domain reuse and runtime image/upgrade trust remain release
gaps; the profile is not production approval.

`liveAcceptance.mjs` is the dated, owned-wallet four-market fixture, with explicit
order, queue and sealed-set recovery entry points. A restart confirms existing
preflight identities first; it does not overwrite calls or regenerate unresolved
mutations. `liveNftRecovery.mjs` separately deploys/tests the missing-seller refund
correction using a new NFT contract/key/vault after complete offline proofs. Its
live epochs exercise buyer-only refund, ordinary claim, and a subsequent unique
sale of the same held listing. It requires the original two rounds to finish so
the ordinary actors cannot race their own unrelated nonces.

`summarizeLive.py` verifies saved exact historical-leaf receipts against full UPS
metadata and emits both full-fixture and settlement-wave measurements. Native
fees use charged physical leaves, not the number of logical slot-update rows.
It requires terminal results and ordinary claims; it never treats an RPC `ok` or
an unverified trace as successful settlement. `archiveEvidence.py` writes a fresh,
public-only gzip archive with exact source and compressed SHA256 values. Wallet
files remain outside its explicit allowlist.

## Reproduce application regressions

Use a fresh admission fixture and the same frozen compiler, rather than an old
compiled NFT candidate. These commands do not broadcast:

```sh
node batching/admission/prepare.mjs --compiler /absolute/frozen/compile_batch --assets /absolute/frozen-v2-assets --out /absolute/fresh-admission
ADMISSION_BUILD=/absolute/fresh-admission ADMISSION_COMPILER=/absolute/frozen/compile_batch node --test batching/admission/build.test.mjs batching/admission/reader.test.mjs batching/admission/liveAssets.test.mjs executor/chainReceipts.test.mjs
```

The final recorded invocation used the distinct v3 fixture and passed all 17
application tests. Complete UPS, VM and live acceptance evidence are separate
sections of the release review; this command does not reproduce those proofs.


## Exit and no-service boundary (new consent-lock candidates only)

Before signing consent, a cancelled sender can call `release_unaccepted` then
`request_recovery(vault)`. After consent, first finish or timeout-close that
epoch using the public SD-key and gas. A terminal same-epoch phase or later
monotonic epoch is required even if that sender was omitted. A proof from an
older nonmembership snapshot cannot unlock the order. Accepted members must
have trade/refund/legal-carry dispositions; zero-funded members can terminalize
through `refund_funding_0`. This rule is required because different users' UPSs
have different own anchors and foreign reads authenticate source snapshots.

An alternative operator can use the pinned public policy/identity/dependencies
and `executor/run.mjs CONFIG scan|reconcile|once`. Explicit inactive, enrolled
`users` are recovery hints. Positive FT/native returns and NFT FIFO deliveries
must be claimed by the original ordinary wallet. Gas, a prover, available RPCs
and chain progress are prerequisites; finite queues do not guarantee service,
global inclusion or censorship resistance. Do not call new ordinary methods on
older deployments, including the prior NFT 2472 comparison baseline.
