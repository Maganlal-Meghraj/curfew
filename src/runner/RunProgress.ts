import type { BatchFailure } from './BatchFailure';

export interface RunProgress {
  batchesProcessed: number;
  failures: BatchFailure[];
}
