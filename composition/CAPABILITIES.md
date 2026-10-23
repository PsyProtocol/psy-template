# Composition candidate boundaries — 2026-10-23

## Code-based capability matrix

| Property | Existing implementation / evidence | Boundary |
| --- | --- | --- |
| One UPS | `isolated_wallet.rs` / `compact_market_wallet.rs`, verified end-cap start/end leaf and exported state changes | One signing user; multiple contracts under that user's state. Foreign-user snapshots are reads, not arbitrary writes to those users. |
| Deferred sequence | Complete known call stack, caller/parameters/stack hash/signature-session binding | Known inputs execute in order. No synchronous return-value routing or `invoke_sync`. |
| FT transfer | Sender-owned balance and sent cursor; receiver separately claims | Outbox is not the recipient's spendable balance. Claim must be included before spending by a different user. |
| Same user, multiple contracts | One end-cap binds every intermediate call and final root | Atomic only within that UPS's proven state transition; no guarantee for independent vault accounts. |
| Distinct vaults / realms | Existing ordinary funding, foreign reads, public-key registration and exact receipts | Multiple own-account UPSs, staged confirmation and claims. Cross-realm visibility waits are explicit; no global atomic rollback. |
| Ordinary acceptance driver | At most 16 explicit contract calls, validated bindings and canonical fields | SDK adds its fee operation. This driver limit is not the protocol's universal call limit. |
| Compact market key | 40 logical constrained slots; compact removes canonical noops; bulk admission has 7 physical calls including burn | Capacity 4 accepted members; AMM/Curve 4 fills, Book/NFT at most 2. New larger paths need new proofs/key and acceptance. |
| Inputs / writes / fees | Existing policy validates up to 128 input fields per described call; market amounts are U124, two 62-bit limbs | Not evidence of unlimited state writes or a universal maximum fee. Actual slot counts and burn come from each complete UPS/receipt. |
| Random order | Generator rejects random mode and supplied seed | Deterministic only; certified future source and finalized seal witness remain external dependencies. |

## First implementation path

Use a **two-AMM workflow** with a dedicated composition account, independent
controller, client and SD-key. Two fresh market instances are required for new
acceptance. A→B→A is a round-trip mechanics test; do not label it three-token
A→B→C. No uniform clearing price, liquidity sharding or changes to base pricing.

A user-signed request binds domain/genesis identity, SDK release, version,
owner/nonce/unique intent digest, input asset/max spend, output/min receipt,
expiry, native fee cap, receiver and the two complete market/vault/key/asset
bindings. Initial v1 restricts final receiver to the owner and FT outputs only;
NFT and arbitrary receivers are rejected until their dedicated policies exist.
Quotes are advisory; on-chain market arithmetic enforces per-hop limits. No
executor-supplied address or `verified:true` JSON flag authenticates a route.

1. User publishes terms and exact input/fee funding; composition controller
   consumes one owner nonce and claims only that owner's unspent funding.
2. Composition account opens/funds the first AMM order. The base Executor retains
   its admission/seal/commit/settle semantics. Composition records exact included
   request, proof, nonce, market order and queue identity.
3. After confirmed settlement, composition claims the actual intermediate FT.
   Check amount, asset, cursor and state-root evidence before the second order.
4. Open/fund the second order under the original bounds, confirm, claim and
   transfer only to the intent receiver. Final receiver then claims its outbox.
5. Cancellation/timeout does not reverse an executed swap. Before hop 1 settles,
   cancel and use sender-bound market refund. After hop 1 settles, recover the
   **intermediate** asset; after hop 2, recover/finalize the output. Accepted orders
   remain locked until the market's terminal epoch. Anyone can relay the public
   key path but needs proof resources and explicitly bounded gas; no free-service
   or unconditional liveness guarantee.

## Funded candidate checkpoint

`contract/funds.mjs` now generates an independent one-shot A→B→A controller;
`contract/policy.mjs` and Rust `composition_policy.rs` define its dedicated key.
The current compiled fixture and 8 linked full controller UPS requests are in
`executor/verification/2026-10-23-funded-composition-v1/`. They use the frozen SDK,
actual bytecode, authenticated synthetic Merkle checkpoints, exact call-stack /
session binding, actual burn and exported endpoint/delta verification. An
independent pinned end-cap verifier reverified every saved request. Five VM
regressions and all 18 operation templates / 18 key attacks passed separately.

This evidence is **not a complete market workflow UPS or network acceptance**:
base-market setup/admission/commit/settlement and ordinary owner funding/final
claims in this fixture execute bytecode in the VM only. The old two-hop runner
stays read-only. Dedicated financial Executor integration, actual reviewed route
bindings, new deployment/registration and recovery/competition network acceptance
remain open. All cross-UPS stages remain non-atomic.

