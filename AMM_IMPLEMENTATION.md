# PSY / pUSDT AMM implementation status

## 2026-10-05 current deployment

The current source has **14 methods and 22 state fields**. It was deployed as
new staging contract **1758**, with public SD-key vault **499200**, after
independent code/layout reconstruction and empty → new canonical proof
verification. Contract 59 was not updated. The new policy has ten branches,
including expired funded LP removal cancellation; that branch consumes only
the fee escrow and leaves reserves and shares unchanged. Ordinary wallet
operations use MCP. The remaining real PSY/pUSDT acceptance tests completed on Oct 9: second-provider LP add/remove, both swap directions, swap refunds, single-asset LP refunds, funded removal cancellation and final withdrawal. All 58 additional UserEndcaps matched included receipts; balances and LP shares conserved. See [the Oct 9 completion report](amm/STAGING_PUSDT_TEST_2026-10-09.md). The [Oct 5 report](amm/STAGING_PUSDT_TEST_2026-10-05.md) retains the deployment and first matching rounds.

The verified deployment artifact is `amm/contract/target-pusdt-verified/`.
`npm run build:amm` writes to a fresh `target-candidate` directory by default
and refuses an existing output directory. Use `PSY_USER_CLI` with the reviewed
SDK compiler and `AMM_OUTPUT_DIR` for a different fresh directory, then run
`AMM_ABI_DIR=<that-directory> npm run test:amm`. Deployment still requires the
independent code/layout and canonical proof gate. The default ABI tests verify
the 14-method snapshot, its exact layout match and original method IDs.

## 2026-09-30 lifecycle candidate (not deployed)

The Sep 30 source compiled to a **13-method candidate** in `amm/contract/target-next/`; the previously deployed nine-method ABI is in `amm/contract/target/`. All original method IDs and the entire state layout are identical. That candidate refuses to overwrite an active payer order and adds payer-signed `close_psy_swap`, `close_usdt_swap`, `close_add`, and `close_remove`. A close succeeds only when the authenticated pool settlement cursors equal the cumulative PSY and, where relevant, pUSDT Outbox totals sent by that payer. Each cursor advances only in a guarded atomic settlement or refund stack. The payer can then open a new order with a higher nonce. PSY-only close paths avoid reading pUSDT state. Its historical JavaScript suite passed 27 tests.

This is **not yet an approved update request or live contract `59` behavior**. Before updating, independently read contract `59`'s current code root and old state layout from chain; verify the update proof uses that exact old layout and the candidate new layout, then prove the new close methods against authenticated staging state. Do not reuse a proof generated for a different old layout. `pool_wallet witness` can execute a local method definition with `AMM_LOCAL_DEFS=amm/contract/target-next/circuit_defs.json` and writes a diagnostic witness to `AMM_TRACE_OUTPUT`; `AMM_PROVE_ONLY=1 pool_wallet submit ...` proves a complete existing call stack without signing or submitting. Neither mode submits an update.

The arithmetic cap and fee economics below remain unchanged. This candidate fixes order overwrite and re-opening; it does not make the pool production-ready. All four close methods have passed real-state base CFC proof and verification without submitting a code update. The [candidate preflight record](amm/STAGING_LIFECYCLE_CANDIDATE_2026-09-30.md) includes test transactions, observed chain layout, and remaining deployment gates.

The previously deployed nine-method pool contract targets the staging PSY contract `0` and pUSDT contract `4`. The pool has payer-authored orders, an unclaimed-payment refund for swaps, a partial or two-asset refund for LP adds, exact-input swaps with a 30-basis-point fee, LP minting, LP withdrawal, and a read-only padding method for fixed-length SD-key transactions. **It was deployed on staging as contract `59` on 2026-09-28.** The deployment ID is `ab22f343748c5eef14d16bee4b6d310d4c024f81c1324d47df7f2125b11034f2`. A guard-expression fix was subsequently submitted as update `9171287f6dcbb7eb676b8e670cb39454194fa40dca317c0cd2c78c6392d3277a`; the on-chain code definition matches the updated nine-method artifact and retains the original ABI and state layout. The staging-compatible local release CLI was used for both operations. No `psy-node` source was changed.

