# MCP permission repair and confirmation interface: 2026-10-09

Historical status: generic token-call gate, stale Nostr tests and client confirmation
adapter completed. Default suite: **1,136 pass, 0 fail, 11 ignored**. Five separately
run ignored historical-policy diagnostics all failed. The installed service was
not switched while the scope of those findings was being resolved.

## Delivered

1. Generic `call_contract` rejects all direct methods on **PSY 0/pUSDT 4** before
   wallet/network/accounting/proof/submission, returning `gate: policy`,
   `submitted: false` and directing callers to dedicated tools.
2. Handler tests preserve nonzero spent/session budgets and stored files on
   rejection; custom contracts 64/1494/1758 still take the original route.
3. Nostr tests follow commit `73f9b85a27efb986be3e0267a34386887073ccf7`
   (September 9), which removed outer deposit-proof version. Bridge/wallet already
   used that format. Only stale test expectations changed; production bytes remain
   identical. Added index, seconds timestamp, token ID, root/nullifier/count and
   encrypted-secret assertions.
4. `scripts/mcp_confirmed_client.mjs` exposes prepare/execute. The caller displays
   the summary and obtains owner confirmation before supplying credentials.
   Execute accepts ticket/credentials only, with no transaction mutation or raw fallback.
5. `mcp_payment_guard` rejects raw/prepared generic-token calls. Five client tests
   pass, covering all 16 current transaction operations.

| Check | Historical result |
| --- | --- |
| All 19 default MCP crate test targets | 1,136 pass, 0 fail, 11 ignored, exit 0 |
| Local dual-network RPC | Executed, no sandbox skip |
| Actual MCP stdio | Eight generic calls rejected, three custom routes accepted, ticket replay rejected |
| Client adapter | Five pass, no raw fallback |
| Template exchange/Executor/security | 93 pass, none failed/skipped |
| Separately ignored policy diagnostics | Zero pass, five fail, exit 101 |
| Chain submission/real wallet-file writes | Zero in this interface check |

Default success did not mean all permission issues were fixed. Eleven ignored
entries included five historical findings plus six duplicate debug/online Nostr/
L1/RPC tests; `verification.json` lists originals. Online debug/faucet tools did
not run.

## Historical findings reproduced

Existing ignored `tests/adversarial_policy.rs` tests found: cross-day refunds
reducing the new day's spent budget; empty recipient aliases treated as incoming;
`0x1234` confused with public user 1234; `self` bypassing outgoing recipient limits;
and corrupted policy files overwritten, losing original budget/pause state.
Production policy.rs had not changed at this milestone. These are engine
observations, not executed chain attacks; downstream parsing rejects some inputs.
They were neither introduced nor marked passing. Service installation/release was
paused under the sibling Node repository's failure rules pending user scope.

## Scope and provenance

MCP is a separate RPC client binary, `psy-mcp-server`, under
`psy-node/client_prover/psy_mcp_server/`, sharing wallet/prover libraries. This work
changed MCP interfaces/tests/template client, not block production, coordinator,
consensus, circuits, VM or on-chain contracts. Generic calls still do not audit
arbitrary contracts' deferred recipient/principal effects.

- Base: `PsyProtocol/psy-node` `multi_chain`,
  `5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6` plus then-uncommitted MCP patches.
- Existing genesis gitlink: `9ea96ca13f60247c22b2108f086fb9cd1287ba94`, not regenerated.
- Build: `/private/tmp/psy-mcp-policy-fix-20261009/clean-node`, clean archive plus
  six MCP files, original Cargo.lock, release/locked/offline.
- Candidate: `/private/tmp/psy-mcp-policy-fix-20261009/target/release/psy-mcp-server`,
  SHA 256 `4c7202a3257e7dbae53947a6f4a747074674764becff135513cd6978ef670630`.
- Installed binary was unchanged, SHA 256
  `1c02ada7f06a3274e6ac6f359fbddae12aeba926a08454d8f4e7e0b660a6b38d`.
- [Follow-up source/patch/logs](tests/security/mcp-policy-fix-followup-2026-10-09/).
- [Initial failed regression](tests/security/mcp-policy-fix-2026-10-09/) remains;
  an earlier hash is not the later overwritten build's identity.

Source prepare/execute required owner credentials; installed old service still
used direct transactions. No automatic confirmations, wallet-policy changes,
wallet switching or service restart occurred. Three pre-existing circuit/prover/
VM edits retained original hashes and were excluded. Existing market evidence
remains intact. This historical note does not authorize changing Node now.
