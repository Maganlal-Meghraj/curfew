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
