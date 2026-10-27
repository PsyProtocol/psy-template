# Reset-chain AMM bootstrap and registration audit — 28 October 2026

## Source milestones already published

The application policy boundary is published as
[`40d1a212`](https://github.com/PsyProtocol/psy-template/commit/40d1a212e85068f4c498579cc77d83f0b0323582),
with the coordinated generic wallet renderer/control delivery
[`5c15a9d`](https://github.com/PsyProtocol/psy-wallet/commit/5c15a9df9d5c47c4df449988ab7cb89b5d397b32).
The exact composition slot-capacity correction is published as
[`9e1dc2ad`](https://github.com/PsyProtocol/psy-template/commit/9e1dc2adfdfd1dc5276d5a9f0e7d9f2063259dac).
Current branches and SDK `c92880c8b6e2c8d392f19368bc8801a2584fd427` are unchanged.
No Node, SDK source/pin, old contract or original artifact was modified.

## Budget, sole owner and actual actions

Root was the only financial owner. No earlier financial/proof job was running;
UI, read-only gateway and unrelated processes were not restarted or interrupted.
The case was declared before execution: two ordinary identities, one future AMM
key/vault, two QA FTs and one AMM; at most three registrations, three deployments,
two faucet requests, 16 ordinary/vault UPSs, 20 test-PSY network fees, six test PSY
of escrow/fee reserve, and zero existing pUSDT spend. These are ceilings, not an
authorization to skip any actual-bytecode/initial-layout/full-UPS gate. The
bootstrap subphase enabled only one new ordinary registration and one subsequent
faucet request; it enabled no contract deployment, signing, spending or claim.
Unknown results halt and retain original identities rather than trigger retries.

| Actual case result | Value |
| --- | --- |
| New local ordinary identities | 2; restricted local files, never published |
| Registration sends / independently matched registration | 1 / 1 |
| Registered issuer / registration-tree index | 223232 / 728 |
| Faucet sends / confirmed grants | 1 / 0 |
| New contracts / transaction UPS sends / market fills / ordinary claims | 0 / 0 / 0 / 0 |
| Controlled account UPS fees / existing pUSDT spend | 0 / 0 |
| Faucet operator fee | Not independently evidenced; not a global zero-fee claim |
| Financial continuation | Stopped, original faucet send lock retained |

The new recipient key is independent of all old-chain unknown requests. No old
faucet request, deployment, registration or payment was replayed. Curve 11
remains historical quarantine. QA FT/NFT issuance has not started, test PSY has
not been claimed, and existing pUSDT was not touched.

## Registration is not user-state initialization

The first bootstrap script invocation failed at module resolution before any
operation. Its corrected version sent one registration through the frozen SDK,
saved the original public request/intent and received an `ok` admission reply.
An early audit then saw a public-key mapping but a zero public key in the user
state leaf. It stopped before requesting faucet. A bounded read-only retry of
that mistaken user-state criterion is retained as unresolved evidence, not a
successful acceptance or a second registration.

Source inspection established the correct distinction: registration writes URT;
a first UPS uses the SDK's register-user start circuit to create the initial
user-state leaf. A zero GUSR leaf is therefore compatible with a registered key.
The corrected audit resolves the original public key to user 223232 and uses
`get_registration_id_from_user_id` from the frozen SDK, obtaining index 728.
It matches the indexed original registration receipt and verifies membership.

The new application-only `registration_checkpoint` module and
`verify_registration_checkpoint` CLI verify:

- Explicit expected chain instance, user and original public key.
- URT index and height from the frozen SDK, exact value/key equality and Merkle proof.
- Checkpoint global-state roots hashing to the captured checkpoint leaf.
- Both checkpoint 1 and the target checkpoint leaf in the same explicitly supplied
  checkpoint-tree root, with exact indices, values, heights and Merkle proofs.
- A bounded public input and create-new-only output; no signer, prover or write RPC.

The final live audit used target checkpoint 1806 and tree root
`cfa8517d4b54c9ced8bf78fa679ae154d88f4726cbe72189bbd71f4693a8c442`.
Its genesis state root remains
`919896e18690246e20307f68cf2e5725aee496755366bbafff88eccaea975f12`.
The result proves membership **relative to the supplied RPC checkpoint root**;
it is not a consensus certificate, service-image attestation, full UPS,
initialized user state or permission to spend. The first partial helper is
retained locally as a narrower candidate; the final helper additionally binds
both checkpoint proofs. Actual captured-state mutation tests reject changed
checkpoint/index/user/key/root/domain and oversized input without success output.
Two selected Rust tests and the locked offline CLI build pass; no old business
proof is rerun for this audit.

## One faucet request and an external proving failure

After registration membership and indexed receipt matched, the single faucet
request targeted the new verified identity. Fresh chain/registration/config reads
preceded it. Exact UTF-8 request bytes and broadcast intent were written, synced,
read back and hashed before a create-new send lock and one HTTP call.

Request SHA256:
`85332da2e78775c0653737658234df46df80a5e326ee3440afb81879ba2d286d`.
The configured grant is 1,000 test PSY, contract 5, method `faucet`, with Turnstile
not required. The response is HTTP 200 / RPC error 1, `faucet operator submit
failed`, with internal `prove_ups_start` proof-witness assignment conflict. No
transaction identity or successful grant receipt was returned. An error message
alone is not proof that no delayed execution can ever occur. No second send,
replacement recipient, alternative payment or automatic account release followed.

The public archive contains a whitelisted error projection and the original
response's byte hash. Raw server diagnostics contain unclassified proof-wire
values; they remain local mode0600 and are excluded from publication, along with
both QA secret files. No private key, mnemonic, signing witness or raw hydrated
trace is included in the archive. Original diagnostics are not overwritten.

## Remaining first-session wallet gate

The current public verifier exporter includes the regular `ups_start` key.
The frozen SDK selects a distinct `ups_start_register_user` circuit for a first
UPS with a zero stored user leaf and URT membership. First-session verification
therefore needs a separate pinned start variant and complete linked UPS tests;
existing initialized-user synthetic proofs do not establish that acceptance.
The current source must not remove start-leaf/key checks to make it pass.

The follow-up must authenticate the register-start verifier/fingerprint, bind its
URT-backed key and empty stored leaf, preserve full stack/signature/session/nonce/
expiry/endpoints, and handle native fee credit only when it is proved by the
exact approved claim path. Incoming Outbox is not spendable before inclusion of
the claim. Native/WASM resources, ordinary claim, fresh transport and actual
extension need the same profile, with substitution/replay/fee/zero-state attacks.
The installed wallet release remains null; no financial UI entry is activated.
No browser takeover or simulated extension acceptance was used.

## Measurements: preparation only

These are two independent fresh processes with the same new binary, SDK and two
Rayon threads, in default `retain-v1` mode. They create local QA keys and no
transaction proof. They are not a cold/warm settlement comparison.

| Process | Session construction | Launcher through exit | Sampled family RSS peak |
| --- | ---: | ---: | ---: |
| QA issuer/LP | 41.617 s | 44.269 s | 3918.22 MiB |
| QA user | 41.311 s | 43.224 s | 4383.17 MiB |

One-second RSS sampling covers each key process from launch to exit. Shared
pages can be counted more than once and between-sample peaks can be missed;
these are not true physical peaks. The application-driver build reported 1m46s
with an existing dependency build cache; it is not a clean SDK compilation.
Registration/grant did not have full lifecycle memory sampling, and remote faucet
proving costs are not observable from this client. There is no warm task,
matched previous binary, actual fill, final receipt/claim or full settlement-round
sample. No p95, TPS, general speedup or memory-reduction claim follows.

## External delivery and next acceptance

The faucet service owner must correlate the exact request hash/recipient/current
chain and provide public evidence of acceptance, operator identity, source
checkpoint, selected start variant/fingerprint and either the exact transaction
identity/final inclusion or definitive rejection/disposal. No keys or witness
values are needed. Its first-session/operator state and checkpoint/registration
cache must be validated against the current chain; this report does not assert
that Node is the cause or propose a Node patch. A working bounded grant plus
recipient claim, correct nonce and fee/state evidence are the acceptance target.

The current service only exposes public config and claim in the inspected SDK.
A request-identity status lookup (or equivalent operator log evidence) is an
external delivery requirement, not an API we have called or fabricated.
Runtime binary/image and effective upgrade authorization/replay rejection
remain the other external trust-boundary evidence identified previously.

Continue offline with the first-session verifier/resources/linked UPS work while
original faucet reconciliation remains pending. After the gates and funding are
resolved, complete one new AMM journey and ordinary claim before Curve, Book,
NFT and current-SDK two-pool success/exit/intermediate-asset return. The
composition legacy SDK/domain/native-method gap remains open; its slot bound is
fixed separately. Do not extend Book-to-AMM or batch capacity to bypass these
prerequisites. Deterministic sealed-queue scope and local coordination remain
finite; no global fairness or multi-host guarantee is added.

[Public source, exact registration request/receipt, checkpoint proofs, bounded plans, logs and sanitized faucet evidence](../../executor/verification/2026-10-28-reset-amm-bootstrap-v1/manifest.json).
