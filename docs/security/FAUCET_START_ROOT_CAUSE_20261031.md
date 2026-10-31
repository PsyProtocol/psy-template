# Faucet UPS-start root conflict — 31 October 2026

## New finding and limits

The preserved faucet error is now localized beyond the generic proving stage.
Its public circuit location, **Wire(row 46, column 12)**, belongs to the copy
partition joining **session checkpoint-tree root element 0** and
**checkpoint Merkle proof root element 0**, in the ordinary UPS-start circuit
constructed by the frozen SDK. That circuit's fingerprint and verifier match
the current runtime's public ordinary-start resource:

```text
a3209944232e9f6b5270d1786e5f9abe38c5306d1319751a1e653d452c7ea321
```

A bounded public-root correlation around the original precheck checkpoint 1758
found that the two conflicting assignments match element 0 of checkpoint-tree
roots **1758** and **1759**, respectively. Fifteen historical roots, 1754–1768,
were queried once; those were the unique matches within that range. The client
QHashOut encoding puts element 0 in the final 16 hexadecimal characters.

This is strong evidence consistent with mixing adjacent checkpoint contexts.
It is **not** a reproduction of the complete historical witness, authentication
of the historical running circuit/build, proof that the other three hash limbs
match, or identification of which service/cache/backend mixed the inputs.
The error's assignment order does not establish which value was supplied by
the header versus the path. No private assignment value was published.

At current checkpoint **25091**, both realms and the coordinator return the
same checkpoint-tree root, and each returned path declares that same root.
This current observation does not close the historical failure or independently
authenticate finality. The original faucet request remains unresolved.

## Scope, reproducibility and execution

Branch remains `markets-batch-capacity-recovery-20261020`, starting from
`41743b36e0530e38de43b3661a97e149a722d5da`. SDK remains mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. All 2,756 source hashes match.
The full current public client registry equals the previously compared payload.
No Node, SDK/dependency pin, old contract, wallet history or original artifact
was changed. No financial or business-proving worker was running or started.
The UI/gateway processes were absent at entry and were not restarted in this
read-only phase. No browser wallet unlock or signing was attempted.

The existing snapshot preparer built one application-only inspector with
`--release --offline --locked`, using the established two-thread configuration.
The snapshot, compiler log and sealed executable digest are retained. The
inspector constructs the actual ordinary-start circuit and compares the full
verifier and fingerprint before inspecting its target representatives. It loads
no witness, creates no proof and performs no RPC. It does not adopt remote
verification resources or identify arbitrary errors from unrelated circuits.

Build wall time was 54.626 seconds; observed process-family RSS peaked at
1,275,856 KiB. These are preparation observations, not market proof/settlement
performance or a memory comparison. The inspector completes between one-second
samples; its recorded 32 KiB sample misses circuit construction and must **not**
be reported as peak circuit memory.

The run used its declared **240 public reads**, one attempt each:

| Scope | Reads |
| --- | ---: |
| Fresh chain/Native/user/resource capture | 16 |
| Original config/registration and 200 Native cursors | 203 |
| Three endpoint root/path pairs at 25091 | 6 |
| Bounded historical-root correlation | 15 |

Explicit negative-test limits extended only offline circuit inspections: four
constructions total, zero proofs, zero signatures, zero financial writes and
zero PSY fees. No unbounded retry or funded budget expansion occurred.

## Application correction

[`captureNativeBinding.mjs`](../../executor/acceptance/captureNativeBinding.mjs)
now rejects mixed declared checkpoint roots before continuing to funding or
resource acquisition. Both anchor and current paths must declare the exact
captured tree root, exact checkpoint indices, canonical hash shapes and the
expected 32 siblings. Failure preserves the raw reads and an unsuccessful
summary, rather than marking the capture complete.

This is an early **metadata consistency check**, not Merkle verification,
canonical-chain authentication or authority to broadcast. The frozen Rust
checkpoint/Native verifier and complete UPS/session/call/state checks remain
mandatory. The new guard passes the saved actual context without another
network acquisition and rejects swapped roots, indices and malformed paths.

