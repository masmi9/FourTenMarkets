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
| Within 5% of consensus OR near capacity | `COUNTER` — fair odds ± 4% margin |
| >5% better than consensus OR over exposure | `REJECT` |

Counter offers expire in 2 minutes. Users can accept or ignore.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Styling | TailwindCSS (dark theme) |
| Database | PostgreSQL via Prisma |
| Cache / PubSub | Redis (ioredis) |
| Job Queue | BullMQ |
| Auth | JWT + HTTP-only cookies (jose) |
| Odds Data | [The Odds API](https://the-odds-api.com) |

---

## Repo Structure

```
FourTenMarkets/
├── prisma/
│   ├── schema.prisma          # Full DB schema
│   └── seed.ts                # Sample sports, events, markets
├── src/
│   ├── app/
│   │   ├── (auth)/            # Login + signup pages
│   │   ├── (app)/             # Protected app pages
│   │   │   ├── dashboard/     # Overview + recent bets
│   │   │   ├── markets/       # Event list + event detail with bet slip
│   │   │   ├── bets/          # Bet history + active bets
│   │   │   ├── wallet/        # Balance, deposit, withdraw, transactions
│   │   │   └── admin/         # Live exposure dashboard (admin only)
│   │   └── api/               # REST API routes
│   │       ├── auth/          # signup, login, logout, me
│   │       ├── bets/          # request, confirm, list
│   │       ├── wallet/        # balance, deposit, withdraw, transactions
│   │       ├── events/        # list, detail
│   │       ├── sports/        # list
│   │       └── admin/         # exposure, settle, market suspend
│   ├── components/
│   │   ├── bet-slip/          # BetSlip.tsx — odds input + Accept/Counter/Reject UI
│   │   └── layout/            # Sidebar.tsx
│   ├── lib/
│   │   ├── pricing-engine.ts  # Accept / Counter / Reject logic
│   │   ├── risk-engine.ts     # Exposure limits + tracking
│   │   ├── settlement-engine.ts # Bet settlement + payout
│   │   ├── odds-utils.ts      # American ↔ decimal ↔ implied probability
│   │   ├── redis.ts           # ioredis singleton + key helpers
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
- `REDIS_URL` — Redis connection (default: `redis://localhost:6379`)
- `ODDS_API_KEY` — Get a free key at [the-odds-api.com](https://the-odds-api.com) (500 req/month free tier)

### 3. Set up the database

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Seed with sample sports, events, and markets
npm run db:seed
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

### Placing a Bet

1. Go to **Markets** → click any event
2. Click a selection (e.g. "Sacramento Kings" on the moneyline)
3. Enter your **requested odds** (American format: `+150`, `-110`, etc.)
4. Enter your **stake**
5. Click **Request Odds** — response in <500ms:
   - **Accept** → bet placed automatically
   - **Counter** → you see our best offer, click to confirm (expires 2 min)
   - **Reject** → reason shown, try different odds

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

### Bets
```
POST /api/bets/request   { selectionId, requestedOdds, stake }
POST /api/bets/confirm   { requestId }
GET  /api/bets?status=ACTIVE
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

**Hot path** (all Redis, no DB reads):
1. Load `odds:{selectionId}` from Redis (consensus odds, TTL 120s)
2. Load `exposure:{selectionId}` from Redis (live liability)
3. Load `daily_stake:{userId}:{date}` from Redis (user's daily volume)
4. Run decision matrix → Accept / Counter / Reject
5. Return result in <50ms

**On bet confirm:**
- `INCRBY exposure:{selectionId} {liability}` — atomic Redis increment
- Lock stake in wallet (`lockedBalance += stake`)
- Write `Bet` record to PostgreSQL

---

## Risk Limits

Configured as constants in `src/lib/pricing-engine.ts`:

| Limit | Default |
|---|---|
| Max selection exposure | $50,000 |
| Exposure warn threshold | 90% of max |
| Max single bet stake | $5,000 |
| Max daily stake per user | $25,000 |
| Platform margin (counter juice) | 4% |
| Auto-suspend on line movement | >10% |

---

## Roadmap

- [x] Phase 1 — Foundation (auth, wallet, DB schema)
- [x] Phase 2 — Pricing engine (Accept/Counter/Reject)
- [x] Phase 3 — Bet flow (request → confirm → settle)
- [ ] Phase 4 — Socket.io live odds push
- [ ] Phase 5 — The Odds API live data worker
- [ ] Phase 6 — Spread / Total / Player Prop markets
- [ ] Phase 7 — Stripe payment processing
- [ ] Phase 8 — Deploy (Vercel + Railway)
