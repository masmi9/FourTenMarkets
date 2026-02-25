import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null, // don't retry — fail fast so we fall back to DB
  });

// Suppress unhandled error events (we handle errors inline)
redis.on("error", () => {});

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// Key helpers
export const redisKeys = {
  odds: (selectionId: string) => `odds:${selectionId}`,
  exposure: (selectionId: string) => `exposure:${selectionId}`,
  marketStatus: (marketId: string) => `market:status:${marketId}`,
  dailyStake: (userId: string) =>
    `daily_stake:${userId}:${new Date().toISOString().slice(0, 10)}`,
};

/** Returns null instead of throwing when Redis is unavailable */
export async function safeGet(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

/** No-ops instead of throwing when Redis is unavailable */
export async function safeSet(
  key: string,
  value: string,
  ex?: number
): Promise<void> {
  try {
    if (ex) {
      await redis.set(key, value, "EX", ex);
    } else {
      await redis.set(key, value);
    }
  } catch {
    // Redis unavailable — skip cache write
  }
}

export async function safeIncrByFloat(
  key: string,
  increment: number
): Promise<void> {
  try {
    await redis.incrbyfloat(key, increment);
  } catch {
    // Redis unavailable — exposure tracking degraded
  }
}
