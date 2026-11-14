# Changesets

Each file here is one pending changelog entry. Add one with `npm run changeset`. Docs: https://changesets.dev.

## Writing a changeset

Keep it small and human readable:

- One change per changeset. Two unrelated changes in a PR get two changesets.
- One or two short sentences, written for someone using the package, not someone reading the diff.
- Say what changed and why it matters to them. Skip internals, file names and refactors they won't notice.
- Name the API in backticks (`runBatches`, `StopReason.DONE`). Don't mention the PR number.

Good:

```md
---
'curfew': patch
---

`MaxEstimator` no longer treats a `NaN` duration as the longest batch.
```

Too much:

```md
Refactored estimator internals: moved the NaN check from MaxEstimator.record()
into a shared isValidDuration helper, updated tests, and also bumped vitest.
```
