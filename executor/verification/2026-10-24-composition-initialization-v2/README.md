# Supplemental full refund/cancel proofs and exact selected new instances

58 public files, 3,838,388 compressed bytes. Includes six linked controller
refund UPSs and two linked pretrade cancel/exit UPSs, plus the selected new
controller source, deploy requests and exact registrations. This supplements
v1's eight success UPSs: **16** new full controller UPSs total. All are explicit
synthetic authenticated checkpoint tests; base-market and ordinary actions in
these tests execute bytecode only. They do not establish network settlement.

Refund test wall: 420.73 s; pretrade cancel test wall: 166.19 s. Concurrency and
setup differ, so these are not matched speedup measurements or network TPS.
The raw full requests, fees, endpoints, exported delta checks and negative tests
are preserved. A 64-test client regression log is included. Dedicated key
18-template / 18-negative and initialization-export verification are in v1.

Exact new included prerequisites:

- Success controller **2491**, execution account **1445056**. Source owner
  1717440, deployment publisher 406720, dedicated key and all code/layout/
  function/height/count fields verified. The different publisher is explicit;
  source owner and final refund/receiver constraints are unchanged.
- Recovery controller **2489**, execution account **134336**, owner/publisher
  406720. Original receipt and metadata match.

The earlier success request is preserved but not accepted as an ID match:
its API receipt gives 2489 while its actual code/deployer occurs at 2490.
No original request is resent and no ID check is removed. A single independent
serial deployment with a different publisher yielded the fully matched 2491.
See docs/security/DEPLOY_RECEIPT_ID_COLLISION_20261024.md and v1's raw observations.
The earlier 2487/2488 execution accounts remain unfunded/retired.

The proof gate allows the later formal financial runner only after 16 new
controller proofs and actual LP/ordinary initialization prerequisites. The live
success, final ordinary claims, cancelled second-hop sender recovery and native/
QA principal audit are separate pending artifacts, not inferred from this gate.
No Node/SDK/old-contract updates, existing pUSDT, wallet files or executables.
