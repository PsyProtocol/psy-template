# Shared-vault market batch v2 design

Implementation lives in independent `batching/v2`/`batch-v2`. Scope/evidence:
[profile](../../batching/v2/README.md), [results](../security/MARKET_BATCH_V2_RESULTS_20261020.md).
This design retains original preflight limits and acceptance targets; unmeasured
network metrics are not completed work. Changes are application-owned contracts,
SD-key, compiler bridge and Executor only: shared vaults, unchanged Node/FT/NFT,
deterministic ordering, random mode disabled.

## 1. State and submission phases

Users order/fund in their own partitions concurrently. Executor reads orders,
funding cursors and vault at one checkpoint and proposes a bounded set. Independent
users can prove concurrently; one vault's shared state still evolves sequentially.

- `commit_batch`: after prior completion/safe expiry, stores ID, version, cutoff,
  set commitment, sort mode, member count and expiry.
- `begin_batch`: checks confirmed commitment/full bounded set; derives ordering,
  fills and refunds from authenticated orders.
- Operation guards permit only the next batch step, checking ID/cursor/shared
  state/payable amounts and advancing cursor.
- `finish_batch`: every member has a lawful outcome and payment calls complete;
  binds final state/result commitment.
- `expire_batch`: releases an unsettled expired commitment, never refunds spent
  or already refunded assets again.

Commit and settlement are **two independent UPS**. Only the settle UPS is atomic;
the pair does not roll back together. Commit claims no order assets. Reproof stays
on the same ID/set/order. Commit fees require an explicit payer, cursor and refund
policy, not another user's principal. Local JSON is not an on-chain freeze:
a proven contract commitment and settlement read must exist.

## 2. Member and outcome binding

Circuit commitments use versioned/domain-separated Poseidon. File SHA 256 remains
an integrity check, not circuit set authentication. Bind network magic, market/
asset IDs, vault, version, batch ID, cutoff, count, ordering and each user's ID,
nonce, type, amounts, limits, deadline, counterparty/NFT identity, actual deposits
and settlement cursors.

Commit the deduplicated canonical set separately from rule-derived execution
order. Require a complete one-to-one permutation; reordered input cannot select
priority or add/repeat/omit members. Every member fills, lawfully refunds or carries.
Book carry does not finalize consumed or recharge fees and can join a later batch.
An unverified skip flag cannot discard difficult orders.

Initial discovery scans a user list, not a certified global queue. The first
version guarantees order/coverage **inside its committed set only**. Global
price/time fairness needs authenticated indexing/admission and omission proofs or
challenges, with explicit write contention, fees, admission times and cutoff.
Central scan order is not global arrival order.

## 3. Market semantics

| Market | Deterministic ordering/state | Required constraints |
| --- | --- | --- |
| AMM | `(order_checkpoint,user_id,order_nonce)`, sequential reserves/LP | Authenticated checkpoint; contract-derived slippage/expiry/cancel branches; next fill uses preceding reserves |
| Curve | Same ordering; sequential sold lots/reserves | New limit orders without reinterpreting exact quotes; inventory/graduation/refund coverage |
| Orderbook | Lowest ask, highest bid; ties checkpoint/user/nonce | Full-limb cross-product price comparison and circuit priority, not JS-only sorting |
| NFT Market | Buy checkpoint/buyer/buy nonce; exact seller/listing nonce | One winner per listing; other buyers refund without duplicate NFT/fees |

Checkpoint ties have no trusted global arrival order. Public ID/nonce tie-breaking
is deterministic, not random fairness or strict network FIFO.

AMM checks actual reserves, exact floor outputs, minimums, deadlines and fees.
Mixed LP/swap operations require one canonical shared-state order; the initial
profile may restrict homogeneous operations rather than let Executor choose
profitable mixing. Contract-derived refund conditions prevent refunding all valid
orders and calling that complete processing.

Curve exact `expected_sold == sold_lots` orders go stale after the first fill.
Limit buys fix lots/max_quote and deposit max; execution computes current cost,
fills within cap and returns surplus. Limit sells fix lots/min_quote and token
input; fill above minimum or refund tokens. Legacy exact quotes retain semantics;
they are not implicit consent to a higher price. Deposit/fill/refund/fee cursors
stay distinct. Graduation is separate and must preserve unfinished exits.

Book retains whole-order pairing. Verify priority inside the committed set and
choose the earliest compatible pair satisfying both minimums. Crossing prices
alone do not ensure compatible whole sizes. Unmatched orders remain valid, with
no repeated fund/fee claim. Partial fills need separate remainder/cursor/rounding
design.

NFT terminal keys are `(seller,listing_nonce)` and `(buyer,buy_nonce)`. One terminal
outcome cannot change to another. Losing buyers have executable refunds. Validate
recipient capacity, sender FIFO, scratch slot, ACK, metadata and cursors. Do not
omit ACK to fit a batch. Initial size limits reject repeated identities/cross roles
and allow only one terminal operation per person.

## 4. Cancellation, historical reads and refunds

AMM/Book/Curve add signed cancel requests/checkpoints; NFT cancellation enters the
same outcome rules. Cancellation present in the committed cutoff state permits
only refund. Later requests do not retroactively alter frozen results. Historical
foreign reads mean a request cannot instantly defeat every prepared fill proof.

Current vault consumed/batch ID/cursor allows one final commit. After fill/refund,
historical OPEN duplicates must fail against changed vault state. User nonce or
Executor memory locks alone are insufficient. Refunds bind original payer/asset,
actual claimable cumulative delta and terminal state. Excess/insufficient/half-LP/
fee-missing deposits need explicit exits, not silent scanner exclusion.

