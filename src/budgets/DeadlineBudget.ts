import { assertNumber, isNotNaN } from '../utils/AssertNumber';
import type { TimeBudget } from './TimeBudget';

export class DeadlineBudget implements TimeBudget {
  private readonly deadline: number;

  constructor(deadline: Date | number) {
    const time = deadline instanceof Date ? deadline.getTime() : deadline;
    assertNumber('deadline', time, isNotNaN, 'must be a valid Date or epoch ms');
    this.deadline = time;
  }

  remainingMs(): number {
    return this.deadline - Date.now();
  }
}
