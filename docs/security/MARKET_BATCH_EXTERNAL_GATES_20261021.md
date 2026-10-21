# Four-market release handoffs and security boundaries

This application release uses deterministic bounded authenticated queues. It
never treats a scan list as all market orders, a source checkpoint as actual
inclusion time, an RPC acknowledgement as confirmation, or recursive proof
aggregation as parallel updates of one pool. NFT 2469 is retired. NFT 2472 is
the corrected prior baseline; the newly found accepted-unfunded close issue
also requires fresh admission-lock candidates, not an update of old contracts.

## Randomness: protocol / randomness team

Required deliverables before enabling another ordering mode:

1. A domain-bound authenticated inclusion witness for the sealed queue
   `{network, contract, vault, epoch, cutoff, queueRoot, includedCheckpoint}`.
   A source checkpoint or ordinary receipt JSON alone is insufficient.
2. A future-source verification interface containing immutable source identity,
   fixed target derived from actual finalized inclusion, value, verifier key or
   threshold participant configuration, proof, finality and reorg rules. Deliver
   source and circuit verification code plus tests for unpredictable revelation,
   bounded bias and withholding assumptions. Coordinator-controlled seed fields
   alone do not meet these requirements.
3. Contract/SD-key verification of the same seed target across expiry/refreeze,
   exact unique permutation of the fixed accepted set and ties over canonical
   order IDs. No seed ranges, historic seeds, reseal or executor-selected redraw.
4. Tests rejecting chosen seeds, history, wrong domain/root/epoch, duplicate or
   missing permutation members, post-revelation additions, and selective abort.
   Timeout must preserve root + target or use a predefined terminal exit rule.

AMM/Curve update shared pricing state in the verified order. Orderbook retains
price/matching priority; random priority must never override better prices.
NFT Market still requires one unique outcome per listing. An authenticated
source does not itself make selection/withholding incentives safe. Until all
requirements pass, the generator rejects random modes and supplied seeds.

### Concrete local source finding (not remote runtime attestation)

`random-source-audit-v1.json` records file hashes and line excerpts at observed
local Node commit `5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6`. A checkpoint
`random_seed` exists, and the DPN historical checkpoint-stat reader binds its
value to a checkpoint Merkle proof. However the inspected coordinator GUTA
gatherer obtains the contribution using `rand::thread_rng().fill_bytes`, and
the transition gadget takes a virtual contribution witness directly as the new
seed. In that path no VRF/threshold entropy verification or anti-grinding rule
was found. A Merkle-authenticated coordinator-chosen value is insufficient for
the requested unpredictable, difficult-to-bias future randomness. This does not
prove which source is running remotely. No Node source was changed.

## SDK release: client SDK / release team

The reproducible application snapshot is frozen in
`batching/dependencies/session-bound-sdk-20261020/`. It includes three existing
SDK deltas and 1,466 source hashes; it is not a newly published SDK release.
The stable branch does not provide the required candidate session-bound API.
Deliver an immutable reviewed source commit/package and checksums, the complete
Cargo dependency closure/toolchain/genesis inputs and build instructions, and
source/API review of `SDKeySessionContext`, full transaction stack access,
`SDKeyCircuitWitnessInput` and its session/sighash binding. Acceptance requires
full positive and negative UPS proofs for swapped user/nonce/checkpoint/root,
call insertion/deletion/reordering, fee and public-endpoint substitution.
Never remove these checks to build against an older SDK.

## Deployment identity / domain: operations and protocol teams

Fresh isolated QA deployments can exercise capabilities without claiming the
running binaries are attested. Production release still needs coordinator,
each realm and edge image digest or binary SHA256, source commit, effective
public network/domain configuration and verifier/common-data hashes. Supply
read-only identity endpoint or signed release manifest plus reproducible build
instructions. The explicit staging compatibility profile uses a shared
regtest-derived domain; it is not proof of unique production domain isolation.
Test cross-domain replay rejection with authenticated chain identities.

## Upgrade authorization and layout/code trust: security / RPC owners

Deliver the exact effective upgrade authorization code path, identity/scope
configuration without secrets, protected endpoint coverage, and isolated
unauthorized, wrong-owner, replay, wrong-domain and stale-layout rejection
requests/receipts. Include an authorized fresh test contract and old→new layout
proof matching the actual old leaf. No legacy update probes are authorized in
this task. New initial-layout deployments do not certify update authorization.
Application code pins code/layout/function roots, heights and field/slot counts
before proof and broadcast. It cannot atomically prevent a dependency upgrade
after those reads; protocol enforcement/version locking is a remaining trust
boundary. Do not describe application root checks as on-chain immutability.

`upgrade-boundary-source-audit-v1.json` records the local request, RPC forwarding
and handler code. In that inspected request there is no owner signature or
authorization nonce; the handler compares the existing deployer hash with the
supplied deployer field. That comparison alone proves no caller possession.
Effective gateway/transport authentication may exist and is not attested here.
Operations/security must identify its exact endpoint coverage (including
internal bypass paths), source/config and isolated rejection/replay evidence.
No update request, including an unauthorized probe, was sent by this audit.

## Liveness / fairness: application and operator boundary

A user can cancel and release an order before signing admission consent. After
consent, its own order terms stay locked until authenticated **terminal epoch**
evidence (same epoch phase 3, or a later monotonic epoch). Requesting consent
requires an already open matching vault epoch and cutoff. An omitted user can
run the public SD-key with gas to close an empty timed-out epoch, or finish the
accepted scope before releasing the omitted order. A proof of historical
nonmembership alone cannot authorize release: foreign reads are snapshots,
while separate users have separate UPS nonce/anchor checks. The caller's own
nonce serializes consent versus release. A frozen cancellation applies after
timeout/refreeze and cannot rewrite the existing commitment.

Anyone able to run the public SD-key can finish or expire a batch under its
rules, or sponsor exact sender-bound recovery. The formal Executor consumes
explicit recovery hints for inactive enrolled users. Returned FT/native outboxes
and NFT FIFO delivery must then be claimed by the original owner with an
ordinary wallet. Costs/available prover/RPC/chain progress are prerequisites;
there is no gas-free or unconditional service guarantee. A user omitted before
admission has no proof of market-wide inclusion. Capacity four, operator plan
selection, unequal access, refusal and no-service remain explicit boundaries.
