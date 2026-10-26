# Bounded large-amount AMM candidate

Historical v1 deployed 2026-10-12 as contract **2425**, SD-key vault **317504**.
Actual refund proving exposed uninitialized pUSDT reads; full UPS acceptance had
not passed. The corrected `v2/` candidate was not deployed at that milestone.
Both use PSY 0/pUSDT 4 and bound each reserve, input and total LP supply by
`1_000_000_000_000` base units: **1000 PSY** at nine decimals, 100000 times AMM
1758's 0.01-PSY cap. Convert pUSDT using its actual precision. This is bounded,
not unlimited or production-ready.

## Implementation

- `generate.mjs` pins original source SHA 256 and generates auditable straight-line
  code; `--check` checks reproducibility only.
- `contract/src/main.psy.rs` uses four base-`2^28` digits to verify swap quotes,
  initial LP square root, additions and withdrawals. No new witnesses/state fields.
- `quote.mjs` uses matching BigInt limits/formulas; additions require exact ratio.
- `operationCalls.mjs` uses candidate bounds; legacy calls retain the 10000000 cap.
- `artifactGate.mjs` checks 22 fields, 14 methods, parameter counts and IR consistency.
  It still returns `deploymentReady: false`; this is not deployment-proof verification.
- `vm-tests/` uses adjacent Node compiler/VM libraries without modifying Node.

### Integer constraints

For `a,b < 2^56`, split each into two 28-bit digits and multiply with column carries.
Each column stays below `2^58`, under Goldilocks; four normalized digits preserve
112-bit products and compare high to low. Field division by 268435456 is applied
only after subtracting extracted low 28 bits, when integer divisibility is proven.
It is not a general integer-floor operation.

Swaps retain `out * denominator <= numerator < (out + 1) * denominator`.
Denominator remains below `2 × 10^16`; full numerator/products use integer
comparison. Private function returns have a compiler issue, so code is inlined
without invoke_sync.

## Reproduce

From repository root with adjacent psy-node, the pinned Rust toolchain/cache:

```sh
node amm/wide/generate.mjs --check
npm run build:amm-wide -- /private/tmp/amm-wide-candidate-new
AMM_WIDE_ARTIFACT=/private/tmp/amm-wide-candidate-new/compilation_artifact.json npm run test:amm-wide
AMM_WIDE_ARTIFACT=/private/tmp/amm-wide-candidate-new/compilation_artifact.json npm run test:amm-wide:vm
npm run test:exchanges
```

Output must be new. `CARGO_TARGET_DIR` can isolate build cache.
`verification-2026-10-11/compiled-final/` is the saved default local fixture.

## Evidence and remaining deployment gates

128 random VM swaps plus invalid quotes, bounds, wrong payment/payer, replay,
initial square root and LP add/remove boundaries compare against independent
u128 calculations. Production DPN opcode circuits prove/verify the same arithmetic
and reject wraparound forgeries. Full swap/add/remove CFCs build without target
conflicts. **Arithmetic proofs and CFC construction do not replace full state CFC/
UPS proofs or actual transactions.** Before deployment:

1. Rebuild against clean reviewed dependencies; the historical local Node had
   other uncommitted changes recorded in provenance.
2. Recompute code/layout roots; independently verify empty→22-field layout proof.
3. Use new contract ID/vault and recompute/register matching fingerprint.
4. Prove exact actual-state artifacts, rescan and reconcile actual PSY/pUSDT funds.

Each operation still escrows `1_000_100_000` native units; fees are not reduced.
Upgrade authority, partial fills, multiple orders, global discovery and independent
audit remain separate work. See [local report](verification-2026-10-11/REPORT.md).

## 2026-10-12 actual-state follow-up

v1 inclusion, roots and registration are verified. Only the new test wallet's
policy was extended with user authorization; the three old policies were unchanged.
PSY refund failed full UPS preflight before broadcast. VM witness confirmed the
inactive pUSDT read and zero-leaf/empty-root mismatch.

v2 changes only swap/refund branch reads from fixed 4 to constrained `asset` 0/4.
Actual-state full refund CFC, four VM tests and initial layout verification pass;
this is not full UPS/swap acceptance. Some LP refund/close still needs initialized
payer pUSDT state. The fixed SDK package has a commit baseline plus three hashed
existing session-binding patches, not a clean upstream release. All 1892 inputs
rechecked unchanged; shared Node/services unchanged. [Funding/failures/gates](deployments/staging-2026-10-12/REPORT.md).
