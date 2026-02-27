/**
 * src/instrumentation.ts
 *
 * Next.js server instrumentation hook — runs once on server startup.
 * Starts the background auto-settlement scheduler (Node.js runtime only).
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutoSettleScheduler } = await import("./lib/auto-settle");
    startAutoSettleScheduler();
  }
}
