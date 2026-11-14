# curfew

## 0.2.0

### Minor Changes

- Breaking: `runBatches` now rejects with its own errors (`BudgetExceededError`, `HandlerFailedError`, `SourceFailedError`, `ConfigError`) instead of the original error. The original is in `cause`, and each error reports how far the run got.
- New `continueOnError` option keeps the run going past failed batches and lists them in `RunResult.failures`.

## 0.1.2

### Patch Changes

- README quick start now treats a `TimeoutError` from `ctx.signal` as an expected abort, not a failure.

## 0.1.1

### Patch Changes

- README quick start now resumes from the interrupted page on abort instead of failing the Lambda invocation.

## 0.1.0

### Minor Changes

- First release: `runBatches` runs batches from an iterable and won't start one that probably can't finish in the time left.
- The result says why the run stopped (`reason`) and whether more work may remain (`mayHaveMore`).
- Running batches are never killed; `ctx.signal` aborts when time runs out.
- Budgets: `FixedBudget`, `DeadlineBudget`, `LambdaBudget`, or your own `TimeBudget`.
- Estimators: `MaxEstimator` (default), or your own `Estimator`.
- ESM and CommonJS with types. Requires Node.js 22+.
