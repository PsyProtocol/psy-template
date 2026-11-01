# Authorized independent fee exit — 1 November 2026

Status: offline validation closed for undeployed v18 AMM/Curve and v19
Orderbook/NFT candidates. There is no new
network settlement, extension approval or ordinary-wallet network claim in this
continuation. Historical v16/v17 artifacts are quarantined, never promoted.

## Authority correction and immutable version boundary

Review of the first candidate found that unrestricted public return of the
original owner's funds could stop a live service even though the recipient was
correct. Passing a proof does not make that policy safe. The old artifacts,
37 accepted synthetic UPSs and failed active-source attempt remain evidence of
that abandoned candidate, not acceptance of the corrected implementation.

The replacement requires either:

- Remaining original service cap below the protocol minimum Native transaction
  fee of 1,000,000,000 base units; or
- An ordinary signature by the original compile-time fee owner authorizing exit
  for the exact applied grant epoch and key. The owner's authenticated current
  grant nonce must still equal that epoch.

An auxiliary sponsor cannot bypass this rule. An owner permit is checkpoint
based; this is not an instantaneous cross-account revocation guarantee. A new
pending contribution is not counted as applied treasury credit. Old v14/v15
identities keep their existing layout, keys and behavior. No deployed contract
is updated to test compatibility. The formal route refuses quarantined profiles.

## Tagged credit and recovery funding

The vault returns only its original owner's **tagged Native contribution**, less
the exact return fee when self-funded. The return fee is additional to the
service cap and is separately counted. New-key approval must disclose that
capability. No existing grant or key is silently migrated, and no partial public
withdrawal/dust loop is authorized.

A separate ordinary sponsor explicitly approves vault, key, nonce, amount and
return-after checkpoint, then transfers the exact Native amount. The CFC checks
that foreign grant and the authentic Native Outbox cursor. It does not treat
another user's escrow or an untagged vault balance as sponsor credit. A sponsor
must first close its own active order for that vault, avoiding a shared Native
funding cursor. Applying the grant claims the contribution and pays its exact
fee in the same UPS.

Auxiliary credit funds existing customer recovery/refunds, source COVER/ABORT
and full tagged returns. It cannot fund OPEN, trading, matching, initialization,
frontier selection or retention. Refunds still consume the original authenticated
set, cursor, deadlines and market state. There is no reset, omission, deadline
extension, random reselection or new matching mechanism.

After the sponsor's signed return-after **proof-context checkpoint**, its credit returns only to
that sponsor. The sponsor can pay its own exact return fee, or another funded
sponsor can pay to return the full amount. Small residue needs a willing payer;
there is no free-transaction or unconditional service-liveness guarantee.

Expired **unapplied** funding remains a separate boundary. A sponsor must
explicitly renew its grant using the exact existing pending contribution; the
planner never sends a second full payment. This candidate does not provide a
permissionless sweep of unapplied funding. An offline sponsor, uninitialized
vault or active sponsor order cannot be described as autonomous exit liveness.
Initial activation still needs the original issuer's explicit prerequisites.

Checkpoint conditions are evaluated against the UPS/CFC reference checkpoint,
not an authenticated wall clock or inclusion-tip timestamp. Honest submission
keeps the existing fresh-state/expiry gates, but these tests do not establish
Node rejection of every previously admissible historical-context proof after a
deadline. A stronger inclusion-time cutoff needs verified upstream admission
semantics. Competing returns/refunds still share the vault nonce; the actually
accepted transition wins. No instantaneous sponsor revocation is claimed.

Pool reserves, customer FT/NFT collateral and Native escrow, activation funds and
earned/unattributed fees are not owner-sweepable credit. Returns create original
recipient Outboxes; only that recipient's claim makes them spendable. Native
credit, service/return/exit fees and returned Outboxes are reconciled separately.

## Code and formal Executor integration

