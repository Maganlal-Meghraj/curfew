import { expect, it } from 'vitest';
import { LambdaBudget } from '../../src';

it('LambdaBudget subtracts the safety margin', () => {
  const budget = new LambdaBudget({ getRemainingTimeInMillis: () => 900_000 }, 120_000);
  expect(budget.remainingMs()).toBe(780_000);
});

it('LambdaBudget allows a margin larger than the remaining time', () => {
  const budget = new LambdaBudget({ getRemainingTimeInMillis: () => 30_000 }, 60_000);
  expect(budget.remainingMs()).toBe(-30_000);
});

it.each([
  [NaN, RangeError, '[curfew] safetyMarginMs must be a finite number >= 0, got NaN'],
  [Infinity, RangeError, '[curfew] safetyMarginMs must be a finite number >= 0, got Infinity'],
  [-1, RangeError, '[curfew] safetyMarginMs must be a finite number >= 0, got -1'],
  [undefined, TypeError, '[curfew] safetyMarginMs must be a number, got undefined'],
  ['60000', TypeError, '[curfew] safetyMarginMs must be a number, got "60000"'],
])('LambdaBudget rejects a safetyMarginMs of %s', (safetyMarginMs, ErrorType, message) => {
  const context = { getRemainingTimeInMillis: () => 900_000 };
  expect(() => new LambdaBudget(context, safetyMarginMs as number)).toThrow(new ErrorType(message));
});
