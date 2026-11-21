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

it('FixedBudget allows negative and infinite durations', () => {
  expect(new FixedBudget(-1).remainingMs()).toBeLessThan(0);
  expect(new FixedBudget(Infinity).remainingMs()).toBe(Infinity);
  expect(new FixedBudget(-Infinity).remainingMs()).toBe(-Infinity);
});

it.each([
  [NaN, RangeError, '[curfew] durationMs must not be NaN, got NaN'],
  ['60000', TypeError, '[curfew] durationMs must be a number, got "60000"'],
  [undefined, TypeError, '[curfew] durationMs must be a number, got undefined'],
])('FixedBudget rejects %s', (durationMs, ErrorType, message) => {
  expect(() => new FixedBudget(durationMs as number)).toThrow(new ErrorType(message));
});
