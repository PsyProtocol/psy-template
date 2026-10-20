# Four-market release review: ordered evidence gates

Branch: `markets-batch-capacity-recovery-20261020`. Historical outputs in
`batching/evidence/20261020/` remain immutable. New experiments use fresh paths.
No Node worktree changes, online upgrades or live asset transactions.

## Stage status

| Stage | Completed | External dependency / unverified |
| --- | --- | --- |
| 1 SDK and upgrade authority | Stable SHA/source diff frozen; 30 consumed path crates and existing session-bound SDK delta made reconstructible in a fresh directory | Isolated offline/locked check and release build passed; four fixed40 public key identities reproduced; still not an upstream published SDK; runtime binary/image identity and actual authorization path not attested |
| 2 Complete proof cost | Prior baseline preserves per-call and end-cap timings | Compact key templates and 13 stack/session attack classes per market passed; sequential ABBA full UPS comparison running, no improvement claim yet |
| 3 Admission completeness | Selected batch root/order binding remains enforced | New bounded opt-in queue contracts compiled; explicit consent, scope/disposition and recovery VM tests passed; full vault admission UPS chain pending; scanner hints remain outside accepted scope |
| 4 Future random order | Deterministic mode retained | Unbiased authenticated future source, actual inclusion-before-seed evidence and anti-abort protocol unavailable |
| 5 Isolated network | Native called-method identities checked read-only | Held until dependency and upgrade-authority gates close; no registration/settlement/ordinary-wallet live receipt yet |

## 1. SDK source contract

The observed `release/testnet-stable` SHA remains
`6eb535003bdab1fcdb27386dbcb93e8aa9727998`. Three existing local dependency
changes provide: (a) reconstruction of the exact UPS signature digest including
full call stack/count, start/end/checkpoint/session context and network domain;
(b) witness representation; (c) prover population of that context. Stable source
lacks these APIs/constraints. API presence alone is not a security proof.

`batching/dependencies/session-bound-sdk-20261020/manifest.json` records the
30 path packages, 1,466 tracked source-file hashes, base commit, explicit existing
SDK delta, public network config, Cargo.lock hash, toolchain and host. The
materializer reads Git objects, applies only the recorded delta into a **fresh**
directory, verifies the entire consumed source list, and rejects overwrites.
The original Node tree and its unrelated MCP edits are preserved.

This produces an application dependency snapshot. It does not assert upstream
approval, public release, a bit-identical binary on another toolchain, or runtime
service identity. Existing negative digest/stack tests remain required.

### Evidence requested from owning teams

These are proposed evidence contracts, **not existing RPC capabilities**.
The checked stable coordinator/standard edge RPC declarations expose no build
version method. Branch confirmation alone does not close runtime identity.

1. **Runtime identity (operations):** authenticated deployment manifest for each
   coordinator/realm/edge: network magic/realm, Git SHA + dirty=false, image digest,
   executable SHA256, build lock/toolchain/config hashes, deployment time and
   operator signature/attestation. Validate the running image against immutable
   registry/build provenance, not a user-supplied version string.
2. **SDK release (SDK/security):** immutable reachable source revision or signed
   archive + SHA256; exact Cargo.lock/toolchain/config/features; session-context
   digest derivation; expected fingerprints; clean reconstruction commands and
   successful wrong-stack/count/network/nonce/checkpoint/start/end/root rejection
   tests. Do not release by removing constraints.
3. **Upgrade authorization (protocol/security/operations):** locate actual
   method-level control or authenticated proxy policy. Provide its implementation
   and effective deployed configuration, authorized identities, rotation/revocation
   and deny-by-default policy. Authorization must bind network, contract, expected
   old code/layout/whitelist roots, new roots/layout endpoints, nonce and expiry.
   If immutability is relied upon, provide a verifiable immutable flag/mechanism
   and demonstrate that *every* update route enforces it.
4. **Isolated rejection acceptance:** wrong signer; matching deployer field but
   no authorization; replay; expired authorization; root/contract/network/body
   substitution; bypass of proxy/direct edge route. Preserve request/body hashes,
   denial receipt/log and unchanged state. Never use a live update as the probe.

Source observations remain in `UPGRADE_AUTHORITY_REVIEW_20261019.md`; layout
validity/deployer equality do not establish authorization. Pinning roots in one
Executor cannot protect every public SD-key executor or close the final-read
upgrade race. Gate 5 remains closed without the above evidence.

## Stage 2: compact actual-call key experiment

The application `batch_compact` key retains 40 fully constrained logical slots
and the original canonical policy. A slot may be skipped in the *actual* stack
only when its identity is the exact market noop; the policy still constrains
its caller, zero arity and canonical input hash. Every other slot participates
in the hash chain and count, including the final native burn. The application
reconstructs the full session digest with the same network/user/nonce/start/end/
checkpoint/sign-context binding. No generic SDK check is removed.

