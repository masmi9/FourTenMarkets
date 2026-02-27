/**
 * src/lib/auto-settle.ts
 *
 * Shared auto-settlement logic.
 *
 * - runAutoSettle()         — fetches scores from The Odds API and settles all
 *                             completed events that are still UPCOMING/LIVE.
 * - startAutoSettleScheduler() — starts a background interval (runs immediately
 *                             on first call, then every INTERVAL_MS). Uses a
 *                             global singleton so the scheduler only starts once
 *                             even if the module is re-imported.
 */

import axios from "axios";
import { prisma } from "./prisma";
import { settleEvent, SettleResults } from "./settlement-engine";

const ODDS_API_BASE =
  process.env.ODDS_API_BASE_URL ?? "https://api.the-odds-api.com/v4";
const ODDS_API_KEY = process.env.ODDS_API_KEY ?? "";

/** How often to poll for completed games (5 minutes). */
const INTERVAL_MS = 5 * 60 * 1000;

// ── Types ────────────────────────────────────────────────────────────────────

interface OddsApiScore {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  completed: boolean;
  commence_time: string;
  scores: Array<{ name: string; score: string }> | null;
}

export interface AutoSettleResult {
  settled: number;
  skipped: number;
  events: string[];
  skippedDetails: string[];
  errors: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function norm(s: string) {
  return s.toLowerCase().trim();
}

function matchScore(
  score: OddsApiScore,
  event: { externalId: string | null; homeTeam: string; awayTeam: string }
): boolean {
  if (event.externalId && event.externalId === score.id) return true;
  return (
    norm(score.home_team) === norm(event.homeTeam) &&
    norm(score.away_team) === norm(event.awayTeam)
  );
}

function buildResults(
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  markets: Array<{
    type: string;
    selections: Array<{ id: string; name: string; line: string | null }>;
  }>
): SettleResults {
  const results: SettleResults = {};
  const winner =
    homeScore > awayScore
      ? homeTeam
      : awayScore > homeScore
      ? awayTeam
      : null;

  for (const market of markets) {
    for (const sel of market.selections) {
      if (market.type === "MONEYLINE") {
        if (!winner) {
          results[sel.id] = "VOID";
        } else {
          results[sel.id] = sel.name === winner ? "WON" : "LOST";
        }
      } else if (market.type === "SPREAD") {
        if (!sel.line) continue;
        const spread = parseFloat(sel.line);
        if (isNaN(spread)) continue;
        const isHome = norm(sel.name) === norm(homeTeam);
        const teamScore = isHome ? homeScore : awayScore;
        const oppScore = isHome ? awayScore : homeScore;
        const adjusted = teamScore + spread;
        if (adjusted > oppScore) results[sel.id] = "WON";
        else if (adjusted < oppScore) results[sel.id] = "LOST";
        else results[sel.id] = "VOID";
      } else if (market.type === "TOTAL") {
        if (!sel.line) continue;
        const line = parseFloat(sel.line);
        if (isNaN(line)) continue;
        const total = homeScore + awayScore;
        const name = norm(sel.name);
        if (name === "over") {
          results[sel.id] =
            total > line ? "WON" : total < line ? "LOST" : "VOID";
        } else if (name === "under") {
          results[sel.id] =
            total < line ? "WON" : total > line ? "LOST" : "VOID";
        }
      }
    }
  }

  return results;
}

// ── Core settlement run ───────────────────────────────────────────────────────

export async function runAutoSettle(): Promise<AutoSettleResult> {
  const result: AutoSettleResult = {
    settled: 0,
    skipped: 0,
    events: [],
    skippedDetails: [],
    errors: [],
  };

  if (!ODDS_API_KEY || ODDS_API_KEY === "your-odds-api-key-here") {
    result.errors.push("ODDS_API_KEY is not configured — skipping auto-settle");
    return result;
  }

  // Events that started > 3 hours ago and are still open
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000);

