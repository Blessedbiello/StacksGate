import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';

import { logger } from '@/utils/logger';
import { connectDatabase } from '@/utils/database';
import { connectRedis } from '@/utils/redis';
import { runMigrations } from '@/utils/migrate';

// Route imports
import paymentRoutes from '@/routes/payments';
import merchantRoutes from '@/routes/merchants';
import webhookRoutes from '@/routes/webhooks';
import healthRoutes from '@/routes/health';
import paymentLinksRoutes from '@/routes/paymentLinks';
import subscriptionRoutes from '@/routes/subscriptions';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || [
    'http://localhost:5173',
    'http://localhost:3001',
    'https://stacksgate-frontend-gold.vercel.app',
    'https://stacks-gate-frontend.vercel.app',
    'https://stacksgate.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// API Routes
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/payment-intents', paymentRoutes);
app.use('/api/v1/merchants', merchantRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/payment-links', paymentLinksRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || error.status || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal Server Error' 
    : error.message;

  res.status(statusCode).json({
    error: {
      type: 'api_error',
      message,
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
    },
  });
});

// 404 handler
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    error: {
      type: 'api_error',
      message: 'Route not found',
    },
  });
});

// Graceful shutdown handler
let httpServer: any = null;

const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  if (httpServer) {
    httpServer.close(() => {
      logger.info('HTTP server closed');
      
      // Close database connections
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
  
  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Initialize server
async function startServer() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');

    // Run database migrations if AUTO_MIGRATE is enabled
    if (process.env.AUTO_MIGRATE === 'true') {
      logger.info('AUTO_MIGRATE enabled - running database migrations...');
      const migrationSuccess = await runMigrations();
      
      if (!migrationSuccess) {
        logger.error('Database migration failed - server startup aborted');
        process.exit(1);
      }
      
      logger.info('Database migrations completed successfully');
    } else {
      logger.info('AUTO_MIGRATE disabled - skipping database migrations');
    }

    // Connect to Redis (optional)
    try {
      await connectRedis();
      logger.info('Redis connected successfully');
    } catch (error) {
      logger.warn('Redis connection failed, continuing without cache:', error);
    }

    // Start HTTP server
    httpServer = createServer(app);
    
    httpServer.listen(PORT, () => {
      logger.info(`StacksGate API server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`CORS origin: ${process.env.CORS_ORIGIN}`);
    });

    // Setup graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return httpServer;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;