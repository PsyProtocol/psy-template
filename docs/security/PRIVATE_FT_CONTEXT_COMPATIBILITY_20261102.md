# Private U124 compiler and complete claim UPS — 2 November 2026

## Closed application-side gaps

The selected mainnet-beta SDK remains exactly
`01b8f2b0a077367a7b9879baba1a72aea8ab5510`, with client/compiler
`7058070057c3242b5d8b29e1a31d498aaa4202c0`. All 2,759 frozen source members
match the original manifest. No SDK or Node source was patched. No account,
browser session, existing contract or financial request was modified.

The frozen frontend lacks `checkpoint_user_tree_root` and
`session_proof_tree_root`, although its VM and circuits already implement the
required operations. The new application-owned
[compiler adapter](../../token/compiler/private_context.rs) lowers those two
calls into the existing `GetGlobalStateRoots` command and
`GetSessionProofTreeRoot` opcode. The checkpoint command uses the actual claim
ABI input 10; all four user-root limbs are read from authenticated result
offsets 8–11 and compared with ABI inputs 6–9. Neither a supplied root nor a
temporary frontend marker is accepted as authentication.

The adapter validates both IRs, rebases typed Hash/array and command-result
indices, preserves the original ABI/assertions/events/state commands and their
timing, and regenerates every function's bytecode from the final IR. It refuses
unknown composite consumers, missing/duplicated marker readers and checkpoint
substitution. Failed lowering leaves its input unchanged. Linked Endcap identity
is checked independently. This is an explicit application compiler profile,
`private-context-dpn-v2`; the raw upstream frontend is still unsupported.

## Complete UPS exposed an additional ABI limit

The former 151-word private claim compiled and passed VM checks but exceeded the
frozen SDK's **128-word** transaction-introspection capacity in a complete UPS.
The new compact-v2 ABI uses **86 words**: the original 21-word bound prefix plus
one 65-word Merkle path. It does not raise a protocol limit or split one claim
into two independently credited calls.

For two nonzero denominations, low/high native proof leaves form an aligned
sibling pair. The contract recomputes each leaf from the fixed native verifier
fingerprint and its complete denomination-specific public-input hash. It
requires an even low index and the exact high leaf as sibling zero, then folds
the complete path to the authenticated session root. Both nullifiers are
consumed and both balance limbs are credited atomically. A single nonzero limb
uses its complete path and requires a zero inactive nullifier.

The client appends all native proofs before reading paths. If the first low
index is odd, it inserts that same verified proof again to align the pair. This
uses one additional proof-tree insertion, not another native note proof or an
invented padding leaf. Interleaving, capacity exhaustion and inconsistent final
roots stop preparation. Session access still requires serialization. The
explicit historical `legacy-v1` encoder is never a compatibility fallback.

All 21 other compiled methods, including the 20 public U124 methods and
`private_transfer`, are identical to the preceding application-adapter artifact.
State fields/layout and height 32 are unchanged. The private-note verifier
fingerprint is unchanged. **The claim ABI and code identity changed:** deploy a
new instance/key/resource pack after live gates; do not update old contracts.

## Actual validation and preserved failures

| Layer | Result and scope |
| --- | --- |
| Selected toolchain/build | Real offline/locked native build; all 22 methods compile; exact binary/source hashes retained. |
| Compiler rejection tests | 2 passed, including wrong checkpoint, marker shape, reader offset and absent authentication; raw frontend still fails as expected. |
| JavaScript/client/artifact tests | 11 passed, zero skips, using the actual corrected artifact. Includes paired paths, odd-index alignment, interleaving/capacity refusal and explicit legacy encoding. |
| Bytecode/native/gadget tests | 5 passed, one separately selected ignored UPS test. Real native proofs and exact assertion gadgets verify; mutated amount/denomination/checkpoint/recipient/session/path, replay, U124 overflow/range and tree-capacity failures leave state unchanged. Both CFCs build at production height (transfer degree 14, claim degree 12). |
| Complete ordinary claim UPS | Passed with actual CFC, recursive session, ordinary signature, exact fee burn, Endcap, independent fixed verifier/common data and public-endpoint binding. |

