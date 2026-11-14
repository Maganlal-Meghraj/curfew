# curfew

Run batches from an (async) iterable and stop **before** a time budget runs out.

Built for AWS Lambda (15 min hard limit) and similar time-limited runtimes: instead of being killed mid-batch, `curfew` won't start a batch that probably can't finish, and tells you to reschedule the rest.

- No runtime dependencies
- Pluggable time budget and duration estimator
- In-flight batches are never killed; they get an `AbortSignal` instead

## Install

```sh
npm install curfew
```

Requires Node.js 22+. Ships ESM and CommonJS.

## Quick start (AWS Lambda)

```ts
import { BudgetExceededError, LambdaBudget, runBatches } from 'curfew'

export const handler = async (event, context) => {
  try {
    const { batchesProcessed, failures, mayHaveMore } = await runBatches(
      fetchPages(event.offset),
      async (page, { signal }) => {
        await processPage(page, { signal })
      },
      { budget: new LambdaBudget(context, 60_000) },
    )

    if (mayHaveMore) {
      await reenqueue({ offset: event.offset + batchesProcessed + failures.length })
    }
  } catch (error) {
    // The budget ran out mid-page: an expected stop, not a failure. Resume from the interrupted page.
    if (!(error instanceof BudgetExceededError)) throw error
    await reenqueue({ offset: event.offset + error.batchesProcessed + error.failures.length })
  }
}
```

## Example

[`examples/basic.ts`](examples/basic.ts) processes 10 pages with a 1-second budget per run. It shows the three ways a run ends, and how to resume after each:

- **Budget runs out mid-page.** `saveItem` passes `ctx.signal` to its async work, so it rejects with an `AbortError` and `runBatches` rejects with a `BudgetExceededError`. The example's `runOnce` catches that and resumes from the interrupted page (`fromPage + error.batchesProcessed`), which is why page processing must be idempotent.
- **The next page won't fit.** `reason` is `estimate-exceeds-budget`, and the next run starts at the following page.
- **All pages done.** `reason` is `done`.

```sh
npm run build && node examples/basic.ts
```

```
run 1: starting at page 0
  stopped: budget ran out during page 4
run 2: starting at page 4
  stopped: estimate-exceeds-budget
run 3: starting at page 5
  stopped: done
all pages processed
```

Requires Node.js 22.18+ to run `.ts` files directly.

## How it works

Before pulling each batch, `runBatches` checks the budget. It stops and returns `mayHaveMore: true` with a `reason` if:

- the budget is used up (`StopReason.BUDGET_EXHAUSTED`), or
- the estimated batch duration is longer than the time remaining (`StopReason.ESTIMATE_EXCEEDS_BUDGET`).

When the source runs out, it returns `mayHaveMore: false` with `StopReason.DONE`.

```ts
import { StopReason } from 'curfew'

if (result.reason === StopReason.ESTIMATE_EXCEEDS_BUDGET) {
  console.log('stopped with time left; consider a smaller batch size')
}
```

The duration of a batch covers both fetching it from the source (`iterator.next()`) and running the handler, so slow async sources such as DB cursors or paginated APIs are counted. Durations are measured with `performance.now()`, so system clock changes don't affect the estimate.

Batches run one at a time. Items from a sync iterable are passed to the handler as is: a sync iterable of promises hands the handler the promises themselves, not their values. A batch that has started is never interrupted: when the budget runs out, `ctx.signal` aborts with a `TimeoutError` reason (the same as `AbortSignal.timeout()`), so cooperative code such as `fetch(url, { signal })` can stop early.

- If fetching a batch overruns the budget, the handler still runs, but `ctx.signal` is already aborted. Check `signal.aborted` first if that matters.
- The abort timer is armed once, from `budget.remainingMs()` at the start of the run. With a custom budget that isn't based on the clock, the signal and the decision to stop can disagree.
- For budgets longer than about 24.8 days (the `setTimeout` limit), including `Infinity`, the signal never aborts. The budget check before each batch still applies.

The budget is checked before pulling the next item, so no item is ever pulled and then dropped. As a result, `mayHaveMore: true` means "there may be more work", not "there is more work": if the budget runs out just as the source is exhausted, the next run simply processes 0 batches and returns `mayHaveMore: false`.

### The source is not closed

`runBatches` never calls `iterator.return()`, whether it finishes, stops early or the handler throws. You own the source's cleanup. You can resume either by offset (`batchesProcessed + failures.length`) in a new invocation, or by passing the same iterator or generator to `runBatches` again. An array (or any iterable that creates a fresh iterator each time) starts again from the beginning, so resume it by offset instead:

