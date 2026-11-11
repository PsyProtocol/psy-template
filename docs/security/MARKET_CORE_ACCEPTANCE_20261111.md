# Four-market core acceptance — 11 November 2026

## Scope and current verdict

The mainline is AMM, Orderbook, Bonding Curve and NFT Market: contract state
transitions, dedicated SD-key authorization, formal Executor orchestration,
complete UPSs, real fills, refunds and ordinary claims. Wallet work is limited
to a demonstrated blocking interface. No wallet code is changed in this case.

The application stays on `markets-batch-capacity-recovery-20261020`, beginning
at `dc5b4977`. The selected mainnet-beta SDK remains
`01b8f2b0a077367a7b9879baba1a72aea8ab5510`, client
`7058070057c3242b5d8b29e1a31d498aaa4202c0`. The historical build profile is
`sdk-audit-20261102-v1`; the name does not authorize a dependency migration.
Node, old contracts, source evidence and current market semantics are unchanged.
Shared vaults and deterministic ordering remain.

This is not production acceptance. The latest wallet regression is not evidence
of market settlement. Synthetic UPS verification, RPC observations, actual
network receipts and ordinary final claims remain separate evidence classes.

## Reconciled baseline and concrete gaps

| Market | Accepted current-release evidence | Remaining core acceptance |
| --- | --- | --- |
| AMM v18 | Eight source-bound vault UPSs; separate ordinary order/funding and first-session Native claim proofs | Linked ordinary liquidity/startup, trade, refund and final claims on the current chain |
| Curve v18 | Twelve reachable UPSs, six ordinary and six SD-key, including empty startup, funding, buy, exhausted fee recovery and final claim | Current-instance sell/refund/graduation binding and real confirmation/claims |
| Orderbook v19 | New 24-UPS linked chain: 13 ordinary and 11 SD-key UPSs, empty startup, exact funding, price/time match, final claims, cancellation/refund and fee recovery | Current-instance formal Executor/network acceptance, fee-owner-offline exit and unused-treasury return |
| NFT Market v21 | Fifteen vault UPSs and one separate ordinary buyer preparation/order/funding UPS; fixed absent-collection initialization; new current-ABI seller call builder | Connected ordinary seller/final claim, approved NFT-tuple binding and current-instance unique sale/refund/network acceptance |

The NFT route uses v21 and the new explicit collection `prepare_account` method.
The older v19 first-use rejection and rejected omission-only v20 remain history.
Existing safe guards are not removed. See
[NFT bootstrap evidence](NFT_ACCOUNT_BOOTSTRAP_20261104.md).

## First implementation: reachable Orderbook account chain

`book_reachable_full_ups.rs` composes the existing public FT bytecode, complete
ordinary-signature helper, v19 source/priority key and actual SDK UPS manager.
Only explicit synthetic QA genesis balances are seeded. Every later actor
mutation must be an ordinary or SD-key complete UPS. Independent VM execution
is an endpoint cross-check, not a substitute for a signed actor transaction.

The verified synthetic chain includes:

- Ordinary fee-owner authorization, exact Native funding and issuer activation
  seeds; a registered empty vault's first complete UPS returns those exact seeds.
- An issuer FT transfer and the counterparty's ordinary claim **before** spending.
- Two signed, funded whole orders with both U124 limbs nonzero.
- An authenticated multi-page source, deterministic global price/time frontier,
  exact fill and two separate ordinary final claims.
- Fee-cap exhaustion without state changes and an explicit owner recovery grant
  that preserves the original set and expiry.
- A new unmatched order, cancellation after sealing, original-set timeout refund,
  final ordinary asset/fee claim and order closure.
- Duplicate-fill/refund and changed-frontier-cursor rejection; full FT/Outbox and
  Native conservation including every ordinary and vault fee.

A new public graph audit checks linked per-account nonces, state endpoints,
source/plan presence and exact fees. Its refusal tests are not cryptographic
verification. Each produced request separately needs the frozen native verifier
and common data; a JSON success flag cannot certify a proof or receipt.

## NFT seller client integration

