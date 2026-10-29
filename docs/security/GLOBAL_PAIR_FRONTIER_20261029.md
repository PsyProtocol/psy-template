# Source-covered global paired frontier candidate — 29 October 2026

## Baseline and scope

This work starts at `de42f3eafd45d476fdf4ad69393dcc0f17eff059` on
`markets-batch-capacity-recovery-20261020`. The frozen SDK remains mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, with the same client/backend/toolchain
pins as the prior paired refund report. No Node, old contract, SDK dependency,
existing artifact or wallet/UI code is modified.

Policy v8 is a distinct **offline candidate**, not an update of the v7 refund
keys. Its `trading_enabled` flag describes proved candidate capabilities;
`live_authorization` remains false. The existing financial Executor driver stays
closed. The source universe remains all eligible current orders at authenticated
checkpoint C, including older still-active orders. Source completeness does not
establish admission completeness, finality, censorship resistance or randomness.

## Global winner derivation

A two-member page cannot establish global priority. The new independent
`pair_frontier.rs` module traverses the Cartesian product of the authenticated
remaining set. Each SCAN UPS verifies at most four comparisons, independent of
the total set size. No full-set witness capacity limit is substituted for a
complete global proof.

The outer member stays at the minimum of an outer remaining tree until its
entire inner tree is exhausted. Each inner member must be the authenticated
minimum of the inner tree. When it empties, the outer member is removed and the
inner root resets to the unchanged full remaining root. The last outer removal
ends the scan. Completion requires exactly `(total - settled)^2` comparisons;
counts are bounded below 2^48 by the existing 24-bit source-count limit. A page
must be full unless it completes the traversal. Roots, best-pair commitment,
cursor, completion, epoch and current remaining set are bound across UPSs by an
actual contract continuation predicate, never by a host success flag.

Each compared record opens the same original source terms committed by the
source-covered member leaf. Source epoch/market/vault/key/asset identities remain
bound by the existing source and current-dependency circuits. The scan does not
trust an ABI name, Executor price, receipt flag or unauthenticated participant
list.

### Orderbook

The rule is the existing first compatible whole-order pair in price/time order:
ask side first, ascending `y/x`, then source order checkpoint and owner ID;
within the chosen ask, the compatible bid with ascending `y/x`, checkpoint and
owner ID. Bid `y/x` is A/B, while ask `y/x` is B/A; comparisons are between orders
on the same side. It is not a uniform clearing price or partial-fill mechanism.

Prices are compared by exact unsigned 248-bit cross products. Five base-2^30
digits per U124 operand keep each multiplication column below 2^63, strictly
below Goldilocks. No full amount or cross product is folded into one Felt.

### NFT Market

For each listing, only an exact seller/listing-nonce/price reference is
compatible. The earliest valid buyer by source checkpoint then owner ID wins.
Among independently matchable listings, this candidate schedules the earliest
listing checkpoint/owner first. This scheduling refinement does not change a
listing's buyer winner, token identity, metadata, signed price or unique-sale
rule. Actual collection/FIFO identity and output ownership are checked by the
original sale bytecode in the same UPS.

## Actual settlement and refund authorization

The best pair is accumulated from authenticated comparisons. It is not supplied
as an arbitrary choice at scan start: an inferior committed candidate cannot
lock the epoch into an unfinishable scan.

A trade UPS binds two source members, their complete terms/nonces and both
sequential removal proofs. It then calls `bind_pair_choice`, an actual contract
predicate comparing the completed frontier context and best commitment against
stored contract state. A key-only statement that a scan completed is insufficient.
The original nine-call whole-match/sale operation follows, with its original
claim/transfer/acknowledgement sequence. All 40 logical slots, compact actual
calls, callers, exact parameters, session/sig_hash, current identities, fees,
nonce and final endpoints remain constrained.

After a fill, both original members are removed, the settled cursor advances by
two and a new complete scan starts over exactly the remaining set. A no-match
carry is permitted only after a complete scan with no compatible pair; it moves
no assets, does not consume remaining nonces and records the retained count.
The user can continue those orders in a later epoch or cancel/enroll recovery.

Expiry refunds still extract original remaining minima, return actual funds to
the sender and preserve the existing selected-component/NFT recovery path.
An unfinished scan does not disable this expiry exit or permit reselection of a
new order set. Pre-acceptance expiry still exits without claiming funds.

Priority and eligibility derive from the frozen source at C. Settlement again
checks selected current cancellation, deadlines, amounts, claim baselines and
NFT identity at its signed checkpoint. A source winner invalidated later can
block further trading until canonical expiry refunds; this version does not
claim a fresh global rerank of all foreign state. The inclusion-tip freshness
gap remains external and live financial authorization remains disabled.

## Cost and operational boundary

