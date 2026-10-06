# Public evidence: PSY/pUSDT stage, 2026-10-05

Deployment 1758 / vault 499200, two Orderbook 64 matches, initial LP and stage conservation passed. Remaining payment tests require explicit authorization to add vaults 591872 and 499200 to the three ordinary wallet recipient policies. That policy update was rejected by automatic approval review and was not executed.

- `deployment/`: exact new-deployment request, canonical layout proof, independent verification and included receipt.
- `compiled/`, `main.psy.rs`: frozen deployment source and compilation artifact.
- `journals/`: new public-vault tasks and matched included receipts.
- `mcp/`, `receipts/`, `requests/`: public MCP results, receipt bindings and scenario requests.
- `snapshots/`, `audit-*.json`, `partial-audit-corrected.log`: authenticated balances and conservation; locked LP is unassigned, not owned by the vault.
- `partial-audit.log`, `failures/`: preserved first audit assumption error and rejected pre-broadcast batch payment.
- `policy-recipient-plan.json`: concrete proposed allowlist changes, not applied.
- `duplicate-task-check.json`: all three completed tasks skipped without another proof or submission.
- `run-rounds-initial.mjs`: original completed/failed scenario; `run-rounds.mjs`: prepared remaining scenario, not run after rejection.

No ordinary wallet keys, owner/session credentials, recovery files or L1 signing material are included. Existing evidence from earlier tests was not overwritten. Runtime paths in public records identify the original local machine directories; scripts are reproduction records and require configured MCP/runtime dependencies.

Verify public-file checksums from this directory with `shasum -a 256 -c manifest.sha256`.
