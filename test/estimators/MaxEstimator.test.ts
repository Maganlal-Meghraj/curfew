import { expect, it } from 'vitest';
import { MaxEstimator } from '../../src';

it('MaxEstimator returns the largest recorded duration, starting from initialMs', () => {
  const estimator = new MaxEstimator(50);
  expect(estimator.estimateMs()).toBe(50);
  estimator.record(30);
  expect(estimator.estimateMs()).toBe(50);
  estimator.record(80);
  estimator.record(10);
  expect(estimator.estimateMs()).toBe(80);
});

it('MaxEstimator starts from 0 by default', () => {
  expect(new MaxEstimator().estimateMs()).toBe(0);
});

it.each([
  [NaN, RangeError, '[curfew] initialMs must be a finite number >= 0, got NaN'],
  [Infinity, RangeError, '[curfew] initialMs must be a finite number >= 0, got Infinity'],
  [-1, RangeError, '[curfew] initialMs must be a finite number >= 0, got -1'],
  ['100', TypeError, '[curfew] initialMs must be a number, got "100"'],
])('MaxEstimator rejects an initialMs of %s', (initialMs, ErrorType, message) => {
  expect(() => new MaxEstimator(initialMs as number)).toThrow(new ErrorType(message));
});