The pool contract is only a guard and accounting contract. The existing token contracts do not call it when they transfer. A pool-account transaction therefore must contain the guard method and the exact token `simple_claim` and `simple_transfer` calls in one atomic transaction. The pool account must use a custom software-defined key fingerprint that authenticates the complete call stack: contract IDs, method IDs, ordered inputs, pool and payer IDs, exact recipient and amount, and the automatic PSY fee burn. A public private key with the CLI's current method allowlist would allow unauthorized transfers and is unsafe to fund.

The current `psy_user_cli register-user --sign-type sd-key` command builds only a generic allowlist. The underlying `WalletSession` and `PsyMemoryWallet` APIs support a custom circuit. `amm/sdkey-circuit/src/bin/pool_wallet.rs` uses that API with a deliberately public private key. It registered pool user `1347584` on staging with public-key hash `f4ea63182c221226f2cc3d2b1f1156ed2f0c23807fba8f50be392faf9ddd270c` and fingerprint `252a81654dc4f7eb3061eb3eac626cc33a574c5bb46c06c0622747a33e1ae11c`. Registration succeeded without a `psy-node` source change. Live pool-account spending proofs have now settled the refund, an LP add, and both swap directions on staging; see the live-verification record linked below.

## Current contract boundaries

- Each payer signs `open_swap`, `open_add`, or `open_remove` in their own contract partition. The pool reads that intent and the cumulative token Outbox delta from authenticated payer state, comparing it with pool-owned settlement cursors.
- Every pool action requires a separate cumulative PSY payment delta of `1,000,100,000` base units from that payer to the pool for network fees. A PSY input or LP deposit adds its asset amount to that delta. The pool refund transfers the full input amount back to the same payer; the fee payment covers the pool-account transaction. The wallet measures the automatic network burn during proving, and the registered fingerprint constrains it to the supported formula and escrow ceiling.
- A swap or LP add must claim the complete input delta. A swap must transfer the computed output to its payer. A refund must claim and return the exact unpaid asset delta to the same payer. An LP add refund returns whichever leg was actually paid; if both were paid, it claims and returns **both** in one transaction. LP removal transfers both computed outputs to its provider.
- The current arithmetic is deliberately bounded to `10,000,000` base units per token reserve and input so all quote products fit in one Goldilocks Felt. This is only `0.01` PSY for the nine-decimal test token; it is a proof-of-concept scale and is not a usable liquidity limit. Raising it requires multi-limb arithmetic or a separately proved safe quote algorithm.
- The contract's first four state fields match the staging token layout at slots `0`, `1`, `2`, and `3`, allowing the compiler's `Self::ABI` state-read path to address token Outbox fields. The pool array is shorter than the live token array but covers all supported user IDs. The first live PSY order was securely refunded, and subsequent pool-account settlement proofs were accepted on staging.

The live token ABIs assign `simple_claim(sender)` method ID `2293029357`, `simple_transfer(recipient, amount)` ID `354447671`, and PSY `simple_burn(amount)` ID `2923993647`. The custom policy must enforce the following whole-call sequences, with the guard first and the automatic fee burn last. Every `sender` or `provider` argument in a token transfer must be the same payer authenticated by the guard. The policy must compute or tightly bind the fee amount from the chain's fee rules; admitting an arbitrary burn is unsafe.

`amm/operationCalls.mjs` constructs the payer and pool call lists for each action. It validates the contract's amount and user-ID bounds and keeps refunds addressed to the original payer. `withPoolSignInputs(calls, actualFeeBurn)` adds the seven inputs expected by the direct `pool_wallet submit` client; the fee must be the wallet's actual automatic burn. These helpers do not authorize transactions, and a caller can change their output; security depends on the registered fingerprint and successful guard proof.

`amm/sdKeyPolicyReference.mjs` is an executable specification for that fingerprint. It rejects changed recipients or amounts, reordered or extra calls, and a PSY burn above the payer's fee escrow in local tests. It checks caller-supplied JavaScript objects, not authenticated transaction hashes, so it is not a chain spending policy.

