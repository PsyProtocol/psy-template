# Current-chain Native and ordinary UPS resource preflight

## Result

The current reset-chain Native identity is compatible with the frozen SDK's
actual bytecode/circuit construction. Eleven ordinary-ZK UPS/aggregation
verifier identities, whitelist paths and aggregation configuration match the
public proving service's captured registry. **This is not a completed user UPS,
deployment, trade, claim or authenticated running-build/finality result.**

The current financial blocker is the absence of verified test PSY for the owned
recipient at the pinned observation. The one original faucet request remains
unresolved; it was not resent or replaced. No new contract, key registration,
business proof or financial broadcast occurred. Real AMM UI settlement and
ordinary-wallet claiming remain unaccepted.

Branch: `markets-batch-capacity-recovery-20261020`; base:
`0731f98435df242103279fe8a3b790408b6784c0`. SDK remains mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, client source
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. All 2,756 frozen source files were
checked before application snapshots and at close. Node, SDK, dependency pins,
old contracts, wallet files and original evidence were not changed. No new
branch was created. The separate wallet security branch was not modified.

## 1. Native identity and the actual chain boundary

The fresh common checkpoint was **21882**. Both realms and the coordinator
returned checkpoint-one global-state root:

```text
919896e18690246e20307f68cf2e5725aee496755366bbafff88eccaea975f12
```

The exact Native leaf is:

| Field | Observed and reconstructed value |
| --- | --- |
| Deployer | Numeric user ID `0` |
| Code root | `5df4b10ccf59e25f3c44b4164edb9597455da33b925c3981881c280f2636ebd1` |
| Function root | `1ad1a069434cf058a419f4d874615c6fc47170471069f5d232874099ef13c5b1` |
| Layout root | `cd6931e5422fb07be012e3d0642bbffd0880bf499ecc87bcb822276d7426771c` |
| State tree height / fields / slots | `32 / 8 / 8594128984` |

This exact reset identity already has an explicit application profile:
`RESET_BETA_PROFILE` / `RESET_NATIVE_BINDING`. It is not a new SDK selection.
The UI still references an earlier market registry with checkpoint-one root
`24fe11…` and Native code root `f54490…`. That historical registry cannot be
reused on the current instance. It was preserved, not edited to match RPC.

The application binder reconstructs every one of the ten Native methods with
the unchanged compiler/circuit implementation, recomputes the complete code and
function roots, checks all layout endpoints and verifies Native contract
membership. Its new optional checkpoint context joins:

```text
Native leaf -> contract root -> checkpoint global-state roots -> checkpoint leaf
checkpoint-one leaf + current checkpoint leaf -> one captured checkpoint-tree root
```

Exact indices, values, heights and paths are checked. The final tree root is
`f2fb38127452e5a3021a8349919c6f0b8cb85dbd839078f6ab85714e2117bdd7`.
The binder explicitly labels this **membership relative to a captured root**;
it does not authenticate canonical history, an independently trusted chain
instance, finality, runtime provenance or spending authority. Omitting the new
context preserves the older CLI's narrower boundary, not a financial shortcut.

Final source and executables were sealed before replay. `SEALED-REPLAY-PLAN-v4`
records exact binary hashes; the final saved Native artifact and report are in
`native-bound-sealed-v4`. Mutable Cargo cache paths are not release identities.

## 2. User UPS resources are distinct from CST resources

The existing Endcap-only comparison was insufficient to exclude mismatched
start, registration, deferred or recursive resources. The new `ordinary-ups`
inspection uses the source-constructed SDK manager, with the unchanged compiled
domain, to compare:

| Scope | Exact verifier identities compared |
| --- | --- |
| UPS | Start, registration-start, standard CFC step, deferred CFC step, Endcap |
| Recursive aggregation | Single leaf, two leaves, two aggregations, leaf+aggregation, aggregation+leaf |
| Ordinary signature | ZK-signature minifier |

All eleven advertised fingerprints are recomputed and all verifier-only bytes
match. Four UPS whitelist paths, their root, recursion paths and configuration
also match. Runtime common-data bytes are **not exported by this API**; common
data continues to come from the frozen source. A real complete proof must still
verify against that fixed common data before any exact send. No remote key is
installed or adopted by this inspection.

ECDSA/personal-sign and private-note/deposit-claim verifier roles are explicitly
uncompared in this ordinary-ZK scope. NFT financial writes remain closed.
Positive metadata cannot authorize a call stack, session, nonce, fee, signature,
state endpoint or broadcast. Both `canSign` and `canBroadcast` remain false.

