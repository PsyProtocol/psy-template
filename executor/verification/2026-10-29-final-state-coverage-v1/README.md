# Final-state coverage and source-bound ordering evidence

Start with [SUMMARY.json](SUMMARY.json), [index.json](index.json) and the
[implementation/trust-boundary report](../../../docs/security/FINAL_STATE_COVERAGE_20261029.md).

This archive contains **synthetic checkpoint-state evidence**, actual native
Merkle verification and six standalone ordering page proofs. It is not a
financial UPS, canonical/finality certificate, live RPC capture, deployed market,
ordinary-wallet claim, refund receipt or chain throughput measurement.

The approved scope is every final eligible current order at C, including older
active orders. Intermediate replaced order versions are not additional trades.
Both AMM and Curve fixtures contain 18 accounts, nine eligible members, three
funded recovery candidates and explicit other exclusions. Each ordering stream
has pages 4 + 4 + 1. Financial settlement cursor is zero; authority stays closed.

## Archive and original preservation

`index.json` maps each logical artifact to a content-addressed gzip blob. Multiple
logical copies can refer to the same blob. Entries contain original, public and
compressed digests. Only local paths in run logs/inventories were redacted;
compilation artifacts, snapshots, manifests, Merkle openings and proof bytes are
unchanged. No original source artifact or failed run was replaced.

- `fixtures-v1/`: real frozen candidate compilation artifacts with synthetic
  reviewed function roots, identities, state/checkpoints and public key parameter.
- `native-integration-v1/`: source captures, native outputs, exact stream
  preparation/proofs, journals, rejection inputs and restart summaries. Sealed
  executable copies are excluded and identified by SHA256.
- `run/public/`: declared budgets, all failed and successful build/test runs,
  process-family RSS samples and complete source/binary inventory.
- `source/`: the modified implementation/tests plus unchanged ordering code and
  application Cargo manifest/lock for inspection. Use the repository commit and
  frozen materializer for the remaining unchanged application files.

No private key, mnemonic, recovery wallet or financial signature witness was
created or archived by this milestone. Public synthetic state words and key
parameters are not secret signing material.

The final native host suite passed eight tests; the actual-native integration
passed three cases. Existing regressions had 41 passing cases plus a missing
fixture environment in one file; a second launch used a fixture directory without
policy files. The correct policy fixture run passed four cases. All failures are
retained, along with three earlier application compile failures and the first
missing-environment host test run. They are not represented as successful runs.

Independent read-only review caught the JavaScript/native canonical history-root
format mismatch before integration. The fix passed actual CLI acceptance; final
review found no remaining actionable issue in this conditional component. See
[REVIEW.json](REVIEW.json). This does not review an unimplemented financial UPS.

## Integrity and reproduction

Run `python3 unpack.py FRESH_DIRECTORY` to verify all gzip/public digests and
unpack without overwriting an existing directory. Materialize the fixed SDK and
build a fresh application using the instructions in the implementation report.
The integration fixture/proof statements differ from 28 October's conditional
manifests, so six new component proofs were generated under the recorded budget.
Restart uses those exact saved proofs. Neither the raw-transaction coverage gate
nor the market/SD-key/full-UPS settlement gate was enabled.

The native collector's `capture` action is compiled against actual SDK APIs but
not live-tested here. Its injected reader test uses fixture transport and real
Merkle checks, not real network finality. Root approval/release pins remain
external trusted inputs. Existing market pricing, shared vaults, matching and NFT
winner rules were not changed.
