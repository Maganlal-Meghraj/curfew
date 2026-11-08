import type { StopReason } from './StopReason'

export interface RunResult {
  batchesProcessed: number
  mayHaveMore: boolean
  reason: StopReason
}
