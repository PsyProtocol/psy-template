# Checkpoint stream profiles

Two profiles intentionally coexist. Their commitments and keys are not
interchangeable.

| Profile | Entry points | Financial authority |
| --- | --- | --- |
| v1 component preparation | `executor/checkpointStream.mjs`, `executor/finalStateStream.mjs`, original `checkpoint_stream.rs` | Disabled; standalone source/ordering evidence is not a spending authorization |
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
