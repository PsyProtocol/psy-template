# SD key transaction digest regression

This offline regression proves a synthetic session whose policy permits method `7`, then requires rejection when the transaction digest instead commits to method `8`. It uses a synthetic fixed key and in-memory user state.

Run against the adjacent `psy-node` checkout:

```sh
cargo run --release --offline --manifest-path tests/security/sd_key_sighash_repro/Cargo.toml
```

Success prints `VERIFIED: allowed session accepted; unauthorized real transaction digest rejected`. A checkout with the original digest-binding bug fails the final assertion. Record the node revision and local source diff when comparing results; this checks the locally compiled circuit, and does not establish which circuit version is deployed on staging.
