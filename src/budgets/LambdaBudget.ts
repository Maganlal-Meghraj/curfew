import { assertNumber, isFiniteNonNegative } from '../utils/AssertNumber';
import type { TimeBudget } from './TimeBudget';

export interface LambdaContextLike {
  getRemainingTimeInMillis(): number;
}

export class LambdaBudget implements TimeBudget {
  constructor(
    private readonly context: LambdaContextLike,
    private readonly safetyMarginMs: number,
  ) {
    assertNumber('safetyMarginMs', safetyMarginMs, isFiniteNonNegative, 'must be a finite number >= 0');
  }

  remainingMs(): number {
    return this.context.getRemainingTimeInMillis() - this.safetyMarginMs;
  }
}
