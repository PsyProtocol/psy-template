# Reservation-only prerequisite

`reservation.mjs` generates an independent controller for one consent per epoch.
It binds network magic, controller ID, owner, request nonce, execution account,
epoch, expiry, fee budget, both U124 limbs, owner receiver, execution key and the
compiled registry digest into a Poseidon commitment. Acceptance compares the
requested key with the authenticated `ctx.user_public_key`. Active consent cannot
be replaced before its epoch ends. Cancellation before acceptance rejects the
reservation; owner cancellation or expiry releases an active reservation and
consumes its nonce. Empty epochs expire separately.

**There is no claim, transfer, spend, custody or route execution method. Do not
send funds to this profile.** It is not the completed financial controller. Its
immediate cancellation rule is safe only with zero custody: a funded workflow
must first finish/expire any base-market order and recover its actual current
asset. It must not reuse this rule to unlock a live funded order.

The fixture registry is synthetic (`a` repeated 64 times). Bridging the strict
client intent, complete route identities and this on-chain commitment remains
unfinished. No dedicated SD-key, CFC/full UPS or deployment is claimed.

## Build and evidence

`prepare.mjs REVIEWED_COMPILER FRESH_OUTPUT` requires the pinned local application
compiler SHA256 `3ee64b05…c4fca68` and the existing SDK manifest
`0afb4c65…63bd425`. It writes source, compile log, artifact and explicit unverified
gates into a new directory. The compiler only extends application-side Felt
rebasing for the context-key opcode; Node/SDK sources are unchanged. It generated
byte-identical artifacts for all four unchanged market sources. Existing financial
binaries, keys, deployments and original compile artifacts were not replaced.

Rebuild from the frozen SDK with the app's locked Cargo manifest and
`nightly-2025-09-20`; target `--bin compile_batch`. The measured build used a fresh
SDK source copy, verified all 1,466 file hashes, and a cloned Cargo cache. This
local debug binary digest is host/path specific; it is not a portable reviewed
SDK release or a claim of bit-identical binaries across machines.

Run `--lib context_rebase_tests` and `--test composition_reservation` with
`COMPOSITION_RESERVATION_ARTIFACT=.../compiled/compilation_artifact.json`.
Tests use the frozen SDK's proving-path primitive executor and a test-only,
unauthenticated state adapter; the lightweight VM does not materialize all four
context-key components. No bytecode/key check is substituted. Only the known
SplitBits range-rejection panic is contained; arbitrary panics fail the tests.

Evidence: `executor/verification/2026-10-23-review-v1/composition-reservation-prerequisite-v1/`.
It retains original compile failures, test failures and final passes, source
hashes, the unchanged-SDK check and four-market byte comparisons. Hash integrity
does not establish Merkle-path authentication, session authorization or full UPS
validity. Those gates must close before adding or enabling custody.