The current v21 client now also exposes `nftAccountListingCalls`. It selects the
actual current Native `transfer` interface, rather than borrowing the old v3
builder's `simple_transfer`. It pins the explicit v21 policy/market and asset
configuration, preserves seller FIFO acknowledgement, and constructs listing,
fee funding and NFT transfer in order. It checks complete U124 price limbs,
ownership-slot range and nonce/deadline bounds. It does not assert wallet
approval or authenticate code/layout from ABI alone; the native/wallet gates
still own those checks. No seller financial transaction is sent by this change.

The reviewed-artifact test covers exact seller calls and rejects wrong market,
assets, Native protocol, zero/overflow prices, invalid slots and nonce/deadline
bounds. NFT policy and formal adapter modules pass 34 checks. The first grouped
host invocation omitted `BATCH_BUILD` for the separate legacy-client module;
that setup failure is preserved. Only that failed module is rerun with the
frozen fixture and passes all five checks. This does not close the ordinary
seller/final-claim complete-UPS or real NFT acceptance gaps.

The latest public graph cohort passes 16 checks; the 31 unchanged formal
registration/recovery/exit checks remain accepted. All 24 complete Endcaps and
metadata independently verify under the retained frozen verifier/common data;
24 changed-fee, 24 changed-endpoint and 24 corrupt-proof cases reject. This
independent executable does not separately prove approved stacks or state-delta
cryptography. The actual producer/key/session and VM endpoint checks provide
their own evidence. No proof is regenerated merely to increase a count.

### Preserved initial failure and corrected preparation

The first native release build succeeds. Its new reachable Book test verifies
seven complete UPSs, then stops at the source-eligibility assertion before
sealing or broadcasting anything. The minimal QA genesis materializes both FTs
for maker 200, but the new counterparty 201 has only the claimed payment FT.
The existing pair-source rule requires authenticated receiving state as well;
the missing receive-asset partition must not be silently treated as prepared.
The corrected sequence uses real issuer transfers and ordinary claims of exact
one-unit receive seeds. Every seed remains separately conserved. Eligibility
coverage is now saved before asserting the expected complete member set.

A second test assumption is corrected before proving it: an initial lifetime
cap of three **maximum** fees cannot reject the third bounded fee. The sequence
first proves one coverage page and tests exhaustion on the fourth vault UPS,
then applies the ordinary owner's explicit recovery grant and resumes the
remaining original page. The owned intermediate compile is stopped and its
snapshot/log retained; no proof or financial request from it is executed.

Only the unchanged first three stages may be restored from a hash-pinned public
prefix: owner authorization, issuer activation seeds and vault bootstrap. The
test re-verifies the exact complete Endcaps, identities/nonces/start endpoints,
fixed SD-key proof and signature/session preimage, expected ordinary calls and
the re-executed VM endpoint roots. It does not generate these proofs again or
use restoration for network broadcasting. The four later original proofs stay
on their failed setup branch; they are not spliced into the corrected state
chain. The first recovery attempt correctly rejects a logical/compact stack
representation mismatch before producing a new proof: the stored witness has
40 logical slots while the actual SDK stack has ten bootstrap calls. The fixed
restorer validates both representations and their exact mapping, rather than
removing the call/parameter/count guard. That failure remains preserved.

The corrected chain passes all 24 UPSs: three reused and 21 newly generated.
Including the four separate failed-setup suffix proofs, the case has 28 distinct
new complete UPSs, not 31 sequential transactions. The new-proof cap stays 40
and the 7,200-second aggregate proof-process cap is not expanded.

### Cost and remaining ownership boundaries

The successful process takes **2,073.638 seconds**, including **675.572 seconds**
of resource construction. New fill proof/audit time is **159.72 seconds**;
the two ordinary trade-output claim proofs take **26.86 / 38.21 seconds**.
These are full synthetic proof-process timings, not network confirmation or
browser claiming. The 13 ordinary and 11 vault burns total **24.000258 synthetic
PSY**; actual network spending is zero. RPC state/fee preparation and actual
confirmation are not measured by an in-memory store.

