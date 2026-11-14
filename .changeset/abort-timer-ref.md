---
'curfew': patch
---

`runBatches` no longer fails with `timer.unref is not a function` on runtimes where `setTimeout` returns a number, and Node no longer exits in the middle of a run while a handler waits on `ctx.signal`.
