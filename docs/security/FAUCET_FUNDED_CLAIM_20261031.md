# Authorized grant and ordinary wallet claim — 31 October 2026

## Closed milestone

The user explicitly authorized **one additional** request to the original
recipient, retaining both attempts. That request succeeded and its exact
operator end-user leaf, indexed content-hash receipt and Native Outbox were
independently matched. A single new ordinary claim was then fully proved,
verified, submitted once and confirmed. Funds are now spendable in Native
contract 0, slot 0, rather than merely pending.

| Evidence | Confirmed value |
| --- | --- |
| Current owned recipient | 223232 |
| Grant operator | 1343488 |
| Grant amount | 1,000 test PSY |
| Grant inclusion | 25190 |
| Grant content hash | `fc5a6845bec8795fa40d664c58f5dcd0ce2dccc5b335c147a45b4297e67ad718` |
| Ordinary claim inclusion | 25246 |
| Ordinary claim nonce | 1 |
| Ordinary claim content hash | `8a9bfca0dab4acaa11606819fcf424967fe00f311fc82c378ba610ce84a4d651` |
| Claimed-from cursor | 1,000 PSY; known source pending is zero |
| Actual ordinary claim fee | 1.000002 test PSY |
| Confirmed Native contract balance | **998.999998 test PSY** |
| Grant operator fee, separate payer | 1.000003 test PSY |

Recipient balance plus ordinary fee equals the exact 1,000 PSY input. The grant
operator's recorded debit equals 1,000 PSY plus its separately recorded fee.
No QA FT/NFT was issued or spent and existing pUSDT was untouched.
This is an actual ordinary **CLI wallet** claim, not browser-extension approval,
an AMM fill, or final-product acceptance. New AMM deployment and real UI
settlement remain the next funded phase.

