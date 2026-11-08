import type { TimeBudget } from '../budgets/TimeBudget'
import type { Estimator } from '../estimators/Estimator'

export interface RunOptions {
  budget: TimeBudget
  estimator?: Estimator
}
