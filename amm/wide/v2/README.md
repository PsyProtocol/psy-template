# Candidate fix: uninitialized asset-partition reads

Historical candidate status: not deployed. `compiled-v2` was an initial attempt,
not the final candidate. Final source `contract/src/main.psy.rs` SHA 256:
`bb0c5b6c5dd9b1ad128618b0145ab2785550d1bd331bfacab29c648aa75c3975`.
Code root: `4c959661f636981349452f346ea39e276d42c3f47dc427ee50a7aee9e864bfb6`.
Layout remains 22 fields/14 methods; amount bounds and payer constraints remain.

Only swap/refund_unclaimed pUSDT-branch reads use `asset`, already constrained to
0/4 at entry. The compiler emits inactive-branch reads too; PSY now reads its own
partition while pUSDT still reads pUSDT.

Actual new-wallet full refund CFC proves/verifies; old source fails on the same
state due to zero contract leaf versus empty-tree-root mismatch. Four VM tests
and independent initial layout proof pass, but full UPS/actual swap remain pending
at this milestone. Some LP refund/close paths still require initializing both
asset partitions; unpaid-asset checks were not bypassed.

Reproduce: `node amm/wide/v2/generate.mjs --check`. Final artifacts/proofs:
`../deployments/staging-2026-10-12/compiled-v2-final/`.
