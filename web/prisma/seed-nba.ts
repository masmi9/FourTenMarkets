/**
 * prisma/seed-nba.ts
 *
 * Fetches tomorrow's NBA slate from The Odds API and upserts real game data
 * into the database: events, moneyline markets, selections, and consensus odds.
 *
 * Safe to re-run daily — uses upsert by externalId (idempotent).
 *
 * Usage:
 *   npm run db:seed-nba
 *
 * Requires ODDS_API_KEY in .env (https://the-odds-api.com — free tier: 500 req/month)
 */

import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import axios from "axios";

// ─────────────────────────────────────────
// Load .env (avoids needing dotenv package)
// ─────────────────────────────────────────

const envFile = path.join(process.cwd(), ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["'](.*)["']$/, "$1");
    }
  }
}

// ─────────────────────────────────────────
// Config
// ─────────────────────────────────────────

const prisma = new PrismaClient();
const ODDS_API_KEY = process.env.ODDS_API_KEY ?? "";
const ODDS_API_BASE = process.env.ODDS_API_BASE_URL ?? "https://api.the-odds-api.com/v4";

// ─────────────────────────────────────────
// The Odds API types
// ─────────────────────────────────────────

interface OddsApiOutcome {
  name: string;
  price: number; // American odds integer when oddsFormat=american
  point?: number; // spread/total line (e.g. -5.5, 224.5)
}

interface OddsApiBookmaker {
  key: string;
  title: string;
  markets: Array<{
    key: string;  // "h2h" | "spreads" | "totals"
    outcomes: OddsApiOutcome[];
  }>;
}

interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string; // ISO 8601 UTC
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

// ─────────────────────────────────────────
// Odds helpers (inline — no import needed)
// ─────────────────────────────────────────

