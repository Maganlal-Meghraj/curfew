import { setTimeout as sleep } from 'node:timers/promises';
import { BudgetExceededError, FixedBudget, runBatches } from 'curfew';

const TOTAL_PAGES = 10;
const RUN_BUDGET_MS = 1_000;

interface Page {
  number: number;
  items: string[];
}

async function* fetchPages(fromPage: number): AsyncGenerator<Page> {
  for (let number = fromPage; number < TOTAL_PAGES; number++) {
    await sleep(20);
    const itemCount = number === 4 ? 25 : 4;
    yield { number, items: Array.from({ length: itemCount }, (_, i) => `page-${number}-item-${i}`) };
  }
}

// Must be idempotent: an interrupted page is processed again from the start on the next run.
async function saveItem(item: string, signal: AbortSignal): Promise<void> {
  await sleep(30, item, { signal });
}

async function runOnce(fromPage: number): Promise<number | null> {
  try {
    const result = await runBatches(
      fetchPages(fromPage),
      async (page, { signal }) => {
        signal.throwIfAborted();

        for (const item of page.items) {
          await saveItem(item, signal);
        }
      },
      { budget: new FixedBudget(RUN_BUDGET_MS) },
    );

    console.log(`  stopped: ${result.reason}`);
    return result.mayHaveMore ? fromPage + result.batchesProcessed + result.failures.length : null;
  } catch (error) {
    if (!(error instanceof BudgetExceededError)) throw error;

    const nextPage = fromPage + error.batchesProcessed + error.failures.length;
    console.log(`  stopped: budget ran out during page ${nextPage}`);
    return nextPage;
  }
}

let nextPage: number | null = 0;
for (let run = 1; nextPage !== null; run++) {
  console.log(`run ${run}: starting at page ${nextPage}`);
  nextPage = await runOnce(nextPage);
}
console.log('all pages processed');
