/**
 * src/lib/odds-utils.ts
 *
 * Conversions between American odds, decimal odds, and implied probability.
 */

/**
 * American odds → decimal odds
 * e.g. -110 → 1.909, +150 → 2.5
 */
export function americanToDecimal(american: number): number {
  if (american >= 100) {
    return american / 100 + 1;
  } else {
    return 100 / Math.abs(american) + 1;
  }
}

/**
 * Decimal odds → American odds
 * e.g. 1.909 → -110, 2.5 → +150
 */
export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  } else {
    return Math.round(-100 / (decimal - 1));
  }
}

/**
 * American odds → implied probability (no vig)
 * e.g. -110 → 0.5238, +150 → 0.4
 */
export function oddsToImpliedProb(american: number): number {
  const decimal = americanToDecimal(american);
  return 1 / decimal;
}

/**
 * Implied probability → American odds
 * e.g. 0.5238 → -110, 0.4 → +150
 */
export function impliedProbToOdds(prob: number): number {
  const decimal = 1 / prob;
  return decimalToAmerican(decimal);
}

/**
 * Apply platform margin (juice) to odds.
 * For favorites (negative American), make more negative.
 * For underdogs (positive American), make less positive.
 *
 * margin = 0.04 means 4% juice
 */
export function applyMargin(american: number, margin: number): number {
  const impliedProb = oddsToImpliedProb(american);
  const withMargin = impliedProb + impliedProb * margin;
  return impliedProbToOdds(Math.min(withMargin, 0.95));
}

/**
 * Format American odds for display
 * e.g. 150 → "+150", -110 → "-110"
 */
export function formatOdds(american: number): string {
  return american >= 0 ? `+${american}` : `${american}`;
}

/**
 * Calculate potential payout from stake and American odds
 * Includes stake in return (total return = profit + stake)
 */
export function calcPayout(stake: number, american: number): number {
  const decimal = americanToDecimal(american);
  return parseFloat((stake * decimal).toFixed(2));
}

/**
 * Calculate profit only (payout minus stake)
 */
export function calcProfit(stake: number, american: number): number {
  return parseFloat((calcPayout(stake, american) - stake).toFixed(2));
}
