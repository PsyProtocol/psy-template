# Product release continuation — 11 November 2026

## Status and scope

This continuation closes a public approval-projection gap and a mutable-event
signature-marker gap. It does **not** establish production readiness, current-chain
browser payment, finality, random-seed timing, or settlement throughput.

The application remains on `markets-batch-capacity-recovery-20261020`; the wallet
remains on `wallet-security-20261016`. The selected mainnet-beta source remains SDK
`01b8f2b0a077367a7b9879baba1a72aea8ab5510`, client
`7058070057c3242b5d8b29e1a31d498aaa4202c0`, source manifest
`246cfcb12788fe0d0eb79594556acdfcc7781d01641890e47836db1fbc93c467`.
The historical build-profile label is `sdk-audit-20261102-v1`; it does not imply a
new dependency migration. Node, dependencies, market semantics and old contracts
are unchanged. Previous committed work was pushed before this continuation;
the earlier Git authentication blocker is historical and resolved.

## Implemented changes

1. After complete CFC, external-note/session, signature, UPS and Endcap checking,
   Native/WASM verification exports a public compact-claim credit: asset,
   recipient, complete U124 base units and trusted executable roots. It exports
   neither receive randoms nor signing witnesses. Ordinary schema-1 behavior is
   retained.
2. The existing wallet journal passes independently verified credits to exact
   final review. A strict, wallet-owned catalogue binds code/layout/function
   identity and formats both limbs without JavaScript-number rounding. The
   approval digest commits the complete public terms, request identity and fee.
   Catalogue decimals/symbols are reviewed **display metadata**, not a claim of
   authenticated current metadata or metadata immutability.
3. Verifier loading bounds the response stream before concatenation and WASM
   compilation, checks declared/actual length and cancels unfinished input.
   Existing binary, pack, SDK, instance, race and initialization checks remain.
4. Reproducible vendoring includes the existing commitment capsule, new review
   policy and bounded reader. All 28 previous members remain; the inventory has
   31 members. Historical reviewed `bundle.json` is byte-identical, not silently
   promoted to a current-chain installed release.
5. Wallet transport snapshots each incoming event before fresh signature
   verification. A library verification symbol on a mutable input can no longer
   authenticate subsequently changed content. Routing, chunk validation,
   decryption and token-proof verification remain mandatory.
6. Mailbox envelope framing checks version/length without allocating the entire
   decoded ciphertext. Strict Base64 grammar and bounds are preserved; actual
   decryption still decodes/authenticates the complete ciphertext. A positive
   signature-cache experiment did not close the complete backlog test and was
   reverted. No signature, state, nonce, balance or proof cache was shipped.

## Evidence and reproduction

Public, compact evidence index:
[production-product-20261111-v1](../../executor/verification/2026-11-11-product-release-v1/README.md).
Raw originals remain outside Git at
`psy-market-recovery-20261023/production-product-20261111-v1`.

- Nine bounded, TLS-verified, read-only requests succeeded. Current checkpoint-1
  root `81bac9934a1c18579519b5297c94c7e7d25cb53973ac67befefe8b7a86f96b5c`,
  the entire Native leaf and published runtime verification resources exactly
  match the accepted 4 November capture. Observed head: 100444. These are
  compatibility observations, not authenticated finality, running-build or
  upgrade-authorization attestations. Faucet configuration is enabled for 1000
  test PSY; **no faucet request, account creation or transfer was made**.
- Two bounded WASM builds reused the frozen SDK. The complete saved synthetic
  private claim independently verifies and exports its exact double-limb credit.
  The web-target loader verifies that same saved proof and retains identity/race
  refusal checks. Ordinary and first-session saved complete UPSs still verify.
  No replacement UPS was generated and no synthetic request was broadcast.
- The application cohort passes **81/81** with the original RPC-substitution
  vendor test retained alongside the new reproduction test. This includes
  secret-field, wrong-asset/recipient/root, amount overflow/rounding, fee,
  domain, stream-bound, journal and exact-request recovery refusals. Host send
  fixtures are simulated; Node-hosted extension-location tests are not browser
  payment acceptance.
- The final wallet suite records 803 passes, five timeout failures and one
  existing skip. All five failures report their original time limits, not failed
  assertions. This is not a passing suite or a waiver. Final staging build
  results are recorded separately in the compact acceptance index. The 4096-ticket/600-partial-group backlog test retains its
  original 60-second deadline and all slow/failing samples. It is not waived.

Reproduce application checks with the selected Node runtime, saved public
fixtures and the verifier module specified by `PSY_PRIVATE_FT_RECOVERY_WASM` and
`PSY_PRIVATE_FT_STACK_FIXTURE`; commands and source hashes are indexed. Wallet
checks use the isolated byte-exact 472-member SDK archive and `verify:sdk`, not
an unverified shared sibling package. No package update/install is required.

## Performance interpretation

Framing microbenchmarks are same-process host checks only. All six rounds,
orders, sizes and timings are retained. They do not measure mailbox delivery,
complete proofs, confirmation, claim, fee or settlement throughput. The complete
backlog test still failed its deadline; a local framing reduction is not an
end-to-end acceleration claim.

The host was heavily swapping (about 60 GiB used) with unrelated tasks running.
They were observed, not killed or altered. Such samples cannot establish matched
performance, p95, steady-state throughput, physical memory peak or a general
speedup. Supervisors record wall time and one-second sampled **process-family
RSS**, which can double-count shared pages and miss short peaks. Build time is
not cold proof-construction or real confirmation time. No financial fee was
spent in this continuation; synthetic fixture fees are not network fees.

## Browser environment and remaining gates

The user explicitly selected a new isolated profile, **Psy Market QA 20261111**.
Profile creation completed without operating any previous wallet. The new
profile has no installed extension, account or funds at the recorded observation.
This establishes environment isolation, not a wallet approval or chain identity.
The installed Ego Lite version was retained; an update notice was not permission
to upgrade it. Other tasks' import forms, registrations and profiles remain
untouched.

The compact claim trace/signing producer, mounting the compact review into the
owned final approval UI, reviewed current-instance resource installation and
actual extension/network approval are still separate gates. The new review
catalogue is intentionally null, and private-claim execution stays closed.
No webpage can install a catalogue, verifier, resource URL or approval report.

Next, build and review the exact extension candidate, load it only into the
explicitly named empty profile, and hand credential creation/unlock to the user.
Then declare a fresh current-chain instance/funding/fee budget and perform the
full preflight before any faucet, registration, deployment or financial send.
Unknown outcomes remain held under their exact original identity. No older
chain request or historic contract ID is reusable as current-chain acceptance.

AMM, Curve, Book, NFT, double-pool settlement, ordinary claims, fee-exhaustion
exits and soak/performance acceptance remain open on the current chain. Shared
vaults retain state dependencies; multi-UPS composition is a staged workflow,
not cross-vault atomicity. Deterministic ordering remains the accepted mode.
Random-source finality and proof that sealing preceded seed disclosure remain
external protocol gates; no local random seed is substituted. Fixed-queue
completeness is not global market inclusion or censorship resistance.
