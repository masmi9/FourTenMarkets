# FourTen Markets

A hybrid sports betting exchange where users propose their own odds. The pricing engine evaluates every request against live consensus lines, market exposure, and statistical probability — then responds **Accept**, **Counter**, or **Reject** in real time.

---

## How It Works

Traditional sportsbooks set fixed odds. FourTen Markets inverts that: you request the odds you want, and the exchange evaluates your request against:

| Check | Logic |
|---|---|
| **Implied probability** | User's requested odds converted to implied prob vs. consensus |
| **Edge calculation** | How far the request is from fair market value |
| **Exposure limits** | Current platform liability on that selection |
| **User limits** | Per-bet ($5K) and daily ($25K) stake limits |

**Decision matrix:**

| Condition | Response |
|---|---|
| User's implied prob ≥ consensus + 2% | `ACCEPT` — platform has edge |
| Within 5% of consensus | `COUNTER` — proportional offer (never below consensus) |
| >5% better than consensus OR over exposure | `REJECT` |

Counter offers are **rationalized** — the further above market your request is, the more the engine pulls the counter toward consensus. Counter offers expire in 2 minutes.

---

## Market Types

| Type | Description |
|---|---|
| **Moneyline** | Straight win/loss on a team |
| **Spread** | Against-the-spread bet with a point line (e.g. Celtics −5.5) |
| **Total** | Over/Under on combined score (e.g. Over 224.5) |

All three market types support the full Accept/Counter/Reject pricing flow.

---

## Parlays

Build cross-game parlays from any combination of moneyline, spread, and total selections:

1. Click **+ Parlay** on any selection across any game
2. Add 2–12 legs — odds are editable per leg
3. See live combined odds and payout preview
4. Submit as a single stake — pricing engine evaluates each leg independently
5. Accept the parlay or negotiate the counter offer

