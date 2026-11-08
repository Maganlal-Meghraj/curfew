import type { TimeBudget } from './TimeBudget'

export interface LambdaContextLike {
  getRemainingTimeInMillis(): number
}

export class LambdaBudget implements TimeBudget {
  constructor(
    private readonly context: LambdaContextLike,
    private readonly safetyMarginMs: number,
  ) {}

  remainingMs(): number {
    return this.context.getRemainingTimeInMillis() - this.safetyMarginMs
  }
}
