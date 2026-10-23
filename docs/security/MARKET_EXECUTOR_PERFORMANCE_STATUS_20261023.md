# Four-market Executor performance — evidence and remaining gates

Branch remains `markets-batch-capacity-recovery-20261020`. SDK manifest remains
`0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`.
No Psy Node change, old contract update, random ordering, market pricing/matching
change or replacement of original evidence. Composition remains a separate module.

| Requested stage | Current code/evidence | Remaining acceptance |
| --- | --- | --- |
| End-to-end baseline | Preserved historical complete proof and network lifecycle reports; new formal initialization/read/phase measurements; identity-only process timing/RSS experiment | Matched optimized/control live runs with independent cold/warm, confirmation, ordinary claim, child peak memory and full lifecycle costs |
| Resident resources | Existing pinned proof-only process retains circuits and clears user session per job; new bounded public identity metadata reuse; shutdown confirms old process exit | New full financial network run through cache-hit/restart paths; no measured settlement acceleration yet |
| Duplicate proof control | Existing journal stores prepared request/proof digests, rechecks state/nonce/window/roots before exact saved-proof send; unknown broadcasts reconcile instead of replacing | New isolated real lost-receipt/disconnect/restart matrix, with actual identity and fee evidence |
| Batch strategy | Existing reviewed four-member capacity, explicit single-entry fallback before sealing; accepted set processed in full; deterministic order | Cost-informed policy needs measured admissible choices and renewed complete UPS/network acceptance; no capacity increase this round |
| Independent scheduling | Existing bounded service concurrency and per-vault durable coordination; new confirmed process teardown prevents replacing a still-live prover | Multi-host coordination and shared payment-account isolation evidence; local locks are not that proof |
| Safety/economics regressions | 174 formal JS cases passed, two fixture-dependent deployment gates skipped; six restored controller end-cap proofs independently reverified | Corrected NFT replacement and all-market maximum/thin failure/competition network matrix, ordinary FT/NFT claims and paired fee/principal conservation |

## This round's measured change

Four deterministic identity lookups start four child processes before caching
and one after. Uncached walls were 2033/1109/1109/1120 ms; cached miss 1105 ms,
then 0.07/0.05/0.04 ms. This is public identity construction only, not proof,
VM, confirmation throughput or a production claim. Fixed40/compact full UPS
comparison is an earlier experiment and is not credited to this new cache.
Raw logs, resource counters, source hashes and limitations are retained under
`executor/verification/2026-10-23-identity-reuse-v1`.

## Recovery facts

The reboot erased original `/tmp` ordinary QA wallet keys and unarchived thin
acceptance requests/journals; the owner confirmed no backup. Public archives
were restored by hash, not rewritten. The current-state snapshot at common
checkpoint 370200 finds Book/NFT queues still open with two members. It does
not certify their historical receipts or reconstruct absent proof identities.
The three-market thin run remains incomplete. New QA actors and funding use
separate persistent storage and never stand in for the lost ordinary wallets.

The new faucet grant is test PSY, distinct from QA FT/NFT and existing pUSDT.
Grant acknowledgement is not a claim. The first native claim failed during
`start-ordinary-session` with a pinned diagnostic `RPC_CONNECTION`, no request,
proof or broadcast. A reviewed, single repair may reuse the exact original
input/window only after checking fresh identity/nonce/credit and the original
failure. An unknown or possibly broadcast attempt is ineligible. Failed calls,
tool invocations and missing samples stay visible; none count as successful
claims or zero-cost samples.

### Completed new ordinary native claim (supporting baseline only)

New owner 1717440 claimed the exact 1,000 test PSY faucet credit at checkpoint
370267. Included fee was 1.000002 PSY; balance became 998.999998 PSY and the
claim cursor consumed exactly the original credit. The reviewed repair used
the original input and validity window after confirming nonce 0, unchanged
balance/credit, native dependencies and the original failure-only directory.
No first-attempt request, signature or broadcast existed. An initial repair
assertion failed on null-prototype parser objects before financial execution;
the expected object is now parsed canonically with the same lossless parser.
All failures remain archived. No faucet replay or extra payment was made.

| Measurement | Observation and scope |
| --- | --- |
| Ordinary client process start → HTTP acknowledgement | 161.433 s; includes cold resources, fresh state, full proof/signature/verification and submission; internal phases are not separately instrumented |
| Acknowledgement → exact indexed/common inclusion observation | 23.213 s; includes polling and common-state visibility, not server finality latency |
| Process peak RSS | 6,144,622,592 bytes (5.723 GiB), Darwin `/usr/bin/time -l`; not per-phase or host-wide peak; different from the reported memory-footprint counter |
| Fee / credited balance | 1.000002 / 998.999998 test PSY; issuer faucet fees excluded |
| Full proof | Serialized request independently verified against the frozen end-cap key/common data and public metadata/endpoints/fees |

Evidence `2026-10-23-performance-native-bootstrap-v1` contains 52 hash-checked
public artifacts, including failed attempts, precise request/wire/receipt,
account identities, end-state/fee evidence and the independent proof check.
Wallet secrets and binaries are excluded and remain in persistent local storage.
This is one **native PSY ordinary claim**, not FT/NFT or four-market acceptance,
and has no matched old/new or warm-state sample. The standalone wallet creation
walls (48.983/49.926 s) include startup/reads/key derivation, not isolated circuit
construction. No throughput improvement is inferred from these observations.

## Boundaries unchanged

An RPC snapshot is not an authenticated state proof or runtime binary identity.
SDK/runtime provenance and upgrade authorization remain separate release gates.
Authenticated future randomness and pre-queue inclusion/service availability
remain external requirements; deterministic finite-queue processing does not
prove global anti-censorship. Actual multi-host duplicate-prover coordination
needs an agreed durable coordination service/protocol and failure evidence.
No end-to-end speedup, chain TPS or production-grade conclusion is established
by passing the JS tests, identity-only timings or restored proof verification.
