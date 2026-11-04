# Two-Felt FT private notes

Independent source: `src/main.psy.rs`. All 20 public U124 methods remain, plus
`private_transfer`/`private_claim` (22 total). `[low62, high62]` supports 0–18
decimals and at most `2^124−1` base units.

## Two note trees

The existing `PrivateNoteInclusionCircuit` proves one Felt amount. This profile
reuses it separately for nonzero low/high limbs; high notes have denomination
`2^62`. Both proofs use the same native circuit/checkpoint. Claim validates both
denomination leaves in one authenticated session path and credits atomically.
Invalid proof/range/nullifier rejects the entire claim.

| Property | Low | High |
| --- | ---: | ---: |
| Root Felt offset | 1174405224 | 1174405228 |
| Four-Felt root leaf index | 293601306 | 293601307 |
| Note amount range | 1–2^62−1 | 1–2^62−1 |
| Tree capacity | 2^20 | 2^20 |

Root leaf indexes are fixed proof public inputs, not caller choices. Using a low
proof for high fails session-root validation. Each note has independent nullifier
and note secrets:

```text
receiver = Poseidon(user_id, 1337, random0, random1)
note_secret_hash = Poseidon(nullifier_secret[4], note_secret[4])
commitment = Poseidon2(Poseidon2(receiver, [limb,0,0,0]), note_secret_hash)
nullifier = Poseidon(nullifier_secret[4])
```

Spent nullifiers enter the recipient-local `private_nullifiers`. Recipient binding
prevents another user claiming. Two limbs in one claim cannot share a nullifier.
Zero limbs create no note and require a zero nullifier. The client requires an
empty placeholder for the inactive limb; only the active path is serialized. Notes
cannot be spent twice, including when the recipient claims limbs separately.
The application defaults to claiming the full amount together.

**This hides note origin through inclusion proofs; it does not promise that all
amounts, balances, parameters, events or transaction relationships are invisible.**
Send events include sender/commitment; claim parameters contain amounts. Full
anonymity/amount confidentiality is not guaranteed and depends on published data.

## Client

`client.mjs` preserves BigInt and provides public/new private builders.
`preparePrivateTransfer` uses system randomness; callers must protect the bundle.
Never publish bundles, nullifier/note secrets or recipient randomness in logs.

```js
import {preparePrivateTransfer,preparePrivateClaim} from './client.mjs';
import {losslessJson} from '../arithmetic.mjs';

const {call,bundle}=await preparePrivateTransfer({
  contractId:NEW_PRIVATE_TOKEN_ID,
  recipient:RECEIVER_ID,
  amount:10n**27n+7n,
  hashProvider, // SDK Poseidon hashNoPad/twoToOne with BigInt hashes.
});
// Execute call, confirm, then obtain same-checkpoint note/state/user-tree paths.
const claim=await preparePrivateClaim({
  bundle,userTreeRoot,checkpointId,hashProvider,
  proveNote,        // Native proof, fingerprint, publicInputs and verifier data.
  addSessionProof,  // Add native proof; return its 16-bit session leaf index.
  getSessionPath,   // Read {index,siblings,root} from the current session.
});
// Execute in that same session. Do not insert another proof/call after path reads.
const wire=losslessJson(claim.call);
```

The default `compact-v2` claim has **86 Felt inputs**, below the selected SDK's
128-word transaction-introspection limit. With two nonzero denominations, the
low/high proof leaves must occupy an aligned sibling pair (even low index,
adjacent high index). The contract recomputes both leaves, checks the high leaf
against the first sibling, then folds the complete low path to the authenticated
session root. It still consumes both nullifiers and credits both limbs in one
call. A one-denomination claim uses that leaf's complete path.

When the first low leaf lands at an odd index, `preparePrivateClaim` inserts the
**same already verified proof** once more to align it, then appends the high
proof. It does not generate another native proof or fabricate a padding leaf.
Concurrent insertion, exhausted capacity or inconsistent paths abort preparation.
The caller must serialize access to that proving session and discard failed
preparation; no transaction is broadcast by this helper.

