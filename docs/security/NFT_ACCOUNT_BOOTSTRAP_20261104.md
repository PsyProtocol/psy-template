# NFT account bootstrap candidate — 4 November 2026

## Closed application issue

The new v21 NFT route completes a zero-state registered vault's first UPS,
exports its exact request, trades an NFT, acknowledges delivery and returns an
unmatched NFT through cancellation/expiry recovery on synthetic checkpoints.
An additional complete **ordinary-signature** UPS prepares a buyer's previously
absent collection state, opens the purchase intent and funds its fee/payment.
These are native bytecode/proof results, not browser or network acceptance.

The mainnet-beta SDK remains frozen at
`01b8f2b0a077367a7b9879baba1a72aea8ab5510`, client
`7058070057c3242b5d8b29e1a31d498aaa4202c0`. All 2,759 pinned source members and
the exact compiled application sources were checked again. There are no Node,
SDK, wallet-history or old-contract changes and no financial operations.

## Diagnosis and preserved failed candidate

The earlier v19 NFT bootstrap reaches a valid Endcap but cannot export a
zero-only first collection touch. Its formal guard remains. A proposed v20
removed the collection acknowledgement, without changing market bytecode.
Actual proving rejects that proposal earlier, in `activate`:

```text
Partition ... was set twice with different values: 0 != 9947841139978160787
```

The market still checks the vault's empty NFT balance and scratch slot through
foreign state reads. Omitting acknowledgement leaves an absent contract root;
the foreign empty-word proof instead has the canonical height-30 empty root.
This is not fixed by ABI matching, a report flag or removing a safety check.
Both failed v20 process logs, source snapshots and partial outputs are kept.
No complete v20 request was exported or broadcast. The formal route does not
admit v20. Earlier helper whitelist, missing-reference compile and lossless-JSON
prototype failures are also recorded; the original missing-fixture invocation
has tool output and a retained observation rather than a separate local log.

## New collection protocol, unchanged market checks

[The explicit account-initialization module](../../nft/ACCOUNT_INITIALIZATION.md)
creates a **new collection** with one appended `account_version` field and one
zero-argument `prepare_account` method. The method accepts versions zero/one
and writes one. Every previous collection method's compiled definition, old
ABI field/offset, authenticated layout entry, NFT identity and FIFO structure
is preserved exactly. The original collection source and deployments are not
modified. New layout: height 30, 15 fields, 603,980,959 slots; the new field is
at slot 603,980,958.

Preparation creates actual state for an account that owns no NFT. It does not
mint, borrow, transfer, modify authority, advance a FIFO cursor or fake prior
state. The native VM checks initial versions zero, one and invalid two; a
successful preparation writes only that field. The exported first-vault request
has exactly one NFT word delta, for the version field, from an actually absent
collection root. Marker, offset, extra-word and parent substitutions reject.

The v21 key substitutes preparation for the bootstrap's zero acknowledgement.
Native/FT funding claims, original-issuer FT seed return, original activation
checks, authenticated owner grant, exact fee accounting and burn remain. All
other market bytecode and financial call templates remain unchanged. Host and
native validators bind the exact new profile, collection layout, SDK/client,
activation/coverage templates and market kind. Ten native policy substitutions
reject. The complete SDK stack, caller, parameters, U124 amounts, session,
sig_hash, dependency identities, nonce, fees and state endpoints stay bound.

The formal factory, durable lifecycle and tagged fee-recovery planner recognize
`source-nft-account-bootstrap-v21`. Frozen-source preservation, independent
fee restrictions, unknown-result locking and exact original-request recovery
remain. Transport tests use explicit doubles; they are not browser/network
payment tests. The new buyer helper prepares its collection account before the
unchanged market purchase checks and funding calls. Legacy callers retain their
old default acknowledgement. The new helper does not claim to acknowledge older
outgoing NFT queues; ordinary acknowledgement is still available separately.

The actual new formal driver matches the cohort key
`ad9460a2…0d1180d`. Its v19 reconstruction still matches the original fingerprint
`1df3a928…685659b`. The distinct v21 policy requires new collection/key/vault
identities; neither pack permits broadcasting. No live registry is replaced.

## Complete UPS and security evidence

The vault cohort has **13 main-history UPSs**: bootstrap, open, two coverage
pages, one owner-authorized fee recovery, priority scan, sale, delivery
acknowledgement, a second source's open/two coverage pages, timeout refund and
refund acknowledgement. It covers one sale, one unmatched NFT returned with
its exact token/metadata, fee exhaustion/recovery, cancellation after sealing,
original-set/deadline preservation and replay refusal. Complete source
processing and existing NFT buyer priority are preserved within the declared
synthetic source; this is not global market inclusion or anti-censorship.

