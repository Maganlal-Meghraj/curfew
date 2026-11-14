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

An interrupted page runs again on the next invocation, so page processing must be idempotent.

## How it works

Before pulling each batch, `runBatches` checks the budget and stops with `mayHaveMore: true` if:

- the budget is used up (`StopReason.BUDGET_EXHAUSTED`), or
- the next batch probably won't fit in the time left (`StopReason.ESTIMATE_EXCEEDS_BUDGET`).

When the source runs out, it returns `mayHaveMore: false` with `StopReason.DONE`.

Batches run one at a time, and a batch that has started is never interrupted. When the budget runs out, `ctx.signal` aborts, so pass it to cooperative code such as `fetch(url, { signal })`. If the handler then throws, the run rejects with a `BudgetExceededError`.

To resume, start the next run at `batchesProcessed + failures.length`. Both the result and every curfew error carry these fields.

`mayHaveMore: true` means "there may be more work", not "there is more work": the next run may process 0 batches.

For timing, the abort signal, slow sources and resuming on the same iterator, see [How curfew behaves in detail](docs/details.md).

## Example

[`examples/basic.ts`](examples/basic.ts) processes 10 pages with a 1-second budget per run and resumes after each of the three ways a run can end:

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

## Errors

When a run fails, `runBatches` rejects with one of curfew's own errors:

| Error | When |
|---|---|
| `BudgetExceededError` | The handler threw after the budget ran out (`ctx.signal` aborted). `index` is the interrupted batch. |
| `HandlerFailedError` | The handler threw with time left. `index` is the failed batch. |
| `SourceFailedError` | The source threw while fetching the next batch. |
| `ConfigError` | The budget or the estimator threw. |

All of them extend `CurfewError`, keep the original error in `cause`, and report `batchesProcessed` and `failures` so you can resume. See [Errors in detail](docs/details.md#errors-in-detail).

### Keep going past failed batches

By default the first handler error ends the run. With `continueOnError: true`, a batch whose handler throws with time left is recorded in `failures` and the run continues:

```ts
const { batchesProcessed, failures } = await runBatches(source, handle, { budget, continueOnError: true })
for (const { index, error } of failures) console.error(`batch ${index} failed`, error)
```

Act on `failures`, don't only log it: a run where every batch failed still ends with `reason: 'done'`.

## Budgets

```ts
import { DeadlineBudget, FixedBudget, LambdaBudget } from 'curfew'

new FixedBudget(13 * 60_000)              // 13 minutes from now
new DeadlineBudget(new Date('2026-12-01')) // until an absolute time (Date or epoch ms)
new LambdaBudget(context, 60_000)          // Lambda remaining time minus a 60 s margin
```

For a custom budget, implement `TimeBudget`:

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

By default, the estimate is the longest batch seen so far (`MaxEstimator`), so curfew errs toward stopping early. The first batch runs as long as any time remains; pass `new MaxEstimator(initialMs)` to require more:

```ts
import { MaxEstimator, runBatches } from 'curfew'

await runBatches(source, handle, { budget, estimator: new MaxEstimator(30_000) })
```

For a custom estimator, implement `Estimator`. `record` gets each batch's duration and `estimateMs` is consulted before each batch:

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
