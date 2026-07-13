# Versioning

ytctl follows [Epoch Semantic Versioning](https://antfu.me/posts/epoch-semver) while keeping browser-compatible numeric versions.

## Format

```text
{EPOCH * 1000 + MAJOR}.MINOR.PATCH
```

- **EPOCH**: a rare, significant new era for the project
- **MAJOR**: an incompatible change
- **MINOR**: a backwards-compatible feature
- **PATCH**: a backwards-compatible fix

Examples:

- `0.1.0`: current initial beta
- `1.0.0`: first incompatible/stable-major boundary in epoch 0
- `2.0.0`: another incompatible change in epoch 0
- `1000.0.0`: the first major product epoch

## Changesets

Changesets continues to operate on valid SemVer numbers:

- `patch` increments `PATCH`
- `minor` increments `MINOR`
- `major` increments the combined first number, equivalent to `MAJOR` inside the current epoch

An epoch transition is intentionally exceptional. To start one, manually set the first number to the next multiple of 1000, synchronize the manifests with `node scripts/sync-version.mjs`, and document the transition prominently in the changelog.

Browser extension manifests only accept numeric version components. Do not use suffixes such as `-beta.0`; beta status is communicated through the `0.x` version, store release notes, and release labels.
