import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { abortAfter } from '../../src/utils/AbortAfter'

const MAX_TIMER_DELAY_MS = 2 ** 31 - 1

describe('abortAfter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('aborts the signal with a TimeoutError once the delay passes', () => {
    const { signal } = abortAfter(100)
    vi.advanceTimersByTime(99)
    expect(signal.aborted).toBe(false)
    vi.advanceTimersByTime(1)
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBeInstanceOf(DOMException)
    expect((signal.reason as DOMException).name).toBe('TimeoutError')
  })

  it.each([0, -50, NaN])('aborts on the next tick for a delay of %s', (ms) => {
    const { signal } = abortAfter(ms)
    expect(signal.aborted).toBe(false)
    vi.advanceTimersByTime(0)
    expect(signal.aborted).toBe(true)
  })

  it('cancel clears the timer so the signal never aborts', () => {
    const { signal, cancel } = abortAfter(100)
    cancel()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(200)
    expect(signal.aborted).toBe(false)
  })

  it('arms a timer for the largest delay setTimeout supports', () => {
    const { cancel } = abortAfter(MAX_TIMER_DELAY_MS)
    expect(vi.getTimerCount()).toBe(1)
    cancel()
  })

  it.each([MAX_TIMER_DELAY_MS + 1, Infinity])('never aborts and arms no timer for a delay of %s', (ms) => {
    const { signal, cancel } = abortAfter(ms)
    expect(vi.getTimerCount()).toBe(0)
    expect(signal.aborted).toBe(false)
    expect(() => cancel()).not.toThrow()
  })

  it('does not keep the process alive', () => {
    const unref = vi.fn()
    vi.spyOn(globalThis, 'setTimeout').mockReturnValue({ unref } as unknown as NodeJS.Timeout)
    abortAfter(100)
    expect(unref).toHaveBeenCalledTimes(1)
  })
})
