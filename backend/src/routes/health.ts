import { Router, Request, Response } from 'express';
import { getDatabase } from '@/utils/database';
import { getRedisClient } from '@/utils/redis';
import { logger } from '@/utils/logger';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
  };
  uptime: number;
}

router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  const healthStatus: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: 'up',
      redis: 'up',
    },
    uptime: process.uptime(),
  };

  // Check database
  try {
    const db = getDatabase();
    await db.query('SELECT 1');
    healthStatus.services.database = 'up';
  } catch (error) {
    logger.error('Database health check failed:', error);
    healthStatus.services.database = 'down';
    healthStatus.status = 'unhealthy';
  }

  // Check Redis
  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.ping();
      healthStatus.services.redis = 'up';
    } else {
      healthStatus.services.redis = 'down';
      // Don't mark as unhealthy since Redis is optional
    }
  } catch (error) {
    logger.error('Redis health check failed:', error);
    healthStatus.services.redis = 'down';
    // Don't mark as unhealthy since Redis is optional for basic functionality
  }

  const responseTime = Date.now() - startTime;
  
  logger.debug('Health check completed', {
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

// Liveness probe - simple check that the application is running
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

// Readiness probe - check if application is ready to receive traffic
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check if essential services are available
    const db = getDatabase();
    await db.query('SELECT 1');

    // Redis is optional, so don't fail if it's unavailable
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.ping();
      } catch (redisError) {
        logger.warn('Redis not available during readiness check:', redisError);
      }
    }

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: 'Essential services unavailable',
    });
  }
});

export default router;