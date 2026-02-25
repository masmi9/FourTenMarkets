/**
 * src/lib/pricing-engine.ts
 *
 * Core Accept / Counter / Reject pricing engine.
 * Hot path uses Redis for <50ms response. Falls back to PostgreSQL
 * gracefully when Redis is unavailable (e.g. local dev without Redis).
 */

import { safeGet, safeSet, safeIncrByFloat, redisKeys } from "./redis";
import { prisma } from "./prisma";
import { oddsToImpliedProb, impliedProbToOdds, applyMargin, calcPayout } from "./odds-utils";

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────

const EDGE_ACCEPT_THRESHOLD = 0.02;
const EDGE_COUNTER_THRESHOLD = -0.05;
const PLATFORM_MARGIN = 0.04;
const MAX_SELECTION_EXPOSURE = 50_000;
const EXPOSURE_WARN_FRACTION = 0.9;
const MAX_BET_STAKE = 5_000;
const MAX_DAILY_STAKE = 25_000;

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type PricingDecision = "ACCEPT" | "COUNTER" | "REJECT";

export interface PricingResult {
  decision: PricingDecision;
  acceptedOdds: number;
  potentialPayout: number;
  rejectReason?: string;
  counterReason?: string;
}

export interface PricingInput {
  userId: string;
  selectionId: string;
  requestedOdds: number;
  stake: number;
}

// ─────────────────────────────────────────
// Consensus odds — Redis first, DB fallback
// ─────────────────────────────────────────

async function getConsensusOdds(selectionId: string): Promise<number | null> {
  const cached = await safeGet(redisKeys.odds(selectionId));
  if (cached) return parseInt(cached, 10);

  const consensus = await prisma.consensusOdds.findUnique({ where: { selectionId } });
  if (!consensus) return null;

  await safeSet(redisKeys.odds(selectionId), consensus.odds.toString(), 120);
  return consensus.odds;
}

// ─────────────────────────────────────────
// Exposure — Redis first, DB fallback
// ─────────────────────────────────────────

async function getCurrentExposure(selectionId: string): Promise<number> {
  const cached = await safeGet(redisKeys.exposure(selectionId));
  if (cached !== null) return parseFloat(cached);

  const position = await prisma.position.findUnique({ where: { selectionId } });
  return position ? parseFloat(position.totalLiability.toString()) : 0;
}

async function getDailyStake(userId: string): Promise<number> {
  const cached = await safeGet(redisKeys.dailyStake(userId));
  return parseFloat(cached ?? "0");
}

// ─────────────────────────────────────────
// Pricing Engine
// ─────────────────────────────────────────

export async function evaluateBetRequest(input: PricingInput): Promise<PricingResult> {
  const { userId, selectionId, requestedOdds, stake } = input;

  if (stake > MAX_BET_STAKE) {
    return reject(`Maximum single bet stake is $${MAX_BET_STAKE.toLocaleString()}`);
  }

  const dailyStake = await getDailyStake(userId);
  if (dailyStake + stake > MAX_DAILY_STAKE) {
    return reject(`Daily stake limit of $${MAX_DAILY_STAKE.toLocaleString()} reached`);
  }

  const consensusOdds = await getConsensusOdds(selectionId);
  if (!consensusOdds) {
    return counterOffer(requestedOdds, stake, -110, "No consensus odds available — offering standard line");
  }

  const userImpliedProb = oddsToImpliedProb(requestedOdds);
  const consensusImpliedProb = oddsToImpliedProb(consensusOdds);
  const edge = userImpliedProb - consensusImpliedProb;

  const currentExposure = await getCurrentExposure(selectionId);
  const newLiability = calcPayout(stake, requestedOdds) - stake;
  const projectedExposure = currentExposure + newLiability;

  if (projectedExposure > MAX_SELECTION_EXPOSURE) {
    return reject("Market exposure limit reached for this selection");
  }

  const nearCapacity = projectedExposure > MAX_SELECTION_EXPOSURE * EXPOSURE_WARN_FRACTION;

  if (edge >= EDGE_ACCEPT_THRESHOLD && !nearCapacity) {
    return {
      decision: "ACCEPT",
      acceptedOdds: requestedOdds,
      potentialPayout: calcPayout(stake, requestedOdds),
    };
  }

  if (edge >= EDGE_COUNTER_THRESHOLD || nearCapacity) {
    return counterOffer(
      requestedOdds,
      stake,
      consensusOdds,
      nearCapacity ? "Near exposure limit — best available odds" : undefined
    );
  }

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
  const counterOdds = roundToNearest5(
    applyMargin(impliedProbToOdds(fairProb), PLATFORM_MARGIN)
  );
  return {
    decision: "COUNTER",
    acceptedOdds: counterOdds,
    potentialPayout: calcPayout(stake, counterOdds),
    counterReason: reason ?? `Best available: ${counterOdds > 0 ? "+" : ""}${counterOdds}`,
  };
}

function reject(reason: string): PricingResult {
  return { decision: "REJECT", acceptedOdds: 0, potentialPayout: 0, rejectReason: reason };
}

function roundToNearest5(american: number): number {
  return Math.round(american / 5) * 5;
}

// ─────────────────────────────────────────
// Exposure updates (called after bet confirmed)
// ─────────────────────────────────────────

export async function incrementExposure(selectionId: string, liability: number): Promise<void> {
  await safeIncrByFloat(redisKeys.exposure(selectionId), liability);
  await prisma.position.updateMany({
    where: { selectionId },
    data: { totalLiability: { increment: liability } },
  });
}

export async function decrementExposure(selectionId: string, liability: number): Promise<void> {
  await safeIncrByFloat(redisKeys.exposure(selectionId), -liability);
  await prisma.position.updateMany({
    where: { selectionId },
    data: { totalLiability: { decrement: liability } },
  });
}

export async function incrementDailyStake(userId: string, stake: number): Promise<void> {
  try {
    const { redis } = await import("./redis");
    const key = redisKeys.dailyStake(userId);
    const pipeline = redis.pipeline();
    pipeline.incrbyfloat(key, stake);
    pipeline.expire(key, 86400);
    await pipeline.exec();
  } catch {
    // Redis unavailable — daily limit tracking degraded in dev
  }
}
