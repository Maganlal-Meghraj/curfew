import type { TimeBudget } from '../budgets/TimeBudget'
import type { Estimator } from '../estimators/Estimator'
import { MaxEstimator } from '../estimators/MaxEstimator'
import type { BatchHandler } from './BatchHandler'
import type { BatchSource } from './BatchSource'
import type { RunOptions } from './RunOptions'
import type { RunResult } from './RunResult'
import { StopReason } from './StopReason'

const MAX_TIMER_DELAY_MS = 2 ** 31 - 1

export async function runBatches<T>(
  source: BatchSource<T>,
  handler: BatchHandler<T>,
  { budget, estimator = new MaxEstimator() }: RunOptions,
): Promise<RunResult> {
  const batches = getIterator(source)
  const deadline = abortWhenBudgetRunsOut(budget)
  let batchesProcessed = 0

  try {
    while (true) {
      const reason = reasonToStopBeforeNextBatch(budget, estimator)
      if (reason) return { batchesProcessed, mayHaveMore: true, reason }

      const startedAt = performance.now()

      const next = await batches.next()
      if (next.done) return { batchesProcessed, mayHaveMore: false, reason: StopReason.DONE }

      await handler(next.value, { signal: deadline.signal, index: batchesProcessed })

      estimator.record(performance.now() - startedAt)
      batchesProcessed++
    }
  } finally {
    deadline.cancel()
  }
}

function reasonToStopBeforeNextBatch(budget: TimeBudget, estimator: Estimator): Exclude<StopReason, StopReason.DONE> | null {
  const remainingMs = budget.remainingMs()
  if (!(remainingMs > 0)) return StopReason.BUDGET_EXHAUSTED
  if (!(estimator.estimateMs() <= remainingMs)) return StopReason.ESTIMATE_EXCEEDS_BUDGET
  return null
}

function abortWhenBudgetRunsOut(budget: TimeBudget) {
  const controller = new AbortController()
  const remainingMs = budget.remainingMs()
  const delayMs = remainingMs > 0 ? remainingMs : 0

  if (delayMs > MAX_TIMER_DELAY_MS) {
    return { signal: controller.signal, cancel: () => {} }
  }

  const timer = setTimeout(() => controller.abort(new DOMException('Budget exhausted', 'TimeoutError')), delayMs)
  timer.unref()
  return { signal: controller.signal, cancel: () => clearTimeout(timer) }
}

function getIterator<T>(source: BatchSource<T>): Iterator<T> | AsyncIterator<T> {
  return isAsyncIterable(source) ? source[Symbol.asyncIterator]() : source[Symbol.iterator]()
}

function isAsyncIterable<T>(source: BatchSource<T>): source is AsyncIterable<T> {
  return typeof (source as AsyncIterable<T>)[Symbol.asyncIterator] === 'function'
}
