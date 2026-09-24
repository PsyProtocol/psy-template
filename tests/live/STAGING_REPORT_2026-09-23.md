# Psy staging cross-realm and historical-read verification — 2026-09-23

Network: the site's `sepolia` staging configuration (`RPC_CONFIG=/Users/geir/.psy/config.json`). The tests used two newly registered disposable users: **901120** in realm 0 and **1949696** in realm 1. Private keys and full transaction witnesses are excluded from this repository. Public RPC results, balances, state roots, checkpoints, and transaction hashes are in [`evidence/2026-09-23/token-flow.json`](evidence/2026-09-23/token-flow.json) and [`evidence/2026-09-23/stale-read.json`](evidence/2026-09-23/stale-read.json).

## Confirmed live behavior

The already deployed token contract **0** completed a cross-realm round trip. Each balance below came from a contract-state Merkle proof at the recorded checkpoint, with the Felt decoded from the final 8 bytes of slot 0.

| Confirmed checkpoint | Action | Transaction hash | User 901120 balance | User 1949696 balance |
| ---: | --- | --- | ---: | ---: |
| 32282 | Before | — | 0 | 0 |
| 32288 | 901120 claims faucet sender 262144 | `fddedf403e5a96eccb16c6b578acbdc9e45dba4c6a37634e6058d03bab717ee4` | 998999998000 | 0 |
| 32295 | 901120 sends 100000000000 to 1949696 | `7b9e4193465b6b188a820bc783b63cd12e116086fb8c9eda127370a8adf608cb` | 897999996000 | 0 |
| 32303 | 1949696 claims from 901120 | `8817d9dc6eca2729cb6f1eecc624574c4df033d78a9c0b04434c49898fa29174` | 897999996000 | 98999998000 |
| 32310 | 1949696 sends 10000000000 to 901120 | `3020368dda85bc55b692ddf97f984d480fe0a1a11134ec19e8008e7887e6683f` | 897999996000 | 87999996000 |
| 32319 | 901120 claims from 1949696 | `11a6172997b4d1af68be9bc5780ae6840b21312c8ac323b1528d6bd1617d8599` | 906999994000 | 87999996000 |

This confirms registration, transfer, receipt, reverse transfer, and claim across two realms on staging. It does **not** exercise the NFT contract.

## Historical remote read: accepted after sender update

1. User 901120 transferred 20000000000 to 1949696, confirmed at **32361** (`fb11e83c49c67e6e84a3652597617b19519bf68d1187197d00edff6459a23afe`).
2. User 1949696 generated a `simple_claim(901120)` trace anchored at **32362**. Its saved trace SHA-256 was `2d0cca1ded2f6be898b7c6a1c5c03c9e0f6f392b2a4eec285c2229ca91409a6f`.
3. User 901120 transferred another 30000000000 to 1949696, confirmed at **32382** (`ae6ae5629bfd1d07a443cd26798622f72f7138989e45c865c780d01f129b1f85`). The sender's state had changed after the trace anchor.
4. The **unchanged old trace** was proved and submitted as user 1949696. It was **confirmed at 32388** (`16fbe08f65258481ca33d6fcec193b89f5fc55585dadbf0bf7de5320688702b8`). The recipient balance rose from **87999996000** to **106999994000**, a gain of **18999998000** after fees, corresponding to the first transfer's historical state.
5. A newly generated claim was confirmed at **32400** (`f0fa23e7edff246e2373a204c7da8e2d5fbcc9af6de58a7d5faadf5a5a544a60`). Recipient balance rose to **135999992000**, a further **28999998000** after fees, corresponding to the second transfer.

**Protocol conclusion:** staging accepts a historical *remote* read even after that remote user changes state. Local `psy-node` source checks the caller's current user leaf before accepting an end cap (`psy-node/psy_node_common/src/realm/edge/handler.rs`, `start_user_leaf_hash` check), while the client fetches external user proofs at `start_checkpoint_u64` (`psy-node/client_prover/psy_core/psy_data/src/qstore/controllers/proving_session.rs`). The staging node's exact deployed revision was not independently established, and this experiment did not test a stale caller leaf. The experiment does not show duplicate token claims: the recipient's own claimed ledger remained current and the fresh claim only collected the later transfer. It also does not establish safety for NFT ring slots, ACK handling, or delegation.