Two further UPSs exercise an **alternative** legal-retention history from the
same earlier state. They are not sequentially combined with the refund branch,
never broadcast, and their fees are accounted separately. Main-history FT and
Native conservation, the alternative branch's Native conservation and original
NFT delivery/refund bytecode checks pass. Actor funding, owner authorizations,
ordinary orders and recipient claims in this cohort are VM prerequisites.

The independent ordinary-buyer UPS uses an ephemeral signing key that is never
saved. It starts with absent buyer collection state and proves preparation,
`open_buy`, Native escrow, U124 FT payment and automatic burn in five actual
calls. Both amount limbs are nonzero: 4,611,686,018,427,387,921 base units.
Seven metadata mutations and a corrupt proof reject. Its setup/listing is a
separate conditional VM world; it is not spliced into the vault state chain.
It does not prove wallet approval, real funding reachability or final claiming.

All **16 saved complete Endcaps and metadata** also verify in a separate fixed
verifier executable, without generating another proof; changed fees reject for
all 16. That verifier does not separately establish approved-call-stack binding
or state-delta cryptography. The producer's compiled key/SDK session and native
endpoint checks provide their own recorded evidence; the JS audit is structural
consistency only. The final scoped host cohort has 67 passes, no skips/failures.
Neither the proof count nor host count is a production conclusion.

## Cost samples, not a speed comparison

| Measurement | Observed cost |
| --- | ---: |
| Final application/driver/test release build, warm dependency cache | 181.884 s |
| Vault process cold stream resources | 127.766 s |
| Vault bootstrap UPS after resources | 76.058 s |
| Vault sale UPS | 126.782 s |
| Vault timeout-refund UPS | 97.338 s |
| Whole vault process, all 15 main/alternative UPSs and checks | 956.131 s |
| Vault process sampled family RSS peak | 2,928,304 KiB |
| Independent ordinary-buyer process, including cold resources | 184.925 s |
| Ordinary-buyer sampled family RSS peak | 2,182,320 KiB |

The 13 main-history UPSs account for 13,000,221,000 synthetic Native base units;
the alternative two account for 2,000,010,000 in their own history. The separate
ordinary buyer pays 1,000,009,000. **No test PSY or existing pUSDT is spent**;
these are QA FT/NFT and conditional synthetic Native states.

The process sample includes setup, proof checks, failures where applicable and
protocol fixture work. Per-stage CFC, key-signing and Endcap/audit timings remain
in the raw reports. Stages are not added to overlapping process time. SDK
compilation was not newly measured; ordinary cold resources are not separately
tagged. The ordinary process overlapped a read-only independent verifier, so it
is not a controlled comparative performance sample. RSS is sampled once per
second, can include shared pages and miss spikes, and is not physical peak RAM.
There is no matched old/new successful NFT baseline, live confirmation/claim
timing, reliable p95, sustained throughput or measured universal acceleration.

The bounded case used 16 of 16 complete UPSs, four of five native build commands
and 1,422.405 of 7,200 aggregate proof-process seconds, including both failed
v20 processes. The successful proof requests are not regenerated for review.

## Remaining gates and upstream boundary

New reset-chain identities, funding, deployment/registration/ordinary setup,
instance-specific wallet resources, actual extension approval, network sale and
ordinary final claim remain unaccepted. The dedicated wallet import belonging
to another task is untouched. New-key maximum capacity, competing buyers,
owner-offline exit proofs, soak/fault acceptance and current-chain dual-pool
closure still need their own evidence. Private-FT compact-wallet verification
and certified randomness/finality remain separate open tasks. This candidate
does not enable random ordering or claim cross-vault atomicity.

Existing collections without preparation cannot silently gain this capability.
For that route, upstream must resolve absent/zero-only initialization and
foreign empty-state authentication in the frozen SDK's
`get_call_start_data` / `get_all_state_updates` and related proof paths. Required
acceptance includes absent/materialized roots, heights 30/31/32,
zero-only/net-zero/first-nonzero writes, authenticated foreign reads, exact
state deltas/fees/endpoints, repeated export and actual Node acceptance. No SDK
patch, dependency switch or Node change is made here. This upstream capability
is not required to generate the new-collection v21 proofs shown above.

## Review and reproduction

[Machine-readable results](NFT_ACCOUNT_BOOTSTRAP_20261104.json) and the
[small evidence index](../../executor/verification/2026-11-04-nft-account-bootstrap-v1/INDEX.json)
bind exact source, artifacts, binaries, requests, public sessions and logs.
Raw proofs and binaries remain in the immutable local recovery case; they are
not uploaded again into source Git. A remote clone needs that original archive
or a separately distributed immutable artifact bundle for independent replay.
Artifact distribution is not set up by this change. See the evidence README
for explicit reproduction inputs and commands.
