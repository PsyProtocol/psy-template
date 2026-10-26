Latest continuation (2026-10-26): [Executor/two-pool checklist](EXECUTOR_COMPOSITION_CONTINUATION_20261026.md). Cold/warm source compilation is measured; unstable broad scan concurrency was withdrawn. Actual two-pool pair entry/regressions are ready, but four readonly preflights returned503. No new finance; sustained/Book→AMM not started. Local tests/build time are not new confirmed throughput or production evidence.

RPC follow-up06:22–06:29UTC: fifth full preflight and three endpoint rounds still fail: seven HTTP503/two transport failures, no finance. [Originals/constraints](../../executor/verification/2026-10-26-rpc-recovery-followup-v1/README.md). Quiet15-minute checks resume the original plan only after recovery/full preflight.

Further diagnosis/resource reuse: [fixed-verifier review](FIXED_VERIFIER_PERFORMANCE_REVIEW_20261025.md).

> Memory/full-proof progress: [memory review](PROVER_MEMORY_REVIEW_20261025.md). Historical missing cold timings remain missing; measure new runs separately.

# Four-market release review: ordered evidence gates

> RPC/ordinary-wallet update, 2026-10-25: two rounds on the same QA Book each completed an actual fill and claims; 34 actual UPS/full proofs and asset chains independently verify. Warm fee/claim client stages improved; commit+settle preparation stayed near 260 s. Confirmation variance, longer cutoff waits, memory costs and missing samples remain. See [pair/evidence](RPC_ORDINARY_PERFORMANCE_REVIEW_20261025.md). No whole-round or chain-TPS acceleration is claimed.

> Final update, 2026-10-25: all three markets confirmed one actual fill and ordinary signed-wallet claims; 48 actual UPS and 51 distinct full proofs independently audited. NFT restart reused the original UPS; native rejection of an unexpired consumed proof passed. [Final report](THREE_MARKET_LIVE_PERFORMANCE_20261025.md) records fees, cold/warm timing, confirmation/memory methodology, failures and open work. Earlier pending entries are chronological, not the final closure index. No production or chain-TPS improvement follows.


Branch: `markets-batch-capacity-recovery-20261020`. Historical outputs in
`batching/evidence/20261020/` remain immutable. New experiments use fresh paths.
No Node worktree changes or old-contract upgrades. New isolated test deployments are authorized after actual compatibility checks; live results are recorded only when obtained.

## Stage status

| Stage | Completed | External dependency / unverified |
| --- | --- | --- |
| 1 SDK and upgrade authority | Stable SHA/source diff frozen; 30 path crates reconstructed; offline/locked check and release build passed; four fixed40 public identities reproduced | Not an upstream published SDK; runtime binary/image identity and effective authorization path not attested |
| 2 Complete proof cost | Sequential ABBA: all 32 full UPS proofs passed, equal state roots/fees, two samples/profile/market; compact reduces measured warm commit+settle cost by 65.6–78.8% | Offline synthetic checkpoints; cold costs separate; not chain TPS, production P95 or an online Executor latency claim |
| 3 Admission completeness | Four-market bounded consent/omission/disposition VM checks passed; 32 complete vault admission UPSs and 16 expiry/refreeze/refund UPSs passed | Synthetic ordinary authorization remains VM-only; real ordinary consent, admission and settlement confirmed in both paired fixture rounds; accepted scope excludes unaccepted market intents |
| 4 Future random order | Deterministic mode retained | Unbiased authenticated future source, actual inclusion-before-seed evidence and anti-abort protocol unavailable |
| 5 Isolated network | Four new markets/keys activated; two real paired fixture rounds, 82 UPSs, ordinary claims, refunds, timeout/refreeze, four admission races and lost-ack recovery confirmed across both realms; replacement 2472 refund, unique sale, exact payment and conservation confirmed | Production provenance/upgrade authority, existing daemon routing and production liveness remain unverified |

## 1. SDK source contract

The observed `release/testnet-stable` SHA remains
`6eb535003bdab1fcdb27386dbcb93e8aa9727998`. Three existing local dependency
changes provide: (a) reconstruction of the exact UPS signature digest including
full call stack/count, start/end/checkpoint/session context and network domain;
(b) witness representation; (c) prover population of that context. Stable source
lacks these APIs/constraints. API presence alone is not a security proof.

