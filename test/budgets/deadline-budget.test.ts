import { expect, it } from 'vitest'
import { DeadlineBudget } from '../../src'

it('DeadlineBudget accepts a Date or epoch ms', () => {
  const now = () => 1000
  expect(new DeadlineBudget(1600, now).remainingMs()).toBe(600)
  expect(new DeadlineBudget(new Date(1600), now).remainingMs()).toBe(600)
})