## NFT staging deployment blocker (legacy `.psy` artifact)

The legacy `nft/src/main.psy` source was copied to a private temporary project and deployment was attempted. The installed `dargo 0.1.0` / `psy_user_cli 0.1.0` toolchain, plus a `0.1.2` toolchain, produced deploy requests rejected by the staging coordinator with **`InvalidParams missing field deploy_contract`**. A locally built `psy_user_cli` from `psy-node` commit `5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6` expects a `CompilationArtifact` object with `circuit_definitions` and ABI; the available `dargo` produces the older method-definition array. A temporary format adapter got past JSON parsing but failed in the CLI's circuit VM with **`Invalid target index`**. The newer CLI's `compile-and-deploy --dry-run` path also cannot compile this `.psy` syntax: **`Unexpected token LBracket at offset 1`**. As a separate check, the live [staging IDE](https://ide-stg.psy-protocol.xyz/studio) compiled its default `HelloStorageContract` successfully, but compiling the repository's NFT source verbatim in an isolated browser project failed at `main.psy:100:22` on `new SetCollectionMetadataEvent {` (`UnexpectedToken`, expected semicolon). The IDE requires a connected wallet to deploy; its default example was not deployed in this test. No NFT deployment was accepted in that initial attempt; the observed `next_contract_id` stayed 35. The staging-compatible v3 source and successful deployment are described below.

## Staging-compatible NFT v3: confirmed deployment and cross-realm flow

The psy_user_cli compiled from psy-node commit 5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6 compiled the new nft/src/main.psy.rs dialect and submitted its CompilationArtifact with deploy-contract --is-deploy. The released 0.1.1 CLI produced a byte-identical artifact for the same source. The test copy changed only ISSUER_USER_ID from template default 5 to the disposable issuer 901120. Contract **44** was included at checkpoint **33161** (deployment hash 0e3775d440a27271a17fd139f3f531a3cb5aed6f6ab08cfd83ee5bf6360f48c6). The transaction record is in [nft-v3-roundtrip.json](evidence/2026-09-23/nft-v3-roundtrip.json).

| Checkpoint | Caller | Action | Result |
| ---: | ---: | --- | --- |
| 33168 | 901120 | Set collection metadata | Confirmed |
| 33174 | 901120 | Mint token 1 into slot 0 | Confirmed |
| 33180 | 901120 | Transfer slot 0 to 1949696 | Confirmed |
| 33186 | 1949696 | Claim from 901120 into slot 0 | Confirmed |
| 33195 | 1949696 | Transfer slot 0 back to 901120 | Confirmed |
| 33202 | 901120 | Claim from 1949696 into slot 0 | Confirmed |
| 33216 | 901120 | Acknowledge 1949696's claim | Confirmed |
| 33226 | 901120 | Transfer same token to 1949696 again | Confirmed |
| 33233 | 1949696 | Claim next FIFO nonce from 901120 | Confirmed |

An intermediate contract **43** proved the first A→B claim but rejected B→A transfer: one nonce_claimed field had been used for both inbound claims and outbound acknowledgements. V3 separates nonce_claimed (inbound) from nonce_acked (outbound). It also uses an explicit acknowledge(recipient) method so recycling never depends on a remote read in the first transfer. The older .psy toolchain and staging IDE remain incompatible with this v3 artifact; the checked CLI deployment path is the verified path.

These nine confirmations verify the ordinary cross-realm round trip and one ACK-assisted reuse. The separate capacity test below covers four pending transfers and ring wraparound. Historical-proof replay and concurrent submissions remain open.

The [NFT state proofs](evidence/2026-09-23/nft-v3-state-proofs.json) also show the slot 0 balance, active flag, and four token ID Felts at each checkpoint:

| Checkpoint | User | Balance | Slot 0 active | Token ID |
| ---: | ---: | ---: | ---: | --- |
| 33174 | 901120 | 1 | 1 | Same four-Felt ID |
| 33180 | 901120 | 0 | 0 | Cleared |
| 33186 | 1949696 | 1 | 1 | Same four-Felt ID |
| 33195 | 1949696 | 0 | 0 | Cleared |
| 33202 | 901120 | 1 | 1 | Same four-Felt ID |
| 33226 | 901120 | 0 | 0 | Cleared |
| 33233 | 1949696 | 1 | 1 | Same four-Felt ID |

The NFT ID remained identical across both users and the repeat transfer. These proofs establish the post-transaction slot states at the listed checkpoints; they do not replace adversarial replay and queue saturation tests.

### Four-slot capacity, rejection, and ring wraparound

On the same contract 44, the issuer ACKed the prior claim at checkpoint 33320, minted token IDs 2 through 6 by checkpoint 33359, and sent four to the recipient at checkpoints 33366, 33375, 33384, and 33392. A fifth send from slot 4 failed locally with the expected FIFO queue-full assertion; no transaction was submitted. The recipient claimed one at checkpoint 33403, the issuer ACKed at 33411, and the previously rejected fifth send confirmed at 33420. The recipient claimed the remaining four in strict FIFO order at checkpoints 33430, 33449, 33456, and 33463. The final ACK confirmed at 33471. The last four claims and ACK used the published 0.1.1 CLI.

The [capacity transaction record](evidence/2026-09-23/nft-v3-capacity.json) and [full state proofs](evidence/2026-09-23/nft-v3-capacity-state-proofs.json) show:

- Issuer balance 5 after minting and 0 after all five transfers.
- Recipient balance 6 after claims: the earlier token plus all five new tokens.
- Each of the five recipient slots contains the same four-Felt token ID and metadata as its corresponding issuer mint slot; all five issuer slots are inactive.
- Queue slot wraparound preserved the unclaimed entries and allowed reuse only after ACK.

This verifies the capacity path in sequential staging transactions. It does not exercise a deliberately stale NFT proof or concurrent callers.

### Historical NFT remote read and stale local anchor

The issuer sent token 7 to the recipient at checkpoint 33529. The recipient generated a claim trace for slot 6 anchored at **33530**, then the issuer minted and sent token 8 at **33598**, changing the remote outbox. The recipient proved and submitted the unchanged old trace; it **confirmed at 33619**. A fresh claim for token 8 confirmed at **33629**, followed by ACK at 33637. Thus staging accepted an NFT claim whose remote sender proof was historical at submission.

A second trace, generated before the first claim from the recipient's unchanged local state but targeting slot 8, was rejected by the 0.1.1 CLI after the first claim: **stale trace anchor: start_user_leaf_hash changed while proving**. It was not submitted to the node. This verifies the client's local-anchor check, while the node-side current-caller-leaf check remains a source-code finding rather than a second live rejected-proof experiment.

The [historical NFT transaction record](evidence/2026-09-23/nft-v3-historical-read.json) includes both trace anchors and hashes. [State proofs](evidence/2026-09-23/nft-v3-historical-state-proofs.json) show recipient balance 7 after the old claim and 8 after the fresh claim. Slot 6 matched token 7's minted ID and metadata; slot 7 stayed empty until the fresh claim, then matched token 8; slot 8 remained empty. The issuer balance and both sent slots were zero. This demonstrates ordered ownership for this stale-read sequence, not a proof that every possible historical NFT read is safe.

## Next release gates

1. Pin the released 0.1.1 CLI and align staging IDE/psyup deploy with its .psy.rs artifact and deploy request.
2. Run adversarial historical-proof variants, recipient-full, and concurrent-submission cases in PRODUCTION_READINESS.md. Distinguish client-side stale-trace rejection from node-side consensus enforcement.
3. Define the protocol's historical-read policy. If historical reads remain valid, prove and test contract invariants under stale sender and recipient proofs, especially NFT queue reuse and delegation revocation. Keep delegation gated until then.

Reproduction scripts: [`staging_wallets.py`](staging_wallets.py), [`staging_token_flow.py`](staging_token_flow.py), [`staging_stale_read.py`](staging_stale_read.py), and [`staging_nft_flow.py`](staging_nft_flow.py). They require two funded staging users and a compatible CLI. `staging_stale_read.py` asserts transaction ordering, trace identity, and the two balance increases after execution.
