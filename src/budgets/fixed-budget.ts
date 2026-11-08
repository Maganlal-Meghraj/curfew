import { DeadlineBudget } from './deadline-budget'

export class FixedBudget extends DeadlineBudget {
  constructor(durationMs: number, now: () => number = Date.now) {
    super(now() + durationMs, now)
  }
}
