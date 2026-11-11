# Product release continuation — 11 November 2026

Latest status: the complete wallet rerun passes **810 tests with one existing
skip**, and the frozen SDK/typecheck/build passes. The user-authorized original
candidate reaches the actual extension welcome page; no account or payment is
created. The later cold-read correction is built but not installed in the browser.
[Latest evidence and explicit gates](../../executor/verification/2026-11-11-product-release-v1/CURRENT.json).
Earlier measurements below remain chronological history, not the latest verdict.

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

## Final build and delivery result

The exact changed runtime sources remain byte-identical after commit hooks to
the tested isolated inputs. Application source `4c072a0c` and wallet source
`166bd8f` were pushed to their existing branches. The final frozen-SDK staging
build passes: **695.254 seconds**, sampled family RSS **1,338,080 KiB**.
Post-build verification again matches all 472 frozen SDK distribution members.
The final wallet suite still has five original-deadline timeouts; build success
does not waive them. No matched end-to-end performance conclusion follows.

A fresh local candidate at `/Users/geir/Downloads/psy-wallet-market-qa-20261111-v1`
contains 29 byte-hashed files (127,145,979 bytes), copied once and independently
compared to the final build. It contains no local faucet-operator file and has
not been installed. Its existing manifest permissions include storage, scripting,
tabs and `<all_urls>` access; this is QA software, not an approved production
release. The user has been asked to load it only into the explicitly named new
profile, without creating/importing an account or initiating registration/funds.
The finished setup task keeps that profile's Extensions page for the user.
[Final build, candidate hashes and remaining gates](https://github.com/PsyProtocol/psy-template/blob/markets-batch-capacity-recovery-20261020/executor/verification/2026-11-11-product-release-v1/FINAL.json).


## Actual extension startup and cold RPC correction

The user explicitly requested agent installation after the candidate and its
permissions were presented. Candidate v1 was installed only in the named new
profile. Chrome's actual Extensions page shows Psy 0.4.25 enabled, ID
`bojecgdaobonliaafdekliffgeidpdgh`; the actual extension origin reaches
`#welcome`. No account was created/imported, no registration was invoked, and no
transaction prepare/prove, broadcast or claim was requested. Automatic SDK
startup may initialize proving resources; its memory/performance was not measured.
The welcome result page is kept for the user; other profiles remain untouched.

The first cold startup refused to establish a chain identity. Four bounded,
explicitly declared extension-origin diagnostic requests returned HTTP 200 and
matching checkpoint-tree roots from coordinator, realm 0 and realm 1. Cold
samples exceeded the old three-second read budget. One original-budget boot retry
reached welcome after those diagnostics. This supports a cold-budget deficiency,
not a claim that timeout was proven to be the only possible failure cause. The
generic existing failure screen mentions the prove proxy even though this error
was from chain-identity observation.

The application read deadline is now a scheduled 10-second bound, preserving
all wire, valid-root disagreement, reset confirmation, no-stale-history and
explicit-invalid-params-only fallback rules. No transaction deadline or proof
check changed. A stalled/paused event loop can delay a scheduled timer; it is
not a hard wall-time guarantee. Two new fake-clock tests exercise a 4.5-second
cold reply and the fixed abort boundary. All 30 identity/boot checks pass.

The checkpoint **tree** root at 1 is
`e4f0f2cf2a563c11f67131f5b9b0e032c6b4016a59503b42cdc5aeb86af2fe30`.
It is not the checkpoint-leaf `global_chain_root` captured earlier as
`81bac993…`; these are different commitments. Frozen client source
`7058070/psy_node_common/src/coordinator/edge/api.rs` and
`psy_node_core/src/psy_core_db/core_implementation/base.rs` identify the former as
the global checkpoint Merkle tree root. They must never be substituted or called
a chain reset merely because the hashes differ. Neither observation proves finality.

After this application correction, the complete unfiltered wallet suite passes
**810 tests with one existing skip**, all 73 files, in **36.181 seconds**,
sampled family RSS **1,054,256 KiB**. No original test deadline was increased,
no test was removed, and the prior five timeouts remain archived. This rerun
closes the current regression cohort; it does not close under-pressure sustained
service acceptance. The latest frozen SDK/typecheck/staging build also passes:
**87.345 seconds**, sampled family RSS **2,362,240 KiB**. Host load/cache state
differs from the 695.254-second build; this is not a controlled acceleration or
cold/warm proof comparison. Complete browser payment, live fills and ordinary
claims are still pending.

The loaded browser candidate is v1 (`166bd8f`) with the original read deadline.
The new network-read source passes host regression/build but has not yet been
installed/retested in the browser. The v1 directory and all original records
remain unchanged; installing any later candidate is a separate explicit action.
