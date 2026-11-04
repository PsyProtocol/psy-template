# Production-candidate continuation — 4 November 2026

## Actual changes

The current mainnet-beta SDK remains frozen at
`01b8f2b0a077367a7b9879baba1a72aea8ab5510`, client
`7058070057c3242b5d8b29e1a31d498aaa4202c0`. No Node, dependency, old contract,
browser session or wallet import was changed. There were no financial actions.

The private FT now has a complete ordinary **transfer UPS followed by a complete
ordinary claim UPS** on synthetic checkpoints. This extends the preceding
[claim-only cohort](PRIVATE_FT_CONTEXT_COMPATIBILITY_20261102.md); its existing
successful proof was preserved. The new claim re-verifies the exact saved
transfer under the fixed Endcap verifier/common data, checks public endpoints,
artifact identities, amount, source user/nonce/checkpoint, and requires the
source end-state root to equal the independently executed transfer-bytecode
state, including its actual Native fee debit. It installs that exact source
end leaf at the next synthetic checkpoint before generating both note proofs.
It does not substitute an unverified report flag for the source proof.

Both proof requests use ordinary ephemeral signing keys that are never saved.
The transferred and claimed amount is `1000000000000000000000000123` base
units, with both U124 limbs nonzero. The sender retains 9 base units and the
recipient receives the exact amount. Both note-tree endpoints match the actual
transfer bytecode. Native fee conservation and final state/nonce checks pass.
The artifact is unchanged: `b7f4a9f4…0f6e22fa91`, compact claim 86 words.

Saved proofs were then re-verified without regenerating them. Two complete-proof
public-input substitutions and eight request endpoint/fee substitutions reject.
That is separate from the earlier VM/gadget amount, recipient, range, overflow,
checkpoint, path and replay checks. This cohort does not add independent wallet
approval-stack acceptance for the private-FT path or network finality.

## NFT startup failure and formal Executor protection

The November 2 paired cohort completed all **13 Orderbook vault UPSs**, then
failed during the first NFT bootstrap's `get_api_input()`. Its log shows valid
Endcap/fixed verification before export failed with:

```text
contract state changed without a recorded update for contract_id=41
```

No complete NFT request/acceptance report was exported. The failed 3,170-second
pair process must not be presented as 28 passing proofs or a running task.
Original Orderbook proofs and NFT failure files are unchanged and not rerun.

A new no-proof minimal test reproduces the same frozen-SDK API boundary:

| Initial contract state | Operation | Export result |
| --- | --- | --- |
| Absent user-contract root | First use ending with only zero slot values | Rejected with the exact contract-41 error |
| Authenticated materialized empty root | Zero-only write | Accepted; no state deltas |
| Absent user-contract root | Actual first nonzero write | Accepted; verified contract-root delta |

The minimal fixture uses height 32 and the actual session-store API; it is not
an NFT CFC proof. The preserved paired failure uses the actual candidate NFT
bytecode. The first minimal attempt omitted required checkpoint/user/block
metadata and failed before reaching this boundary; that failure is retained.

The formal funded Executor now checks this unsupported NFT bootstrap path
**before UPS start/proving**. Existing accounts require a contract-root Merkle
proof matching the approved start leaf; an RPC claim that the collection is
materialized is insufficient. Fresh/absent collection state receives the stable
`SDK_FRESH_ZERO_ONLY_CONTRACT_EXPORT` error. Existing materialized state and
other market, refund and exit modes are not rejected by this new guard.
The guard's native regression and actual funded-driver build pass. A new driver
binary still needs its own exact release/registry identity before live use.

This protection does not make new NFT bootstrap work and does not prove all
existing-state paths work. It prevents wasting proof work on a reproduced
unsupported transition; it does not authorize prefunding or fake prior state.

Two remedies require separate review:

1. **SDK-side remedy:** in frozen source
   `client_prover/psy_core/psy_data/src/qstore/controllers/proving_session.rs`,
   `get_call_start_data` normalizes an absent contract root to the height-specific
   empty root, while `get_all_state_updates` drops unchanged slot writes and
   rejects the changed parent root. Upstream must provide an explicit, verified
   initialization delta representation, exact fees, and linked start/end roots.
   Acceptance must cover absent/materialized state, heights 30/31/32, repeated
   exports, zero-only/net-zero/first-nonzero writes, and full CFC/UPS/receiver
   behavior. Node acceptance must be demonstrated without assuming a Node change.
   No frozen SDK patch or migration is performed here.
2. **Application-side alternative:** a separately versioned NFT bootstrap/key
   could omit the unneeded zero-only acknowledgement before any NFT transfer.
   Ordinary buyer preparation has a similar first-use acknowledgement to review.
   This must use a new exact call stack/key/resource identity and complete
   startup/trade/claim/refund tests. Silently editing the existing v19 key,
   adding arbitrary padding writes or preloading a fake NFT root is not a fix.

