# Staging execution evidence, 2026-10-04

See `../../STAGING_TEST_2026-10-04.md` for confirmed results and limitations.

- `receipts-*.json`: indexed transactions reconciled against historical end-user leaf hashes; `matched` contains full included receipts.
- `*.receipt.json`: individual confirmed public vault receipts.
- `snapshot-*.json`: observed balances, order fields, cumulative Outbox payments and consumed cursors. Curve phase/sold/reserve describe the vault user 758784; ordinary users normally have zero values in those fields.
- `*.calls.json`: prepared call stacks. A prepared file does not establish submission; consult matched receipt sources and submission logs. Earlier unused nonce/deadline variants are preserved.
- `mcp-*.json`: public contract-call responses and negative checks. `submitted=true` alone does not establish inclusion; errors may still correspond to included transactions.
- `*-submit.log`: public SD-key driver logs, including pre-submission proof failures and confirmed submission leaf identifiers. `*-rejected.log` records negative local execution, not a bad transaction sent to the chain.
- `local-test-results.json` and test logs: local regression results. 100 buy/sell cycles are local VM execution, not 100 live-chain rounds.
- `manifest.sha256.json`: hashes of the preserved public evidence files, created after the final collection.

No ordinary wallet keys, mnemonic/recovery files, owner/session credentials or wallet keystore files are included. Original September deployment artifacts remain in the separate `staging-2026-09-30` directory. Some `.log` files are ignored by the repository's existing ignore rules but remain available in this workspace.
