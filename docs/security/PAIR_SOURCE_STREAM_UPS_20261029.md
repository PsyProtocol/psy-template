# Paired-market source coverage and terminal refund stream — 29 October 2026

## Candidate boundary

This continuation starts at `d871e6c7ab2ec15184206f0a65ce06531050bf17` on
`markets-batch-capacity-recovery-20261020`. It introduces distinct, undeployed
Orderbook and NFT Market candidates. No Node file, SDK pin, old contract,
existing artifact or historical evidence is modified.

The new profile is **terminal-refund-only**, not a completed global trading
engine. It is policy version 7, `source-covered-pair-terminal-refund-v2`.
`trading_enabled` and `live_authorization` are false. Actual `match_orders` and
`settle_sale` entry points fail closed, as do legacy partial batch entry points
and arbitrary partial sorting. A generic policy operation cannot bypass these
checks: the key permits only `refund_funding_*` in settlement mode, and requires
the signed session checkpoint to be strictly later than the immutable expiry.

This restriction matters. Extracting the next source-time minimum does not
prove global price/time priority for whole-order Orderbook matching. Similarly,
NFT buyers and their seller/listing reference can be on different pages. Merely
reusing a four-member local matcher would silently change winner selection.
Those complete trading-frontier constraints remain unfinished. Existing market
pricing and winner semantics are not replaced by time-only trading.

## Complete source and cross-page authorization

The source definition is every eligible **current order at checkpoint C** for
the reviewed vault, including orders opened before C. It is not all historical
transactions, unadmitted submissions, global censorship resistance or finality.

The existing source-covered circuit is extended with two reviewed kinds:
Orderbook (3), and NFT Market (4). Each coverage page authenticates up to four
account leaves from the complete 32-bit source tree. Ascending IDs and exact left
frontiers prevent omitted-prefix continuation. Reconstruction must equal the
committed source user root before the complete eligible count/root is installed.
Nontraders remain in coverage. Funded ineligible active/unconsumed orders for
this vault have a separate recovery root/count; they are not silently
reclassified as trades. Closed/other-vault accounts are not admitted orders or
a census of stray deposits. Stray incoming assets can still use explicit
sender-enrolled component recovery; the source recovery count is not a claim
that every incoming asset on the network was inventoried.

For Orderbook, the source classifier verifies both full U124 funding limbs,
actual claim baselines, order side and quantity, native fee, nonce, consumed
nonce, deadline, cancellation and vault identity.

For NFT, the reviewed dependencies are native PSY, the exact U124 payment FT,
the exact collection, and the market. The collection has height 30 and the
reviewed 35-Felt FIFO stride at 1182. Classification authenticates:

- Sender and vault collection roots at C, FIFO sent and claimed counters.
- The head at `claimed % 4`, its token ID and all four metadata hash limbs.
- Listing sequence `claimed`, sent counter `sequence + 1`, exactly one pending NFT, no payment funding,
  and the exact native fee for an eligible listing.
- Exact U124 price funding, zero pending NFTs and the native fee for a buyer.
- All listing/buyer reference fields in the source terms commitment.

The generic source `paid_b` commitment represents the NFT pending count for this
new kind, not a second fungible asset or a fractional NFT. Actual refund
operation argument `b` remains zero. A separate collection binding prevents
passing a FT as a collection with a matching superficial ABI.

OPEN fixes the epoch, chain instance, checkpoint, expiry C+32, source user root,
code/layout/functions, assets and key. COVER derives complete set roots/counts.
Each refund page proves minimum extraction from the remaining 56-level source
priority tree, removes exactly its members, and binds the resulting root and
settled cursor in the same UPS. The capacity is two terminal members per UPS;
the final one-member tail is allowed only at the original total. There is no
new limit of two members on the entire accepted epoch.

All nine logical calls per refund operation, including padded noops, are bound.
NFT claim, acknowledgement and transfer are kept in their original sequential
operation; they are not incorrectly rearranged into fungible claims-first
execution. Only exact empty market noops are omitted from the actual UPS.
The logical stack remains 40 slots; signature/session context binds the actual
compact ordered stack. Complete signed nonce, fee and state endpoints are
preserved, as are fresh signed-checkpoint dependency proofs for every UPS.

## Refund, recovery and concurrency meaning

Once accepted, the epoch cannot reseal, replace a member/root, skip a member or
abort into another selection. Expiry authorizes original-order refunds only.
Actual current FT/native deltas return to the original sender; exact current
funding and consumed cursors are checked by actual market bytecode. The NFT
refund returns the actual FIFO head to its sender and reports its actual token
and metadata. It does not create a sale or substitute the Executor as recipient.

