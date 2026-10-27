# New-chain protocol preflight and readonly UI

**The observed RPC is reachable, but the selected SDK cannot safely use this
chain. Isolation deployment and live trading are blocked before identity creation.**
There were zero registrations, deployments, faucet requests, financial UPSs,
asset movements or fees. No previous request was replayed. No Node source,
SDK selection, old contract, existing wallet policy or reviewed registry changed.

## Fixed inputs and observed differences

The application started at `4b048550` on
`markets-batch-capacity-recovery-20261020`. The selected session-bound SDK manifest
is `0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`;
all 1,466 source files, frozen build configuration and Cargo.lock were rechecked.
The prior SDK release/attestation limitations remain open. A branch name is not
evidence of the running service or a new release.

Six initial diagnostic reads returned HTTP 200. Realm 0, realm 1 and coordinator
heads reported checkpoint 2987, `next_contract_id=6` and `next_user_id=372`.
The checkpoint-one global chain root is
`24fe11facdc008ad5a6e6408da654217380b798af1ddb7df59845dfecd395942`.
The [previous recovery report](../2026-10-27-rpc-recovery-v1/README.md) already
established that the previous QA contract IDs are absent. They are not deployed
identities on this chain.

The new application-only `chain_protocol_preflight` reads captured public RPC
envelopes using the unchanged SDK's actual Rust types and bytecode decoder:

| Check | Observed result | Consequence |
| --- | --- | --- |
| Native leaf schema | `deployer: 0`; SDK expects a hexadecimal `QHashOut` string | SDK deserialization fails: `invalid type: integer '0', expected a string` |
| Native ABI | `transfer/2`, `claim/1`, `burn/1` replace required `simple_*` signatures | Existing market/wallet native calls are incompatible |
| Automatic fee burn | SDK uses method ID `2923993647`; deployed `burn` is `3998182541` | SDK automatic burn cannot resolve the required method |
| Bytecode and code root | All native functions decode; recomputed root exactly equals RPC `f54490d8ed6ccd5bb06f3c42193a5b11ce7bd252c9eae2c3697f9f3e483e26ee` | Confirms a concrete protocol difference, rather than an RPC outage explanation |
| Endcap key, full fresh UPS, upgrade authorization | Not verified | Financial readiness remains false |

These are necessary compatibility checks, not an exhaustive native protocol
attestation. No numeric-owner coercion, ABI substitution, fee-burn bypass or
negative deployment/update probe was attempted. The CLI saves a fresh report and
exits with status 1 on these captured inputs. That expected rejection is retained.

`DRAFT-DEPLOYMENT-v1.json` is a chain-scoped **draft**, with null contract, vault
and key identities. It separates proposed QA FT/NFT from native test PSY fees and
existing pUSDT. It cannot be loaded as an accepted live deployment. No wallet
identity or secret directory was created for this attempted phase.

## Real UI integration and validation

The loopback gateway now exposes `GET /v1/readiness`. It observes actual network
heads, checkpoint-one identity and native metadata; checks pinned application
files; and never authorizes or submits finance. A native/schema mismatch stops
before looking up old market IDs. Even matching native metadata requires a
reviewed checkpoint-one pin before market/dependency checks can succeed. Missing
pins fail closed. Only simultaneous reads are shared; completed observations are
not cached and consumers receive independent values.

The shared browser client validates exact response identity, bounded fields,
readonly flags and a 30-second freshness window. The English Psy UI shows actual
checkpoint/identity observations, manual refresh, expired/unavailable status and
disabled trading. Existing demo forms and unsigned plans remain explicitly
separate from network records. This is a real **readonly status connection**,
not a live balance/quote, accepted deployment, wallet approval or trading path.

Actual HTTP evidence returned `protocol-incompatible`, checkpoint 3100. Browser
keyboard refresh observed checkpoint 3152. One browser refresh also exhausted
bounded readonly retries during an RPC outage; trading remained closed. Network
availability was intermittent during this phase, not continuously healthy.

