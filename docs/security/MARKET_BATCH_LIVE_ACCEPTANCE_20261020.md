# Four-market isolated live acceptance — 2026-10-20

Branch: `markets-batch-capacity-recovery-20261020`. Work in progress; this page
will be updated with final receipts. No Node changes or old-contract updates.
Original artifacts remain under `/tmp/psy-market-isolated-live-20261020-v1` on
the test machine. Wallet files are excluded from review evidence.

## Frozen test profile and assets

The explicit `staging-bundled-regtest-20261020-v1` compatibility profile is used.
Its complete end-cap verifier/common data matches the reviewed stable Node
bundle; real ordinary UPSs have been accepted by both staging realms. The
deployed service's image identity is not attested. The shared regtest domain is
a production gap. There is no automatic domain fallback or removed SDK check.

| Role | Test identity |
| --- | --- |
| Issuer / seller / LP | Bob 860352, realm 0 |
| Buyer / LP | Trader 876736, realm 0 |
| Gas sponsor | Sponsor 1384640, realm 1 |
| QA FT-A, 18 decimals | Contract 2464 |
| QA FT-B, 18 decimals | Contract 2466 |
| QA NFT | Contract 2467 |

These are newly issued QA FT/NFT instances. They are not existing pUSDT. Gas
uses real faucet test PSY. Both FTs have 1,000 issued tokens; the Trader's real
claim of 50 tokens each exercises nonzero low and high limbs. PSY realm-1 to
realm-0 transfer/claim and the two FT claims are confirmed at checkpoint 356284.

## New contracts and keys

| Market | New contract | New SD-key vault | Acceptance |
| --- | --- | --- | --- |
| AMM | 2468 | 581824 | Initial roots, registration and full activation UPS included |
| Orderbook | 2470 | 319680 | Initial roots, registration and full activation UPS included |
| Bonding Curve | 2471 | 843968 | Initial roots, registration, activation and stock initialization included; target AMM vault 581824 |
| NFT Market | 2469 | 1368256 | Initial roots, registration and full activation UPS included in realm 1 |
| NFT Market recovery replacement | 2472 | 1695936 | New initial deployment/roots and independent key registration confirmed at checkpoint 356667; activation and live recovery/sale pending |

Each initial proof starts from zero fields/slots and binds exact code,
whitelist, layout, height and counts. The spending policy is late-bound only
after the actual assigned market ID is confirmed. Every policy dependency is
frozen, including the native fee contract. No existing vault/key is reused.

## Planned live matrix and evidence rules

The real first-round ordinary order broadcast lost one transport acknowledgement.
Bob's locally verified signed UPS (nonce 6) remained unresolved while Trader's
nonce 2 was included. No replacement business operation was generated. Explicit
recovery re-verified the saved whole proof against the fixed Node key/common,
metadata, original request/input hashes, current exact start leaf/nonce, all
original dependency bindings and the original local broadcast window. It sent
the exact original wire bytes once, then reconciled the original identity:
checkpoint 356460, content hash
`b2f75993ef181634ab2e542f06e576d03490038c33627cae422460f5d27dc25a`.
The original failed/unknown attempt remains preserved. This is one canonical
transaction and one fee/transfer effect, not a freshly signed retry.

No queue had started at that point. The resumed fixture obtains fresh signed
admission consent for a new future cutoff, retaining the existing funded order
terms/nonces and preserving the original plan. It does not add orders to a
sealed set. The eventual end-to-end interval includes the recovery downtime.

Parallel fixture groups now drain all in-flight child outcomes before propagating
an error. New mutations stop on an unresolved result. Explicit identical-wire
recovery is a separate guarded operation; normal clients never retry automatically.

1. Activate the four vaults with exact native/FT seeds; initialize Curve stock.
2. Parallel independent ordinary order UPSs, explicit admission consent, sealed
   authenticated queues, and deterministic settlement of all accepted members.
3. Race two independent proof workers for one vault nonce using different
   valid admission proposals. Confirm one result and classify the loser against
   that exact consumed nonce; never blindly resend the loser.
4. Commit short-lived batches, retain their sealed scope across timeout, expire,
   refreeze and settle. Compare original and recovered queue roots/members.
5. Drop the parent driver's acknowledgement after child submission and recover
   from persisted proof identity plus historical receipt. Raw child transport
   evidence remains preserved. This is a parent-boundary fault, not a claim of
   packet-level network failure injection.
6. A second epoch exercises AMM swap plus cancellation/refund, Book cancellation
   and partial funding, Curve sell plus buy refund, and cancelled NFT sale/buy
   escrows. Ordinary recipients claim the actual FT/native/NFT deliveries.
7. Reconcile all cohort FT balances plus unclaimed outboxes against total supply;
   verify unique ownership of the two minted NFTs; reconcile native balances
   plus escrow against every included UPS's exact fees.

