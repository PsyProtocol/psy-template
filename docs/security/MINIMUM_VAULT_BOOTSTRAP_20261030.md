# Fresh minimum-stream vault startup and current-network gates

## Scope and ownership

Continuation from `9100b179bffe072839ee20b953f75254becf7f45` on
`markets-batch-capacity-recovery-20261020`. Frozen mainnet-beta SDK
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. Root is the sole proof/financial
owner; no earlier job was running. Node, SDK sources/dependencies, original
artifacts, deployed contracts and UI financial gates are unchanged.

The case declares two synthetic vaults, at most eight complete-UPS attempts,
1,800 seconds and 8 GiB sampled process-family RSS per run. The financial budget
is zero until live admission passes. No registration, faucet claim, contract
deployment, transfer, broadcast or ordinary-wallet claim was sent by this case.

## Startup implementation

V12 is a distinct key profile,
`source-covered-producer-minimum-bootstrap-v1`, using the unchanged v11 market
bytecode and original pricing. It does not relabel v11 proofs or existing keys.
Forty logical slots still bind the exact compact actual stack.

The first-use operation:

1. Claims the original payer's exact Native activation seed and two one-unit
   FT seeds.
2. Executes the original `activate_batch_vault` checks, including exact equality
   of the Native balance, sent/claimed endpoints and both FT balances.
3. Returns both FT seeds to that payer.
4. Applies the configured ordinary owner's nonce/cap/registered-key grant and
   claims that owner's separate Native treasury.
5. Accounts the actual fee under the registered key and burns the exact fee.

Activation precedes treasury funding in the same UPS, so no original equality
check is relaxed to accommodate gas. The bootstrap key requires nonce zero,
the frozen SDK's empty account-state root, and next nonce one. Payer and fee
owner cannot alias the vault or one another. A new constraint prevents a public
executor from preempting bootstrap with a grant-only first UPS; later grants
require an already initialized nonce. The corresponding negative attempt uses
a coherent alternative call stack and signature action rather than only a stale
signature hash.

V12 maintenance uses a canonical **inactive coverage tape**. It authenticates no
historical inventory. `CurrentTargets` independently checks the real session,
network/chain anchor and complete dependency identities on every UPS. Active
source admission still uses the original complete snapshot, ready/idle vault,
source membership, full account reconstruction and cursor checks. The shared
signature/Endcap checks and exact fee/state endpoints remain enabled.

The first-use SDK start variant proves registration membership and creates the
initial user state. Stored zero GUSR and virtual registered signature leaf are
recorded separately; an initialized-user start cannot substitute for this case.
Curve initialization then runs the actual issuer/inventory bytecode. AMM
activation creates an empty market: LP admission and actual swap settlement are
separate gates, not implied by `batch_ready`.

Ordinary actor approval/funding prerequisites in this test are actual VM
bytecode, not signed ordinary UPSs, live faucet funds or receipts. Their scope
must not be promoted into real-wallet authorization evidence.

## Preserved failed trials

- Early snapshots used the wrong empty contract-tree height; review corrected
  this to the frozen 24-bit user-contract tree, distinct from 32-bit user trees.
  A subsequent explicit `u8`/`usize` compile error is retained.
- The first run stopped before CFC generation because the inactive maintenance
  tape was passed to the complete historical source-root verifier. The explicit
  maintenance path now avoids making that false inventory statement. Active
  paths retain that verifier unchanged.
- A changed test helper signature initially broke four legacy callers; the
  original wrapper API was restored. One partial-move compile error is retained.
- A later trial's negative test mutated an unused inactive-source chain field
  and wrongly expected it to be authenticated. Maintenance attacks now mutate
  the actual CurrentTargets anchor and actual signature network. No actual
  identity, domain or proof check was removed. The old partial proof output is
  not final-key acceptance.
- Grant-only first-use preemption was identified during review. The final key
  adds a nonce constraint and is a different identity from the preserved trial.

Final-key application-v9 passed three complete synthetic UPSs: AMM first use,
Curve first use and Curve inventory initialization. Application-v10 adds only
the VM rollback regression; spending-circuit sources are byte-identical to v9.
Both bootstrap proofs have stored zero GUSR start, a distinct virtual signature
leaf and final nonce one; Curve initialization continues that exact endpoint to
nonce two. Ten compact actual calls are bound within 40 logical slots for each
bootstrap. Its first-use grant-only preemption, actual signature-domain, current
anchor/dependency, nonce, stack and fee attacks reject.

The final process took 498.384 seconds and peaked at sampled process-family RSS
2,215,744 KiB. AMM resource build / bootstrap intervals were 139.067 / 98.080 s;
Curve resource build / bootstrap / initialization were 116.767 / 83.090 / 50.482 s.
The bootstrap acceptance intervals include attack probes; Curve is second in the
same process. Independent local compilation and read-only replay overlapped.
These are not controlled cold/warm comparisons, physical-memory peaks or network
confirmation/arrival measurements. Synthetic fee burns were 1.000014 PSY per
bootstrap and 1.000010 PSY for Curve initialization; actual network fees were zero.
Ordinary prerequisite, registration, deployment and claimant costs are excluded.