The independent source audit confirms that the frozen checkpoint RPC returns
the stored **cumulative kind-32 CST** proof. It is not an alternative reward-tag
final wrapper. The public user `psy_get_circuits_data` API has no CST verifier
export; system proving methods are not a read-only CST export either.

The preserved 18504/18505 failures are not repaired or reclassified. They were
not rerun with guessed keys. Their running resource/record correspondence,
canonical finality and qualified randomness still need the separate
[upstream delivery](UPSTREAM_CHECKPOINT_RANDOMNESS_HANDOFF_20261030.json).
They must not be confused with the eleven current user-verifier comparisons.
Deterministic AMM acceptance retains its actual user-UPS/identity/receipt gates;
this work does not add CST as a substitute or remove any financial check.

## 3. Funding: registered does not mean initialized

The historical funding recipient remains:

```text
User ID:         223232
Public-key hash: 97a9f5724e2f2ea4a7a59c884b9e6f79c7978016629519bae26e96e8b681d834
URT index:       728
```

A fresh registration-tree and checkpoint replay succeeds at 21882 using the
previously published, hash-checked registration verifier. The public-key index
returns this same user. Its stored user leaf has zero key/balance/nonce; an empty
stored leaf is compatible with a registered first-session identity. A separate
metadata lookup by user ID returns “public key not found”; that response does
not override verified registration membership. The capture summary now separates
`userStateInitialized` from `registrationStatus: not-queried` and never labels a
zero leaf as unregistered. An earlier commentary inference was corrected.

The original faucet request remains:

```text
85332da2e78775c0653737658234df46df80a5e326ee3440afb81879ba2d286d
```

The configured grant is 1,000 test PSY. The preserved service response says its
operator failed during `prove_ups_start`, without a transaction identity.
The service's exact historical/current advertised operator inventories agree
(100 accounts). A bounded reconciliation reads all **200** sent/claimed cursors
at 21882, under the verified Native layout: every pair is zero, total known
claimable amount is zero, and no failed read is replaced with zero.

This finite inventory is not proof of all possible incoming transfers, absence
of delayed service work, or final disposal of the original request. The original
send lock remains intact. No new faucet, replacement recipient, re-signing,
payment or automatic account release occurred. No QA FT/NFT or pUSDT was spent.
The local protected QA key remains local and was not exported.

A request for an independently funded **20 test PSY fee ceiling** was presented
with the verified recipient identity. No transfer or approval is assumed from
elapsed time. Any later funding must be freshly checked and claimed, with an
explicit funded execution/escrow budget, before a new deployment/settlement
phase. The current read-only phase spends zero PSY.

## 4. Application fixes and real browser checks

- Added a bounded Node collector using the existing runtime's verified TLS,
  fixed source-declared endpoints, read-only methods, exact integers, one attempt
  per read, fresh files and raw failure retention. Python OpenSSL and libcurl
  handshakes failed first; Node succeeded. No TLS verification was disabled.
- Added checkpoint context checks to the Native binder and full ordinary-ZK
  resource comparison to the existing inspector. Existing keys/common data and
  call/session/state/fee checks were not removed or replaced.
- Corrected read-only readiness classification for the exact already-pinned
  reset Native identity: `deployment-required`, not generic protocol
  incompatibility. The historical registry, `nativeRootMatchesRegistry: false`
  and both negative financial flags remain unchanged. Old market dependencies
  are not queried in this branch. No ABI/profile retry or writer is introduced.
- Restarted only the root-owned UI/read-only gateway after confirming no
  financial/proof worker was running. No chain service was restarted. The
  heartbeat was not re-enabled.

The real browser displayed **Accepted deployment required**, correct current
Native identity, and trading disabled. Orderbook → Orders → mobile Swap
navigation passed. Disconnected wallet history remained disabled; no simulated
wallet provider or financial request was used.

