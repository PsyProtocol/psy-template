# Actual authenticated intake, sealed batch and first fill

Fresh controller 2492 / execution account 1756352 uses epoch 5 / fixed cutoff
372100, one enrolled member / order nonce 1. Consent confirms at 372041, admission
at 372059, seal at 372107, commit at 372135 and settlement at 372150. Deadline
checks and the original member set remain unchanged; no random mode enabled.

1 QA-A produces exactly 0.633097631070860774 QA-B. The recorded fixed snapshot
checks reserve A + input, reserve B - output, exact original quote and consumed
nonce 1. The output in this snapshot is still a shared-vault Outbox, not execution
account spendable funds. Second-hop cancellation, compensation, ordinary owner
claim and independent final cohort proof verification remain pending.

All five base-stage and controller-consent original requests/preflights/receipts,
source-bound Executor configuration, sponsor funding requests and public state
observations included. Funding classification checks 19 then-included ordinary
inputs by exact preflight SHA; gas authorizations and transfers are not counted
as separate payments, and neither is mislabeled as network receipt burn.

188 immutable public files / 4,886,239 gzip bytes; all originals compared.
Integrity comparison is not independent cryptographic verification or runtime
attestation. No wallet secrets, binaries, original file edits or Node changes.
