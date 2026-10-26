# Shared-vault batch preflight — 2026-10-20

**Historical preflight, not deployment authorization or batch TPS.** Later results:
[implementation](MARKET_BATCH_V2_RESULTS_20261020.md). Baseline
`459a1fef4c91100161677ffd57043f461c4f7638`. Only probes/evidence/design were added;
no Node/FT/NFT/market source/layout/key/artifact change or RPC broadcast.

## Architecture boundary

The supplied diagrams propose independent user covenants, claims by user ID,
previous-block-seeded processing, constrained signature circuits and recursive
aggregation. Diagram claims about randomness/privacy/incentives/MEV are targets,
not evidence that this implementation provides them.

| Question | Preflight finding |
| --- | --- |
| Shared vault/parallel user orders | Retain them; one vault still has ordered state dependencies |
| Existing batch keys | Incompatible: AMM/Book/Curve require nine calls; NFT ten, including burn |
| Universal 16-call UPS cap | Not established; configured gadget/SDK counts are exact, not inferred from one constant |
| Local 32-call introspection | Synthetic dynamic key/basic proof/two minifiers work; not 32 real market calls/full UPS/network admission |
| UPS atomicity | End-cap binds one user's start/end/full stack/count and clears execution debt; no legal partial end-cap |
| Multiple UPS | Require staged recovery; not one atomic transaction |
| Checkpoint seed authentication | DPN historical Merkle proof can authenticate the committed seed |
| Unpredictable/hard-to-bias seed | Not established: local coordinator uses thread_rng; no accepted VRF/beacon evidence |
| Market/key seed API | Raw DPN reading exists, but no end-to-end compiler/key/market authentication path |
| Throughput | Market VM/full UPS/network throughput not measured here; null |

## Calls, cost and fees

Current policies pad to eight/nine explicit calls plus burn; Rust validates exact
9/10 calls and 13 witness fields. UPS/inline/deferred height 16 describes tree
encoding, not 16 calls. Local probes at 9/10/16/17/32 show no such constructor cap,
without establishing service registration/body-size/performance limits.

Estimated new calls remove legacy padding/burn, reserve two envelope calls and
one burn, and require a new key:

| Operation | Useful calls/order or pair | Two operations + envelope/burn | Theoretical capacity at 16 |
| --- | ---: | ---: | --- |
| AMM swap | 4 | 11 | 3 orders |
| AMM two-asset refund | 6 | 15 | 2 orders |
| Book match | 8 | 19 | 1 pair/two users |
| Curve exact buy/sell | 4 | 11 | 3 orders |
| NFT sale | 9 | 21 | 1 sale/two parties |

Not final limits: surplus refunds/results/fees/ACK add work. Initialization,
graduation and activation remain separate. The historical proposed first cap was
32 calls/two operations (Book/NFT four orders), **not accepted capability**. If full
UPS/service acceptance fails, change application templates/capacity, not Node.

Machine: M1 Max, ten logical CPUs, 32 GiB, macOS 15.7.3, Rust
nightly-2025-09-20 release/locked/offline. Each synthetic call has two dynamic
62-bit witnesses with full-stack/digest constraints. Three proofs/length,
two recursive minifiers and verification, plus 25 tail/reorder/truncate/extra/
signature-stack rejection cases. No market Merkle reads, pricing, conservation
or UPS end-cap:

| Calls | Basic proof + two minifiers median | Compressed verify median | Bytes |
| --- | ---: | ---: | ---: |
| 9 | 755.21 ms | 3.53 ms | 130568 |
| 10 | 764.45 ms | 3.46 ms | 130568 |
| 16 | 757.83 ms | 3.53 ms | 130568 |
| 17 | 762.97 ms | 3.47 ms | 130568 |
| 32 | 756.79 ms | 3.59 ms | 130568 |

Source: `batching/evidence/20261020/sdkey-dynamic-cost.json`. All fit degree bits
12 padding. Inverse component latency is not market TPS; similar proof size does
not mean constant transaction work. Three samples are not production p95.
Dependencies already had local modifications; commit/diff/key-source hashes bind
the actual snapshot, not a verified deployed version. No keys/wallet files copied.

Driver burn is `1_000_000_000..=1_000_100_000`, step 1000; escrow is 1_000_100_000.
End-cap enforces GUTA_FEE + DA_FEE × modified slots. Extra batch writes cannot use
100 slots as an unlimited allowance or claim cumulative funding twice. Account
for commit/settle/reproof/ACK/claims/surplus separately; no old-wallet authorization
expansion before actual full-UPS slots/fees.

## Atomicity and randomness

UPS end-cap source binds start/end/checkpoint/hash/count, fees and empty debt;
end-cap tree binds recursion. Application driver independently verifies endpoints;
journal persists intent and blocks unresolved vault mutations. A final failed
call cannot commit preceding steps independently. Confirmed commit survives failed
settle, requiring expiry. VM clone/compare-and-commit is not Node admission;
new mid/tail failure, authenticated-state and stale-anchor races need testing.

GetCheckpointLeafStats authenticates stats/global roots into a historical leaf
and outputs four seed Felts. Local get_temp_guta_rand_seed uses thread_rng fill_bytes
before coordinator stats. This certifies what was committed, not inability to
reroll/bias/predict it. Deployed generation remains unverified.

Before enabling random order, require fixed authenticated future seed checkpoint;
proof the exact set was actually included before seed disclosure (an earlier
number is insufficient); reviewed unpredictability/bias/finality/reorg assumptions;
domain/batch/order-derived full permutation/tie constraints; and defenses against
unfavorable-seed abandonment, reindexing/reselection/abort grinding. No local
random substitute or claims of random fairness/MEV elimination.

## Release sequence

1. New set/state/order/layout/key, offline first.
2. Actual bytecode/authenticated CFC/full UPS for AMM/Curve two orders, Book/NFT
   two pairs, with positive/negative cases.
3. Validate call/input/fee/registration capacity, independent layout/artifacts;
   retain originals.
4. Durable Executor crash/cancel/duplicate/two-executor recovery.
5. Full one/two-operation proof and confirmation costs, including failures.

At this preflight, all new market/key/recovery/network throughput work was pending;
legacy tests do not substitute. Later profile uses **40 slots/74 Felts**, not this
historical capacity proposal. See [design](../design/MARKET_BATCH_V2.md) and frozen
implementation results; do not reuse these provisional numbers as current limits.