  const staleEvents = await prisma.event.findMany({
    where: {
      status: { in: ["UPCOMING", "LIVE"] },
      startTime: { lt: cutoff },
    },
    include: {
      league: { include: { sport: true } },
      markets: { include: { selections: true } },
    },
  });

  if (staleEvents.length === 0) return result;

  // Group by sport key so we make one API call per sport
  const bySport: Record<string, typeof staleEvents> = {};
  for (const ev of staleEvents) {
    const key = ev.league.sport.key;
    if (!bySport[key]) bySport[key] = [];
    bySport[key].push(ev);
  }

  for (const [sportKey, events] of Object.entries(bySport)) {
    let scores: OddsApiScore[];
    try {
      const res = await axios.get<OddsApiScore[]>(
        `${ODDS_API_BASE}/sports/${sportKey}/scores`,
        { params: { apiKey: ODDS_API_KEY, daysFrom: 3 }, timeout: 10_000 }
      );
      scores = res.data;
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? `${err.response?.status ?? "network"}: ${JSON.stringify(err.response?.data)}`
        : String(err);
      result.errors.push(`[${sportKey}] Failed to fetch scores: ${msg}`);
      continue;
    }

    for (const event of events) {
      const label = `${event.awayTeam} @ ${event.homeTeam}`;
      const scoreEntry = scores.find((s) => matchScore(s, event));

      if (!scoreEntry) {
        result.skippedDetails.push(`${label} (no score data found)`);
        result.skipped++;
        continue;
      }
      if (!scoreEntry.completed) {
        result.skippedDetails.push(`${label} (game not yet completed)`);
        result.skipped++;
        continue;
      }
      if (!scoreEntry.scores || scoreEntry.scores.length < 2) {
        result.skippedDetails.push(`${label} (score data incomplete)`);
        result.skipped++;
        continue;
      }

      const homeScoreEntry = scoreEntry.scores.find(
        (s) => norm(s.name) === norm(event.homeTeam)
      );
      const awayScoreEntry = scoreEntry.scores.find(
        (s) => norm(s.name) === norm(event.awayTeam)
      );

      if (!homeScoreEntry || !awayScoreEntry) {
        result.skippedDetails.push(`${label} (could not match team names in score data)`);
        result.skipped++;
        continue;
      }

      const homeScore = parseInt(homeScoreEntry.score, 10);
      const awayScore = parseInt(awayScoreEntry.score, 10);

      if (isNaN(homeScore) || isNaN(awayScore)) {
        result.skippedDetails.push(`${label} (invalid score values)`);
        result.skipped++;
        continue;
      }

      const selectionResults = buildResults(
        event.homeTeam,
        event.awayTeam,
        homeScore,
        awayScore,
        event.markets
      );

      if (Object.keys(selectionResults).length === 0) {
        result.skippedDetails.push(`${label} (no settleable selections found)`);
        result.skipped++;
        continue;
      }

      try {
        const summary = await settleEvent(event.id, selectionResults);
        result.events.push(
          `${label} (${homeScore}-${awayScore}, ${summary.settled} bet${summary.settled !== 1 ? "s" : ""} settled, $${summary.totalPaid.toFixed(2)} paid)`
        );
        result.settled++;
      } catch (err) {
        result.errors.push(`${label}: ${err}`);
      }
    }
  }

  return result;
}

// ── Background scheduler (singleton) ─────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __autoSettleStarted: boolean | undefined;
}

export function startAutoSettleScheduler() {
  if (global.__autoSettleStarted) return;
  global.__autoSettleStarted = true;

  const run = async () => {
    try {
      const result = await runAutoSettle();
      if (result.settled > 0 || result.errors.length > 0) {
        console.log(
          `[auto-settle] settled=${result.settled} skipped=${result.skipped} errors=${result.errors.length}`,
          result.errors.length ? result.errors : ""
        );
      }
    } catch (err) {
      console.error("[auto-settle] Unexpected error:", err);
    }
  };

  // Run immediately on server boot, then on the interval
  run();
  setInterval(run, INTERVAL_MS);
}
