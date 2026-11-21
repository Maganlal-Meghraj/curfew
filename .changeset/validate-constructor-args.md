---
'curfew': minor
---

Breaking: `DeadlineBudget`, `FixedBudget`, `LambdaBudget` and `MaxEstimator` now throw on invalid arguments (a non-number, `NaN`, or a negative or infinite margin or initial estimate) instead of creating a budget or estimator that can never run a batch.
