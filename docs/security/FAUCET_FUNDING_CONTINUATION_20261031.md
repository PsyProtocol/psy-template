# Original faucet reconciliation and current AMM funding

## Executed result

At checkpoint **22654**, current recipient **223232** has zero observed native
balance and zero pending Native transfer cursors across all 100 operators in
the original/current advertised faucet inventory. All 200 cursor reads
succeeded. Public services return no recipient public claims and no asset
activity; the sole indexed transaction is the original registration at 1655.
These are bounded RPC/index observations, not global incoming completeness,
canonical finality or a terminal service-request disposition.

The original request remains unresolved and its send lock is preserved:

```text
Request SHA256: 85332da2e78775c0653737658234df46df80a5e326ee3440afb81879ba2d286d
Recipient:      223232
Public key:     97a9f5724e2f2ea4a7a59c884b9e6f79c7978016629519bae26e96e8b681d834
Chain at one:   919896e18690246e20307f68cf2e5725aee496755366bbafff88eccaea975f12
```

No new faucet request, recipient, signature, business proof, payment, deployment,
key registration, real fill or ordinary claim was created. Fees and pUSDT use
are zero. The prior independent-funding request for a 20 test PSY fee ceiling
has not been satisfied or treated as approved/completed by elapsed time.
Deployment, real UI settlement and ordinary-wallet arrival remain open.

Branch: `markets-batch-capacity-recovery-20261020`; starting commit:
`139e356ffe2177f829c401cf9e5b589cd9cda7e5`. SDK remains mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`. Node, SDK, dependency pins,
old contracts, wallet history and original evidence were not changed.

## Fresh checks and reused evidence

- Verified the existing UI/read-only gateway processes; no business prover or
  financial worker was running and none was started. UI processes were left
  running. No heartbeat or chain-service lifecycle operation was started.
- Captured the two realm heads, three checkpoint-one views, Native identity,
  code, membership/checkpoint context, user leaf and public client registry.
  The checkpoint-one root remains the reviewed reset instance above.
- Compared all 2,756 frozen source file hashes. Native code, full Native leaf
  and the decoded public runtime verifier registry exactly equal the prior
  accepted captures. Their result digests are in `UNCHANGED-RESOURCES.json`.
  The [prior full Native and eleven ordinary-resource checks](CURRENT_CHAIN_USER_UPS_PREFLIGHT_20261030.md)
  were reused; they were not rerun or represented as new business proofs.
- Reconciled the exact original public request, intent and send-lock hashes
  before/after the read-only inventory. Current public-key index and checkpoint
  registration-leaf observations match the original recipient and URT index
  728. No new registration Merkle proof or running-image attestation is claimed.
  The uninitialized stored user leaf does not mean unregistered.
- Read faucet configuration, two registration views and all 200 exact
  sent/claimed slots at 22654: **203 requests**, one attempt each, concurrency
  four for cursor reads. All historical/current operator IDs match exactly.
  No failed read was substituted with zero.
- Queried three public service index endpoints for independent sender/receipt
  hints. All returned HTTP 200, no claimable transfer was discovered, and the
  original request still has no transaction identity to reconcile exactly.

The whole bounded run made **222 read requests**, within the declared 240-read
ceiling. Proof generation and all financial operations were zero. No market
performance, confirmation latency or production-readiness result follows.

## Application implementation

[`reconcileFaucetFunding.mjs`](../../executor/acceptance/reconcileFaucetFunding.mjs)
replaces the previous one-off scan with a repository-owned, repeatable,
read-only acquisition path. It:

1. Requires fresh output paths and the exact original request hash/recipient,
   retained lock, reviewed chain and complete Native code/layout/function leaf.
2. Uses only four explicitly permitted public read methods and fixed staging
   endpoints, with deadlines, response-byte limits and no redirects/retries.
3. Pins every cursor to one checkpoint and verifies the complete unchanged
   operator inventory. Exact integer and canonical felt checks reject
   underflow, missing fields, duplicated senders and lossy amounts.
4. Retains exact requests/responses and failures. A failed acquisition does not
   emit a complete zero-funding result or automatically unlock an account.
5. Separates observed balance from pending Outbox. Even a positive result
   grants neither broadcast authority nor permission to retry the faucet.
6. Rechecks original file hashes after acquisition. Its output is explicitly
   observational; it does not replace funding membership proofs, complete
   ordinary UPS validation or fresh funded execution preflight.

Nine new reconciliation tests and the existing capture/readiness regression
pass together: **23 tests**, not 23 transfers. Tests cover a full synthetic
acquisition, changed request/root/layout/operator set, zero and pending funds,
U64/felt bounds, underflow, duplicate senders, failed cursor reads and output
reuse. One earlier assertion wrongly equated cursor slots with unique leaf RPC
arguments: adjacent sender IDs may occupy different limbs of the same leaf.
The test was corrected without changing live acquisition; the prior failure
and final log are retained. The live inventory was not repeated.

Reproduction uses the existing Node runtime, frozen dependencies and a **new**
output directory. Run the Native collector once, then:

```sh
node executor/acceptance/reconcileFaucetFunding.mjs \
  FRESH_OUTPUT ORIGINAL_PUBLIC_DIRECTORY FRESH_CAPTURE_DIRECTORY
