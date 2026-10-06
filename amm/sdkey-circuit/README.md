# AMM SD-key circuit and public wallet

This crate builds a six-transaction Plonky2 fingerprint for the compiled
`PsyUsdtAmm` contract. It depends on the adjacent local `psy-node` SDK source.
`pool_wallet` reconstructs this circuit for registration, proof-only preflight
and submission. The 14-method PSY/pUSDT candidate was deployed as staging
contract **1758**, with public pool user **499200**, on 2026-10-05.
Historical contract 59 has a different policy; use the verified source, ABI,
code/layout roots and registration together.

The `software_defined_call.inputs` witness is seven `u64` values:

| Index | Meaning |
| --- | --- |
| 0 | Branch: 1 PSY swap, 2 pUSDT swap, 3 PSY refund, 4 pUSDT refund, 5 LP add, 6 LP remove, 7 PSY-only LP refund, 8 pUSDT-only LP refund, 9 dual-asset LP refund, 10 expired LP removal cancellation |
| 1 | Payer user ID |
| 2 | `x`: swap input, refund amount, LP PSY deposit, or LP shares burned |
| 3 | `y`: swap output, LP pUSDT deposit, or LP PSY withdrawal |
| 4 | `z`: LP shares minted or LP pUSDT withdrawal |
| 5 | Order nonce for swap, LP add, LP remove and removal cancellation |
| 6 | Automatic PSY fee burn amount |

The circuit hashes the exact expected method inputs and compares the resulting
hashes, contract IDs, method IDs, input lengths, and top-level caller IDs with
all six authenticated transaction slots. Inactive slots must be the pool's
zero-input `noop` method. The last slot must be PSY `simple_burn` with the
network base fee plus at most 100 DA slot fees. The pool contract independently
checks authenticated payer orders, token Outbox deltas, quotes, and LP balances.

From `psy-template`:

```sh
CARGO_TARGET_DIR=../psy-node/target cargo test --manifest-path amm/sdkey-circuit/Cargo.toml --offline
CARGO_TARGET_DIR=../psy-node/target cargo run --manifest-path amm/sdkey-circuit/Cargo.toml --bin fingerprint -- <deployed-amm-contract-id>
```

The second command computes a fingerprint for a contract ID. The public wallet
supports `fingerprint`, `register`, `add`, and `submit`; pass a calls JSON before
the RPC config for `submit`. `AMM_USE_LOCAL_PROVER=1` selects local proving;
`AMM_PROVE_ONLY=1` validates a submission without broadcasting it. The fixed
public key value is intentionally public. Spending authority comes from the
registered fingerprint and authenticated contract state.

Cancellation consumes an expired removal order's exact PSY fee escrow and
nonce, preserves shares and reserves, and authorizes no payout transfer. The
owner then calls `close_remove`. Swap and LP deposit refunds return the paid
principal only to the original payer; escrow covers execution and the remaining
fee allowance stays in the pool account. Closing an order does not claim its
output; the ordinary wallet must claim that separately.

Real circuit tests reject altered refunds, wrong nonces, inserted cancellation
payouts and excessive fee burns. Compiled VM tests check cancellation state,
expiry, exact funding and replay protection. Current live test status is in
[the pUSDT test record](../../PUSDT_TEST_FUNDING.md).