Seven selected JavaScript regressions pass with no skips. The final VM regression
rejects post-activation nonce/cap/key failures with complete provisional rollback,
Native and both FT excess seeds, and replay. Two historical v10 saved key proofs
and six coherent attacks reverify without regeneration. The structural public
startup audit checks stored versus signature starts, exact calls/fees/nonces and
the Curve state edge; it is not an independent ZK verifier.

FT activation seeds are returned as Outboxes and still require ordinary claims.
No normal-wallet receipt is inferred. The two failed full-UPS trials remain
retained: total attempts are five of the declared maximum eight. No final-key
normal settlement or production-release conclusion follows.

[Public proof bytes, sources, failures, audits and reproduction](../../executor/verification/2026-10-30-minimum-vault-bootstrap-v1/README.md).

## Fresh read-only observations and actual blockers

The seven current RPC reads succeed. Realm 0, realm 1 and coordinator agree on
checkpoint-1 roots; the Native code/layout/function identities match the frozen
record. These observations are neither a finality certificate nor authorization
to spend.

The original faucet request remains
`85332da2e78775c0653737658234df46df80a5e326ee3440afb81879ba2d286d`,
recipient 223232, original current-chain public-key hash
`97a9f5724e2f2ea4a7a59c884b9e6f79c7978016629519bae26e96e8b681d834`.
Fresh public-key mapping still resolves to that recipient. At observed checkpoint
17738 the recipient has no initialized nonce and a bounded scan of the current
100 faucet operator Native outboxes finds no cumulative payment to it. These
are raw RPC observations, not cryptographic absence/finality or proof that the
original operator request was discarded. No replacement grant or repeated send
was made.

New state-transition proof bytes for checkpoints **17737 and 17738** still fail
both the frozen SDK borrowed verifier and application-owned verifier at:

```
vanishing_polys_zeta[i] == z_h_zeta * reduce_with_powers(chunk, zeta_pow_deg)
```

The key remains `5e4c467c5e5984b52b2ce8a8dc1401ef3d6046ef3b529935e4cc840112e63f06`.
Both strict/official decoders round-trip the original bytes. No replacement key,
configuration alias, validator list or dependency was tried. The separate frozen
source constructor still reports `PSY_NETWORK testnet does not match localhost`;
that does not itself explain cached-proof polynomial rejection.

Required service delivery: compatible proof bytes under the fixed key, or public
reproducible source/build/parameter evidence explaining the runtime cohort.
Changing SDK is a separate authorized migration, not an automatic recovery here.
The faucet owner must resolve the exact original request with transaction/receipt
identity or definitive rejection/disposal evidence, including operator/start
variant. No secrets or raw witnesses are requested.

## Seal-before-release boundary

Existing `seal_inclusion` and `seal_order` components can authenticate a precise
stored seal at C under a supplied history root and enforce C < D with a fixed
future draw. They do not authenticate that root as canonical/finalized, prove a
producer did not precompute its seed, or prove external entropy was withheld
until after sealing. Existing component evidence is reused, not regenerated.

The current minimum stream fixes D=S+1. It has no accepted-seal inclusion opening
between signed source S and draw D. If admission requires S < C < D, no integer
checkpoint fits this profile. Logs, signed snapshot time, RPC ACK, local clocks,
producer signatures and Merkle inclusion of `random_seed` cannot fill that gap.

Application work for a separately versioned profile is a delayed fixed D,
authenticated accepted-seal opening bound to the actual complete source/market
scope, one immutable seed/permutation, deadlines and recovery. Do not change an
existing S+1 sealed queue or claim the current proofs cover that protocol.
Upstream must provide an independently approved canonical/finalized history
anchor and a qualified future entropy/release protocol with public verifier and
round/domain proof. Producer-controlled native entropy cannot acquire those
properties solely through market code. Admission-time snapshot/foreign-state
freshness evidence remains separate. See the existing
[no-Node capability matrix](NO_NODE_RANDOMNESS_FINALITY_20261028.md) and
[checkpoint compatibility analysis](CHECKPOINT_PROOF_COMPATIBILITY_20261028.md).

## Remaining release gates

- The final-key startup proof and recorded negatives pass offline; final-key
  normal settlement and live acceptance remain separate gates.
- Signed ordinary prerequisites, fresh actual identities/resources, owned exact
  broadcast/reconciliation, LP admission, actual fills and ordinary claims have
  not been established by this test.
- Incorrect/excess preactivation deposits need an explicit recoverable admission
  path; exact-seed rejection alone is not a refund implementation. Do not fund a
  live instance before this is closed.
- V11's 38 accepted full UPSs remain historical evidence for that exact key.
  They do not become V12 normal settlement acceptance by inheritance.
- Current proof compatibility, faucet reconciliation, finality and causal
  entropy-release prerequisites remain open. The public UI is not enabled.
