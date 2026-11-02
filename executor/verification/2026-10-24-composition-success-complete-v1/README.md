# Completed real two-AMM success and ordinary wallet claim

5,203 public files, 35,350,371 compressed bytes. All originals were compared;
raw/compressed SHA256 are in manifest.json. Wallet files and sealed executables
are excluded. Earlier immutable LP/runtime files overlap prior archives; their
costs must not all be attributed to this route.

Actual isolated path: QA-A 2483 → AMM 2485 / vault 1012928 → QA-B 2484 →
AMM 2486 / vault 718016 → QA-A 2483. Controller 2491 / account 1445056,
ordinary owner 1717440. QA FTs have 18 decimals; native fees are test PSY with 9.
No existing pUSDT. The two markets share their respective existing test liquidity
vaults; the composition account supplies actual user funds, no prefunded trading
liquidity. The declared refundable one-unit other-FT initialization remains an
explicit profile requirement, not A-only onboarding.

- Input: 4.611686018427387921 QA-A.
- First actual output/claim: 3.738416797288011079 QA-B (settle 371303,
  controller claim 371335).
- Second actual output: 3.141711878267176122 QA-A (settle 371489), above
  signed minimum 3.110294759484504360. Controller claims at 371504.
- Controller return at 371519; ordinary signature wallet (CLI, not browser UI)
  claims at 371528. Its actual FT balance increase is the full final output;
  one atomic QA-B initialization refund is also claimed.
- Controller phase 99 and A/B/native spendable balances all zero at 371532.
- Native controller budget 20.002000000 test PSY equals actual controller
  receipt burn 8.000070000 + owner refund 10.001730000 + net market escrows
  2.000200000. Ordinary owner and external sponsorship burn are separate.
- Ordinary final claim burns 1.000006000 test PSY; historical owner native
  balance changes from 842.997532000 to 851.999256000, exactly refund minus fee.

The actual ordinary claim independently verifies against the pinned end-cap
key/common data; mutating its real fee rejects. Historical start/end leaf hashes,
request SHA256, owner key/nonce, asset balances, full claim cursors and native
fees are independently correlated in COMPOSITION-SUCCESS-OWNER-CLAIM-AUDIT-v1.
This is one actual claim proof check; independent re-verification of ALL cohort
UPSs is a later final gate, not inferred from this selected proof. Slot reads
are explicit historical public observations, not separate Merkle proofs for every
RPC leaf or runtime attestation.

The fixed-checkpoint eight-account audit conserves 1,000 QA-A and QA-B each,
including all directed internal pending Outboxes. New unique actual receipt burn
since the earlier constituent baseline is 61.000505000 test PSY (includes LP,
bootstrap and both-market work, not merely the controller or owner fee cap).
Exact original proofs/requests, fees, responses, indexed/common receipts,
fund/open/consent/seal/commit/settle results, source/key closures and phase records
are retained. Injected parent-ack loss, local contender and adapter/prover restart
have their original stated scope. The running success used the prior loaded
harness; its INPUTS hashes can be reconstructed from commit 173efa3.

This is a cross-UPS A→B→A workflow, not three distinct assets or cross-vault
atomicity. Deterministic finite-queue ordering is not global fairness. No matched
full live control, chain TPS, profitable fee model or production conclusion.
The separate cancelled-second-hop recovery, planned warm/physical-worker test,
final combined independent-proof audit and performance report are still pending.
No Node/SDK/old-contract updates.