This is a new circuit/fingerprint and **not** an in-place old-key optimization.
The ordinary SDK wallet route still requires exact configured counts; compact
execution is currently an explicit application fixture signing path. It must
not be enabled in the existing Executor by changing a profile label.

All four markets' operation templates and 13 actual-stack/session/padding attack
classes per market passed, both for V2 policies and extended admission policies.
An isolated rebuild also reproduced the four existing fixed40 public identities.
Full proof/cost acceptance remains separate. `compare-full-ups.py` freezes the
binary/artifacts/assets, runs fixed40 → compact → compact → fixed40 sequentially
at Rayon=4 with two fills/market, checks complete verified linked UPS endpoints,
identical contract state roots/fees, actual call counts and absence of compact
noops. It reports cold construction separately and never supplies chain TPS.
No other proving/compilation is run concurrently during that comparison.

## Stage 3: bounded authenticated admission candidate

`batching/admission/` creates distinct new layouts/code roots. The proven scope
is four or fewer **accepted** entries in one vault epoch, not every requested
market order. Explicit signed user consent binds epoch/cutoff/order nonce;
authenticated foreign-state reads bind order/vault/unconsumed nonce and terms.
Admission serializes in the shared vault. Sealing after the cutoff derives the
queue root from its full contents. Batch commitment must include the exact
sealed set and also binds queue root/epoch/cutoff/count. Cancellation is excluded
from the immutable terms hash; funding remains a later batch-commit snapshot.

Finish requires every accepted member to be a trade, refund or existing legal
Book/NFT carry. There is no arbitrary exclusion method. Root/outcomes fold into
a history commitment; historical blobs still require publication/retention.
Timeout leaves the queue sealed; only an expired **empty** epoch may abort.
Start/admit/seal/empty-abort maintenance templates include separately authorized
and claimed gas sponsorship with fresh payer nonce and bounded final burn.

Four VM groups passed: consent/omission/duplicate/forgery/root rejection plus
expiry/refreeze/results across all markets; AMM/Curve cancellation refunds and
empty recovery; Book/NFT legal carry; eight contenders for one anchor then
capacity enforcement. These are actual bytecode with a local compare-and-commit
model, not a coordinator scheduling or ordinary-wallet proof. Full vault
start/admit/seal/commit/settle UPS chains run separately after the controlled
comparison. Ordinary consent and sponsor authorizations in those synthetic
fixtures remain VM-only. Executor/ordinary-wallet compact signing integration
and live admission receipts are unverified; do not claim production readiness.

## Stage 4: randomness remains disabled

The generator rejects non-deterministic ordering and supplied seed/source
configuration. There is no local PRNG substitute. The existing coordinator
seed does not establish an unbiased source or anti-grinding guarantee.

Required future interfaces/acceptance (protocol/randomness owners):

- Authenticated historical inclusion proof for the **sealed queue root**, epoch,
  cutoff, vault and actual finalized inclusion checkpoint. A user leaf's source
  checkpoint alone does not prove inclusion before revelation.
- Future seed response containing network/domain, immutable target epoch/checkpoint,
  seed, generating participants/threshold or external beacon identity, authenticated
  inclusion/verification proof, finality/reorg policy and verifiable provenance.
  Seed checkpoint is derived from the earlier inclusion under a fixed rule,
  never selected from a range by the Executor after seeing seeds.
- Circuit verification of inclusion-before-seed, source proof and a complete unique
  permutation derived from domain/queue root/seed/order IDs with fixed tie rules.
- Negative proofs for historical/chosen seed, domain/root/epoch substitution,
  duplicated/missing permutation members, post-revelation addition and resealing.
- An anti-abort rule: timeout must retain the same root **and seed target** or use
  a predefined terminal disposition. A fresh epoch or sponsor may not silently
  redraw the same admitted scope. Define selective withholding/slashing or fallback
  liveness and its trust/economic assumptions; an unreviewed retry is not acceptable.

## Stage 5: live isolation gate (closed)

Runtime identity, SDK release review and effective upgrade authorization evidence
are still missing. Do not probe upgrades on the real network. Once those close,
reserve new contract IDs, key/fingerprint and vaults; verify dependencies/code/
layout/function whitelist and configured proof-length acceptance first. Capture
network/realm/checkpoint and immutable identities for every request.

The acceptance matrix must include registration, admission, commit/settle,
ordinary wallet recipient claims, cancelled/expired/partial funding refunds,
nonempty sealed-queue timeout/refreeze, two Executors competing for the same
vault nonce/root, lost broadcast receipt reconciliation against exact terminal
leaf, restart with persisted intent, and old-input replay rejection. Save
request/receipt bytes or canonical payload hashes, endpoint/fee/transaction counts,
state roots, source input hashes, confirmation checkpoint and final balances /
NFT identity. Never store private keys, mnemonics or wallet recovery files.

A passing test count is not a release decision: accepted-scope limits, runtime
upgrade trust, ordinary-wallet coverage, independent security review, retention
and liveness remain separate evidence gates.
