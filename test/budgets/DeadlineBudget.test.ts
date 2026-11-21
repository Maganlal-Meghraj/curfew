import { afterEach, expect, it, vi } from 'vitest';
import { DeadlineBudget } from '../../src';

afterEach(() => {
  vi.useRealTimers();
});

it('DeadlineBudget accepts a Date or epoch ms', () => {
  vi.useFakeTimers({ now: 1000 });
  expect(new DeadlineBudget(1600).remainingMs()).toBe(600);
  expect(new DeadlineBudget(new Date(1600)).remainingMs()).toBe(600);
});

it('DeadlineBudget allows past and infinite deadlines', () => {
  expect(new DeadlineBudget(new Date(0)).remainingMs()).toBeLessThan(0);
  expect(new DeadlineBudget(Infinity).remainingMs()).toBe(Infinity);
  expect(new DeadlineBudget(-Infinity).remainingMs()).toBe(-Infinity);
});

it.each([
  [new Date('nope'), RangeError, '[curfew] deadline must be a valid Date or epoch ms, got NaN'],
  [NaN, RangeError, '[curfew] deadline must be a valid Date or epoch ms, got NaN'],
  ['2026-12-01', TypeError, '[curfew] deadline must be a number, got "2026-12-01"'],
  [null, TypeError, '[curfew] deadline must be a number, got null'],
])('DeadlineBudget rejects %s', (deadline, ErrorType, message) => {
  expect(() => new DeadlineBudget(deadline as number)).toThrow(new ErrorType(message));
});
