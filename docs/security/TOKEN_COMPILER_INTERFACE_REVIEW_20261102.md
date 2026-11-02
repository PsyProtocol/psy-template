# Token compiler interfaces — 2 November 2026

## Finding

The screenshot shows the legacy `.psy` language used by `token/src/main.psy`
and its dApp copy. Its event expression `new SetMetadataEvent { ... }` and
`PsyTokenContractRef::new(ContractMetadata::current())` construct different
types. They are both accepted together by the installed legacy `dargo` 0.1.0.
Replacing the event expression with `SetMetadataEvent::new(symbol, decimals)`
fails with `Unresolved member new`. A mechanical replacement would introduce
a bug, rather than migrate the contract.

This does **not** establish compatibility with the selected audit SDK. The
audit compiler uses the separate `.psy.rs` contract language, including
`#[contract_implementation]`, `&mut self`, `ChainContext` and
`psystd::emit_event`. Recent four-market UPS cohorts exercised those candidate
sources and cannot certify the legacy token template or its dApp copy.

## Fresh measured checks

All 2,759 frozen source members were rechecked against
`batching/dependencies/audit-20261102/manifest.json`, with no source patch or
dependency change. Selected SDK: `01b8f2b0a077367a7b9879baba1a72aea8ab5510`;
client/compiler: `7058070057c3242b5d8b29e1a31d498aaa4202c0`.

The existing `compile_composition_token` executable was identified by binary
hash and its Cargo fingerprint's `sdk-audit-v1` feature. It calls the actual
`psy_compiler::compile` before its additional U124 layout gate. Each probe used
a fresh external output path; existing artifacts were not overwritten.

| Source / probe | Actual result | Meaning |
| --- | --- | --- |
| Legacy event literal plus contract-reference constructor | Legacy smoke test passed; event data `[1, 9]` | The two constructor forms are valid together in that older language. This is a small synthetic test, not the full production contract. |
| Legacy event replaced with `SetMetadataEvent::new(...)` | Rejected: `Unresolved member new` | The event type does not expose that constructor in this legacy toolchain. |
| `token/src/main.psy` through audit compiler | Rejected: `Unexpected token LBracket at offset 1` | The old source language is not an audit SDK input. |
| `token/src/main.psy.rs` through the same compiler wrapper | Reached U124-specific layout guard, then rejected | Parsing/compilation succeeded; this single-Felt profile is not the wrapper's height-31 U124 profile. This is not a parser/API failure. |
| `token/wide/src/main.psy.rs` | Compiled all 20 methods, layout gate passed | Actual audit compiler success for the public U124 source; not a fresh UPS or network acceptance. |
| `token/wide/private/src/main.psy.rs` | Rejected: `Unknown function: psystd::checkpoint_user_tree_root` | The private profile still depends on an intrinsic absent from the frozen audit compiler. It cannot be declared fully migrated or released on this evidence. |

The compiler probe and legacy control commands/results, source and binary
digests are recorded in [the compact observations](TOKEN_COMPILER_INTERFACE_REVIEW_20261102.json).
Full logs and generated artifacts remain outside Git in the local
`token-interface-review-20261102-v1` recovery case. A failed probe was retained;
no failed source was silently substituted.

## Coverage correction and next boundary

- Keep the legacy templates explicitly separate from current audit candidates.
  The legacy `token` package's `build` and `test` commands are historical
  toolchain paths; passing them must not satisfy an audit SDK release gate.
- Do not replace a complete/private token with a public-only source to make a
  compatibility check pass. The public and private profiles have different
  methods and layouts and require explicit deployment identities.
- The audit private profile needs a separately reviewed application adaptation
  or an upstream-supported checkpoint authentication primitive. Do not delete
  its checkpoint-root or note/session binding checks to make it compile.
- The existing `token/wide/build.mjs` remains the explicit public-U124 builder.
  It accepts a selected compiler via `TOKEN_WIDE_COMPILER`, requires a fresh
  output path and issuer binding, and checks the compiled ABI. It does not
  certify private methods or on-chain deployment.

No Node, SDK, market, existing deployment, wallet session or financial request
was modified. Four compile probes and two legacy smoke invocations were run;
no audit UPS or live transaction was generated. The legacy `dargo test`
automatically constructs/proves internal compression circuits even for this
small smoke case. Those observed internal proofs correct the initial plan's
zero-proof assumption; they are not audit/full-UPS acceptance and were not
followed by further proof work.
