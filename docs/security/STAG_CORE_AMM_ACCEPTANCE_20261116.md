# Fresh stag AMM acceptance — 16 November 2026

The new isolated case has passed current-chain resource checks and application
approval regressions. Real market settlement, final ordinary claims and browser
acceptance remain open. This report does not replace the preserved unresolved
sponsor request from the preceding case.

## Reproducible tools and application fixes

The selected mainnet-beta SDK remains `01b8f2b0a077367a7b9879baba1a72aea8ab5510`,
client `7058070057c3242b5d8b29e1a31d498aaa4202c0`. All 2,759 restored SDK source
files and the existing Cargo lock were checked. No Node or dependency source
was edited. The historic application profile name `sdk-audit-v1` still selects
this freeze. Existing Go 1.26 is selected through the process PATH; the inherited
Go 1.14 could not build the pinned upstream FFI dependency.

Ordinary approvals now bind the actual SDK registration/session, user, public
key, raw starting leaf and full next nonce before business proving and signing.
The complete proof and final endpoints remain verified. A successful explicit
current nonce read and same-checkpoint raw user-tree Merkle membership supplement
the SDK status helper, which otherwise has a nonce-one fallback on read failure.
First-use approval additionally requires the authenticated raw zero leaf and
actual SDK new-user context. Observed checkpoint roots are not independently
certified finality.

The formal fresh-case runner requires these Native reports, exact ordinary
plans and original journal task/proof identity. Modified calls, actors, amounts,
recipients, quotes, deadlines or pins fail closed. Changed restart terms require
review; this change does not silently rewrite or re-sign saved requests. A pinned
optional journey plan allows the initial draft to remain untouched.

## Evidence and bounded live plan

[Compact gate evidence](evidence/STAG_CORE_AMM_GATES_20261116_v1.json) records
six executed Native unit tests, 21 host regressions, binary digests, current
Native/resource checks and retained failures. These are preconditions, not
network settlement. Build timing is not a controlled cold/warm benchmark.

Only root owns native proving and financial execution. The fresh plan permits
two new ordinary QA identities, two new QA FT contracts, one new AMM and one new
SD-key vault. One faucet request may obtain up to 1,000 test PSY. The aggregate
ceiling is 24 new UPSs and 75 test PSY in fees; the formal journey reserves exactly
20 UPSs and 60 test PSY. QA FT/NFT, test PSY and existing pUSDT are separate assets;
this AMM case uses newly issued QA FT and test PSY, not existing pUSDT.

Next: create and separately back up new QA identities; register once and verify
membership; make the single bounded faucet request and claim its exact grant;
compile/deploy the actual new assets and AMM; bind the allocated market and key;
verify full UPSs with actual artifact identities before funding; run activation,
LP, one swap/ordinary claim and cancellation/refund through the formal Executor.
Unknown sends stop and reconcile their original identity. No old contract,
account signer, business request or expired order is reused.

Raw proofs, request archives, private wallets, backups, native binaries and build
caches stay outside Git in the protected case. Only source and compact public
review evidence are committed. Shared vaults, selected-order deterministic
settlement and existing pricing remain unchanged. No global account scan,
qualified randomness, cross-machine coordination or production claim is added.
