/**
 * src/workers/odds-sync.ts
 *
 * BullMQ repeatable worker — fetches odds from The Odds API every 60s,
 * calculates consensus across all bookmakers, stores in DB + Redis cache.
 *
 * Run standalone:
 *   npx ts-node src/workers/odds-sync.ts
 *
 * Or add to a process manager (PM2, Railway worker dyno).
 */

import { Worker, Queue } from "bullmq";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import axios from "axios";
import { oddsToImpliedProb, impliedProbToOdds } from "../lib/odds-utils";

const QUEUE_NAME = "odds-sync";
const REPEAT_INTERVAL_MS = 60_000; // 60 seconds
const ODDS_API_BASE = process.env.ODDS_API_BASE_URL ?? "https://api.the-odds-api.com/v4";
const ODDS_API_KEY = process.env.ODDS_API_KEY ?? "";

// ─────────────────────────────────────────
// Odds API response types
// ─────────────────────────────────────────

interface OddsApiOutcome {
  name: string;
  price: number;  // decimal odds
}

interface OddsApiBookmaker {
  key: string;
  title: string;
  markets: Array<{
    key: string;
    outcomes: OddsApiOutcome[];
  }>;
}

interface OddsApiEvent {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

// ─────────────────────────────────────────
// Core sync logic
// ─────────────────────────────────────────

async function syncOddsForSport(sportKey: string): Promise<number> {
  let synced = 0;

  if (!ODDS_API_KEY || ODDS_API_KEY === "your-odds-api-key-here") {
    console.log(`  [SKIP] No Odds API key — using seed data`);
    return 0;
  }

  let oddsData: OddsApiEvent[];
  try {
    const res = await axios.get<OddsApiEvent[]>(
      `${ODDS_API_BASE}/sports/${sportKey}/odds`,
      {
        params: {
          apiKey: ODDS_API_KEY,
          regions: "us",
          markets: "h2h",
          oddsFormat: "decimal",
        },
        timeout: 10_000,
      }
    );
    oddsData = res.data;
  } catch (err) {
    console.error(`  [ERR] Failed to fetch odds for ${sportKey}:`, err);
    return 0;
  }

  for (const apiEvent of oddsData) {
    // Find event in DB by externalId
    const event = await prisma.event.findFirst({
      where: {
        externalId: apiEvent.id,
        status: { in: ["UPCOMING", "LIVE"] },
      },
      include: {
        markets: {
          where: { type: "MONEYLINE" },
          include: { selections: true },
        },
      },
    });

    if (!event || event.markets.length === 0) continue;

    const moneylineMarket = event.markets[0];

    // Aggregate implied probabilities across bookmakers
    const selectionProbs: Record<string, number[]> = {};

    for (const bookmaker of apiEvent.bookmakers) {
      const h2hMarket = bookmaker.markets.find((m) => m.key === "h2h");
      if (!h2hMarket) continue;

      for (const outcome of h2hMarket.outcomes) {
        const impliedProb = 1 / outcome.price;  // decimal odds → implied prob
        if (!selectionProbs[outcome.name]) selectionProbs[outcome.name] = [];
        selectionProbs[outcome.name].push(impliedProb);
      }
    }

    // For each selection, calculate consensus odds
    for (const selection of moneylineMarket.selections) {
      const probs = selectionProbs[selection.name];
      if (!probs || probs.length === 0) continue;

      const avgProb = probs.reduce((a, b) => a + b, 0) / probs.length;
      const consensusOdds = impliedProbToOdds(avgProb);

      // Get previous consensus for line movement
      const prev = await prisma.consensusOdds.findUnique({
        where: { selectionId: selection.id },
      });

      const prevProb = prev ? parseFloat(prev.impliedProb.toString()) : avgProb;
      const lineMovement = prevProb > 0 ? (avgProb - prevProb) / prevProb : 0;

      // Upsert consensus
      await prisma.consensusOdds.upsert({
        where: { selectionId: selection.id },
        create: {
          selectionId: selection.id,
          odds: consensusOdds,
          impliedProb: avgProb,
          lineMovement,
        },
        update: {
          odds: consensusOdds,
          impliedProb: avgProb,
          lineMovement,
        },
      });

      // Cache in Redis with 120s TTL
      await redis.set(`odds:${selection.id}`, consensusOdds.toString(), "EX", 120);

      // Auto-suspend if line moved >10% in this cycle
      if (Math.abs(lineMovement) > 0.10) {
        await prisma.market.update({
          where: { id: moneylineMarket.id },
          data: { status: "SUSPENDED" },
        });
        await redis.set(`market:status:${moneylineMarket.id}`, "SUSPENDED", "EX", 300);
        console.log(`  [ALERT] Market ${moneylineMarket.id} auto-suspended (line moved ${(lineMovement * 100).toFixed(1)}%)`);
      }

      synced++;
    }
  }

  return synced;
}

export async function runOddsSync(): Promise<void> {
  console.log(`[odds-sync] Starting sync at ${new Date().toISOString()}`);

  const sports = await prisma.sport.findMany();
  let totalSynced = 0;

  for (const sport of sports) {
    const count = await syncOddsForSport(sport.key);
    totalSynced += count;
    console.log(`  [${sport.name}] Synced ${count} selections`);
  }

  console.log(`[odds-sync] Done — ${totalSynced} total selections updated`);
}

// ─────────────────────────────────────────
// BullMQ worker setup
// ─────────────────────────────────────────

export async function startOddsSyncWorker(): Promise<void> {
  const queue = new Queue(QUEUE_NAME, { connection: redis });

  // Schedule repeatable job
  await queue.add(
    "sync",
    {},
    {
      repeat: { every: REPEAT_INTERVAL_MS },
      removeOnComplete: 10,
      removeOnFail: 5,
    }
  );

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await runOddsSync();
    },
    { connection: redis }
  );

  worker.on("failed", (job, err) => {
    console.error(`[odds-sync] Job ${job?.id} failed:`, err.message);
  });

  console.log(`[odds-sync] Worker started — syncing every ${REPEAT_INTERVAL_MS / 1000}s`);
}

// Run directly
if (require.main === module) {
  startOddsSyncWorker().catch(console.error);
}
