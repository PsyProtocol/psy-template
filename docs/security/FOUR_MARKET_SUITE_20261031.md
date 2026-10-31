# Four-market build, policy identity and registered recipient — 31 October 2026

This continuation starts from `99a1bc392dca4087384a718d8e4a1e6fb7e1e0bd`
on `markets-batch-capacity-recovery-20261020`. The workspace was clean and no
financial/proof task was running. Root remained the sole financial owner.
The frozen mainnet-beta SDK `c92880c8b6e2c8d392f19368bc8801a2584fd427`, client,
backend and Cargo lock are unchanged. No Node, old contract, old request or
original artifact changed. No browser acceptance is claimed.

## Actual implementation

The new [market suite entry point](../../batching/market-suite/build.mjs)
compiles all four existing deterministic stream implementations and binds their
complete policies to explicit unique contract IDs. It is offline-only and has
no wallet, signer or network-submit interface. The implementation is documented
in [its README](../../batching/market-suite/README.md).

| Contract | Source implementation | Actual candidate result |
| --- | --- | --- |
| AMM | [shared stream generator](../../batching/checkpoint-stream/generate.mjs), underlying existing AMM functions | Compiled; policy v5 and complete source/cursor/refund interfaces retained |
| Bonding Curve | [shared stream generator](../../batching/checkpoint-stream/generate.mjs), underlying existing curve functions | Compiled; candidate graduation target changed from fixture 202 to registered QA user 1639168 |
| Orderbook | [triangular pair generator](../../batching/checkpoint-stream/pair-optimized-generate.mjs) | Compiled; v9 whole-order global price/time priority and invalid-winner recovery retained |
| NFT Market | [triangular pair generator](../../batching/checkpoint-stream/pair-optimized-generate.mjs) | Compiled; v9 per-listing buyer priority, unique sale and refunds retained |

This assembles existing market functionality; it does not replace it with new
mechanisms. Shared vaults, deterministic ordering, U124 quantities and original
pricing/matching semantics stay intact. AMM/Curve processing preserves source
coverage and ordered shared-state updates. Book/NFT preserve complete remaining
set scanning and winner-specific rejection/refund constraints.

An actual build-interface gap is closed: the old pair-policy fixture script
hardcoded market ID 1000. `makePairOptimizedPolicy` now late-binds every stream,
base, operation and refund descriptor. The old CLI still generates its original
fixture format; importing the constructor no longer executes that CLI. Tests
compare the original v9 policy files byte-for-byte and leave all saved proofs
unchanged. Existing proof results are not rerun or counted as new acceptance.
New assigned IDs still require fresh key/full-UPS verification. Both policy modules
now have direct-entry CLI guards: importing the suite from an application with
one configuration argument cannot execute fixture-writing commands.

The unified path rejects wrong SDK/domain/compiler pins; unknown artifact roles;
asset/collection/market aliases; missing or duplicated assignments; source,
configuration or bytecode changes; and a profile-label substitution. It validates
actual dependency method IDs/arity against the ABI, matching FT selectors, and
independently audits every foreign state read after compilation. An ABI with
matching shape cannot hide a changed actual transfer/claim method selector.
Original artifact bytes are preserved, including full-width integers.

## Real registration, original identity only

One independent step could proceed without the faulty contract-8 metadata:
register the **original QA wallet created with the issuer on this reset chain**.
The subphase was declared before sending: one registration, zero new contracts,
zero UPSs, zero asset transfers/mints/new proofs, original key only, one send,
120-second POST bound and finite read/receipt bounds. This uses the existing
three-registration parent ceiling; it does not expand it.

The script read only the original public QA metadata. No private wallet file,
password, mnemonic or signing witness was read, created or published. Fresh
checkpoint-1/Native/client-resource checks matched the prior accepted capture;
the original public key had no mapping. Exact request, wire, intent and one-send
lock were persisted before one registration POST. It was not repeated.

- New QA user: **1639168**.
- Public-key hash: `7775a685fa2a9bf87911c38aa80b88723534b77be554b605125d99901a2babe6`.
- Included registration checkpoint: **25962**.
- Registration-tree index: **6163**.
- Indexed event and exact included receipt match that user and original key.
- Frozen verifier checks complete registration, checkpoint and chain-anchor
  Merkle paths relative to the explicitly captured coordinator tree root.

This establishes registration membership and original local provenance. It is
not independent consensus finality, current private-key possession, an ordinary
UPS, initialization, funding or a successful graduation/claim. The QA account
still has zero stored public key/nonce and zero Native balance; its first UPS
has not been accepted. `graduationFundingAllowed` remains false.

At common checkpoint **25987**, issuer 223232 remains nonce 1 and Native balance
**998.999998 test PSY**. The QA account is nonce 0 / zero spendable Native. No
owned-account debit or token movement is added by this registration.
Parent totals are now two of three registrations, one of three new contracts
(the preceding QA FT 8), one of 16 UPS sends and 1.000002 of 20 test PSY fees.
Both faucet requests remain consumed. No new faucet request was made.

## Candidate recipient binding and safe compile reuse

The first suite uses explicit provisional asset/collection IDs 42/43/41 and
synthetic policy IDs. Its original Curve target 202 is clearly labelled a fixture.
After real registration, a **fresh** suite sets the Curve target to 1639168.
Only Curve source changes and recompiles. The three unchanged source/artifact
pairs are copied from the explicitly pinned prior build, after checking every
member, SDK/client/backend, chain/network, compiler and dependency hash. The
foreign-read audit runs again and all policies regenerate for the configuration.

