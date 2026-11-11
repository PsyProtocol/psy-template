# Current-chain market acceptance gate — 11 November 2026

## Verdict and ownership

**Four-market real trade and final-claim acceptance is not complete.** No market
contract, SD-key vault or market escrow is deployed/funded in this case. The
funding and ordinary Native operations below must not be counted as market fills,
FT/NFT delivery, formal Executor acceptance or browser/UI payments.

The branch starts at `e4703e79` on `markets-batch-capacity-recovery-20261020`.
SDK `01b8f2b0a077367a7b9879baba1a72aea8ab5510` and client
`7058070057c3242b5d8b29e1a31d498aaa4202c0` remain frozen. The historical build
profile is `sdk-audit-20261102-v1`; this is not a dependency migration. Node,
the wallet repository, old contracts and original artifacts are unchanged.
Root alone owns financial/proof execution. Existing unrelated browser profiles
and another project's compiler process are left untouched.

The declared limits are three ordinary QA actors, four vaults, seven contracts,
one faucet request per fresh verified identity (three maximum), 240 test PSY in
fees, and 10 test PSY of market seed liquidity. Two additional native build/test
commands are explicitly declared after the live fee-audit failure; the original
wall/proof and financial limits remain. Six Cargo build/test commands run,
plus four invocations of the already pinned bytecode compiler.
The 50 PSY QA-to-QA transfer is retained internal funding, not market liquidity
or an additional expense. Three complete ordinary UPSs are produced, without
re-signing an unknown transaction. All mutation outcomes in this case are
reconciled; this does not dispose of unknown requests from historical chains.

## Actual current-chain results

Fresh RPC observations match checkpoint-one anchor
`81bac9934a1c18579519b5297c94c7e7d25cb53973ac67befefe8b7a86f96b5c`,
the exact Native leaf and eleven ordinary verifier roles of the selected freeze.
This is compatibility evidence, not running-image, upgrade-authorization or
consensus-finality attestation. The isolated application config changes only
`defaultNetwork` from `localhost` to `testnet`; frozen sources remain untouched.

- QA issuer `971904` and separate fee owner `668800` are newly registered.
  Their exact public keys and registration/checkpoint membership proofs verify.
- One official faucet request grants 1,000 test PSY. Its returned `tx_hash` is
  an **end-user leaf hash**, not a services content hash. A preserved direct
  content-hash lookup returns 404; the existing exact receipt reader correctly
  joins the historical operator leaf to the indexed receipt. No faucet retry
  or replacement grant occurs.
- The issuer's first ordinary claim is included at **102397**, nonce 1,
  content hash `687465c828471a05883159cbdbf343c514b81b5c058c69dad3dd060cd17e53ce`.
  Its expected fee-only audit **fails** and remains a failed sample.
- After the fix, the issuer's exact 50 PSY transfer is included at **102608**,
  nonce 2, content hash
  `4d964bb85e5207b5d8b5d9f49250e4bfd0eca3427ec0499e0c6d92917cadb465`.
- The recipient's first ordinary claim is included at **102692**, nonce 1,
  content hash `18548f9d01125f3d302f51e0d0bed08ab5ac5fb12bdfe0ac5072035331f59255`.
  It receives **48.999998 PSY**, with one **1.000002 PSY** execution fee.
  The corrected transfer and claim each have two SDK transactions: one business
  call and the SDK-owned fee completion. Their exact saved proofs independently
  reverify, without generating or broadcasting another request.

### Preserved fee failure and application fix

The first claim input incorrectly includes an explicit Native `burn(1000002000)`.
The high-level frozen `WalletSession::sign` also finalizes with `prove_burn_fee`.
The extra call is a separate Native business burn, **not** a second execution
fee reported by the chain. That request genuinely executes three SDK calls.
Its complete proof remains valid, but validity does not make the input intent
correct. The post-confirmation balance audit catches the extra debit.

The isolated ordinary client now rejects explicit contract-0 `burn` before
calling/proving its business vector. FT burns on other reviewed contracts remain
distinct. Low-level SD-key sessions retain their explicit completion protocol.
The client also requires a canonical reviewed chain anchor and rechecks it before
registration, initial deployment and ordinary broadcast. Ordinary registration
now uses the existing one-send, no-redirect/no-retry transport. No wallet business
module or Node source is changed to fix this acceptance-client error.

Five native unit checks cover this refusal, chain resets/canonical roots,
dependency identities, bounded public retries and private diagnostic suppression.
The corrected real transfer/claim closes this specific fee regression; it does
not close the original failed sample or any market scenario.

At checkpoint **102700**, the issuer holds **946.999994 PSY** and the fee owner
holds **48.999998 PSY**. Known cohort Outboxes are fully claimed. Accounting is:

```text
1,000 grant = 995.999992 spendable + 3.000006 execution fees + 1.000002 extra burn
```

The extra burn is not refunded or hidden. Actual owned-cohort expense is
**4.000008 test PSY**. Existing pUSDT, other wallets and user assets are unused.
Two supervisor records originally report zero mutation attempts for newly added
mode names; an immutable correction points to their durable requests/intents and
acknowledgements. Those mutations are counted above, not replayed.

