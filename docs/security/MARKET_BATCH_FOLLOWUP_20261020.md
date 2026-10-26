# Four-market batch follow-up: five open gaps

Branch `markets-batch-capacity-recovery-20261020`, baseline
`5a9a7e7c631729f19a52f173ab6d7d4aa27d5666`. Application generators/scanner/tests/
proof-cost analysis only; no Node edits, contract updates or network transactions.
Original preflight/builds/measurements remain intact. This is a chronological
2026-10-20 record; later release/live evidence is separate.

| Gap | This milestone | Still required |
| --- | --- | --- |
| Random order | Off; no Executor-selected seed | Reviewed hard-to-bias source, authenticated read, actual commitment inclusion, fixed future seed and anti-abandonment protocol |
| Global completeness | Selected-set commitment only; discovery hints are not omission proofs | Authenticated admission universe/queue/cutoff, every scoped order processed or lawfully excluded |
| Capacity | AMM/Curve candidate four members/four orders; Book/NFT four members/two pairs | Larger arrays/order/calls/fee budget need independent full proofs; no large-batch claim |
| Proof cost | proof-cost.mjs separates useful/noop/untracked work; four-order samples | Forty slots unchanged, no controlled old/new speedup or full online optimization |
| Live acceptance | Full commit→expire→recommit→refund proof chain | Synthetic checkpoints only; SDK release, upgrade authorization and actual register/admit/confirm/claim remain |

These do not combine into production readiness. Offline recovery cannot fill a
live-acceptance column.

## Implementation and binding

AMM/Curve caps increase 2→4 through explicit `batchMemberLimit:4`; legacy configs
default two to avoid silently exceeding deployed code. Book/NFT default four.
Four operation blocks/layout/74-Felt witness remain, exactly 40 calls per UPS.
Orders three/four use preceding reserves/sold; missing/reordered/repeated results
reject in contract, not merely JS quotes. Dispersed high-ID FT/native refunds return
to each payer, with NFT regression retained.

Recovery proves commit, rejects invalid settle/early expiry without mutating
frozen state, then proves expire/new commit/refund. All four vault endpoint links,
CFC/recursion/key/end-cap/metadata/deltas verify. Ordinary cancel/final claims use
actual VM, not ordinary full UPS or network confirmation. Recommit needs a new
Sponsor nonce/2F; expiry costs fees. Uncertain broadcasts still reconcile exact
end-leaf. New roots change only AMM/Curve code; check frozen layout/policy hashes.
New source capacity cannot be applied to old vaults; nothing deployed here.

## Cost diagnosis

Saved `implementation-v2/full-ups-size1` traces:

| Market | Commit total/noop s | Settle total/noop s |
| --- | --- | --- |
| AMM | 113.36 / 47.17 | 104.69 / 40.72 |
| Book | 114.29 / 54.99 | 120.38 / 47.12 |
| Curve | 104.63 / 44.42 | 103.96 / 39.63 |
| NFT | 107.15 / 46.75 | 104.35 / 34.35 |

Commit has 37 noops; one-fill settle 28–33. Remaining time includes useful calls,
session, burn, signing/end-cap/verify, not only arithmetic. This is diagnosis, not
predicted speed after deleting padding. SDK introspection binds exact tx_count;
old key padding cannot be removed or recursion skipped as “proof caching”. New
lengths need new application circuits/fingerprints, exact prefix/length/burn/unused
slots/session digest, negative regressions and full UPS. SDK context/trace paths
also enforce exact counts; changing one policy number is insufficient.

Four-order/recovery timings are offline; chainTps=null. Some overlapped builds/tests,
so no controlled speedup or production p95.

## Required future protocols

Random mode requires source-generation/trust/finality evidence, actual pre-seed
commitment inclusion, fixed future checkpoint, circuit seed→root authentication,
domain/market/vault/epoch/set/order keys, full permutation/ties and rejection of
historical seeds, reorg/reseed, changed epoch/set, post-disclosure additions and
selective abort. Timeout/recommit fees and anti-reroll rules must be explicit.
An early number is not inclusion evidence; authenticated thread_rng output is not
hard-to-bias randomness. Node is not modified to conceal this gap.

Completeness first defines authenticated admission scope, root/length/cutoff, then
proves each entry fills/refunds/carries/is publicly excluded, binding user/nonce/
funding/market/epoch. Executor cannot invent an unauthenticated queue root. Shared
admission serializes updates despite parallel intents; sharded admission requires
certified shard membership/complete merging. Whitelists prove only their own scope.
Monitoring/challenges detect/remedy, not prove absence of omissions.

For live acceptance obtain reproducible reviewed SDK and upgrade evidence
([review](UPGRADE_AUTHORITY_REVIEW_20261019.md)); application roots cannot replace
these. Use new isolated markets/keys/vaults, never legacy update probes. Retain
network/deployment identity, registration, roots/PK/fingerprint, exact request/
receipt hashes, calls/fees/bytes/endpoints/checkpoints/claims, two-executor races,
lost receipts and expiry. Separate proof throughput from confirmed throughput.
No keys/mnemonics/recovery files in evidence.

## Stable branch/source recheck

User confirmed release/testnet-stable; readonly remote HEAD:
`6eb535003bdab1fcdb27386dbcb93e8aa9727998`, fetched into an independent bare store.
Node checkout unchanged; running image/binary identity remains unverified.
Stable SDKeyCircuitGadget creates separate sig_hash/checkpoint/user/stack witnesses
but lacks the selected snapshot's SDKeySessionContextTargets/UPS-digest rebuild
and session_context witness. Existing safe candidate APIs/proofs are therefore
not reproduced by that clean SDK. “SD-key supported” does not remove this client
circuit difference. No SDK edit or downgrade to an unbound key occurred here.

