# Contributing

Use **English** for maintained source comments, identifiers, runtime errors,
UI/accessibility copy, tests, READMEs, design/security reviews, reports, commit
subjects/bodies and pull-request descriptions. Contributor conversation may use
another language; published project material is for an international team.

Preserve exact financial/protocol identifiers, integer values, hashes, paths and
raw evidence. Language editing must not change market behavior, permissions,
SDK/Node dependencies, old contracts or archived requests/receipts/proofs.

Historical evidence is not rewritten to make a language check pass. Existing
exceptions are individually inventoried and SHA256-bound in
`docs/language/FROZEN_EXCEPTIONS_20261026.json`; new prose does not inherit their
permission. Provide English reviewer context instead. Unicode protocol tests may
retain runtime UTF-8 through ASCII source escapes. Required literal historical
filesystem paths are provenance, not translated names.

Before committing documentation or source text:

```sh
npm run check:language
python3 scripts/check_language.test.py
```

The check covers tracked and nonignored new UTF-8 text. It rejects Han-script prose
outside exact frozen exceptions and any change/deletion of those originals.
It is not a general English grammar checker, a commit-history rewrite, a financial
validator or a replacement for existing release/security gates. Existing binary/
compressed evidence has a separately recorded complete archive scan. A release
must still satisfy `PRODUCTION_READINESS.md` and module-specific acceptance.
