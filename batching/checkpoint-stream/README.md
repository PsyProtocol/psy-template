# Checkpoint stream profiles

Five profiles intentionally coexist. Their commitments and keys are not
interchangeable.

| Profile | Entry points | Financial authority |
| --- | --- | --- |
| v1 component preparation | `executor/checkpointStream.mjs`, `executor/finalStateStream.mjs`, original `checkpoint_stream.rs` | Disabled; standalone source/ordering evidence is not a spending authorization |
| paired terminal refund stream (policy version 7) | `pair-generate.mjs`, `pair-build-policy.mjs`, shared `stream_*.rs` | Distinct offline Orderbook/NFT candidates; trading and live authorization disabled pending global paired trading frontier |
| paired global frontier (policy version 8) | `pair-trade-generate.mjs`, `pair-trade-build-policy.mjs`, `pair_frontier.rs`, shared `stream_*.rs` | Distinct offline Orderbook/NFT trading candidates; complete-source scan and actual fills/refunds proved; live authorization remains disabled |
| paired triangular frontier and early recovery (policy version 9) | `pair-optimized-generate.mjs`, `pair-optimized-build-policy.mjs`, conditional triangular builder in `pair_frontier.rs` | Distinct offline candidate: exact unordered-pair coverage and current-invalid winner refunds; live authorization remains disabled |
| v3 source-covered deterministic priority stream | `generate.mjs`, `build-policy.mjs`, `stream_{source,context,current,order,policy}.rs` | Distinct undeployed candidates; complete synthetic-checkpoint UPS validation is tracked in the report below; live driver remains disabled |

For v3, use `prepare-fixtures.mjs REVIEWED_INPUT FRESH_OUTPUT`, the frozen
application-owned `compile_stream_market` compiler wrapper, and
`build-policy.mjs FRESH_OUTPUT`. The helper copies reviewed funding artifacts
and generates only new AMM/Curve source; it does not modify its input, switch
SDKs, deploy, register, sign or broadcast. A failed output is preserved; use a
new directory for a corrected build.

The v3 declaration has policy version 5 and profile
`source-covered-priority-stream-v3`. Source scope version 3 is distinct from v1.
Do not change an old scope/version flag to make its proofs appear compatible.
Commitments are stored in four scalar Felt slots to avoid unaligned Hash getter
addressing in the frozen compiler. Incoming Hash arguments remain four exact
Felt values; all comparisons and commitments are retained.

See [the source-covered UPS report](../../docs/security/SOURCE_COVERED_STREAM_UPS_20261029.md)
for the source-set definition, state machine, priority/minimum proofs, current
identity checks, timeout/refund boundaries and evidence. Random ordering remains
disabled. Orderbook price/time priority and NFT winner semantics are unchanged.

See [the paired-market boundary report](../../docs/security/PAIR_SOURCE_STREAM_UPS_20261029.md)
for authenticated NFT FIFO/source terms and two-member terminal refund pages.
It describes the earlier v7 boundary; v8 does not change its keys or enable v7
trading. A source-time refund queue must not be
used as Orderbook price priority or NFT winner selection.

See [the global paired frontier report](../../docs/security/GLOBAL_PAIR_FRONTIER_20261029.md)
for the v8 continuation. `pair-trade-prepare-fixtures.mjs REVIEWED_INPUT FRESH_OUTPUT`
creates new candidate source; compile it with the frozen `compile_stream_market`
wrapper, then run `pair-trade-build-policy.mjs FRESH_OUTPUT`. All outputs must be
fresh. Source checkpoint scope and remaining-root commitments are preserved.
Four comparisons per SCAN UPS are a page bound, not an epoch order-count cap.
The complete Cartesian scan is O(N²) per fill and may outlast the fixed source
window. This is not a scalable live-service claim or admission/finality proof.

`pair-frontier-reference.mjs` is an independent BigInt reference, and
`audit-global-pair-evidence.mjs` checks archived structure and reference winners.
Neither authenticates a source snapshot, verifies a cryptographic proof, signs,
broadcasts, or authorizes the financial Executor. Use the native full-UPS tests
and fixed verification resources described in the report for proof acceptance.

The [v9 continuation](../../docs/security/TRIANGULAR_PAIR_RECOVERY_20261029.md)
uses `pair-optimized-prepare-fixtures.mjs REVIEWED_INPUT FRESH_OUTPUT`, the
existing audited `compile_pair_stream_market` wrapper (payment/collection order
for NFT), then `pair-optimized-build-policy.mjs FRESH_OUTPUT`. It does not change
the v8 compiler output or key. Every unordered pair is authenticated once and
oriented by its committed side/kind; exact price/time and NFT priorities remain.
An early one-member refund requires both the stored best certificate and actual
current invalidity. Normal expiry refunds still require canonical minima.
`audit-optimized-pair-evidence.mjs` is a structural/BigInt reference audit only.

## Dependency, source and budget readiness

See [the current readiness report](../../docs/security/PAIR_LIVE_READINESS_20261029.md).
`collect-source-inventory.py REVIEWED_NATIVE_DRIVER FRESH_OUTPUT` captures bounded
read-only account proofs and invokes the frozen native verifier after each path.
`--resume OLD_DIRECTORY` revalidates the exact transcript at the same checkpoint
and root into a fresh directory; it never changes the source after observing it.
Transport recovery is opt-in, exact-read-only and bounded (one retry per request,
sixteen total); semantic RPC, route, root, proof and budget failures stop capture.
Incomplete prefixes
are not complete source sets or authorizations. The library is shared with the
existing `final_state_capture` collector, including its unchanged eligibility and
funding checks.

`bind_native_artifact` reconstructs full native bytecode, canonical layout and
all function fingerprints, and verifies its leaf membership under a pinned
contract root. This does not authenticate checkpoint finality or a future upgrade.
The source verifier exports `earliestEligibleDeadline`; the Executor's
`planPairBudget()` obtains counts/deadline from that verified output. Caller
cost assumptions cannot substitute a smaller eligible set. Planning readiness
cannot sign, broadcast or remove the offline-only key gate. The v9 window is
still C+32; an unfit plan stops, rather than changing a sealed epoch or key.
