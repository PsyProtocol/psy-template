# Isolated deployment receipt ID mismatch (external investigation pending)

## Observed facts

Two initial controller deployments on 2026-10-23 UTC were included at checkpoint
370953. Both API `result.contract_id` values were **2489**:

- Success request: `7b3dc71e1561d14859c48f2bb505f2671b50c46a204f04f96be461d2b37ade38`.
- Recovery request: `fa173f9d5761798ce9c313962b32ce5f33f58d6992586c97d5c7cb2b869aa097`.

Actual coordinator metadata differed:

| Actual ID | Code root | Deployer |
| --- | --- | --- |
| 2489 | `8ed56073c14f7bfe3b8383f67a65b44f6e6e854138798d3da6fdd73d31783d79` | `8e9c77e906f653d29d868aafd784b4fff6ac01062f337a1078354bcb9169ccf9` |
| 2490 | `ed8349dce1a5dd83569bf69187d86fd6f525b771b37fe2ea5ffbfdf05eda40ea` | `0110846a44285289643e8e32fb684be8c3006a419ce33d50d3351034db29dd2a` |

Six actual metadata/deployer checks blocked the success instance before funding.
No ID check was bypassed and matching code found by scanning was not treated as
an original receipt. The suspected issue is associating multiple deployments
within one checkpoint with assigned IDs. The responsible running service/version
is unverified; this does not establish incorrect coordinator state allocation.

## Handling

- Preserve both original requests/artifacts; no resend or contract update.
- Exclude 2490 from financial acceptance; no composition key registration/principal.
- One explicitly recorded serial deployment used a distinct identity and the same
  reviewed bytecode. Fresh **2491/vault 1445056** passed receipt/deployer/code/layout/
  function/field/slot checks. The final request owner in code did not change.
- Recovery **2489/vault 134336** matches its original receipt/metadata.
- No Node or old-contract update. Earlier unfunded 2487/2488/keys remain retired.

## External evidence required

1. Identify the component/source producing deployment `result.contract_id` at
   `/api/v1/transaction/hash`.
2. Demonstrate one-to-one mapping for same-checkpoint deployments with distinct
   code/deployers, including duplicate indexing, replay/rebuild and restart tests.
3. Requery original content hashes after repair, retaining original responses.

Local public originals:
`composition-live-v2/public/INITIALIZED-DEPLOYMENT-OCCURRENCES-v2.json` and
`CONTROLLER-DEPLOYMENT-OVERRIDE-v1.json`; archive:
`executor/verification/2026-10-24-composition-initialization-v1`.
Only public requests/proofs/receipts/identities, never wallet recovery material.
