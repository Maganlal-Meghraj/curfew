import { expect, it } from 'vitest'
import { FixedBudget } from '../../src'

it('FixedBudget counts down from construction', () => {
  let t = 1000
  const budget = new FixedBudget(500, () => t)
  expect(budget.remainingMs()).toBe(500)
  t = 1300
  expect(budget.remainingMs()).toBe(200)
})