`amm/sdkey-circuit` contains a real Plonky2 SD-key circuit based on the local `psy_ups_circuit` gadget. Its nine branches hash exact guard/token/noop inputs, require the default top-level caller, bind all six transaction slots to the UPS signature digest, and allow only a `1,000,000,000 + 1,000 × slots` PSY burn with at most 100 DA slots. A Rust proof test accepts an exact Alice refund, a pUSDT swap, and a dual-asset LP refund; it rejects Bob as recipient, an extra transfer in a padding slot, and a fee burn above the escrow. The live registration used this circuit and the existing custom-circuit API. Live pool spending has since been validated for the refund, LP add, and both swap directions; the LP removal run is recorded separately below.

The staging contract `59` received an append-only state update on 2026-09-29 (`4e16268080f2a08749676dd8bb75f71a8b6c4cd954ee77d408fbdb40a0e23eea`). The original 20 state fields keep their positions; two new per-payer cumulative Outbox cursors follow them. Every pool claim branch checks the payer's exact PSY and/or pUSDT Outbox delta against its cursor, then advances that cursor inside the guard call. This retains the payer-signed order checks and the existing SD-key call restrictions while avoiding simultaneous reads of payer Outbox and pool claimed slots, which produced a conflicting proof witness. The first live refund with this update was submitted and verified on chain; the exact claim and return amounts are recorded in the staging verification log.

The historical contract 59 registration used the nine-branch driver. The current ten-branch driver is paired with contract 1758; it must not be used to reconstruct contract 59's historical fingerprint. `pool_wallet fingerprint 1758`, `register 1758`, and `add 1758` reconstruct, register or load the current policy through the wallet API. A fingerprint hash alone does not make a pool-account spend valid; the complete transaction must satisfy its circuit and contract guards.

Every pool call list is padded to five calls with the exact zero-input `noop` method. The wallet appends one PSY fee-burn call, giving a six-call stack for a single fingerprint. The policy must constrain the number and position of padding calls; accepting arbitrary extra calls would reopen the spending path.

| Pool action | Required token calls before fee burn |
| --- | --- |
| PSY input swap | PSY claim payer; pUSDT transfer exact output to payer |
| pUSDT input swap | PSY claim payer's fee escrow; pUSDT claim payer's input; PSY transfer exact output to payer |
| LP add | PSY claim payer's deposit plus fee escrow; pUSDT claim payer's deposit |
| LP remove | PSY claim payer's fee escrow; PSY and pUSDT transfer computed outputs to payer |
| PSY input refund | PSY claim payer's input plus fee escrow; PSY transfer exact input to payer |
| pUSDT input refund | PSY claim payer's fee escrow; pUSDT claim payer's input; pUSDT transfer exact input to payer |
| LP add refund | PSY claim the fee escrow and any paid PSY leg; claim any paid pUSDT leg; transfer each paid leg's exact amount to payer |
| Expired LP removal cancellation | PSY claim payer's exact fee escrow; no payout transfer; preserve shares and reserves |

## Build and local checks

Use the compiler with the `psy-sdk-compiler` sidecar installed. On this machine the working command is:

```sh
npm run build:amm
npm run test:amm
CARGO_TARGET_DIR=../psy-node/target cargo test --manifest-path amm/sdkey-circuit/Cargo.toml --offline
```

The build script uses `PSY_USER_CLI` when set, otherwise the installed 0.1.2 CLI or the PATH CLI. It rejects an existing output directory and compiler output without canonical state-layout metadata. The Oct 5 deployment used the locally rebuilt SDK compiler explicitly: the installed 0.1.2 compilation output lacked that metadata. Review artifacts must be built and verified with the target deployment toolchain. `amm/contract/abi.test.mjs` checks the current 14-method artifact, its exact layout match, original method IDs and the live-token state prefix. The JavaScript quote and pool-model tests do not exercise the Psy prover; the separate Rust circuit and compiled VM tests do.

## Staging verification and production limits

