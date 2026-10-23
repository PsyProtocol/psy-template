# Accepted-order cancellation: six full controller UPSs

Supplement to v1/v2; same compiled v7 controller and dedicated key, same frozen
SDK. Six linked complete controller proofs: fund, open first order, consent,
cancel accepted order, claim principal/native escrow, return to original owner.
An attempted early return rejects while accepted principal is locked. Final
controller A/B/native balances are zero. Every saved full request is independently
verified against the pinned end-cap key/common data and metadata/fee endpoints.

Base AMM admission, commitment and funding refund in this fixture are actual
bytecode **VM only**. Ordinary owner request/cancel/final claim are VM only.
This does not certify market UPSs, cross-vault atomicity or network acceptance.

The first two failed fixtures selected the live-price slippage-refund branch for
a cancelled order; failure logs and four successful-prefix requests from each
remain preserved. Final fixture uses the existing sender-bound refund_funding_5
path with exact principal and F native escrow. No base-contract/key/SDK safety
check was changed or removed. Corrected source snapshots accompany this report.

The host was under unrelated, uncontrolled high load. CHECKPOINT.json records
the observed construction/proof sums and one later host-load observation. This
is not a comparable before/after benchmark, memory result, confirmation latency
or TPS. Reproduce as v1, selecting
`full_ups::cancelled_inflight_hop_refund_full_ups`, with fresh COMPOSITION_UPS_OUT.
