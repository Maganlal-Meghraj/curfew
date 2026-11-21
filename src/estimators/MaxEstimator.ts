import { assertNumber, isFiniteNonNegative } from '../utils/AssertNumber';
import type { Estimator } from './Estimator';

export class MaxEstimator implements Estimator {
  private max: number;

  constructor(initialMs = 0) {
    assertNumber('initialMs', initialMs, isFiniteNonNegative, 'must be a finite number >= 0');
    this.max = initialMs;
  }

  record(ms: number): void {
    this.max = Math.max(this.max, ms);
  }

  estimateMs(): number {
    return this.max;
  }
}