The original faucet accepts only a recipient/key, not a caller-supplied
checkpoint or root. Therefore this application guard cannot repair the remote
service's internal operator session. Existing pinned SDK trace construction
already checks context root against the explicitly supplied expected root;
it must not be weakened or silently rerouted to make an inconsistent session
prove. No parallel wallet implementation or alternate verifier was introduced.

[`inspect_ups_start_wire.rs`](../../amm/u124/vm-tests/src/bin/inspect_ups_start_wire.rs)
is the bounded read-only topology CLI:

```sh
inspect_ups_start_wire CAPTURED_PUBLIC_REGISTRY FRESH_REPORT 46 12
```

It records the actual resource identity, named target partition and scope
limits. Four sealed-binary checks cover the saved successful map, substituted
resource rejection, out-of-range wire rejection and original-output preservation.
The capture/funding/readiness regression passes **26 tests**, including actual
capture replay. These are not transactions or financial acceptance. Tests use
the existing frozen dependencies; no new test proof was generated.

## Funding and exact upstream delivery

At 25091, user **223232** remains registered in the observed index/URT leaf but
has zero stored balance. The same 100 original/current faucet operators have
zero pending total across all 200 sent/claimed cursor reads. Every read
succeeded; no failure became zero. Registration and an uninitialized user state
remain distinct. The original request and send lock are unchanged:

```text
Request SHA256: 85332da2e78775c0653737658234df46df80a5e326ee3440afb81879ba2d286d
Recipient key:  97a9f5724e2f2ea4a7a59c884b9e6f79c7978016629519bae26e96e8b681d834
Chain at one:   919896e18690246e20307f68cf2e5725aee496755366bbafff88eccaea975f12
```

The frozen faucet sequence calls `start_session` before contract proving and
sign/submit. The observed RPC error names ordinary `prove_ups_start`, not the
recipient's register-start circuit. No evidence implicates amount/decimals,
AMM execution, recipient claim or Native transfer execution at this stage.
Source inspection alone cannot attest historical service disposition.

The next operator delivery is now specific:

1. Correlate the exact request with its selected operator, accepted job ID and
   start checkpoint. Provide a **public-field projection** of declared header
   tree root, checkpoint path root/index/value and selected start fingerprint.
   Do not provide hydrated witnesses, secrets or private assignment values.
2. Check why roots associated with 1758/1759 entered one session: inspect
   checkpoint-scoped RPC routing, caches, load-balanced backend consistency and
   reconstruction of operator sessions after a checkpoint change. Supply
   effective source/build correspondence. Do not overwrite a root to make the
   proof pass; reconstruct the whole coherent session or reject it.
3. Provide the original exact broadcast identity/receipt if any, or durable
   terminal no-broadcast/no-delayed-work evidence. No retry follows merely from
   this error, current matching views, zero balance or passage of time.
4. Alternatively, independently transfer budgeted test PSY to the verified
   recipient above and provide sender/receipt identity. The existing requested
   fee ceiling is 20 test PSY; a funded plan must separately budget escrow and
   fit actual available funds. Preserve the original faucet lock and reconcile
   any later original grant independently. No operator message was sent.

No new grant, deployment, key registration, real AMM fill or ordinary claim
occurred. New isolated AMM/UI acceptance remains blocked on verified funding,
followed by fresh full preflight, new instance/key resources, complete proof,
exact broadcast, receipt/conservation audit and actual ordinary-wallet claim.
Separate CST/finality/random-source delivery remains open; deterministic
ordinary UPS metadata cannot substitute for it.

[Public evidence inventory](../../executor/verification/2026-10-31-faucet-start-root-v1/README.md)
retains all 240 reads, public topology/correlation reports, plans, source/build
digests, regression logs and original safe error projection. Raw original
private diagnostics, wallet secrets, binary executables and signing witnesses
are excluded; original local artifacts remain untouched.
