# Product recovery integration — 30 October 2026

## Outcome and scope

This milestone makes original wallet requests discoverable from the Orders page
after leaving a plan, reloading or restarting the page. It adds no market,
settlement mechanism, proof authority or financial permission. It is not final
product, payment, randomness or production acceptance.

Source baseline: `psy-template` commit
`4b3dfbc45173e67778234219840cfafe1cc01955`, branch
`markets-batch-capacity-recovery-20261020`. The separate wallet security worktree
was observed at `5c15a9d`, branch `wallet-security-20261016`; it was not modified.
The frozen SDK remains mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`. No Node, SDK, dependency version,
old contract, wallet history or original evidence was changed.

The root agent owned execution. No pre-existing market/proof acceptance process
was identified or interrupted. The run declared zero financial instances, zero
PSY budget, zero new proof jobs, zero deployment and zero faucet submissions.
Only owned UI and read-only gateway processes were started. The original unknown
faucet request remains untouched. The wallet was not unlocked or reset.

## Implemented

- `market-client/walletHistory.mjs` consumes only the extension's existing public
  preparation summaries. It projects approved fields, validates bounded history
  and rejects duplicate identities, malformed phases and receipt metadata.
  It exposes no prepare, sign, send or broadcast operation.
- The Orders page has an independent Transactions & recovery section. It reads
  wallet records scoped by the extension to account, origin and configured chain.
  No page-local demo record is treated as wallet history. No proof, secret
  witness or wallet journal is copied into local demo storage.
- Recovery rereads the original record before acting. Record/request/capsule/
  endpoint identity replacement rejects. A preparation that has since entered
  broadcast cannot be cancelled through a stale button. Concurrent clicks are
  single-flight; authoritative cross-context coordination remains in the wallet.
- A failed refresh/reconciliation retains the previous page observation and
  disables further recovery actions until refreshed. Unknown broadcasts retain
  the wallet's reservation and can only request original-identity reconciliation.
  An explicitly cancelled preparation is not described as a refund or market
  cancellation. Receipt inclusion is not described as final asset arrival.
- Wallet execution views remount on account, record or registry identity changes.
  Late asynchronous results cannot populate the next account/plan's view.
  Plan views link to the durable recovery entry point.
- `npm run dev:markets` starts the existing UI and read-only gateway together,
  preserving `npm run dev` as UI-only. Both loopback ports are checked before
  either child starts. An occupied port refuses startup without replacing its
  owner. Unsigned plan files use a durable, configuration-scoped directory,
  outside the Vite source tree. No Executor/prover/financial service is started.
- Product copy distinguishes demo forms, RPC observations, wallet records and
  real settlement acceptance. A native/root mismatch does not instruct the user
  to switch the frozen SDK without compatibility review.

## Fresh observed chain mismatch

The local read-only gateway returned HTTP 200 at observed checkpoint **21744**:

| Identity | Reviewed candidate | Current RPC observation |
| --- | --- | --- |
| Checkpoint-one root | `24fe11facdc008ad5a6e6408da654217380b798af1ddb7df59845dfecd395942` | `919896e18690246e20307f68cf2e5725aee496755366bbafff88eccaea975f12` |
| Native code root | `f54490d8ed6ccd5bb06f3c42193a5b11ce7bd252c9eae2c3697f9f3e483e26ee` | `5df4b10ccf59e25f3c44b4164edb9597455da33b925c3981881c280f2636ebd1` |
| Native function root | `9c64e00be65354f10b2453ceac2d94a790209ae7f8caefe86563a3a199185e8b` | `1ad1a069434cf058a419f4d874615c6fc47170471069f5d232874099ef13c5b1` |

The numeric native schema is parseable (`nativeSchemaCompatible: true`) but the
reviewed native roots do not match. The diagnostic retains its legacy
`protocol-incompatible` state name; that name is **not proof that a different SDK
is required**. No market dependency was probed (`checkedDependencies: 0`). Both
financial flags remain false. A later browser refresh observed checkpoint 21755
and displayed the same rejection. These are RPC observations, not authenticated
checkpoint or finality evidence.

## Verification and limitations

| Check | Result | Boundary |
| --- | --- | --- |
| Public client/gateway regression | 90 passed | Fixtures and transport/application checks; not 90 payments or UPS proofs |
| UI regression | 52 passed | Includes launcher port ownership; not extension payment acceptance |
| Production frontend build | Passed | Compilation and bundling only |
| Real browser desktop | 1480 × 771, passed | Orders identity, nonblank content, no framework overlay or horizontal overflow |
| Real browser mobile | 390 × 844, passed | Orderbook → Orders navigation and recovery layout |
| Instrumented navigation runtime | No errors, unhandled rejections or console errors | Bounded Orderbook → Orders flow only; instrumentation removed afterwards |
| Synthetic rendered component race | Passed | Late account/record results rejected; original retained on lost response; no prepare/broadcast/cancel call |
| Actual duplicate workspace launch | Rejected, exit 1 | Both existing listener PIDs unchanged |
| Current-chain market settlement/claim | Not performed | Zero new financial requests, fees, fills or ordinary claims |
| Actual unlocked extension recovery/payment | Not verified this run | No user unlock, approval or payment was requested |

The component test mounts actual React components in an isolated same-origin
frame with a synthetic provider. It never replaces or uses the real extension
provider. It supports UI race/recovery claims only. The browser's event summary
and instrumented navigation are not a complete browser console-history audit or
payment attestation. An independent security audit and full current-chain product
acceptance are not claimed.

All earlier samples are retained. The initial browser connection failed because
no UI service was listening. One initial test command used the wrong working
directory and ran no tests. Browser wrapper misuse and an initial Vite CJS test
harness import failure are recorded in `early-failures.json`; the immutable v1
failed harness and corrected v2 results are both retained. They are not silently
removed from the evidence. No complete UPS or performance experiment was rerun.

The browser tool reported an available update. It was not upgraded. No new
browser, frontend or SDK dependency was installed.

## Capability boundary and remaining work

| Surface | Available now | Still gated |
| --- | --- | --- |
| Four market pages | English preview forms and separate reviewed readers/plans | Fresh instance identity, funding, wallet approval and actual settlement acceptance |
| Wallet recovery center | Existing public API client, original-only reconciliation/cancellation UI | Real unlocked-extension demonstration on the accepted chain |
| Wallet full verification/exact send | Existing wallet-owned implementation retained | Matching reviewed instance resources and current-chain acceptance |
| Shared-vault batch execution | Existing deterministic and candidate producer-seeded implementations retained | Current-chain full UPS, fills, refunds and ordinary claims |
| Qualified random order | Existing conditional protocol/candidate evidence retained | Reviewed finality, genuine checkpoint resources and seal-before-seed-release authentication |
| Two-pool composition | Existing staged workflow retained | New-instance success, exit and intermediate-asset recovery acceptance |

The executable next steps remain ordered:

1. Review the actual running chain/native build and public checkpoint verifier
   resources against the frozen SDK. Obtain the exact kind-32 verifier/common
   data and record correspondence required by the preserved 18504/18505 failure
   investigation; do not replace it with the already acquired client Endcap key.
2. Bind a **new** reviewed registry, assets, contracts, vaults, SD-keys and wallet
   resources to the accepted chain, after bytecode/layout and complete UPS gates.
   Do not merely replace roots in the old registry or retry old-chain requests.
3. Reconcile the original funding identity, obtain budgeted current-instance test
   PSY, and demonstrate one ordinary-wallet AMM settlement and claim before the
   other markets and current-chain two-pool workflow.
4. Close random/finality and release-timing dependencies using the exact upstream
   [public delivery checklist](UPSTREAM_CHECKPOINT_RANDOMNESS_HANDOFF_20261030.json).
   Deterministic mode remains the safe default; no seed is invented locally.

No new speedup, TPS, cross-machine coordination, global fairness or production
claim is supported by this milestone. Shared-vault ordering and staged
cross-UPS asset/claim dependencies are unchanged.

## Evidence and reproduction

[Public immutable evidence](../../dapp/verification/2026-10-30-product-recovery-v1/README.md)
includes original and final test logs, build logs, duplicate-start owner checks,
raw read-only readiness, browser summaries/screenshots, both component harness
versions, failures and a SHA256/size inventory. It contains no keys, mnemonic,
signing witness, live transaction request or wallet recovery file.

```sh
cd dapp
npm run test:markets
npm run test:gateway
npm run build
npm run dev:markets
```

The existing locked Node/frontend environment is required. Do not install a new
SDK or delete wallet history to reproduce a passing check. Browser harness files
record the historical dedicated task-space ID and local artifact path; do not
replay them against a user-owned or unrelated browser space.