`funding.mjs` recomputes the strict registry/plan/policy and creates the owner's
single-UPS request + exact native/FT transfers + `bind_funding`. It rejects a
changed route, receiver, decimals, amounts, nonce or budget. Its digest is a local
review identity; the chain intent identity is the controller Poseidon commitment.
It does not authenticate supplied snapshots, sign or send. Current profile is
nonce 1 on a fresh one-shot account, ordered A/B assets and owner-only recipient.
It reserves at least 6F for three ordinary owner UPSs separately from the bounded
20F..64F controller reserve; external market sponsor fees are reported separately.
No arbitrary unexpected deposits or automatic budget top-up is supported.

A frozen-SDK CFC cannot materialize an external read of an absent contract root
in this initial profile. The dedicated key instead authenticates the entire
empty starting user leaf (including all balances/cursors) and first session nonce.
Contract checks still bind actual owner funding, actual claims, key identity and
all subsequent balances. No SDK/Node check was deleted or bypassed. This profile
must not be used on a previously operated account.

Public code/layout/key reads are necessary before each broadcast, but they do
not settle the network's upgrade-authorization trust boundary. The frozen registry
is not an authenticated on-chain code-root reader inside the stack-only key.
Production authorization and runtime identity gates therefore remain open.

Supplementary proof coverage: `funded-composition-v2` verifies the two-UPS
fund/cancelled-input exit; `funded-composition-v3` verifies six linked controller
UPSs through accepted-order cancellation, sender-bound market refund, principal
and native escrow claim, and owner return. Base-market and ordinary-user actions
are still VM-only. Other recovery branches, second-hop failure, network
composition, unattended financial adapter and multi-host competition remain open.


## Financial adapter continuation

The independent financial adapter and CLI now exist (`adapter.mjs`, `run.mjs`).
This updates the earlier integration gap above; network acceptance is still open.
The current guarded source pins the sole intent owner as well as both canonical
issuer/decimals/renounced-administration records. This prevents another user
occupying the fresh one-shot account first. The adapter refuses legacy unguarded
source. New controller bytecode has eight independently reverified full UPSs;
see `2026-10-23-composition-financial-executor-v1`. Its base-market and ordinary
steps are still VM-only. New QA assets, market instances and financial service
acceptance are distinct gates, not inferred from those proofs.

Ordinary user cancellation records an intent on the owner's account. It does
not retroactively invalidate an already signed foreign-checkpoint proof. A
controller refund/cancel transition competes at that controller's own nonce;
only its confirmed transition supplies that account's definitive exit. Current
RPC rechecks reduce races but cannot claim an inclusion-time global snapshot or
atomic cancellation across users. A settled hop may only return its resulting
asset, never its original input at the old price.

## Current financial v2 candidate — 2026-10-24

This section supersedes the earlier v1 financial-integration status above;
historical evidence retains its original scope. Dedicated financial adapter,
normal persisted journal, frozen-tool/source validation and formal base-market
Executor routing now run together against new isolated instances. Two QA FTs
2483/2484 and AMMs 2485/2486 are included. Both actual LP batches settled, with
20 QA-A / 20 QA-B reserves per pool before route trading. Selected dedicated
controllers are 2491 (success) and 2489 (recovery); earlier 2487/2488 are retired,
unfunded instances. No old contract is updated.

A v2 financial intent additionally binds one atomic unit of the other FT. The
owner's single funding UPS sends it with the input/native budget. The first
controller UPS claims only the declared owner's funds and sender-bound cancels
the one-unit payment back to that owner. It authenticates a newly established
other-FT root, zero spendable balance and exact one-unit refund Outbox. It cannot
use the unit as swap liquidity. The final ordinary owner claim includes that
separate refund. This makes an existing SDK/base-Executor initialization
requirement explicit; **A-only onboarding is not supported by this profile**.
Financial custody rejects v1 intents. Owner-only receiver, fresh account, nonce 1
and actual issuer/18-decimal/renounced-administration checks still apply.

The revised source/key has 16 linked full controller UPSs (8 success, 6 accepted
refund, 2 pretrade cancellation), 18 operation templates, 18 negative key cases
and actual-bytecode initialization/amount/replay tests. Synthetic base/ordinary
steps in those proofs do not establish real network completion. Live success,
ordinary final claim, actual second-hop failure/refund, cohort conservation and
independent actual receipt verification must each have their own final artifacts.

An optional startup path independently verifies the exact saved initial layout
proof rather than generating it again. It binds the frozen verifier/dependency,
artifact/request bytes, actual deployer, zero old layout and every new public
endpoint. Source/IR/function-root verification and all current live identities,
key/session/nonce/fees/state/UPS checks remain required. Transaction witnesses
and account state proofs are fresh. This static resource reuse is not evidence
of a transaction-proof speedup or higher network throughput.

One live API deployment-ID mismatch was caught before funding: an old success
request's receipt named the recovery ID while actual code/deployer differed.
The mismatched instance was not used. A single independent serial deployment by
an explicit different publisher supplied matching 2491 metadata/receipt. The
original request was not replayed, no identity check was relaxed, and upstream
receipt association remains unresolved. Runtime-image/upgrade-authorization
attestation also remains external. Current deterministic finite-queue guarantees
are not global fairness, and same-host journal contention is not multi-host
coordination. No production-level conclusion follows solely from test counts.