Checks completed:

- 74 client/gateway/staged-wallet regressions; 50 frontend tests; TypeScript and
  production Vite build; three native CLI unit tests.
- Browser Swap status, actual refresh, observation expiry, Liquidity keyboard
  navigation, nonblank page and no captured application errors in that window.
  DOM width checks found no horizontal overflow at the observed viewport.
- **Full desktop/mobile visual acceptance is incomplete.** Screenshot calls
  timed out twice. The browser runtime changed viewport dimensions during QA;
  a pointer click reported paragraph interception despite a correct DOM hit test.
  Keyboard refresh succeeded. DOM checks are not substituted for screenshots or
  claimed as complete responsive visual acceptance. Ego Lite 0.6.0.16 reported an
  available update; it was not upgraded.

The separate offline [candidate initial-layout resource experiment](../2026-10-27-initial-layout-cache-v1/README.md)
does not resolve these financial or visual gates.

## External delivery and remaining sequence

| Owner | Required delivery | Acceptance before proceeding |
| --- | --- | --- |
| Runtime and SDK maintainers | An isolated runtime compatible with the selected SDK, or a separately authorized/reviewed SDK migration with fixed source/package, configuration and circuit identities | Exact leaf/deployer semantics, native method IDs including automatic burn, request encoding and code/layout/owner trust boundary match; full fresh ordinary UPS and independent verification succeed |
| Runtime/security owners | Running service identity and actual deploy/upgrade authorization contract/configuration | Identify owner authentication/replay rules and provide isolated unauthorized/replay rejection evidence; no old-contract update probe |
| Wallet/application maintainers | The pending native call/session attestation adapter and accepted SDK/key release; existing baseline wallet build blockers remain | Complete approved stack, parameters, caller, nonce, fee, state endpoints and sig_hash/session binding; durable original-request recovery; no direct signing fallback |

After these requirements are satisfied, repeat the complete fresh preflight, then
create new QA contracts, vaults and keys under the declared budget. Verify initial
layout requests before submission; complete isolated full UPS settlement,
ordinary-wallet claims/refunds/recovery and public receipt/state/fee/asset audits;
only then bind the accepted registry and enable the reviewed UI write path.
Current deployment, live fills, claims, fees, network performance and production
acceptance remain **unverified**. No heartbeat was restarted.

## Evidence and reproduction

`MANIFEST.json` is an explicit public-only allowlist. Every compressed file has
both original and gzip SHA256. Original files remain under the persistent local
run directory named in that manifest; nothing was overwritten. Captured RPCs,
failures, plans, exact source snapshots, build/test logs and public UI observations
are retained. Binary hashes are public; executable bytes remain local.

Use the selected SDK and `nightly-2025-09-20`, unchanged frozen build configuration,
`PSY_NETWORK=localhost` and the archived Cargo.lock. In a **new** application
snapshot, restore `source/chain-preflight-v2-app` from the gzip files. Rebind its
Cargo paths to the same verified SDK snapshot without changing packages, disable
automatic unrelated binary discovery as in the archived Cargo.toml, and run:

```sh
cargo +nightly-2025-09-20 test --release --locked --bin chain_protocol_preflight
cargo +nightly-2025-09-20 build --release --locked --bin chain_protocol_preflight
./target/release/chain_protocol_preflight \
  /absolute/public/native-leaf-response.json \
  /absolute/public/native-code-response.json \
  /absolute/fresh/native-compatibility.json
```

The final command is offline and should preserve a rejection report and exit 1
for these captured inputs. It has no network or financial transport. Do not
substitute new inputs while presenting them as this historical observation.
Application regressions use the existing Node 24 runtime:

```sh
node --test market-client/*.test.mjs executor/gateway/*.test.mjs market-client/wallet/*.test.mjs
cd dapp
npm run test:markets
npm run build
```

For UI-only use, the existing loopback gateway and Vite server remain on
127.0.0.1:5274 and 127.0.0.1:5273. The gateway has no attached financial adapter.
