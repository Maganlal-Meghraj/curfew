import type { TimeBudget } from './TimeBudget'

export class DeadlineBudget implements TimeBudget {
  private readonly deadline: number

  constructor(
    deadline: Date | number,
    private readonly now: () => number = Date.now,
  ) {
    this.deadline = deadline instanceof Date ? deadline.getTime() : deadline
  }

  remainingMs(): number {
    return this.deadline - this.now()
  }
}
