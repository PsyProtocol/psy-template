# Source-covered deterministic stream authorization — 29 October 2026

## Scope and release boundary

This change starts from `48d1e5b696b47700cf6772508d94f49e7cdd8a7a` on
`markets-batch-capacity-recovery-20261020`. It adds distinct, undeployed AMM and
Bonding Curve candidates. Existing deployments and their artifacts are not
updated. Node and the frozen mainnet-beta SDK remain unchanged.

The source set means **every final eligible current order at checkpoint C**,
including orders created before C. It does not mean every transaction ever sent,
all historical versions of an owner's order, or submissions not admitted to
chain state. Orderbook and NFT Market do not use this new stream profile yet.

The prior v1 final-state/ordering preparation route remains a separate, disabled
financial route. A caller-supplied success report cannot install the new spending
key or enable that route. `live_authorization` is false in this candidate profile.
No registration, broadcast, RPC, real payment or ordinary-wallet signature is
part of this offline milestone. Fixed-verifier UPS checks, VM claims and network
acceptance are reported separately.

## What is constrained

In this report, **current means the submitted UPS session checkpoint**, not
necessarily the network inclusion tip. Inclusion-time freshness is not established
by these offline proofs; the live gate remains closed for that additional reason.

The spending key composes the source-classification circuit directly with the
actual compact UPS call stack; it does not trust a host classification result.

- Authenticate checkpoint-1 and the immutable source checkpoint against the
  signed SDK session history. Bind the chain commitment, source checkpoint,
  reviewed market/assets, code, layout, function roots and layout dimensions.
- **Independently authenticate current dependencies for every UPS**, including
  maintenance. The current checkpoint leaf is bound to the SDK-signed leaf hash;
  its global contract root authenticates all four reviewed dependency leaves.
  The chain anchor is also checked in maintenance. Historical identities do not
  authorize code that was upgraded after C.
- Authenticate the source vault/key, initialized/idle batch-controller state, and native,
  FT and market-state roots. OPEN's entire source vault leaf must equal the
  actual session starting leaf; C must be the current signed checkpoint.
- Reconstruct every nonempty account leaf in the complete 32-bit source user
  tree. Each account has original membership, partial-tree insertion and
  ascending owner checks. At each right branch its original left sibling must
  equal the reconstructed left sibling. A valid persisted prefix cannot skip
  an earlier account and poison later continuation.
- Authenticate order fields, consumed nonce, both U124 funding outboxes, actual
  claim cursors and native fee deltas. Classify eligible orders and separately
  commit funded recovery candidates. Closing, cancellation, deadlines and
  existing funding rules retain their market meaning.

Amounts use both 62-bit limbs. Curve quantity multiplication and funding
subtraction are constrained without reducing a wide integer to one field.
Current market bytecode verifies actual pricing, slippage, funding, reserves,
refund destinations and consumed nonces. The signature binds the whole ordered
stack, caller, argument hashes/arity, session, sighash, fee, nonce and endpoints.

## Frozen set and continuation protocol

| Phase | Persisted transition | Allowed continuation |
| --- | --- | --- |
| OPEN (key mode 5) | Increment epoch, fix current C and expiry C+32, chain/market/key scope and complete source user root | Source coverage only |
| COVER (mode 6) | Up to four authenticated account leaves, complete classification, new prefix and eligible/recovery roots/counts | Exact next coverage prefix |
| Accepted (contract phase 3) | Only after reconstructed user root equals source root: derive count and manifest from the proven classification | Settle original queue; never reseal/reselect |
| SETTLE (mode 8) | Consume four actual minimum members, or the entire final tail; persist remaining root and settlement cursor in the same UPS | Original next minimum only |
| Complete (phase 7) | Every selected member terminal, cursor equals count, remaining root equals empty tree | Ordinary claims/recovery or a later source epoch |
| Collection abort (mode 9) | Exact collection context, idle phase 1, current checkpoint strictly after expiry; record `stream_aborted=1` | No claims, consumed-nonce edits or accepted-queue erasure |