Before acceptance, an expired collection may exit without claiming funds or
editing consumed nonces. Funded ineligible source records have a separate, executable recovery path.
After the vault is idle, their sender must explicitly cancel an active order and
call `request_recovery`. Neither arbitrary third-party enrollment nor recovery
of an uncancelled active order is permitted. The exact recovery UPS can then
consume that cancelled nonce and return actual incoming deltas to the sender.
For NFT-only deposits, `recover_nft` can terminalize the enrolled cancelled nonce
without requiring a nonzero FT/native deposit first. Its FIFO/scratch constraints
and claim/ack/return stack remain bound. Funded recovery must still finish and
be claimed before reporting all funds returned; the immutable historical
recovery count is not a live pending-balance counter.
A current identity change fails closed; no automatic upgrade bypass is added.
Any executor with the public source data can continue the same cursor if its
sponsor has sufficient gas. This is not forced execution or a guarantee of
service/data availability.

Each page is one-account, multi-contract UPS atomicity. Pages are separate UPSs.
Old nonce/state requests cannot apply after a winning page. Offline rejection
and sequential continuation are not a live dual-Executor or cross-machine test.
Unknown broadcast handling remains the existing exact-request recovery rule;
this milestone does not register keys or broadcast requests.

The frozen CFC requires foreign funding subtrees to exist for the full page
snapshot. The v7 source circuit and host both classify an otherwise funded but
unprepared account into the explicit recovery set. They do not fabricate an
empty registered subtree or require a token deposit to hide an absent contract.
This is an application limitation, not evidence that all legitimate first-time
orders can trade. A future authenticated absent/current-funding bridge is needed
before admitting those accounts into trading pages.

Recovery has distinct, mask-specific method identities. It reads only the
selected nonzero incoming components and requires zero unselected arguments.
Only selected claim baselines advance. Cancellation terminalizes the order, not
unselected incoming assets; explicitly enrolled residual components remain
recoverable after nonce consumption. A recovery report must account for every
actual component before declaring the account fully refunded.

Current means the **signed session checkpoint**, not the inclusion tip. The
[existing admission requirements](../../batching/checkpoint-stream/admission-requirements.json)
still apply. This change does not establish inclusion-tip foreign-account
freshness, qualified randomness, finality, ordinary-wallet signatures or live
UI acceptance.

## Reproduction and evidence

