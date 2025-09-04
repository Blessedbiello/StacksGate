import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';

import { logger } from '@/utils/logger';
import { connectDatabase } from '@/utils/database';
import { connectRedis } from '@/utils/redis';

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
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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

// Load routes safely
console.log('🔄 Loading routes...');

try {
  const healthRoutes = require('./routes/health').default;
  app.use('/api/v1/health', healthRoutes);
  console.log('✅ Health routes loaded');
} catch (error) {
  console.error('❌ Health routes failed:', error);
}

// Try loading other routes with error handling
try {
  console.log('🔄 Loading merchants routes...');
  const merchantRoutes = require('./routes/merchants').default;
  app.use('/api/v1/merchants', merchantRoutes);
  console.log('✅ Merchants routes loaded');
} catch (error) {
  console.error('❌ Merchants routes failed:', error);
}

try {
  console.log('🔄 Loading payments routes...');
  const paymentRoutes = require('./routes/payments').default;
  app.use('/api/v1/payment-intents', paymentRoutes);
  console.log('✅ Payment routes loaded');
} catch (error) {
  console.error('❌ Payment routes failed:', error);
}

try {
  console.log('🔄 Loading webhook routes...');
  const webhookRoutes = require('./routes/webhooks').default;
  app.use('/api/v1/webhooks', webhookRoutes);
  console.log('✅ Webhook routes loaded');
} catch (error) {
  console.error('❌ Webhook routes failed:', error);
}

try {
  console.log('🔄 Loading payment links routes...');
  const paymentLinksRoutes = require('./routes/paymentLinks').default;
  app.use('/api/v1/payment-links', paymentLinksRoutes);
  console.log('✅ Payment links routes loaded');
} catch (error) {
  console.error('❌ Payment links routes failed:', error);
}

try {
  console.log('🔄 Loading exchange rate routes...');
  const exchangeRateRoutes = require('./routes/exchangeRate').default;
  app.use('/api/v1/exchange-rate', exchangeRateRoutes);
  console.log('✅ Exchange rate routes loaded');
} catch (error) {
  console.error('❌ Exchange rate routes failed:', error);
}

try {
  console.log('🔄 Loading subscription routes...');
  const subscriptionRoutes = require('./routes/subscriptions').default;
  app.use('/api/v1/subscriptions', subscriptionRoutes);
  console.log('✅ Subscription routes loaded');
} catch (error) {
  console.error('❌ Subscription routes failed:', error);
}

// Add a simple root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'StacksGate API',
    version: '1.0.0',
    status: 'operational',
    documentation: '/api/v1/health'
  });
});

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
async function startWorkingServer() {
  try {
    // Try to connect to database (optional)
    try {
      console.log('🔄 Connecting to database...');
      const dbConnection = await connectDatabase();
      if (dbConnection) {
        console.log('✅ Database connected successfully');
      } else {
        console.log('⚠️  Database connection skipped - using in-memory storage');
      }
    } catch (error) {
      console.log('⚠️  Database connection failed, using in-memory storage:', (error as Error).message);
    }

    // Connect to Redis (optional)
    try {
      console.log('🔄 Connecting to Redis...');
      const redisConnection = await connectRedis();
      if (redisConnection) {
        console.log('✅ Redis connected successfully');
      } else {
        console.log('⚠️  Redis connection skipped - using in-memory cache');
      }
    } catch (error) {
      console.log('⚠️  Redis connection failed, continuing without cache:', (error as Error).message);
    }

    // Start HTTP server
    httpServer = createServer(app);
    
    httpServer.listen(PORT, () => {
      console.log(`🚀 StacksGate API server running on port ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/api/v1/health`);
      console.log(`📖 API root: http://localhost:${PORT}/`);
      
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
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

// Start the server
console.log('🚀 Starting StacksGate Working Server...');
startWorkingServer();

export default app;