The deliberately complete scan has O(N²) comparison cost per chosen fill. The
four-comparison UPS limit is not four orders for the epoch. Nevertheless the
existing fixed C+32 checkpoint window and full proof cost can make large epochs
impractical; mathematical completeness is not a demonstrated service guarantee.
Any future scan optimization must preserve the same authenticated frontier and
whole-order semantics. There is no price mechanism change, liquidity sharding,
invoke_sync, random Executor seed, or same-pool parallelism claim.

The declared initial offline budget is two candidate worlds, at most 24 complete
UPSs per market, at most 40 standalone component attempts, synthetic grants up
to 80 billion native base units per market and zero real fees/deployments.
Root owns every proving job. Failures stop the current run and remain versioned.

## Acceptance plan

- Actual compiler output and independent foreign-height audit before tests.
- Conditional frontier component proofs at U124 upper boundaries, against host
  BigUint priorities; missing minima, duplicated/forged records, false best,
  cursor and inner-root substitution must fail.
- Actual bytecode before full UPS: two cross-page fills, exact outputs, fees,
  source-count continuity, losing/unmatched tail, no-match carry and recovery.
- Complete SDK plus fixed-verifier UPS validation of source coverage, scans,
  actual matches/sales, refunds, carry, recovery and source timeout.
- Current cancellation, exact replay and best-certificate substitution rejection;
  old v7/AMM/Curve saved-key compatibility without regenerating their old UPSs.
- Public proof/request/state/fee evidence and full lifetime sampled RSS. Claims
  use real bytecode in VM only unless separately proved otherwise. No network
  confirmation, ordinary-wallet signature, sustained TPS or speedup conclusion
  follows from these offline cases.

## Completed evidence

The new fixture in each market contains nine accounts, five admitted members and
one separately committed, funded ineligible recovery record. At source C=100,
coverage spans three pages (2 + 2 + 1 members). A complete 25-comparison scan
takes seven UPSs, chooses the first pair, and removes exactly those two members.
A complete nine-comparison scan then takes three UPSs and chooses the second
pair. The last original member receives an expiry refund. Independent forks
prove a completed no-match carry and a source-open timeout before acceptance.

| Evidence | Orderbook | NFT Market |
| --- | --- | --- |
| Final full UPSs, SDK and fixed verifier | 21 passed | 21 passed |
| Actual bytecode fills | 202/203, then 200/201 | listing 200/buyer 203, then listing 202/buyer 204 |
| Original unmatched member refunded | 204 | losing buyer 201 |
| Conditional frontier proofs | 7 passed; 6 invalid witnesses rejected | 7 passed; 6 invalid witnesses rejected |
| Source accounts / admitted members | 9 / 5 | 9 / 5 |
| Scan comparisons per fill | 25, then 9 | 25, then 9 |

The component cases exercise near-U124-maximum operands and compare against
BigUint priorities. They reject a changed cursor, reset inner root, duplicate,
forged source record, substituted best and omitted minimum. They prove the
frontier conditional on a committed remaining root; source coverage, key and
complete transaction authorization are demonstrated separately by the full UPSs.

Actual bytecode tests reject a changed frontier cursor, a changed stored-best
certificate, current cancellation, exact trade replay and (during strict replay)
expired trading, with unchanged state on failure. The opening key tests reject
changed code/layout/function roots, checkpoint, chain instance, network domain,
session nonce, ordered calls and unapproved fee. Nine key rejection cases run
at the opening phase of each market, not at every phase. Recipient claims execute
real FT/native/NFT claim bytecode in VM; they are **not ordinary-wallet signed
UPSs or live confirmations**. NFT claims additionally compare the exact original
token ID and metadata during strict replay.

FT balances plus Outboxes conserve their original total before and after both
fills, tail refunds, claims and ineligible recovery. Each recipient's native
refund and each full-UPS fee are checked exactly. This is not a separate audit
of global native issuance. NFT-only ineligible recovery returns the original
payload. Partial FT/native recovery remains sender-enrolled and returns actual
funds, without fabricating a whole-order fill.

The report and evidence distinguish the normal 18-phase path from forks:

```text
open -> cover-0..2 -> scan-0-0..6 -> trade-0
     -> scan-1-0..2 -> trade-1 -> expiry refund-tail -> enrolled-recovery
trade-1 -> no-match-scan -> no-match-carry
open -> abort-unaccepted
```

Each edge has an exact starting/ending account-leaf chain. This is a sequence
of individually atomic UPSs, not an atomic epoch or cross-vault workflow.

## Measurements and reproduction

The original full run used one process, the frozen SDK/toolchain, two Rayon
threads, no network and no other financial/proving owner. Values are one sample
per phase, with all failed builds and preparation attempts retained separately.

