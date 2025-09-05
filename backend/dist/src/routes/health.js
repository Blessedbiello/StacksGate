"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("@/utils/database");
const redis_1 = require("@/utils/redis");
const logger_1 = require("@/utils/logger");
const router = (0, express_1.Router)();
router.get('/', async (req, res) => {
    const startTime = Date.now();
    const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        services: {
            database: 'up',
            redis: 'up',
        },
        uptime: process.uptime(),
    };
    try {
        const db = (0, database_1.getDatabase)();
        await db.query('SELECT 1');
        healthStatus.services.database = 'up';
    }
    catch (error) {
        logger_1.logger.error('Database health check failed:', error);
        healthStatus.services.database = 'down';
        healthStatus.status = 'unhealthy';
    }
    try {
        const redis = (0, redis_1.getRedisClient)();
        if (redis) {
            await redis.ping();
            healthStatus.services.redis = 'up';
        }
        else {
            healthStatus.services.redis = 'down';
        }
    }
    catch (error) {
        logger_1.logger.error('Redis health check failed:', error);
        healthStatus.services.redis = 'down';
    }
    const responseTime = Date.now() - startTime;
    logger_1.logger.debug('Health check completed', {
        status: healthStatus.status,
        responseTime: `${responseTime}ms`,
        services: healthStatus.services,
    });
    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json({
        ...healthStatus,
        responseTime: `${responseTime}ms`,
    });
});
router.get('/live', (req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
    });
});
router.get('/ready', async (req, res) => {
    try {
        const db = (0, database_1.getDatabase)();
        await db.query('SELECT 1');
        const redis = (0, redis_1.getRedisClient)();
        if (redis) {
            try {
                await redis.ping();
            }
            catch (redisError) {
                logger_1.logger.warn('Redis not available during readiness check:', redisError);
            }
        }
        res.status(200).json({
            status: 'ready',
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.logger.error('Readiness check failed:', error);
        res.status(503).json({
            status: 'not_ready',
            timestamp: new Date().toISOString(),
            error: 'Essential services unavailable',
        });
    }
});
exports.default = router;
