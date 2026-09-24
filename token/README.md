# PSY-20 token template

PSY-20 is a partitioned fungible-token reference contract. It uses an Outbox/claim flow for transfers, private notes for private payments in the complete source, and escrowed delegation channels for approved spending. It is experimental and is not a mainnet-ready ERC-20 equivalent.

## Sources and supported methods

| Source | Build command | Scope |
| --- | --- | --- |
| `src/main.psy` | `npm run build:private` | Complete source with `private_transfer` and `private_claim` (16 methods). `psyup build` produces `target/token.json` and its ABI. The current staging v3 deploy path cannot deploy this artifact. |
| `src/main.psy.rs` | `npm run build:staging` | Staging-compatible public core: metadata, mint, burn, transfer, claim, batch transfers, and cooperative delegation (14 methods). Private note methods are absent. |

`npm run build` builds and checks both artifacts; the complete ABI must contain both private methods and the note/nullifier state. The v3 source does **not** implement private note methods. Its issuer check binds the configured `ISSUER_USER_ID` partition; the complete `.psy` source additionally checks the deployer public key. Storage layouts and ABIs differ, so an existing deployment cannot be upgraded by replacing the artifact.

## Current feature status

| Feature | Staging-compatible v3 status |
| --- | --- |
| Metadata | `symbol` and `decimals` are stored in the issuer partition. There is no token name, metadata URI, or standard metadata getter. `set_metadata` can change the two fields until administration is renounced. |
| Owner / mint authority | Only the configured `ISSUER_USER_ID` partition can initialize metadata, mint, or renounce. `set_mint_authority` only reaffirms that same partition; it cannot transfer ownership to another user. This is a fixed issuer partition, not a general owner role. |
| Supply | `total_minted` counts lifetime issuance in the issuer partition. `burn` reduces a user's liquid balance but does not reduce `total_minted`. There is no on-chain circulating `total_supply` or max-supply cap. Balances are per-user state. |
| Public transfer | Sender debits balance into a per-recipient cumulative Outbox; recipient calls `claim`. Batch sizes 2 and 5 are supported. |
| Delegated spending | Sixteen escrow slots per owner support parallel spenders and cooperative close/refund. Revocation is **not** a safe unilateral `approve(..., 0)` because historical remote-state proofs can confirm after a request. |
| Private transfer | Implemented in the complete `.psy` source and compiled into its ABI. The v3 staging artifact has neither method, so deploying it will not enable private payments. |

The existing `.psy` `private_claim` verifies a note-inclusion fingerprint against the session proof tree root and binds its checkpoint user tree root before crediting a balance and recording a nullifier. The v3 compiler used here exposes neither `get_session_proof_tree_root` nor `get_checkpoint_user_tree_root`; its supported `psystd` calls do not provide equivalent roots. A compile probe against the installed 0.1.1 CLI rejects `get_session_proof_tree_root()` with `Unknown function`. Adding only a `private_transfer` deposit to v3 would debit users without a supported, secure claim path. To deploy the complete feature through v3, its toolchain must expose and verify equivalent proof roots, then the contract, wallet proof generation, nullifier behavior, and two-user staging redemption must be tested together. This requires a new contract deployment and a migration plan for existing balances.

Delegation and `transfer`/`claim` serve different purposes. In a transfer, the owner fixes both amount and recipient. In a delegation, the owner locks a budget and the spender later chooses payment amount, timing, and recipient. If applications do not need that discretion, the public transfer flow is simpler; the current delegation methods should not be advertised as standard `approve` / `transferFrom`.

## Transfers

`transfer(recipient, amount)` debits the sender and increases that sender's cumulative Outbox total for the recipient. The recipient calls `claim(sender)` to credit the newly available amount. `batch_transfer_2` and `batch_transfer_5` follow the same accounting. User IDs must be in `1..16777215` where an Outbox index is required.

Minting is restricted to the configured issuer partition. `set_metadata` initializes its mint authority; `set_mint_authority` can only affirm that same partition. `renounce_mint_authority` permanently disables minting and administration. `burn` reduces liquid balance.

## Delegation: 16 concurrent escrow slots

Each owner has 16 independent slots, numbered 0–15. The owner can authorize different spenders concurrently. A channel version increases when that slot is reopened. The spender's own partition holds a ledger for each `(owner, slot)` with cumulative `spent`, version, and a terminal `closed` bit.

1. Alice calls `open_delegation_channel(slot, bob, amount)`. The amount leaves her liquid balance and is locked in that slot.
2. Bob calls `spend_delegation(alice, slot, amount, recipient)`. Bob's local ledger limits cumulative spending to the locked amount; the recipient later calls `claim(bob)`.
3. Alice may call `request_revoke_delegation(slot)` to mark her request. A spend that reads the current `REVOKE_PENDING` state is rejected in the latest local source. **This is not an effective unilateral cutoff:** staging accepts historical proofs of Alice's earlier `ACTIVE` state.
4. Bob calls `close_delegation_channel(alice, slot, version)`. The close is terminal for that version in Bob's partition. Bob cannot spend from it again, including with an old proof of Alice's authorization.
5. Alice calls `finalize_revoke_delegation(slot, bob)`. The contract verifies Bob's closed ledger and refunds `allocated_amount - spent` to Alice. The current source has no fixed checkpoint waiting period.

