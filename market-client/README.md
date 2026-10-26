# Public market access and exact user-workflow boundary

This module connects the existing dapp to a local **read-only** gateway and
shares exact AMM planning with the server. It does not enable financial actions.
Registry hashes and RPC checks are application bindings, not cryptographic state
proofs. Demo reserves/orders remain separate. No Node or chain SDK is changed.

From the repository root, with existing Node.js >=22.12:

```sh
node executor/gateway/server.mjs executor/gateway/example.json /absolute/persistent/unsigned-plan-store
cd dapp
npm ci --ignore-scripts
npm run dev
```

Alternatively `npm run gateway -- /absolute/persistent/unsigned-plan-store` from
dapp. The gateway listens only at 127.0.0.1:5274; the existing Vite app proxies
`/api/markets` to it. Host and Origin are checked; no CORS or arbitrary proxy is
provided. This is a local testnet integration, not an Internet service deployment.
No process signs, sends or controls a financial Executor on startup.

## Existing application interfaces reused

- `executor/publicState.mjs`: one common-checkpoint snapshot, lossless Felt/BigInt
  reads and existing in-flight coalescing. No completed balance/nonce cache is
  carried across requests.
- `executor/chainReceipts.mjs`: historical end-user leaf plus indexed content-hash
  receipt; missing history remains unresolved. An end-user leaf is not a content
  hash. Receipt-only recovery still works after a live dependency changes.
- `amm/u124/client.mjs`: exact `swapQuote`, `addShares`, ABI call arity and two-limb
  amounts. No Number conversion for quantities or invented LP decimals.
- `ExecutionJournal` / `executeCycle`: the independent future exact-user workflow
  reuses existing durable broadcast-intent ordering, restart reconciliation and
  same-payer locks. It is **not wired to the HTTP server or a live browser signer**.

`reviewed/staging-qa-20261026` preserves the original reviewed QA AMMs 2485/2486,
FTs 2483/2484, exact ABI/policy/dependency bytes and the same public RPC config.
PROVENANCE binds original paths and hashes. The SDK manifest remains
0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425.
No existing pUSDT or new deployment is introduced. Changing a local input or live
code/layout/function root, key mapping, token decimals or administration state
fails the read/planning check. Complete native proof validation is still required
before any financial action; matching ABI alone is insufficient.

## Public routes

| Route | Meaning |
| --- | --- |
| GET `/v1/status` | Reviewed registry, capability boundaries; no chain-health claim |
| POST `/v1/snapshot` | `{marketId,userId}`; fixed-checkpoint pool/user/Outbox/LP observations |
| POST `/v1/plan` | Fresh observations plus exact unsigned AMM calls; immutable record hash |
| POST `/v1/receipt` | `{userId,endUserLeafHash,minCheckpoint}`; original exact identity only |

The browser pins the registry, independently recomputes all unsigned plan calls,
amounts and digests, rejects stale/context-mismatched responses, and never changes
demo orders into live records. Only the same-origin fixed gateway path is used.
Two expensive requests at a time, 16 KiB input and existing RPC bounds apply.
Gateway-only upstream reads reject redirects and bodies above 1 MiB, preserve
exact numeric text and check JSON-RPC request/response IDs. The shared public
reader accepts this explicit transport; existing Executor callers keep their
original default transport and validation.
The unsigned plan store stops at 1,000 records; files are immutable and contain
public data only. It is not a financial journal, approval or pending payment.
There is no submit, arbitrary URL/path, wallet selection or Executor-control API.

The active `reviewed/staging-qa-20261026-account-v2` registry adds the existing
`open_remove`, `close_remove`, `release_unaccepted` and `request_recovery`
descriptors from those same frozen ABIs. `ACCOUNT-EXTENSION-v2.json` binds the
original registry and all unchanged inputs. No contract, key or SDK was updated.
Both browser and gateway pin its canonical registry hash:
`d1b7222f99aea7313b72f76aa21a4d43c25f35df96e7a640c27f5fbadb220423`.

