import type { RunProgress } from '../runner/RunProgress'
import { CurfewError } from './CurfewError'

export class SourceFailedError extends CurfewError {
  override readonly name = 'SourceFailedError'

  constructor(cause: unknown, progress: RunProgress) {
    super('Source failed while fetching the next batch', cause, progress)
  }
}
