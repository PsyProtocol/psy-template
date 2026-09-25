# PSY-20 token template

PSY-20 is a partitioned fungible-token reference contract. It uses an Outbox/claim flow for transfers, private notes for private payments in the complete source, and escrowed delegation channels for approved spending. It is experimental and is not a mainnet-ready ERC-20 equivalent.

## Sources and supported methods

| Source | Build command | Scope |
| --- | --- | --- |
| `src/main.psy` | `npm run build:private` | Complete source with `private_transfer` and `private_claim` (20 methods). `psyup build` produces `target/token.json` and its ABI. The current staging v3 deploy path cannot deploy this artifact. |
| `src/main.psy.rs` | `npm run build:staging` | Staging-compatible public core: metadata, issuance, burn settlement, transfer, claim, batch transfers, and cooperative delegation (18 methods). Private note methods are absent. |
| `src/main.private.psy.rs` | `PSY_PRIVATE_CLI=/path/to/psy_user_cli npm run build:private-v3` | Staging-verified v3 profile with the public core plus `private_transfer` and `private_claim` (20 methods). Requires the matching isolated compiler toolchain and its verifier fingerprint helper. |

`npm run build` builds the legacy complete source and public-only v3 source. Build the private v3 profile separately. Its issuer check binds the configured `ISSUER_USER_ID` partition; the complete `.psy` source additionally checks the deployer public key. Storage layouts and ABIs differ, so an existing deployment cannot be upgraded by replacing the artifact.

## Current feature status

| Feature | Staging-compatible v3 status |
| --- | --- |
| Metadata | `symbol`, `decimals`, `name` (two Felts), and `token_uri` (five Felts) are stored in the issuer partition. `set_metadata` initializes authority; `set_extended_metadata` sets the name and URI. The dApp helper encodes up to 14 UTF-8 bytes for name and 35 for URI; longer references need an application-level content hash or a wider future storage layout. Both can change until administration is renounced. Read the issuer partition's state proof or indexed events; there is no getter method. |
| Owner / mint authority | Only the configured `ISSUER_USER_ID` partition can initialize metadata, mint, or renounce. `set_mint_authority` only reaffirms that same partition; it cannot transfer ownership to another user. This is a fixed issuer partition, not a general owner role. |
| Supply | `total_minted` counts lifetime issuance and `total_supply` counts issuance less settled burns. `set_max_supply` sets an immutable lifetime issuance cap before the first mint; zero means uncapped. `mint_to` issues into the issuer's cumulative Outbox and the recipient calls `claim`. `burn` removes a holder's liquid balance and records a monotonic request; the issuer calls `settle_burn(holder)` to reduce `total_supply`. A pending burn remains in `total_supply` until settlement. The issuer must process burns for the displayed supply to be current. Balances are per-user state. |
| Public transfer | Sender debits balance into a per-recipient cumulative Outbox; recipient calls `claim`. Batch sizes 2 and 5 are supported. |
| Delegated spending | Sixteen escrow slots per owner support parallel spenders and cooperative close/refund. Revocation is **not** a safe unilateral `approve(..., 0)` because historical remote-state proofs can confirm after a request. |
| Private transfer | The new private v3 profile implements `private_transfer` and `private_claim`; two registered users in different realms completed a staging round trip on contract 53. The default public-only v3 artifact still lacks these methods. |

The private v3 `private_claim` verifies the note-inclusion fingerprint and session proof tree root, binds the checkpoint user tree root, records a nullifier, and credits the claimant. The standard installed v3 compiler lacks two lowerings for VM operations already present in the node. `build:private-toolchain` archives the local `psy-node` checkout into a temporary directory and patches only that isolated compiler copy; it does not modify the node checkout. The build compares the contract's proof fingerprint with the exact toolchain's circuit fingerprint. Existing deployments need a separate migration plan.

Delegation and `transfer`/`claim` serve different purposes. In a transfer, the owner fixes both amount and recipient. In a delegation, the owner locks a budget and the spender later chooses payment amount, timing, and recipient. If applications do not need that discretion, the public transfer flow is simpler; the current delegation methods should not be advertised as standard `approve` / `transferFrom`.

## Transfers

`transfer(recipient, amount)` debits the sender and increases that sender's cumulative Outbox total for the recipient. The recipient calls `claim(sender)` to credit the newly available amount. `batch_transfer_2` and `batch_transfer_5` follow the same accounting. User IDs must be in `1..16777215` where an Outbox index is required.

Minting is restricted to the configured issuer partition. `set_metadata` initializes its mint authority; `set_mint_authority` can only affirm that same partition. `renounce_mint_authority` permanently disables minting and administration, but the issuer can still settle already recorded burns. A fixed cap limits lifetime issuance (`total_minted`), so burning does not reopen cap room. `total_supply` includes balances, pending public transfers, private notes, and delegation escrow; it excludes only settled burns. These new state fields change the storage layout and require a new deployment and migration for older instances.

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

# From token/, with a local psy-node checkout at ../../psy-node or PSY_NODE_SOURCE set:
PSY_PRIVATE_CLI="$(npm run --silent build:private-toolchain | tail -1)"
PSY_PRIVATE_CLI="$PSY_PRIVATE_CLI" npm run build:private-v3
RPC_CONFIG=/path/to/staging-config.json PRIVATE_KEY=<issuer-test-key> \
  PSY_PRIVATE_CLI="$PSY_PRIVATE_CLI" npm run deploy:private-v3