```ts
const source = generateWork()
const first = await runBatches(source, handle, { budget })
if (first.mayHaveMore) await runBatches(source, handle, { budget: nextBudget })
```

## Errors

When a run fails, `runBatches` rejects with one of curfew's own errors. Each one names the part of your code that threw, keeps the original error in `cause`, and reports how far the run got (`batchesProcessed` and `failures`), so you can always resume from `batchesProcessed + failures.length`.

| Error | When |
|---|---|
| `BudgetExceededError` | The handler threw after the budget ran out (`ctx.signal` aborted). `index` is the interrupted batch. |
| `HandlerFailedError` | The handler threw with time left. `index` is the failed batch. |
| `SourceFailedError` | The source threw while fetching the next batch. |
| `ConfigError` | The budget or the estimator threw. |

All of them extend `CurfewError`. A non-iterable source still rejects with a plain `TypeError`.

- `BudgetExceededError` is decided by curfew's own signal, not by the error the handler throws, so an unrelated timeout from a downstream call (for example `fetch` with its own `AbortSignal.timeout()`) with time left is a `HandlerFailedError`. A genuine failure that happens after the budget ran out is a `BudgetExceededError` too; the original is in `cause`, and the next run surfaces it with time left.
- The interrupted or failed batch is not counted in `batchesProcessed` and is not in `failures`.
- Each error sets `name` (for example `'BudgetExceededError'`). If both the ESM and CommonJS copies of curfew get loaded, `instanceof` fails across them; check `error.name` instead.

### Keep going past failed batches

By default the first handler error ends the run. With `continueOnError: true`, a batch whose handler throws with time left is recorded in `failures` as `{ index, error }` (the original error) and the run continues:

```ts
const { batchesProcessed, failures } = await runBatches(source, handle, { budget, continueOnError: true })
for (const { index, error } of failures) console.error(`batch ${index} failed`, error)
```

`batchesProcessed` counts only successful batches. A budget abort still ends the run with a `BudgetExceededError` that carries the failures so far, and a failing source still ends it with a `SourceFailedError`.

## Budgets

```ts
import { DeadlineBudget, FixedBudget, LambdaBudget } from 'curfew'

new FixedBudget(13 * 60_000)              // 13 minutes from now
new DeadlineBudget(new Date('2026-12-01')) // until an absolute time (Date or epoch ms)
new LambdaBudget(context, 60_000)          // Lambda remaining time minus a 60 s margin
```

### Custom budget

Implement `TimeBudget`:

```ts
import type { TimeBudget } from 'curfew'

class JobBudget implements TimeBudget {
  constructor(private job: { expiresAt: number }) {}
  remainingMs() {
    return this.job.expiresAt - Date.now()
  }
}
```

## Estimators

By default, the estimate is the longest batch seen so far (`MaxEstimator`), so `runBatches` errs toward stopping early. Before any batch has run, the estimate is `0`, so the first batch runs as long as any time remains. Pass `new MaxEstimator(initialMs)` to require that much time for the first batch:

```ts
import { MaxEstimator, runBatches } from 'curfew'

await runBatches(source, handle, { budget, estimator: new MaxEstimator(30_000) })
```

### Custom estimator

Implement `Estimator`. `record` is called with each successful batch's duration (and each failed one's with `continueOnError: true`), and `estimateMs` is consulted before each batch:

```ts
import type { Estimator } from 'curfew'

class EwmaEstimator implements Estimator {
  private value = 0
  constructor(private alpha = 0.3) {}
  record(ms: number) {
    this.value = this.value === 0 ? ms : this.alpha * ms + (1 - this.alpha) * this.value
  }
  estimateMs() {
    return this.value
  }
}
```

## API

```ts
runBatches<T>(
  source: Iterable<T> | AsyncIterable<T>,
  handler: (batch: T, ctx: { signal: AbortSignal; index: number }) => Promise<void> | void,
  options: { budget: TimeBudget; estimator?: Estimator; continueOnError?: boolean },
): Promise<RunResult>

interface RunResult {
  batchesProcessed: number                     // successful batches
  failures: { index: number; error: unknown }[] // failed batches (continueOnError only)
  mayHaveMore: boolean
  reason: StopReason
}

enum StopReason {
  DONE = 'done',
  BUDGET_EXHAUSTED = 'budget-exhausted',
  ESTIMATE_EXCEEDS_BUDGET = 'estimate-exceeds-budget',
}

abstract class CurfewError extends Error {
  cause: unknown            // the original error
  batchesProcessed: number
  failures: { index: number; error: unknown }[]
}
class BudgetExceededError extends CurfewError { index: number }
class HandlerFailedError extends CurfewError { index: number }
class SourceFailedError extends CurfewError {}
class ConfigError extends CurfewError {}
```

## License

MIT
