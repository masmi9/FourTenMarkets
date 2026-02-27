/**
 * src/lib/parlay-engine.ts
 *
 * Evaluates a multi-leg parlay request through the same Accept/Counter/Reject
 * logic as single bets. Each leg is priced independently; combined decimal odds
 * are the product of each leg's accepted decimal odds.
 */

import {
  getConsensusOdds,
  getDailyStake,
  EDGE_ACCEPT_THRESHOLD,
  EDGE_COUNTER_THRESHOLD,
  MAX_BET_STAKE,
  MAX_DAILY_STAKE,
} from "./pricing-engine";
import { oddsToImpliedProb, impliedProbToOdds, americanToDecimal, decimalToAmerican } from "./odds-utils";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export interface ParlayLegInput {
  selectionId: string;
  requestedOdds: number;
}

export interface ParlayRequest {
  userId: string;
  legs: ParlayLegInput[];
  stake: number;
}

export interface ParlayLegResult {
  selectionId: string;
  requestedOdds: number;
  decision: "ACCEPT" | "COUNTER" | "REJECT";
  acceptedOdds: number;
  reason?: string;
}

export interface ParlayResult {
  decision: "ACCEPT" | "COUNTER" | "REJECT";
  legs: ParlayLegResult[];
  combinedOdds: number;   // American
  potentialPayout: number;
  rejectReason?: string;
}

// ─────────────────────────────────────────
// Per-leg pricing (same edge model as single bets)
// ─────────────────────────────────────────

function priceLeg(
  requestedOdds: number,
  consensusOdds: number
): ParlayLegResult & { selectionId: string } {
  const userProb      = oddsToImpliedProb(requestedOdds);
  const consensusProb = oddsToImpliedProb(consensusOdds);
  const edge          = userProb - consensusProb;

  if (edge >= EDGE_ACCEPT_THRESHOLD) {
    return { selectionId: "", requestedOdds, decision: "ACCEPT", acceptedOdds: requestedOdds };
  }

  if (edge >= EDGE_COUNTER_THRESHOLD) {
    // Interpolate: position 0 = reject boundary (give consensus), 1 = accept boundary (honor request)
    const edgeRange = EDGE_ACCEPT_THRESHOLD - EDGE_COUNTER_THRESHOLD;
    const position  = Math.max(0, Math.min(1, (edge - EDGE_COUNTER_THRESHOLD) / edgeRange));
    const targetProb = consensusProb + position * (userProb - consensusProb);
    const rawOdds    = impliedProbToOdds(targetProb);
    const roundedOdds = Math.round(rawOdds / 5) * 5;
    const counterOdds = Math.max(consensusOdds, roundedOdds);
    return {
      selectionId: "",
      requestedOdds,
      decision: "COUNTER",
      acceptedOdds: counterOdds,
      reason: `Best available: ${counterOdds >= 0 ? "+" : ""}${counterOdds}`,
    };
  }

  return {
    selectionId: "",
    requestedOdds,
    decision: "REJECT",
    acceptedOdds: 0,
    reason: "Requested odds are too far above market consensus",
  };
}

// ─────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────

export async function evaluateParlayRequest(input: ParlayRequest): Promise<ParlayResult> {
  const { userId, legs, stake } = input;

  // Basic validation
  if (legs.length < 2) {
    return rejectParlay("Parlays require at least 2 legs");
  }
  if (legs.length > 12) {
    return rejectParlay("Parlays are limited to 12 legs");
  }
  if (stake > MAX_BET_STAKE) {
    return rejectParlay(`Maximum parlay stake is $${MAX_BET_STAKE.toLocaleString()}`);
  }

  // No duplicate selections
  const selIds = legs.map((l) => l.selectionId);
  if (new Set(selIds).size !== selIds.length) {
    return rejectParlay("Duplicate selections are not allowed in a parlay");
  }

  // Daily stake check
  const dailyStake = await getDailyStake(userId);
  if (dailyStake + stake > MAX_DAILY_STAKE) {
    return rejectParlay(`Daily stake limit of $${MAX_DAILY_STAKE.toLocaleString()} reached`);
  }

  // Price each leg
  const legResults: ParlayLegResult[] = [];

  for (const leg of legs) {
    const consensusOdds = await getConsensusOdds(leg.selectionId);

    if (!consensusOdds) {
      // No consensus — offer standard -110 line for this leg
      legResults.push({
        selectionId: leg.selectionId,
        requestedOdds: leg.requestedOdds,
        decision: "COUNTER",
        acceptedOdds: -110,
        reason: "No consensus odds — standard line applied",
      });
      continue;
    }

    const result = priceLeg(leg.requestedOdds, consensusOdds);
    legResults.push({ ...result, selectionId: leg.selectionId });
  }

  // If any leg is rejected, the whole parlay is rejected
  const rejectedLeg = legResults.find((l) => l.decision === "REJECT");
  if (rejectedLeg) {
    return {
      decision: "REJECT",
      legs: legResults,
      combinedOdds: 0,
      potentialPayout: 0,
      rejectReason: rejectedLeg.reason ?? "One or more legs were rejected",
    };
  }

  // Combine decimal odds (product of each leg's accepted decimal)
  const combinedDecimal = legResults.reduce(
    (acc, leg) => acc * americanToDecimal(leg.acceptedOdds),
    1
  );
  const combinedOdds   = decimalToAmerican(combinedDecimal);
  const potentialPayout = parseFloat((stake * combinedDecimal).toFixed(2));

  const overallDecision = legResults.some((l) => l.decision === "COUNTER")
    ? "COUNTER"
    : "ACCEPT";

  return { decision: overallDecision, legs: legResults, combinedOdds, potentialPayout };
}

// ─────────────────────────────────────────
// Helper
// ─────────────────────────────────────────

function rejectParlay(reason: string): ParlayResult {
  return { decision: "REJECT", legs: [], combinedOdds: 0, potentialPayout: 0, rejectReason: reason };
}
