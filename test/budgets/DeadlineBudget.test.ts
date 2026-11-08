import { afterEach, expect, it, vi } from 'vitest'
import { DeadlineBudget } from '../../src'

afterEach(() => {
  vi.useRealTimers()
})

it('DeadlineBudget accepts a Date or epoch ms', () => {
  vi.useFakeTimers({ now: 1000 })
  expect(new DeadlineBudget(1600).remainingMs()).toBe(600)
  expect(new DeadlineBudget(new Date(1600)).remainingMs()).toBe(600)
})