## Wallet verification and runtime observations

The two existing uncommitted audit-SDK WASM acceptance adapters were reviewed
and completed: explicit audit versus historical SDK/network selection, and an
optional exact embedded union resource pack for first-session acceptance. They
were run once with recorded current script/module hashes against **preserved**
ordinary-market and first-session proofs. Both actual WASM verifications pass,
including capsule/public projection checks and 6 + 8 mutation refusals. No
replacement proof or browser origin was generated. These adapters are test
entry points; a page still cannot select verification resources for the wallet.

On November 4 at 12:17 Asia/Taipei, nine bounded, TLS-verified read-only calls
all succeed. Both realms and the coordinator report head 29722. Checkpoint-1
anchor remains `81bac993…f96b5c`; complete Native leaf and runtime resource bytes
are identical to the November 2 capture. The faucet is enabled and advertises
`1000000000000` base units without Turnstile. No faucet claim was made. This
observation does not settle an old unknown request or attest running binaries,
upgrade authority, checkpoint finality or seed publication timing.

The wallet source branch is unchanged. Its selected SDK has
`add_external_proof_json` and `insert_external_proof_json`; those are not missing.
It does not provide the wallet's proposed `verifyPrivateFtPacket` adapter, and
the existing compiled wallet public verifier has not accepted private external
proof leaves or compact-v2 claims. Completing this needs an application-owned
fixed-resource packet/trace verifier and non-broadcast preparation/signing path,
or separately reviewed upstream interfaces. Merely declaring the missing method
or using the legacy atomic sign-and-submit API would bypass the required wallet
approval/persistence/exact-broadcast boundary. New private-FT wallet writes stay
closed. Actual extension installation/approval is still unaccepted, and the
other task's pending import is untouched.

## Cost and reproducibility

| Sample | Internal complete fixture | Supervised process | Sampled family RSS peak | Synthetic fee, base units |
| --- | ---: | ---: | ---: | ---: |
| Private transfer | 72.516 s | 73.587 s | 1,826,480 KiB | 1,000,045,000 |
| Claim from that exact source | 80.100 s | 80.874 s | 1,602,576 KiB | 1,000,005,000 |

The two sequential process times total 154.461 seconds. This is not a matched
optimization comparison, network confirmation, recipient arrival time, p95 or
TPS. Source/claim processes each construct resources; there is no warm-process
claim. RSS is sampled every second, includes shared pages and may miss peaks;
it is not physical footprint. Actual PSY expense is zero.

The [evidence index](PRODUCTION_CONTINUATION_20261104.json) binds commands,
results, source/binary hashes, exact requests and retained failures. Raw files
remain outside Git in `psy-market-recovery-20261023/production-private-market-20261104-v1`.
No private keys, mnemonic, secret signing witness or large proof/source archive
is uploaded. Original plans and the zero-finance budget are retained; the later
formal-guard phase explicitly adds two bounded native build commands and no
proofs or money. Two new complete UPSs were generated; all subsequent crypto
checks reuse preserved proofs.

See [private FT reproduction](../../token/wide/private/README.md). Select
`full_ups::private_transfer_complete_ordinary_ups`, then
`full_ups::private_claim_from_transfer_complete_ordinary_ups`, with new
`PRIVATE_COMPLETE_UPS_OUT` directories and `PRIVATE_SOURCE_TRANSFER_OUT` set to
the first output. `PRIVATE_LINKED_CLAIM_OUT` enables the exact saved-roundtrip
negative test. Keep the explicit SDK/profile/source manifest and current Native
artifact. Synthetic source application is not a network receipt.

## Unclosed acceptance boundaries

- New isolated actual-chain assets, contracts, vaults, keys and wallet resources;
  real settlement, ordinary-wallet claim, refund and exact recovery receipts.
- The NFT first-use remedy and the remaining NFT paired flow; Orderbook actor
  funding/order/claim prerequisites remain VM setup, not ordinary signatures.
- Private-FT wallet packet/trace integration, live issuer identities and resource
  packs. General live market dependency guards have not accepted the new private
  height-32 profile as an automatic asset substitution.
- Four-market UI wallet approval/broadcast/claim and fault acceptance; existing
  actual WASM checks are public synthetic checks, not an installed extension.
- Current SDK/chain double-pool workflow acceptance, then Book-to-AMM. Cross-UPS
  state, nonce, confirmation and claim dependencies remain explicit.
- Qualified future randomness, authenticated seal-before-publication/finality,
  global admission/censorship boundaries, sustained operation and matched
  cold/warm performance. Deterministic ordering remains the safe default.

This closes specific proof and early-failure gaps. It does not establish
production readiness, global fairness or cross-vault atomicity.
