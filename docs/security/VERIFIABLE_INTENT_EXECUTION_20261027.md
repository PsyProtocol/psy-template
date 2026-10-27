# Verifiable financial intent execution — 27 October 2026

## Current source and execution ownership

Application baseline: `6f1fe16b4eae7fb739252dbf999fdac0c4588b2f`, branch
`markets-batch-capacity-recovery-20261020`. Wallet baseline:
`e80d32dac3f516fdf66c23e48dba20c93c6017a7`, branch `wallet-security-20261016`.
Both trees were clean at the start. Existing UI/read-only gateway processes and
unrelated agent processes were left untouched. No market financial/proof task
was running. Root is the sole financial owner; the current source/read-only phase
has zero deployments, registrations, grants, proofs and fee budget. The frozen
SDK remains `c92880c8b6e2c8d392f19368bc8801a2584fd427`; no Node or dependency
source/pin changed. Original evidence and old-chain UNKNOWN requests are intact.

## Source milestone: application policy, generic wallet authority

The previous formal integration connected verification, approval, exact send
and recovery. This application delivery supplies the reviewed policy module.
The coordinated wallet candidate removes market-kind switches from the formal
wallet core and confirmation renderer; it is a separate pending wallet delivery,
not a wallet change published by this application commit. Application-owned
`market-client/wallet/approvalPolicy.mjs` now owns enabled component identities,
quarantine/unsupported-action rejection, asset descriptions and binding visible
limits. Its source/declaration are vendored with exact SOURCE.json hashes.

The coordinated wallet candidate keeps generic public-envelope validation, exact approval digest,
selected account/queue/lock control, native verification, fresh checks, exact
single send and original-identity recovery. The final renderer consumes plain
review rows from the compiled reviewed application adapter; it does not choose
Book matching, Curve pricing, AMM limits or NFT identity policy. Primary limits
remain visible and hash-bound; missing policies and NFT writes still reject.

This is a trust boundary, not arbitrary plugin loading: no page may install a
policy, ABI, verifier, transport, resource URL or success report. The adapter is
part of the reviewed extension build. Registry hashes, exact chain domain,
component ID, asset identity/decimals and per-action policy are checked before a
prompt. Full native verification still independently binds actual ordered calls,
caller/inputs, U124 limbs, session/sig_hash, code/layout/function/key, nonce,
expiry, fees and state endpoints. A display row does not replace that proof.

Adding a reviewed instance of an already supported component can update reviewed
application data/resources without editing wallet business branches. A new
component semantic requires application policy, resource and full-UPS acceptance;
ABI similarity alone never adds a capability. The wallet still ships the bounded
application adapter; this delivery is not a universal arbitrary-contract wallet.
Historical RPC method names and durable schemas remain compatible. No pending
history was cleared and no unknown request can be replaced by this extraction.

## Capability matrix and code basis

| Capability | Current basis | Guarantee / remaining boundary |
| --- | --- | --- |
| User final intent | `composition/intent.mjs`, `funding.mjs`, controller/key | Exact input/output, maximum spend, receiver, nonce/domain, deadline, fee and component identities are committed. A client digest alone is not authorization. |
| Single UPS | `amm/u124/vm-tests/src/wallet_verification.rs` (`WalletApproval.user_id`, ordered calls and endpoint checks) | One signing account; several of its contract states can change in one proven transition. Foreign-user reads do not authorize writes to that account. |
| Deferred sequence | Explicit full stack and signature/session binding | Known inputs execute in order; no synchronous returned-value routing and no `invoke_sync`. |
| Cross-vault / cross-realm | `composition/workflow.mjs`, `execution.mjs`, `receipt.mjs` | Multiple UPSs with explicit confirmation/claim dependencies. Proof aggregation is not cross-account atomicity. |
| Intermediate assets | FT sent/claimed cursors, `composition/funding.mjs` and recovery states | Outbox is not spendable; inclusion of the claim precedes the next spend. A filled first hop can return actual intermediate assets, not reverse its market price. |
| Market batch | Existing compact keys, admission and settlement proofs | Up to four accepted members; AMM/Curve up to four fills, Book/NFT up to two matches. Actual call count depends on the proved operation; there is no universal protocol maximum established here. |
| Amounts / inputs | U124 arithmetic and bounded operation descriptors | Two 62-bit limbs, exact integers; described operations allow up to 128 input fields per call. This does not prove unlimited writes or a universal fee bound. |
| Local concurrency | Wallet origin LockManager, account queue, Executor journals | Shared nonce/vault/payer coordinates serially; independent preparation may overlap. Local tests do not establish multi-host coordination. |
| Ordering / inclusion | Deterministic sealed queue and full processing rules | No certified random seed or global pre-enqueue completeness. No global fairness or censorship-resistance claim. |
| UI | Wallet execution page protocol and owned background | Read/plan/history source paths exist. No current-chain ordinary-wallet financial journey has been accepted; installed native release remains null. |

