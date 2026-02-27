/**
 * prisma/seed.ts
 *
 * Seeds the database with sample sports, leagues, events, and markets.
 * Run with: npx ts-node prisma/seed.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("[+] Seeding database...");

  // Admin user
  const adminHash = await bcrypt.hash("Admin123!", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@fourtenmarkets.com" },
    update: {},
    create: {
      email: "admin@fourtenmarkets.com",
      passwordHash: adminHash,
      name: "Admin",
      role: "ADMIN",
      wallet: {
        create: { balance: 100000, lockedBalance: 0 },
      },
    },
  });
  console.log(`  [+] Admin: ${admin.email}`);

  // Demo user
  const userHash = await bcrypt.hash("Demo123!", 12);
  const demo = await prisma.user.upsert({
    where: { email: "demo@fourtenmarkets.com" },
    update: {},
    create: {
      email: "demo@fourtenmarkets.com",
      passwordHash: userHash,
      name: "Demo User",
      wallet: {
        create: { balance: 1000, lockedBalance: 0 },
      },
    },
  });
  console.log(`  [+] Demo user: ${demo.email}`);

  // NBA
  const nba = await prisma.sport.upsert({
    where: { slug: "nba" },
    update: {},
    create: { name: "NBA", slug: "nba", key: "basketball_nba" },
  });

  // NFL
  const nfl = await prisma.sport.upsert({
    where: { slug: "nfl" },
    update: {},
    create: { name: "NFL", slug: "nfl", key: "americanfootball_nfl" },
  });

  // NHL
  const nhl = await prisma.sport.upsert({
    where: { slug: "nhl" },
    update: {},
    create: { name: "NHL", slug: "nhl", key: "icehockey_nhl" },
  });

  // MLB
  const mlb = await prisma.sport.upsert({
    where: { slug: "mlb" },
    update: {},
    create: { name: "MLB", slug: "mlb", key: "baseball_mlb" },
  });

  console.log("  [+] Sports created: NBA, NFL, NHL, MLB");

  // Leagues
  const nbaLeague = await prisma.league.upsert({
    where: { slug: "nba-main" },
    update: {},
    create: { sportId: nba.id, name: "NBA", slug: "nba-main", country: "USA" },
  });
  const nflLeague = await prisma.league.upsert({
    where: { slug: "nfl-main" },
    update: {},
    create: { sportId: nfl.id, name: "NFL", slug: "nfl-main", country: "USA" },
  });
  const nhlLeague = await prisma.league.upsert({
    where: { slug: "nhl-main" },
    update: {},
    create: { sportId: nhl.id, name: "NHL", slug: "nhl-main", country: "USA" },
  });
  const mlbLeague = await prisma.league.upsert({
    where: { slug: "mlb-main" },
    update: {},
    create: { sportId: mlb.id, name: "MLB", slug: "mlb-main", country: "USA" },
  });

  // Sample events (upcoming)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(19, 30, 0, 0);

  const events = [
    {
      leagueId: nbaLeague.id,
      homeTeam: "Sacramento Kings",
      awayTeam: "Golden State Warriors",
      startTime: tomorrow,
      status: "UPCOMING" as const,
    },
    {
      leagueId: nbaLeague.id,
      homeTeam: "Los Angeles Lakers",
      awayTeam: "Boston Celtics",
      startTime: new Date(tomorrow.getTime() + 7200000),
      status: "UPCOMING" as const,
    },
    {
      leagueId: nbaLeague.id,
      homeTeam: "Miami Heat",
      awayTeam: "New York Knicks",
      startTime: new Date(tomorrow.getTime() + 10800000),
      status: "UPCOMING" as const,
    },
    {
      leagueId: nhlLeague.id,
      homeTeam: "New York Rangers",
      awayTeam: "Pittsburgh Penguins",
      startTime: tomorrow,
      status: "UPCOMING" as const,
    },
    {
      leagueId: mlbLeague.id,
      homeTeam: "New York Yankees",
      awayTeam: "Boston Red Sox",
      startTime: new Date(tomorrow.getTime() + 3600000),
      status: "UPCOMING" as const,
    },
  ];

  for (const eventData of events) {
    const existing = await prisma.event.findFirst({
      where: {
        homeTeam: eventData.homeTeam,
        awayTeam: eventData.awayTeam,
        startTime: eventData.startTime,
      },
    });
    if (existing) continue;

    const event = await prisma.event.create({ data: eventData });

    // Create Moneyline market for each event
    const moneyline = await prisma.market.create({
      data: {
        eventId: event.id,
        name: "Moneyline",
        type: "MONEYLINE",
        status: "OPEN",
      },
    });

    const homeSelection = await prisma.selection.create({
      data: { marketId: moneyline.id, name: eventData.homeTeam },
    });
    const awaySelection = await prisma.selection.create({
      data: { marketId: moneyline.id, name: eventData.awayTeam },
    });

    // Seed placeholder consensus odds
    await prisma.consensusOdds.createMany({
      data: [
        {
          selectionId: homeSelection.id,
          odds: -150,
          impliedProb: 0.6,
          lineMovement: 0,
        },
        {
          selectionId: awaySelection.id,
          odds: 130,
          impliedProb: 0.435,
          lineMovement: 0,
        },
      ],
    });

    // Position placeholders
    await prisma.position.createMany({
      data: [
        {
          marketId: moneyline.id,
          selectionId: homeSelection.id,
          totalExposure: 0,
          totalLiability: 0,
        },
        {
          marketId: moneyline.id,
          selectionId: awaySelection.id,
          totalExposure: 0,
          totalLiability: 0,
        },
      ],
    });

    // Player Props market (NBA only)
    if (eventData.leagueId === nbaLeague.id) {
      const playerProp = await prisma.market.create({
        data: {
          eventId: event.id,
          name: "De'Aaron Fox — Points O/U",
          type: "PLAYER_PROP",
          status: "OPEN",
        },
      });

      const overSel = await prisma.selection.create({
        data: { marketId: playerProp.id, name: "Over", line: "21.5" },
      });
      const underSel = await prisma.selection.create({
        data: { marketId: playerProp.id, name: "Under", line: "21.5" },
      });

      await prisma.consensusOdds.createMany({
        data: [
          { selectionId: overSel.id, odds: -110, impliedProb: 0.524, lineMovement: 0 },
          { selectionId: underSel.id, odds: -110, impliedProb: 0.524, lineMovement: 0 },
        ],
      });

      await prisma.position.createMany({
        data: [
          { marketId: playerProp.id, selectionId: overSel.id, totalExposure: 0, totalLiability: 0 },
          { marketId: playerProp.id, selectionId: underSel.id, totalExposure: 0, totalLiability: 0 },
        ],
      });
    }

    console.log(`  [+] Event: ${eventData.awayTeam} @ ${eventData.homeTeam}`);
  }

  console.log("[+] Seed complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