This optional reuse handles immutable compiler output only. No old key,
transaction proof, checkpoint/state witness, nonce, fee or signature/session
context is reused. A wrong manifest digest, another chain instance or a changed
dependency rejects before output. Private control, live IDs, full UPS and
funding authority are not inferred from the new candidate target.

Two local launcher mistakes are retained: the review runner was first invoked
from the repository instead of the evidence case, and a packaging preparation
was invoked from the case instead of the repository. Both stopped at missing
local paths before any child/proof/financial operation. Corrected invocations
used fresh outputs and preserved compiler results; no financial request or
source compilation was repeated.

## Current actual network stop

The bounded initial observation at checkpoint **25863** sees inconsistent
contract-8 metadata from Realm 0: two reads return **[31] then [0]**; Realm 1
returns **[31], [31]**. A final fresh observation at **26033**, after the
registration/build work, still returns **[0] then [31]** from Realm 0 and
**[31], [31]** from Realm 1. Both complete read sets are retained. No asset operation, QA B deployment or market deployment
was attempted around this failure. The original QA FT 8 request remains included
at 25363 and is not resent or replaced.

The preceding [metadata handoff](UPSTREAM_REALM_METADATA_HANDOFF_20261031.json)
continues to apply. Runtime operators must restore reliable coordinator-to-Realm
height synchronization and demonstrate correct state/proof reads for the exact
included contract. The application cannot inject a replacement height or route
this user's state reads through another Realm to bypass that condition.
Finite read retries remain read-only and fail closed.

## Validation actually performed

- Four real source/bytecode compilations with sealed frozen compilers; an
  additional QA NFT candidate compiles at height 30. NFT and market IDs in
  these outputs are **provisional offline fixtures**, not new network assignments.
- All four foreign-read audits pass (Native 32, FT/market 31, NFT 30).
- Seven actual-builder integration tests cover all four outputs, complete
  late binding, ID aliases, pin/domain/payment substitution, source/bytecode
  tampering, changed foreign proof height and exact old-policy preservation.
- Five final preserved-artifact review tests cover actual ABI/function binding,
  mismatched FT selectors, profile substitution and client/backend/domain declarations, without recompiling.
- Three immutable-cache rejection tests pass; the actual new-recipient build
  confirms exactly one changed-source compile and three byte-identical reuses.
- Sixteen existing stream/priority/refund generator regressions pass.
- An actual child-process import with one configuration argument confirms no
  fixture CLI executes or reads/creates the supplied path.
- One actual public registration is included and its complete Merkle membership
  verifies. No new financial ZK proof, market UPS, fill or ordinary claim occurs.

These are separate evidence layers. These regression results are not a substitute
for the explicitly missing current-instance full UPS and real settlement.

| Measured task | Whole invocation | Sampled family RSS peak |
| --- | ---: | ---: |
| Three application compiler tools, existing Cargo cache | 47.474 s | 1212912 KiB |
| Initial four-market integration including compilations | 6.212 s | 609552 KiB |
| Saved-artifact review | 2.067 s | 557424 KiB |
| Actual-recipient candidate build, one compile/three reuses | 3.115 s | 649520 KiB |

These are build/review measurements. Configurations and tasks differ; they are
not matched cold/warm proving samples or an end-to-end speedup comparison. There
is no new settlement/confirmation/claim throughput, p95 or physical-memory-peak
claim. One-second process-family RSS can count shared pages twice and miss peaks.

## Explicit remaining gates

1. Reliable current-chain contract metadata, actual QA B/collection identities,
   their verified initial layouts/bytecode and exact current-instance resources.
2. Fresh empty-vault registration/authorization/bootstrap for the selected
   deterministic profiles, actual assigned IDs, full ordered stack/session/
   sig_hash, fee/nonce/state-endpoint proofs and independent exact replay.
   The producer-random minimum/bootstrap profile is not substituted for these
   deterministic candidates or labelled randomness-ready.
3. Complete source inventory, deadline/proving and fee budget for the finite
   checkpoint scope. Existing source windows are 32 checkpoints. Cross-page
   correctness does not by itself show the actual inventory fits that window.
   Admission/cancellation precedence and service liveness remain explicit gates.
4. Per-market funding, real fill, ordinary-wallet claim, refunds/recovery,
   actual extension approval and UI connection. The dedicated browser wallet
   remains locked; no reset, history deletion or approval bypass was used.
5. A new bounded four-market live-instance plan. Two QA FTs, one collection and
   four markets require seven contracts, plus their keys and user identities;
   the current three-contract/three-registration ceiling cannot cover that
   entire run. No ceiling was silently raised or extra live instance deployed.

The source/compile/late-binding milestone is complete. Four current-chain market
products, live UI settlement, qualified randomness and production acceptance
are **not** complete. Cross-vault workflows still require separate UPSs and
confirmed intermediate claims; proof aggregation is not same-pool parallelism.
Finite source coverage is not global censorship resistance or every historical
order event.

[Public evidence inventory](../../executor/verification/2026-10-31-four-market-suite-v2/README.md).
The original local case is `four-market-current-20261031-v1` under the existing
evidence root. Original failures, requests, locks, artifacts and prior proofs
remain unchanged.

The first public pack is retained as a pre-import-guard snapshot; v2 is the
current source package. Its contract bytecode, registration and financial
records are unchanged. No proof or financial request was repeated for the
import-only correction.
