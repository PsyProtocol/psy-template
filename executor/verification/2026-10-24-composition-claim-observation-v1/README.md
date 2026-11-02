# Claim observation gates and live admission checkpoint

Two public originals, raw/compressed SHA256 preserved and independently checked.
The unit log has four checks: exact receipt/timing association and U124/native
claim balance/cursor/fee negative cases. Actual final claims are not available
at this milestone and are not inferred from unit tests.

The live common snapshot at checkpoint 371241 follows the confirmed admission
at 371215 and precedes sealing. The cutoff is 371227 (already past at this
observation), epoch 3, queue phase 1, exactly owner 1445056 / nonce 1. The queue
root is still zero before seal; do not call this a sealed commitment or global
market completeness proof. The later seal/commit/settle proofs and actual final
owner claim audits remain separate required artifacts.

No financial mutation, Node/SDK change, wallet file or executable is included.