Alice (`135168`) submitted `open_swap` and paid pool user `1347584` a cumulative `1,001,100,000` PSY base units in confirmed checkpoint `74541`, transaction `127dc32075c2a872c3da49df5bdc9913c662d7ccae8e74bee4b34cb5af9242ea`. The order's input is `1,000,000` units; the remaining `1,000,100,000` units are fee escrow. This input is intended for a failed-swap refund. At checkpoint `74684`, the PSY Outbox leaf still encoded the full payment and the pool's claimed leaf for Alice was zero. The first guard proof failed, prompting the same-layout contract update above. The remote proving service appeared to reuse a stale method circuit, and the fresh local prover also failed with a conflicting witness wire. No refund was submitted during that failed attempt. A proposed removal of the order checks was rejected by automatic approval review as a security weakening; the source and compiled artifact were restored to the secure deployed logic, and that change was never submitted.

An attempted direct pUSDT `simple_mint` on live contract `4` failed locally with `only deployer can mint` before submission. The staging bridge's Sepolia `TokenFaucetManager` dispenses test USDT on L1. A dedicated test wallet received `10,000` test USDT in L1 transaction `0x4e951df739c7b4c4698cadd5867ceca10536ec676f565ceccb918998150a4ff3`, then deposited `2` USDT through the bridge in transaction `0x759e71b0199bd6d1833ec5e59e5a67ec394d7bc1f4b14b2a4ffb86d0a8fb15b1` (deposit index `596`). The inclusion proof was generated after the bridge's proved count reached `597`. Alice claimed the deposit on Psy in transaction `5b3378fabd8036a99234d37c7b3621d06f9ba1dcb36e1cedd199f20848e41e02`, confirmed at checkpoint `79169`; her pUSDT balance leaf at checkpoint `79172` held exactly `2,000,000` base units (`2` pUSDT).

The Alice (`135168`) and Bob (`1183744`) wallets came from the existing `/private/tmp/psy-two-contracts-20260926/wallets.json` test fixture. Before this AMM payment, saved chain balance proofs showed `941.999707` and `973.999881` PSY respectively. This AMM test spent `1.0011` PSY from Alice's pre-existing balance. Alice then claimed another `1,000` test PSY from the staging Psy faucet in transaction `7dc8784ea4b3fb1e432e0aaa5834a412b173829bb32046c781127fe2b01eb810` at checkpoint `79077`; her resulting balance was approximately `1,938.9986` PSY. The separate Psy browser extension account `1839104` also used its faucet and claimed a `1,000` PSY incoming payment; its wallet showed `998.999998` PSY at checkpoint `79152` after claim fees. No PSY mint was attempted by the AMM work.

The secure refund, both swap directions, LP addition, and LP removal have been proved, submitted, and verified on staging with real test PSY and pUSDT. Alice claimed both assets returned by LP removal. The pool retains only the permanently locked minimum shares and their residual reserves. Full transaction IDs, checkpoints, and decoded state leaves are in [the staging verification log](amm/DEPLOYMENT_READINESS_2026-09-28.md). The current 27 JavaScript tests and two Rust circuit tests pass; the Rust tests cover redirected recipients, altered amounts, extra calls, and fee abuse. Live adversarial submissions have not yet been performed. The current arithmetic cap and deployer-controlled upgrade authority still need redesign before production liquidity.

`invoke_sync` remains a separate feature request: it should execute a called contract method before the next statement, expose its return value, and specify transaction rollback, state visibility, nesting, and fee semantics. This AMM design uses an atomic multicall if the chain validates that behavior end to end; it does not assume `invoke_sync` exists.

## Wide arithmetic testing (2026-10-12)

A separate [wide candidate](amm/wide/README.md) lifts the reserve/input/share cap
from 10000000 to 1000000000000 base units using bounded limb multiplication and
lexicographic integer comparison. The PSY reserve cap becomes 1000 PSY at nine
decimals. It preserves the reviewed 22-field layout and 14-method ABI; the
existing staging contract, vault, frozen executor and old artifacts are unchanged.
v1 was freshly deployed as contract 2425 with vault 317504 after independent
initial-layout proof verification. Its real-state refund preflight failed before
broadcast because an inactive pUSDT branch read an uninitialized payer partition.
The local v2 repair passed that refund's full-state CFC proof, four VM tests and
independent initial-layout proof verification. Full UPS and live-asset acceptance
remain pending; see the [current report](amm/wide/deployments/staging-2026-10-12/REPORT.md).
The fee escrow and deployer-controlled upgrade authority remain unchanged.