Sampled process-family RSS peaks at **1,240,496 KiB**. A live macOS snapshot
reports a **7.3 GiB** charged footprint peak while the system uses about
**68,949 MiB** of swap. The OS ledger includes compressed/swapped pages; it is
neither final exclusive physical-RAM peak nor interchangeable with sampled RSS.
Shared-host pressure, failed runs and reused-prefix timings are retained, so
there is no same-condition speedup, p95, sustained TPS or production conclusion.

Market users claim every actual trade/refund output. Returned FT activation
seeds remain issuer-owned Outboxes until separately claimed. Native activation
contribution and tagged unused owner treasury are distinct from those user
outputs. This cohort does not certify their full return or fee-owner-offline
exit. Conservation alone is not a statement that every contribution was returned.

## Fresh read-only preflight

Twelve bounded, TLS-verified requests succeed. Checkpoint-1 global state anchor,
complete Native leaf and runtime verifier resource bytes match the accepted
freeze. The Native code and all eleven ordinary verifier roles independently
match their fixed build resources. Observed heads are realm 0 **101175**, realm 1
**101176**, coordinator **101176**. Later execution must select fresh common
state and repeat its own full gates; these observations do not authorize a
stale proof or substitute for runtime/finality/upgrade attestation.

The hosted faucet is enabled for 1,000 test PSY with no Turnstile at observation.
No old faucet request is resent. Old chain accounts/receipts are historical only.
The checkpoint-tree root and checkpoint-leaf global state root retain their
separate meanings; one cannot be substituted for the other.

A later bounded source-inventory capture stops on read 35 with curl 35
`SSL_ERROR_SYSCALL`. Its 29 verified paths expose only a 22-account lower bound;
the capture is incomplete. Registration serial 9,330 is not an occupied-account
count, and neither count can replace authenticated market eligibility. This
advisory read capture cannot authorize funding or establish global inclusion.

## Bounded execution and financial gate

Root is the sole proof/financial owner for this case. Existing process ownership
was checked; no other financial or proof task was started or disturbed.

Offline limit: six native build commands, 40 new complete UPSs, 7,200 aggregate
proof-process seconds, two prover threads and 12 GiB sampled process-family RSS;
total case wall budget is three hours. RSS can double-count shared pages and miss
short peaks; it is not unique physical memory. Timings are correctness telemetry,
not matched speedup, network confirmation or TPS.

Conditional live limit: at most three new ordinary QA accounts, four new SD-key
vaults and seven new contracts. At most one faucet request per new verified
identity, three total. Maximum test-PSY expense is 240 PSY and maximum Native
seed liquidity is 10 PSY. New QA public FT/NFT assets, faucet test PSY and existing
pUSDT are separate; existing pUSDT and other-task wallet funds are not used.

No mutation proceeds before fresh compatibility, identity, actual code/layout/
function-root, key, registration, full stack/session/sig_hash, state/nonce,
expiry and fee checks, plus an instance-specific plan. Exact request and intent
must be durable before a single send. Unknown outcomes stop dependent stages;
no automatic re-sign, replacement payment or resend. Each original request and
failed artifact remains unchanged outside Git.

The formal lifecycle already stops at an ordinary-wallet stage when no owned
approved adapter is supplied. An isolated test script does not close that formal
Executor integration gate. Live registration, bootstrap, fills, refunds, claims
and precise receipt recovery must be reported individually with actual asset
ownership, rather than inferred from a complete proof or ACK.

## Publication and unclosed boundaries

Raw files remain at
`psy-market-recovery-20261023/markets-core-acceptance-20261111-v1`.
Only a small English report and artifact hash inventory enter Git. Keys, mnemonic
phrases, secret witnesses, SDK copies and full proof dumps are excluded.
See [compact Book evidence and reproduction](../../executor/verification/2026-11-11-reachable-book-v1/README.md)
and [the separately pushed NFT seller milestone](NFT_SELLER_CLIENT_20261111.md).

Randomness/finality/seal timing, all-market admission/censorship, cross-machine
coordination, sustained service and current-chain double-pool acceptance remain
separate gates. A shared vault orders its own state transitions; proof aggregation
is not complete same-pool parallelism. Multiple UPSs are a recoverable workflow,
not cross-vault atomicity. Nothing here changes pricing or matching mechanisms.