Use the frozen mainnet-beta SDK commit
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`, toolchain
`nightly-2025-09-20`, release/offline/locked builds and two Rayon/build threads.
No package is upgraded. The source materializer verifies the pinned source files
before producing each fresh application snapshot.

Corrections retained in the evidence include an empty-claim test fixture,
pre-deposit NFT sequence classification, absent unselected funding subtrees in recovery, and the legacy compiler's reversed
NFT/FT argument convention. The new wrapper normalizes payment-FT/collection
roles, audits every foreign state height, and policy generation independently
checks actual compiled definitions against the reviewed configuration. The
actual pre-correction artifact is rejected by that independent audit. Its three
bookkeeping proofs do not stand in for corrected refund proofs.

The cancelled ineligible recovery correction changes code/function roots and
key fingerprints again. Pre-recovery candidates are preserved separately; their
proofs are not evidence for the final key. Revalidation is required by identity,
not a repetition of the same approved request.

A subsequent maintenance witness diagnostic found an unconditional frozen SDK
leaf-gadget constraint: dependency heights must be 1..32 even when historical
source authentication is inactive. Zeroing inactive historical heights produced
`13940084425660361566`, exactly `(-1)*...*(-32)` modulo Goldilocks. The correction
assigns legal dummy height 1 in that inactive witness only. No circuit or key
construction changes; current dependencies remain unconditionally authenticated.
Already verified same-key/source proofs are reverified and resumed exactly, not
regenerated. The failed full run and CFC work remain in the cost record.

An offline continuation helper separately checks the exact saved proof, plan,
ordered stack, key, starting leaf, nonce, checkpoint ID **and full checkpoint
history root**. Deterministic VM endpoints are re-derived and compared. A
reuse-only validation has no proving fallback when saved evidence is missing.
This helper is not a live broadcast or receipt-recovery implementation.

The compiler application snapshot must be prepared without `--test-only`,
then built with `cargo +nightly-2025-09-20 build --release --offline --locked
--bin compile_pair_stream_market`. The test application can be prepared with
`--test-only` and built using the same toolchain/lock and `--test batch_lifecycle
--no-run`. The snapshot materializer is
`batching/dependencies/prepare_mainnet_beta_application.py --source FROZEN_SDK
--out FRESH_APPLICATION`. It validates the frozen source manifest before copying
application files and rewriting dependency paths; it does not update the SDK.

The generator/compilation sequence is:

1. `pair-prepare-fixtures.mjs REVIEWED_INPUT FRESH_OUTPUT` with full reviewed
   native/token/collection bytecode artifacts and both market configurations.
2. `compile_pair_stream_market SOURCE FRESH_COMPILED PAYMENT_OR_ASSET_A COLLECTION_OR_ASSET_B IS_NFT`.
3. `pair-build-policy.mjs FRESH_OUTPUT`.
4. Build the `batch_lifecycle` test target from the pinned application snapshot.
5. Run `pair_complete_source_and_continuous_refund_ups` explicitly with a fresh
   `PAIR_STREAM_UPS_OUT`, `BATCH_BUILD`, one test thread and bounded resources.

The fixture uses one epoch per market, nine source accounts, five admitted
members and one separate funded recovery record. Coverage uses 4 + 4 + 1 accounts;
terminal refund pages use 2 + 2 + 1 original members. A second fork tests expiry
before acceptance. One additional enrolled recovery returns the ineligible
sender's actual A plus partial native fee (Orderbook), or its original NFT with
no incoming fee/payment deposit (NFT). Ordinary recipient claims execute real
claim bytecode in the VM only; they have no ordinary-wallet signature or network
receipt. The fixture's public all-one SD-key parameter is not a wallet secret.

Selected-component VM regressions also exercise A-then-native and native-then-A
recovery, zero unselected arguments, exact residual claim deltas and component
replay rejection. They are not extra complete-UPS acceptance cases. The final
complete UPS recovery covers mask 5 and NFT-only recovery; it does not establish
every possible split-mask combination or multi-item NFT FIFO recovery.

Normal and recovery proof runs use the same frozen SDK and one machine, two
Rayon threads and one test thread. They are not a matched deterministic-vs-random
or old-vs-new performance experiment. Final NFT proving is a separate process after the Orderbook continuation.
The final evidence union is byte-exact copied evidence with provenance; it is
not described as a single uninterrupted proof process. Original failed and
resumed runs remain separate, including their resource construction costs. Cold
market-resource construction and per-page complete proof intervals are reported
separately. Sampled process-family RSS covers the full process lifetime, may
count shared pages more than once, and is not physical peak memory. The FT conservation assertion covers both fixture FT ledgers and Outboxes;
NFT token/metadata ownership and native recipient refunds are checked explicitly.
Actual native fees and modified-word counts are bound in each verified UPS.
An independent chain-wide native supply audit is not established. No network
confirmation/claim latency, p95, chain TPS or speedup is established.

Results, artifact hashes, exact scope and limitations are recorded in the public
bundle linked by the team review entry. Failed builds/runs are retained as
separate versions; a later success never overwrites them. A fixture containing
only ABI projections fails before proof generation; it is not a token bytecode
or UPS verification failure.

## Trust and recovery matrix

| Property | Scope established by this candidate | Boundary |
| --- | --- | --- |
| Input completeness | All current account leaves reconstruct the authenticated source user root; eligible and funded-recovery sets derive from source state | No historical transaction enumeration, admission completeness or censorship resistance |
| Page continuity | Exact epoch/source root, settled cursor and remaining minimum tree; complete original tail | Pages are separate UPSs, not one atomic epoch |
| Authorization | Full ordered compact calls/callers/arity/amounts, session/sig_hash, key/identity, nonce, fee and endpoint checks | Offline synthetic history trust root only |
| Refund ownership | Exact current FT/native deltas and actual NFT FIFO head return to original sender | Current means signed checkpoint; not inclusion-tip foreign-state freshness |
| Recovery | Enrolled cancelled/inactive order, exact selected components, unchanged unselected cursors and residual exit path | Sponsor availability, sender enrollment and further claims are required |
| Trading/fairness | Original whole-order and NFT winner semantics are preserved by disabling unsupported trading | Global paired matching frontier and live races are unfinished |
| Concurrency | Stale cursor/nonce replay rejection and coherent alternative-stack rejection | No real dual-Executor or cross-machine run |

## Native verification commands

With the documented frozen environment and a rebuilt `batch_lifecycle` binary:

```sh
BATCH_BUILD=FRESH_FIXTURES PAIR_STREAM_UPS_OUT=FRESH_EVIDENCE RAYON_NUM_THREADS=2 \
  BINARY pair_complete_source_and_continuous_refund_ups --ignored --nocapture --test-threads=1
