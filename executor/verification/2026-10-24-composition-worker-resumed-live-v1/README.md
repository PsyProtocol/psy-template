# Real warm first transition and planned worker exit/resume

108 public files, 9,791,448 compressed bytes; every original compared. Raw and
compressed SHA256 are in manifest.json. No wallet files or sealed binaries.

Independent controller 2489 / execution account 134336 / owner 406720:

- Real fund UPS included at 371580; real open-1 UPS included at 371593.
- Both complete UPSs used resource 455540b4-1175-45af-9019-e051467d44a5 in
  worker PID 1358. Full current state/nonce/session/fees/proof checks remained.
- After these exact included identities and zero unresolved broadcasts, the
  worker closed its resident and exited with planned code 73. The supervisor
  observed actual process exit and started worker 8098.
- New worker resource a5fc61cf-296e-4e03-b1f4-f910bb0f8354 rebuilt/verified its
  source/key/dependency resources and re-reconciled the original two receipts
  before any next sponsorship. The exact broadcast identities remain unchanged;
  no fund/open proof, payment or financial operation was repeated.

The checkpoint, warm resource IDs, different PIDs, original journals/requests/
proofs/responses, initialization refund and both runtime validation closures are
preserved. The active combined recovery log and later financial phases are not
snapshotted. Completion of the cancelled-second-hop route and ordinary final
claim remains a later artifact; PROCESS-RESTART-COMPLETE is written only then.
This is a planned included-boundary worker restart, not a power cut, uncertain
broadcast failover or cross-machine coordinator test.

Six measurement/claim checks pass. The final read summary counts actual observed
JavaScript RPC attempts, failures and fractional/missing timings by endpoint and
method. Its concurrent/phase-nested sums are not elapsed wall and do not include
Rust SDK witness IO. No speedup, chain TPS or production conclusion follows.
No Node/SDK/old-contract update or new call/key template.
