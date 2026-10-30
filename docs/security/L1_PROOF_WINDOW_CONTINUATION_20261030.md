# L1 proof-window continuation and immutable inclusion packets

## Result

The application can now capture complete account groups **before** a provider's
proof window closes, verify their execution-header/account/storage/code bindings
offline, preserve them as immutable packets, and recheck them after restart.
This is a real-data inclusion milestone, not consensus finality, a running CST
resource export, qualified randomness, market settlement or ordinary-wallet
arrival. Those admissions remain closed.

Base is `b9769b594e64c30020adf613f33ee1f61eeaeace` on the unchanged
`markets-batch-capacity-recovery-20261020` branch. SDK remains mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`. No Node, SDK manifest/lock/source,
dependency version, old contract, market/key, pricing/matching rule, original
request or original evidence was changed. Root owned the bounded read-only
work; no financial/proving worker was running at entry. Live fills, ordinary
wallet claims, new ZK proofs, financial requests and actual fees are all zero.

## Historical anchor versus new prospective captures

The [previous fixed historical anchor](RUNTIME_PUBLIC_RESOURCES_20261030.md)
remains block `0xb780fd`, hash
`0x7c1d565b5dc220ecb40e2ef4a76d1c09c29c59b00b28823575737c8c144abf43`.
It was never replaced with a newer block to obtain acceptance.

PublicNode's [own Sepolia page](https://ethereum.publicnode.com/?sepolia)
documents its public RPC. It returned the same original block hash/number/state
root, then rejected EIP-1186 retrieval with the same `-32602` proof-window error.
This does not establish that it is independent infrastructure from the Psy RPC.
Additional endpoints from the
[Sepolia client repository](https://github.com/eth-clients/sepolia) failed before
proof retrieval: RockX and sepolia.online had curl exit 35; sepolia.org returned
HTTP 522. The [documented 1RPC endpoint](https://docs.1rpc.io/overview/supported-networks)
returned the expected chain ID, then HTTP 429 on the original-block read. Each
endpoint stopped at its first failure; there were no request retries, paid
access changes or moving-block fallbacks. Exact failed transport records remain.
Curl stderr for these initial probes was not retained; exit codes alone do not
identify the specific TLS failure.

Two separately declared **read-only prospective experiments** followed:

| Experiment | Fixed header | Actual result |
| --- | --- | --- |
| Initial prospective packet | `0xb781fe`, `0x6c70e3d56040217c3bb3eed21e5c27ddb269066294fd67da335384a82cc97edc` | Header, StateManager account, three slots and proxy code verify offline. Saved packet rechecks in a fresh Executor process. |
| Complete paired prefetch | `0xb78258`, `0xb00f1bf5331193612d6f130a15b285599f605a430973f09fc869e42c73e7923c` | Proxy and implementation proofs were fetched immediately at the same hash, then both account/code bindings and all four requested slot inclusions verify. |

The second block number is recorded exactly in the public statement; the hash
and statement are the binding identities. These captures create no new market
instance or financial intent and do not repair the historical archive failure.
Their headers were selected while recent, and `finalityVerified` remains false.

An attempted **later** implementation proof at the initial prospective hash,
about 16 minutes after that header capture, was rejected by the proof-window
limit. Its earlier saved proxy proof still verifies without RPC. This directly
motivated complete account-group prefetch: declare all needed accounts first,
pin one header, fetch the group immediately, then verify/store it. It does not
justify collecting an incomplete snapshot and silently substituting later data.

## Application-side header and proof verification

The actual L1 headers contain `blockAccessListHash` and `slotNumber`. The locked
Alloy `Header` representation ends at `requests_hash`; using that older
21-field shape would not reproduce these observed block hashes. The new
[read-only native inspector](../../executor/acceptance/l1ProofInspector.rs)
implements the explicit `ethereum-amsterdam-23-v1` encoding with those final
two fields, validates exact field names/widths and canonical quantities, and
recomputes the complete execution-header hash before using its state root.
Omitted, substituted or unknown future fields reject.

The field-order references are the
[execution Header definition](https://github.com/ethereum/go-ethereum/blob/master/core/types/block.go),
[EIP-7928](https://eips.ethereum.org/EIPS/eip-7928) and
[EIP-7843](https://eips.ethereum.org/EIPS/eip-7843). The source link is a moving
reference, not a pinned running build. The adapter was checked against exact
captured header bytes/hash; neither dependency code nor the frozen SDK was
modified. This header issue does **not** explain or resolve the original
Plonky2 checkpoint-proof failures.

The inspector uses the already-locked Alloy MPT/RLP/Keccak implementations to
check [EIP-1186](https://eips.ethereum.org/EIPS/eip-1186) account and storage
proofs, full uint256 quantities, exact requested slots, and runtime bytecode
against the proven account code hash. It requires a reviewed statement digest
and binds every input digest into the output. All proof inputs are bounded;
reports are created once and fsynced, including cryptographic rejections.
There is no RPC, signature, wallet, deployment or broadcast path in this binary.

[The build helper](../../executor/acceptance/buildL1ProofInspector.py) obtains
exact library paths from the successful frozen Cargo artifact stream, checks
locked versions, hashes the libraries before/after compilation, and links the
standalone inspector/test binary with the existing selected toolchain. It adds
no direct Cargo dependency and changes no manifest or lockfile. Selected locked
libraries include Alloy trie 0.9.5, primitives 1.6.1 and RLP 0.3.16. Initial
artifact selection rejected duplicate host/release package records before any
Rust inspector compilation. The repair selects the unique release-target
profile and reuses the original successful Cargo stream, without rerunning
Cargo. That failure and both build attempts are retained. Total native build
commands stayed within the declared three: one Cargo command, two rustc commands.

## Formal Executor read-only integration

[`executor/l1Evidence.mjs`](../../executor/l1Evidence.mjs) stores the exact
statement/header/proof/code bytes, publishes a digest manifest last, and never
overwrites an existing packet. Partial packets without that manifest reject.
Restart checks each stored digest, seals/rechecks the reviewed native binary,
persists an inspection intent, and compares the report file to its owned native
output before saving a receipt. Input bytes are checked again after inspection.
The route uses a separate read-only artifact lease, not a vault/account lock or
financial authorization. Interrupted leases require explicit owner/log review;
they are not automatically stolen.

`inspectL1EvidencePair` executes both native inspections itself. It requires
one header/state root and matches the proven EIP-1967 slot word to the second
proven account. Two individually valid accounts from different headers reject.
It does not accept caller-provided verification reports. No UI write route or
wallet policy is enabled by these APIs.

In the actual paired capture, StateManager is
`0x4eC67bA22A3F7a9Af1f19F480e5Df33bFD7B06F1`; its EIP-1967 location contains
`0xd1ca5e95e2b58461343f9d55c61fbb4b6662fb04`. Both accounts' code hashes are
proven relative to the same execution header. The implementation's zero slot
also passes a genuine zero/exclusion storage proof. This establishes location
and code-byte inclusion, not reviewed delegation semantics, upgrade authority
or the StateManager storage layout. A Blockscout metadata read returned matching
deployed bytecode but no verified source/ABI. Source identity remains false.

## Validation results and what they mean

- Three native unit tests pass for header field coverage, integer widths and
  bounded inputs. They generate no ZK proof.
- All 26 native mutation cases reject, including wrong network, claimed
  finality/replacement, omitted/changed/new header fields, changed account,
  nonce/balance/storage root/code hash, changed code, bad/extra/reversed proof
  nodes, storage value/key changes, duplicate/missing/requested slots and an
  injected authority field. Inputs, errors and rejection reports are preserved.
- Two Executor unit tests pass. Packets cannot be overwritten; changed bytes
  and incomplete packets reject before native work; extra resource/authority
  assertions cannot promote an inclusion report.
- Actual native/Executor inspection passes on the public prospective proof,
  and fresh-process reinspection returns the same report with unchanged packet
  bytes. Actual paired inspection also passes. Mixed old/new header pairing
  rejects after verifying each account separately.

These are real **public L1 inclusion proofs**, not current-chain market UPSs,
ordinary-wallet signatures, transaction receipts, financial restart recovery,
consensus finality or browser-wallet payment acceptance. No inclusion report
can enable signing or broadcasting. The original unknown faucet request and
send lock remain unchanged.

## Checkpoint resource and randomness acquisition findings

The actual `psy_get_prove_proxy_role` response is
`{"role":"user","user_methods":true,"system_methods":false}`. The inspected
system-proxy source declares bridge/reward proving methods, not a checkpoint
resource export. No proving method was invoked. The visible GitHub Actions list
returned ten of thirteen runs; the listed successful August release run had
zero artifacts at inspection. The connector rejected the repository-wide
artifact-collection URL, so the supported run-specific collection was used.
Neither workflow metadata nor an old release identifies the running CST build.
No compatible running kind-32 verifier/common bundle was acquired or installed.

The public Sepolia Beacon endpoint returned HTTP 404,
`NOT_FOUND: No LightClientFinalityUpdate is available`. No authenticated beacon
update, reviewed bootstrap/committee anchor or finality proof was obtained. A
JSON signature, RPC finalized tag, matching root or recomputed execution hash
cannot replace that missing authentication. The frozen Psy seed-generation path
also remains producer-local as described in the
[source audit](CHECKPOINT_RANDOM_SOURCE_CAUSE_REVIEW_20261030.md).

| Remaining owner / delivery | Concrete acceptance requirement |
| --- | --- |
| Runtime/proving operator | Actual kind-32 verifier-only/common data, fingerprint, child/genesis identities and public build/rotation configuration; paired complete stored checkpoint records for 18504/18505 from one identified snapshot. Verify the exact original proof digests and cumulative PI/root/leaf relation before considering any resource review. See the [existing import format](CHECKPOINT_PUBLIC_DELIVERY_20261030.md). An operational export need not change Node. |
| L1 infrastructure/security | Archive proofs for the unchanged original hash; an enabled light-client bootstrap/updates/finality feed and an independently reviewed weak-subjectivity/committee anchor with fork/domain verification. Persisted recent-state inclusion solves pruning for future captures, not consensus trust or the historical archive gap. |
| Randomness protocol/security | A fixed future round with authenticated unique output, explicit bias/withholding assumptions and an accepted immutable batch commitment before its unpredictability/release boundary. Bind the same set/seed/permutation across recovery. Authenticating membership of the existing producer-chosen seed cannot prove generation time, secrecy before sealing or resistance to grinding. |

No replacement beacon, local RNG, trust policy or validator set was invented.
An external beacon/finality adapter is possible without a Node source change
only when its actual certificates, fixed resources and reviewed trust anchors
exist and are constrained by the application/SD-key. Those are still absent.

## Budget and measurements

Exactly 18 declared logical RPC reads were used, with no retries. Two additional
direct public HTTPS metadata reads were the Beacon finality endpoint and
Blockscout contract metadata. Four GitHub connector reads included one rejected
collection URL, one source reference and two workflow/ artifact metadata reads.
Public documentation searches were research, not transaction/provider retries.
No 2 GB trust-setup archive, foreign binary or new dependency was downloaded.

The first supervised build attempt took 45.762 s, stopped on host/release
artifact ambiguity, and peaked at sampled process-family RSS 1,182,672 KiB.
Artifact-reusing compilation took 3.134 s and sampled 248,208 KiB. Full raw
samples/logs, failures and inspection subprocess outcomes are retained. Native
inspections are too short for 1 s sampling to capture their real memory peak;
tiny sampled RSS values must not be reported as physical peak or market memory
improvements. These are not matched market cold/warm, proof/confirmation/claim,
throughput or speedup measurements. No production conclusion follows.

See [public evidence and reproduction](../../executor/verification/2026-10-30-l1-proof-window-v1/README.md).
