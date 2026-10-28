# Previous-checkpoint producer-seeded execution

## Decision and scope

The supplied QED diagram uses the previous block's pseudo-random value. This
milestone implements that narrower producer-seeded model as a **separate v4
AMM/Curve profile**, `previous-checkpoint-seeded-v1`. It does not relabel native
checkpoint statistics as a qualified, unbiased future beacon.

Application base: `7a558ede4a5b761c67958014085421ee77b4a530`, branch
`markets-batch-capacity-recovery-20261020`. SDK remains mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`; client/Node remains
`b280d714a8f0930c61962c885374ea63ea63d274`; backend remains
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. Root owns all native execution.

In scope: actual candidate bytecode, distinct SD-key, native fixed-source
session/fee handling, formal Executor integration and offline acceptance.
Out of scope: Node/SDK changes, old deployments, production enablement,
Orderbook/NFT winner changes, new entropy protocols and network/ordinary-wallet
acceptance. This run declares zero RPC, deployments, registrations, financial
operations and real fees. Existing evidence is retained unchanged.

## Business flow and ownership

```text
users: funded orders + native fee escrow
             |
bot: fixed declared set, canonical by user ID
             |
commit UPS at context C-1 -> fixed draw C and full order/funding root
             |
source: that vault commitment and native seed authenticated at checkpoint C
             |
settlement UPS at fixed context C
  input claims in user-ID order
  complete seed-derived permutation
  sequential shared-state pricing and payouts
  user fee claims -> completion -> fixed bot reward -> exact fee burn
             |
complete proof + state deltas -> exact saved request -> network confirmation
             |
