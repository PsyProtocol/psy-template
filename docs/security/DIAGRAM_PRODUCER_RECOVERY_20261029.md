# Diagram-mode execution and recovery

## Current implementation

Application base: `6b469ab9621e32be80a5d330c7b3c88d43dd3f9e`, branch
`markets-batch-capacity-recovery-20261020`. SDK remains mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`; client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. No upstream changes.

The supplied diagram's narrower producer-seeded model already exists as the
separate AMM/Curve v4 profile `previous-checkpoint-seeded-v1`. Saying that no
random ordering was implemented conflated this profile with the unavailable
stronger unbiased future-beacon protocol. The distinction is material:

| Path | Implemented order | Evidence / boundary |
|---|---|---|
| Diagram v4 AMM/Curve | Fixed batch and fixed draw; checkpoint-stat seed; full unique hash-derived permutation; ascending input claims followed by sequential pricing/payouts | Four preserved synthetic complete UPSs; formal Executor route. Bounded 2–4 members, not whole-source continuous execution. |
| Current complete-source AMM/Curve stream | Authenticated source-account coverage and checkpoint/user-ID priority minima across pages | Seed is authenticated in the source context but does not select the current priority index. Do not call this random streaming. |
| Earlier conditional ordering pages | Seed participates in the page ranking hash | Independent preparation evidence, not an installed complete-source spending route. |
| Orderbook / NFT | Existing global price/time or buyer priority | No random winner/priority change in this milestone. |
| Qualified future beacon | Disabled | No authenticated unbiased, unique, finalized future result or strong seal-before-release chronology. |

The diagram flow remains:

```text
users fund orders and fee escrow
  -> commit the complete declared batch and fixed draw at context C-1
  -> authenticate that vault state and checkpoint-stat seed at C
  -> claim inputs by user ID
  -> settle every member in the unique seed-derived permutation
  -> sequential pricing, payouts/refunds, exact fee burn and processor reward
  -> full proof and state changes
  -> persist exact broadcast intent, send once, reconcile original identity
  -> recipient separately claims the Outbox