## 5. SD-key and driver

Use an independently versioned builder/Rust circuit; extra arrays cannot be
smuggled into the legacy 13-Felt witness. Register a new fingerprint rather than
widen authorization under an old identity.

The original implementation fixes **40 introspection slots/74-Felt witness**:
four worst-case refunds at nine slots each, begin/finish, padding and burn. Unused
slots are market-bound noops; final slot is automatic burn. Each dynamic slot binds
contract/method/caller/input hash/input length; index/commitment bind its guard.

In-place fingerprint replacement for an old vault is not accepted. Shared-vault
architecture does not authorize changing legacy keys. Default to new independent
shared vaults for offline/isolated tests; old assets remain claimable. Real migration
requires its own reviewable path. Driver retains frozen binary, raw-request binding,
full UPS/public endpoints, roots and exact broadcast identity. Application root
checks do not establish immutable code; upgrade authorization remains open.

## 6. Executor and recovery

Durable journal separately tracks commit/settle/expire/maintenance through proof,
broadcast intent and exact receipt. Unresolved intent blocks mutations. Persist
immutable members/order inputs/requests/commitments/driver/guard hashes. Restart
cannot reselect members; pending does not authorize resend. Reconcile exact
end-leaf before continuing.

Same-host processes lock by network/vault. Multi-host chain anchors/batch state
adjudicate competing proofs, but no distributed lease means no claim of one prover
across machines. Reads/independent preparation can overlap; shared transitions
and submissions preserve dependencies.

## 7. Delivery and acceptance

| Stage | Deliverable | Gate |
| --- | --- | --- |
| P0 | Capacity/fees/randomness/atomicity preflight/design | Accurate evidence/open-item scope |
| P1 | Canonical set/state/order/four new entry points/policy | Generated ABI/layout, full binding, positive/negative bytecode |
| P2 | AMM/Curve sequential proofs, Book priority, NFT unique winner | Authenticated CFC/full UPS; late-call, fee and reordering failures have no partial commit |
| P3 | Durable Executor recovery/profile routing | Two executors, crash/delayed receipts, expiry/cancel/refund races |
| P4 | Actual batch benchmark/isolated network | All metrics below, including failed samples |
| P5, externally blocked | Future-seed ordering | Authenticated hard-to-bias seed after commitment, full permutation, selection/abort-grinding defenses |

Cover omitted/duplicate members, low/high/nonce/contract/vault/network/cutoff/root/
branch/order/tail-call mutation; cross-batch replay; multiple NFT buyers; fill/
cancel/refund races and historical OPEN versus current consumed. First/middle/last
call failure, funds/slippage/inventory/expiry/capacity/ACK failures reject the whole
settle UPS. Test excess/short/orphan deposits, surplus refund, carry without fees,
ordinary claims and exact payer recovery. Crash at commit/proof/intent/send/receipt
boundaries; unresolved work blocks the next batch. Test local competition,
simulated remote races, same/different pools; distinguish models from actual
coordinator acceptance.

## 8. Measurement

Start with one/two operations per market; expand only after all gates. Book reports
pairs and member orders separately; NFT reports sales/buys/listings without double
counting. Record read/freeze, compile/cold start, each CFC, recursion/signature,
end-cap, verify, submit/confirm p50/p95; proof/RPC bytes, RSS/CPU, modified slots,
burn, fees and refunds. Include commit costs.

Separate VM ops/s, full-proved settled ops/s per vault (including commit/reproof),
and chain-confirmed fills/orders/refunds per second with two-stage waits and
claims. Compare same machine, initial pools, distribution and total operations.
Test-data seeds are only reproducibility inputs, never market randomness. Measure
parallel user admission separately from ordered same-pool execution; aggregation
count is not independent-fill throughput.

## 9. Implementation supplement: 2026-10-20

- Four members per market: AMM/Curve up to four orders; Book/NFT up to two pairs.
  Book pairs and NFT seller references consume members. At most four nine-call
  blocks, 40 total calls including burn.
- Commit freezes orders/funding without claiming principal. Explicit Sponsor
  prepays 2F, F=1,000,100,000 native atoms, for commit/settle burn caps. Purpose 1
  means commit, 2 maintenance funding; pool/amount/increasing nonce are constrained.
- Executor expiry defaults 256, allowed 1..1024, contract cap 1024. Configure to
  measured checkpoint/proof/reproof/wait costs, not fixed seconds. Proof checkpoint
  expiry is not trusted wall-clock global revocation.
- Explicit activation materializes trees. FT markets need F plus one atom/asset,
  returned to payer; NFT activation payer is collection issuer and FT seed returns.
  Do not prove reads against uninitialized empty foreign trees.
- Buyer NFT ACK(vault) precedes open_buy in the same ordinary UPS if desired.
- Unified refund_funding branches return actual invalid/cancelled/expired funding
  and prepaid fee; losing NFT buyers refund too. Valid AMM/Curve price failures
  retain original processing fee and contract-check the quote condition.
- Orphan deposits require sender request_recovery(pool); active nonterminal orders
  cannot bypass priority. Maintenance runs only outside an active batch.
- Full NFT queue or new deposits after commit may make a candidate unexecutable.
  Wait for claims or expire then rebuild with new cursors; do not ignore funding.
  Expire moves no principal; later batch/payer recovery remains available.
- Random mode stays disabled without authenticated hard-to-bias seed and a
  commit-before-seed protocol. No Executor-selected randomness.
- Verify actual VM, CFC, 40-call SD-key, full UPS end-cap and exported Merkle delta
  separately. Local competition models are not coordinator acceptance evidence.
