/**
 * Conversions between American odds, decimal odds, and implied probability.
 * Copied from web app — no React dependencies.
 */

export function americanToDecimal(american: number): number {
  if (american >= 100) {
    return american / 100 + 1;
  } else {
    return 100 / Math.abs(american) + 1;
  }
}

export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  } else {
    return Math.round(-100 / (decimal - 1));
  }
}

export function oddsToImpliedProb(american: number): number {
  const decimal = americanToDecimal(american);
  return 1 / decimal;
}

export function impliedProbToOdds(prob: number): number {
  const decimal = 1 / prob;
  return decimalToAmerican(decimal);
}

export function formatOdds(american: number): string {
  return american >= 0 ? `+${american}` : `${american}`;
}

export function calcPayout(stake: number, american: number): number {
  const decimal = americanToDecimal(american);
  return parseFloat((stake * decimal).toFixed(2));
}

export function calcProfit(stake: number, american: number): number {
  return parseFloat((calcPayout(stake, american) - stake).toFixed(2));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}