OPEN never commits an Executor-declared total or manifest: both start at zero.
Counts and roots are installed only after complete source reconstruction. Member
hashes are independent of the eventual count/root, avoiding self-referential
commitments and poisoned prefix totals.

The eligible set is a 56-level sparse priority tree. Its key is
`(order_checkpoint << 24) | owner_id`, matching deterministic checkpoint/user
priority. A domain-separated leaf binds the immutable scope, priority, owner,
nonce and authenticated source order/funding terms. Settlement proves each
member belongs to the current remaining root; every left sibling at a right
branch must be empty. It then replaces that leaf with zero and feeds the new
root into the next member. Final count and empty-root checks establish exact
once-only consumption across pages. Legacy partial-order methods and key mode
7 are disabled: locally sorted arbitrary prefixes cannot lock the suffix.

The existing four-member settlement capacity is retained. Each page has 40
canonical logical slots, with only exact zero-input market noops omitted from
the actual UPS. Claims occur in ascending payer order; market execution follows
global priority. Coverage is four **accounts**, not four eligible orders, per
page. No claim of unbounded single-UPS capacity is made.

## Refund and recovery semantics

A current cancellation, deadline expiry or accepted-stream expiry selects a
refund disposition while preserving the original source member and ordering.
Original source terms remain authenticated; the frozen current cancellation is
stored separately. Slippage refunds keep existing market rules. Actual current
funding deltas determine returns, always to the original sender. Every accepted
page member must trade or refund before its cursor can advance.

Funded ineligible source records are committed to a separate recovery root/count;
they are not silently dropped into trading or automatically paid by a proof flag.
They use the existing sender-enrolled recovery path when the vault is idle.
Collection abort has no financial claims and leaves those funds with their
existing owners/outboxes. After acceptance, expiry cannot abort, redraw, change
the set or pick another order: the original remaining queue must be refunded.

Any Executor with the authenticated data can continue the same state. A sponsor
must explicitly fund verification gas; users authorize incoming trade fees under
existing rules. Insufficient gas stops execution without fabricating a terminal
state. This does not force an Executor to serve or guarantee data availability.

A page is one-account multi-contract UPS atomicity. Successive pages are separate
UPSs with state/cursor dependencies; proof aggregation is not cross-page atomic
execution or fully parallel shared-pool pricing. Unknown broadcasts must retain
original request identity and account ownership under existing Executor recovery.
The candidate is not installed into a live broadcast driver by these tests.
A current dependency identity change fails closed; recovering after an actual
upgrade requires a separately reviewed migration, not an automatic bypass.

## Application corrections found during validation

1. Use the actual frozen SDK session leaf field and hash it explicitly.
2. Seed synthetic historical checkpoints in chronological order before the
   current checkpoint; inserting a past anchor afterwards produced inconsistent
   history paths in the fixture.
3. The frozen compiler's direct `Hash` storage getters used word addressing for
   commitments at unaligned Felt offsets. Diagnostics read zeros despite stored
   limbs. New candidates use explicit `ContractStateArray<4,Felt>` storage and
   scalar reads/writes for commitments. Hash comparisons are preserved. No Node,
   compiler dependency or old layout is patched. Diagnostic assertion removal
   was confined to an abandoned local inspection test; it is absent from the
   committed regression and every spending/UPS verification path.
4. Pin fresh current dependencies in addition to historical source identities.
5. Select index zero **before** decomposing an inactive state-word address.
   Otherwise unsupported full-width global user IDs could exceed a 31-bit FT
   tree address even with funding reads disabled. All inactive setters now
   supply index-zero proofs. Active reads still authenticate their exact slot.
   Boundary proofs include owners 2,139,095,033, 2,139,095,034 and 4,294,967,295;
   those accounts remain in complete source coverage but are not trading peers.
   This changes the key fingerprint; complete pre-fix UPS chains are archived
   separately and do not stand in for the final-key run.

