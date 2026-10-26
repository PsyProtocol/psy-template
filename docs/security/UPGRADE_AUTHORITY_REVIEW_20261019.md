# Upgrade authorization boundary: evidence required before release

Readonly source inspection, 2026-10-19, local Node baseline
`5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6`. No Node edits or constructed/signed/
submitted updates. Running server versions, proxy authentication and network
policy were not verified. These source observations are not proof of an exploitable
issue in the deployed network.

## Observed checks

- The RPC entry forwards the update to its internal handler.
- [Handler](https://github.com/PsyProtocol/psy-node/blob/5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6/psy_node_common/src/coordinator/edge/handler.rs)
  checks deployer equality, unchanged height and valid layout proof; native 0 updates reject.
- [Request](https://github.com/PsyProtocol/psy-node/blob/5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6/client_prover/psy_core/psy_data/src/qblock/cmds/deploy_contract.rs)
  includes deployer/code/whitelist/roots/layout proof, with no separately observed
  deployer-authorization signature field.
- [Edge middleware](https://github.com/PsyProtocol/psy-node/blob/5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6/psy_node_common/src/coordinator/edge/server.rs)
  includes CORS/compression; these do not authorize specific update contents.

Field consistency, layout validity and network access do not automatically prove
deployer authorization. Locate and verify the entire effective authorization path.

## Protocol/operations/security delivery requirements

1. Actual running commit, RPC exposure and update-authentication location.
2. Binding to contract, old/new roots, layout endpoints and anti-replay context.
3. Authority holders, approval/recovery controls and verifiable immutability options.
4. Isolated unauthorized-request rejection: equal owner fields are insufficient.
5. Independently reviewed source/config/rejection evidence in the release record.

Do not probe by updating live contracts. Another ordinary/SD-key deployer alone
is not immutability. Valid layout and authorized calls do not replace upgrade
authorization.

## Application protection delivered

Executor persists all dependency roots; the Rust driver rechecks before proof,
after verification and before broadcast. Config/root/registration changes stop
this Executor. Other public executors and the post-check upgrade window remain
outside that protection. Fingerprints do not authenticate called code/layout
roots. Verified upgrade governance/immutability and independent audit remain open;
all six contracts are not declared production-grade.

## Stable branch recheck: 2026-10-20

The user confirmed `release/testnet-stable`; observed remote HEAD:
`6eb535003bdab1fcdb27386dbcb93e8aa9727998`. A branch name does not attest the actual
running image/binary digest. The Node checkout was not edited or switched.

- [Stable handler](https://github.com/PsyProtocol/psy-node/blob/6eb535003bdab1fcdb27386dbcb93e8aa9727998/psy_node_common/src/coordinator/edge/handler.rs#L634)
  still checks deployer equality, height, layout proof and endpoints.
- [Stable request](https://github.com/PsyProtocol/psy-node/blob/6eb535003bdab1fcdb27386dbcb93e8aa9727998/client_prover/psy_core/psy_data/src/qblock/cmds/deploy_contract.rs#L173)
  has no observed deployer signature over this update.
- [Stable server](https://github.com/PsyProtocol/psy-node/blob/6eb535003bdab1fcdb27386dbcb93e8aa9727998/psy_node_common/src/coordinator/edge/server.rs)
  inspected middleware is CORS/compression. Effective authentication proxies,
  network isolation and method authorization are unverified, so no deployed
  exploitability conclusion is made.

The recheck does not close authorization evidence. No live update/attack was sent.
Hashes: `batching/evidence/20261020/capacity-recovery-v1/testnet-stable-source.json`.
SDK differences: [follow-up](MARKET_BATCH_FOLLOWUP_20261020.md).

## Additional preserved source references

- [api.rs](https://github.com/PsyProtocol/psy-node/blob/5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6/psy_node_common/src/coordinator/edge/api.rs)
