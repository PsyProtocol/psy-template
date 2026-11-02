# Four-market adversarial integrity and current metadata evidence

See the [team report](../../../docs/security/FOUR_MARKET_ADVERSARIAL_20261031.md)
and [runtime delivery requirements](../../../docs/security/UPSTREAM_REALM_LATEST_HEIGHT_HANDOFF_20261031.json).

The archive contains 90 explicit public members: the read-only plan and all
16 RPC request/response pairs, red reproductions, preliminary and final green
logs, exact final commands/environment, frozen-source hash check, changed
source snapshots, four exact bytecode reuse records, actual local process-race
policies and preserved interrupted-output evidence. Every member is hashed and
the archive was reread after writing; `manifest.json` binds its complete contents.

Final focused tests: 19 pass. Two tests first reproduced old builder defects:
an omitted mandatory artifact hash and a duplicate actual dependency function.
The fixes require complete, cross-linked manifests and unambiguous complete
function/ABI identities, and consume one checked byte snapshot. No new source
compilation, proof, financial operation, market fill or market claim occurred.
All live authorization fields remain false.

The original 21 build members and manifest remain unchanged (recorded SHA256
`debf6377d9067f096e2405b33035c48ba5764f27a5fe7f1c6bcadfca9d7a418b`).
Large negative clones and repeated bytecode are excluded. Restore the original
build from [the unchanged previous pack](../2026-10-31-four-market-suite-v2/README.md),
under `case/registered-target-suite-v1/`. Extract the two packs into **separate
fresh directories**; do not merge or overwrite their `case/public` records.

Tests require the frozen source dependencies and, for exact cache reuse, the
reviewed sealed compiler binaries or byte-identical rebuilds. Executables are
excluded from this public archive. Another machine's rebuilt binary with a
different digest is not an acceptable silent substitute; its cache use must
reject and any fresh build must be separately reviewed. Adapt local spec paths
only in a new review copy, retain the original spec, and verify all input hashes.
Never execute a consumed registration/faucet/financial sender from prior packs.

At checkpoint 26855 the explicit height endpoint returns 31, but issuer state
reads still fail. Realm 0 returns zero at the exact i64::MAX bound used by the
frozen state-read height-cache path. Raw integer requests and responses are
preserved without JavaScript Number rounding. This narrows runtime diagnosis;
it does not attest the running build, prove consensus finality or clear live
deployment/trading gates. No injected height, opposite-Realm routing, old
contract update or retry of a financial request was used.

No private key, mnemonic, wallet recovery material, secret signing witness or
executable is published. Original failures, requests, send locks and old-chain
records remain intact. Local bind-process competition is not financial
competition or cross-machine coordination. Test durations are not settlement
performance, and no production-readiness or qualified-randomness claim is made.