- `batching/checkpoint-stream/exit-generate.mjs` adds the explicit owner permit,
  authenticated sponsor grants and tagged credit CFCs to unchanged market rules.
- `exit-policy.mjs` produces v18/v19 role/ABI bindings from the actual artifacts.
- `amm/u124/vm-tests/src/stream_exit.rs` constrains the full logical stack,
  auxiliary payer field 74, refund-only capability and original recipients.
- `stream_runtime.rs` prepares and independently checks saved key/session
  context. One shared inactive-tape selector now covers new exit modes in both
  preparation and recovery; the earlier active-source failure is retained.
  A standalone-CLI crate path was also corrected in the fresh native snapshot,
  without changing the proven key/policy/execution modules or contract bytes.
- `executor/fundedExit.mjs` provides unsigned planning and early rejection.
  It supplies no signature, trusted verifier, automatic payment or broadcast.
- The existing formal factory, persistent lifecycle, exact prepared producer,
  one-send journal and chain-bound reconciliation handle the new profiles.

Logical slots remain 40; actual emitted non-noop calls stay compact. Exact final
fees are recomputed to a fixed point, including the corresponding return amount.
Full approved calls, signature/session context, dependency identity and final
state checks remain mandatory. Unknown broadcast results preserve their request
identity; they do not trigger a replacement operation, re-signing or repayment.

## Verification scope

The bounded plan uses one proof owner, the frozen mainnet-beta SDK commit
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, two Rayon threads, at most eight
artifact builds, 90 unique complete UPSs, 7,200 aggregate proving-process seconds
and 10 GiB sampled process-family RSS. Financial operations are limited to zero
in this offline candidate phase. The fixture IDs (vault 100, market 1000,
ordinary user 200 and fee owner 600) are synthetic identities, not current-chain
transaction destinations. Real instance IDs require their own bound artifacts,
key, full UPS checks and wallet resources before any deployment. Stop on an authority, conservation, dependency,
identity or budget failure; retain original outputs and do not retry silently.

The completed corrected cohort consists of:

- Four separate market histories: 30 vault UPSs and four ordinary signed user
  claims, including exact U124/NFT recovery and sponsor-credit returns.
- One AMM active-source history: seven normal-path vault UPSs and two alternate
  abort/refund edges, preserving the full eight-account source, two pages and
  original order. Its ordinary claims are VM checks only.
- One separate AMM owner-permit history: two vault UPSs and an ordinary signed
  owner authorization. Owner claim is a VM check only.

This continuation adds no synthetic market fill under the new v18/v19 keys.
The active-source cohort has one order; maximum-capacity settlement under these
new identities remains unverified. Earlier v14/v15 trade proofs remain historical
evidence, not a substitute for this new-key or live-instance acceptance.

Ordinary funding/authorization, orders, cancellation and some claims remain VM
prerequisites, not a fully reachable signed/network bootstrap history. Synthetic
checkpoints, Endcaps, actual native key checks, network confirmation and real
extension claims are separate acceptance layers. Independent fixed-resource
Endcap verification is not independent proof of an approved stack or finality.
The key/session and actual CFC/UPS tests supply their own binding evidence.

## Browser and frozen wallet dependency boundary

The old long-running wallet registration belongs to another task and remains
untouched. The user authorized the dedicated Ego Lite profile
`Psy Fee Exit QA 20261101`; its new page session has no inherited wallet provider.
A page session alone would not have isolated the old extension backend.

Shared wallet SDK files had drifted from the wallet's reviewed manifest. The
build guard correctly refused them. An isolated workspace reconstructs all 472
exact reviewed distribution files and package metadata; the historical complete
distribution independently matches every byte. The installed-package and sibling
checks both pass without changing shared files, dependency versions or checks.
The isolated wallet still has `installedMarketRelease: null`. Building or loading
that extension is not approval of a current-chain market release or permission
to inject page verifiers/resource URLs.

