/**
 * src/lib/settlement-engine.ts
 *
 * Resolves bets for a settled event, credits payouts to wallets,
 * and updates Position records.
 */

import { prisma } from "./prisma";
import { decrementExposure } from "./pricing-engine";
import { calcPayout } from "./odds-utils";

export type SettleResults = Record<string, "WON" | "LOST" | "VOID">;

export interface SettlementSummary {
  settled: number;
  totalPaid: number;
  errors: string[];
}

/**
 * Settle all active bets for an event.
 *
 * @param eventId  - The event to settle
 * @param results  - Map of selectionId → result
 */
export async function settleEvent(
  eventId: string,
  results: SettleResults
): Promise<SettlementSummary> {
  const summary: SettlementSummary = { settled: 0, totalPaid: 0, errors: [] };

  // Mark event settled
  await prisma.event.update({
    where: { id: eventId },
    data: { status: "SETTLED" },
  });

  // Close all markets for this event
  await prisma.market.updateMany({
    where: { eventId },
    data: { status: "CLOSED" },
  });

  for (const [selectionId, result] of Object.entries(results)) {
    // Get all active bets on this selection
    const bets = await prisma.bet.findMany({
      where: { selectionId, status: "ACTIVE" },
      include: { user: { include: { wallet: true } } },
    });

    for (const bet of bets) {
      try {
        const settlementResult = result === "VOID" ? "VOID" : result;
        const payout = result === "WON"
          ? calcPayout(parseFloat(bet.stake.toString()), bet.odds)
          : result === "VOID"
          ? parseFloat(bet.stake.toString())
          : 0;

        // Create settlement record
        await prisma.settlement.create({
          data: {
            betId: bet.id,
            result: settlementResult as "WON" | "LOST" | "VOID",
            payout,
          },
        });

        // Update bet status
        await prisma.bet.update({
          where: { id: bet.id },
          data: { status: result === "WON" ? "WON" : result === "VOID" ? "VOIDED" : "LOST" },
        });

        const wallet = bet.user?.wallet;
        if (!wallet) {
          summary.errors.push(`No wallet for user ${bet.userId}`);
          continue;
        }

        if (payout > 0) {
          // Credit payout to wallet
          await prisma.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: { increment: payout },
              lockedBalance: { decrement: parseFloat(bet.stake.toString()) },
            },
          });

          await prisma.transaction.create({
            data: {
              walletId: wallet.id,
              type: result === "VOID" ? "BET_REFUND" : "BET_PAYOUT",
              amount: payout,
              reference: bet.id,
              description: result === "VOID"
                ? `Refund: bet voided`
                : `Payout: won at ${bet.odds > 0 ? "+" : ""}${bet.odds}`,
            },
          });
        } else {
          // Losing bet — unlock the stake (it was already debited on placement)
          await prisma.wallet.update({
            where: { id: wallet.id },
            data: {
              lockedBalance: { decrement: parseFloat(bet.stake.toString()) },
            },
          });
        }

        // Decrement Redis exposure
        const liability = parseFloat(bet.potentialPayout.toString()) - parseFloat(bet.stake.toString());
        await decrementExposure(selectionId, liability);

        summary.settled++;
        summary.totalPaid += payout;
      } catch (err) {
        summary.errors.push(`Bet ${bet.id}: ${err}`);
      }
    }

    // Update Position record
    await prisma.position.updateMany({
      where: { selectionId },
      data: { totalExposure: 0, totalLiability: 0 },
    });
  }

  // ── Settle parlay legs for every selection resolved in this event ──────────

  for (const [selectionId, result] of Object.entries(results)) {
    const legOutcome =
      result === "WON" ? "WON" : result === "VOID" ? "VOID" : "LOST";
    await prisma.parlayLeg.updateMany({
      where: { selectionId, result: "PENDING" },
      data: { result: legOutcome },
    });
  }

  // Check whether any affected parlays are now fully settled
  const affectedSelectionIds = Object.keys(results);
  const parlays = await prisma.parlay.findMany({
    where: {
      status: { in: ["PENDING", "ACTIVE"] },
      legs: { some: { selectionId: { in: affectedSelectionIds } } },
    },
    include: { legs: true, user: { include: { wallet: true } } },
  });

  for (const parlay of parlays) {
    if (parlay.legs.some((l) => l.result === "PENDING")) continue;

    const stake = parseFloat(parlay.stake.toString());
    const wallet = parlay.user?.wallet;
    const hasLost = parlay.legs.some((l) => l.result === "LOST");

    if (hasLost) {
      await prisma.parlay.update({
        where: { id: parlay.id },
        data: { status: "LOST" },
      });
      if (wallet) {
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { lockedBalance: { decrement: stake } },
        });
      }
    } else {
      const wonLegs = parlay.legs.filter((l) => l.result === "WON");
      if (wonLegs.length === 0) {
        // All legs voided — refund stake
        await prisma.parlay.update({
          where: { id: parlay.id },
          data: { status: "VOIDED" },
        });
        if (wallet) {
          await prisma.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: { increment: stake },
              lockedBalance: { decrement: stake },
            },
          });
          await prisma.transaction.create({
            data: {
              walletId: wallet.id,
              type: "BET_REFUND",
              amount: stake,
              reference: parlay.id,
              description: "Parlay refund: all legs voided",
            },
          });
        }
      } else {
        // Won (some legs may be void — recalculate using only WON legs)
        const combinedDecimal = wonLegs.reduce((acc, leg) => {
          const d =
            leg.acceptedOdds >= 0
              ? 1 + leg.acceptedOdds / 100
              : 1 + 100 / Math.abs(leg.acceptedOdds);
          return acc * d;
        }, 1);
        const payout = parseFloat((stake * combinedDecimal).toFixed(2));

        await prisma.parlay.update({
          where: { id: parlay.id },
          data: { status: "WON", potentialPayout: payout },
        });
        if (wallet) {
          await prisma.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: { increment: payout },
              lockedBalance: { decrement: stake },
            },
          });
          await prisma.transaction.create({
            data: {
              walletId: wallet.id,
              type: "BET_PAYOUT",
              amount: payout,
              reference: parlay.id,
              description: `Parlay payout (${wonLegs.length} leg${wonLegs.length !== 1 ? "s" : ""})`,
            },
          });
          summary.totalPaid += payout;
        }
      }
    }
  }

  return summary;
}