`batching/dependencies/session-bound-sdk-20261020/manifest.json` records the
30 path packages, 1,466 tracked source-file hashes, base commit, explicit existing
SDK delta, public network config, Cargo.lock hash, toolchain and host. The
materializer reads Git objects, applies only the recorded delta into a **fresh**
directory, verifies the entire consumed source list, and rejects overwrites.
The original Node tree and its unrelated MCP edits are preserved.

This produces an application dependency snapshot. It does not assert upstream
approval, public release, a bit-identical binary on another toolchain, or runtime
service identity. Existing negative digest/stack tests remain required.

### Evidence requested from owning teams

These are proposed evidence contracts, **not existing RPC capabilities**.
The checked stable coordinator/standard edge RPC declarations expose no build
version method. Branch confirmation alone does not close runtime identity.

1. **Runtime identity (operations):** authenticated deployment manifest for each
   coordinator/realm/edge: network magic/realm, Git SHA + dirty=false, image digest,
   executable SHA 256, build lock/toolchain/config hashes, deployment time and
   operator signature/attestation. Validate the running image against immutable
   registry/build provenance, not a user-supplied version string.
2. **SDK release (SDK/security):** immutable reachable source revision or signed
   archive + SHA 256; exact Cargo.lock/toolchain/config/features; session-context
   digest derivation; expected fingerprints; clean reconstruction commands and
   successful wrong-stack/count/network/nonce/checkpoint/start/end/root rejection
   tests. Do not release by removing constraints.
3. **Upgrade authorization (protocol/security/operations):** locate actual
   method-level control or authenticated proxy policy. Provide its implementation
   and effective deployed configuration, authorized identities, rotation/revocation
   and deny-by-default policy. Authorization must bind network, contract, expected
   old code/layout/whitelist roots, new roots/layout endpoints, nonce and expiry.
   If immutability is relied upon, provide a verifiable immutable flag/mechanism
   and demonstrate that *every* update route enforces it.
4. **Isolated rejection acceptance:** wrong signer; matching deployer field but
   no authorization; replay; expired authorization; root/contract/network/body
   substitution; bypass of proxy/direct edge route. Preserve request/body hashes,
   denial receipt/log and unchanged state. Never use a live update as the probe.

Source observations remain in `UPGRADE_AUTHORITY_REVIEW_20261019.md`; layout
validity/deployer equality do not establish authorization. Pinning roots in one
Executor cannot protect every public SD-key executor or close the final-read
upgrade race. These remain production release evidence requirements. Isolated new test deployments may proceed after our actual compatibility preflight, as clarified by the user; the runtime version string is not a mandatory proxy.

## Stage 2: compact actual-call key experiment

The application `batch_compact` key retains 40 fully constrained logical slots
and the original canonical policy. A slot may be skipped in the *actual* stack
only when its identity is the exact market noop; the policy still constrains
its caller, zero arity and canonical input hash. Every other slot participates
in the hash chain and count, including the final native burn. The application
reconstructs the full session digest with the same network/user/nonce/start/end/
checkpoint/sign-context binding. No generic SDK check is removed.

This is a new circuit/fingerprint and **not** an in-place old-key optimization.
The ordinary SDK wallet route still requires exact configured counts; compact
execution is currently an explicit application fixture signing path. It must
not be enabled in the existing Executor by changing a profile label.

All four markets' operation templates and 13 actual-stack/session/padding attack
classes per market passed, both for V2 policies and extended admission policies.
An isolated rebuild also reproduced the four existing fixed40 public identities.
The controlled full proof comparison has now completed. `compare-full-ups.py` freezes the
binary/artifacts/assets, runs fixed40 → compact → compact → fixed40 sequentially
at Rayon=4 with two fills/market, checks complete verified linked UPS endpoints,
identical contract state roots/fees, actual call counts and absence of compact
noops. It reports cold construction separately and never supplies chain TPS.
No other proving/compilation was run concurrently during that comparison. Light
source/document reads, small JS reader tests and Git fetches continued; this is
not a dedicated host/CPU-governor measurement or a production percentile study.

### Complete UPS measurements (2026-10-20)

