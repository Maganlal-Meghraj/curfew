import type { TimeBudget } from '../budgets/TimeBudget';
import { BudgetExceededError } from '../errors/BudgetExceededError';
import { ConfigError } from '../errors/ConfigError';
import { HandlerFailedError } from '../errors/HandlerFailedError';
import { SourceFailedError } from '../errors/SourceFailedError';
import type { Estimator } from '../estimators/Estimator';
import { MaxEstimator } from '../estimators/MaxEstimator';
import { abortAfter } from '../utils/AbortAfter';
import { getIterator } from '../utils/GetIterator';
import type { BatchHandler } from './BatchHandler';
import type { BatchSource } from './BatchSource';
import type { RunOptions } from './RunOptions';
import type { RunProgress } from './RunProgress';
import type { RunResult } from './RunResult';
import { StopReason } from './StopReason';

export async function runBatches<T>(source: BatchSource<T>, handler: BatchHandler<T>, options: RunOptions): Promise<RunResult> {
  const batches = getIterator(source);
  const progress: RunProgress = { batchesProcessed: 0, failures: [] };
  const budget = guardBudget(options.budget, progress);
  const estimator = guardEstimator(options.estimator ?? new MaxEstimator(), progress);
  const continueOnError = options.continueOnError ?? false;
  const deadline = abortAfter(budget.remainingMs());

  try {
    for (let index = 0; ; index++) {
      const reason = reasonToStopBeforeNextBatch(budget, estimator);
      if (reason) return { ...progress, mayHaveMore: true, reason };

      const startedAt = performance.now();

      const next = await fetchNext(batches, progress);
      if (next.done) return { ...progress, mayHaveMore: false, reason: StopReason.DONE };

      try {
        await handler(next.value, { signal: deadline.signal, index });
        progress.batchesProcessed++;
      } catch (error) {
        recordFailure(error, index, deadline.signal.aborted, continueOnError, progress);
      }

      estimator.record(performance.now() - startedAt);
    }
  } finally {
    deadline.cancel();
  }
}

async function fetchNext<T>(batches: Iterator<T> | AsyncIterator<T>, progress: RunProgress): Promise<IteratorResult<T>> {
  try {
    return await batches.next();
  } catch (error) {
    throw new SourceFailedError(error, progress);
  }
}

function recordFailure(error: unknown, index: number, aborted: boolean, continueOnError: boolean, progress: RunProgress): void {
  if (aborted) throw new BudgetExceededError(error, index, progress);
  if (!continueOnError) throw new HandlerFailedError(error, index, progress);
  progress.failures.push({ index, error });
}

function guardBudget(budget: TimeBudget, progress: RunProgress): TimeBudget {
  return { remainingMs: () => asConfigError(progress, () => budget.remainingMs()) };
}

function guardEstimator(estimator: Estimator, progress: RunProgress): Estimator {
  return {
    record: (ms) => asConfigError(progress, () => estimator.record(ms)),
    estimateMs: () => asConfigError(progress, () => estimator.estimateMs()),
  };
}

function asConfigError<R>(progress: RunProgress, call: () => R): R {
  try {
    return call();
  } catch (error) {
    throw new ConfigError(error, progress);
  }
}

function reasonToStopBeforeNextBatch(budget: TimeBudget, estimator: Estimator): Exclude<StopReason, StopReason.DONE> | null {
  const remainingMs = budget.remainingMs();
  if (!(remainingMs > 0)) return StopReason.BUDGET_EXHAUSTED;
  if (!(estimator.estimateMs() <= remainingMs)) return StopReason.ESTIMATE_EXCEEDS_BUDGET;
  return null;
}
