---
'curfew': minor
---

Breaking: `runBatches` now rejects with its own errors (`BudgetExceededError`, `HandlerFailedError`, `SourceFailedError`, `ConfigError`) instead of the original error. The original is in `cause`, and each error reports how far the run got.