All nonzero proofs are added before final path reads. Commitment, nullifier,
public-input hash and path roots are recomputed; both roots must match. An
explicit `profile: 'legacy-v1'` retains the old 151-word encoder for historical
consumers only. It exceeds the current SDK limit and is never an automatic
fallback. Compact-v2 changes the method ABI/code and requires a **new deployment,
key and verification resource pack**, not an update to an old token. Old
single-Felt `ClaimBatchItem::PrivateTransfer` encoding cannot be reused directly.
The SDK generic external-proof/session-call APIs support adaptation. At this
historical implementation milestone, no dedicated MCP two-limb bundle entry was
available and no MCP/wallet service was modified by this module.

`vm-tests` binary `prove_note_u124` generates/verifies native proofs offline:

```sh
prove_note_u124 PRIVATE_WITNESS_JSON NEW_PROOF_JSON
```

Input is `PrivateNoteInclusionInput` with consistent same-checkpoint paths. Output
contains proof/verifier data/fingerprint/public-input hash, never witness. Auxiliary
four-Felt hashes are decimal strings; explicitly `.map(BigInt)`. `noteProofJson`
and `verifierDataJson` are opaque strings for Rust parsing. Do not JSON.parse and
re-encode their internal Felts in JS.

## Build and verification

The selected `mainnet-beta` commit is `01b8f2b0...`. Its VM/circuits implement
checkpoint-state and session-proof roots, while its raw source compiler lacks
the two frontend calls. `token/compiler/private_context.rs` provides explicit
application-owned lowering. It leaves the frozen SDK/Node sources unmodified.
The adapter itself changes no calldata, amount, nullifier, receiver or assertion; it
binds the checkpoint input to `GetGlobalStateRoots[8..12]` and the proof paths to
`GetSessionProofTreeRoot`. Its two temporary frontend marker hashes must be
replaced in the final bytecode. Canonical typed indices, state-command timing
and the complete generated contract code are checked before serialization.
The separate compact-v2 source change replaces two paths with the authenticated
pair construction described above. The raw SDK frontend remains unsupported;
this application compiler is an explicit, versioned release component.

```sh
node token/wide/private/generate.mjs --check
npm run test:token-wide-private

# Materialize the exact selected SDK first, using batching/dependencies.
# Build the application adapter against it; no upstream compiler patch is applied.
npm run build:token-wide-private:toolchain -- /fresh/private-toolchain \
  --source /frozen/sdk-source-root
# Read these binary paths from toolchain.json.
export TOKEN_WIDE_PRIVATE_COMPILER=/path/to/compile_private
export TOKEN_WIDE_PRIVATE_FINGERPRINT=/path/to/private_fingerprint
export TOKEN_WIDE_PRIVATE_TOOLCHAIN=/fresh/private-toolchain/toolchain.json
npm run build:token-wide-private -- /fresh/private-build --issuer REGISTERED_ISSUER_ID

# Use the selected application crate recorded in toolchain.json.
export TOKEN_WIDE_PRIVATE_MANIFEST=/fresh/private-toolchain/application/Cargo.toml
TOKEN_WIDE_PRIVATE_ARTIFACT=/path/to/compilation_artifact.json \
  PSY_MARKET_TESTNET_PROFILE=sdk-audit-20261102-v1 \
  cargo +nightly-2025-09-20 test --offline --locked --release \
  --features sdk-audit-v1 --manifest-path /fresh/private-toolchain/application/Cargo.toml \
  --test private_context_privacy -- --test-threads=1
```

`npm run test:token-wide-private:vm` uses that explicit selected manifest and
also runs the application compiler's rejection tests. The old sibling-checkout
command is retained only as `test:token-wide-private:vm:legacy`; it does not
establish compatibility with the selected SDK or the compact-v2 profile.

