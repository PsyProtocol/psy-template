# Funded composition: implementation scope and gates

Starting commit `6c518ac`, same working branch and SDK manifest
`0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`.

## Verified boundary and first route

One UPS writes the signing user's contracts and native state, authenticating
foreign snapshots as reads. Deferred calls with known inputs form the bounded
stack; there is no synchronous return routing. A recipient's Outbox is not
spendable until its own claim. Distinct vaults and cross-realm visibility therefore
require separate confirmed UPSs; no cross-vault rollback is asserted.

The existing independent funded controller and dedicated key support **two
distinct AMMs with the same ordered QA FT pair, A→B→A**. This mechanics route
is not A→B→C or four-market authorization. Orderbook whole-order priority, Curve
graduation and NFT listing nonce/unique-sale policies stay separate; their
composition adapters are not yet implemented. NFT/delegated recipients fail
closed in this first profile.

## Concrete continuation

1. Reuse the already proved controller's 18 branches and one-shot empty-account
   invariant. Add a separate application driver selecting the dedicated key,
   sharing the existing exact-stack, prepared-request and current-state guards.
   Reject use of the generic market key for a funded composition policy.
2. Generate canonical runtime policy metadata from the strict registry and ABIs.
   Bind full code/layout/function roots, key registration, network, SDK, owner,
   nonce, asset decimals and intent. Client quotes remain advisory.
3. Add an independent scanner/financial Executor route around the existing
   durable execution journal, not around the observation-only eight-step client
   workflow. Derive actions from current controller/market/claim state; the
   contract/key prove quantities and final owner payments. Unknown broadcasts
   reconcile original identity and never spawn replacements.
4. VM fee preparation may propose an exact fee, but the complete proof must
   match its actual burn. A quote does not authorize custody or a transfer.
5. Execute base market work through their existing Executors. Accepted orders
   stay locked until terminal market handling. On cancel/expiry before a trade,
   return input; after hop one, return intermediate; after hop two, return final
   output. No executed market trade is reversed at the old price.
6. Test real compiled artifacts and complete UPSs, then deploy fresh isolated
   instances/keys/vaults after those gates. Original archives remain immutable.

## Current limits and payer model

Ordinary app driver: ≤16 explicit calls plus SDK burn (not a protocol maximum).
Composition key: 74 witness fields, 40 logical slots; each controller operation
has ≤9 explicit calls plus burn after removing canonical noops. Argument arity
is pinned to compiled ABI and bounded by the existing ≤128-field descriptor
validation. The actual modified-slot count/fee must come from full proof and
receipt; there is no claimed universal write limit. The current fee cap is
1.0001 test PSY/UPS, at most 14 charged controller steps, two market escrows,
20F..64F user-authorized controller reserve and separate ordinary-owner reserve.
Market sponsorship is separately authorized/accounted. No automatic top-up.

Anyone may spend proof resources to relay a valid public key operation; the
signed bounded reserve pays controller fees. The owner can cancel using its
ordinary key. Market timeout/recovery still needs a relayer and explicit gas.
No implementation can promise liveness with no willing prover or no budget.
Local journal locking is not multi-host consensus. Runtime/upgrade authority
and on-chain code/layout trust remain release boundaries, not solved by RPC
root checks, passing test counts or local registry hashing.

## Guard discovered during implementation

A reusable public financial key alone does not pin the first funding owner.
The new controller therefore compiles `intentOwner`; both publishing a request
and consuming its funds reject any other owner. New generation requires this
pin and immutable canonical token metadata. Current generated source exactly
matches the guarded fixture's eight newly verified controller UPSs; legacy
archives are kept unchanged and rejected by the financial adapter.

## Component identity closure and transport recovery checkpoint

Financial adapter startup now rebuilds the four canonical component sources,
compares lossless IR/ABI, derives code/layout/function identities/counts, and
reconstructs the base AMM SD-key policy and identity. Required tool release pins
and input files are documented in composition/README.md. This is an application
source/registry gate; it does not certify runtime images or upgrade authority.

An initial QA deployment without an inclusion result remains unresolved, never
silently resent. The first unfunded case is quarantined; successor QA-B has a
distinct canonical issuer/code. New request preparation is offline, followed by
full independent verification and a single compact-wire broadcast with a saved
lookup identity. A second unknown outcome is still not a reason to create an
unbounded series of replacements. Existing included QA-A and owned ordinary
accounts can continue independent constituent acceptance while exact original
deployment identities are observed. No controller or market receives funds until
the complete route closure and fresh instance identities have been verified.

### QA-B receipt continuation and first live route

A bounded independent issuer deployment is now included as QA-B 2484; unknown
original deployments stay excluded. New AMMs 2485 and 2486 with distinct vaults
are registered. Do not confuse these registration prerequisites with actual LP
or composition settlement. See current review continuation for exact receipt.
The new `composition/acceptance` route uses 20 QA-A / 20 QA-B LP per pool,
then an owner-funded A→B→A workflow. A separate controller scenario cancels after
the first confirmed trade and returns actual QA-B, without pretending to reverse
that trade. Controller source/IR/root recompilation is now a mandatory adapter
gate. Ordinary wallet RPC empty-body failures are addressed at application level
with bounded public-read retries only; SDK remains frozen. Original claims are
preserved and their absence of broadcast is checked before the reviewed resume.
Actual route, final ordinary claims, failure recovery and cohort/fee audit remain
pending until exact included receipts and endpoint checks are archived.
