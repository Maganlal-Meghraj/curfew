import type { BatchFailure } from '../runner/BatchFailure';
import type { RunProgress } from '../runner/RunProgress';

export abstract class CurfewError extends Error {
  readonly batchesProcessed: number;
  readonly failures: BatchFailure[];

  constructor(cause: unknown, { batchesProcessed, failures }: RunProgress) {
    super(`[curfew] ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.batchesProcessed = batchesProcessed;
    this.failures = failures;
  }
}