Full evidence: `batching/evidence/20261020/staged-release-v1/full-ups-abba/`.
One worker, Rayon=4, fixed40 → compact → compact → fixed40, identical two-fill
market inputs. Each row is the median sum of commit and settlement full proofs
(two samples per profile), including recursive proof and end-cap verification.

| Market | Fixed40 seconds | Compact seconds | Reduction | Actual calls commit/settle | Offline fills/second (compact) |
| --- | ---: | ---: | ---: | --- | ---: |
| AMM | 303.206 | 64.401 | 78.8% | 3 / 11 | 0.0311 |
| Orderbook | 297.299 | 94.525 | 68.2% | 3 / 19 | 0.0212 |
| Bonding Curve | 294.260 | 71.325 | 75.8% | 3 / 13 | 0.0280 |
| NFT Market | 297.103 | 102.326 | 65.6% | 3 / 21 | 0.0195 |

The fixed40 key executes 40 calls in each UPS. All 32 full proofs verified their
end-cap metadata and exported state deltas. Both profiles/replicas have identical
final contract roots, modified leaf counts and actual native burns, and each
commit end leaf equals its settlement start leaf. New key fingerprints and
intermediate user leaves differ as expected. Compact steps contain no noops.

Cold per-market circuit construction is measured separately in each raw report
(about 53–68 seconds here) and is not hidden inside warm proof throughput. New
queue admission operations and ordinary-wallet sponsorship/claims are outside
this two-fill comparison. The existing Executor may re-prove on submission;
these figures do not include RPC, confirmation, restart, or repeated process
initialization. The source is still fixed at 40 constrained logical slots;
recursive/end-cap cost remains, and no unmeasured speedup is claimed for it.

## Stage 3: bounded authenticated admission candidate

`batching/admission/` creates distinct new layouts/code roots. The proven scope
is four or fewer **accepted** entries in one vault epoch, not every requested
market order. Explicit signed user consent binds epoch/cutoff/order nonce;
authenticated foreign-state reads bind order/vault/unconsumed nonce and terms.
Admission serializes in the shared vault. Sealing after the cutoff derives the
queue root from its full contents. Batch commitment must include the exact
sealed set and also binds queue root/epoch/cutoff/count. Cancellation is excluded
from the immutable terms hash; funding remains a later batch-commit snapshot.

Finish requires every accepted member to be a trade, refund or existing legal
Book/NFT carry. There is no arbitrary exclusion method. Root/outcomes fold into
a history commitment; historical blobs still require publication/retention.
Timeout leaves the queue sealed; only an expired **empty** epoch may abort.
Start/admit/seal/empty-abort maintenance templates include separately authorized
and claimed gas sponsorship with fresh payer nonce and bounded final burn.

Four VM groups passed: consent/omission/duplicate/forgery/root rejection plus
expiry/refreeze/results across all markets; AMM/Curve cancellation refunds and
empty recovery; Book/NFT legal carry; eight contenders for one anchor then
capacity enforcement. These are actual bytecode with a local compare-and-commit
model, not a coordinator scheduling or ordinary-wallet proof. The full vault start/admit/seal/commit/settle chains have completed: eight
linked UPSs per market, four accepted members each (AMM/Curve four fills;
Book/NFT two fills). Sixteen additional linked UPSs cover commit, expiry,
refreeze and refunds. All verify complete metadata/endpoints/exported deltas.
Their observed costs overlap builds and wallet initialization and are not the
controlled ABBA comparison. Ordinary consent and sponsor authorizations in
these synthetic fixtures remain VM-only. New compact signing clients exist,
and real market admission/settlement receipts are now confirmed in the isolated paired fixture. The existing Executor router integration remains unverified; do not claim production readiness.

## Stage 4: randomness remains disabled

The generator rejects non-deterministic ordering and supplied seed/source
configuration. There is no local PRNG substitute. The existing coordinator
seed does not establish an unbiased source or anti-grinding guarantee.

Required future interfaces/acceptance (protocol/randomness owners):

- Authenticated historical inclusion proof for the **sealed queue root**, epoch,
  cutoff, vault and actual finalized inclusion checkpoint. A user leaf's source
  checkpoint alone does not prove inclusion before revelation.
