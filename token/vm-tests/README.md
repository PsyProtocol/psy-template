# Compiled token payment return tests

The VM executes the compiled cancellation, claim and claimed-funds refund methods against several synthetic user partitions. Tests cover original-payer returns, repeated cancellation and claims, partial claimed refunds, subsequent deposits, Outbox overflow, and preservation of private note state.

Build the legacy/public artifacts and the private profile before running this separate token test crate:

```sh
cd token
npm run build
# Set PSY_PRIVATE_CLI to the isolated compiler from scripts/build_private_toolchain.sh.
npm run build:private-v3
cd ..
cargo test --release --offline --manifest-path token/vm-tests/Cargo.toml
```

An adjacent `psy-node` checkout is required. The private build script independently checks its verifier fingerprint. These local tests read generated artifacts under `token/target`; they do not deploy a token or update genesis contracts.