Stable end-cap/end-cap-tree/DPN historical-checkpoint/random-source files match
local hashes, narrowing differences without attesting whole-service compatibility.
Randomness and upgrade evidence remain open. Source hashes are separate; no remote
file overwrote Node or original artifacts.

## Completed offline checks

39 application plus two shared-config JS tests and 21 actual VM groups pass.
Eight-worker AMM/Curve maximum-four-order races remain local compare-and-commit.
Four full commit/settle UPS for AMM/Curve verify endpoint linkage/deltas. Dispersed
four-refund write leaves: AMM 48, Curve 49, Book 50, NFT 71, all within 100. Four-market
commit/expire/recommit/refund chains add 16 full UPS, **20 new UPS total**. Wrong
root/early expiry are VM negatives; ordinary cancel/claim remains VM only.

| Maximum sample | Members/fills | Commit/settle s | Leaves commit/settle | Warm proved fills/s |
| --- | --- | --- | --- | --- |
| AMM | 4 / 4 | 174.68 / 168.48 | 23 / 24 | 0.01166 |
| Curve | 4 / 4 | 171.90 / 141.45 | 30 / 24 | 0.01277 |

End-cap serialization: 130,328 bytes. Cold construction AMM 74.19/Curve 87.51 seconds.
One sample/market with some build/test overlap: no old/new speedup/p95 or network/
user-submission/claim cost included.

Twelve-round standalone VM benchmark, including model Sponsor funding in commit:

| Market | Fills/batch | Commit/settle P50 ms | Two-stage VM fills/s |
| --- | --- | --- | --- |
| AMM | 4 | 2.83 / 10.06 | 310.36 |
| Curve | 4 | 2.48 / 7.83 | 387.99 |
| Book | 2 | 2.81 / 7.61 | 191.99 |
| NFT | 2 | 2.26 / 3.15 | 369.72 |

Evidence: `batching/evidence/20261020/capacity-recovery-v1/`, including source/binary
hashes, logs and SDK differences. VM rates are not chain TPS.

## Readonly network and build guards

Existing staging realms first read 355583, native height32; second read355594.
357.735 seconds between starts gives observed 32.52 seconds/checkpoint, not a
protocol/future guarantee. Local six-second runner config cannot determine network
expiry minutes or TPS. Expiry remains explicit; no automatic change.

Readonly artifact_roots recomputes canonical code roots/heights from artifacts/
saved RPC definitions. RPC native root matches `53735dc6…c88d4ba`. Original offline
native full root differs and remains intact. Called simple_claim/transfer/burn
IDs/arity/code hashes match; unused methods explain differences. No whole-artifact
identity claim. Wrong arity/envelope/type/duplicate IDs reject. Function whitelist,
new registration, 40-call admission/actual settlement remain unverified. All reads
are psy_get_*; raw code is separately retained, no Node/native fixture overwrite.

Application batch_policy::build explicitly requires SDK session_context; old APIs
fail compilation rather than silently produce unsafe keys. Current snapshot builds;
field existence alone is not correct-constraint proof or a stable-branch compile.
Source review/wrong-session negatives remain. The reference adds no constraints.
Discovery caps apply only before commitment. Frozen four-member sets reconstruct
fully even after a restart lowers discovery limit to one. Original37/final39-test
logs are separate.

## Final recovery proof record

Synthetic authenticated checkpoints, four members/market, actual original-payer
refunds, NFT ID/metadata checks and repeated-terminal rejection. Forty calls/burn
per UPS; actual written leaves determine fees, not free retries.

| Market | Commit s | Expire s | Recommit s | Refund s | Total s |
| --- | --- | --- | --- | --- | --- |
| AMM | 282.62 | 290.32 | 285.83 | 293.93 | 1152.71 |
| Curve | 283.03 | 291.58 | 286.31 | 294.79 | 1155.70 |
| Book | 293.20 | 349.14 | 280.48 | 277.49 | 1200.30 |
| NFT | 295.23 | 358.33 | 269.90 | 278.19 | 1201.65 |

Cold construction: 110.72/102.36/75.91/95.38 s. Two processes, four Rayon threads
each, sequential two markets/process: wall2546.98/2561.92 s; max RSS1,816,838,144/
1,777,778,688 bytes. Some build/verify overlap; not an isolated benchmark/p95.
Per UPS noop45.14–147.25 s; endcapProveAndVerify136.11–196.56 s. Nested/segmented
times cannot be added again to totals. Padding/aggregation dominate VM pricing;
shared-state sequential dependencies are not eliminated.

recovery/*.json records stages/endpoints/calls/fees/timings; proof-cost-recovery
covers 16 per-method traces; recovery-summary/log-provenance retain original and
ANSI-clean log hashes. Initial fixtures fullUpsVerified:false remains an initial
record, superseded by final stage reports, not overwritten. Final source inputs
are distinct from earlier recovery-binary input snapshots; API/scanner guards do
not change frozen bytecode. Node HEAD/diff/11 source hashes match start;
CHECKSUMS covers remaining evidence.

Historical conclusion: randomness/global inclusion/larger Book-NFT batches/full
proof cost/reproducible SDK/live acceptance remain open. Branch identity is not
running-service attestation or upgrade authorization. Later five-stage progress:
[release review](MARKET_BATCH_RELEASE_REVIEW_20261020.md). New keys/experiments have
separate evidence; originals remain unchanged.