- Future seed response containing network/domain, immutable target epoch/checkpoint,
  seed, generating participants/threshold or external beacon identity, authenticated
  inclusion/verification proof, finality/reorg policy and verifiable provenance.
  Seed checkpoint is derived from the earlier inclusion under a fixed rule,
  never selected from a range by the Executor after seeing seeds.
- Circuit verification of inclusion-before-seed, source proof and a complete unique
  permutation derived from domain/queue root/seed/order IDs with fixed tie rules.
- Negative proofs for historical/chosen seed, domain/root/epoch substitution,
  duplicated/missing permutation members, post-revelation addition and resealing.
- An anti-abort rule: timeout must retain the same root **and seed target** or use
  a predefined terminal disposition. A fresh epoch or sponsor may not silently
  redraw the same admitted scope. Define selective withholding/slashing or fallback
  liveness and its trust/economic assumptions; an unreviewed retry is not acceptable.

## Stage 5: actual testnet compatibility and new isolated deployment

### Completed isolated acceptance (2026-10-21 Asia/Taipei)

The same `markets-batch-capacity-recovery-20261020` branch is used. Original Node
files and prior artifacts are preserved. No existing contract is updated.

- Both realm 0 and realm 1 ordinary native claims have confirmed receipts.
- New QA U124 FT-A = 2464, FT-B = 2466, NFT = 2467. These are newly issued test
  assets; they are not the existing pUSDT. Gas is actual faucet test PSY.
- Bob 860352 is the issuer of both FTs and the NFT. FT-B has the separate owned
  Sponsor deployer: deploying identical code again with the same deployer
  returned FT-A's existing content hash, so that duplicate was not counted as
  a distinct asset. Requests and duplicate response remain preserved.
- Bob minted 1,000 tokens of each FT at 18 decimals and sent 50 of each to the
  new ordinary wallet 876736. The receiver claimed both plus 25 test PSY from
  Sponsor 1384640 across realms in one complete UPS, included at checkpoint
  356284. Its final FT balances are 50,000,000,000,000,000,000 base units each;
  native balance is 23,999,992,000 after the UPS fee. Both amount limbs matter.
- The NFT metadata and first two sequential NFTs were also minted by a real
  ordinary UPS, included at checkpoint 356284.
- The acceptance wrapper initially failed while serializing fractional timing
  metadata **after** three ordinary broadcasts. No mutation was repeated.
  Existing durable intents were reconciled against their exact historical
  leaves and indexed receipts. Timing now uses integer milliseconds. This is
  evidence of ordinary-driver restart reconciliation; it is not yet a market
  Executor transport-fault test.
- Spread, 64-aligned IDs in multiple realm ranges pass the VM leaf-budget
  check for all four markets and trade/refund paths. Observed commit maxima:
  40 leaves; settlement maximum: 68, below the policy's 100-leaf fee budget.
  This VM result is not represented as a proof or network throughput result.

Follow-up: all four new market deployments, compact registrations and activation
UPSs are confirmed. Curve stock initialization is also confirmed. The live IDs,
root/receipt checks, real lost-ack recovery and remaining admission/settlement
matrix are tracked in [the isolated acceptance report](MARKET_BATCH_LIVE_ACCEPTANCE_20261020.md).
New SDK-only clients reuse the existing session manager and verify the whole
proof against the pinned Node key/common, retaining call/session/fee/endpoint
guards. Eight stored real UPSs plus PI/count and wrong-key negatives pass this
re-verification; it is not a proof-generation speed measurement. See
`batching/evidence/20261020/staged-release-v1/session-manager-reuse/`.
Successful deployment and activation alone do not complete stage 5.

User clarified that testnet validation should proceed directly after our own
compatibility checks. An independently attested runtime version string is useful
provenance, **not a mandatory proxy for capability testing**. The SDK session
binding difference is client-side; it does not prove the service rejects a new
self-verifying signature circuit. The application snapshot has been reconstructed
and release-built; public fixed40 identities reproduced. The new key still needs
its complete UPS evidence before funds are used.

Proceed with new contract IDs, new keys and vaults, small faucet-funded test
amounts and reviewed initial 0 → N layout proofs. Verify real RPC behavior,
code/layout/function-whitelist roots, endpoint/count/fee consistency and new
proof acceptance. Do not modify Node or send old-contract updates. Record runtime
identity as unknown if it cannot be attested. Effective upgrade authorization
and its last-read race remain production security gaps; a successful isolated
new deployment does not establish immutable contracts or upgrade authorization.
Capture network/realm/checkpoint and immutable identities for every request.

