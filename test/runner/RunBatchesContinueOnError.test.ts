import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BudgetExceededError, type Estimator, FixedBudget, SourceFailedError, StopReason, runBatches } from '../../src'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('runBatches with continueOnError', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const failOn =
    (...failing: number[]) =>
    (b: number) => {
      if (failing.includes(b)) throw new Error(`batch ${b} failed`)
    }

  it('records failed batches and keeps going', async () => {
    const result = await runBatches([1, 2, 3, 4], failOn(2, 4), { budget: new FixedBudget(1000), continueOnError: true })
    expect(result).toEqual({
      batchesProcessed: 2,
      failures: [
        { index: 1, error: new Error('batch 2 failed') },
        { index: 3, error: new Error('batch 4 failed') },
      ],
      mayHaveMore: false,
      reason: StopReason.DONE,
    })
  })

  it('keeps the original error instance in failures', async () => {
    const error = new Error('boom')
    const result = await runBatches(
      [1],
      () => {
        throw error
      },
      { budget: new FixedBudget(1000), continueOnError: true },
    )
    expect(result.failures[0]?.error).toBe(error)
  })

  it('passes a 0-based index across successes and failures', async () => {
    const indexes: number[] = []
    await runBatches(
      [1, 2, 3],
      (b, { index }) => {
        indexes.push(index)
        failOn(1, 2)(b)
      },
      { budget: new FixedBudget(1000), continueOnError: true },
    )
    expect(indexes).toEqual([0, 1, 2])
  })

  it('records the duration of a failed batch', async () => {
    const recorded: number[] = []
    const estimator: Estimator = { record: (ms) => void recorded.push(ms), estimateMs: () => 0 }
    await runBatches(
      [1],
      () => {
        vi.advanceTimersByTime(30)
        throw new Error('slow failure')
      },
      { budget: new FixedBudget(1000), estimator, continueOnError: true },
    )
    expect(recorded).toEqual([30])
  })

  it('rejects with a BudgetExceededError carrying earlier failures when the budget aborts a batch', async () => {
    const handler = async (b: number, { signal }: { signal: AbortSignal }) => {
      if (b === 1) throw new Error('bad data')
      if (b === 2) return
      await sleep(200)
      signal.throwIfAborted()
    }
    const run = runBatches([1, 2, 3, 4], handler, { budget: new FixedBudget(100), continueOnError: true }).catch(
      (e: unknown) => e,
    )
    await vi.advanceTimersByTimeAsync(200)
    const rejection = await run
    expect(rejection).toBeInstanceOf(BudgetExceededError)
    expect(rejection).toMatchObject({
      index: 2,
      batchesProcessed: 1,
      failures: [{ index: 0, error: new Error('bad data') }],
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('wraps a source error in a SourceFailedError carrying earlier failures', async () => {
    async function* failingSource() {
      yield 1
      yield 2
      throw new Error('cursor failed')
    }
    const rejection = await runBatches(failingSource(), failOn(1), {
      budget: new FixedBudget(1000),
      continueOnError: true,
    }).catch((e: unknown) => e)
    expect(rejection).toBeInstanceOf(SourceFailedError)
    expect(rejection).toMatchObject({
      cause: new Error('cursor failed'),
      batchesProcessed: 1,
      failures: [{ index: 0, error: new Error('batch 1 failed') }],
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('still stops before a batch that will not fit', async () => {
    const result = await runBatches(
      [1, 2, 3],
      (b) => {
        vi.advanceTimersByTime(40)
        failOn(1)(b)
      },
      { budget: new FixedBudget(100), continueOnError: true },
    )
    expect(result).toEqual({
      batchesProcessed: 1,
      failures: [{ index: 0, error: new Error('batch 1 failed') }],
      mayHaveMore: true,
      reason: StopReason.ESTIMATE_EXCEEDS_BUDGET,
    })
  })
})
