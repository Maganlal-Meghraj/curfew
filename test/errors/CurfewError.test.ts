import { describe, expect, it } from 'vitest'
import { BudgetExceededError, ConfigError, CurfewError, HandlerFailedError, SourceFailedError } from '../../src'

const progress = { batchesProcessed: 2, failures: [] }

describe.each([
  ['BudgetExceededError', (cause: unknown) => new BudgetExceededError(cause, 2, progress)],
  ['HandlerFailedError', (cause: unknown) => new HandlerFailedError(cause, 2, progress)],
  ['SourceFailedError', (cause: unknown) => new SourceFailedError(cause, progress)],
  ['ConfigError', (cause: unknown) => new ConfigError(cause, progress)],
])('%s', (name, create) => {
  it('uses the original error message with a [curfew] prefix', () => {
    const cause = new TypeError('Cannot read properties of undefined (reading "id")')
    const error = create(cause)
    expect(error).toBeInstanceOf(CurfewError)
    expect(error.name).toBe(name)
    expect(error.message).toBe('[curfew] Cannot read properties of undefined (reading "id")')
    expect(String(error)).toBe(`${name}: [curfew] Cannot read properties of undefined (reading "id")`)
    expect(error.cause).toBe(cause)
    expect(error).toMatchObject({ batchesProcessed: 2, failures: [] })
  })

  it.each([
    ['a string', 'boom', '[curfew] boom'],
    ['a number', 42, '[curfew] 42'],
    ['undefined', undefined, '[curfew] undefined'],
  ])('stringifies a thrown value that is not an Error (%s)', (_, cause, message) => {
    expect(create(cause).message).toBe(message)
  })
})
