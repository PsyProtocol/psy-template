# Real constituent acceptance and actual component source closure

Date: 2026-10-23. Current branch and SDK unchanged; no Node changes or old
contract upgrades. Original case files are retained under
`psy-market-recovery-20261023/composition-live-v2` on the same machine.
This archive preserves 173 public files and exact original/gzip SHA256. No
wallet files or executable binaries are included.

## Actual testnet results

Owned ordinary wallets: owner 1717440 (realm 1), recipient 406720 (realm 0).
QA FT **2483**, 18 decimals, canonical issuer 1717440; 1,000 minted once and
administration renounced. No existing pUSDT was used. Fees are **test PSY**.

Five real ordinary UPSs were included and independently verified offline against
the frozen end-cap key/common data and metadata/fee endpoints:

| UPS | Process through ack (s) | Ack to observed inclusion (s) | Fee (test PSY) |
| --- | ---: | ---: | ---: |
| Owned native send 20 PSY, recovered before broadcast | unrecorded | unrecorded | 1.000002 |
| Recipient native claim | 109.269 | 97.440 | 1.000002 |
| QA-A metadata/mint/renounce | 135.935 | 218.011 | 1.000004 |
| QA-A double-Felt send | 116.346 | 63.224 | 1.000003 |
| Recipient QA-A claim | 126.594 | 184.367 | 1.000004 |

FT transfer and claim: **4.611686018427387921 QA FT**, limbs `[17, 1]`.
Final owner balance 995.388313981572612079; recipient balance
4.611686018427387921. Sum remains **1,000 QA FT**; sent and claimed cursors match.
Total fees **5.000015 test PSY**. Combined spendable native balance:
998.999998 before → 993.999983 after. The 20 PSY transfer moves value between
the two owned wallets and is not additional burn. Exact receipts, historical
leaf matching, source/end endpoints, request/proof hashes and current state
roots are retained. A mutated fee in the actual FT-claim request is rejected.

These are constituent ordinary-wallet operations across realms, **not a market
fill, live funded-controller acceptance or completed two-vault composition**.
They are separate UPSs, with explicit Outbox/claim, not cross-realm atomicity.

## Timing boundaries

Process wall includes cold client startup, circuit/proof work, verification,
RPC submission and acknowledgement. Confirmation columns measure local receipt
observation after acknowledgement, not consensus latency or finality. They can
include indexer lag, polling and cross-realm common-snapshot waiting. No precise
send timing was recorded for the interrupted-resumption helper; no value was
reconstructed from file timestamps. Phase RSS, warm-state measurements and a
matched before/after proof comparison remain unmeasured. Other offline work
ran concurrently. No TPS or acceleration conclusion follows from these rows.

## Actual four-component closure, offline only

`composition-real-component-closure-v1/SUMMARY.json` records real compiler,
lossless full IR/ABI comparison, CFC/layout/function identity derivation and
base SD-key policy/key reconstruction. All four components passed. The formal
verification stage took 116,989 ms, excluding fixture construction; this is
startup validation overhead, not transaction proving time. Synthetic market,
vault and QA-B IDs were used. No RPC, financial signature or UPS was generated
by this test. Matching market builds share one rebuild within startup; states,
witnesses and ordinary requests are never reused by this cache.

The full SDK source check reverified all **1,466** pinned files. SDK manifest:
`0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`.
This is a frozen local snapshot, not an upstream release/runtime attestation.

## Unknown initial deployment and recovery

Successor QA-B expected content hash:
`4ec1d50fecb7aee05ae761de4a260c96fa1d58386f3dade572898abd59ae7ac2`.
One exact request/wire and durable intent are preserved. Latest archived
read-only observation: HTTP 404 at common checkpoint **370672**, not rejection,
cancellation or permission to resend. No fresh market/controller has been funded.
The previous case remains locally quarantined; no unknown request is replaced.
The independent faucet TLS failure is retained, with no repeat faucet request.

Ordinary recovery was different: original process stopped with an empty output
before completed request/intent; reviewed binary write-before-send behavior,
nonce/balance/cursors and exact old input/window were checked before one explicit
continuation. Public recovery source and records distinguish this from an
unknown deployment or payment result. A first local assertion rejected differing
JSON object prototypes before any resumed request was generated; its log is
retained alongside the corrected exact-integer comparison and actual inclusion.

## Final source/check addendum

Original executed sources and v1 reports remain in this archive. The separate
`2026-10-23-composition-final-checks-v1` archive adds current source, **61** passing
regressions, all-six-field deployment binding checks and a new read-only report.
It also fixes QA initialization recovery so already-issued QA-A skips minting
but still claims QA-B; earlier QA-A test allocation is explicitly conserved.
It does not modify original transactions or claim another network execution.

Verify archive integrity (not proof/runtime attestation):

    python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-23-composition-constituent-live-v1

Pending: exact initial-deploy outcome/status capability, two new pools/controller
and dedicated-key live workflow, market settlement/refund/competition recovery,
remaining market composition adapters, matched cold/warm end-to-end measurements,
and runtime/upgrade, certified randomness and cross-host coordination evidence.
