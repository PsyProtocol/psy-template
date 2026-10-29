# Triangular paired scan and current-invalid winner recovery

Public **offline synthetic** evidence for policy v9,
`source-covered-pair-triangular-recovery-v1`. Live authorization is false.
See `SUMMARY.json`, `REVIEW.json` and
[the report](../../../docs/security/TRIANGULAR_PAIR_RECOVERY_20261029.md).
Fixture IDs and all-one logical key parameters are public test inputs, not
current chain identities or private wallet recovery material.

The candidate authenticates every unordered remaining pair once, derives its
orientation from committed side/kind, and preserves whole-order Book price/time
and NFT buyer priority. Five members require ten comparisons/three scan UPSs;
three remaining members require three comparisons/one UPS. A completed best
certificate plus actual current-invalid CFC predicate permits one-member early
refund, then an exact remaining-set rescan. Valid winners cannot be skipped.
Normal expiry minimum/full-page/terminal-tail refund rules remain unchanged.

## Evidence map

- `run/fixtures-v2/`: final generated source, ABI, compiler output, independently
  checked foreign heights and versioned key policy. The earlier fixture build
  failure remains separate; it does not validate the final key.
- `run/components-v1/`: ten conditional positive proofs and twelve rejected
  witnesses for one, two and five members near U124 boundaries. These are
  ordering components, not standalone source authentication or financial UPSs.
- `run/full-ups-v1/`: eleven accepted originals followed by a retained failed
  cancellation-tail refund. A test planner used raw snapshot scope v1 instead
  of sealed-source scope v3; the key rejected the bad root. VM success alone
  did not establish membership authorization.
- `run/full-ups-v2/`: final set of 44 accepted complete UPSs, 22 per market.
  Eleven originals were reverified/reused without generation; the remaining
  33 originated in this continuation. Each market has a normal two-fill path,
  a separate cancelled-winner/next-fill/full-refund fork, current fee-funding
  and deadline refund forks, no-match carry, enrolled recovery and source timeout.
- `run/reuse-v1/`: application-v5 exact complete-proof revalidation with positive
  proving fallback disabled. All original requests/public proof bytes and source,
  session, state, nonce, fee and endpoint bindings remain exact.
- `run/optimized-key-v1/`: exact saved v9 signature verification and six coherent
  attacks with recomputed stacks/signature contexts: non-winning buyer,
  changed rejection nonce and disabled rejection bit.
- `run/legacy-pair-key-v1/`, `run/legacy-amm-curve-key-v1/`: four saved old keys
  remain valid; twelve coherent priority attacks reject, without regenerating
  positive legacy CFC/UPS proofs.
- `run/legacy-global-reuse-v1/`: all 42 saved v8 paired full UPSs remain valid
  under the final source, with no proving fallback.
- `run/network-v1/`: public RPC observations, captured native leaf/code and
  frozen-SDK necessary compatibility checks. This is not runtime/finality
  attestation, a new deployment or an ordinary-wallet acceptance test.
- `run/public/`: plan, identity/binary/environment digests, all failures and
  process-memory samples, exact-replay/hash audits, independent Cartesian/BigInt
  audit, measurements, readonly final RPC status and the unclosed live gate.
- `run/builds/`: immutable application-v1..v5 source/lock snapshots, dependency
  export manifests and binary digests. V3/v4 generated the original final-key
  proofs; v5 adds a common host-domain guard, its regression and revalidation.

Ordinary recipient claims execute actual FT/native/NFT bytecode in VM only.
There are no ordinary-wallet signatures, live receipts or browser payment tests.
`intent.json` is an offline proof-preparation intent, not a live broadcast intent.
Forked histories must not be reported as one account-state chain or six real
network trades. Requests are synthetic and must never be sent to an RPC.

The complete attempt budget is 23 for Book (22 accepted plus the retained domain
failure) and 22 accepted for NFT, below 24 each. Standalone attempts are ten
positive components plus twelve component, six v9 key and twelve legacy key
rejections: 40. Reverification of saved positives creates no new positive proof.
No live registration, deployment, faucet, financial broadcast or real PSY/pUSDT/
NFT movement occurred. No Node, SDK or old contract was changed.

## Integrity and reproduction

Verify/decompress all indexed artifacts into a **fresh** directory:

```sh
python3 unpack.py /absolute/fresh/evidence-directory
```

The index binds original/public/compressed SHA256, sizes and path redaction.
Duplicate public bytes share blobs. Text paths may be redacted; exact request
and proof bytes are unchanged. Root `SUMMARY.json` and `REVIEW.json` are convenience
copies of their indexed `run/public/` versions. Original-run and final-set
pre-replay manifests bind 91 and 343 unchanged files respectively.

Run the independent structural/BigInt reference audit separately:

```sh
node batching/checkpoint-stream/audit-optimized-pair-evidence.mjs \
  /absolute/fresh/evidence-directory/run/full-ups-v2
```

Archive integrity, a report flag or this reference audit does not cryptographically
verify an Endcap or authorize signing/broadcast. Native SDK plus fixed resource
verification and coherent key tests are documented in the report. Source code
matches the immutable snapshots; use the frozen toolchain/config/thread pins.

The allowlist excludes raw signing/CFC witnesses and real wallet keys, mnemonics
or recovery files. Public key-proof/Endcap bytes are proofs, not secret witnesses.

## Remaining boundaries

Coverage/priority is relative to the complete authenticated source set frozen
at C, not all attempted admissions or current inclusion-tip state. New source
coverage remains four accounts per UPS; actual network inventory and C+32
feasibility are not established. Within-domain current cancellation/deadline/
funding invalidity is handled; native counter domains, dependency/integrity
failure and post-signing precedence do not gain an unsafe bypass.

The synthetic native fixture has different full identities from the current RPC
leaf by design. New live bindings and wallet resources are required, alongside
reviewed snapshot-admission/cancellation/version enforcement and a bounded real
plan. RPC reachability/native decoding alone does not open the financial gate.
Whole scans remain O(N²); no matched overall speedup, p95, real TPS, atomic epoch,
cross-vault atomicity, cross-machine or production conclusion follows. No separate
human security audit is claimed.
