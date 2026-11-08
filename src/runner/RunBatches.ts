import type { TimeBudget } from '../budgets/TimeBudget'
import type { Estimator } from '../estimators/Estimator'
import { MaxEstimator } from '../estimators/MaxEstimator'
import type { BatchHandler, BatchSource, RunOptions, RunResult } from './Types'

export async function runBatches<T>(
  source: BatchSource<T>,
  handler: BatchHandler<T>,
  { budget, estimator = new MaxEstimator() }: RunOptions,
): Promise<RunResult> {
  const batches = getIterator(source)
  const deadline = abortWhenBudgetRunsOut(budget)
  let batchesProcessed = 0

  try {
    while (hasTimeForNextBatch(budget, estimator)) {
      const startedAt = Date.now()

      const next = await batches.next()
      if (next.done) return { batchesProcessed, stoppedEarly: false }

      await handler(next.value, { signal: deadline.signal, index: batchesProcessed })

      estimator.record(Date.now() - startedAt)
      batchesProcessed++
    }
    return { batchesProcessed, stoppedEarly: true }
  } finally {
    deadline.cancel()
  }
}

function hasTimeForNextBatch(budget: TimeBudget, estimator: Estimator): boolean {
  const remainingMs = budget.remainingMs()
  return remainingMs > 0 && estimator.estimateMs() <= remainingMs
}

function abortWhenBudgetRunsOut(budget: TimeBudget) {
  const controller = new AbortController()
  const remainingMs = budget.remainingMs()
  const timer = setTimeout(
    () => controller.abort(new DOMException('Budget exhausted', 'TimeoutError')),
    remainingMs > 0 ? remainingMs : 0,
  )
  timer.unref()
  return { signal: controller.signal, cancel: () => clearTimeout(timer) }
}

function getIterator<T>(source: BatchSource<T>): Iterator<T> | AsyncIterator<T> {
  return isAsyncIterable(source) ? source[Symbol.asyncIterator]() : source[Symbol.iterator]()
}

function isAsyncIterable<T>(source: BatchSource<T>): source is AsyncIterable<T> {
  return typeof (source as AsyncIterable<T>)[Symbol.asyncIterator] === 'function'
}
