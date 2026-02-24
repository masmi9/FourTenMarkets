import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// Key helpers
export const redisKeys = {
  odds: (selectionId: string) => `odds:${selectionId}`,
  exposure: (selectionId: string) => `exposure:${selectionId}`,
  marketStatus: (marketId: string) => `market:status:${marketId}`,
  dailyStake: (userId: string) => `daily_stake:${userId}:${new Date().toISOString().slice(0, 10)}`,
};