The existing composition capability report remains historical evidence. Its old
network success at checkpoint 371528 is not current-chain acceptance.

## Newly confirmed composition migration gaps

Source inspection found that composition runtime metadata still pins SDK manifest
`0afb4c65…bd425`, network label `sepolia`, and legacy native call spellings in
`composition/contract/runtimePolicy.mjs`, `domain.mjs`, `adapter.mjs` and
`funding.mjs`. The current application SDK manifest is
`06d86a86…faec8f` and the network label is `testnet`. These restrictions currently
fail closed; changing only a constant would not constitute a migration. A new
explicit composition profile, correct native descriptors, fresh key/controller
binding and linked full-UPS tests are required before live two-pool execution.
The old profile and proof artifacts must remain separately reproducible.

`composition/intent.mjs` also bounds layout slots to u32, while the captured
native contract has 8,594,128,984 slots. The frozen SDK contract queue accepts
exact u64 counts subject to `slots <= (1 << height) * 4`. A focused application
range correction and boundary tests are the next isolated correctness milestone;
this report does not claim it has already passed. No attempt was made to send a
legacy composition request to the reset chain. Book-to-AMM is not extended.

## Fresh read-only chain observations

Realm 0, realm 1, coordinator native/checkpoint data, prover metadata and faucet
configuration returned HTTP 200. Checkpoint-1 remains
`919896e18690246e20307f68cf2e5725aee496755366bbafff88eccaea975f12`; native endpoints
match the previous reset preflight, including 32 height, eight fields and
8,594,128,984 slots. Faucet configuration reports enabled and a 1,000 test-PSY
grant. No grant was requested. This is neither a fee budget nor proof of the old
unknown request's disposal, runtime image identity or upgrade authorization.

## Validation, costs and remaining sequence

Application client/wallet/gateway regression passed 99 cases, including policy
substitution, quarantine/NFT closure, incorrect chain/assets/decimals/U124,
unknown actions and visible exact limits. A synthetic new AMM instance ID works
through the same policy without wallet branches; it is not a deployed instance.
The coordinated wallet candidate selected-cohort full regression passed 728 with one existing skip across
65 files; its SDK distribution/typecheck and staging build passed. Those wallet
results apply to the archived candidate snapshot, pending its separate reviewed
commit and published-application provenance check. Build warnings
remain recorded. Initial extraction syntax/type errors and failed invocations
are retained separately; only corrected invocations count as passes.

Actual extension approval/rendered runtime, chain send, real fills, ordinary
claims and financial fault recovery were not performed. The last dedicated
browser session remains handed off after the user chose code-only work; no other
session or simulated extension location was used to bypass it. Exact native
proof implementation and previously verified proof bytes were unchanged; no
expensive proof was repeated for this source extraction.

There are no new cold/warm proving, confirmation, claim, whole-round, RSS/physical
peak or actual fee samples. Unit/build times and single RPC observations cannot
substitute for them. No p95, TPS, production or general speedup claim is made.

Next in order: close the count-bound issue; declare a fresh AMM instance/fee/UPS
ledger and stop rules; bind current QA identities/assets and reviewed release;
complete actual extension AMM funding/settlement/claim and recovery; then Curve,
Book and NFT (only with its same-UPS identity assertion). Finish explicit
selected-SDK composition adaptation and linked full proofs before two-pool
success/exit/intermediate refund and matched performance. This ordering does not activate a
financial phase from the current zero-budget source plan. Runtime binary/image
and upgrade authorization/replay evidence remain service-owner deliverables.

[Public source, regression/build failures and passes, and readonly evidence](../../executor/verification/2026-10-27-wallet-policy-boundary-v1/manifest.json).