function americanToImpliedProb(american: number): number {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

function impliedProbToAmerican(prob: number): number {
  const decimal = 1 / prob;
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

function avgArray(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function formatOdds(american: number): string {
  return american >= 0 ? `+${american}` : `${american}`;
}

// ─────────────────────────────────────────
// Main
// ─────────────────────────────────────────

async function main() {
  if (!ODDS_API_KEY || ODDS_API_KEY === "your-odds-api-key-here") {
    console.error(
      "\n[!] ODDS_API_KEY is not set.\n" +
        "    Add it to your .env file:\n" +
        "    ODDS_API_KEY=your-key-here\n" +
        "    Get a free key at https://the-odds-api.com\n"
    );
    process.exit(1);
  }

  // Fetch window: now → 48 hours from now
  // Covers tonight's late games + all of tomorrow's slate
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 2);

  console.log(`\n[odds-api] Fetching NBA games`);
  console.log(`  From: ${from.toUTCString()}`);
  console.log(`  To:   ${to.toUTCString()}`);
  console.log(`  Key:  ${ODDS_API_KEY.slice(0, 6)}...`);

  let oddsData: OddsApiEvent[];
  try {
    const res = await axios.get<OddsApiEvent[]>(
      `${ODDS_API_BASE}/sports/basketball_nba/odds`,
      {
        params: {
          apiKey: ODDS_API_KEY,
          regions: "us",
          markets: "h2h,spreads,totals",
          oddsFormat: "american",
          commenceTimeFrom: from.toISOString().replace(/\.\d{3}Z$/, "Z"),
          commenceTimeTo: to.toISOString().replace(/\.\d{3}Z$/, "Z"),
        },
        timeout: 15_000,
      }
    );
    oddsData = res.data;

    // Log remaining API quota from response headers
    const remaining = res.headers["x-requests-remaining"];
    const used = res.headers["x-requests-used"];
    if (remaining !== undefined) {
      console.log(`  Quota: ${used} used, ${remaining} remaining`);
    }
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const data = err.response?.data;
      if (status === 401) {
        console.error("[!] Invalid API key — check ODDS_API_KEY in .env");
      } else if (status === 422) {
        console.error("[!] Invalid request params:", data);
      } else {
        console.error(`[!] Odds API error (${status}):`, data ?? err.message);
      }
    } else {
      console.error("[!] Network error:", err);
    }
    process.exit(1);
  }

  if (oddsData.length === 0) {
    console.log("\n[!] No NBA games found in the next 48 hours.");
    console.log("    The NBA might be on a break, or all games are already in progress.");
    process.exit(0);
  }

  console.log(`\n[+] ${oddsData.length} game(s) found — seeding database...\n`);

  // ── Ensure NBA sport + league exist ──────────────────────────────────────

  const nba = await prisma.sport.upsert({
    where: { slug: "nba" },
    update: {},
    create: { name: "NBA", slug: "nba", key: "basketball_nba" },
  });

  const nbaLeague = await prisma.league.upsert({
    where: { slug: "nba-main" },
    update: {},
    create: { sportId: nba.id, name: "NBA", slug: "nba-main", country: "USA" },
  });

  // ── Upsert each game ─────────────────────────────────────────────────────

  let created = 0;
  let updated = 0;
  let oddsSeeded = 0;

  for (const game of oddsData) {
    const gameTime = new Date(game.commence_time);
    const isNew = !(await prisma.event.findUnique({ where: { externalId: game.id } }));

    // Upsert event by The Odds API external ID
    const event = await prisma.event.upsert({
      where: { externalId: game.id },
      update: {
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        startTime: gameTime,
        status: "UPCOMING",
      },
      create: {
        leagueId: nbaLeague.id,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        startTime: gameTime,
        status: "UPCOMING",
        externalId: game.id,
      },
    });

    // Find or create MONEYLINE market
    let moneyline = await prisma.market.findFirst({
      where: { eventId: event.id, type: "MONEYLINE" },
      include: { selections: true },
    });

    if (!moneyline) {
      moneyline = await prisma.market.create({
        data: {
          eventId: event.id,
          name: "Moneyline",
          type: "MONEYLINE",
          status: "OPEN",
        },
        include: { selections: true },
      });
    }

    // Find or create home and away selections
    const getOrCreateSel = async (name: string) => {
      const existing = moneyline!.selections.find((s) => s.name === name);
      if (existing) return existing;
      return prisma.selection.create({ data: { marketId: moneyline!.id, name } });
    };

    const homeSel = await getOrCreateSel(game.home_team);
    const awaySel = await getOrCreateSel(game.away_team);

    // Aggregate implied probabilities across all bookmakers
    const homeProbs: number[] = [];
    const awayProbs: number[] = [];

    for (const bm of game.bookmakers) {
      const h2h = bm.markets.find((m) => m.key === "h2h");
      if (!h2h) continue;
      for (const outcome of h2h.outcomes) {
        const prob = americanToImpliedProb(outcome.price);
        if (outcome.name === game.home_team) homeProbs.push(prob);
        else if (outcome.name === game.away_team) awayProbs.push(prob);
      }
    }

    // Upsert consensus odds for home and away
    const upsertConsensus = async (selId: string, probs: number[]) => {
      if (probs.length === 0) return;
      const avgProb = avgArray(probs);
      const odds = impliedProbToAmerican(avgProb);
      const prev = await prisma.consensusOdds.findUnique({ where: { selectionId: selId } });
      const prevProb = prev ? parseFloat(prev.impliedProb.toString()) : avgProb;
      const lineMovement = prevProb > 0 ? (avgProb - prevProb) / prevProb : 0;

      await prisma.consensusOdds.upsert({
        where: { selectionId: selId },
        create: { selectionId: selId, odds, impliedProb: avgProb, lineMovement: 0 },
        update: { odds, impliedProb: avgProb, lineMovement },
      });
      oddsSeeded++;
      return odds;
    };

    const homeOdds = await upsertConsensus(homeSel.id, homeProbs);
    const awayOdds = await upsertConsensus(awaySel.id, awayProbs);

    // Ensure Position records exist (initialize at 0 for new, skip update for existing)
    for (const selId of [homeSel.id, awaySel.id]) {
      await prisma.position.upsert({
        where: { selectionId: selId },
        create: {
          marketId: moneyline.id,
          selectionId: selId,
          totalExposure: 0,
          totalLiability: 0,
        },
        update: {},
      });
    }

    // ── SPREAD market ────────────────────────────────────────────────────────

    // Collect spread lines across bookmakers: { teamName -> { probs, line } }
    const spreadData: Record<string, { probs: number[]; line: number }> = {};
    for (const bm of game.bookmakers) {
      const spreadsMarket = bm.markets.find((m) => m.key === "spreads");
      if (!spreadsMarket) continue;
      for (const outcome of spreadsMarket.outcomes) {
        if (outcome.point === undefined) continue;
        if (!spreadData[outcome.name]) {
          spreadData[outcome.name] = { probs: [], line: outcome.point };
        }
        spreadData[outcome.name].probs.push(americanToImpliedProb(outcome.price));
      }
    }

    if (Object.keys(spreadData).length >= 2) {
      let spreadMarket = await prisma.market.findFirst({
        where: { eventId: event.id, type: "SPREAD" },
        include: { selections: true },
      });
      if (!spreadMarket) {
        spreadMarket = await prisma.market.create({
          data: { eventId: event.id, name: "Spread", type: "SPREAD", status: "OPEN" },
          include: { selections: true },
        });
      }

      for (const [teamName, { probs, line }] of Object.entries(spreadData)) {
        const lineStr = line >= 0 ? `+${line}` : `${line}`;
        const existing = spreadMarket.selections.find((s) => s.name === teamName);
        const sel = existing ?? await prisma.selection.create({
          data: { marketId: spreadMarket.id, name: teamName, line: lineStr },
        });
        // Update line in case it moved
        if (existing && existing.line !== lineStr) {
          await prisma.selection.update({ where: { id: sel.id }, data: { line: lineStr } });
        }
        const seededOdds = await upsertConsensus(sel.id, probs);
        if (seededOdds !== undefined) {
          await prisma.position.upsert({
            where: { selectionId: sel.id },
            create: { marketId: spreadMarket.id, selectionId: sel.id, totalExposure: 0, totalLiability: 0 },
            update: {},
          });
        }
      }
    }

    // ── TOTAL (Over/Under) market ─────────────────────────────────────────────

    const totalData: Record<string, { probs: number[]; line: number }> = {};
    for (const bm of game.bookmakers) {
      const totalsMarket = bm.markets.find((m) => m.key === "totals");
      if (!totalsMarket) continue;
      for (const outcome of totalsMarket.outcomes) {
        if (outcome.point === undefined) continue;
        if (!totalData[outcome.name]) {
          totalData[outcome.name] = { probs: [], line: outcome.point };
        }
        totalData[outcome.name].probs.push(americanToImpliedProb(outcome.price));
      }
    }

    if (Object.keys(totalData).length >= 2) {
      let totalMarket = await prisma.market.findFirst({
        where: { eventId: event.id, type: "TOTAL" },
        include: { selections: true },
      });
      if (!totalMarket) {
        totalMarket = await prisma.market.create({
          data: { eventId: event.id, name: "Total Points", type: "TOTAL", status: "OPEN" },
          include: { selections: true },
        });
      }

      for (const [name, { probs, line }] of Object.entries(totalData)) {
        const existing = totalMarket.selections.find((s) => s.name === name);
        const sel = existing ?? await prisma.selection.create({
          data: { marketId: totalMarket.id, name, line: `${line}` },
        });
        const seededOdds = await upsertConsensus(sel.id, probs);
        if (seededOdds !== undefined) {
          await prisma.position.upsert({
            where: { selectionId: sel.id },
            create: { marketId: totalMarket.id, selectionId: sel.id, totalExposure: 0, totalLiability: 0 },
            update: {},
          });
        }
      }
    }

    if (isNew) created++;
    else updated++;

    // Pretty-print game summary
    const timeStr = gameTime.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
      timeZoneName: "short",
    });

    const homeDisplay = homeOdds !== undefined ? formatOdds(homeOdds) : "  N/A";
    const awayDisplay = awayOdds !== undefined ? formatOdds(awayOdds) : "  N/A";
    const bookCount = game.bookmakers.length;

    console.log(`  ${isNew ? "NEW" : "UPD"} │ ${timeStr}`);
    console.log(
      `       │ ${game.away_team.padEnd(28)} ${awayDisplay.padStart(5)}`
    );
    console.log(
      `       │ ${game.home_team.padEnd(28)} ${homeDisplay.padStart(5)}  (${bookCount} books)`
    );
    console.log();
  }

  console.log(
    `[+] Done — ${created} new event(s), ${updated} updated, ${oddsSeeded} consensus odds seeded`
  );
  console.log(
    `[i] The odds-sync worker will refresh these odds every 60s when running.`
  );
}

main()
  .catch((err) => {
    console.error("\n[!] Fatal error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
