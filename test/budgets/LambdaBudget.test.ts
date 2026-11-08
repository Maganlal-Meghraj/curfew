import { expect, it } from 'vitest'
import { LambdaBudget } from '../../src'

it('LambdaBudget subtracts the safety margin', () => {
  const budget = new LambdaBudget({ getRemainingTimeInMillis: () => 900_000 }, 120_000)
  expect(budget.remainingMs()).toBe(780_000)
})
