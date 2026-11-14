# How curfew behaves in detail

The [README](../README.md) covers everyday use. This page covers the edge cases.

- [What a batch's duration covers](#what-a-batchs-duration-covers)
- [Slow or stalled sources](#slow-or-stalled-sources)
- [The abort signal](#the-abort-signal)
- [Resuming](#resuming)
- [Errors in detail](#errors-in-detail)

## What a batch's duration covers

The duration of a batch covers both fetching it from the source (`iterator.next()`) and running the handler, so slow async sources such as DB cursors or paginated APIs are counted. Durations are measured with `performance.now()`, so system clock changes don't affect the estimate.

The estimator records each successful batch's duration, and each failed one's with `continueOnError: true`.

The budget is checked before pulling the next item, so no item is ever pulled and then dropped. That's why `mayHaveMore: true` means "there may be more work": if the budget runs out just as the source is exhausted, the next run processes 0 batches and returns `mayHaveMore: false`.

Items from a sync iterable are passed to the handler as is: a sync iterable of promises hands the handler the promises themselves, not their values.

## Slow or stalled sources

The source gets no signal and is never interrupted: `runBatches` awaits `iterator.next()` with no time limit. A fetch that stalls keeps the run waiting past the budget and through the safety margin, until the platform stops the invocation. Plan for it:

- Give a source that can stall its own timeout.
- Size the safety margin to cover the slowest fetch plus the slowest batch, plus the time needed to re-enqueue.
- Fetch time is part of each batch's measured duration, so a source that is slow on every batch makes the run stop earlier. Only a fetch slower than any before it gets past the check.

## The abort signal

When the budget runs out, `ctx.signal` aborts with a `TimeoutError` reason (the same as `AbortSignal.timeout()`).

- **It may already be aborted when the handler starts.** If fetching a batch overruns the budget, the handler still runs. Call `signal.throwIfAborted()` at the top of the handler: the run then rejects with a `BudgetExceededError` and the batch is not counted. `batchesProcessed` counts every batch whose handler returned without throwing, so a handler that returns early (`if (signal.aborted) return`) is counted, and a resume by offset skips that batch for good.
- **It can't fire during synchronous work.** The abort is delivered by a timer, so it fires only when the event loop is free. During synchronous or CPU-bound work, `signal.aborted` stays `false` even after the budget has run out. To check in the middle of such work, call `budget.remainingMs()` (it reads the clock, so it is always current), or yield to the event loop between chunks with `await setTimeout(0)` from `node:timers/promises`. `setImmediate()` is not enough, because it can resolve before the abort timer fires.
- **It is armed once.** The timer is set from `budget.remainingMs()` at the start of the run. With a custom budget that isn't based on the clock, the signal and the decision to stop can disagree.
- **It never fires for very long budgets.** For budgets longer than about 24.8 days (the `setTimeout` limit), including `Infinity`, the signal never aborts. The budget check before each batch still applies.

## Resuming

`runBatches` never calls `iterator.return()`, whether it finishes, stops early or the handler throws. You own the source's cleanup.

There are two ways to resume:

- **By offset**, in a new invocation: start at `batchesProcessed + failures.length`. This always works.
- **On the same iterator**, only when `runBatches` returned a result:

  ```ts
  const source = generateWork()
  const first = await runBatches(source, handle, { budget })
  if (first.mayHaveMore) await runBatches(source, handle, { budget: nextBudget })
  ```

  An array (or any iterable that creates a fresh iterator each time) starts again from the beginning, so resume it by offset instead.

After a rejection, including `BudgetExceededError`, resume by offset. The batch whose handler threw has already been pulled from the iterator, so a second run on the same iterator starts at the batch after it and never retries it. With `continueOnError: true`, failed batches are consumed the same way and are reported in `failures`.

## Errors in detail

Each curfew error names the part of your code that threw, keeps the original error in `cause`, and reports how far the run got (`batchesProcessed` and `failures`).

- `BudgetExceededError` is decided by curfew's own signal, not by the error the handler throws. An unrelated timeout from a downstream call (for example `fetch` with its own `AbortSignal.timeout()`) with time left is a `HandlerFailedError`. A genuine failure that happens after the budget ran out is a `BudgetExceededError` too; the original is in `cause`, and the next run surfaces it with time left.
- The interrupted or failed batch is not counted in `batchesProcessed` and is not in `failures`.
- The message is the original error's message with a `[curfew] ` prefix (for example `HandlerFailedError: [curfew] Cannot read properties of undefined`), so logs and alerts still say what broke.
- Each error sets `name` (for example `'BudgetExceededError'`). If both the ESM and CommonJS copies of curfew get loaded, `instanceof` fails across them; check `error.name` instead.
- A non-iterable source rejects with a plain `TypeError`.

With `continueOnError: true`, each failure is recorded as `{ index, error }` with the original error, and `batchesProcessed` counts only successful batches. A budget abort still ends the run with a `BudgetExceededError` that carries the failures so far, and a failing source still ends it with a `SourceFailedError`. A run where every batch failed ends with `reason: 'done'` and `batchesProcessed: 0`.
