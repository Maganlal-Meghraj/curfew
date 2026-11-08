import type { TimeBudget } from '../budgets/TimeBudget'
import type { Estimator } from '../estimators/Estimator'

export interface RunOptions {
  budget: TimeBudget
  estimator?: Estimator
}

export interface RunResult {
  batchesProcessed: number
  stoppedEarly: boolean
}

export interface BatchContext {
  signal: AbortSignal
  index: number
}

export type BatchSource<T> = Iterable<T> | AsyncIterable<T>

export type BatchHandler<T> = (batch: T, ctx: BatchContext) => Promise<void> | void
