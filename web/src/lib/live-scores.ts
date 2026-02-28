/**
 * Fetches live/recent scores from The Odds API for a set of events.
 * Uses a short in-memory cache (30 s) to avoid hammering the API on
 * every server render triggered by AutoRefresh.
 */

import axios from "axios";

const ODDS_API_BASE =
  process.env.ODDS_API_BASE_URL ?? "https://api.the-odds-api.com/v4";
const ODDS_API_KEY = process.env.ODDS_API_KEY ?? "";

export interface LiveScore {
  homeScore: string | null;
  awayScore: string | null;
  /** Game has started but is not yet completed */
  isLive: boolean;
  /** Game is finished (scores are final) */
  isCompleted: boolean;
}

interface OddsApiScore {
  id: string;
  home_team: string;
  away_team: string;
  completed: boolean;
  scores: Array<{ name: string; score: string }> | null;
}

// Per-sport cache so repeated renders within 30 s don't re-hit the API
const _cache = new Map<string, { data: OddsApiScore[]; expiresAt: number }>();
const CACHE_TTL = 30_000;

async function fetchSport(sportKey: string): Promise<OddsApiScore[]> {
  const hit = _cache.get(sportKey);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  const res = await axios.get<OddsApiScore[]>(
    `${ODDS_API_BASE}/sports/${sportKey}/scores`,
    { params: { apiKey: ODDS_API_KEY, daysFrom: 3 }, timeout: 8_000 }
  );
  _cache.set(sportKey, { data: res.data, expiresAt: Date.now() + CACHE_TTL });
  return res.data;
}

function norm(s: string) {
  return s.toLowerCase().trim();
}

function matchEntry(
  entry: OddsApiScore,
  ev: { externalId: string | null; homeTeam: string; awayTeam: string }
) {
  if (ev.externalId && ev.externalId === entry.id) return true;
  return norm(entry.home_team) === norm(ev.homeTeam) &&
    norm(entry.away_team) === norm(ev.awayTeam);
}

export async function getLiveScores(
  events: Array<{
    id: string;
    externalId: string | null;
    homeTeam: string;
    awayTeam: string;
    sportKey: string;
  }>
): Promise<Map<string, LiveScore>> {
  const result = new Map<string, LiveScore>();
  if (!ODDS_API_KEY || events.length === 0) return result;

  // Group by sport so we make one API call per sport
  const bySport = new Map<string, typeof events>();
  for (const ev of events) {
    if (!bySport.has(ev.sportKey)) bySport.set(ev.sportKey, []);
    bySport.get(ev.sportKey)!.push(ev);
  }

  for (const [sportKey, sportEvents] of bySport) {
    let scores: OddsApiScore[];
    try {
      scores = await fetchSport(sportKey);
    } catch {
      continue; // skip sport if API unavailable
    }

    for (const ev of sportEvents) {
      const entry = scores.find((s) => matchEntry(s, ev));
      if (!entry || !entry.scores || entry.scores.length < 2) continue;

      const homeEntry = entry.scores.find((s) => norm(s.name) === norm(entry.home_team));
      const awayEntry = entry.scores.find((s) => norm(s.name) === norm(entry.away_team));

      result.set(ev.id, {
        homeScore: homeEntry?.score ?? null,
        awayScore: awayEntry?.score ?? null,
        isLive: !entry.completed,
        isCompleted: entry.completed,
      });
    }
  }

  return result;
}