The ordinary isolated-wallet and compact signing adapters compile in this
application, preserving the old SDK's checks and the existing Executor route.
Two profile/transport guard groups pass. Real native ordinary-wallet evidence
is recorded below; full compact admission, commit and settlement signing has been accepted by both staging realms in the isolated paired fixture.

The acceptance matrix must include registration, admission, commit/settle,
ordinary wallet recipient claims, cancelled/expired/partial funding refunds,
nonempty sealed-queue timeout/refreeze, two Executors competing for the same
vault nonce/root, lost broadcast receipt reconciliation against exact terminal
leaf, restart with persisted intent, and old-input replay rejection. Save
request/receipt bytes or canonical payload hashes, endpoint/fee/transaction counts,
state roots, source input hashes, confirmation checkpoint and final balances /
NFT identity. Never store private keys, mnemonics or wallet recovery files.

A passing test count is not a release decision: accepted-scope limits, runtime
upgrade trust, ordinary-wallet coverage, independent security review, retention
and liveness remain separate evidence gates.

## Authenticated cutoff semantics: do not overstate wall-clock guarantees

Contract checks use the UPS **authenticated source checkpoint**. The sealed
queue state/root provides the immutable membership cutoff: no entry can be
added to that state once seal wins the same-vault nonce/root race. The numeric
checkpoint cutoff controls source-context eligibility. It has not been proved
that every admitted entry was actually included before that numeric checkpoint,
or that every cancellation confirmed before the later broadcast is honored.
Current ordinary-wallet and Executor code uses current RPC state; that local
choice cannot constrain every other public SD-key prover.

The reviewed stable edge block checks the current own start leaf, rejects future
source checkpoints and enforces ordering relative to the user's previous
checkpoint. A network-wide actual-inclusion freshness bound has not been
established. Freeze/root/time tests must distinguish source context, seal
receipt/inclusion and real submission/confirmation. Do not label the queue a
hard wall-clock admission deadline or use source checkpoint as proof of
commit-before-random-revelation. Future source freshness/inclusion capability
remains a protocol evidence requirement. No Node change or update probe was made.

## Team overview (2026-10-21, Asia/Taipei)

- Dependency snapshot, isolated release and original public-key identity reproduction complete. Node unchanged.
- Same-condition ABBA40-call/compact-key comparison:32 full UPS pass. Two-fill commit+settle proof medians AMM 303→64 s, Book 297→95 s, Curve 294→71 s, NFT 297→102 s. Cold construction separate; not chain TPS/productionP95.
- Authenticated queue candidate passes four-market bytecode safety/recovery. Reader uses only sealed queue, ignores discovery hints,
  and reconstructs all four members even with discovery cap1. Queue lifecycle32 UPS, expiry/refreeze/refund16 UPS verify; ordinary native claims confirm. Two actual batch rounds/claims accepted; new formal Executor daemon route not yet accepted at this historical stage.
- Random ordering off. Sealed scope is not all market requests; authenticated source checkpoint is not actual inclusion time.
- User authorized fresh deployments after application preflight; version strings are not a formal substitute.
  Ordinary/compact entries retain requests/intents/receipts and check code/layout/functions/fees,
  nonce/endpoints. Existing wallets/Executor entry points remain; source presence is not acceptance.
- Upgrade authorization is tracked separately from fresh deployment. Small-value success does not prove immutability or production safety.

`isolated_wallet` only reads its own generated `isolated-market-wallet-v1`
secret schema and writes new secret files mode 0600. No old wallet import is
implemented. Both new clients pin staging endpoints/domain and code/layout/
function-whitelist/count metadata, verify the full UPS locally, recheck current
anchor/nonce and a specified broadcast checkpoint window, and persist exact
request plus intent before one transmission. Unknown responses require exact
end-leaf reconciliation, not a fresh blind retry. These are application guards,
not an on-chain upgrade lock or a hard actual-inclusion time guarantee.

## Actual deployment preflight: network domain separation

