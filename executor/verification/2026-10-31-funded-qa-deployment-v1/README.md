# Funded QA candidate and metadata availability evidence

The exact initial request for QA A was sent once and included as contract 8 at
checkpoint 25363. Saved code/layout/request identity and checkpoint membership
verify independently. QA B is compiled/proved but unsent. QA minting and AMM/UI
activation remain closed: Realm 0 reports height 0 while Realm 1 reports 31.

See [the team report](../../../docs/security/FUNDED_QA_DEPLOYMENT_20261031.md)
and [the runtime delivery](../../../docs/security/UPSTREAM_REALM_METADATA_HANDOFF_20261031.json).
The full QA setup proof uses synthetic checkpoint 100, provisional IDs 42/43 and
an ephemeral fixture signer; it is not live initialization or browser approval.

`manifest.json` binds every public member to its exact bytes. `evidence.tar.gz`
contains source, ABI/bytecode, canonical layout requests, full public UPS and
verifier replay, exact broadcast/receipt, checkpoint paths, failures, bounded
read observations, budgets and process RSS samples. Original case records are
unchanged. Duplicate read-only checkpoint-fixture aliases are omitted.
No wallet secret, mnemonic, signature witness, private configuration or binary
is included. Public keys, proofs and verifier data are intentionally public.

Do not run the archived faucet/deployment senders during reproduction: their
one-shot request identities are consumed. Replay saved public verification and
offline tests into fresh directories only. No general performance, finality,
qualified randomness, AMM settlement or wallet-extension acceptance is claimed.