# Only when a public-only staging token is intended. This artifact has no private methods.
RPC_CONFIG=/path/to/config.json PRIVATE_KEY=<test-key> \
  PSY_USER_CLI=/path/to/node-compatible/psy_user_cli npm run deploy:staging-public
```

`deploy:checked` stops before deployment because its default v3 artifact omits private methods; use `deploy:staging-public` only for an explicit public-only deployment. `deploy:private-v3` builds and deploys the private v3 profile after issuer preflight. The published local 0.1.1 CLI returned `canonical layout verifier fingerprint mismatch` against staging on 2026-09-23; use a node-matched CLI. Staging contract 53 used the isolated toolchain and completed a two-user private round trip.

`npm test` compiles the legacy and public-only artifacts and runs native single-user assertions against the complete `.psy` source. The private v3 path has a separate live test, `tests/live/staging_token_private.py`, which requires two registered test accounts in different realms. Keep the generated note proof and wallet keys outside the repository.

## Staging evidence and limits

On 2026-09-25, private v3 staging contract **53** completed `set_metadata`, `mint(1000)`, and two Alice-to-Bob private transfers and claims across two realms. The second note exercised Merkle index 1. State proofs at checkpoint 48805 show Alice balance 850, Bob balance 150, Alice note count 2, and total supply 1000. Replaying the first note was rejected with `nullifier already claimed` before transaction submission. [Transactions, source hash, and state proofs](../tests/live/evidence/2026-09-25/token-private-v3.json) contain no wallet keys or note secrets. Concurrent claims and upgrade compatibility remain to be tested.

On 2026-09-24, public-only staging contract **49** tested the new issuer and supply methods with two users in different realms. `set_metadata`, `set_extended_metadata`, `set_max_supply(1000)`, `mint_to(recipient, 600)`, recipient `claim`, recipient `burn(200)`, and issuer `settle_burn(recipient)` all confirmed. State proofs at checkpoint 43014 show `total_minted = 600`, `total_supply = 400`, `max_supply = 1000`, and matching requested/settled burn counters of 200. Duplicate settlement and a further mint of 401 were rejected. [Transaction and state evidence](../tests/live/evidence/2026-09-24/token-supply-v3.json) is tied to the normalized v3 source hash. This profile still has no private methods.

Staging contract **47** uses the preceding v3 revision, which allowed spending when the owner status was `REVOKE_PENDING`. Two users from different realms confirmed metadata, mint 10,000, open 1,000, spend 300, claim 300, request revoke, spender close, and immediate refund. A post-close spend was rejected by the `closed` assertion. State proofs at checkpoint 34357 show owner balance 10,000, channel allocation 0/status CLOSED, spender `spent = 300` and `closed = 1`, with 300 in both Outbox sent and claimed totals. See [transactions](../tests/live/evidence/2026-09-23/token-delegation-v3-final.json) and [state proofs](../tests/live/evidence/2026-09-23/token-delegation-v3-final-state-proofs.json).

On that revision, Alice's request confirmed at checkpoint 34617 and Bob's **newly generated** spend confirmed at 34623. The earlier [historical-proof experiment](../tests/live/evidence/2026-09-23/token-delegation-v3-historical-spend.json) also confirmed a pre-request trace after the request.

The current active-only source was deployed as staging contract **48**. Its normalized source SHA-256 is `9f56609190fc49887a226cd0e90233708c7e2723d27ca28a570f222036a43809`. The ordinary two-user lifecycle and immediate refund confirmed. Alice's request for a separate 100-token slot confirmed at checkpoint 34749; a **newly initiated** Bob spend then failed with `channel is not active`. The full 100 was refunded, and state proofs at 34772 show Bob spent 0 from that slot. See [flow transactions](../tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-flow.json), [negative test](../tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-negative.json), and [final state proofs](../tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-state-proofs.json).

On the **same contract 48**, Bob generated a spend proof at checkpoint 34798, Alice's request confirmed at 34807, and Bob's saved proof still confirmed a 40-token spend at 34815. Bob then closed and Alice recovered the remaining 60. [Transaction evidence](../tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-historical-spend.json) and [final state proofs](../tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-historical-state-proofs.json) demonstrate that the active-only guard is not unilateral cancellation.

The [staging verification report](../tests/live/PSY20_DELEGATION_REPORT_2026-09-23.md) records the toolchain mismatch and the exact checks performed.

Contract **46** used an earlier revision with a 60-checkpoint wait. After that wait, its refund also confirmed and state proofs showed the channel cleared. Its [transactions](../tests/live/evidence/2026-09-23/token-delegation-v3.json), [pre-refund proofs](../tests/live/evidence/2026-09-23/token-delegation-v3-state-proofs.json), and [settled proofs](../tests/live/evidence/2026-09-23/token-delegation-v3-settled-state-proofs.json) are kept as historical comparison.

Before production use, change the protocol if unilateral delegation cancellation is required: validate authorization-sensitive remote reads against current leaves at inclusion, atomically with the caller update. Then test concurrent submissions and node-side rejection of stale caller leaves, integrate wallets and indexers, and obtain an independent contract/protocol review. The private v3 path is staging-verified but still requires broader adversarial testing; unilateral allowance cancellation remains unsupported.
