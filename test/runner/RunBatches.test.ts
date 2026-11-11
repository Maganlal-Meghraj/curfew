import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DeadlineBudget,
  type Estimator,
  FixedBudget,
  LambdaBudget,
  MaxEstimator,
  StopReason,
  type TimeBudget,
  runBatches,
} from '../../src'

const DAY = 24 * 60 * 60_000

const work = (ms: number) => () => {
  vi.advanceTimersByTime(ms)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('runBatches', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('runs every batch when the budget is ample', async () => {
    const seen: number[] = []
    const result = await runBatches([1, 2, 3], (b) => void seen.push(b), { budget: new FixedBudget(1000) })
    expect(seen).toEqual([1, 2, 3])
    expect(result).toEqual({ batchesProcessed: 3, mayHaveMore: false, reason: StopReason.DONE })
  })

  it('accepts a string source', async () => {
    const seen: string[] = []
    const result = await runBatches('ab', (c) => void seen.push(c), { budget: new FixedBudget(1000) })
    expect(seen).toEqual(['a', 'b'])
    expect(result).toEqual({ batchesProcessed: 2, mayHaveMore: false, reason: StopReason.DONE })
  })

  it('stops before a batch once the deadline has passed', async () => {
    const neverPredicts: Estimator = { record: () => {}, estimateMs: () => 0 }
    const result = await runBatches([1, 2, 3], work(60), { budget: new FixedBudget(100), estimator: neverPredicts })
    expect(result).toEqual({ batchesProcessed: 2, mayHaveMore: true, reason: StopReason.BUDGET_EXHAUSTED })
  })

  it('skips a batch that the longest observed batch says will not fit', async () => {
    const result = await runBatches([1, 2, 3], work(40), { budget: new FixedBudget(100) })
    expect(result).toEqual({ batchesProcessed: 2, mayHaveMore: true, reason: StopReason.ESTIMATE_EXCEEDS_BUDGET })
  })

  it('MaxEstimator initialMs gates the first batch', async () => {
    const handler = vi.fn()
    const result = await runBatches([1], handler, {
      budget: new FixedBudget(100),
      estimator: new MaxEstimator(150),
    })
    expect(handler).not.toHaveBeenCalled()
    expect(result).toEqual({ batchesProcessed: 0, mayHaveMore: true, reason: StopReason.ESTIMATE_EXCEEDS_BUDGET })
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
    expect(result).toEqual({ batchesProcessed: 2, mayHaveMore: true, reason: StopReason.ESTIMATE_EXCEEDS_BUDGET })
  })

  it('uses a custom estimator', async () => {
    const recorded: number[] = []
    const estimator: Estimator = {
      record: (ms) => void recorded.push(ms),
      estimateMs: () => (recorded.length >= 2 ? Infinity : 0),
    }
    const result = await runBatches([1, 2, 3], work(10), { budget: new FixedBudget(1000), estimator })
    expect(recorded).toEqual([10, 10])
    expect(result).toEqual({ batchesProcessed: 2, mayHaveMore: true, reason: StopReason.ESTIMATE_EXCEEDS_BUDGET })
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
    expect(result).toEqual({ batchesProcessed: 1, mayHaveMore: true, reason: StopReason.BUDGET_EXHAUSTED })
  })

  it('passes the TimeoutError thrown by signal.throwIfAborted() through to the caller', async () => {
    const error = await runBatches(
      [1],
      (_, { signal }) => {
        vi.advanceTimersByTime(150)
        signal.throwIfAborted()
      },
      { budget: new FixedBudget(100) },
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DOMException)
    expect((error as DOMException).name).toBe('TimeoutError')
  })

  it('does not close the source on early stop, so a generator can be resumed', async () => {
    function* gen() {
      yield* [1, 2, 3, 4]
    }
    const source = gen()
    const returnSpy = vi.spyOn(source, 'return')
    const first = await runBatches(source, work(60), { budget: new FixedBudget(100) })
    expect(first).toEqual({ batchesProcessed: 1, mayHaveMore: true, reason: StopReason.ESTIMATE_EXCEEDS_BUDGET })
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
    expect(result).toEqual({ batchesProcessed: 0, mayHaveMore: true, reason: StopReason.BUDGET_EXHAUSTED })
  })

  it('works with a custom TimeBudget', async () => {
    let calls = 0
    const budget: TimeBudget = { remainingMs: () => (calls++ < 2 ? 1000 : 0) }
    const result = await runBatches([1, 2, 3], () => {}, { budget })
    expect(result).toEqual({ batchesProcessed: 1, mayHaveMore: true, reason: StopReason.BUDGET_EXHAUSTED })
  })

  it('passes a 0-based index and the same, non-aborted signal to every batch', async () => {
    const calls: { index: number; signal: AbortSignal; aborted: boolean }[] = []
    await runBatches(['a', 'b', 'c'], (_, { index, signal }) => void calls.push({ index, signal, aborted: signal.aborted }), {
      budget: new FixedBudget(1000),
    })
    expect(calls.map((c) => c.index)).toEqual([0, 1, 2])
    expect(new Set(calls.map((c) => c.signal)).size).toBe(1)
    expect(calls.every((c) => !c.aborted)).toBe(true)
  })

  it('clears the abort timer on normal completion and on early stop', async () => {
    await runBatches([1, 2], () => {}, { budget: new FixedBudget(1000) })
    expect(vi.getTimerCount()).toBe(0)
    await runBatches([1, 2, 3], work(60), { budget: new FixedBudget(100) })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('runs a batch whose estimate exactly equals the remaining time', async () => {
    const handler = vi.fn()
    const result = await runBatches([1], handler, { budget: new FixedBudget(100), estimator: new MaxEstimator(100) })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ batchesProcessed: 1, mayHaveMore: false, reason: StopReason.DONE })
  })

  it('handles an empty source', async () => {
    const result = await runBatches([], () => {}, { budget: new FixedBudget(100) })
    expect(result).toEqual({ batchesProcessed: 0, mayHaveMore: false, reason: StopReason.DONE })
  })

  it.each([
    ['exhausted Lambda (margin > remaining)', () => new LambdaBudget({ getRemainingTimeInMillis: () => 30_000 }, 60_000)],
    ['negative FixedBudget', () => new FixedBudget(-1)],
    ['past DeadlineBudget', () => new DeadlineBudget(new Date(0))],
    ['invalid Date deadline', () => new DeadlineBudget(new Date('nope'))],
  ])('runs nothing with an %s', async (_, makeBudget) => {
    const handler = vi.fn()
    const result = await runBatches([1], handler, { budget: makeBudget() })
    expect(result).toEqual({ batchesProcessed: 0, mayHaveMore: true, reason: StopReason.BUDGET_EXHAUSTED })
    expect(handler).not.toHaveBeenCalled()
  })

  it('stops safely when the estimator returns NaN', async () => {
    const estimator: Estimator = { record: () => {}, estimateMs: () => NaN }
    const handler = vi.fn()
    const result = await runBatches([1], handler, { budget: new FixedBudget(100), estimator })
    expect(result).toEqual({ batchesProcessed: 0, mayHaveMore: true, reason: StopReason.ESTIMATE_EXCEEDS_BUDGET })
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not record a duration for a failed batch', async () => {
    const record = vi.fn()
    const failing = () => {
      throw new Error('x')
    }
    await expect(
      runBatches([1], failing, { budget: new FixedBudget(100), estimator: { record, estimateMs: () => 0 } }),
    ).rejects.toThrow('x')
    expect(record).not.toHaveBeenCalled()
  })

  it('rejects without leaking a timer when the budget throws mid-run', async () => {
    let calls = 0
    const budget: TimeBudget = {
      remainingMs: () => {
        if (calls++ > 1) throw new Error('budget down')
        return 1000
      },
    }
    await expect(runBatches([1, 2], () => {}, { budget })).rejects.toThrow('budget down')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects with a TypeError for a non-iterable source', async () => {
    // @ts-expect-error deliberately invalid input
    await expect(runBatches(42, () => {}, { budget: new FixedBudget(100) })).rejects.toBeInstanceOf(TypeError)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('fires the abort event while an async handler is awaiting', async () => {
    const onAbort = vi.fn()
    const handler = async (_: number, { signal }: { signal: AbortSignal }) => {
      signal.addEventListener('abort', onAbort)
      await sleep(500)
    }
    const run = runBatches([1], handler, { budget: new FixedBudget(100) })
    await vi.advanceTimersByTimeAsync(99)
    expect(onAbort).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onAbort).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(400)
    expect(await run).toEqual({ batchesProcessed: 1, mayHaveMore: true, reason: StopReason.BUDGET_EXHAUSTED })
  })

  it('rejects with the handler error, not the abort reason, when a handler throws after abort', async () => {
    const handler = async (_: number, { signal }: { signal: AbortSignal }) => {
      await sleep(200)
      if (signal.aborted) throw new Error('gave up')
    }
    const run = runBatches([1], handler, { budget: new FixedBudget(100) })
    const assertion = expect(run).rejects.toThrow('gave up')
    await vi.advanceTimersByTimeAsync(200)
    await assertion
  })

  it('reports mayHaveMore and budget-exhausted when the budget runs out as the source ends, and the next run is a no-op', async () => {
    const iterator = [1, 2][Symbol.iterator]()
    const source = { [Symbol.iterator]: () => iterator }
    const first = await runBatches(source, work(50), { budget: new FixedBudget(100) })
    expect(first).toEqual({ batchesProcessed: 2, mayHaveMore: true, reason: StopReason.BUDGET_EXHAUSTED })
    const second = await runBatches(source, () => {}, { budget: new FixedBudget(100) })
    expect(second).toEqual({ batchesProcessed: 0, mayHaveMore: false, reason: StopReason.DONE })
  })

  it('restarts an array source from the beginning when passed again', async () => {
    const source = [1, 2, 3]
    await runBatches(source, work(60), { budget: new FixedBudget(100) })
    const seen: number[] = []
    await runBatches(source, (b) => void seen.push(b), { budget: new FixedBudget(1000) })
    expect(seen).toEqual([1, 2, 3])
  })

  it('hands promises from a sync iterable to the handler unresolved', async () => {
    const seen: unknown[] = []
    await runBatches([Promise.resolve(1)], (b) => void seen.push(b), { budget: new FixedBudget(100) })
    expect(seen[0]).toBeInstanceOf(Promise)
  })

  it('runs the handler with an already-aborted signal when a slow fetch overruns the budget', async () => {
    async function* slowSource() {
      await sleep(200)
      yield 1
    }
    let abortedAtStart: boolean | undefined
    const run = runBatches(slowSource(), (_, { signal }) => void (abortedAtStart = signal.aborted), {
      budget: new FixedBudget(100),
    })
    await vi.advanceTimersByTimeAsync(200)
    expect(await run).toEqual({ batchesProcessed: 1, mayHaveMore: true, reason: StopReason.BUDGET_EXHAUSTED })
    expect(abortedAtStart).toBe(true)
  })

  it('records non-negative durations when the wall clock steps backwards mid-batch', async () => {
    const recorded: number[] = []
    const estimator: Estimator = { record: (ms) => void recorded.push(ms), estimateMs: () => 0 }
    const now = Date.now()
    await runBatches([1], () => void vi.spyOn(Date, 'now').mockReturnValue(now - 60_000), {
      budget: { remainingMs: () => 1000 },
      estimator,
    })
    expect(recorded[0]).toBeGreaterThanOrEqual(0)
  })

  it('does not inflate the estimate when the wall clock steps forward mid-batch', async () => {
    const now = Date.now()
    const result = await runBatches(
      [1, 2],
      (b) => {
        if (b === 1) vi.spyOn(Date, 'now').mockReturnValue(now + 10 * 60_000)
      },
      { budget: new LambdaBudget({ getRemainingTimeInMillis: () => 5 * 60_000 }, 0) },
    )
    expect(result).toEqual({ batchesProcessed: 2, mayHaveMore: false, reason: StopReason.DONE })
  })
})

describe('runBatches with very long budgets (real timers)', () => {
  it.each([
    ['DeadlineBudget 30 days out', () => new DeadlineBudget(Date.now() + 30 * DAY)],
    ['FixedBudget of 25 days', () => new FixedBudget(25 * DAY)],
    ['Infinity custom budget', () => ({ remainingMs: () => Infinity })],
  ])('does not abort the signal early for a %s', async (_, makeBudget) => {
    let aborted: boolean | undefined
    const handler = async (_: number, { signal }: { signal: AbortSignal }) => {
      await sleep(20)
      aborted = signal.aborted
    }
    await runBatches([1], handler, { budget: makeBudget() })
    expect(aborted).toBe(false)
  })
})
