# First real AMM hop: frozen intake, settlement and intermediate claim

2,330 public files; 24,879,711 compressed bytes. Integrity checked against all
originals. Exact raw/compressed SHA256 and source paths are in manifest.json.
No wallet files, private keys or sealed executables are included. Some immutable
LP/bootstrap runtime files are shared with prior archives; timestamps and labels
must not all be attributed to this route.

Owned QA-A 2483 / QA-B 2484, both 18 decimals; native fees use test PSY (9).
No existing pUSDT. New AMM 2485 / vault 1012928, dedicated controller 2491 /
execution account 1445056. The second pool is a separate account and needs its
own later UPSs; this archive does not establish cross-vault atomicity.

Confirmed first-hop progression:

- Controller open: 371154; epoch start: 371178; exact user consent: 371195.
- Admission: 371215, before cutoff 371227, epoch 3, sole member 1445056/nonce 1.
- Seal: 371253; actual sealed snapshot at 371258 has the same members/cutoff
  and a nonzero queue root. Earlier phase-1 root zero is preserved as such.
- Batch commit: 371276; complete actual settlement UPS: 371303.
- Controller claim of intermediate QA-B: 371335.

Actual input 4.611686018427387921 QA-A, output
3.738416797288011079 QA-B. Actual first-pool reserves are
24.611686018427387921 QA-A / 16.261583202711988921 QA-B. Independent public common
snapshots compare the exact client quote, reserve deltas, sender Outbox, receiver
cursor and then spendable intermediate balance. Complete prepared requests,
preflight proofs/endpoints/fees, durable broadcast identities, original responses,
indexed/common receipts, formal tasks/results and runtime source/key verification
closures are retained. These public slot observations do not replace separate
full-proof verification or attest every RPC slot by its own Merkle proof.

The injected lost-parent-ack funding test, same-host contender and exact restart
reconciliation precede this hop and remain included. Actual quote/proving/submit
metrics have different scopes and overlap; do not sum them or infer chain TPS.
The second hop, terminal controller return, ordinary owner's final claim,
second-hop cancellation/refund recovery and whole-cohort independent receipt/
fee/claim audits remain pending separate artifacts. This is not full composition
or production acceptance. No Node, SDK dependency or old-contract update.
