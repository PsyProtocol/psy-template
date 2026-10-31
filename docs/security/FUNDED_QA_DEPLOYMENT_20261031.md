# Funded QA candidate, initial deployment and Realm metadata stop — 31 October 2026

The explicitly authorized second faucet request and the ordinary Native claim
are already published in [the funding report](FAUCET_FUNDED_CLAIM_20261031.md),
commit [334533a4](https://github.com/PsyProtocol/psy-template/commit/334533a4becb01e754538ca4926749d3212ac2aa).
The funding account is now initialized and holds **998.999998 test PSY**.
The original unknown faucet record remains preserved; the two-request ceiling
is exhausted. This continuation made no faucet request or replacement payment.

One new QA FT is now independently included as **contract 8 at checkpoint
25363**, with initial-layout and checkpoint-membership verification. This is
not an AMM deployment, minted liquidity, real UI fill or browser-wallet approval.
The next financial step stopped because Realm 0 still reports missing contract
height metadata, while Realm 1 reports the expected height. QA B is prepared
but unsent. The AMM, key/vault and real UI writers remain pending.

## Ownership, identities and budget

Root was the sole financial/proof owner. No prior financial/proof task was
running, and no unrelated process was interrupted. The current branch and
frozen mainnet-beta SDK `c92880c8b6e2c8d392f19368bc8801a2584fd427` are unchanged.
All four fresh application snapshots verified the frozen upstream source
inventory before Cargo; builds used `--offline --locked`,
`nightly-2025-09-20`, two Rayon threads and the explicit testnet profile.
No Node/SDK source, dependency pin, old contract or original artifact changed.

The new preparation and deployment subphases were declared before execution.
The latter permits at most two new QA deployments, one send each, zero new
ordinary UPSs and no token issuance. Every dependent operation requires a
verified predecessor. Unknown writes stop with the original identity.

| Parent run accounting | Actual / ceiling |
| --- | --- |
| Ordinary registrations | 1 / 3 total registrations, including the future key/vault |
| New contracts | 1 / 3: QA A is 8; QA B and AMM remain |
| Faucet requests | 2 / 2, exhausted |
| Ordinary/vault UPS sends | 1 / 16, the preceding confirmed Native claim |
| Owned-account network fees | 1.000002 / 20 test PSY |
| Remaining owned-account fee ceiling | 18.999998 test PSY |
| Native escrow/reserve ceiling | 6 test PSY; no market escrow sent |
| QA FT mint ceiling / actual | 100 units per asset / zero |
| Existing pUSDT or QA NFT use | zero |

The deployment audit at checkpoint 25397 still observes user 223232, nonce 1
and Native word 0 balance 998999998000 base units. Thus no owned-account debit
or new UPS is added by this deployment. The remote faucet operator's previously
reported fee is a separate payer. Receipt, balance and nonce evidence are kept;
this is not a claim that every remote service has zero operating cost.

## Exact candidate gates

Fresh QA sources derive from `token/wide/src/main.psy.rs`. The only candidate
changes bind issuer 223232 and distinct fixed `QA-A` / `QA-B` symbols at 18
decimals. Base U124 arithmetic and transfer/claim semantics are unchanged.
These are new QA profiles, not changes to deployed tokens or existing pUSDT.

Both candidates compile with the frozen compiler and height 31. Their canonical
initial layout proofs verify **0 fields / 0 slots to 15 fields / 1174405221
slots**. Both have layout root
`62224d708fde9cd6df9a304c2fc5eab0a376a30c13766a39407fcd8587a56724`.

| Candidate | Code root | Function whitelist root |
| --- | --- | --- |
| QA A | `5627c4d45104b2b5f19f72cbd42c82b818077f06e9018ea0e6115dbbaa129190` | `90e9e91f134ce4e887f8c9d173700c6ecf44cb88e31d4a6f7b9709cbfe916e40` |
| QA B, unsent | `9216010726f06d749156baf8c9d0e75922f19bc5e32431b8eb6b3955bc6e157c` | `ea74ecee9239d8e374ee2798792049088a298a8d781c746f340fe2fd8923f981` |

The existing ordinary UPS implementation now has a reusable proof helper and
an explicit exact-QA initialization test. Starting from empty token state, it
proves metadata, a 100-unit cap and mint for both tokens, followed by exact
Native fee burn: seven calls in one complete ordinary UPS. Both U124 limbs are
nonzero. Reference VM state matches the proved endpoints; the signature,
sig_hash, nonce, network, full proof, fee and public endpoints remain checked.
Wrong issuer/symbol/precision, cap overflow/reset and failure-state changes are
bytecode rejection tests. Mutated nonce/signer/checkpoint/start/end/fee/count
and a corrupt complete proof reject separately.

This proof uses **synthetic checkpoint 100, provisional contract IDs 42/43 and
an ephemeral fixture key**, with issuer number 223232. It validates these exact
candidate bytes, not the live issuer's signature or newly assigned IDs.
A separate process reverified the exact saved request against fixed Endcap
verifier and common data without re-proving. The actual assigned live IDs and
current state still require a fresh ordinary initialization UPS before any send.
No private key or signature witness was persisted in the public evidence.

The unused historical AMM artifact/policy is a synthetic whitelist companion
for the shared test harness. It is neither a new AMM proposal nor a deployment
or wallet trust resource. No new spending-key acceptance follows from it.

## Single exact initial broadcast and independent inclusion

After the gates, QA A's original initial request was compacted by whitespace
removal, preserving all numbers, strings, code, proof and owner fields. Exact
request, compact wire, expected content identity, fresh read set, intent and
one-send lock were persisted before one POST. The wire is 10818059 bytes.
No initial proof was regenerated for submission and no deployment was resent.

- User/deployer: **223232**.
- Content hash: `cd3f556a361b75d4bd58fb385d916fb74818d741c8f44899b75030ddfefc084a`.
- Assigned contract: **8**, included at **25363**.
- Independent absence/presence interval: **25362 → 25363**.
- Checkpoint membership anchor: **25393**, from the configured coordinator RPC.
- Code, function whitelist, layout, counts, owner and request identity match.
- Canonical initial layout proof independently reverified from the saved request.

The checkpoint verifier checks all contract/checkpoint Merkle paths, exact
old-absence/new-presence and original content identity. The indexer receipt is
also retained. The RPC anchor is not independently authenticated consensus
finality or a runtime-image attestation. These results do not establish a
qualified random source or seal-before-seed-release timing.

## Actual application corrections and retained failures

1. `prepare_initial_request` treated a relative directory's empty parent as a
   pathname. The first preparation stopped before proving or sending. It now
   uses `.` consistently with the ordinary wallet durability path. A fresh
   absolute directory completed the original layout proof. The rebuilt corrected
   CLI passes relative-directory synchronization, then rejects owner zero before
   proving or RPC. Original failed output is retained.
2. An acceptance script initially applied the integer-only wire parser to a
   local report containing a floating elapsed time. It stopped before RPC/intent.
   The corrected collector reads only that typed local report with ordinary JSON;
   quantities stay strings and bounded IDs are checked. Protocol requests,
   proofs, state and amounts continue to use lossless parsing. No send was retried.
3. A read-only collector called a nonexistent `publicState.userLeaf` convenience
   method. Source inspection replaced it with the actual public `rpc` interface,
   explicit realm and fixed checkpoint. The old observation remains; this did
   not resend the successful deployment.
4. Actual new-contract state reads intermittently return RPC `-32001` with the
   exact missing-height message. The application now classifies only this exact
   error for a matching new contract, positive fixed checkpoint and one of three
   state read methods. At most three identical reads are attempted. Results are
   never invented, no checkpoint/parameters are changed, and exhaustion remains
   `ReadUnavailable`. Other logical errors, Native identity failures and writes
   are not made retryable. Observations retain failed attempts.

The fourth correction is bounded availability handling, not a repair of the
Realm database. The live collector exhausted it and correctly stayed closed.
No financial re-proving or alternative transaction followed.

## Concrete remaining runtime dependency

At the same checkpoint **25379**, the same Realm 0 state request produced both
a missing-height error and a successful zero leaf in saved observations.
A single successful RPC observation is therefore insufficient activation evidence.
At checkpoint **25397**, `psy_get_contract_tree_state_heights` for `[8]` returned:

| View | First read | Second read |
| --- | --- | --- |
| Realm 0 | `[0]` | `[0]` |
| Realm 1 | `[31]` | `[31]` |

Realm 0's published `next_contract_id` is already **9**. The coordinator's
included, independently verified contract leaf says height **31**. Empty token
state has **not** been accepted by interpreting missing metadata as zero.
QA B submission and all market setup remain blocked.

Frozen source explains the boundary: the Realm edge rejects missing DB height;
its synchronization path can return when local/remote allocation cursors match.
The inspected fetch/store path validates response length but not positive heights.
A stored zero followed by cursor advance is a plausible unrepaired state under
that source. This is an inference; running service/DB logs are needed to assign
the historical cause. No Node change, DB write, cache injection or opposite-Realm
routing was attempted.

[The exact operations delivery and acceptance checklist](UPSTREAM_REALM_METADATA_HANDOFF_20261031.json)
contains the new ID, roots, checkpoint, methods and frozen source locations.
Restore the reviewed metadata synchronization path, then demonstrate consistent
height 31 and valid state proofs for this contract across Realm 0 readers.
An application-provided height cannot replace that service-side requirement.

## Measurements and reproduction

| New process/task | Whole launcher through exit | Sampled process-family RSS peak |
| --- | ---: | ---: |
| Initial QA A layout preparation | 140.800 s | 4153952 KiB |
| Initial QA B layout preparation | 137.696 s | 4592000 KiB |
| Exact QA setup full UPS | 167.608 s | 2845344 KiB |
| Separate saved full-proof verification | 4.137 s | 434064 KiB |
| Saved QA A layout/checkpoint verification | 48.624 s | 2936928 KiB |

The full-UPS internal interval is 165.866 s; its synthetic burn is 1.000009 PSY,
not a network charge. RSS is sampled at one second over each process family;
shared pages may be counted twice and between-sample peaks missed. It is not
physical peak memory. Some builds overlapped preparation, so this is not a
controlled before/after or cold/warm comparison. No confirmation throughput,
p95, TPS, general speedup or memory improvement is claimed.

Reproduce the candidate compilation and full proof using the archived plan,
sources, compiler/binary hashes and application manifests, the frozen SDK
materializer, and the existing `compile_composition_token` utility. For the test,
build `batch_lifecycle` with `BATCH_FIXTURE_ISSUER=223232`,
`BATCH_FIXTURE_SYMBOL_A=1363225921`, `BATCH_FIXTURE_SYMBOL_B=1363225922`;
set `BATCH_BUILD` to the archived fixture tree, `BATCH_DISTINCT_TOKEN_B=1`,
`BATCH_CFC_METADATA=1`, and a **fresh** `QA_TOKEN_SETUP_OUT`. Select
`full_ups::ordinary_wallet::exact_qa_token_initialization_complete_ups` with
`--ignored --exact --nocapture --test-threads=1`. This is offline only.
Do not replay consumed deployment or faucet scripts during reproduction.

Focused application regression: **39 passed, one optional captured-live replay
skipped**, including exact metadata retries/exhaustion and fixed-checkpoint,
lossless, read-only integration. The complete UPS and independent verification
are separate evidence, not inferred from the test count.

[Public artifact inventory](../../executor/verification/2026-10-31-funded-qa-deployment-v1/README.md).
Original local records remain under `amm-funded-deployment-20261031-v1` in the
existing evidence root. The public bundle excludes wallets/secrets, signature
witnesses, private configuration and executables.

## Continuation gates

After Realm metadata recovery: reconcile QA A by its original identity; fresh
preflight; submit the already prepared QA B at most once; verify actual assigned
identity; compile/prove/deploy the new AMM; register its new key/vault; generate
instance-specific reviewed wallet resources. Enumerate setup/trade/claim steps
against the remaining parent budget before spending. Preserve normal approval,
full-call/session binding, exact broadcast and recovery gates. Browser approval
still needs the dedicated wallet to be unlocked by its user; no password,
private key, reset or history deletion is requested by this report.

AMM fills, ordinary QA claims, real extension approval, the remaining markets,
double-pool live acceptance and qualified randomness are **not closed** by this
milestone. Shared vault, deterministic ordering and market semantics remain.
