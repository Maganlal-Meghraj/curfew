import type { Estimator } from './Estimator'

export class MaxEstimator implements Estimator {
  private max: number

  constructor(initialMs = 0) {
    this.max = initialMs
  }

  record(ms: number): void {
    this.max = Math.max(this.max, ms)
  }

  estimateMs(): number {
    return this.max
  }
}