Combined odds = product of each leg's accepted decimal odds, converted back to American. If any single leg is rejected, the entire parlay is rejected.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Styling | TailwindCSS (dark theme) |
| Database | PostgreSQL via Prisma |
| Cache | Redis (ioredis) — optional in dev, degrades to DB |
| Job Queue | BullMQ |
| Auth | JWT + HTTP-only cookies (jose) |
| Odds Data | [The Odds API](https://the-odds-api.com) |

---

## Repo Structure

```
FourTenMarkets/
├── prisma/
│   ├── schema.prisma          # Full DB schema (15 models)
│   ├── seed.ts                # Demo users + sample events
│   └── seed-nba.ts            # Live NBA slate from The Odds API
├── src/
│   ├── app/
│   │   ├── (auth)/            # Login + signup pages
│   │   ├── (app)/             # Protected app pages
│   │   │   ├── dashboard/     # Overview + recent bets
│   │   │   ├── markets/       # Event list + event detail with bet slip
│   │   │   ├── bets/          # Single bets + parlays history
│   │   │   ├── wallet/        # Balance, deposit, withdraw, transactions
│   │   │   └── admin/         # Live exposure dashboard (admin only)
│   │   └── api/               # REST API routes
│   │       ├── auth/          # signup, login, logout, me
│   │       ├── bets/          # request, confirm, list
│   │       │   └── parlay/    # parlay request + confirm
│   │       ├── wallet/        # balance, deposit, withdraw, transactions
│   │       ├── events/        # list, detail
│   │       ├── sports/        # list
│   │       └── admin/         # exposure, settle, market suspend
│   ├── components/
│   │   ├── bet-slip/          # BetSlip.tsx — single-bet Accept/Counter/Reject UI
│   │   ├── parlay-slip/       # ParlaySlip.tsx — floating cross-game parlay builder
│   │   └── layout/            # Sidebar.tsx
│   ├── context/
│   │   └── ParlayContext.tsx  # App-wide parlay slip state
│   ├── lib/
│   │   ├── pricing-engine.ts  # Accept / Counter / Reject (single bets)
│   │   ├── parlay-engine.ts   # Per-leg pricing + combined odds math
│   │   ├── settlement-engine.ts # Bet settlement + payout
│   │   ├── odds-utils.ts      # American ↔ decimal ↔ implied probability
│   │   ├── redis.ts           # ioredis singleton + safe wrappers
│   │   ├── prisma.ts          # Prisma client singleton
│   │   ├── auth.ts            # JWT sign/verify + cookie helpers
│   │   ├── validators.ts      # Zod input schemas
│   │   └── rate-limit.ts      # IP-based rate limiter
│   ├── workers/
│   │   ├── odds-sync.ts       # BullMQ: fetch + cache odds every 60s
│   │   └── settlement.ts      # BullMQ: async settlement processor
│   └── middleware.ts          # Auth guard + admin route protection
├── .env.example
└── package.json
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Generate with `openssl rand -base64 32`
- `REDIS_URL` — Redis connection (default: `redis://localhost:6379`); optional in dev
- `ODDS_API_KEY` — Free key at [the-odds-api.com](https://the-odds-api.com) (500 req/month)

### 3. Set up the database

```bash
# Push schema to database
npm run db:push

# Seed demo users + sample events (no API key needed)
npm run db:seed

# OR seed live NBA games from The Odds API (requires ODDS_API_KEY)
npm run db:seed-nba
```

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Usage

### Default Accounts (after seed)

| Email | Password | Role |
|---|---|---|
| `demo@fourtenmarkets.com` | `Demo123!` | User |
| `admin@fourtenmarkets.com` | `Admin123!` | Admin |

### Placing a Single Bet

1. Go to **Markets** → click any event
2. Click **Bet** on a selection (moneyline, spread, or total)
3. Enter your **requested odds** (American format: `+150`, `-110`, etc.)
4. Enter your **stake**
5. Click **Request Odds** — response in <500ms:
   - **Accept** → bet placed automatically
   - **Counter** → see the rationalized best offer, click to confirm (2 min window)
   - **Reject** → reason shown

### Building a Parlay

1. Click **+ Parlay** on any selection across any game
2. The **Parlay Slip** (bottom-right) tracks your legs
3. Edit per-leg odds — combined odds update live
4. Enter a single stake and click **Request N-Leg Parlay**
5. Accept or confirm the counter offer

### Admin — Settle an Event

```bash
POST /api/admin/settle
{
  "eventId": "...",
  "results": {
    "<selectionId-home>": "WON",
    "<selectionId-away>": "LOST"
  }
}
```

Or use the Admin dashboard at `/admin` to view live exposure and suspend markets.

---

## API Reference

### Auth
```
POST /api/auth/signup    { email, password, name? }
POST /api/auth/login     { email, password }
POST /api/auth/logout
GET  /api/auth/me
```

### Markets
```
GET /api/sports
GET /api/events?sport=nba&status=UPCOMING
GET /api/events/:id
```

### Single Bets
```
POST /api/bets/request   { selectionId, requestedOdds, stake }
POST /api/bets/confirm   { requestId }
GET  /api/bets
```

### Parlays
```
POST /api/bets/parlay          { legs: [{ selectionId, requestedOdds }], stake }
POST /api/bets/parlay/confirm  { parlayId }
GET  /api/bets/parlay
```

### Wallet
```
GET  /api/wallet
POST /api/wallet/deposit    { amount }
POST /api/wallet/withdraw   { amount }
GET  /api/wallet/transactions
```

### Admin (requires ADMIN role)
```
GET  /api/admin/exposure
PATCH /api/admin/markets/:id  { status: "OPEN"|"SUSPENDED" }
POST /api/admin/settle        { eventId, results }
```

---

## Pricing Engine Details

**File:** `src/lib/pricing-engine.ts`

**Hot path** (Redis-first, DB fallback):
1. Load `odds:{selectionId}` from Redis (consensus odds, TTL 120s)
2. Load `exposure:{selectionId}` from Redis (live liability)
3. Load `daily_stake:{userId}:{date}` from Redis
4. Calculate edge = userImpliedProb − consensusImpliedProb
5. Interpolate counter value proportionally across the edge range
6. Return result in <50ms

**Counter rationalization:**
- Edge range: −5% (reject boundary) → +2% (accept boundary)
- `position = (edge − threshold_reject) / edge_range`
- `counterProb = lerp(consensusProb, userProb, position)`
- Counter is floored at the consensus line — never offers less than what's publicly shown

**On bet confirm:**
- `INCRBY exposure:{selectionId} {liability}` — atomic Redis increment
- Lock stake in wallet (`lockedBalance += stake`)
- Write `Bet` or `Parlay` record to PostgreSQL

---

## Risk Limits

| Limit | Default |
|---|---|
| Max selection exposure | $50,000 |
| Exposure warn threshold | 90% of max |
| Max single bet / parlay stake | $5,000 |
| Max daily stake per user | $25,000 |
| Parlay max legs | 12 |
| Auto-suspend on line movement | >10% |

---

## Live Odds

`npm run db:seed-nba` fetches the next 48 hours of NBA games from The Odds API and seeds:
- Real event matchups with actual tip-off times
- Moneyline, spread, and total markets
- Consensus odds averaged across all available bookmakers (DraftKings, FanDuel, BetMGM, etc.)

The `odds-sync` worker refreshes all markets every 60 seconds when running. Each seed run consumes **1 API request** from the free tier (500/month).

---

## Roadmap

- [x] Phase 1 — Foundation (auth, wallet, DB schema)
- [x] Phase 2 — Pricing engine (Accept/Counter/Reject with rationalized counters)
- [x] Phase 3 — Single bet flow (request → confirm → settle)
- [x] Phase 4 — Live NBA slate (The Odds API integration)
- [x] Phase 5 — Spread + Total markets
- [x] Phase 6 — Cross-game parlays (2–12 legs, floating slip)
- [ ] Phase 7 — Socket.io live odds push
- [ ] Phase 8 — Player props
- [ ] Phase 9 — Stripe payment processing
- [ ] Phase 10 — Deploy (Vercel + Railway)
