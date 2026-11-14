import type { RunProgress } from '../runner/RunProgress';
import { CurfewError } from './CurfewError';

export class BudgetExceededError extends CurfewError {
  override readonly name = 'BudgetExceededError';
  readonly index: number;

  constructor(cause: unknown, index: number, progress: RunProgress) {
    super(cause, progress);
    this.index = index;
  }
}
