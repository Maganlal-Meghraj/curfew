import type { RunProgress } from '../runner/RunProgress'
import { CurfewError } from './CurfewError'

export class BudgetExceededError extends CurfewError {
  override readonly name = 'BudgetExceededError'
  readonly index: number

  constructor(cause: unknown, index: number, progress: RunProgress) {
    super(`Budget ran out while batch ${index} was running`, cause, progress)
    this.index = index
  }
}