Branch remains `markets-batch-capacity-recovery-20261020`; base
`fc2970049881ac1a98a42c60a8e5294e5445d1f0`. SDK remains mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`. Node, SDK/dependency pins,
old contracts, old wallet history and original artifacts were not changed.

## Root-cause investigation: additional exclusions

The [prior wire map and adjacent-root correlation](FAUCET_START_ROOT_CAUSE_20261031.md)
remain valid within their documented limits. Further frozen-source inspection
establishes:

- Root and proof cache keys include the requested checkpoint; proof keys also
  include the leaf checkpoint. A simple 1758/1759 key collision is not supported
  by this implementation.
- `get_ups_start_ctx` and `get_ups_start_witness` both request the start
  checkpoint. A diagnostic log prints the write checkpoint (start + 1), while
  the actual request still uses start. That log alone does not demonstrate an
  off-by-one request bug.
- Root and path are independently acquired and cached. The Scylla root and
  batched proof-node routines use the same prepared selector with
  `checkpoint_id <= requested_checkpoint`, not an intentional lookup at C+1.
  They are separate reads, not an atomic cross-request snapshot.
- Running source correspondence, original public start-input projection,
  selected operator and per-request backend provenance remain unavailable.
  The historical cause is not proven to be a cache collision, old binary,
  replication race or malformed request. No guessed Node/SDK patch was made.

The current successful grant demonstrates one accepted current service path.
It does not reproduce or resolve the original failed attempt. Current system
faucet code was read only; no update or execution probe of an old market was
performed. Its observed grant path delegates Native transfer rather than
creating assets in a zero-balance recipient. The confirmed operator receipt
records that transfer and fee debit; direct self-calling it is not demonstrated
as a zero-funds bootstrap solution. No private operator configuration was read.

## One authorized exception, not an automatic retry

The original grant request SHA256 remains
`85332da2e78775c0653737658234df46df80a5e326ee3440afb81879ba2d286d`.
The original attempt and send lock are preserved, its outcome still unresolved.
The approved repeat deliberately has the same exact request bytes, so attempt
identity additionally includes its separate authorization, intent and lock.
It returned `already_submitted: false` and the independently matched operator
end-user leaf `ca671f817d475df33426b079ed6a4d66037ee75f27dd73a77b4fab633c792837`.

Nine fresh public checks preceded one send, with a 120-second bound and no
automatic retry. The current chain, Native leaf, registration, root/path pair,
unchanged public user verifier registry and faucet configuration matched. The
two-request parent faucet ceiling is now exhausted. Any later original grant
must be separately reconciled; this success does not erase the old unknown.

## Complete ordinary claim and exact first broadcast

Before proving, a new funded subphase declared one ordinary UPS, a 2 PSY fee
ceiling within the original **20 PSY total** ceiling, one financial owner,
600-second proof deadline, two Rayon threads and an 8 GiB sampled-family RSS
ceiling on the 32 GiB host. No deployment or registration was allowed in this
claim phase. The grant size does not expand any budget.

The application was snapshotted against the unchanged frozen sources. Sealed
driver binaries generated exactly one complete claim UPS. The request has two
transactions (Native claim and automatic burn), the exact source/claim event,
two Native state-word updates and the expected next nonce. It passed both the
session-manager full proof check and independent saved-request verification
against the fixed verifier/common data with endpoint/fee binding. Endcap
verification alone is not represented as independent approval-stack evidence;
this owned CLI used the frozen input and trusted reviewed driver, and its exact
event, state updates and conservation were separately inspected.

The already-verified proof was reused for the first send. Whitespace-only exact
JSON compaction reduced the wire to **468,584 bytes**, preserving all tokens
and proof bytes. The exact request and intent were durably saved before one
HTTP send; no initial oversized transmission occurred. Fresh checks retained
chain, Native code/layout/functions, URT key, empty original user tree leaf,
exact next nonce, source cursor, deadline and final account rechecks. Receipt
reconciliation matched the original end-user leaf and content-hash receipt;
both realm heads had reached its inclusion before the final balance audit.

Preparation/verification observations, not a performance comparison:

| Stage | Wall seconds | Sampled family RSS KiB |
| --- | ---: | ---: |
| Current ordinary driver build | 82.549 | 1,279,296 |
| One complete ordinary claim preflight | 91.562 | 4,072,848 |
| Fixed saved-request verifier build | 11.377 | 563,008 |
| Independent complete saved-proof replay | 4.138 | 422,704 |

RSS includes shared pages and misses between-sample peaks; it is not physical
footprint. No matched cold/warm comparison, AMM round time or TPS is claimed.

## Application fixes and retained failures

1. The first receipt lookup selected the frozen config's `localhost` default.
   It remained unresolved and performed no payment. The corrected lookup reused
   the existing application config whose explicit `testnet` network object is
   byte-equivalent after JSON decoding to the frozen testnet object. The
   generic receipt reader now accepts an explicit expected network and fails
   before any read on mismatch; the formal isolated UPS confirmer requires
   `testnet`. No SDK or dependency selection changed.
2. The funding collector previously mislabeled the account leaf's system
   `balance` as native PSY. After the real claim that system value remains zero,
   while Native contract 0 slot 0 holds 998.999998 PSY. Acquisition now reads the
   exact Native word and preserves the separate system field and source label.
   Full Merkle/UPS verification remains separate; the capture grants no spending
   authority. Original pre-claim captures were not rewritten.
3. Two local pre-wire preparations stopped before RPC/send: strict comparison
   of lossless null-prototype objects with literals, then passing URL objects
   to a path-string durability helper. Expected values now use the same exact
   JSON codec, and the caller converts URLs to filesystem paths. Atomic
   creation/fsync and every field/value check remain.
4. A third preparation stopped on `psy_get_tx_status: Method not found`, with
   no send intent. The actual frozen SDK `get_tx_status` is a local committed
   nonce calculation, despite a request enum entry. The corrected gate retains
   strict current leaf/hash, next nonce, registration, deadline and single-owner
   ledger checks, plus a final fresh account recheck. It does not infer pending
   mempool absence or fall back to zero on a failed read. No Node method was
   invented or implemented.

All three pre-wire outputs and original scripts remain. Only the fourth
preparation transmitted, exactly once; no proof was regenerated. Twelve receipt
tests and the funding-capture regression pass, including wrong-network refusal
and zero system balance versus nonzero Native balance. These are regressions,
not additional transactions.

[Public evidence inventory](../../executor/verification/2026-10-31-funded-native-claim-v1/README.md)
contains the explicit authorization, safe grant projections, original receipts,
exact public proof/request/wire, failed preparations, fresh reads, balance audit,
resource/source/binary digests and bounded timing data. Secret files, private
faucet diagnostics, signing witnesses and executable binaries are excluded.
