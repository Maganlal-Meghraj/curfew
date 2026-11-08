import { MaxEstimator } from '../estimators/MaxEstimator'
import type { BatchContext, RunOptions, RunResult } from './Types'

export async function runBatches<T>(
  source: Iterable<T> | AsyncIterable<T>,
  handler: (batch: T, ctx: BatchContext) => Promise<void> | void,
  { budget, estimator = new MaxEstimator() }: RunOptions,
): Promise<RunResult> {
  const iterator =
    typeof (source as AsyncIterable<T>)[Symbol.asyncIterator] === 'function'
      ? (source as AsyncIterable<T>)[Symbol.asyncIterator]()
      : (source as Iterable<T>)[Symbol.iterator]()
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException('Budget exhausted', 'TimeoutError')),
    Math.max(0, budget.remainingMs()),
  )
  timer.unref()

  try {
    for (let index = 0; ; index++) {
      const remaining = budget.remainingMs()
      if (!(remaining > 0) || estimator.estimateMs() > remaining) {
        return { batchesProcessed: index, stoppedEarly: true }
      }
      const start = Date.now()
      const next = await iterator.next()
      if (next.done) return { batchesProcessed: index, stoppedEarly: false }
      await handler(next.value, { signal: controller.signal, index })
      estimator.record(Date.now() - start)
    }
  } finally {
    clearTimeout(timer)
  }
}
