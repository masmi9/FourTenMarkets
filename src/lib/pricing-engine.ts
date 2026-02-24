/**
 * src/lib/pricing-engine.ts
 *
 * Core Accept / Counter / Reject pricing engine.
 * All consensus odds and exposure lookups hit Redis first — no DB reads in hot path.
 * Target: <50ms per request.
 */

import { redis, redisKeys } from "./redis";
import { oddsToImpliedProb, impliedProbToOdds, applyMargin, calcPayout } from "./odds-utils";

// ─────────────────────────────────────────
// Constants (tune these for your risk model)
// ─────────────────────────────────────────

/** User needs at least this much WORSE implied prob vs consensus to auto-accept */
const EDGE_ACCEPT_THRESHOLD = 0.02;  // 2% edge in platform's favor

/** Counter instead of reject if user's implied prob is within this of consensus */
const EDGE_COUNTER_THRESHOLD = -0.05; // up to 5% better than consensus → counter

/** Platform margin applied to counter offers */
const PLATFORM_MARGIN = 0.04; // 4% juice

/** Max liability platform will take on per selection */
const MAX_SELECTION_EXPOSURE = 50_000;

/** Warn and start countering if exposure reaches this fraction of max */
const EXPOSURE_WARN_FRACTION = 0.9;

/** Max stake per single bet */
const MAX_BET_STAKE = 5_000;

/** Max daily stake per user */
const MAX_DAILY_STAKE = 25_000;

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type PricingDecision = "ACCEPT" | "COUNTER" | "REJECT";

export interface PricingResult {
  decision: PricingDecision;
  acceptedOdds: number;      // Final odds if ACCEPT or COUNTER
  potentialPayout: number;
  rejectReason?: string;
  counterReason?: string;
}

export interface PricingInput {
  userId: string;
  selectionId: string;
  requestedOdds: number;  // American
  stake: number;
}

// ─────────────────────────────────────────
// Pricing Engine
// ─────────────────────────────────────────

export async function evaluateBetRequest(input: PricingInput): Promise<PricingResult> {
  const { userId, selectionId, requestedOdds, stake } = input;

  // ── 1. Stake limits ──────────────────────────────────────────────────────
  if (stake > MAX_BET_STAKE) {
    return reject(`Maximum single bet stake is $${MAX_BET_STAKE.toLocaleString()}`);
  }

  // Daily stake check
  const dailyKey = redisKeys.dailyStake(userId);
  const dailyStakeStr = await redis.get(dailyKey);
  const dailyStake = parseFloat(dailyStakeStr ?? "0");
  if (dailyStake + stake > MAX_DAILY_STAKE) {
    return reject(`Daily stake limit of $${MAX_DAILY_STAKE.toLocaleString()} reached`);
  }

  // ── 2. Load consensus odds from Redis ────────────────────────────────────
  const consensusStr = await redis.get(redisKeys.odds(selectionId));
  if (!consensusStr) {
    // No live odds cached — fall back to counter at -110 placeholder
    return counterOffer(requestedOdds, stake, -110, "No live consensus odds available");
  }
  const consensusOdds = parseInt(consensusStr, 10);

  // ── 3. Implied probability calculations ──────────────────────────────────
  const userImpliedProb = oddsToImpliedProb(requestedOdds);
  const consensusImpliedProb = oddsToImpliedProb(consensusOdds);

  // Positive edge = user's implied prob > consensus (user requesting worse odds)
  const edge = userImpliedProb - consensusImpliedProb;

  // ── 4. Exposure check ────────────────────────────────────────────────────
  const exposureStr = await redis.get(redisKeys.exposure(selectionId));
  const currentExposure = parseFloat(exposureStr ?? "0");
  const newLiability = calcPayout(stake, requestedOdds) - stake; // profit platform pays
  const projectedExposure = currentExposure + newLiability;

  if (projectedExposure > MAX_SELECTION_EXPOSURE) {
    return reject("Market exposure limit reached for this selection");
  }

  // ── 5. Decision logic ─────────────────────────────────────────────────────
  const nearCapacity = projectedExposure > MAX_SELECTION_EXPOSURE * EXPOSURE_WARN_FRACTION;

  if (edge >= EDGE_ACCEPT_THRESHOLD && !nearCapacity) {
    // User is requesting odds that are worse (for them) than market → Accept
    return {
      decision: "ACCEPT",
      acceptedOdds: requestedOdds,
      potentialPayout: calcPayout(stake, requestedOdds),
    };
  }

  if (edge >= EDGE_COUNTER_THRESHOLD || nearCapacity) {
    // Close to market or near capacity → Counter at fair odds with margin
    return counterOffer(
      requestedOdds,
      stake,
      consensusOdds,
      nearCapacity ? "Near exposure limit — best available odds" : undefined
    );
  }

  // User wants significantly better odds than market and can't justify it → Reject
  return reject("Requested odds are too far above market consensus");
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function counterOffer(
  requestedOdds: number,
  stake: number,
  consensusOdds: number,
  reason?: string
): PricingResult {
  const fairProb = oddsToImpliedProb(consensusOdds);
  const counterOddsRaw = applyMargin(impliedProbToOdds(fairProb), PLATFORM_MARGIN);

  // Round to nearest 5 for clean display
  const counterOdds = roundToNearest5(counterOddsRaw);

  return {
    decision: "COUNTER",
    acceptedOdds: counterOdds,
    potentialPayout: calcPayout(stake, counterOdds),
    counterReason: reason ?? `Best available: ${counterOdds > 0 ? "+" : ""}${counterOdds}`,
  };
}

function reject(reason: string): PricingResult {
  return {
    decision: "REJECT",
    acceptedOdds: 0,
    potentialPayout: 0,
    rejectReason: reason,
  };
}

function roundToNearest5(american: number): number {
  return Math.round(american / 5) * 5;
}

// ─────────────────────────────────────────
// Exposure update (call after bet is confirmed)
// ─────────────────────────────────────────

export async function incrementExposure(selectionId: string, liability: number): Promise<void> {
  const key = redisKeys.exposure(selectionId);
  await redis.incrbyfloat(key, liability);
  // No TTL — exposure is permanent until settlement clears it
}

export async function decrementExposure(selectionId: string, liability: number): Promise<void> {
  const key = redisKeys.exposure(selectionId);
  await redis.incrbyfloat(key, -liability);
}

export async function incrementDailyStake(userId: string, stake: number): Promise<void> {
  const key = redisKeys.dailyStake(userId);
  const pipeline = redis.pipeline();
  pipeline.incrbyfloat(key, stake);
  pipeline.expire(key, 86400); // expires at end of day naturally
  await pipeline.exec();
}
