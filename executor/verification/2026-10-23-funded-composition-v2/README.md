# Supplement to funded-composition-v1

Current v7 compiled controller: two full linked UPSs for funding then cancelled
input return, independently reverified; owner request/funding/cancel/final claims
remain VM-only. Actual recipient receives original dual-limb input and controller
ends with zero A/B/native balance. No broadcast or network acceptance.

Four base compact key identities are exactly unchanged after the shared app
refactor. Context-key rebasing tests pass. Final client funding module pins the
selected SDK and isolated magic; its source and 36-test log supersede the earlier
client-source snapshot in v1. It does not authenticate snapshots or enable an
unattended financial adapter. Sources for actual controller/key proofs remain v1.

Both manifests are append-only raw/gzip SHA256 evidence. Verify with
`python3 executor/acceptance/verifyCompactArchive.py DIRECTORY`.
