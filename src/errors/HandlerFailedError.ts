import type { RunProgress } from '../runner/RunProgress';
import { CurfewError } from './CurfewError';

export class HandlerFailedError extends CurfewError {
  override readonly name = 'HandlerFailedError';
  readonly index: number;

  constructor(cause: unknown, index: number, progress: RunProgress) {
    super(cause, progress);
    this.index = index;
  }
}
