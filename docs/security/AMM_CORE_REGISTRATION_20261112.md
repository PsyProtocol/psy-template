# Selected-order AMM registration and owned continuation

## Verified milestone

AMM **51**, using QA assets **49/50**, is included at checkpoint **103688**.
Its only selected vault is **1182848**. The registration's public-key mapping,
indexed receipt and independent membership verification at checkpoint **103796**
agree. Membership is relative to the configured checkpoint root; it is not a
consensus/L1 finality attestation or proof of a first financial UPS.

[Compact registration evidence](evidence/amm-core-registration-20261112.json)
pins deployment, registration, policy, binary and raw-archive digests. The raw
archive remains outside source Git as `amm-core-live-20261112-v1`. Earlier
unknown-outcome and failed attempts remain intact.

SDK `01b8f2b0a077367a7b9879baba1a72aea8ab5510`, client
`7058070057c3242b5d8b29e1a31d498aaa4202c0` and backend `736572e9` are unchanged.
The checkpoint-one anchor is
`81bac9934a1c18579519b5297c94c7e7d25cb53973ac67befefe8b7a86f96b5c`.
No Node, old contract or wallet repository is modified.

## Exact deployment recovery

The original deployment had no HTTP acknowledgement. Missing indexed evidence
was treated as unknown, not as permission to generate another operation.
The user then expressly authorized one additional POST of the exact original
bytes. A TLS trust-store failure occurred before any POST. The corrected sender
uses public CA roots from the already configured Node runtime, retaining both
certificate and hostname verification. The one actual replay returned HTTP 200
with the original content hash. A fresh indexed occurrence and contract endpoints
then confirmed AMM 51. Identical submissions cannot identify which HTTP request
was admitted; one observed occurrence is not two confirmed deployments.

The exception is exhausted. A possible duplicate must remain empty. Only AMM 51
may register/fund the selected vault. Core registration now uses the existing
explicit one-send transport; no redirect/retry or generic failure bypass is added.

## Current owned financial journey

The [unsigned stage planner](../../executor/acceptance/coreAmmJourney.mjs) and
[formal-route acceptance runner](../../executor/acceptance/coreAmmLive.mjs)
reuse ordinary resident sessions, the formal adapter and its persistent journal.
They do not implement a second market engine. Each fresh task preserves chain,
dependency, source, key, call/session, nonce, window, fee and endpoint checks.
Saved ordinary requests and formal reports are rebound to exact input/manifest,
journal and receipt identities before resume. Unknown results stop new operations.

The declared plan has 18 stages: 11 ordinary UPSs and 7 vault UPSs, with a
54 test-PSY aggregate stage reservation under the unchanged 60 test-PSY ceiling.
It uses two existing ordinary actors, one new vault, no faucet, at most 200 units
of each QA asset, 20/20 initial liquidity, one unit for a swap and one unit for a
cancel/refund. Full-proof, wall-time and sampled-process-family memory ceilings
remain bounded. The root is the only financial/proof executor.

[Compact preparation evidence](evidence/amm-core-preparation-20261112.json)
records confirmed preparation:

- Issuer setup: checkpoint **104186**, ordinary nonce **3**, actual fee
  **1.000011 test PSY**. Both QA assets are issued and sent to the recipient's
  Outboxes. The recipient cannot spend those Outboxes before claiming.
- Initial ordinary recipient claims: checkpoint **104232**. This is QA asset
  receipt, not an AMM swap output or browser-wallet acceptance.
- Activation funding: checkpoint **104250**. This deposits the exact Native
  fee and both refundable one-unit seeds; it does not initialize the vault.

The continuation still must close vault activation, LP, swap, output
claim, cancellation/refund, final ordinary claims and cohort conservation.
No successful complete market journey is asserted by this registration report.

## Preserved failure and diagnostic scope

The first issuer setup failed before any request/intent/broadcast was created.
Its generic SDK failure has **no established root cause**. Source review found
no eight-call limit or cross-asset CFC-cache collision; this does not establish
what caused that failure. Eight business calls later passed a pinned VM-only
diagnostic. That diagnostic does not complete fees, generate/sign an UPS or
authenticate finality. A supervisor report filename collided with its preserved
input after the VM operation completed; that reporting failure is retained.

One bounded, explicitly reviewed retry of those same eight business calls then
passed complete UPS verification and was included at checkpoint 104186. The
runner adopts that already included artifact by exact hashes; it does not resend
or count it as a new request. The original failed attempt remains on its own
branch of evidence. Public diagnostic projection exposes only allowlisted codes
and validated public call descriptors, never raw error/witness contents.

## Pre-session proof readiness

The next run stopped before its first vault call: the configured realm did not
yet return the user-tree proof for checkpoint **104259**. Its attempt contains
only `failure.json`, without request, preflight, prepared proof or broadcast
intent. That same checkpoint's proof was subsequently available when the common
observed checkpoint was **104275**. This supports a transient proof-materialization
gap for this attempt, not a permanent SDK mismatch. It does not explain the
earlier issuer failure.

[Readiness evidence](evidence/amm-core-proof-readiness-20261112.json) retains
the stopped run, exact old task and later read-only observation. Frozen SDK
startup chooses its account realm's latest checkpoint and does not recover this
specific missing-proof response. The application now narrowly classifies only
the exact pre-call error with no transaction artifacts. Before its one permitted
new session it requires that same checkpoint proof to be available, the original
window to remain valid and the original task to remain current. Normal SDK
startup still authenticates all fresh witnesses. The readiness RPC result is
never installed as a trusted proof, state or checkpoint root. No generic errors,
post-call failures or unknown broadcasts qualify.

A reviewed continuation adopts already confirmed ordinary transactions and
preserves the unexecuted old activation task. Its fresh observation gets a
separate versioned task/window; it cannot replace a broadcast transaction.
The 60 test-PSY/full-proof/instance ceilings and native binaries stay unchanged.
The stopped process took **487.133 seconds**, with **2,327,760 KiB** sampled
process-family RSS peak. Three confirmed preparation UPSs cost **3.000024 test
PSY**. This is neither a completed market journey nor a matched performance
comparison. RSS includes shared pages and is not physical-memory peak.

## Parallel work and acceptance boundaries

Four available agent slots are used: the root owns AMM execution/integration;
Curve, Book and NFT agents own isolated source work, host checks and peer review.
They do not start native builds, proofs, broadcasts or financial operations.
Active AMM source imports stay frozen throughout the owned journey.

Curve/Book selected-order helpers and NFT boundary regressions are code work,
not current-chain market acceptance. Formal adapters, new bytecode/key complete
UPSs and their own bounded live cases remain necessary before funding them.

Deterministic ordering remains active. No whole-market inclusion, qualified
random source, cross-machine coordination, browser payment, production readiness
or performance improvement is established here. CLI ordinary claims are not
browser-wallet acceptance. Existing unlocked fee surplus/LP exit limitations
must not be described as closed by this journey.
