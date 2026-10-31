# Confirmed grant and ordinary CLI claim

Read the [review report](../../../docs/security/FAUCET_FUNDED_CLAIM_20261031.md).

The explicitly authorized second faucet attempt is included at 25190. One
ordinary claim is included at 25246: 1,000 test PSY input, 1.000002 PSY fee,
998.999998 PSY confirmed Native contract balance. Known source pending is zero.
The first faucet attempt remains unknown and its original lock is untouched.
No AMM deployment, market fill or browser-wallet approval is claimed here.

- `funding/`: declared read phase, current identity/cursors, public faucet code,
  prepared candidate, explicit user authorization, one-repeat intent/lock/safe
  result, and original exact grant receipt/cursor confirmation. The first
  localhost-default lookup failure is retained separately from corrected lookup.
- `claim/`: bounded claim plan, dependency/nonce checks, complete public proof,
  independent fixed verifier report, exact request/wire/intent, single-send ACK,
  original-identity receipt, state audit, timings and failed pre-wire preparations.
- `recipes/`: original acquisition/proving/submission/reconciliation scripts,
  retaining local paths. They are historical recipes, not retry authority.
- `source/`: exact application fixes; application manifest binds frozen build.

Every archive member has size/SHA256 in `manifest.json`; the manifest also binds
archive SHA256. Wallet keys/recovery files, signing witnesses, binary executables,
raw private faucet response bodies and full network configuration are excluded.
Complete ZK proofs, public request/update paths and public verifier metadata are
published as network evidence. Stored user system balance is distinct from PSY
in Native contract 0 slot 0. SDK-internal read counts and physical memory peaks
were not measured. No TPS or matched performance claim follows.
