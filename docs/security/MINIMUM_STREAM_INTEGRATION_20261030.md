# Minimum-frontier random stream integration

## Release scope

Work continues on `markets-batch-capacity-recovery-20261020` from `a0781428`.
The SDK remains mainnet-beta `c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. The application materializer rechecks
all 2,756 frozen source pins. No Node, SDK, deployed market, original artifact,
wallet history, pricing, matching rule or UI permission is changed.

The user authorized promotion. Application correctness and fresh-instance
admission remain prerequisites. Do not enable v10 by changing a flag. Its
poisoned partial prefix is replaced in a distinct v11 AMM/Curve candidate.
Orderbook and NFT priorities are unchanged. No financial operation was
performed by this milestone. Current run results are recorded below;
synthetic acceptance is never a network receipt or an ordinary-wallet signature.

## New candidate

The replacement profile is `source-covered-producer-minimum-stream-v1`. It
keeps 40 logical slots with compact actual calls. Each source, build, extraction
or settlement page handles at most four rows. Total source size is not reduced
to four: complete account coverage, all canonical-source insertions, all minimum
extractions and all terminal dispositions span successive UPSs.

The previously proved conditional minimum component is embedded in the spending
key. Four gated steps form a page, with an exact before/after state chain and one
scope, seed and operation. A page must be full or the terminal remainder. The
contract stores a domain-separated hash of the 17-field minimum state. Its key
binds `begin_order_page` followed by `advance_minimum_stream`, all exact arguments,
padding, caller, actual stack, session, sig_hash, nonce, current dependencies,
fee and exported endpoints. Complete extraction alone opens settlement.

Canonical source insertion consumes the authenticated 56-bit original minimum,
then inserts into a 24-bit owner-indexed authenticated sorted linked list.
Extraction takes only the authenticated head. There is no prefix reset. Partial
progress can continue with the same source, seed and ordering after expiry;
settlement then refunds the actual remaining assets. An unseeded expired source
has an explicitly refund-only exit. The full hash and owner/nonce/index tie rules
remain unchanged, as do U124 arithmetic and market pricing.

The new contract/key uses S+8192, with D fixed to S+1, as a separate compiled
version. This is not a configuration change to an old deployment. A larger
window is not a throughput, deadline or service-availability guarantee.

## Funding authorization

A configured ordinary fees-only owner approves a nondecreasing lifetime cap,
vault, nonce and registered key in contract state. It cannot submit trader
intents through this candidate. A grant UPS binds that exact owner and flag to
the following Native `claim(sender)` when selected; that native method claims
all pending value. The market cursor advances to the same cumulative sent
endpoint, with the claim in the same UPS.

Slot 38 always accounts the exact fee under the approved key; slot 39 burns the
same value. OPEN/initialize cannot reset the cap or cumulative use. A new owner
grant remains callable for recovery. The contract limits each fee and cumulative
use; final net-word statistics are checked independently against actual CFCs
and the Endcap. A local estimate cannot authorize a different burn.

This does not guarantee free or owner-independent service. Exhaustion requires
a fresh ordinary-owner authorization and sufficient actual Native balance.
Unspent gas funding is explicit treasury funding, not trader liquidity or an
automatic promise to refund the principal. Owner availability, funding fit and
an owner-approved surplus exit require separate live review. An eligible OPEN
sample rejects an entirely empty source but does not prove global account count
or a complete runtime reserve before coverage finishes.

## Errors retained and corrected

1. Candidate v1 reused the source-account empty root (height 32) for the new
   list (height 24). It was never promoted. Frozen SDK exports now supply the
   exact independent height-24 and height-56 constants. Old compiled outputs
   remain untouched.
2. An early test source failed Rust borrow checking. A later short `--exact`
   filter selected zero tests. Both outputs are retained and excluded from
   acceptance; the corrected runner selects the full qualified name.
3. The first full-UPS attempt proved the CFC prefix but failed signature witness
   generation: GRANT disabled historical-source reads, while its host assignment
   supplied enabled ready/phase openings. It now uses the existing canonical
   disabled assignment. Current identity checks are retained.
4. The next attempt exposed an invalid base proof, followed by recursive
   minification failure. Recorded public-session replay reproduced the error
   without regenerating CFCs. Explicit base-proof verification now precedes
   minification and distinguishes generation, verification and recursive errors.
5. A read-only synthetic witness audit found six failing 24-bit comparison
   constraints: inactive settlement claim-order comparisons decomposed GRANT's
   62-bit cap from reused field 22. V11 now selects zero operands before the
   inactive narrow comparison. Active settlement retains the original full
   owners and priority check. Legacy gates remain unchanged. This fix changes
   the new v11 key identity; old captured CFC/key identities cannot be relabeled.

The witness auditor reports gate/row/constraint metadata only. It never exports
raw private/signing witnesses. It uses frozen public backend APIs and metadata
serialization without altering generators, gates, configuration or verification.
Wire metadata from the base circuit is not treated as the cause of an error
reported by another recursive layer.

## Current acceptance run

The v13 application snapshot and fixtures-v3 are the current candidate. The final
run starts from zero unrelated Native float and omits the obsolete sponsor
account and fourteen legacy synthetic gas grants. Only the ordinary owner funds
execution. Eight accounts/five eligible orders need two coverage pages, two
4+1 build pages, two 4+1 extraction pages and two 4+1 settlement pages.

The declared total is 40 full-UPS attempts: two failed attempts plus 38 accepted final proofs,
19 per market. Each final market run includes funding application,
OPEN, complete coverage/order/settlement, original-prefix timeout continuation,
post-fill timeout tail and unseeded expiry/refunds. It checks FT balances plus
Outboxes, Native balances plus Outboxes plus exact burned fees, three fills,
cancellation/slippage refunds and exact terminal nonces. Ordinary setup/grant
and claimant operations are bytecode-only; no wallet signature or network
arrival is inferred. Complete proofs must pass before these checks count as
spending-key acceptance.

Status: all 38 final complete UPSs passed with the fixed verifier, exact key,
ordered stack/session binding, fee and endpoint audit. Each market has three
synthetic fills, cancellation/slippage refunds, 4+1 member build/pop/settlement,
original-prefix continuation after expiry, post-fill tail refund and unseeded
expiry/refunds. All normal/recovery conservation checks passed. The two failed
full-UPS attempts remain published and count toward the declared 40 attempts.
Five grouped page proofs and the earlier initialized nine-account VM checks are
separate supporting evidence, not additional complete UPSs.

The final process took 3,336.860 seconds with sampled process-family RSS peak
1,977,552 KiB. Normal ten-UPS acceptance intervals totalled 661.466 seconds AMM
and 661.066 seconds Curve, excluding resource builds of 126.399 and 107.669
seconds. Vault fee burns were 10.000137 / 10.000142 synthetic PSY respectively;
ordinary owner approval/funding, deployments and signed ordinary claims are
outside those totals. Across all 19 branches the per-market intervals totalled
1,540.006 / 1,545.482 seconds. These are offline synthetic acceptance measurements,
not real confirmation, ordinary-wallet arrival, TPS or a matched speedup.

Final native helpers were rebuilt from application-v14 (the spending circuits
are unchanged from the accepted v13). Saved proof replay checks the exact key
and complete signature/stack binding without regenerating accepted CFCs.

The observer records the full process family, one-second sampled RSS, all failed
runs and elapsed time; the stop is 6,600 seconds and 8 GiB per run. Sampled RSS
includes shared pages and is not physical peak. Resource builds and acceptance
runs are separate. This is not a controlled before/after performance experiment.
Normal phase intervals also include the explicitly recorded negative key probes
on OPEN/first settlement. They are acceptance timings, not a production-path
benchmark. The Curve resource build is the second market in the same process;
global SDK caches may already be warm. It is not a second independent cold start.

## Executor preparation and cost model

The owned v11 native planner rechecks reviewed artifact digests, complete source
and the fixed future draw under an independently supplied history root, then
prepares both minimum phases and the exact output queue. The shared durable
Executor preparation path retains one immutable source/seed/plan per epoch and
checks copied artifacts and binary identity on replay. It still cannot sign or
broadcast. Coordination doubles test persistence and reselection; they are not
native Merkle, full-UPS, live or cross-machine acceptance.

For A accounts and N eligible members, with q=ceil(N/4), the normal vault path
reserves 2+ceil(A/4)+3q UPSs including one funding application and OPEN. Unseeded
exit reserves 3+ceil(A/4)+q. Ordinary owner approval/funding, ordinary claims,
excluded recovery and explicit grant recovery have separate reserves. Deployment,
registration and initial market/input funding are outside this model.
`planningConditionsFit` remains conditional on measured runtime/cadence, actual
balances and lifetime-cap remainder; it cannot authorize signing or broadcast.

## Remaining gates

- Owned live v11 signing, exact-once broadcast, original-request reconciliation,
  current-instance admission and new-instance resource matrix are not completed
  by the public preparation route.
- Fresh empty-account registration, fee-grant/activation/bootstrap, actual QA
  assets, fee owner and graduation recipient must be bound and verified. The
  initialized synthetic fixtures do not establish that startup sequence.
- Native checkpoint-stat inclusion remains producer-controlled. It is not a
  qualified low-bias beacon, an independent finality proof or authenticated
  proof that a seal was accepted before the draw became available.
- The original 6085/6086 checkpoint proof/resource failures and upstream build
  inputs remain separate unresolved evidence; an application witness bug is not
  an explanation or repair of those historical proof tuples.
- Source scope is every eligible final order in a finite authenticated account
  snapshot, not raw block transaction history or global admission completeness.
  Cancellation-tip freshness, service liveness and omission before admission
  remain explicit boundaries.
- Multiple UPSs are a recoverable workflow, not cross-vault atomicity. Proof
  aggregation is not fully parallel same-pool execution. Local coordination does
  not establish cross-machine coordination.

Live random writes remain gated. This report does not declare safe public
launch, unbiased randomness, general MEV resistance, anti-censorship, speedup
or production readiness.

## Reproduction and public evidence

The [public bundle](../../executor/verification/2026-10-30-minimum-stream-integration-v1/README.md)
contains explicit public projections, proof bytes, the retained failures,
immutable source snapshots, tool results and a digest index. No private key,
raw signing witness or wallet recovery file is included. The actual native
Executor preparation replays the same four minimum pages and output queue as
the accepted proofs; it remains prepare-only. No UI write gate was enabled.

## Subsequent startup continuation

The [separate v12 first-use report](MINIMUM_VAULT_BOOTSTRAP_20261030.md) closes
synthetic register-user start, exact activation-before-treasury order and Curve
inventory initialization under new keys. It retains the unchanged v11 bytecode
and all historical evidence. Signed ordinary prerequisites, excess preactivation
recovery, normal final-key settlement and live acceptance remain open.
