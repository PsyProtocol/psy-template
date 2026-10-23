# Real isolated liquidity and first composition funding milestone

1,711 public files; 15,471,638 compressed bytes. Integrity was checked against
all original files. Original paths and raw/compressed SHA256 are in manifest.json.
No wallet files, private keys or sealed binaries are included.

- New QA-A 2483 and QA-B 2484 are 18-decimal QA assets, not existing pUSDT.
- Separate AMMs 2485 / vault 1012928 and 2486 / vault 718016 both settled the
  original LP orders in epoch 2 at checkpoint 371072. Ordinary close actions
  completed; the 371079 snapshot shows 20 QA-A / 20 QA-B in each pool.
- The first epoch expired while empty. Its two exact abort UPSs, renewed owner
  consent and same original deposits are retained. Principal was not resent.
- The recovery owner received and ordinarily claimed the declared one-unit QA-B
  initialization grant at 371093. The execution accounts were not prefilled.
- Success controller 2491 / execution account 1445056 received ordinary owner
  funding (371108). The full controller fund UPS was included at 371125.
  Actual bytecode, complete UPS, saved-proof verification, exact original intent,
  request, receipt/stat/fee endpoints and local journal records are retained.
- The first controller transition materializes QA-B state with spendable balance
  zero and owner refund Outbox exactly one atomic unit. It supplies no liquidity.
- The submitted child's acknowledgment was deliberately discarded by the parent;
  original-identity receipt reconciliation completed without a second broadcast.
  This is a real submission plus injected parent fault, not a physical network
  outage. A second OS process received VaultBusy before proof/broadcast using the
  same local journal; this is not cross-machine coordination.

Includes 88 focused read/receipt/composition regressions. Historical failed and
empty-epoch attempts are retained, not counted as completed fills. This archive
stops after the first controller fund operation: no two-pool composition success,
final ordinary owner claim or cancelled-second-hop recovery is inferred. Those
require later artifacts. Baseline runtime files include LP and activation work;
phase metrics must not all be attributed to the route or summed as elapsed wall.
The sampled-memory observer and later route financial operations were active and
are deliberately not snapshotted here. Actual receipt independent verification
and closed-cohort conservation are separate final gates.