recipient's separate ordinary-wallet claim
```

The last two network/recipient steps are implemented through existing interfaces
but are **not exercised by this offline run**. A valid proof is not a receipt.

| Owner | Responsibility |
|---|---|
| Contract generator | Fixed set/draw, authenticated seed intrinsic, complete rank, sequential guards, terminal outcomes and nonce retirement. |
| SD-key | Domain/version, exact logical/compact call stack, parameters, caller, amounts, signed checkpoint/session and fee/reward conservation. |
| Native application | Reviewed identities/resources, source-anchored session, disposable fee trace, complete proof/endpoint verification, fresh checks and exact persisted broadcast. |
| Executor | Bounded member plan before commitment; reconstruct every frozen member after commitment; durable task ownership and exact recovery. |
| Ordinary wallet | Separate claims and their own approval/verification; no assertion of claim acceptance from VM execution alone. |

Implementation entry points are
[`generatePreviousCheckpointProcessor`](../../batching/checkpoint-processor/generate.mjs),
[`makePreviousCheckpointPolicy`](../../batching/checkpoint-processor/policy.mjs),
[`processor_policy`](../../amm/u124/vm-tests/src/processor_policy.rs),
[`processor_runtime`](../../amm/u124/vm-tests/src/processor_runtime.rs),
[`compact_market_wallet`](../../amm/u124/vm-tests/src/bin/compact_market_wallet.rs),
[`compact_prepared`](../../amm/u124/vm-tests/src/compact_prepared.rs),
[`scanPrevious`](../../executor/previousCheckpointReader.mjs) and
[`createCompactAdmissionAdapter`](../../executor/compactAdmissionAdapter.mjs).

## Source authentication and its limits

The contract requires `draw_checkpoint == ctx.checkpoint_id`; the v4 key also
binds the signed settlement checkpoint to that draw. The native session can use
that historical checkpoint only if:

- The vault leaf at C has the reviewed key, positive nonce and last transaction
  context C-1. Its hash matches the authenticated source leaf.
- The current vault leaf still equals that source leaf; its next nonce is
  submittable and the current realm is within the original execution window.
- Checkpoint global roots hash to the checkpoint leaf. Every reviewed current
  dependency leaf opens against the contract root at C.
- The CFC's existing `GetCheckpointLeafStats` command authenticates all four
  supplied seed limbs relative to the UPS checkpoint tree.

This prevents a Bot from silently replacing the chosen source with a later
checkpoint. It does **not** prove external finality or an independently trusted
chain-instance certificate. Nor does a last-transaction context prove the actual
inclusion/release chronology: a producer may know the seed before including a
commitment based on an older context. The code makes no stronger causal claim.

At the frozen Node commit, `final_random_seed_contribution` is a virtual input
copied into `stats.random_seed` in
`psy_plonky2_circuits/src/coordinator/gadgets/checkpoint_state_transition_proofs.rs`
(lines 83 and 100). Producer control/grinding is therefore an explicit trust
assumption. A checkpoint Merkle path authenticates the chosen value, not its
unpredictability, unbiasedness or uniqueness across competing histories.

The Executor requires the local acknowledgement
`producerSeedAcknowledgement: "producer-may-bias-v1"`, testnet and the frozen SDK
profile. It accepts no operator-supplied seed/round override. The stronger
[`sourceGate`](../../batching/random-order/sourceGate.mjs) stays closed. Version 3
still rejects native execution; its default generated source, policy and compiled
artifacts remain byte-identical. No old key silently changes ordering semantics.

## Ordering, capacity and fees

The ranking rule is unchanged from the earlier candidate:

```text
domain = [0x50535950524f4331, networkMagic, marketId, batchId]
prefix = H(H(domain, storedBatchRoot), authenticatedCheckpointSeed)
key[row] = H(prefix, [frozenOwner[row], frozenNonce[row], drawCheckpoint, 0])
```

Sort all four canonical unsigned hash limbs lexicographically; complete ties use
canonical row/user ID. Active ranks form one complete permutation. Inactive ranks
are identity padding and inactive rank inputs use zero owner/nonce. The real
stored inactive terms remain authenticated; they are not rewritten by the client.

Capacity is two to four AMM/Curve members, 80 witness Felts and 40 logical slots.
Canonical noops are omitted from the actual stack. Domain tag `0x5053424f54` at
witness 78 gives v4 a distinct constrained key. Original U124 arithmetic,
liquidity operations, Curve limits and refunds are reused without repricing.

Fee quoting executes a disposable native trace, including completion and reward.
It proposes the fee for final net state words, accounting for restoration of the
native balance word. No quote is marked as a proof. Complete execution proves an
explicit burn, then checks `GUTA_FEE + DA_FEE * actualFinalWords`. Reward plus
burn equals all member fee escrows. The exact prepared request must contain that
same fee/source, complete stack, session, fixed-verifier proof and public endpoints.

## Recovery and fairness

Commit and settlement are separate UPSs. Within one settlement UPS, every claim,
guard, payout, reward and burn succeeds together or the transition fails. That
does not create atomicity across commitment, settlement and recipient claims.

After commitment, the chain's frozen members and original draw are authoritative;
editing a local discovery plan cannot change them. Expiry atomically retires
every accepted nonce, preventing re-sealing the same authorizations for another
draw. Recovery returns actual still-unclaimed assets to their original sender,
using the existing enrollment and bounded sponsorship rules. It does not undo a
completed trade at its original price. No recovery substitutes another seed,
changes the frozen set or falls back to deterministic settlement.

An Executor can still decline to serve a batch. Another constrained executor can
resume the same draw/stack or service expiry/refunds if funded. Application code
cannot force liveness, prevent producer withholding, or prevent a user from
authorizing a new intent. It cannot prove that the declared set includes every
market order. Shared reserves update sequentially; proof aggregation is not
same-pool parallel execution. Local journal locks are not cross-machine consensus.

## Acceptance and reproduction

Current results and exact artifacts are recorded in
[`SUMMARY.json`](../../executor/verification/2026-10-28-previous-checkpoint-v1/SUMMARY.json)
and the accompanying
[`evidence guide`](../../executor/verification/2026-10-28-previous-checkpoint-v1/README.md).
Synthetic checkpoint seeds are fixed test fixtures, never a fallback entropy
source. The guide distinguishes bytecode, isolated key, complete UPS, coordination
doubles and untested network paths. Failed builds/tests are preserved.

All four new v4 complete UPSs passed fixed Endcap verification, exact signed stack
and public endpoint checks, exported state-delta verification and independent VM
state comparison. A separate saved-request verifier rechecked all four preserved
requests. The native driver derived the same rank and public key as those proofs.
Sixty JavaScript checks and four bytecode tests passed. The isolated key proof
also rejected the old tag and a changed signed source context. These are distinct
evidence levels, not sixty-four network acceptances.

| Synthetic four-member market | Resource construction | Commit proof path | Settlement proof path | Actual calls, commit/settle | Synthetic burns, commit/settle |
|---|---:|---:|---:|---:|---:|
| AMM | 90.523 s | 39.681 s | 165.376 s | 3 / 24 | 1.000031 / 1.000030 PSY |
| Curve | 85.523 s | 35.531 s | 189.081 s | 3 / 28 | 1.000032 / 1.000029 PSY |

One process took 610.763 seconds, including both resource builds and four proof
paths; sampled process-family RSS peaked at 1,977,888 KiB. Shared pages may be
counted more than once; this is not a physical-memory peak. Curve followed AMM
in the same process and can inherit static-resource warmth. The settlement
Endcap/proof-verification stages took 80.298 and 93.407 seconds respectively;
they remain substantial fixed costs. There is no matched deterministic/random,
cold/warm, RPC-confirmation or ordinary-wallet comparison. No speedup, p95, chain
TPS or real fee claim follows from these single offline samples.

Fresh builds require the frozen dependency materialization, checked application
snapshot script, nightly-2025-09-20, release, offline/locked dependencies and two
threads. The optional final argument `previous-checkpoint` selects v4 in
`batching/checkpoint-processor/build.mjs`; omitting it still selects v3.
No source flag can activate this behavior in ordinary deployed market generators.

Before any deployment or finance, use new contracts/key/vault and fresh live
preflight for the actual chain, dependencies, account, balances, original nonce,
fees and verification resources. Native RPC quote/preflight/exact broadcast,
network acceptance of the fixed historical source, recipient claim UPS and
refund UPS remain separate acceptance requirements. Offline success cannot close
them or establish production readiness.
