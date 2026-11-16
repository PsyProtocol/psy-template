# Selected-order market Executor integration — 16 November 2026

This continuation preserves the current branch, mainnet-beta SDK
`01b8f2b0a077367a7b9879baba1a72aea8ab5510`, client
`7058070057c3242b5d8b29e1a31d498aaa4202c0` and backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. No Node, SDK, existing deployed
contract, pricing, matching or NFT winner rule is changed.

## Implemented source and review boundary

The formal public-wallet Executor now dispatches four explicit profiles:

| Market | Profile | Selection and semantics |
| --- | --- | --- |
| AMM | `amm-core-compact-v1` | Bounded explicit hints; shared reserves update in committed deterministic order. |
| Curve | `curve-core-compact-v1` | Bounded explicit hints; progressive curve price and existing graduation/refund rules. |
| Book | `book-core-compact-v1` | Whole-order matching, price/time priority within the selected committed scope. |
| NFT Market | `nft-core-compact-v1` | Selected listing/buyers, existing buyer priority and unique sale result. |

[Canonical profile dispatch](../../executor/coreMarketProfiles.mjs) feeds the
existing adapter, durable journal, full Native preparation and exact prepared
broadcast. Exact canonical policy equality, complete dependency roots, chain
instance, registered account/key, driver identity, stack/session and fresh
state/nonce/fee checks remain mandatory. Explicit hints are at most four accounts;
there is no account-universe scan. Once committed, frozen members remain
mandatory even if hints change. This does not prove global inclusion or
censorship resistance. Deterministic mode remains active.

The [new Native scope guard](../../amm/u124/vm-tests/src/core_scope.rs) validates
all four selected profiles before key construction and at the existing execution
gates. A frozen-release build was observed passing; its raw case was later deleted
by a separate cleanup. Actual generated-policy/key checks and complete UPSs
still gate deployment. The lost native evidence must be reconstructed and rerun. Existing AMM
acceptance retains its already registered key and pinned executable.

The [NFT builder](../../nft-marketplace/core-build.mjs) uses the actual pair
compiler API and explicit prepared-collection initialization. Vault activation
uses `prepare_account()` instead of the legacy acknowledgement call. That changes
the circuit identity and requires a fresh key. The activation payer must still
actually own an NFT; preparation alone does not satisfy that contract condition.
Ordinary buyers must explicitly select the prepared-account client mode. No old
collection or key is silently upgraded.

## AMM refund-first real-network continuation

The original nine included UPSs remain preserved historical evidence. The old
swap is nonce 2, not a filled trade: its input and fee escrow remain pending.
Read-only preflight matched Native/QA49/QA50/AMM51, the chain-one root, runtime
verification resources and all three exact actor leaves. The route must settle
and claim the actual expired input before opening a distinct nonce-3 swap.

The declared continuation has no new deployment, key, identity or faucet request;
its maximum is nine new UPSs and 27 test PSY, with the original three-hour wall
deadline and cumulative original-case ceilings. QA49/50 are QA assets, not pUSDT.
Only the root owns financial execution, native builds and proofs. Child agents
own separate source/tests and independent read-only reviews.

The first startup stopped on coordinator HTTP 503 before a proof job. Subsequent
cold ordinary-client initialization hit the unchanged 2 GiB free-disk floor.
Durable worker traces stop before `ready`/`dispatched`; there are no request,
preflight or broadcast-intent artifacts for those abandoned startups. Original
unsigned inputs and failures are retained. Old regenerable Cargo dependency
caches were cleared while preserving sources, frozen dependencies, executables
and raw financial evidence. A final isolated startup requires 10 GiB initial
headroom; financial caps and the original deadline are unchanged. This is not
permission to retry an unknown broadcast.

The final resource-recovered startup reached one real submission. Its complete
ordinary sponsor proof independently verifies against the fixed verifier/common
data, but realm0 returned HTTP 200 JSON-RPC error `-32009`: the proposer is busy,
delivery is not confirmed and a copy may still be included. The exact nonce-5
issuer end leaf is `e386fc4c1891f2eab40997618a202fb216dd74bafb7d4b465c6f26d2b0f5e48e`;
request SHA256 is `02819d74e46f977bea42b5f757ca306c92de7f94ff55a053abf331e3ee687e93`.
This digest is a saved-file digest, not a claimed services transaction hash.

Bounded exact-identity receipt reconciliation has not found inclusion. At the
recorded RPC checkpoint 147664, the issuer remained nonce 4 at the original start
leaf. This observation does not prove final rejection. The sponsor request,
proof, broadcast intent and account gate remain preserved; it was sent once,
with no re-sign, replay, substitute funding or downstream settlement.

The frozen source records temporary accepted end-leaf/slot updates before queue
publication, and its SDK deliberately queries every configured edge. These
records can help diagnose acceptance, but neither an empty temporary result,
application expiry nor unchanged nonce authorizes replacement. The exact runtime
busy message is newer than this source snapshot. An upstream identity-bound
terminal-disposition lookup, or exact inclusion/history evidence, is needed if
this request remains unresolved. No Node change is made.

Real refund, swap and ordinary SDK claim results are pending. A running or
compiled ordinary SDK client is not browser-extension/UI acceptance. This
single-launch acceptance runner stops for manual exact-identity review after a
new included stage; it does not claim automatic restart recovery.

