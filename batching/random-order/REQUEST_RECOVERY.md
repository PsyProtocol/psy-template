# Local candidate request pinning and recovery

This is an offline Executor operator interface. It pins a **candidate**, not an
accepted order queue or chain seal. No registration, RPC, proof generation,
signature, transaction, payment, draw approval or refund is performed. Random
execution remains disabled by the existing source gate.

## Immutable request and ownership

`RandomRequestJournal` validates the existing strict AMM/Curve candidate and
derives a local request identity:

```text
requestSha256 = SHA256("psy-random-candidate-request-v1\0" || JSON(all 74 canonical field strings))
```

This SHA256 identity is **not** the Poseidon frozen root or an authenticated
on-chain commitment. It binds the candidate's complete original network, genesis,
market/vault/code/layout/function/key, epoch, schedule, source/round, fee cap,
queue/batch roots and member terms. Caller or returned-report mutation cannot
change the retained snapshot.

The module reuses `ExecutionJournal` and its complete-file, fsynced, create-new
publication and same-host acquisition gate. It uses a separate
`random-candidates-v1` namespace, scoped to network magic, genesis root and vault,
with the key fingerprint checked by the existing journal. It cannot read, clear
or resolve financial broadcast records. Its lock coordinates candidate writers,
not transactions or all ordinary activity on the vault.

The first candidate is immutable. The same request is idempotent. A different
set, order nonce, epoch, fee, deadline, source, round, code or key rejects. There
is no unfreeze, delete, reseal, new epoch, accepted-seed or terminal-state API.
Untrusted records cannot claim an `included`, `refunded` or financial terminal
event. A future qualified release needs an explicit reviewed version boundary;
these records must never silently become authenticated market state.

## Observations do not authorize transitions

```text
not-fixed -> fixed-awaiting-qualified-source
                    | unverified evidence / timeout observations
                    +-> fixed-awaiting-qualified-source

executionPlan -> RANDOM_SOURCE_UNAVAILABLE
recoveryPlan  -> blocked, no transaction and no refund authority
```

Evidence parsing checks original source, domain, round, draw and seal schedule.
Only public claim fields and SHA256 digests of decoded proof bytes are saved;
raw certificates, signing witnesses and secret fields are not journaled. Base64
aliases for the same bytes deduplicate. Different proof bytes or claimed seeds
remain unverified observations; they never choose, consume or pin a certified
seed/permutation. Conflicting seed claims are flagged for inspection.

Timeout checkpoints are untrusted observations, not certified current state.
They cannot release funds, cancel members or switch to deterministic execution.
The recovery report lists required authenticated state and actual contract/key/
UPS checks. It contains no payment or refund request. At most 32 distinct total
evidence/timeout observations are retained; exact duplicates remain idempotent.
On capacity exhaustion the original request is retained and new observations
reject. This is local diagnostic backpressure, not a market batch-capacity change.

## Operator interface and interrupted output

```text
node executor/randomCandidate.mjs ACTION DIRECTORY CANDIDATE_JSON FRESH_REPORT [EVIDENCE_JSON_OR_CHECKPOINT]
```

Actions: `freeze`, `inspect`, `observe`, `timeout`, `recovery-plan`. Candidate input
is capped at 16 KiB and evidence JSON at 6,100,000 bytes before decoding. No action
accepts a verifier, resource URL, signing callback or success report.

The CLI reserves the new report before journal work, then durably publishes a
separate immutable `FRESH_REPORT.intent.json` with the requested identity. An
existing report rejects before the first pin. It never replaces an old report.
An interruption can leave an empty reserved result plus the intent; inspect the
retained journal using the original candidate and a new output path. Caught
operation/write failures throw `RANDOM_CANDIDATE_RECONCILE_REQUIRED` in the module
(the CLI prints the message and exits nonzero), distinguish
the requested identity from a validated retained identity when available, and
never automatically pick another set or round. An intent records an attempted
command, not its successful completion or a chain broadcast.

The existing acquisition gate remains fail-closed: a crash inside acquisition
requires operator inspection. Tested automatic recovery covers a dead same-host
writer after atomic record publication while the vault lock is held. No claim
of universal crash recovery, distributed locking or multi-host acceptance is made.

## Trust and acceptance limits

- Operator-owned files, directories and binaries remain trusted local resources.
  An administrator can rewrite files or choose another directory. Local pinning
  cannot prove on-chain pre-draw sealing, force inclusion or prevent selective
  service by an adversarial operator.
- Magic plus checkpoint-1 root separates the declared domains only. A reset or
  fork reusing identical genesis values is not thereby a uniquely authenticated
  chain instance; finality/source key epochs and a reviewed domain certificate
  must supply that boundary. No old request may be replayed on a reset chain.
- The existing conditional Merkle/order/recursive proof components are unchanged.
  This journal verifies none of their bytes and cannot install wallet trust.
- No actual cancellation race, source withholding, market refund, full UPS,
  ordinary claim or live financial recovery is accepted by this test suite.
  Original funds, balances, nonce locks and unknown broadcasts remain untouched.
- AMM/Curve pricing, U124 arithmetic, Book matching and NFT unique-sale semantics
  are unchanged. No throughput, cold/warm proof or financial fee result is measured.

Tests use disposable synthetic local records, two independent same-host operator
processes, a genuinely SIGKILLed writer, and a separate simulated filesystem-write
failure. They are persistence tests, not real market or browser-wallet acceptance.

[Source/finality delivery requirements](PROVIDER_INTERFACE.md) and
[current review/evidence](../../docs/security/VERIFIABLE_RANDOM_ORDERING_20261028.md).
