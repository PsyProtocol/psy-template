# Formal market wallet integration — 27 October 2026

## Delivery scope and remaining sequence

Starting application commit: `29f2ad1569f286fd147ae953d49386dec3d36c40` on
`markets-batch-capacity-recovery-20261020`. Starting wallet commit:
`075703d2162f75f1cae293f421b84704e141421d` on `wallet-security-20261016`.
Both working trees were clean. No financial or proof task was running. Existing
UI and read-only gateway processes were left untouched. Root remains the sole
financial owner. The user chose to continue code that does not require wallet
unlock; the dedicated browser session remains handed off.

The frozen SDK is still `c92880c8b6e2c8d392f19368bc8801a2584fd427`, consumed
client `b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. No Node source, dependency pin,
old contract, original proof or historical evidence was changed.

| Area | This delivery | Still required |
| --- | --- | --- |
| Formal wallet background | Owned verifier, confirmation, exact transport and recovery routes connected | Actual extension acceptance with a reviewed current-instance release |
| Resource installation | Fresh-output build tool verifies fixed public bytes and actual compiled verifier identity | New registrations/contracts, their ABI/root/key bindings and a reviewed static release |
| Current chain | Read-only roots and verifier metadata remain equal to archived preflight | Fresh preflight before each future financial phase; runtime/upgrade authorization evidence remains external |
| AMM user journey | Page protocol wired to wallet-owned operations with unknown-result recovery | Real approval, exact send, confirmation, ordinary-wallet claim and fault acceptance |
| Curve / Book | Shared wallet route and visible action-specific limits | New-instance complete UPS and real settlement/claim acceptance |
| NFT | Write route stays closed; no accepted confirmation policy | Same-UPS collection/token/metadata/listing/price identity assertion |
| Two-pool / performance | Existing workflow and evidence retained | Current-chain success/exit/intermediate-asset recovery, then matched cold/warm measurements |

This closes a source integration milestone, not live market or production
acceptance. The checked-in installed release is explicitly `null`.

## Wallet-owned authority and exact approval

The formal background reuses `createMarketWalletService`; it does not introduce
a parallel prover or invent SDK methods. Public routes require the browser's
sender origin, the approved unlocked account, exact argument counts and original
intent identity. The page cannot supply a verifier, broadcaster, resource URL or
verification report. Internal final approval is deliberately not a public action.

Preparation, verification and broadcast participate in the existing account
queue and browser-origin lock. The wallet checks the selected signing context
again after final approval. A busy approval queue rejects instead of entering a
queue cycle. This is local browser coordination, not cross-machine acceptance.

The wallet-owned approval hash covers the exact public request/plan, complete
ordered calls, verified fee, nonce, deadline and prepared/request identities.
The primary view shows asset debits and binding limits: swap minimum, LP minimum,
both withdrawal minima and LP burn, whole-order input/output, or Curve lots and
quote limit. Unknown policies and NFT actions reject. High-limb amounts remain
integer strings; the existing U124 parser handles token amounts without floats.
The plan and ordered call disclosure remains available for detailed review.

The existing native verifier still checks fixed Endcap/common data, each CFC,
recursive/sign proof, actual ordered inputs/caller, session/sig_hash and state
endpoints. Endcap validity alone is not accepted as call authorization. This
milestone changes wiring and public confirmation terms; it does not regenerate
or relabel the previous synthetic UPS proofs as live acceptance.

The exact request and public capsule precede verification in durable storage;
the exact broadcast intent is persisted/read back before one send. No raw
hydrated trace, private key, mnemonic or signing witness enters the durable
public projection or approval message. ACK remains unresolved. Lost responses
and restart recovery use the original request/content identity, historical end
leaf and common nonce. No replacement, generic transfer fallback or automatic
resend was added. Missing resources do not erase history. Wholly unbroadcast
preparations can be cancelled; unresolved requests retain their safety hold.

## Explicit release and reset-chain identity

`market-client/wallet/vendor.mjs` accepts either its unchanged historical pair or
an explicit pair of reviewed market/AMM directories inside the application review
tree. It requires the pinned registry, each ABI byte hash, each RPC configuration
byte hash, and identical network/chain domains. There is no directory search,
SDK switch or failed-validation fallback. The wallet vendors 22 source/declaration
files plus bundle and source inventory, with exact source hashes.

An explicit `mainnet-beta-reset-20261027` client profile uses the same frozen SDK
and testnet magic. It requires checkpoint-1 root
`919896e18690246e20307f68cf2e5725aee496755366bbafff88eccaea975f12` and the entire
reviewed native code/layout/function/height/field/slot tuple. Historical profiles
and registries are retained unchanged. Layout slot observations now accept exact
safe integers, including the actual native count 8,594,128,984, and reject rounded,
overflow or mismatched values. Checkpoints and heights retain their u32 bounds.
This profile is plumbing for future reviewed instances, not permission to reuse
old IDs or transactions on the reset chain.

The wallet build-time installer requires exact descriptor fields and hashes for
bundle, pack, build report, WASM and sealed glue. It checks registry dependencies
against source-derived code/layout/function/count data, initializes the exact
hashed WASM and compares its compiled SDK/network/pack identity. Network magic is
parsed losslessly. It emits a fresh static module and public release inventory;
it never edits the wallet source, fetches resources, signs or broadcasts.
Activation is a separate reviewed source change. The installer was exercised with
historical public resources only; those outputs were not activated and are not a
new-chain four-market release. A native-only pack cannot satisfy all market
resource requirements. NFT write capability remains false.

## UI behavior and test boundaries

The existing AMM and other market plan panels now share a wallet execution
component: check capability/history, prepare, verify original capsule, review in
wallet, one exact send, and original reconciliation. Capability checks include
registry, chain and enabled market identity. Account/record changes remount the
component. A duplicate click is locally suppressed; wallet locks remain the
authority. Confirmed requests explicitly require refreshing settlement and claim
state. The page does not turn ACK, proof completion or a predicted balance into a
trade-success label. History remains visible when a matching release is absent;
reconciliation remains closed until its reviewed resources are available.

Application protocol tests use mocked HTTP/crypto adapters where stated. Wallet
unit tests use simulated approval/runtime dependencies. Server-rendered limit
checks are static markup checks. The dedicated installed extension was observed
locked, then handed off; no actual approval or financial browser journey was
performed. A build identity check in Node is not extension execution acceptance.

The application client/wallet/gateway suite passed 95 cases; the dapp market
protocol suite passed 50. The selected-cohort wallet suite passed 728 cases with
one existing skipped case across 65 files. Resource-installer tests passed two
cases. These are source/protocol regression counts, not live financial evidence.
Dapp production build, wallet SDK/typecheck guard and staging build passed.

Reproduce with the declared Node 24 runtime: `node --test
market-client/*.test.mjs market-client/wallet/*.test.mjs
executor/gateway/*.test.mjs`, `npm --prefix dapp run test:markets`, and
`npm --prefix dapp run build`. For the wallet, reproduce the frozen cohort
layout specified by its SDK manifest, then run `npm test`,
`node --test scripts/install-market-release.test.mjs` and
`npm run build:staging`; do not substitute the unrelated local sibling SDK.

See the public evidence manifest for successful and failed invocations, exact
tested source and reproduction inputs. The initial system Node 18 invocation
failed because Web Crypto was unavailable; the declared Node 24 runtime passed.
Earlier type/build and lossless-parser installation failures remain in the
archive and are not counted as successful acceptance. Vite's large-chunk warning
is retained, not claimed resolved by the native resource work.

## Current RPC and faucet observations

Realm 0, realm 1, checkpoint-1, native leaf and published Endcap metadata remain
consistent with the reset-chain preflight. The guessed `psy_get_faucet_config`
read returned method-not-found. Reading the frozen implementation identified
`psy_get_psy_faucet_config`; that read reports enabled, contract 5, a grant of
1,000 test PSY, a 120-second window and no Turnstile requirement. This is service
configuration observation, not a successful grant or a spending budget.

No faucet claim, registration, deployment, signing, transfer, settlement or claim
was attempted. Actual fills, fees and financial operations are zero. The old
unknown grant is still historical UNKNOWN and was not retried. Current-chain
queries cannot resolve it. Curve 11 remains historical quarantine.

## Next acceptance and external boundaries

1. Publish source and reproduce the vendor output from the published application
   commit before publishing the downstream wallet delivery.
2. On resuming live acceptance, declare fresh-instance counts, fee budget and
   stop conditions. Obtain only current-chain QA identities and assets; bind all
   roots/keys/ABIs and generate a matching static release after actual-bytecode
   and full-UPS gates. Do not activate historical resources to bypass this step.
3. In the actual ordinary-wallet extension, validate refusal, freshness changes,
   exact send, unknown result, restart, cancellation/refund and local competing
   contexts, then complete the AMM claim before the other markets.
4. Preserve NFT closure until its in-UPS identity condition is implemented.
   Complete current-chain composition recovery before performance claims.

Runtime binary/image attestation, effective upgrade-RPC authorization and its
unauthorized/replay rejection evidence remain external service-owner deliveries.
Published RPC compatibility data does not prove those properties. Random ordering,
global pre-enqueue inclusion and cross-machine coordination remain outside this
milestone. No reliable p95, chain TPS, general speedup or production claim follows
from these tests. No new matched performance sample was collected.

[Public source, regression/build logs and read-only observations](../../executor/verification/2026-10-27-wallet-formal-integration-v1/manifest.json).
