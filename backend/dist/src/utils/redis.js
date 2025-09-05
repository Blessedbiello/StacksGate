"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectRedis = connectRedis;
exports.getRedisClient = getRedisClient;
exports.cacheSet = cacheSet;
exports.cacheGet = cacheGet;
exports.cacheDelete = cacheDelete;
exports.cacheExists = cacheExists;
exports.setSession = setSession;
exports.getSession = getSession;
exports.deleteSession = deleteSession;
exports.incrementRateLimit = incrementRateLimit;
exports.getRateLimit = getRateLimit;
exports.acquireLock = acquireLock;
exports.releaseLock = releaseLock;
exports.closeRedis = closeRedis;
const redis_1 = require("redis");
const logger_1 = require("./logger");
let redisClient;
async function connectRedis() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    if (!redisClient) {
        try {
            redisClient = (0, redis_1.createClient)({
                url: redisUrl,
                socket: {
                    connectTimeout: 2000,
                    reconnectStrategy: false,
                },
            });
            redisClient.on('error', (err) => {
                logger_1.logger.error('Redis client error:', err);
            });
            redisClient.on('connect', () => {
                logger_1.logger.info('Redis client connected');
            });
            redisClient.on('disconnect', () => {
                logger_1.logger.warn('Redis client disconnected');
            });
            await redisClient.connect();
            logger_1.logger.info('Redis connection established successfully');
        }
        catch (error) {
            logger_1.logger.warn('Failed to connect to Redis, continuing without cache:', error.message);
            return null;
        }
    }
    return redisClient;
}
function getRedisClient() {
    return redisClient || null;
}
async function cacheSet(key, value, ttlSeconds = 3600) {
    const client = getRedisClient();
    if (!client) {
        logger_1.logger.debug('Cache set skipped - Redis unavailable', { key });
        return;
    }
    try {
        const serializedValue = JSON.stringify(value);
        await client.setEx(key, ttlSeconds, serializedValue);
        logger_1.logger.debug('Cache set', { key, ttl: ttlSeconds });
    }
    catch (error) {
        logger_1.logger.warn('Cache set failed', { key, error: error.message });
    }
}
async function cacheGet(key) {
    const client = getRedisClient();
    if (!client) {
        logger_1.logger.debug('Cache get skipped - Redis unavailable', { key });
        return null;
    }
    try {
        const cachedValue = await client.get(key);
        if (cachedValue) {
            logger_1.logger.debug('Cache hit', { key });
            return JSON.parse(cachedValue);
        }
        logger_1.logger.debug('Cache miss', { key });
        return null;
    }
    catch (error) {
        logger_1.logger.warn('Cache get failed', { key, error: error.message });
        return null;
    }
}
async function cacheDelete(key) {
    const client = getRedisClient();
    if (!client) {
        logger_1.logger.debug('Cache delete skipped - Redis unavailable', { key });
        return;
    }
    try {
        await client.del(key);
        logger_1.logger.debug('Cache delete', { key });
    }
    catch (error) {
        logger_1.logger.warn('Cache delete failed', { key, error: error.message });
    }
}
async function cacheExists(key) {
    const client = getRedisClient();
    if (!client) {
        return false;
    }
    try {
        const exists = await client.exists(key);
        return exists === 1;
    }
    catch (error) {
        logger_1.logger.warn('Cache exists check failed', { key, error: error.message });
        return false;
    }
}
async function setSession(sessionId, data, ttlSeconds = 86400) {
    await cacheSet(`session:${sessionId}`, data, ttlSeconds);
}
async function getSession(sessionId) {
    return cacheGet(`session:${sessionId}`);
}
async function deleteSession(sessionId) {
    await cacheDelete(`session:${sessionId}`);
}
async function incrementRateLimit(key, windowSeconds) {
    const client = getRedisClient();
    if (!client) {
        return 1;
    }
    try {
        const multi = client.multi();
        multi.incr(key);
        multi.expire(key, windowSeconds);
        const results = await multi.exec();
        return results?.[0] || 1;
    }
    catch (error) {
        logger_1.logger.warn('Rate limit increment failed', { key, error: error.message });
        return 1;
    }
}
async function getRateLimit(key) {
    const client = getRedisClient();
    if (!client) {
        return 0;
    }
    try {
        const count = await client.get(key);
        return count ? parseInt(count) : 0;
    }
    catch (error) {
        logger_1.logger.warn('Rate limit get failed', { key, error: error.message });
        return 0;
    }
}
async function acquireLock(lockKey, ttlSeconds = 30) {
    const client = getRedisClient();
    if (!client) {
        return true;
    }
    try {
        const result = await client.set(`lock:${lockKey}`, '1', { EX: ttlSeconds, NX: true });
        return result === 'OK';
    }
    catch (error) {
        logger_1.logger.warn('Lock acquisition failed', { lockKey, error: error.message });
        return true;
    }
}
async function releaseLock(lockKey) {
    await cacheDelete(`lock:${lockKey}`);
}
async function closeRedis() {
    if (redisClient) {
        await redisClient.disconnect();
        logger_1.logger.info('Redis client disconnected');
    }
}
