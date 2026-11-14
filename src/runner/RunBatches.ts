import type { TimeBudget } from '../budgets/TimeBudget'
import { BudgetExceededError } from '../errors/BudgetExceededError'
import { ConfigError } from '../errors/ConfigError'
import { HandlerFailedError } from '../errors/HandlerFailedError'
import { SourceFailedError } from '../errors/SourceFailedError'
import type { Estimator } from '../estimators/Estimator'
import { MaxEstimator } from '../estimators/MaxEstimator'
import type { BatchContext } from './BatchContext'
import type { BatchHandler } from './BatchHandler'
import type { BatchSource } from './BatchSource'
import type { RunOptions } from './RunOptions'
import type { RunProgress } from './RunProgress'
import type { RunResult } from './RunResult'
import { StopReason } from './StopReason'

const MAX_TIMER_DELAY_MS = 2 ** 31 - 1

export async function runBatches<T>(
  source: BatchSource<T>,
  handler: BatchHandler<T>,
  { budget, estimator = new MaxEstimator(), continueOnError = false }: RunOptions,
): Promise<RunResult> {
  const batches = getIterator(source)
  const progress: RunProgress = { batchesProcessed: 0, failures: [] }
  const deadline = asConfigError(progress, () => abortWhenBudgetRunsOut(budget))

  try {
    for (let index = 0; ; index++) {
      const reason = asConfigError(progress, () => reasonToStopBeforeNextBatch(budget, estimator))
      if (reason) return { ...progress, mayHaveMore: true, reason }

      const startedAt = performance.now()

      const next = await fetchNext(batches, progress)
      if (next.done) return { ...progress, mayHaveMore: false, reason: StopReason.DONE }

      await runHandler(handler, next.value, { signal: deadline.signal, index }, continueOnError, progress)

      asConfigError(progress, () => estimator.record(performance.now() - startedAt))
    }
  } finally {
    deadline.cancel()
  }
}

async function fetchNext<T>(batches: Iterator<T> | AsyncIterator<T>, progress: RunProgress): Promise<IteratorResult<T>> {
  try {
    return await batches.next()
  } catch (error) {
    throw new SourceFailedError(error, { ...progress })
  }
}

async function runHandler<T>(
  handler: BatchHandler<T>,
  batch: T,
  ctx: BatchContext,
  continueOnError: boolean,
  progress: RunProgress,
): Promise<void> {
  try {
    await handler(batch, ctx)
    progress.batchesProcessed++
  } catch (error) {
    if (ctx.signal.aborted) throw new BudgetExceededError(error, ctx.index, { ...progress })
    if (!continueOnError) throw new HandlerFailedError(error, ctx.index, { ...progress })
    progress.failures.push({ index: ctx.index, error })
  }
}

function asConfigError<R>(progress: RunProgress, call: () => R): R {
  try {
    return call()
  } catch (error) {
    throw new ConfigError(error, { ...progress })
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
