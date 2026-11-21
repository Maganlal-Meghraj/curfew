import { assertNumber, isNotNaN } from '../utils/AssertNumber';
import { DeadlineBudget } from './DeadlineBudget';

export class FixedBudget extends DeadlineBudget {
  constructor(durationMs: number) {
    assertNumber('durationMs', durationMs, isNotNaN, 'must not be NaN');
    super(Date.now() + durationMs);
  }
}