A `closed` ledger acts like a channel-version nullifier. Adding a nullifier or setting available allowance to zero in Alice's partition would not make revocation unilateral: Bob could still read Alice's pre-revocation state. The active-only check stops fresh post-request reads, but it does not stop historical reads. If Bob refuses to close, the unspent escrow remains locked. Safe unilateral `approve(..., 0)` plus immediate refund requires protocol-level freshness or atomic validation of both users' current state. Do not present this API as unilateral ERC-20 `approve`/`transferFrom`.

## Build, test, deploy

```sh
npm run configure -- --issuer <REGISTERED_USER_ID>
npm test
npm run build

# Only when a public-only staging token is intended. This artifact has no private methods.
RPC_CONFIG=/path/to/config.json PRIVATE_KEY=<test-key> \
  PSY_USER_CLI=/path/to/node-compatible/psy_user_cli npm run deploy:staging-public
```

`deploy:checked` now stops before deployment because its v3 artifact omits private methods; use `deploy:staging-public` for an explicit public-only deployment. Both deployment commands check that the selected wallet's registered user ID matches the configured issuer. The published local 0.1.1 CLI returned `canonical layout verifier fingerprint mismatch` against staging on 2026-09-23. A locally built node-matched CLI deployed staging contract 46. A compiler success by itself does not prove deployability. The complete private-enabled `.psy` artifact has not been deployed to staging with the current toolchain.

`npm test` compiles both artifacts and runs native single-user assertions against the complete `.psy` source. The native private-note tests cover insertion and an invalid proof index; they do not exercise a valid `private_claim` with a generated ZK inclusion proof. The native VM cannot execute genuine two-user remote reads; the JavaScript E2E suites are state models. Use live evidence before relying on private-note redemption or settlement behavior.

## Staging evidence and limits

Staging contract **47** uses the preceding v3 revision, which allowed spending when the owner status was `REVOKE_PENDING`. Two users from different realms confirmed metadata, mint 10,000, open 1,000, spend 300, claim 300, request revoke, spender close, and immediate refund. A post-close spend was rejected by the `closed` assertion. State proofs at checkpoint 34357 show owner balance 10,000, channel allocation 0/status CLOSED, spender `spent = 300` and `closed = 1`, with 300 in both Outbox sent and claimed totals. See [transactions](../tests/live/evidence/2026-09-23/token-delegation-v3-final.json) and [state proofs](../tests/live/evidence/2026-09-23/token-delegation-v3-final-state-proofs.json).

On that revision, Alice's request confirmed at checkpoint 34617 and Bob's **newly generated** spend confirmed at 34623. The earlier [historical-proof experiment](../tests/live/evidence/2026-09-23/token-delegation-v3-historical-spend.json) also confirmed a pre-request trace after the request.

The current active-only source was deployed as staging contract **48**. Its normalized source SHA-256 is `9f56609190fc49887a226cd0e90233708c7e2723d27ca28a570f222036a43809`. The ordinary two-user lifecycle and immediate refund confirmed. Alice's request for a separate 100-token slot confirmed at checkpoint 34749; a **newly initiated** Bob spend then failed with `channel is not active`. The full 100 was refunded, and state proofs at 34772 show Bob spent 0 from that slot. See [flow transactions](../tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-flow.json), [negative test](../tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-negative.json), and [final state proofs](../tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-state-proofs.json).

On the **same contract 48**, Bob generated a spend proof at checkpoint 34798, Alice's request confirmed at 34807, and Bob's saved proof still confirmed a 40-token spend at 34815. Bob then closed and Alice recovered the remaining 60. [Transaction evidence](../tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-historical-spend.json) and [final state proofs](../tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-historical-state-proofs.json) demonstrate that the active-only guard is not unilateral cancellation.

The [staging verification report](../tests/live/PSY20_DELEGATION_REPORT_2026-09-23.md) records the toolchain mismatch and the exact checks performed.

Contract **46** used an earlier revision with a 60-checkpoint wait. After that wait, its refund also confirmed and state proofs showed the channel cleared. Its [transactions](../tests/live/evidence/2026-09-23/token-delegation-v3.json), [pre-refund proofs](../tests/live/evidence/2026-09-23/token-delegation-v3-state-proofs.json), and [settled proofs](../tests/live/evidence/2026-09-23/token-delegation-v3-settled-state-proofs.json) are kept as historical comparison.

Before production use, change the protocol if unilateral cancellation is required: validate authorization-sensitive remote reads against current leaves at inclusion, atomically with the caller update. Then test concurrent submissions and node-side rejection of stale caller leaves, integrate wallets and indexers, and obtain an independent contract/protocol review. The v3 private transfer path remains absent, and unilateral allowance cancellation remains unsupported.
