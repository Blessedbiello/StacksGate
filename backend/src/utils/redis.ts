import { createClient, RedisClientType } from 'redis';
import { logger } from './logger';

let redisClient: RedisClientType;

export async function connectRedis(): Promise<RedisClientType | null> {
  // Redis is optional, try to connect
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  if (!redisClient) {
    try {
      redisClient = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 2000, // 2 second timeout
          reconnectStrategy: false, // Don't auto-reconnect
        },
      });

      redisClient.on('error', (err) => {
        logger.error('Redis client error:', err);
      });

      redisClient.on('connect', () => {
        logger.info('Redis client connected');
      });

      redisClient.on('disconnect', () => {
        logger.warn('Redis client disconnected');
      });

      await redisClient.connect();
      logger.info('Redis connection established successfully');
    } catch (error) {
      logger.warn('Failed to connect to Redis, continuing without cache:', (error as Error).message);
      // Continue without Redis if connection fails
      return null;
    }
  }

  return redisClient;
}

export function getRedisClient(): RedisClientType | null {
  return redisClient || null;
}

// Cache utilities
export async function cacheSet(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    logger.debug('Cache set skipped - Redis unavailable', { key });
    return;
  }
  
  try {
    const serializedValue = JSON.stringify(value);
    await client.setEx(key, ttlSeconds, serializedValue);
    logger.debug('Cache set', { key, ttl: ttlSeconds });
  } catch (error) {
    logger.warn('Cache set failed', { key, error: (error as Error).message });
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) {
    logger.debug('Cache get skipped - Redis unavailable', { key });
    return null;
  }
  
  try {
    const cachedValue = await client.get(key);
    
    if (cachedValue) {
      logger.debug('Cache hit', { key });
      return JSON.parse(cachedValue) as T;
    }
    
    logger.debug('Cache miss', { key });
    return null;
  } catch (error) {
    logger.warn('Cache get failed', { key, error: (error as Error).message });
    return null;
  }
}

export async function cacheDelete(key: string): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    logger.debug('Cache delete skipped - Redis unavailable', { key });
    return;
  }
  
  try {
    await client.del(key);
    logger.debug('Cache delete', { key });
  } catch (error) {
    logger.warn('Cache delete failed', { key, error: (error as Error).message });
  }
}

export async function cacheExists(key: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return false;
  }
  
  try {
    const exists = await client.exists(key);
    return exists === 1;
  } catch (error) {
    logger.warn('Cache exists check failed', { key, error: (error as Error).message });
    return false;
  }
}

// Session utilities
export async function setSession(sessionId: string, data: any, ttlSeconds: number = 86400): Promise<void> {
  await cacheSet(`session:${sessionId}`, data, ttlSeconds);
}

export async function getSession<T>(sessionId: string): Promise<T | null> {
  return cacheGet<T>(`session:${sessionId}`);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await cacheDelete(`session:${sessionId}`);
}

// Rate limiting utilities
export async function incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
  const client = getRedisClient();
  if (!client) {
    return 1; // Allow request if Redis unavailable
  }
  
  try {
    const multi = client.multi();
    multi.incr(key);
    multi.expire(key, windowSeconds);
    
    const results = await multi.exec();
    return (results?.[0] as number) || 1;
  } catch (error) {
    logger.warn('Rate limit increment failed', { key, error: (error as Error).message });
    return 1; // Allow request on error
  }
}

export async function getRateLimit(key: string): Promise<number> {
  const client = getRedisClient();
  if (!client) {
    return 0;
  }
  
  try {
    const count = await client.get(key);
    return count ? parseInt(count) : 0;
  } catch (error) {
    logger.warn('Rate limit get failed', { key, error: (error as Error).message });
    return 0;
  }
}

// Lock utilities for distributed locking
export async function acquireLock(lockKey: string, ttlSeconds: number = 30): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return true; // Allow operation if Redis unavailable
  }
  
  try {
    const result = await client.set(`lock:${lockKey}`, '1', { EX: ttlSeconds, NX: true });
    return result === 'OK';
  } catch (error) {
    logger.warn('Lock acquisition failed', { lockKey, error: (error as Error).message });
    return true; // Allow operation on error
  }
}

export async function releaseLock(lockKey: string): Promise<void> {
  await cacheDelete(`lock:${lockKey}`);
}

// Graceful shutdown
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.disconnect();
    logger.info('Redis client disconnected');
  }
}