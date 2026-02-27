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
  price: number;  // American odds (when oddsFormat=american)
  point?: number; // spread/total line
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
          markets: "h2h,spreads,totals",
          oddsFormat: "american",
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
    // Find event in DB by externalId, load all market types
    const event = await prisma.event.findFirst({
      where: {
        externalId: apiEvent.id,
        status: { in: ["UPCOMING", "LIVE"] },
      },
      include: {
        markets: {
          where: { type: { in: ["MONEYLINE", "SPREAD", "TOTAL"] } },
          include: { selections: true },
        },
      },
    });

    if (!event) continue;

    // Map: apiMarketKey → { dbMarketType, selectionKey }
    // selectionKey = outcome.name for h2h/spreads; "Over"/"Under" for totals
    const marketMapping: Array<{
      apiKey: string;
      dbType: "MONEYLINE" | "SPREAD" | "TOTAL";
    }> = [
      { apiKey: "h2h",     dbType: "MONEYLINE" },
      { apiKey: "spreads", dbType: "SPREAD"    },
      { apiKey: "totals",  dbType: "TOTAL"     },
    ];

    for (const { apiKey, dbType } of marketMapping) {
      const dbMarket = event.markets.find((m) => m.type === dbType);
      if (!dbMarket) continue;

      // Aggregate implied probs per selection name across all bookmakers
      const selectionProbs: Record<string, number[]> = {};

      for (const bookmaker of apiEvent.bookmakers) {
        const bkMkt = bookmaker.markets.find((m) => m.key === apiKey);
        if (!bkMkt) continue;
        for (const outcome of bkMkt.outcomes) {
          // American odds → implied prob (price is American integer)
          const impliedProb = outcome.price > 0
            ? 100 / (outcome.price + 100)
            : Math.abs(outcome.price) / (Math.abs(outcome.price) + 100);
          if (!selectionProbs[outcome.name]) selectionProbs[outcome.name] = [];
          selectionProbs[outcome.name].push(impliedProb);
        }
      }

      for (const selection of dbMarket.selections) {
        const probs = selectionProbs[selection.name];
        if (!probs || probs.length === 0) continue;

        const avgProb = probs.reduce((a, b) => a + b, 0) / probs.length;
        const consensusOdds = impliedProbToOdds(avgProb);

        const prev = await prisma.consensusOdds.findUnique({ where: { selectionId: selection.id } });
        const prevProb = prev ? parseFloat(prev.impliedProb.toString()) : avgProb;
        const lineMovement = prevProb > 0 ? (avgProb - prevProb) / prevProb : 0;

        await prisma.consensusOdds.upsert({
          where: { selectionId: selection.id },
          create: { selectionId: selection.id, odds: consensusOdds, impliedProb: avgProb, lineMovement },
          update: { odds: consensusOdds, impliedProb: avgProb, lineMovement },
        });

        await redis.set(`odds:${selection.id}`, consensusOdds.toString(), "EX", 120);

        if (Math.abs(lineMovement) > 0.10) {
          await prisma.market.update({ where: { id: dbMarket.id }, data: { status: "SUSPENDED" } });
          await redis.set(`market:status:${dbMarket.id}`, "SUSPENDED", "EX", 300);
          console.log(`  [ALERT] ${dbType} market ${dbMarket.id} auto-suspended (line moved ${(lineMovement * 100).toFixed(1)}%)`);
        }

        synced++;
      }
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