| Verification | Executed result | Practical boundary |
| --- | --- | --- |
| Fresh Native protocol + full binding | Passed; ten methods and complete roots/layout | Relative state membership; not consensus or spending authorization |
| Final sealed ordinary resource replay | Eleven verifiers plus whitelist/aggregation match | Metadata/source comparison; not a complete business proof |
| Current URT/checkpoint replay | Passed, index 728 | Registered first-session identity; not a funded/initialized user |
| New Rust checks | Three passed | Resource substitution and checkpoint context constraints |
| Collector checks | Six passed | Includes exact large integers, zero-leaf semantics, redirects, duplicate JSON, wrong identity, one-attempt retention |
| Focused readiness + collector | Fourteen passed | Overlaps the preceding collector checks; not extra payments |
| Client/gateway regression | Ninety-one passed | Includes the readiness cases; not live market transactions |
| Desktop / mobile browser | 1480×771 / 390×844 passed | No overlay/overflow or observed errors, rejections or console errors in the bounded navigation |
| Independent review | No actionable findings in five application files | Read-only review; reviewer did not rerun acceptance |
| Deployment / fills / ordinary claims | Zero | Current-instance real acceptance remains open |

The original failed ordinary-resource build (distinct Node/client QHashOut
wrapper types) is preserved. The fix compares the common typed HashOut payload
while retaining full verifier/fingerprint equality; no validation was deleted.
The funding scan saved its full summary before a console-only undefined-value
serialization error; all 200 responses and the original summary are retained,
and the scan was not repeated. All compiler failures, transport failures, test
logs and sealed replays are retained.
The first packaging attempt also stopped when its deny-list matched a literal
inside the packaging script itself. No archive was created by that attempt;
the original script/failure and corrected public-data packaging are retained.

There is no matched market performance experiment in this run. Build and
resource-inspection times/RSS are not settlement proof, confirmation, claim,
TPS or speedup measurements. RSS sampling includes shared pages and is not a
physical-memory peak. No production conclusion follows from these checks.

## 5. Required continuation and external delivery

| Owner | Concrete delivery | Acceptance requirement |
| --- | --- | --- |
| Funding owner or faucet operator | Budgeted test PSY to the verified current identity, or exact original request outcome with sender/content hash/receipt or terminal failure record | Fresh recipient/chain/outbox/balance checks; original identity reconciliation; no blind faucet resend |
| Application (next funded phase) | New QA FTs, new AMM and new vault/key; initial-layout/bytecode/full-UPS evidence; instance-specific wallet resources | Keep exact calls/caller/U124 amounts, session/sig_hash, fee, nonce, freshness and endpoints; retain one financial owner and bounded stops |
| Wallet owner | Approval/unlock only when a reviewed installed release and actual plan are ready | Actual extension confirmation, complete fixed verification, exact one-shot send and original receipt recovery; no history reset |
| Runtime/CST operator | Actual kind-32 verifier/common bytes, recomputed fingerprint, matching typed records/job references and public build/config/domain identity | Reproduce and verify the exact preserved CST records; no client Endcap substitution or unreviewed key adoption |
| Finality/randomness owner | Reviewed independent anchor/certificate plus exact inclusion and pre-release-seal evidence | Keep qualified random mode disabled until actual circuit/SD-key/UPS constraints and recovery are accepted |

Once funding is verified, resume the minimal deterministic AMM journey, then
the other markets and composition. Keep Curve 11 isolated. No old market or
unknown request is updated/replayed. Reuse immutable compiled resources only;
balances, witnesses, nonces, fees and session/state context must be fresh.

The genuine user endpoint remains: reviewed plan → wallet approval → complete
verification → exact broadcast → common-state confirmation → ordinary claim.
None of those financial stages is closed by the present preflight report.

## Evidence and reproduction

[Immutable public bundle and inventory](../../executor/verification/2026-10-30-current-chain-native-ups-v1/README.md)
contains the exact public Native captures, public verifier registry, chain/URT
paths, complete known-operator scan, Native artifacts, sealed-binary digests,
source-snapshot manifests, all failures/logs and browser evidence. Registry
publication explicitly checks its known public verifier/hash/path/numeric schema;
no wallet key, mnemonic, signing witness or raw private faucet diagnostic is
included. Old original artifacts are retained separately without modification.

With a fresh application snapshot against the frozen source cohort, reproduce:

```sh
cargo +nightly-2025-09-20 build --release --offline --locked \
  --bin bind_native_artifact --bin inspect_public_runtime_resources
cargo +nightly-2025-09-20 test --release --offline --locked \
  --lib --bin bind_native_artifact application_runtime_binding -- --nocapture
node --test executor/acceptance/captureNativeBinding.test.mjs
```

Use the established testnet profile/configuration and the archived arguments.
`inspect_public_runtime_resources CAPTURE FRESH_REPORT ordinary-ups` compares the
ordinary-ZK registry. The Native binder's last argument is the checkpoint
context. All outputs must be new paths. Source/configuration and proof-role
changes are not reproduction shortcuts.
