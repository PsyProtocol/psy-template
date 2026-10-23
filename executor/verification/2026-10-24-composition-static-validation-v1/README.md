# Saved initial-layout verification and selected source closure

55 public files, 9,175,779 compressed bytes. Original SHA256 and compressed
SHA256 are recorded in manifest.json; original artifacts remain unchanged.
No wallet files, private keys or sealed executables are included.

One sequential same-host, same-artifact, same-frozen-SDK, two-thread comparison
measured 295.687 s for regenerating the static initial-layout proof and
61.282 s for verifying the exact saved initial deployment proof. Process peak
RSS was 4,520,493,056 versus 2,604,236,800 bytes (`time -l`). Other work ran
concurrently; this is one static-validation pair, not a controlled statistical
benchmark, transaction proof speedup, confirmation throughput or chain TPS.
The old inspection uses the dedicated key hash as nominal deployer; the saved
request verifier uses the actual included deployer. Wrong deployer, changed
layout count and a corrupted actual proof reject.

The exact saved initial proof has authenticated zero old fields/slots, canonical
ABI layout, actual deployer, reviewed compiled code/whitelist and checked public
endpoints. Source recompilation and whole IR/function-root closure remain
mandatory, as do current network, key, code/layout, account-state, signature
session, nonce, fees, full UPS and receipt checks. No user-state proof is reused.

The selected real 2491/2489 source closures pass separately (143.735 / 141.465 s).
The 67-test client log covers the added initial proof metadata/byte/deployer
gates. These results supplement the 16 new linked full controller UPS proofs in
the initialization-v1/v2 archives; they do not establish live route completion.
Waiter restarts were confined to prerequisite waiting before child financial
operations, with restart records preserved. Live route, owner claim, recovery,
fund conservation and actual receipt verification have separate evidence.
