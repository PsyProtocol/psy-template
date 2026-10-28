# Independent source and evidence review

The independent read-only reviewer inspected the changed application sources,
tests, report and relevant evidence metadata before delivery. The reviewer ran
no builds, proofs, tests, RPC or financial operations and made no edits.

| Finding | Resolution |
|---|---|
| A loop variable shadowed the profile selector, making default builds choose v4. | Renamed the baseline variable. Preserved reproduction and confirmed default v3 source/policy/artifact byte identity. |
| Inactive frozen rows could contain nonzero stored nonces and fail native rank derivation. | Canonical zero owner/nonce padding for inactive ranking inputs; original authenticated terms are retained. Two/three/four-member tests cover it. |
| The metrics wrapper accepted v4 but configuration validation rejected it. | Both compact profiles now share the same opt-in metrics validation and wrapper; route tests require persisted scope-bound metrics. |

Final review found no unresolved actionable blocker. All 87 compressed and
expanded artifact digests and indexed source digests were verified. Four saved
requests contain 130,328-byte proofs and match native account identities and
linked commit/settlement endpoints. This is evidence inspection, not a claim
that every generated integer was manually reviewed.

The review accepts the explicitly producer-controlled model. It does not
establish unbiased entropy, finality or actual seal-before-release causality.
Documentation correctly distinguishes synthetic complete UPS acceptance,
coordination doubles and compiled but unexercised native RPC/broadcast paths.
Network deployment, ordinary-wallet claims and recovery UPS acceptance remain
open. Root is the sole native execution owner for this milestone.
