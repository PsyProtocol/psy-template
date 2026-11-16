# Fresh stag AMM acceptance — 16 November 2026

The new isolated case has passed current-chain resource checks and application
approval regressions. Real market settlement, final ordinary claims and browser
acceptance remain open. This report does not replace the preserved unresolved
sponsor request from the preceding case.

## Confirmed fresh funding

[Compact funding evidence](evidence/STAG_CORE_AMM_FUNDING_20261116_v1.json)
records the fresh ordinary issuer **1975680**. Its registration membership was
verified. Exactly one faucet request granted **1,000 test PSY**, confirmed at
checkpoint **148670**. The faucet returns an operator end-user leaf hash, not a
services content hash; the existing exact historical-leaf receipt reader linked
it to the indexed content hash.

A timing-only write failed after the response was durable. The original empty
telemetry file, error and single-send lock remain intact. Reconciliation recovered
the original grant without re-applying. One actual ordinary Native claim then
confirmed at checkpoint **148714**, with fee **1.000002 test PSY** and spendable
balance **998.999998 test PSY**. An independent frozen Node verifier/common-data
check passed for its exact saved UPS. This establishes a current-chain ordinary
SDK funding/claim path; it does not establish an AMM swap or browser approval.

Fresh QA token bytecode also now fixes 18 decimals, matching the planned journey
and existing bytecode rejection test. The production FT source still permits
configurable precision. Unfixed QA v1 source/artifacts remain preserved and are
not deployment inputs. Fresh v2 bytecode passed the existing complete ordinary initialization UPS at
synthetic checkpoint 100 and provisional asset IDs 42/43. It initializes and
mints 100 QA units per asset; real journey issuance of 200 units remains a
separate, fresh live proof before broadcasting. Wrong issuer, symbol, precision,
cap overflow/reset and failed-write cases reject. Provisional AMM proofs are
running before deployment. These offline proofs are not live issuance.

## Allocated assets and dependency-bound key gate

[Compact deployment and provisional proof evidence](evidence/STAG_CORE_AMM_PREDEPLOY_20261116_v1.json)
records new QA assets **56** and **57**, both confirmed with the expected numeric
deployer **1975680** and exact code/function/layout endpoints. Their initial
layout proofs are **0 to 15 fields**, not old-contract updates. Trader **1136000**
has a separately backed-up new identity and verified registration membership.
No QA tokens have been minted on the network and no vault has been funded.

Four provisional complete UPSs passed: QA initialization, fresh vault activation,
and AMM commit/settle. These use actual candidate bytecode at explicitly synthetic
contract IDs/checkpoints; they do not accept actual allocated-identity execution.
Both original proof requests and failed observations remain outside Git.

A parallel source review found that the legacy SD-key pins call structure but
relies on application guards for reviewed dependency code/function/layout roots.
A valid full proof of a changed registered contract would not itself prove that
its bytecode is the reviewed version. A new explicit dependency-bound key is being
implemented using the existing checkpoint-opening circuit pattern. It must pin
all four complete dependency leaves and their deployers under the actual signed
checkpoint, including the checkpoint-one chain anchor. Old key behavior and
registered recovery remain unchanged. New funding stays disabled until the new
key passes actual compilation, circuit attacks and full UPS acceptance. No Node,
SDK, account scan or market mechanism change is involved.

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

Next: complete candidate bytecode/UPS gates; create, back up and register the
second fresh ordinary QA identity; deploy the new assets and AMM; bind the allocated market and key;
verify full UPSs with actual artifact identities before funding; run activation,
LP, one swap/ordinary claim and cancellation/refund through the formal Executor.
Unknown sends stop and reconcile their original identity. No old contract,
account signer, business request or expired order is reused.

Raw proofs, request archives, private wallets, backups, native binaries and build
caches stay outside Git in the protected case. Only source and compact public
review evidence are committed. Shared vaults, selected-order deterministic
settlement and existing pricing remain unchanged. No global account scan,
qualified randomness, cross-machine coordination or production claim is added.
