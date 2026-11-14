import type { RunProgress } from './RunProgress'
import type { StopReason } from './StopReason'

export interface RunResult extends RunProgress {
  mayHaveMore: boolean
  reason: StopReason
}