A local UI-only Vite server was restored. The page truthfully reports the absent
public gateway and keeps trading disabled. Demo/old QA registry data are not
current-chain identity or settlement evidence. There is no new UI payment claim.

Six bounded read-only metadata requests observed matching checkpoint-1 root
`919896e18690246e20307f68cf2e5725aee496755366bbafff88eccaea975f12`
and head 32036 on Realm 0, Realm 1 and coordinator. Availability is not the full
fresh dependency/resource/funds preflight required before any financial task.

## Measurements and remaining gates

The corrected cohort has **46** unique complete synthetic UPSs: 41 vault
transitions, four ordinary signed user claims and one ordinary signed owner
permit. An independent pinned executable reverified all **83** saved Endcaps and
public metadata (46 corrected, 37 quarantined) and rejected 83 changed-fee
projections. Its first bounded attempt stopped after 46 pairs; the explicit
continuation verified only the remaining 37, preserving every prior result.

The actual formal native runtime verifies **31** distinct saved approved
contexts: 20 four-market stages plus all nine active-source and two owner-permit
vault stages. Wrong nonce and approved-request substitutions reject. Four new
CLI identities match the actual UPS keys; three old Curve/Book/NFT identities
retain their exact fingerprints. Two pure transport/tape checks, full-source
maintenance rejection checks and all four dependency metadata mutation groups
pass. A first metadata group used an intentionally inactive dummy source where
the complete user root was required; that failure is retained and the unchanged
full-root check passes against the actual eight-account source instead.

The latest affected host suite has 39 passes and no failures/skips. Earlier
broader host checks and all failed attempts remain in the archive; counts are
not added together as independent acceptance claims.

| Separate corrected process | Complete UPSs | Wall seconds | Sampled family RSS peak, KiB |
| --- | ---: | ---: | ---: |
| Four markets / signed user claims | 34 | 1900.823 | 7,082,336 |
| Active AMM / alternative recovery edges | 9 | 574.220 | 6,247,488 |
| Explicit original-owner permit | 3 | 249.644 | 5,866,016 |

These are separate synthetic worlds. The active cohort includes seven main-path
and two alternative-path UPSs; its nine fees are not one user's linear-history
bill. Nominal synthetic fee totals are 34,000,233,000 / 9,000,108,000 /
3,000,020,000 Native base units respectively, not live expenditure. All actual
network trades, network claims and newly spent test PSY are **zero**. Original
plus corrected proof/VM runners total 5,200.432 seconds, below the 7,200-second
bound; 83 unique UPSs are below the 90 limit. Eight contract artifact builds
include both quarantined and corrected candidates.

The isolated staging wallet build completed in 29.779 seconds after restoring
its missing public configuration/ABI and pinned tool references. It reused
installed dependency/tool caches and is not a clean SDK/application compile
benchmark. Both exact SDK checks pass after building; 29 release files are
hashed and copied byte-for-byte to the fresh QA installation directory. No
shared wallet/SDK source changed. Installation was handed to the user in the
empty authorized profile; no account creation, registration or payment was
started. `installedMarketRelease` is still null.

See [public evidence, original failures and reproduction](../../executor/verification/2026-11-01-authorized-fee-exit-v1/README.md),
including `MEASUREMENTS-v1.json`, the exact artifact/key maps and all samples. VM and host
transport doubles are not network acceptance. RSS covers the sampled producer
process family, includes shared pages and is not physical footprint. These are
single synthetic histories; routine file reads and lightweight host checks also
occurred. They are not matched old/new throughput measurements, p95,
chain TPS, extension latency or evidence of general acceleration.

Real extension installation, ordinary user-controlled setup/approval,
instance-specific verified resources, fresh live preflight, bounded deployment,
network fills, ordinary claims and real receipt/restart recovery remain open.
No production-readiness or full owner-independent liveness conclusion follows
from this offline milestone. Producer-controlled randomness/finality and
seal-before-release authentication retain their previous explicit limits.