The first isolated-client guard correctly refused the offline build before any
registration, faucet or deployment. Offline fixtures/ABBA use localhost magic
`0x1337CF514544CF69` (`1384803358401154921`); the actual configured staging
sepolia domain is `0x1337CF514544C169` (`1384803358401151337`). They differ.
A branch name or common RPC method identity cannot substitute for this check.
Original offline binaries/evidence remain unchanged. At this initial preflight, the same frozen SDK sources
and public multi-network config were rebuilt with `PSY_NETWORK=sepolia`
in a distinct target/output directory. Policy magic, fingerprints and full
stack/session tests must use that new domain; local proof results are not
represented as staging proof acceptance. The client additionally pins the known
staging domain so changing a config label/magic cannot authorize an offline
binary against staging endpoints. No security check was removed.

## Explicit verifier compatibility and first real receipts

Read-only `probe_endcap_profile` compared the immutable SDK manager to the Node
source bundle. `release/testnet-stable` and the consumed SDK base have identical
`end_cap_verifier_data.rs` SHA 256
`fab6e1f6bb62211863e238e81edaa225b832a43a48090faecf0a976cf004b1c7`.
SDK magic `1384803358401154921` produces fingerprint
`d8c6bb2df3bde570c618b9ebb297cf5743e1b017481e0d73ca558209538cb5f7`,
exactly equal to that bundle. Configured sepolia magic `1384803358401151337`
produces `6437629814a1875b3ed5288b1e70e0de9cd8106084dfb933bb56fee86499d166`.
Two locally valid sepolia-domain native proofs fail with the bundled key; Bob's
actual RPC returned `-32001`, `vanishing_polys_zeta` verification failure.
This is evidence of an actual parameter incompatibility, not a guessed version.

The corrected isolated profile is frozen under
`batching/dependencies/staging-bundled-regtest-20261020-v1/`. It requires an
explicit `PSY_MARKET_TESTNET_PROFILE=staging-bundled-regtest-20261020-v1` and a
separate config with the matching domain. It checks config/compiled domain,
staging endpoints, exact SDK verifier-only data **and** Node Type-E common data,
then verifies the full UPS and metadata as before. No automatic fallback,
old-file overwrite, Node edit or security-check removal is used. Both legacy
`"ok"` and hash acknowledgements are preserved as **submitted, not included**;
RPC error/raw-body/HTTP status are saved and require reconciliation.

This is a test compatibility profile. Its magic is shared with regtest, so
unique production chain-domain separation is **not** established. Source-bundle
identity is not a runtime image attestation. A native proof's acceptance does
not establish upgrade authorization, all realm hosts' configuration, or full
market production safety. A future domain migration must account for existing
SD-key fingerprints; do not change Node/network flags as an ad hoc hotfix.

Actual immutable evidence: `staged-release-v1/live-initial/`:

- Alice 1974464, Bob 860352, Sponsor 1384640 are newly created test identities.
  Only public identities/requests are included; private key files stay outside Git.
- Isolated NFT dependency 2463: initial layout **0 → 14** fields, height 30,
  confirmed at checkpoint **356049**; all code/layout/function roots, deployer
  and field/slot counts match the preflight at 356054. This is a dependency
  deployment, not a claim that all four markets have been deployed.
- Bob native claim: nonce **1**, source checkpoint 356119, end leaf
  `1f85d11574b094d691bcc6d4f651cbe3eea9ca050729b9b635f198328bc08f47`,
  included at **356126**, receipt content hash
  `27ecdf0fdc91c2a5fbcf3b377de0a5b37a3900948ef19622132a8c80dafb63bd`.
  Claimed 1,000 faucet PSY; fee **1.000002 PSY** (2 modified leaves, 2 calls
  including burn); confirmed native balance **998.999998 PSY** and claim cursor
  1,000 PSY match the request. Both verifier-only and common-data checks passed.
- Alice's earlier wrong-domain attempt lacks a captured original response and
  remains quarantined/unresolved; it was not blindly resubmitted. Bob's explicit
  wrong-domain rejection, unchanged zero anchor and fresh verified profile
  preceded the corrected proof. All original requests/binaries/configs survive.
