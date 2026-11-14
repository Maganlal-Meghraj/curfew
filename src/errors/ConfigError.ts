import type { RunProgress } from '../runner/RunProgress'
import { CurfewError } from './CurfewError'

export class ConfigError extends CurfewError {
  override readonly name = 'ConfigError'

  constructor(cause: unknown, progress: RunProgress) {
    super(cause, progress)
  }
}
