# Basic AMM continuation — 12 November 2026

## Current verdict

The normal AMM no longer requires account-universe/source-coverage traversal.
The new `amm-core-compact-v1` formal Executor route uses explicit order hints;
after commitment, the on-chain frozen members control settlement and refunds.
This does not prove inclusion of every order in the market.

**The current-chain swap and ordinary final claim are not complete.** New QA
FT contracts **49 and 50**, AMM **51**, and vault **1182848** are confirmed.
The [registration continuation](AMM_CORE_REGISTRATION_20261112.md) records the
expressly authorized, exact-byte deployment replay and independent registration
membership check. Only this selected AMM/vault may be funded. The current owned
journey has confirmed QA issuance and the ordinary recipient's initial claims;
these are preparation, not a completed market fill or browser/UI acceptance.

Branch: `markets-batch-capacity-recovery-20261020`, starting at `d23a9ce7`.
SDK `01b8f2b0a077367a7b9879baba1a72aea8ab5510`, client
`7058070057c3242b5d8b29e1a31d498aaa4202c0`, backend `736572e9` remain fixed.
The historical profile name `sdk-audit-20261102-v1` selects this existing
mainnet-beta freeze; no dependency switch is made. Node, the wallet repository,
old contracts and unrelated browser/financial tasks are unchanged.

## Implemented application changes

- [Fresh core builder](../../amm/u124/core-build.mjs) generates the existing
  shared-vault AMM and compact SD-key policy without stream/admission methods.
  It pins compiler/dependency bytes, SDK/client, network and checkpoint-one
  instance identity. The initial market ID is a policy placeholder only and
  must be replaced by the exact confirmed deployment before key registration.
- [Core reader](../../executor/coreAmmReader.mjs) selects bounded explicit
  order accounts. It never queries a global account list. Restarted settlement
  reads the frozen set, including refunds, regardless of changed discovery
  hints. Complete proof metadata must not predate the approved observation or
  exceed the approved send window. The minimal route defaults to one member;
  larger configured batches are not live-accepted by this run.
- The [formal adapter](../../executor/compactAdmissionAdapter.mjs) reuses the
  existing journal, resident prover, exact prepared request, one-send transport
  and receipt reconciliation. Complete stack/session, state, nonce, fee,
  dependency and public endpoint checks remain. Only immutable public identity
  metadata is cached, additionally bound to the selected SDK/client.
- Native preflight and exact prepared broadcast recheck the instance anchor.
  Initial deployment now uses the same explicit no-redirect/no-retry transport
  discipline as ordinary UPSs and registration. ACKs are not confirmations.
- [Initial-deployment recovery](../../executor/acceptance/reconcileInitialDeployment.mjs)
  joins an exact saved request identity to a fresh indexed deployment occurrence
  and its verified initial endpoints. It cannot retransmit. A 404 remains
  unknown; wrong chain, old occurrence, owner or layout/root substitutions reject.
  Recovery consumes the original layout-verification report; it does not
  independently regenerate that proof or attest consensus finality.

A failed preliminary fixture exposed unsafe JavaScript reserialization of
full-u64 bytecode constants. The builder now copies original artifact bytes
verbatim and verifies their SHA256. The failed fixture/run is retained outside
Git; it is not rewritten as a passing sample.

## Evidence and measurements

[Compact public evidence index](evidence/amm-core-20261112.json) lists exact
hashes and the durable raw archive name `amm-core-live-20261112-v1`. Raw proofs,
SDK trees, binaries, signer files and RSS logs remain outside source Git.

- Fresh chain anchor:
  `81bac9934a1c18579519b5297c94c7e7d25cb53973ac67befefe8b7a86f96b5c`.
  Native metadata and eleven ordinary verifier roles match the selected freeze.
  This does not attest the running image, upgrade authorization or finality.
- QA FT **49**: included at checkpoint **103306**; QA FT **50**: **103367**.
  Both have actual issuer `971904` and distinct fixed QA symbols. Their new
  request/layout endpoints and deployment owner are checked. Issuance and the
  recipient's initial claims are recorded in the continuation, separately from
  this earlier deployment snapshot. These are QA assets, not pUSDT or Native PSY.
- AMM bytecode is compiled with actual assets **49/50**. Its **58-field initial
  layout proof verifies**, including the empty old endpoint. The wire body is
  **66,880,029 bytes**. One send produces no HTTP acknowledgement/response file.
  The 501.68-second child run includes cold construction, layout proving and
  the send phase; sampled family RSS peaks at 2,068,768 KiB. This is not proof of
  a server rejection or a body-size limit. The selected source server allows
  512 MiB; the running gateway configuration and receive/disposition are unknown.
