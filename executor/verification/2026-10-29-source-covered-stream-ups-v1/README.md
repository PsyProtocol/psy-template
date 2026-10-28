# Public source-covered stream UPS evidence

See `SUMMARY.json`, `REVIEW.json` and
[the technical report](../../../docs/security/SOURCE_COVERED_STREAM_UPS_20261029.md).
This bundle contains public offline fixtures and proofs only. No private wallet keys,
wallet restoration files, secret signing witnesses, network requests or financial
submissions are included. The source tree and contracts are synthetic; numeric
IDs are not current testnet deployments.

`run/full-ups-v2/` is the **final key** run: seven complete UPSs per market.
`run/full-ups-v1/` is the separately preserved pre-inactive-address-correction
run. Its fingerprints differ and it is not final-key evidence. Source proof v2
is an earlier classifier prototype; v3 predates that final address correction.
Source proof v4 and the full-width boundary proofs correspond to the final
source gadget. Failed compilation, fixture, invocation and context diagnostics
remain versioned in `run/public/`.

Verify/decompress the indexed evidence into a fresh directory:

```sh
python3 unpack.py /absolute/new/evidence-directory
```

The index binds original and public bytes, compressed bytes and sizes. Some
build manifests/logs have machine paths redacted; their original SHA256 is
retained. Requests, proofs and public state openings are preserved byte-for-byte.
Archive integrity is not cryptographic proof verification. Rebuild against the
frozen SDK and run the ignored native tests documented in the report. The
`stream_key_exact_replay_and_coherent_priority_attacks` test verifies the exact
saved key proof and reconstructs coherent alternative stacks/signature preimages;
it does not generate duplicate positive CFC/UPS proofs or broadcast anything.

`batching/checkpoint-stream/audit-evidence.mjs` also checks structural request,
fee, nonce, call and normal/fork state-chain consistency; it explicitly does not
replace a verifier or enable a wallet/Executor write gate.

Live authorization is false. The inspected protocol admission source does not
establish a maximum snapshot age or inclusion-tip foreign-state freshness.
See `batching/checkpoint-stream/admission-requirements.json` for external
requirements, proposed (not existing) interfaces and rejection evidence needed.
No randomness, finality, real wallet/GUI claim, chain TPS or production conclusion
is established here.

The all-one software-defined-key parameter used by the synthetic test is an
explicit public fixture in test source, has no live registration here, and is
not a wallet recovery secret. No actual wallet key material is archived.