The complete ordinary claim UPS is an explicit ignored acceptance test in that
same crate. Supply `PRIVATE_CURRENT_NATIVE_ARTIFACT`, `TOKEN_WIDE_PRIVATE_ARTIFACT`
and a nonexistent `PRIVATE_COMPLETE_UPS_OUT`, set the explicit
`PSY_MARKET_TESTNET_PROFILE=sdk-audit-20261102-v1`, and select
`full_ups::private_claim_complete_ordinary_ups --ignored --exact`. It authenticates
both note denominations, source checkpoint, ordinary signature, fee burn and
final state under the fixed selected Endcap verifier. Its initial note transfer
is VM-only synthetic setup; it does not establish network or browser acceptance.
`npm run test:token-wide-private:ups` selects this exact ignored test with the
same required manifest and acceptance environment. Plan proof/time budgets and
use a new output directory for every attempt; this command does not broadcast.

The later linked-source cohort adds two exact ignored tests in the same crate:
`full_ups::private_transfer_complete_ordinary_ups`, then
`full_ups::private_claim_from_transfer_complete_ordinary_ups`. Use a new
`PRIVATE_COMPLETE_UPS_OUT` for each. The latter requires
`PRIVATE_SOURCE_TRANSFER_OUT` pointing to the verified transfer output: its
request is independently verified and the exact source end leaf must match the
next synthetic checkpoint's note/Native state. This is not a real receipt.
For no-new-proof negative checks, set `PRIVATE_LINKED_CLAIM_OUT` and select
`full_ups::saved_private_roundtrip_rejects_request_and_proof_substitution`.
See the [4 November continuation](../../../docs/security/PRODUCTION_CONTINUATION_20261104.md)
for exact measured costs, failures and remaining live/wallet gates.

Compilation rejects incorrect ABI/root positions, non-height-32 layouts and native
fingerprint mismatch. Output must be new. Issuer 5 is a fixture; deploy with a real
registered issuer. Independent initial-deployment proof tooling must verify empty
old layout and exact new code/layout, including rejection when old field count is
changed to 14. Before submission compare actual wallet request to the artifact;
afterward reconcile unique transaction identity and chain leaves. This tool does
not generate upgrades for existing contracts.

## Historical public SD-key test driver

The driver and live milestone below belong to the October source cohort. Its
native method/fee identities are not the current selected SDK's identities. It
is not built by the new selected toolchain and must not be used on the reset
chain without separate adaptation and acceptance. No old request or account is
reactivated by fixing the private compiler entry.

`private_test_wallet` registers the restricted public seed `[1,1,1,1]` without
reading ordinary keys/recovery files. Policy permits native claims, specified FT
methods and bounded automatic burns; public FT returns only to the issuer.
Anyone can execute this test account; it is unsuitable for custody.

```sh
private_test_wallet identity POLICY_JSON
private_test_wallet register POLICY_JSON RPC_CONFIG
private_test_wallet prepare-note PUBLIC_NOTE_SPEC NEW_SECRET_FILE
private_test_wallet verified-submit POLICY_JSON TRANSFER_CALL RPC_CONFIG
# After exact confirmation, prove both limbs at the same confirmed checkpoint.
private_test_wallet prove-notes SECRET_FILE SENDER_ID CHECKPOINT RPC_CONFIG NEW_PACKET
private_test_wallet claim-verified-submit POLICY_JSON PACKET RPC_CONFIG
```

Amounts in note specs are decimal strings. Secret/packet files are exclusively
created with 0600 permissions, never committed or logged. The driver reads actual
same-checkpoint note/state/contract/user paths and obtains session paths only
after adding all external proofs. It generates CFC/UPS and independently verifies
end-cap. Preflight never broadcasts; verified-submit reports the unique leaf hash
before send. Reconcile that identity after failure; never retry blindly/overwrite.

Fresh testnet instance **2457** completed actual bidirectional private transfers,
claims and authenticated CFC/UPS; see [acceptance](deployments/staging-2026-10-14-01/REPORT.md).
That milestone used public SD-key accounts; it did not establish ordinary MCP
bundle support. Later wallet adaptation evidence must be reviewed separately.