- Realm1 profile acceptance, four live admission races, sealed-set commitments,
  expiry/refreeze and both paired fixture rounds are confirmed. Ordinary claims,
  refund/sell paths, exact economic state and full cohort conservation passed.
  Replacement NFT 2472 buyer-only refund, subsequent unique sale and ordinary
  claims are also confirmed; exact payment, inventory and fees reconcile.
  Initial test assets with Alice issuer remain preserved; the actual cohort uses
  separate Bob-issued QA assets.

Native funding is from the official testnet faucet, with full request and receipt
records. Newly issued QA FT/NFT assets must not be described as existing pUSDT.

### Live settlement checkpoint update

The first paired fixture has included full settlement UPSs: AMM 2468 at 356721
(14 actual calls), Book 2470 at 356721 (11), Curve 2471 at 356728 (13), and NFT
Market 2469 at 356720 (12). Each has two accepted members and terminal queue
state. These counts include burn and exclude the canonical virtual noops.
Ordinary recipient claims and full-fixture conservation subsequently passed in both rounds (45 + 37 included UPSs; exact fees 82.001070 test PSY).

Acceptance found an NFT admitted-set recovery defect: a buyer admitted without
its seller could not commit or reach a terminal refund. The replacement binds
computed seller membership and verifies exact owner identity to prevent a missing
seller from aliasing row zero. Actual VM regressions and four complete synthetic
commit/refund UPSs are in
[`nft-admission-recovery-v3/manifest.json`](../../batching/evidence/20261020/staged-release-v1/nft-admission-recovery-v3/manifest.json).
New NFT contract 2472 and independent key/vault 1695936 are confirmed; its live
refund/unique-sale checks, ordinary claims and full cohort reconciliation passed
at 2026-10-20 17:31:02 UTC. Original 2469 artifacts and the paired
fixture remain available. No Node or existing-contract update was made.

Live progress, exact acceptance scope and remaining production evidence are in
[the live acceptance review](MARKET_BATCH_LIVE_ACCEPTANCE_20261020.md).

## Final isolated acceptance result

The two paired four-market rounds and the replacement NFT refund/sale matrix
are complete. Current isolated market IDs are AMM **2468**, Orderbook **2470**,
Curve **2471**, NFT Market **2472**. NFT **2469** is retained as the retired paired
fixture; its missing-seller admission defect makes it unsuitable for general use.

The paired epoch intervals contain 82 included UPSs and 82.001070 test PSY of
fees. Replacement epochs contain another 27 UPSs and 27.000256 test PSY. Exact
FT supplies, AMM/Curve fixture economic state, NFT IDs/metadata/unique ownership,
ordinary recipient claims and native fee conservation pass. New NFT sale proceeds
are exactly 5 FT-A. The combined public ledgers verify 124 included UPS identities
including preparation. Complete receipts, roots and measured intervals are in
[the final report](../../batching/evidence/20261020/staged-release-v1/live-final-acceptance-v1.json)
and [live review](MARKET_BATCH_LIVE_ACCEPTANCE_20261020.md).

Both public archives have verified compressed and decompressed SHA 256 manifests:
1,683 primary files and 488 replacement files. Node’s tracked diff remained
`002e35e0b13cb6c422fe3abf500ce6aa5241229264d85a3314f22b5e14b59a64`;
all 1,466 consumed SDK source files and both frozen client binaries matched.
Original artifacts and failures remain preserved; wallet material is excluded.

This closes the stated bounded isolated fixture, not production release. Random
ordering remains off; all-market inclusion/censorship resistance, authenticated
future inclusion/seed and anti-abort guarantees, actual runtime provenance,
chain-domain uniqueness, effective upgrade authorization, independent review,
production retention/liveness, existing Executor daemon routing and Curve
graduation remain external or unverified scopes. The new NFT live run does not
repeat the original instance’s admission races/timeouts; see the exact matrix.
No test count substitutes for those evidence requirements.

## 2026-10-21 continuation

The current work is tracked in [the production candidate review](MARKET_BATCH_PRODUCTION_CANDIDATE_20261021.md)
and [external deliverables](MARKET_BATCH_EXTERNAL_GATES_20261021.md). Original
archives above remain unchanged. A formal compact Executor route and fresh
accepted-order locking / unaccepted sender exit candidates have been added.
The new VM regression found an admitted unfunded order could otherwise close
and change sealed terms; prior live success is not evidence this issue was safe.
New candidates require fresh deployments and a separate acceptance matrix.
