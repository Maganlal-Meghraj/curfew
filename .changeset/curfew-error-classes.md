---
'curfew': minor
---

`runBatches` now rejects with its own errors (`BudgetExceededError`, `HandlerFailedError`, `SourceFailedError`, `ConfigError`), so a budget abort is easy to tell apart from a real failure, and every error keeps the original in `cause` and says how far the run got.
