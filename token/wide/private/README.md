# Two-Felt FT private notes

Independent source: `src/main.psy.rs`. All 20 public U124 methods remain, plus
`private_transfer`/`private_claim` (22 total). `[low62, high62]` supports 0–18
decimals and at most `2^124−1` base units.

## Two note trees

The existing `PrivateNoteInclusionCircuit` proves one Felt amount. This profile
reuses it separately for nonzero low/high limbs; high notes have denomination
`2^62`. Both proofs use the same native circuit/checkpoint. Claim validates both
session paths and credits atomically. Invalid proof/range/nullifier rejects the
entire claim.

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
Zero limbs create no note and require zero nullifier/empty session path. Notes
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

All nonzero proofs are added before final path reads. Commitment, nullifier,
public-input hash and path roots are recomputed; both roots must match. Old
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

```sh
node token/wide/private/generate.mjs --check
npm run test:token-wide-private

# Archive adjacent SDK readonly; expose existing VM intrinsics in an isolated copy.
# Do not edit the Node checkout or deploy Node.
npm run build:token-wide-private:toolchain -- /private/tmp/psy-private-u124-toolchain-new
# Read these binary paths from toolchain.json.
export TOKEN_WIDE_PRIVATE_COMPILER=/path/to/compile_private
export TOKEN_WIDE_PRIVATE_FINGERPRINT=/path/to/fingerprint
npm run build:token-wide-private -- /private/tmp/psy-private-u124-build-new --issuer REGISTERED_ISSUER_ID

# Use the isolated crate also recorded in toolchain.json.
TOKEN_WIDE_PRIVATE_ARTIFACT=/path/to/compilation_artifact.json \
TOKEN_WIDE_ARTIFACT=/path/to/compilation_artifact.json \
  cargo +nightly-2025-09-20 test --offline --locked --release \
  --manifest-path /path/to/isolated/vm-tests/Cargo.toml --test privacy --test public_token -- --test-threads=1
```

Compilation rejects incorrect ABI/root positions, non-height-32 layouts and native
fingerprint mismatch. Output must be new. Issuer 5 is a fixture; deploy with a real
registered issuer. Independent initial-deployment proof tooling must verify empty
old layout and exact new code/layout, including rejection when old field count is
changed to 14. Before submission compare actual wallet request to the artifact;
afterward reconcile unique transaction identity and chain leaves. This tool does
not generate upgrades for existing contracts.

## Public SD-key test driver

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