- Three preliminary **synthetic** full UPSs verify: fresh activation (7 actual
  calls), commitment (3), and one-order settlement (7). Their fixed Endcap/common
  data and public endpoints also independently reverify from saved requests,
  without new proofs or broadcasts. Fixture identities differ from the new
  live deployment. Synthetic LP setup is not real network liquidity acceptance.
- Synthetic activation: 112.49 s cold build, 75.68 s operation prove/check,
  192.11 s whole process, sampled family RSS 1,245,216 KiB. Synthetic trade run:
  107.66 s cold build, 57.14 s commitment, 78.39 s settlement, 247.60 s whole
  process, sampled family RSS 1,386,800 KiB. Phase intervals are not additive.
  These are single offline samples, not matched cold/warm live comparisons,
  confirmation latency, final-delivery performance, physical-memory peaks or TPS.
- Host/mock regressions: 51 checks before the final default/refund additions;
  six final targeted core checks and three read-only recovery checks pass.
  The final combined suite passes 55 host/mock checks with no skipped tests.
  One native core scope unit check passes. These counts are not real acceptance.
  The mock committed-refund test retains both U124 limbs, ignores changed hints,
  waits on funding drift and expires the same batch.

## Bounded execution and exact recovery

One root executor owns the case and both owned-account locks. Limits: three
new contracts, one vault, no new ordinary identities/faucet requests, 60 test PSY
in fees, 40 new complete UPSs, 20 QA units per LP side, one-unit swap and refund,
two prover threads, six hours and 12 GiB sampled family RSS. Three declared
native Cargo build/test commands are used. No additional mutation or proof job
is started after the unknown deployment.

The exact pending content hash is:

```text
46a5f136ee14ffa4785754c1982810cd39b2f6939cf5cd055eac5e682fa33fc0
```

Original request SHA256:
`4118ebc3017a74cb7a75b43d505da6fdff130dd02fb78ee496d90b600af35f8d`.
The lookup utility reproduces both confirmed QA Token content hashes before
deriving this identity. It is a lookup identity, not a unique occurrence or
layout authorization. At checkpoint **103551**, the exact hash lookup is 404.
No new contract allocation was observed at the earlier checkpoint **103498**.
Neither observation proves permanent rejection. No resend or replacement is
made, and no user funds enter a market. The generic suppressed native error
label `REJECTED_REVIEW_REQUIRED` is not treated as a server rejection.

The actionable external recovery input, if normal indexing never resolves it,
is the coordinator/gateway receive, queue or terminal-disposition record for
this original hash/request during **17:44:28–17:44:44 UTC on 11 November**
(saved transport/failure file timestamps, not a server receive log). The
configured 120-second acknowledgement timeout was not fully consumed: these
local timestamps span about 15.8 seconds and do not identify the transport
failure cause. This requires no Node code change, secret or dependency upgrade.
The current public interfaces do not return a conclusive negative disposition
for this unacknowledged request. New ordinary spending/nonces cannot invalidate
an initial deployment because its request is not an ordinary nonce-bearing UPS.

After exact deployment recovery: bind the actual market ID and complete roots,
derive/register one new key, confirm registry/receipt evidence, then sequentially
mint/claim QA funding, activate, add liquidity, swap, claim, cancel/refund and
claim the actual returned asset. Every financial step requires fresh native
guards and exact inclusion before the next dependent step. Ordinary CLI claims
will be reported separately from browser wallet/UI acceptance.

## Incremental random ordering boundary

Random ordering is **not enabled** in this core release and does not block its
deterministic trade/claim acceptance. After that closes, add a separately
versioned fixed-batch checkpoint-seeded mode with at least two real members,
one set/seed/permutation across restart, exact ordered calls and unchanged AMM
pricing/refund rules. No global account traversal is reintroduced.

The diagram's previous-block seed can yield reproducible ordering when its
checkpoint data is authenticated. That alone does not establish unpredictability,
resistance to producer bias, authenticated seal-before-publication timing,
finality, or resistance to execution/seed withholding. Those properties remain
unqualified; no local seed, reroll, post-draw member replacement, universal
fairness or comprehensive MEV-resistance claim is authorized. A fixed-batch
experiment must disclose these limits rather than present them as solved.