BATCH_BUILD=FRESH_FIXTURES PAIR_STREAM_REUSE_ROOT=SAVED_EVIDENCE \
  PAIR_STREAM_REQUIRE_REUSE=1 PAIR_STREAM_UPS_OUT=FRESH_REUSE_EVIDENCE \
  BINARY pair_complete_source_and_continuous_refund_ups --ignored --nocapture --test-threads=1
BATCH_BUILD=FRESH_FIXTURES STREAM_KEY_EVIDENCE=SAVED_EVIDENCE \
  STREAM_KEY_REPLAY_MARKETS=orderbook,nftmarket STREAM_KEY_REPLAY_OUT=FRESH_KEY_REPLAY \
  BINARY stream_key_exact_replay_and_coherent_priority_attacks --ignored --nocapture --test-threads=1
```

Set `PSY_NETWORK=testnet`, the frozen `PSY_CONFIG_PATH`, and
`PSY_MARKET_TESTNET_PROFILE=mainnet-beta-20261027-v1` explicitly. Use fresh output
directories, one proving owner, declared proof/memory/time caps and no live
credentials. `PAIR_STREAM_MARKETS=nftmarket` selects only the second market;
it is not a permission to replace or re-sign a financial operation.

## Remaining work

- Complete the global Orderbook price/time and NFT buyer/listing selection
  frontier, its legal carry/removal rules, and live cancellation races before
  enabling trading in these source-complete candidates.
- Verify current-chain registration/deployment, ordinary-wallet signatures and
  receipt recovery under the existing live safety gates.
- Test excess/multiple-item NFT FIFO recovery separately; the five-member
  terminal fixture establishes one pending NFT per eligible listing only.
- Measure genuine nonzero-fill end-to-end performance separately. Terminal
  refunds and offline proof costs are not trading throughput or chain TPS.

## Final offline acceptance and measurements

Both markets passed nine final-key complete UPSs: OPEN, three complete-source
COVER pages, 2 + 2 + 1 terminal refund pages, sender-enrolled recovery and an
unaccepted-source expiry fork. All 18 exact requests were
reverified with the SDK and fixed verifier in a separate strict reuse-only process; both
changed-global-context cases failed before VM execution. Coherent alternative
stack/signature-preimage attacks (later member first, omitted minimum, duplicate
member) failed for both new keys. The old AMM/Curve saved keys also verified
under the new shared library without regenerating their positive CFC/UPS proofs.

Thirteen scoped JavaScript regressions passed. Actual-bytecode VM regressions
covered both selected-component recovery orders, tampering, replay and remaining
asset claims. Independent read-only review found no remaining actionable blocker
within this declared terminal-refund scope and independently checked 139 original
and derived evidence hashes plus 139 immutability records. It did not rerun
cryptoverifiers or manually audit generated integer arrays.

| Market | Final-key complete UPSs | Market resource build (s) | Eight normal original full-proof intervals (s) | Normal synthetic native fee (base units) |
| --- | ---: | ---: | ---: | ---: |
| orderbook | 9 | 88.987 | 519.594 | 8000126000 |
| nftmarket | 9 | 101.480 | 526.804 | 8000165000 |

These are original per-phase prove/verify intervals, not a contiguous confirmed
user journey. Orderbook's original failed v8 process took 581.817 s (sampled
family RSS 2,559,792 KiB); its v9 continuation took 173.118 s (2,626,720 KiB),
completed the market then stopped at the NFT fixture mint check. Standalone NFT
v10 took 658.799 s (3,455,152 KiB). All earlier failures, build measurements,
complete memory samples and exact provenance remain retained. The final union
is a byte-exact publication convenience, not one cold/warm process or a speedup.
No network confirmation or ordinary-wallet signature/claim latency was measured.

The declared bounded amendment permits at most nine additional full UPSs per
market and at most 30 cumulative per market, with zero real fees/deployments.
Exact proof revalidation does not regenerate positive CFC/UPS proofs. Historical
non-final keys are retained separately from the 18 unique final-key requests.

See [the public evidence bundle](../../executor/verification/2026-10-29-paired-source-refunds-v1/README.md),
its `SUMMARY.json`, `REVIEW.json`, hash index and reproduction scripts.