## Source feasibility: the market release blocker

The historical planning capture is pinned to checkpoint **102165**, user root
`d8df71dd8ec22b5f855f4b01105d83304416d0d6559eb350fb83ec4b9fade979`.
It authenticates **862 paths and a 614-account lower bound**, and is **incomplete**.
These are nonzero accounts, not 614 eligible orders. Registration serials or a
scan shortlist cannot certify the missing universe. A live market still needs
a fresh complete source after setup/funding; this historical capture cannot be
reused as that authorization.

With the current four-account coverage UPS, even this lower bound requires
**154 coverage UPSs per market / 616 across four markets**. At the observed
minimum one-PSY base fee, coverage alone exceeds the 240 PSY ceiling, before
setup, matching, refunds and claims. The formal lifecycle's 128-stage bound also
cannot describe even that single-market coverage plus setup in one plan. A
reviewed continuation/budget mechanism is required; this is separate from
per-UPS call or order capacity. Coverage alone also exceeds this case's declared
120-new-UPS limit. No market deposit is made from an incomplete or
obviously unfit plan. Funding exists; it is not a faucet/RPC outage blocker.

The existing deterministic keys/contracts also enforce source + 32 checkpoints.
New **offline** window candidates v22 (AMM/Curve), v23 (Book), v24 (NFT) fix the
window at 4096 in both generated bytecode and key constraints. All other method
bodies and layouts remain exact predecessors. Four real candidate artifacts
compile and current generators/policies reproduce them. Unsafe numeric config
amounts are rejected in favor of exact decimal strings. SDK, market-kind,
collection initialization, source/priority, fee and exit constraints remain.

**These candidates have no new complete-UPS or live acceptance.** Formal Executor
selection rejects them. No live binding, key registration or deployment is issued.
Extending expiry does not reduce coverage count/proof cost and may lengthen an
unaccepted source's timeout exit. It is not the solution to the fee problem.
No randomness, per-UPS capacity or pricing/matching change is enabled.

The next market milestone needs an authenticated complete-source cost reduction
or a complete, explicitly budgeted feasible lifecycle, including deadlines and
all exits. Raising a config number, dropping accounts or counting a selected list
as global completeness is not an acceptance result.

## Immutable evidence and read-resource correction

The initial source capture stops after 900.301 seconds / 265 reads. An explicit
same-root continuation stops after 243.332 seconds / 256 reads on its 256 MiB
capture limit: cumulative transcript/report copies consume **267,286,627 bytes**.
Both originals remain intact outside Git.

An opt-in compact capture keeps every raw request/response, per-proof data and
prefix input/report digests. Only explicitly derivative verifier scratch is
discarded; terminal snapshots remain reconstructable. It continues for 360.602
seconds / 358 reads, retains **4,326,388 bytes**, reconstructs all **354** prefix
input hashes, and independently replays the final report byte-for-byte using the
unchanged frozen native verifier. It still does not prove a complete source.
Different segments are not a matched storage/performance benchmark.

The optional public-only TLS pool retains connections, not results or current
state. It pins a CA digest, rejects writes/redirects/trust changes, preserves
partial failures and enforces an absolute read deadline. A real-network probe
exposes a Python 3.10 `ResponseNotReady` lifecycle error; explicit response closure
fixes it. The original failed probe and bounded registration-read stop are kept.
Seven host tests include a real HTTP connection lifecycle, and three subsequent
TLS RPC reads succeed with the same socket object. This is a transport probe,
not settlement throughput. Curl remains the default capture mode.

## Timing and remaining acceptance

All three ordinary samples are fresh processes, not warm resident tasks:

| Sample | Process wall | SDK resource startup | Sampled family RSS peak |
| --- | --- | --- | --- |
| Original claim; expected fee audit failed | 184.103 s | 81.693 s | 1,611,040 KiB |
| Corrected QA transfer | 153.707 s | 65.264 s | 1,827,216 KiB |
| Corrected first claim | 149.141 s | 58.571 s | 1,937,680 KiB |

Phase records retain state/fee preparation, call proving, bundled recursive/
signature/Endcap work, complete verification and submit ACK. Receipt checks occur
later; controlled confirmation/final-arrival latency is not measured. Different
binaries, actors and amounts prevent a same-condition speedup comparison. RSS
can miss spikes/include shared pages; physical peak RAM is not measured. There
is no warm-state, market TPS, p95 or production-performance conclusion.

AMM, Curve, Book and NFT each have **zero current-case fills and market-output
claims**. Existing synthetic cohorts remain separate. Still open: instance-bound
QA assets/code/layout/key and full UPSs; source/fee/deadline fit; formal Executor
continuation, refunds and fee-owner-offline exits; NFT approved tuple binding;
ordinary market claims and real browser/UI approval. Upstream upgrade/runtime,
finality and qualified random-source boundaries are not closed by Native funding.

The [compact index](../../executor/verification/2026-11-11-market-network-v1/RESULTS.json)
records identities, original request/receipt hashes, verifier/binary/source
identities, failures, balances, timings and the exact local original directory.
Only compact public projections are committed; no SDK, binary, raw proof, key,
mnemonic or wallet recovery file is uploaded.