```

The first seven operations are implemented; current-network confirmation and
ordinary-wallet acceptance of this distinct profile are not established by the
offline evidence. Source context C-1 does not prove the commitment was included
before the producer learned C's seed. The producer can influence the native
seed. Authentication establishes inclusion relative to a UPS root, not external
finality, unpredictability or low bias. See the
[existing circuit and protocol report](PREVIOUS_CHECKPOINT_EXECUTION_20261028.md).

## Changes in this milestone

The formal compact Executor now retains an immutable public batch statement
after its owned native complete preflight and endpoint checks succeed. Its
namespace is `producer-batches/<network>/<vault>/<batch>.json`. It deliberately
does not put the key/policy digest in the path: changing a configured identity
cannot silently create a second pin for the same batch in the same runtime.

The record binds the market/vault/key identity, complete dependency bindings,
reviewed driver, policy/config/RPC configuration digests, member IDs/nonces,
batch root/count, fixed draw, all four seed limbs, full permutation and original
deadline. Only this explicit public projection is persisted, with exclusive
publication and fsync. No secret/signature/state witness is added to the record.

Restarted scans and fee quotes reject a changed statement before another quote
or proof. Existing proof checks also recheck it. Concurrent local writers must
agree; a conflicting loser cannot overwrite the winner. Expiry/refund does not
delete the record or permit a new seed. Fee requoting remains possible because
fees and outcomes are independently verified by the exact full request and UPS;
they are not used to choose another accepted set or permutation.

This is an operator-local recovery invariant. It does not replace the existing
contract/key constraints, authorize spending, authenticate an RPC by itself,
prove finality, or coordinate independent machines. A host administrator can
alter storage. Retain the original runtime and evidence; never delete a conflict
record to make a different proposal pass. An unknown original broadcast remains
occupied and is reconciled by its original identity.

The reader additionally rejects an observed draw inconsistent with
`batch_cutoff + 1` or the original expiry. The producer task's displayed batch ID
must equal the witness batch ID. These checks are scoped to v4; unrelated compact
admission maintenance retains its existing task format and constraints.

Public native `producer-order` proposals now validate the complete reviewed
policy and canonical bounded input before calculating the unchanged Poseidon
rank, without building an SD-key that the proposal never uses. Unknown fields,
noncanonical decimal strings, incorrect profiles, duplicate owners, invalid
padding and noncanonical field limbs fail. The proposal explicitly reports
`proofVerified: false`; it cannot supply a signature or verifier resource.
Identity, preflight, signing, full proof verification and exact broadcast still
construct/use their original constrained resources. No circuit generator,
pricing code, state transition, SD-key constraint or fixed verifier is changed.

## Acceptance and reproduction

Use [this milestone's evidence](../../executor/verification/2026-10-29-diagram-producer-recovery-v1/README.md)
for exact results, failure records, bounds, source/binary digests and comparison
samples. Prior four complete UPSs are referenced and reverified, not regenerated
or described as new/current-chain transactions. No financial, RPC, registration,
deployment or ordinary-wallet operation is authorized or attempted by the offline
reproduction procedures.

The JavaScript formal-route tests use coordination doubles. They check persisted
single-send recovery and pre-quote rejection of a substituted seed; they do not
verify a native UPS or prove network acceptance. Native proposal mutation tests
and saved Endcap verification are separate evidence levels. The candidate's
native key identities must still equal the preserved complete-UPS identities.

The performance comparison measures only fresh-process public rank proposals,
with the same machine, locked release toolchain, two Rayon threads, policy and
input; AB then BA order retains both samples per market/version. It does not
measure a resident warm process, full settlement, confirmation, claim, fees or
chain throughput. macOS child rusage maximum RSS and one-second sampled
process-family RSS are separate metrics; neither is a physical-footprint peak.
There are too few samples for a reliable p95 or general speedup conclusion.

Results: 62 JavaScript checks passed; one Rust test exercised both markets at
2/3/4 members and policy/input rejection cases. Both candidate fingerprints
equal the old complete-UPS keys. Four preserved requests passed the candidate
saved Endcap verifier with their original digests unchanged. No new proof,
network operation, trade, claim, fee or deployment occurred.

| Fresh-process rank proposal | Baseline seconds, both samples | Candidate seconds, both samples | Baseline child max RSS | Candidate child max RSS |
|---|---:|---:|---:|---:|
| AMM | 1.908595, 1.156967 | 0.665269, 0.015796 | 248.750, 249.453 MiB | 17.719, 17.609 MiB |
| Curve | 1.209304, 1.190432 | 0.016474, 0.016719 | 250.922, 251.000 MiB | 17.688, 17.734 MiB |

The slower first candidate sample is retained. Every sample starts a new
process; later OS/file-cache warmth is not resident application resource reuse.
Release builds took 82.125 seconds (baseline) and 89.358 seconds (candidate,
including the saved-proof verifier target); these differ in selected targets
and are not a compilation-speed comparison. The native comparison process took
22.911 seconds including identity construction and four saved-proof checks.

Two early JavaScript attempts failed: the prototype pin validator missed the
non-settlement fee placeholder normalization already used by the request builder,
and its new batch-ID check initially affected unrelated admission maintenance.
Normalization now matches the existing canonical request conversion; the batch-ID
requirement is scoped to v4. Full call equality, native fee checks and unrelated
admission constraints remain enforced. Original failed logs are preserved.

## Promotion requirements

Keep the diagram profile explicit, on the reviewed testnet configuration, with
`producerSeedAcknowledgement: "producer-may-bias-v1"`. Use the existing
`executor/run.mjs` route and its sealed binary, native preflight, fresh guards,
durable account ownership and exact request recovery. Do not switch a live old
contract/key by changing a configuration flag.

Remaining work includes current-chain full native identity binding, sufficient
source window/budget, new isolated contract/key/vault registration, fixed-source
network acceptance, real settlement, ordinary-wallet claims and recovery UPSs.
The previous four UPSs used their own synthetic dependency identities; the newer
captured full-native Book proofs do not retroactively validate v4 live identities.

Whole-source randomized continuous settlement needs its own versioned
contract/key/Executor integration: one accepted source set, one fixed draw and
one global permutation across all pages and recovery, with adequate coverage and
expiry budgets. The current stream's four-account coverage pages and C+32 window
already fail the captured 312-account source budget. Raising configuration
numbers or sorting each page independently cannot close those constraints.

Neither diagram mode nor any finite authenticated queue proves all-market
admission, censorship resistance or comprehensive MEV protection. Shared reserves
still update sequentially. Aggregation is not same-pool parallel execution, and
commit/settlement/recipient-claim UPSs do not become cross-vault atomic.
