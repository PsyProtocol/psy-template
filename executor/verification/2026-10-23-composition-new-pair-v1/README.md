# Independent QA-B receipt and new two-pool prerequisites

2026-10-23, original branch and SDK retained. 82 exact public files, 20,808,708
compressed bytes; hashes in manifest.json. No keys, wallet recovery files or
executables included. Original case paths are recorded by the manifest.

## Included testnet prerequisites

- QA-B **2484**, canonical issuer and deployer **406720**, 18-decimal reviewed
  dual-Felt FT source. Initial deployment hash
  `ea8eaafd385df8425dd8e03010c47e8ea66c915d4a3304ddd3e1230613b7ad6f`,
  included checkpoint **370732**. This is the single bounded alternative recorded
  in QA-B-ALTERNATE-PLAN-v1.json. Older unknown requests are excluded, not resent,
  and not established as discarded. QA-B 1000-token issuance/renunciation and
  send to owner 1717440 are included; owner claim is a separate later gate.
- New AMM **2485**, vault **1012928**; AMM **2486**, vault **718016**.
  Exact initial-deploy requests/receipts and distinct key registrations retained.
  All six code/layout/function/height/count identity fields checked. Deployments
  and registrations alone are not LP, swap or composition acceptance.
- The new confirmDeploy gate waits until the common public checkpoint includes
  the deployment occurrence before publishing its prerequisite. Original
  earlier reports are preserved, including any older observation fence.

## Read-only evidence and application fix

Both failed claim attempts have broadcastMayHaveBeenAttempted=false and retain
only failure evidence. The first failed while proving calls; the reviewed next
attempt failed post-proof public-state checking. Their error hashes match the
exact frozen SDK empty-JSON EOF message. A separate read-only local call proof
passed (21.605 s), without end-cap signature or broadcast. This does not establish
full UPS success, nor identify which upstream component returned an empty body.

Pinned ordinary application v4 adds bounded recognized public-read retries;
no signature/state/nonce/dependency validation is removed, no partial proving
session or broadcast is retried. Original binaries remain unchanged. The SDK
manifest is still 0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425.

Actual canonical controller recompilation/whole-integer-IR/ABI/root closure
passed over a prior synthetic-ID fixture in 34.540 s. This is startup validation,
not transaction proving performance. Composition regression: 61 passed. Current
adapter additionally requires controllerCompiler pin; all four base source and
key gates remain. New runners still need actual included financial evidence.

No Node changes, old contract upgrade probes, SDK migration or artifact overwrite.
No cross-vault atomicity, network TPS, global fairness or production conclusion.

Verify archive integrity (not cryptographic acceptance):

    python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-23-composition-new-pair-v1 --original /ABS/PATH/psy-market-recovery-20261023
