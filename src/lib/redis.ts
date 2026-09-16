import Redis from 'ioredis';

const globalForRedis = global as unknown as {
  redisClient: Redis | undefined;
};

export const redis =
  globalForRedis.redisClient ??
  new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    connectTimeout: 10_000,
    enableReadyCheck: true,
    retryStrategy: (attempt) => Math.min(attempt * 250, 5_000),
  });

redis.on('error', (error) => {
  console.error('[redis] connection error', {
    errorCode: error instanceof Error ? error.name : 'unknown_error',
  });
});

if (process.env.NODE_ENV !== 'production') globalForRedis.redisClient = redis;