Snapshot schema 2 includes actual native Outbox sent/claimed cursors, vault
consumption/recovery/batch state, LP ownership and existing token observations
at the same checkpoint. Older snapshots are rejected, not defaulted to zero.
`accountProjection.mjs` separates wallet balances, pending outputs and unused
deposits; it never infers a fill from a consumed nonce. Observations become stale
after 30 seconds and cannot be retimestamped for planning. A processed order is
not necessarily a fill; admission consent is not accepted queue membership.

AMM planning supports swap, add, raw-share removal, consent, cancel-request,
lawful unaccepted-order release, recovery enrollment, closure and FT/native claim.
Removal uses actual LP ownership and downward-rounded outputs for both assets;
it funds only market fee escrow and never transfers input FT. Release requires
cancellation and lawful consent closure, without moving funds. Recovery enrolls
the original payer only; the restricted Executor still needs authorized fees,
actual recovery and separate ordinary claims. Neither action reverses a trade.
New deposits stop if a previous order/consent/funding cursor is unresolved or
there is no open queue capacity. Cancellation does not remove a frozen member
or authorize immediate refund. LP and swap outputs credit the actual order owner;
arbitrary recipient intents are rejected. Checkpoint expiry is an explicit input,
never converted from demo minutes. The automatic wallet burn is separate from
market fee escrow and must be verified within the declared fee cap. Gas adequacy
and full UPS limits cannot be established from a quote or ABI-only plan.

## Browser wallet gap and external acceptance contract

The inspected `psy-wallet/src/content/webHook.js` supports public account,
network, build and user-ID reads, simulation and direct signing/submission. Its
current `getWalletBuildInfo()` returns buildId/debug strings, not a reviewed SDK
manifest or key/circuit identity. The market dapp uses public metadata only. It
compares realm/coordinator/services endpoints, name, magic and realm sizing, and
rechecks the selected account; this remains wallet-reported metadata, not chain
identity/proof attestation. It does not call the direct signer as a fallback.

A wallet/client integration owner must deliver the following capabilities (names
are proposed interfaces, **not currently available provider methods**):

1. **Exact prepare**: origin-approved account and intent; network/domain, reviewed
   dependency registry, all calls/arguments, fee cap, immutable start user/contract
   roots, wallet/order nonce and checkpoint expiry. Persist exact public request,
   full UPS and prepared manifest without broadcasting. Return opaque prepared ID,
   SDK/key identity, request/manifest hashes, start/end leaf, nonce, actual fee,
   complete stack including fee burn, caller and session/sig_hash bindings. Never
   expose keys, witness secrets or wallet recovery material.
2. **Independent verify/recheck**: actual reviewed bytecode and signature circuit,
   full stack/arguments/count/caller, session/sig_hash and public endpoints; actual
   fee <= cap. A fresh native recheck must bind exact start state, nonce, expiry,
   current code/layout/metadata and network. A returned boolean/capability string
   alone is insufficient; supply source/build pins and reproducible evidence.
3. **One-shot exact broadcast**: consume the same prepared identity and request;
   wallet-owned nonce coordination, durable broadcast intent before sending, no
   reproof/re-sign on transport uncertainty. A lost ACK returns the original end
   leaf/request identity, not permission to construct another payment.
4. **Original reconcile**: exact identity survives wallet/service/browser restart;
   historical receipt and common-state nonce/leaf visibility precede completion.
   A missing index is unresolved. Stale proof or explicit no-broadcast rejection
   needs separately verifiable evidence, not an inferred failure/retry.

`executor/gateway/workflow.mjs` defines the adapter seam and enforces these fields,
independent verifier callbacks, exact stack/fee, fresh state and durable journal.
Every transport boundary receives an independent data copy. Tests caught an
initial shared-call-object mutation and preserve its failure before the fix.
The default server cannot instantiate this transport or open financial actions.
It must be accepted with real bytecode, complete UPS and isolated on-chain
settlement/claim/refund/recovery before connecting it to UI writes.