| Measured quantity | Orderbook | NFT Market |
| --- | --- | --- |
| Initial market stream-resource construction | 95.540 s | 108.107 s |
| First full trade interval | 107.654 s | 115.343 s |
| Second full trade interval | 115.559 s | 114.632 s |
| Sum of original normal-path UPS intervals, 18 phases | 789.877 s | 785.236 s |
| Synthetic native fee, normal 18 phases, base units | 18,000,200,000 | 18,000,250,000 |
| Actual compact calls per trade / logical slots | 14 / 40 | 15 / 40 |

The entire original two-market process took 1,947.094 s, including both resource
builds, all 42 positive full UPSs, VM claims, recovery and forks. Sampled
one-second process-family RSS peaked at 3,238,944 KiB; shared pages are included,
so this is not a physical-memory peak. Initial SDK/application compilation is
separately recorded in the build logs and is not part of these proof intervals.
`keySeconds`, per-call CFC intervals and `endcapAndAuditSeconds` remain in every
original verification record. Endcap and audit are not independently timed;
their combined field must not be reported as pure Endcap cost. Do not add nested
phase intervals to the enclosing wall time.

These are offline proof measurements against synthetic checkpoints and fees,
not actual PSY spending, final network confirmation, wallet latency, steady-state
throughput or a matched before/after speedup. Fixed C+32 expiry and O(N²) scanning
remain practical constraints. Larger source sets have no claimed service SLA.

Strict replay reverified all 42 saved full UPSs with no proving fallback. Exact
requests, plans, source/current snapshots, public sessions and key-proof bytes
remain identical; all 338 original files retain their pre-replay SHA256. The
replay process took 222.993 s, with a separately sampled family RSS peak of
3,997,632 KiB. Revalidation is not the same workload as proof generation and
these times do not establish a speedup. Additional expired-trade and exact NFT
payload assertions passed during that replay.

Existing v7 paired and AMM/Curve fingerprints were rebuilt and accepted their
saved key proofs unchanged. Coherent alternative stacks (later member first,
omitted minimum, duplicate member) were rejected in all four legacy profiles.
The two saved-key jobs took 8.259 s and 10.332 s respectively. Their positive
CFC/UPS proofs were not regenerated. Eighteen JavaScript generation, exact
BigInt priority, foreign-height and prior-profile regressions also passed.

The immutable `application-v5` snapshot and `bin-v5` digest identify original
proof generation. `application-v6` preserves identical circuit construction,
formats source and adds test-only exact-reuse, expired-trade and NFT claim checks.
Saved-proof replay must not fall back to positive proof generation. Commands:

```sh
# Build the application snapshot using the frozen dependency export.
cargo +nightly-2025-09-20 test --release --offline --locked \
  --test batch_lifecycle --no-run

# Original new offline proof run; each output must be a fresh directory.
BATCH_BUILD=/absolute/fixtures-v3 PAIR_GLOBAL_OUT=/absolute/fresh-original \
  /absolute/batch_lifecycle pair_global_continuous_fills_ups \
  --ignored --nocapture --test-threads=1

# Exact native and fixed-verifier revalidation, without proving fallback.
BATCH_BUILD=/absolute/fixtures-v3 \
PAIR_STREAM_REUSE_ROOT=/absolute/full-ups-v1 PAIR_STREAM_REQUIRE_REUSE=1 \
PAIR_GLOBAL_OUT=/absolute/fresh-replay \
  /absolute/batch_lifecycle pair_global_continuous_fills_ups \
  --ignored --nocapture --test-threads=1

# Structural and independent BigInt reference audit, not cryptoverification.
node batching/checkpoint-stream/audit-global-pair-evidence.mjs \
  /absolute/full-ups-v1
```

Use the archived wrapper/environment and snapshot manifests for all exact pins,
network configuration, memory limits and original command logs. Never transplant
these synthetic fixture IDs or public test key parameters to a live wallet.

## Open boundaries and next gate

Global priority is closed for the **authenticated frozen remaining source set**,
not every historical transaction or every order a user tried to submit. Time
priority uses the existing source order checkpoint and owner tie-break, not a
new admission timestamp. Current selected-state checks remain mandatory, while
fresh global reranking after later foreign-state changes is unimplemented.

The new key does not fix finality, qualified entropy, admission-tip freshness,
Executor service availability, real-wallet proof/approval integration, live
network acceptance or cross-machine coordination. Live authorization remains
false and existing market IDs/contracts are untouched. The prior v7 paired
refund-only profile remains refund-only. Any live continuation requires a new
instance, fresh dependency/identity/state preflight and the original financial
budget; archived synthetic requests must never be broadcast.

See [the public bundle](../../executor/verification/2026-10-29-global-pair-frontier-v1/README.md)
for exact requests, public sessions, signatures, complete proofs, verifier
results, state/fee records, build provenance, failures and compatibility results.
