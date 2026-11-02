# Funded composition candidate: controller proofs, not network acceptance

Eight linked full controller UPSs, current v7 compiled fixture. Frozen SDK manifest
`0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`.
SDK source hashes: all 1,466 unchanged. Node not edited. Manifest verifies byte
integrity only; the saved `verification-nonce-*.json` records independent pinned
end-cap/common-data + metadata/fee validation for each request.

Route: A42 → B43 → A42 on market1000/vault300 and market1001/vault400;
controller1002, execution100, owner200. **Synthetic IDs and registry: do not fund.**
Input 4611686018427387921, actual middle 3738416797288011079,
final 3141711878267176122. Input has both 62-bit limbs nonzero.
Controller key fingerprint `fb521cb445c3628dc6c635b19ef3b89c3cbacfdb142de4fdf168015476e8baac`;
public key `ce2d0dc93cff7d8d596825ea8729bae2be11ea1d1591565ece44b67af1f42744`.

## Replay

Verify archive with `python3 executor/acceptance/verifyCompactArchive.py DIR`.
Decompress `files/fixture/*` and `files/eight-controller-ups/*` into a **fresh**
directory, checking both compressed and raw SHA256 in manifest. Rebuild using the
existing frozen SDK source recipe, this branch's Cargo.lock and
`nightly-2025-09-20`; `BUILD.json` retains host-specific binary/compiler digests.
Use the archived raw artifact bytes: native JSON parse/stringify would round
Goldilocks constants and is forbidden. The app-side range lowering adds the
context-public-key opcode; existing SDK sources stay frozen.

Set `PSY_CONFIG_PATH` to frozen-build-config.json, `PSY_NETWORK=localhost`,
`RAYON_NUM_THREADS=2`, `CARGO_BUILD_JOBS=1`, and a separate Cargo target directory.
Run with `COMPOSITION_BUILD=RESTORED/fixture`:

    cargo +nightly-2025-09-20 test --release --offline --locked --manifest-path amm/u124/vm-tests/Cargo.toml --test composition_funds
    cargo +nightly-2025-09-20 test --release --offline --locked --manifest-path amm/u124/vm-tests/Cargo.toml --test composition_key

For eight full proofs set `COMPOSITION_UPS_OUT` to a **nonexistent** fresh output:

    cargo +nightly-2025-09-20 test --release --offline --locked --manifest-path amm/u124/vm-tests/Cargo.toml --test composition_funds -- --ignored --exact full_ups::two_pool_controller_workflow_full_ups --nocapture

Verify each preserved request with reviewed `verify_saved_ups REQUEST FRESH_JSON`.
The archived application sources freeze this exact test; later changes require
fresh evidence. Failed builds v1/v2 are preserved alongside successful v3.

## Boundary

Controller calls: real bytecode/CFC, SD-key, recursion/end-cap, authenticated
synthetic checkpoints, complete stack/session, fees and exported state endpoints.
Base-market setup, LP, admission, commitment and swaps: bytecode VM only.
Ordinary owner funding and final recipient claims: bytecode VM only.
No registration, network submission, multi-vault atomicity, financial adapter,
peak-memory result or production assertion. Missing paths remain listed in
composition/CAPABILITIES.md and the team review document.