## Admission freshness: external requirement, not an application fix

Read-only review of frozen client/Node `b280d714a8f0930c61962c885374ea63ea63d274`
found the following in `psy_node_common/src/realm/edge/handler.rs:833–905`:

- Submitted checkpoint agrees with the new user leaf; it is no newer than the
  gathering checkpoint and no older than the submitting user's last checkpoint.
- The starting submitting-account leaf must equal its current leaf.
- The submitted checkpoint-history append root must be canonical.
- This inspected path has no maximum snapshot-age or current foreign-account
  comparison. `STALE_CHECKPOINT_AGE_USER_END_CAP_TO_REALM_PROOF=600000` in
  `psy_core/src/constants/stale_checkpoint.rs` is a backup-retention input in the
  inspected references, not evidence of an admission rule.

Consequently, a valid historical signature/proof alone does not establish that
later foreign cancellations, expiry at the inclusion tip or dependency upgrades
invalidate that session while the vault starting leaf is unchanged. This is a
source review finding, not a demonstrated exploit against a running deployment.
We do not claim tip-time cancellation precedence or inclusion-time expiry.

Required upstream deliverables are specified in
`batching/checkpoint-stream/admission-requirements.json`. The realm/admission
and protocol teams must define and enforce accepted snapshot age and the precise
foreign-state/cancellation/code-version semantics on every admission/processing
path, then provide reproducible stale-session rejection evidence. A fresh RPC
read or an honest Executor check cannot force every holder of a public SD-key to
follow that rule. The wallet/Executor team can consume the reviewed policy and
recheck before submission only after the consensus/admission guarantee exists.
No proposed endpoint in that file is claimed to exist today. No Node change was
made in this task. The candidate's live gate stays closed.

## Evidence and measurement status

The versioned public bundle is
`executor/verification/2026-10-29-source-covered-stream-ups-v1`. Its summary,
source/build identities, public exact requests, signature proofs, state openings,
verification reports, diagnostics and failed attempts are indexed by SHA256. Preserve failed builds, the original
context mismatch, prototype proofs and later corrections as separate versions.
Do not interpret an earlier prototype proof as acceptance of the final key.

- Actual v3 source circuit: both market classifiers, five coverage pages each
  (4+4+4+4+2 accounts), 18 accounts, nine eligible and three funded recovery
  records. Final-source boundary chains additionally cover 21 accounts and the
  three large excluded owners. Actual proofs verified; source membership, prefix, leaf, count and
  root-substitution mutations rejected. This component alone is not a UPS.
- Actual candidate bytecode: both markets, five eligible orders, source pages,
  4+1 settlement, cancellation, slippage refund, timeout tail, replay, wrong
  cursor, short nonterminal page and premature collection-abort rejection.
- Final current-identity key/full UPS, independent fixed Endcap verification,
  exported state-delta linkage, fee checks, claims/conservation and abort forks:
  **passed for both markets: seven complete UPSs each under the final key**, plus
  independent exact key-proof replay and coherent signed-stack attacks. The
  pre-address-fix 14 UPSs are separately labeled historical candidate evidence.
  Later-member-first isolates minimum authorization; omitted-minimum/duplicate
  signed-stack attacks can also violate branch or membership constraints. We do
  not attribute every rejection exclusively to the minimum-sibling check.
  The final run used 4+1 orders per market, three successful trades, one current
  cancellation refund and one slippage refund. An independent tail fork refunds
  after expiry; another fork aborts unaccepted collection after expiry.

| Offline measured stage (seconds) | AMM | Curve |
| --- | ---: | ---: |
| Cold stream resources | 100.632 | 95.830 |
| OPEN | 34.755 | 32.047 |
| Two coverage UPS phases combined | 87.730 | 87.962 |
| Four-member settlement | 192.541 | 210.936 |
| One-member tail | 75.335 | 74.549 |
| Five normal UPS phase totals | 390.360 | 405.494 |
| Native atomic units charged in normal synthetic path | 5,000,097,000 | 5,000,107,000 |

