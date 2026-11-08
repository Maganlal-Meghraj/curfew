import { DeadlineBudget } from './DeadlineBudget'

export class FixedBudget extends DeadlineBudget {
  constructor(durationMs: number) {
    super(Date.now() + durationMs)
  }
}
