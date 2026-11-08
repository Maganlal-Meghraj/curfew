import type { TimeBudget } from '../budgets/time-budget'
import type { Estimator } from '../estimators/estimator'

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
