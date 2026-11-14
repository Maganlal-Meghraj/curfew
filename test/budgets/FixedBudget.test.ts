import { afterEach, expect, it, vi } from 'vitest';
import { FixedBudget } from '../../src';

afterEach(() => {
  vi.useRealTimers();
});

it('FixedBudget counts down from construction', () => {
  vi.useFakeTimers({ now: 1000 });
  const budget = new FixedBudget(500);
  expect(budget.remainingMs()).toBe(500);
  vi.setSystemTime(1300);
  expect(budget.remainingMs()).toBe(200);
});