## Validation levels and remaining gates

The pre-incident combined host run had 78 passing checks; its TAP was deleted.
After protection, 75 checks passed with a preserved TAP and no skips. That run
adds six first-sponsor adoption checks and excludes nine AMM checks whose
compiled fixture directory was deleted. It covers
formal dispatch, exact compact call order, Curve progressive buys, Book price/time
matching, NFT unique winner/loser/expired-priority refund, frozen membership,
full-U124 refunds, journal duplicate suppression and input substitutions. These
are host/mock checks, not actual complete proofs or network receipts.

[Generated-policy/key tests](../../amm/u124/vm-tests/tests/core_profile_scope.rs)
require actual compiled fixture manifests; no fabricated ABI-only success
fallback is accepted. The separate
[NFT synthetic complete-UPS lifecycle](../../amm/u124/vm-tests/tests/support/nft_core_full_ups.rs)
plans seven vault and nine ordinary proofs, including empty-vault activation,
real market Outbox claims and expiry/refreeze refunds. Their source was observed compiling. No new full-UPS lifecycle was executed.
The corrected generated-policy fixture gate remains unexecuted. Ordinary synthetic proofs use ephemeral fixture identities;
they do not establish persistent wallet history, browser approval or finality.

Remaining gates are actual new Curve/Book/NFT bytecode/layout/key/full-UPS
execution, current-chain lifecycle/ordinary claims, browser UI and persistent
restart/fault acceptance. No speedup, TPS, qualified randomness, global fairness
or production conclusion follows from this source integration.


## Preserved unknown broadcast and cleanup incident

The refund sponsor reached one real submission. Its full ordinary proof
independently verifies against the fixed verifier/common data. Realm0 returned
HTTP 200 JSON-RPC `-32009`: delivery to a busy proposer is not confirmed and a
copy may still be included. The nonce-5 issuer end leaf is
`e386fc4c1891f2eab40997618a202fb216dd74bafb7d4b465c6f26d2b0f5e48e`;
the saved-file request SHA256 is
`02819d74e46f977bea42b5f757ca306c92de7f94ff55a053abf331e3ee687e93`.
This file digest is not a claimed services transaction hash.

Bounded exact-identity receipt checks did not find inclusion. The last saved RPC
observation, checkpoint 147664, still showed issuer nonce 4 at its original leaf.
That is not final rejection. Historical admission can retain an old request
while its start leaf remains usable. Neither an expired application window nor
an empty temporary acceptance record grants replay authority. Frozen source
stores diagnostic acceptance before queue publication; the SDK queries all
configured edges because the records are local. The exact newer busy response
is absent from that snapshot. An identity-bound terminal-disposition query or
actual inclusion/history evidence remains an upstream dependency if unresolved.

The first-sponsor adoption helper checks exact bytes, fixed proof-report pins,
call/amount/context/nonce/endpoints and receipt/fee consistency. It always returns
`maySubmit: false`. Unknown inclusion keeps the old anchor; only exact inclusion
permits adopting the verified end leaf. Later stages still require separate
review. It is a root-owned acceptance gate, not a wallet verifier or permission
to forge a proof report. The original request has not been re-signed or replayed.

A separate Claude date-filtered cleanup ran `rm -rf` on the old-named parent
`psy-market-recovery-20261023`, which contained this new run. The deletion was
suspended and then terminated on the user's protection instruction. Surviving
exact sponsor artifacts and working source were copied to a private local
protected directory; raw originals and the source snapshot received user-
immutable flags. The original Git worktree was also deleted later in that
cleanup. Its saved patch and twelve named new files were recovered onto the
same remote branch/base, without importing private archives into Git. The recovered working tree then
passed the same 75 host/mock checks, with no skips and a separate preserved TAP.

The old SDK tree, synthetic test case, previous AMM case and QA wallet parent
were already missing. All 2,759 frozen public SDK source hashes and all four Git
archive hashes have since been reconstructed and verified from local objects,
without checkout, Node or dependency changes. Public source recovery does not
restore private signing files, original binaries or deleted proof cases. No old
wallet identity was recreated and no replacement financial operation was made.

[Compact evidence](evidence/market-core-executor-20261116.json) distinguishes
preserved sponsor evidence, observed-but-deleted native results and unexecuted
acceptance gates. Real refunds/trades/ordinary claims remain incomplete. No new
network fee is claimed as confirmed; the outstanding sponsor fee remains
reserved while delivery is unknown.

NFT browser writes remain unaccepted until collection, token identity, metadata,
listing nonce and price are bound in the same approved UPS; RPC display alone
is insufficient. Formal selected-order routing does not open that UI gate.


The recovery preparation also restored the exact reviewed Native and U124 FT
input artifacts from preserved compressed public fixtures. The prepared NFT
artifact remains unavailable; its deterministic source is ready for fresh
compilation. A new isolated application contains 178 source/test files matching
the recovered repository, the original lockfile bytes and only relocated
frozen-dependency paths/explicit binary selection. Its bounded plan is 23
synthetic UPSs with a ceiling of 24; none have been executed after restoration.
These recovered inputs do not imply current-network or finality acceptance.
