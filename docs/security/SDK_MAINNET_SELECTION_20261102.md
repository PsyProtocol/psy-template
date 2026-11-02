# Mainnet-beta selection after audit merge — 2 November 2026

Later application-only continuation: [private root lowering and complete compact
claim UPS](PRIVATE_FT_CONTEXT_COMPATIBILITY_20261102.md). The selected commit and
all frozen SDK sources remain unchanged. The historical missing-intrinsic
observation below is superseded for the explicit application compiler, not for
the raw upstream frontend or live browser acceptance.

## Exact identity

The user authorized returning the selected SDK branch to `mainnet-beta`. Fresh
read-only remote observations resolved **both** `mainnet-beta` and `audit` to
`01b8f2b0a077367a7b9879baba1a72aea8ab5510`. This is the already frozen SDK used by
the audit migration. The client remains
`7058070057c3242b5d8b29e1a31d498aaa4202c0`. Source equality follows from identical
Git commit identity, rather than assuming that a merge or branch name implies
compatible interfaces.

The application [selection](../../batching/dependencies/selected.json) and wallet
`sdk/selected.json` now explicitly record `mainnet-beta` and that exact commit.
The immutable source freeze, Cargo graph, SDK distribution, compiler binary,
Endcap resources, chain identity, method roots, session binding and key identities
are unchanged. No Node or SDK source working tree was modified. Existing
`sdk-audit-v1`, `sdk-audit-20261102-v1`, `audit-reset-20261102` and manifest filenames
remain stable release/cohort identifiers; changing those names would invalidate
existing bindings without changing any actual code.

The October `mainnet-beta` freeze at `c92880c8...` remains historical. It is not
the selected release, and no failed call may fall back to it. Runtime moving
branch names continue to be rejected by the Executor's explicit release gate.

## Local validation

- `prepare_selected_application.py` validated all **2,759** original frozen
  source members and prepared a fresh external application tree with the exact
  existing dependency graph and `sdk-audit-v1` feature. No compiler or prover was
  invoked by that preparation. The selection and its digest are saved separately
  in the new output's `SOURCE-SELECTION.json`.
- Nine targeted Executor release/resource, Native protocol and layout host
  regressions passed. Wrong commit/client/profile, moving-name selection and
  altered resources retain their rejection behavior.
- The wallet SDK-consumer host regression passed, including stale installed
  package, metadata/exports and compiler provenance rejection.
- The ordinary wallet source checkout's actual `verify-sdk.mjs` invocation
  **failed closed**: its mutable sibling SDK has older package metadata/exports.
  That failed observation is retained. Changing the selected branch does not
  turn this checkout into a validated build, and the sibling tree was not changed
  or used for a wallet build.
- One distinct read-only check of the original reviewed isolated wallet build
  verified **472** exact SDK distribution members in both the sibling package
  and installed dependency, plus compiler provenance and Genesis configuration.
  The updated wallet verifier code and current selected manifest were used. The
  original isolated workspace, account state and browser session were not changed.

The local recovery case is `sdk-mainnet-selection-20261102-v1`. It contains the
raw remote-ref capture, fresh application preparation, original isolated-consumer
check and bounded plans. The ordinary-checkout error and short host-test results
are recorded as tool observations in the compact
[validation summary](SDK_MAINNET_SELECTION_20261102.json); they are not represented
as newly exported raw logs. No large source/build/proof tree is added to Git.

## Unchanged acceptance boundaries

There were no new dependency installations, full UPS proofs, deployments,
financial broadcasts, wallet resets or browser payments. Identical source commits
do not require regenerating already verified proofs just to change branch
provenance. They also do not add any acceptance coverage.

The [token compiler-interface gaps](TOKEN_COMPILER_INTERFACE_REVIEW_20261102.md)
remain open: the legacy `.psy` entry is not an audit/current-SDK input and the
U124 private token's `checkpoint_user_tree_root` intrinsic remains unsupported.
Ordinary wallet writes still require a verified isolated build, approved fixed
verification resources, fresh runtime/chain preflight, full transaction binding
and explicit wallet approval. No live UI or production conclusion follows from
this branch-selection update.
