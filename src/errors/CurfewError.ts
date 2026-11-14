import type { BatchFailure } from '../runner/BatchFailure'
import type { RunProgress } from '../runner/RunProgress'

export abstract class CurfewError extends Error {
  readonly batchesProcessed: number
  readonly failures: BatchFailure[]

  constructor(message: string, cause: unknown, { batchesProcessed, failures }: RunProgress) {
    super(message, { cause })
    this.batchesProcessed = batchesProcessed
    this.failures = failures
  }
}