node --test executor/acceptance/reconcileFaucetFunding.test.mjs \
  executor/acceptance/captureNativeBinding.test.mjs executor/gateway/readiness.test.mjs
```

`ORIGINAL_PUBLIC_DIRECTORY` means the three original public request/intent/lock
files and historical public faucet config, not a wallet secret/recovery folder.
No CLI argument authorizes a write request. The tool rejects other original
recipients rather than silently creating a replacement grant.

## Faucet service limitation and concrete delivery

The frozen source at
`psy-node/client_prover/psy_prover/src/local/native/faucet.rs` defines only
`psy_get_psy_faucet_config` and the **mutating** `psy_claim_faucet` RPC. There
is no read-only original-request status method in that interface. The enabled
configuration advertises contract 5, method `faucet`, a 1,000 test PSY grant,
a 120-checkpoint window and 100 operators. Enabled configuration is not proof
that the grant path currently succeeds.

The preserved error is `faucet operator submit failed` during
`prove_ups_start`, with no returned transaction identity. The inspected source
returns before contract proving/sign-and-submit if `start_session` fails.
This is a conditional source explanation, **not** attestation that the running
service used that exact implementation or finally disposed of all work.
`claim_faucet` is not a safe status query: it can start another claim, chooses
operators, and keys successful in-memory records by recipient/window. A new
window, HTTP 200, empty index or zero cursors cannot establish safe replay.

The faucet/runtime operator can unblock this task with either delivery below;
neither requires changing Node in this application task:

| Delivery | Exact acceptance requirement |
| --- | --- |
| Close the original request | Correlate the SHA256, recipient/key, chain instance and accepted request time with a durable service request/job identity; report terminal no-broadcast/no-delayed-task disposition, or the exact sender, end-user leaf/content hash and original receipt if broadcast occurred. Identify running source/build/config correspondence. Omit keys and private witness wire values. A generic error or no-record lookup is insufficient. |
| Independent budgeted funding | Transfer test PSY to the already-verified current recipient above, with sender and exact receipt identity. The requested **fee ceiling is 20 test PSY**; a later funded plan must separately account for any Native escrow/principal and fit available funds before sending. Preserve the old faucet lock and reconcile any later original grant separately. |
| Durable read-only status capability (service enhancement) | Expose original immutable request identity, chain/recipient/window, accepted/processing/broadcast/terminal status, pending-work disposition and exact broadcast identity if any. Retain across restart, authenticate service provenance, and make a status lookup incapable of scheduling a new grant. This is a required upstream capability, not an API implemented or assumed here. |

No operator message was sent and no wallet password/key was requested. A new
grant, alternate recipient, same-nonce transaction or unchecked key cannot
substitute for those deliveries. Funding is the current financial blocker;
the separate CST/finality/random-source delivery remains open and is not
replaced by the ordinary UPS registry comparison.

## Funded continuation gate

After an actual verified transfer, declare a new bounded funded phase and
freshly check the current chain, recipient, sender, receipt and Native pending
cursor membership. A pending transfer must be claimed through a verified
ordinary UPS before spending. Recheck balance, nonce, fees and complete
code/layout/key/call/session/sig_hash/state endpoints for each exact send.

Then deploy the necessary **new** QA assets, AMM, vault/key and install reviewed
instance-specific wallet verification resources. Keep Curve 11 and historical
market IDs isolated. Complete actual extension approval, complete proof,
one-shot broadcast, original-identity reconciliation, confirmed AMM settlement
and ordinary-wallet claim. Preserve requests, public proof projections,
receipts, fees and conservation evidence. Do not reset wallet history or
present index hints, ACKs or generated proofs as final arrival.

[Public evidence inventory](../../executor/verification/2026-10-31-faucet-funding-v1/README.md)
retains the complete bounded read set, accounting, unchanged-resource digests,
safe original request/error projection and regression evidence. No secret
wallet file, mnemonic, raw private proving diagnostic or executable is included.