`ok` is an acknowledgement, not inclusion. UPS confirmation requires the exact
historical user leaf and indexed content-hash receipt. Follow-up planning waits
until the included checkpoint is visible at the common realm snapshot. Unknown
attempts stop mutation work and require read-only reconciliation. Failure logs
and earlier observations are retained, not overwritten.

## First round completed

The first round completed at 2026-10-20 13:51:55 UTC. All eight accepted orders
have terminal dispositions: four economic trades (Book one, Curve two, NFT one),
one LP addition, and one AMM cancellation refund. Ordinary Bob/Trader claims were
included at checkpoint 356752. Both FT supplies remain 1,000 tokens; two NFTs have
unique ownership. All user payout outboxes are claimed. Cohort native balances
plus pending escrows decreased by exactly 45.000576 test PSY, matching the 45
unique included UPSs and their physical-leaf DA fees.

The complete interval was 7,723,753 ms, including cold proving clients, intake,
queue cutoff, timeout, actual acknowledgement recovery, transient read failures,
claims and reconciliation. This is an adversarial QA workflow interval, not chain
capacity or a controlled speed comparison.

## Second round completed

The refund/sell round completed at 2026-10-20 15:25:18 UTC: all eight accepted
members reached terminal outcomes, with six refunds and two economic trades
(AMM swap and Curve sell). Ordinary recipients claimed all outputs, including
NFT #2 returned to Bob's original slot. FT supply and NFT unique ownership remain
conserved. The 37 unique included UPSs charged exactly 37.000494 test PSY;
cohort native balances plus escrows decreased by the same amount.

Independent integer checks verify the exact AMM reserves and unchanged LP share
supply, Curve sold quantity 14 and quote reserve 14.91 FT-B, and both consumed
order nonces equal to 2 in each vault. The full interval was 5,599,906 ms. The
four-vault settlement wave was 376.569 seconds; this is the actual cold-client QA
wave, not chain capacity or a controlled speed comparison.

Transient connection failures during NFT sealing and Bob claim proving were
preserved. Neither original attempt had a broadcast intent. Distinct explicit
recovery attempts were reconciled before proceeding. The first claim recovery
driver also rejected a metadata Number/BigInt representation mismatch before
starting a client; the guard remained intact and the raw original artifacts
were retained. The replacement NFT contract's independent tests remain in progress.

## Scope and remaining production evidence

### NFT admitted-set recovery defect found during acceptance

The original admission NFT candidate (2469 / vault 1368256) could admit a buyer
without its seller, then reject the entire sealed batch at `commit_batch` with
`purchase seller outside batch`. A nonempty queue cannot be aborted, so that
accepted scope had no terminal path. This was reproduced using the actual old
VM artifact; the failing baseline and original deployment remain preserved.
The active live epoch includes both members and is being drained normally.
Do not use this original NFT instance for general admission. The explicit paired
two-member acceptance fixture can complete its settlement/refund checks.

The replacement candidate permits that accepted buyer to reach refund only.
Computed seller membership flags are included in the batch commitment; sale
guards still require the exact frozen seller and buyer. Funding eligibility now
checks the exact frozen owner, preventing an absent seller from aliasing row
zero's unrelated listing. No implicit non-consenting seller is injected into
the accepted queue. Legacy discovery-mode seller-reference constraints remain.

Actual VM regression covers buyer-only scope, an unrelated listing in row zero,
forged sale, redirected refund, terminal refund, legal seller carry and replay
rejection. The replacement build is distinct; complete UPS verification and a
new contract/key/vault live acceptance are required before marking it accepted.
The replacement suite also exercises a subsequent sale of the same held listing
after the first buyer-only refund. This is a recovery correction, not a claim
of global order inclusion or fairness.

The scope is a bounded opt-in queue, not all market intents. Ordering is
deterministic and verifiable within that scope. Randomness remains disabled.
Admission and shared-pool settlement serialize vault state; proof aggregation
does not make same-pool transitions fully parallel.

Running this matrix does not establish global inclusion/fairness, immutable
upgrades, unbiased future randomness, production network-domain uniqueness,
independent review, or production liveness under adversarial withholding.
Curve automatic launch-AMM bootstrap and graduation are outside this live
batch fixture. Existing Executor daemon routing and browser UI acceptance are
also separate from this explicit driver using the ordinary SDK wallet signer.

Offline ABBA proof results and protocol dependencies are in
[the release review](MARKET_BATCH_RELEASE_REVIEW_20261020.md). Live worker runs
may overlap and include cold startup; they are not substituted for that controlled
proof comparison. The final live throughput report must state its full interval,
fills, queue waiting, proof work, inclusion and ordinary recipient claims.
