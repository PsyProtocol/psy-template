# Authenticated bounded admission candidate

Distinct new market layouts/code roots. Not deployed; not compatible with an
existing V2 vault or the ordinary Executor/wallet fixed-count signing route.
The compact key and full-UPS fixture use an explicit application signing path.
Do not enable this profile in a live wallet until that adapter is implemented
and audited. The Node SDK exact-count route is not disabled or bypassed.

## Scope and lifecycle

- The proven universe is **up to four accepted entries in one vault epoch**.
  Unaccepted user intents, users absent from the queue, and other markets are
  outside this scope. Admission can still be censored. This is not a proof that
  every market order was included or that admission itself is globally fair.
- `start_epoch` fixes a monotonically increasing epoch and checkpoint cutoff
  (at most 128 checkpoints ahead). User `request_admission(epoch, cutoff)` binds
  consent to the current signed order nonce. Opening an order alone is not
  sufficient queue consent. An ordinary wallet must prove that consent call.
- `admit_entry` reads authenticated foreign user order/consent state, requires
  the correct vault, unconsumed nonce, explicit epoch/cutoff consent, no duplicate
  owner, room in the queue, and checkpoint <= cutoff. Insertions sort unique
  owners. It records a Poseidon commitment to immutable order terms.
- Cancellation is excluded from that immutable-terms hash so cancellation before
  batch commitment can yield a refund. Cancellation after batch commitment
  follows the existing frozen-snapshot rule. Funding is snapshotted by the batch
  commit, not represented as having been frozen at the admission cutoff.
- `seal_epoch` requires checkpoint > cutoff and a nonempty queue. It derives the
  root from network/contract/vault domain, epoch/cutoff/count, all owners/nonces
  and order hashes. The Executor cannot supply a replacement root or append
  entries after sealing.
- `commit_batch` must contain exactly the sealed queue's sorted owners/nonces,
  and authenticated current terms must match the admission hashes. Its batch
  commitment also binds queue root/epoch/cutoff/count. No implicit NFT listing
  references with nonce zero are accepted: sellers and buyers must each consent.
- Market contracts retain their own verifiable execution order and price/time
  checks. On `finish_batch`, every admitted member is trade=1, refund=2, or
  legal carry=3. Only existing Book/NFT carry rules permit carry. There is no
  arbitrary exclusion branch. The queue root and results fold into a history
  commitment. External history blobs are needed to reconstruct old epochs.
- Batch expiry keeps the accepted queue sealed. Recommit cannot change scope.
  A nonempty queue cannot be discarded through the empty-epoch abort method.
  An expired empty queue can abort. A new epoch requires terminal queue state.

Admission state writes share the vault and must serialize. Users can submit
intents in parallel; receipt into the single authenticated queue is not fully
parallel. Local compare-and-commit race tests are not network scheduler tests.

## Fees and key

The new maintenance templates prepend `fund_gas(payer,F)` and native claim to
each start/admit/seal/empty-abort operation, with F=1,000,100,000 base units.
The payer must authorize that sponsorship and fund the outbox with a fresh
nonce. The full stack includes the final automatic burn. The original spending
policy caps burn at the budget for <=100 modified leaves. Operator sponsorship
is separate from user order escrow; admission is not represented as free.

All logical slots remain constrained. `compact-v1` skips only the exact market
zero-input noop identity after canonical slot binding; it reconstructs the
actual stack/count and UPS session digest. This is a new key/fingerprint and
must be registered with a new vault after release gates are satisfied.

## Evidence boundaries

See `docs/security/MARKET_BATCH_RELEASE_REVIEW_20261020.md` for current results.
The VM suite covers explicit consent, omission, duplicate/forged owner, swapped
batch root, legal carry, cancellation/refund, expired empty queue, timeout and
recommit, and eight workers racing one vault anchor. Full vault admission UPS
proofs run separately; ordinary user/sponsor calls in those synthetic fixtures
are VM-only. None of these is live network acceptance.

Randomness is disabled, including rejection of seed/source configuration. A
future mode needs authenticated pre-seed inclusion, unbiased future source,
full permutation checks, tie rules and anti-abort recovery before activation.
