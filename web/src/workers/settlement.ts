/**
 * src/workers/settlement.ts
 *
 * BullMQ worker — processes settlement jobs triggered by admin settle endpoint.
 * Jobs are added by POST /api/admin/settle and processed here asynchronously.
 *
 * Run standalone:
 *   npx ts-node src/workers/settlement.ts
 */

import { Worker, Queue } from "bullmq";
import { redis } from "../lib/redis";
import { settleEvent, SettleResults } from "../lib/settlement-engine";

const QUEUE_NAME = "settlement";

export interface SettlementJobData {
  eventId: string;
  results: SettleResults;
  requestedBy: string; // admin userId
}

export const settlementQueue = new Queue<SettlementJobData>(QUEUE_NAME, {
  connection: redis,
});

export async function startSettlementWorker(): Promise<void> {
  const worker = new Worker<SettlementJobData>(
    QUEUE_NAME,
    async (job) => {
      const { eventId, results } = job.data;
      console.log(`[settlement] Processing event ${eventId}`);

      const summary = await settleEvent(eventId, results);

      console.log(
        `[settlement] Event ${eventId} settled: ` +
          `${summary.settled} bets, $${summary.totalPaid.toFixed(2)} paid out`
      );

      if (summary.errors.length > 0) {
        console.error(`[settlement] Errors:`, summary.errors);
      }

      return summary;
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on("completed", (job, result) => {
    console.log(`[settlement] Job ${job.id} completed:`, result);
  });

  worker.on("failed", (job, err) => {
    console.error(`[settlement] Job ${job?.id} failed:`, err.message);
  });

  console.log("[settlement] Worker started");
}

// Run directly
if (require.main === module) {
  startSettlementWorker().catch(console.error);
}
