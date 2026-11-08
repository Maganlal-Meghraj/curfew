import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Estimator, FixedBudget, MaxEstimator, type TimeBudget, runBatches } from '../../src'

const work = (ms: number) => () => {
  vi.advanceTimersByTime(ms)
}

describe('runBatches', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs every batch when the budget is ample', async () => {
    const seen: number[] = []
    const result = await runBatches([1, 2, 3], (b) => void seen.push(b), { budget: new FixedBudget(1000) })
    expect(seen).toEqual([1, 2, 3])
    expect(result).toEqual({ batchesProcessed: 3, stoppedEarly: false })
  })

  it('accepts a string source', async () => {
    const seen: string[] = []
    const result = await runBatches('ab', (c) => void seen.push(c), { budget: new FixedBudget(1000) })
    expect(seen).toEqual(['a', 'b'])
    expect(result).toEqual({ batchesProcessed: 2, stoppedEarly: false })
  })

  it('stops before a batch once the deadline has passed', async () => {
    const neverPredicts: Estimator = { record: () => {}, estimateMs: () => 0 }
    const result = await runBatches([1, 2, 3], work(60), { budget: new FixedBudget(100), estimator: neverPredicts })
    expect(result).toEqual({ batchesProcessed: 2, stoppedEarly: true })
  })

  it('skips a batch that the longest observed batch says will not fit', async () => {
    const result = await runBatches([1, 2, 3], work(40), { budget: new FixedBudget(100) })
    expect(result).toEqual({ batchesProcessed: 2, stoppedEarly: true })
  })

  it('MaxEstimator initialMs gates the first batch', async () => {
    const handler = vi.fn()
    const result = await runBatches([1], handler, {
      budget: new FixedBudget(100),
      estimator: new MaxEstimator(150),
    })
    expect(handler).not.toHaveBeenCalled()
    expect(result).toEqual({ batchesProcessed: 0, stoppedEarly: true })
  })

  it('times the fetch from the source together with the handler', async () => {
    async function* slowSource() {
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(20)
        yield i
      }
    }
    const estimator = new MaxEstimator()
    const result = await runBatches(slowSource(), work(25), { budget: new FixedBudget(100), estimator })
    expect(estimator.estimateMs()).toBe(45)
    expect(result).toEqual({ batchesProcessed: 2, stoppedEarly: true })
  })

  it('uses a custom estimator', async () => {
    const recorded: number[] = []
    const estimator: Estimator = {
      record: (ms) => void recorded.push(ms),
      estimateMs: () => (recorded.length >= 2 ? Infinity : 0),
    }
    const result = await runBatches([1, 2, 3], work(10), { budget: new FixedBudget(1000), estimator })
    expect(recorded).toEqual([10, 10])
    expect(result).toEqual({ batchesProcessed: 2, stoppedEarly: true })
  })

  it('aborts the signal mid-batch with a TimeoutError and lets the batch finish', async () => {
    let reason: unknown
    let finished = false
    const result = await runBatches(
      [1],
      async (_, { signal }) => {
        expect(signal.aborted).toBe(false)
        vi.advanceTimersByTime(150)
        expect(signal.aborted).toBe(true)
        reason = signal.reason
        await Promise.resolve()
        finished = true
      },
      { budget: new FixedBudget(100) },
    )
    expect((reason as DOMException).name).toBe('TimeoutError')
    expect(finished).toBe(true)
    expect(result).toEqual({ batchesProcessed: 1, stoppedEarly: true })
  })

  it('does not close the source on early stop, so a generator can be resumed', async () => {
    function* gen() {
      yield* [1, 2, 3, 4]
    }
    const source = gen()
    const returnSpy = vi.spyOn(source, 'return')
    const first = await runBatches(source, work(60), { budget: new FixedBudget(100) })
    expect(first).toEqual({ batchesProcessed: 1, stoppedEarly: true })
    expect(returnSpy).not.toHaveBeenCalled()

    const rest: number[] = []
    await runBatches(source, (b) => void rest.push(b), { budget: new FixedBudget(100) })
    expect(rest).toEqual([2, 3, 4])
  })

  it('propagates handler errors without closing the source and clears the timer', async () => {
    function* gen() {
      yield* [1, 2]
    }
    const source = gen()
    const returnSpy = vi.spyOn(source, 'return')
    const error = new Error('boom')
    await expect(
      runBatches(
        source,
        () => {
          throw error
        },
        { budget: new FixedBudget(1000) },
      ),
    ).rejects.toBe(error)
    expect(returnSpy).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('propagates a rejected async handler and clears the timer', async () => {
    const error = new Error('async boom')
    await expect(
      runBatches(
        [1, 2],
        async () => {
          throw error
        },
        { budget: new FixedBudget(1000) },
      ),
    ).rejects.toBe(error)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('propagates an error thrown by the source and clears the timer', async () => {
    const error = new Error('cursor failed')
    async function* failingSource() {
      yield 1
      throw error
    }
    const handler = vi.fn()
    await expect(runBatches(failingSource(), handler, { budget: new FixedBudget(1000) })).rejects.toBe(error)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('treats a NaN budget as exhausted', async () => {
    const handler = vi.fn()
    const result = await runBatches([1], handler, { budget: { remainingMs: () => NaN } })
    expect(handler).not.toHaveBeenCalled()
    expect(result).toEqual({ batchesProcessed: 0, stoppedEarly: true })
  })

  it('works with a custom TimeBudget', async () => {
    let calls = 0
    const budget: TimeBudget = { remainingMs: () => (calls++ < 2 ? 1000 : 0) }
    const result = await runBatches([1, 2, 3], () => {}, { budget })
    expect(result).toEqual({ batchesProcessed: 1, stoppedEarly: true })
  })
})