The full process, including both markets, cold resources, negative checks,
recovery forks and VM claim audits, took 1,210.832 seconds; sampled family RSS
peaked at 3,839,776 KiB. The pre-address-fix process took 1,212.871 seconds with
3,762,960 KiB sampled family RSS. Its normal phase totals were 391.823/402.732
seconds, respectively. This is one correctness rerun per version, not a reliable
performance experiment: timings include attack tests, some earlier builds
contended with the pre-fix run, and the key fingerprints differ. There is no
supported general speedup or steady-state memory conclusion. Cold resources and
normal phase totals exclude final ordinary claim bytecode time; whole-process
wall time includes it. There is no wallet-signed or confirmed-network claim time.

All timings are offline wall time on synthetic checkpoints. Family RSS is
sampled once per second, includes shared pages and is not physical peak memory.
Some earlier compilation/component checks overlap; phase times must not be summed as a
performance comparison. There is no measured chain confirmation, wallet approval,
network claim, reliable p95 or chain TPS in this milestone.

Random ordering remains disabled. Authenticated checkpoint seed membership does
not establish unpredictability, unbiasedness, canonical finality or sealing
before release. Complete final-state coverage does not establish pre-admission
fairness, global anti-censorship or comprehensive MEV protection.

## Reproduction

Use the frozen dependency preparation described in
`batching/dependencies/mainnet-beta-20261027/README.md`. Mainnet-beta remains at
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d` and nightly-2025-09-20.

Create a fresh fixture directory with
`batching/checkpoint-stream/prepare-fixtures.mjs`, compile each generated market
using the application-owned `compile_stream_market` binary, and run
`batching/checkpoint-stream/build-policy.mjs` against the resulting artifacts.
Input native/token/NFT artifacts must be the reviewed frozen fixtures. Set the
existing testnet profile, magic, config, two threads and offline locked Cargo
flags. Do not deploy or update from this offline recipe.

The ignored tests require fresh `STREAM_SOURCE_PROOFS_OUT`, `STREAM_VM_OUT` or
`STREAM_FULL_UPS_OUT` directories. `BATCH_BUILD` identifies the reviewed fixture
root. Run `prove_complete_source_chains`,
`full_ups::stream_full_ups::stream_bytecode_continuation_and_refunds` and
`full_ups::stream_full_ups::stream_complete_ups_continuation` serially under the
published budget. `STREAM_MARKETS` can constrain the complete UPS run to one
market; it does not authorize a second run or broadcast.

## Remaining integration and verification work

- Install a reviewed v3 native spending driver and instance-specific wallet
  resources; legacy v1 routes remain closed. Bootstrap/registration and the
  initial pool/Curve/gas grants were trusted VM setup in this test, not complete
  deployment or ordinary-wallet UPS acceptance.
- Curve OPEN currently checks batch activation/idle state, not trading-phase
  initialization. Live setup must initialize first. Source review found a finite
  generic funding-refund path after fixed expiry for premature phase-0 capture,
  but that scenario was not financially exercised here. A separate candidate
  readiness guard can prevent the delay without changing market prices.
- Funded ineligible source recovery remains the existing enrollment/idle path;
  it is committed by source proofs, not automatically refunded by trading pages.
- More than five financially processed members, more order kinds, genuinely
  different creation checkpoints, daemon restart/network failure and actual
  multi-Executor financial competition remain unverified for this profile.
  Existing generic journal tests cover local ownership/restart/unknown results;
  they are not cross-machine or live v3 acceptance.
- No qualified entropy/finality/commit-before-release capability is installed.
  No current-chain wallet UI, testnet registration, PSY/pUSDT settlement, real
  wallet claim, chain confirmation, throughput or production conclusion follows.