## Remaining stages

Real RPC state is currently unavailable (HTTP 503). No new authenticated snapshot,
ordinary full UPS, wallet transaction, deposit, settlement or claim is accepted
in this milestone. Runtime image identity, upgrade authorization and browser SDK/
key attestation remain open. Full unaccepted-order recovery enrollment, funding
seeds and a healthy service status projection must be integrated with the formal
Executor; the expanded unsigned plans alone do not close every recovery path.

The two-pool controller remains a separate multi-UPS workflow. This gateway does
not make it atomic or attach its payer/fees. Orderbook, Curve and NFT Market have separate pinned QA account readers. Their
financial planners and live write integration still require the common accepted
wallet/Executor write boundary and AMM live path. Their existing matching/pricing/unique-sale semantics stay intact.

Tests: `npm run test:gateway` in dapp, plus `npm run build` and
`npm run test:markets`. Synthetic transport tests are explicitly not real UPS or
cross-machine coordination acceptance. No performance or production claim follows
from passing tests.


## Reviewed three-market account observations (2026-10-27)

`POST /v1/positions` is an optional public read route, used by the shared
`positionSnapshot.mjs` browser client via `/api/markets/v1/positions`. Its exact
request is `{marketId,userId,slotStart,slotCount}`. Reviewed isolated QA instances
are Orderbook 2497/vault 662720, Curve 2498/vault 302272 and NFT Market 2499/vault
1072320. These are observation targets, not new financial authorization. The
existing AMM registry is unchanged. The additional registry's canonical SHA256 is
`66666fc365674f18ef7c836a8a0fc00066082d0b824387cc38d8e7f33cad8dbd`.

`executor/gateway/buildPositionRegistry.py` creates a new destination from original
build/config/policy and later registration evidence, matching their hashes and
identities. It never updates a contract or overwrites original evidence. Original
BOUND registration/root flags remain false in provenance; later registration
records are separately checked. Historical registration is not fresh RPC proof.
The pinned assets are QA FT 2483/2484 with 18 decimals; NFT 2499 uses payment
QA-A 2483 and collection 2496, independently of demonstration form fixtures.

The reader fetches one common checkpoint, rechecks network, contract code/layout/
function roots, registered vault mapping and issuer metadata, and decodes complete
dual-Felt amounts. It returns the current user order, queue/lifecycle, funding and
FT/native pending outputs; Curve includes reserve/phase state. NFT ownership is a
bounded page of up to eight of 128 slots, with the four-entry delivery FIFO checked
against both cursors. It is never a complete inventory or global order scan.
Responses include exact user/vault state anchors. The browser independently checks
identity, shape, precision, cursor arithmetic, roots, bounded scope and freshness.
Unknown or changed pinned inputs and RPC failures stop the observation; no fixture
fallback is permitted. RPC-observed data is not cryptographically authenticated
state or spending authority. No transaction route was added.

The exact user workflow also explicitly compares schema-2 lifecycle/consumption
and recovery fields during fresh recheck, alongside existing roots and nonce.
Tests reject changed consumption, queue phase/readiness and recovery identity.
Existing state anchors already constrained chain state; this is explicit field
binding hardening, not evidence of a previously exploitable chain vulnerability.

The wallet source audit found internal `proveEndCapProof`/`submitEndCap` and
job-level separation. It did not find an accepted dApp-facing staged prepare,
independent verify, fresh recheck, one-shot exact broadcast and original-identity
reconcile protocol. A trace-step API can itself finish in `Submitted`; it must not
be treated as prepare-only. The current local wallet SDK dependency is outside
this frozen application snapshot. Do not replace dependencies or use direct
signing to bypass the missing integration. Details and unresolved implementation
work are in the [acceptance record](../executor/verification/2026-10-27-market-readers-live-v1/README.md).