The complete proof credits `1000000000000000000000000123` base units, with both
limbs nonzero. The fixture's Native debit is exactly `1000005000` base units;
both Native and token conservation checks pass. There are exactly two calls:
private claim and Native burn. The signature key is ephemeral and never saved.
The source note is created by actual transfer bytecode in synthetic setup, not
by a transfer UPS. Checkpoint 100/user 300/issuer 5 are **synthetic identities**.
There is no network confirmation, real fee expenditure or browser payment.

Failures were retained, not replaced with passing artifacts:

1. Historical fixtures initially omitted three current `ExecutionContext`
   fields; a separate build also lacked the SDK trait import for `get_leaf_sfc`.
2. The old gadget oracle used hardcoded command positions. It now dispatches
   by actual command type after the authenticated root command is inserted.
3. The 151-word complete UPS fails the actual 128-word SDK limit.
4. The first compact draft's conditional Hash assignment did not preserve the
   desired value in this frontend. Actual bytecode/gadget tests rejected it.
   The corrected source computes both leaves and uses a constrained boolean
   Felt selector; the corrected artifact passes all layers above.
5. A compact complete attempt generated its Endcap but the independent verifier
   rejected missing `PSY_MARKET_TESTNET_PROFILE`. The test now checks that guard
   before proving; the final attempt uses the exact explicit SDK profile.

The two local cases are `private-context-compat-20261102-v1` and
`private-context-compact-20261102-v2`, under the external recovery directory
`psy-market-recovery-20261023`. Raw logs, failed sources, compiled artifacts,
complete request and original plans stay there, outside Git. The compact
[evidence index](PRIVATE_FT_CONTEXT_COMPATIBILITY_20261102.json) records hashes,
commands/results, failures and scope. No secret witness or recovery file is
included. Proof resources/archives are not added to Git.

## Cost, reproduction and remaining boundaries

The successful complete fixture takes **86.237 seconds** inside the test,
**87.339 seconds** for the supervised process. Its 1-second sampled sum of
process-family RSS peaks at **1,355,120 KiB**. Shared pages are counted, short
peaks may be missed, and this is not physical peak memory. The prior complete
attempts took 59.031 seconds (151-word limit failure) and 85.314 seconds
(missing-profile failure). These different failed paths are not matched
performance baselines. No warm-state, live throughput or speedup claim follows.

Use the [selected build/test instructions](../../token/wide/private/README.md),
the immutable source manifest and fresh external output paths. Default VM/UPS
npm entries now require the selected application manifest; the old sibling
entry is explicitly named `:legacy`. The generated build report intentionally
continues to say `fullUpsVerified: false`: compilation alone does not acquire
the separate acceptance result. Review the artifact hash against this cohort.

The toolchain was built before the scalar-selection source correction; it
compiles the corrected source at runtime. Its embedded source fixture is used
only by compiler unit tests, not by compilation or the claim proof. The public
record separately binds the corrected artifact, final harness source and actual
test binary. A fresh preparation includes the current fixture and harness.

The application-side missing-intrinsic and calldata-limit blockers are closed
for this offline ordinary-claim cohort. Upstream may later add the two frontend
intrinsics with the same authenticated semantics and differential IR/proof
tests; that is not required for this adapter and must not be selected silently.
Remaining live gates are new issuer/chain identity, deployment/registration and
instance-specific key/resources, a current private-transfer UPS, ordinary
wallet/MCP compact-ABI integration, real transfer/claim receipts and browser
approval/recovery acceptance. Legacy single-Felt/private-claim encoders cannot
be reused automatically. No production or live-UI conclusion is asserted.
