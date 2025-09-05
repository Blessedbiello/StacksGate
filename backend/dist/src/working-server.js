"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const logger_1 = require("@/utils/logger");
const database_1 = require("@/utils/database");
const redis_1 = require("@/utils/redis");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN?.split(',') || [
        'http://localhost:5173',
        'http://localhost:3001',
        'https://stacksgate.vercel.app',
        'https://stacksgate-widget.vercel.app'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));
const limiter = (0, express_rate_limit_1.default)({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    message: {
        error: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
console.log('🔄 Loading routes...');
try {
    const healthRoutes = require('./routes/health').default;
    app.use('/api/v1/health', healthRoutes);
    console.log('✅ Health routes loaded');
}
catch (error) {
    console.error('❌ Health routes failed:', error);
}
try {
    console.log('🔄 Loading merchants routes...');
    const merchantRoutes = require('./routes/merchants').default;
    app.use('/api/v1/merchants', merchantRoutes);
    console.log('✅ Merchants routes loaded');
}
catch (error) {
    console.error('❌ Merchants routes failed:', error);
}
try {
    console.log('🔄 Loading payments routes...');
    const paymentRoutes = require('./routes/payments').default;
    app.use('/api/v1/payment-intents', paymentRoutes);
    console.log('✅ Payment routes loaded');
}
catch (error) {
    console.error('❌ Payment routes failed:', error);
}
try {
    console.log('🔄 Loading webhook routes...');
    const webhookRoutes = require('./routes/webhooks').default;
    app.use('/api/v1/webhooks', webhookRoutes);
    console.log('✅ Webhook routes loaded');
}
catch (error) {
    console.error('❌ Webhook routes failed:', error);
}
try {
    console.log('🔄 Loading payment links routes...');
    const paymentLinksRoutes = require('./routes/paymentLinks').default;
    app.use('/api/v1/payment-links', paymentLinksRoutes);
    console.log('✅ Payment links routes loaded');
}
catch (error) {
    console.error('❌ Payment links routes failed:', error);
}
try {
    console.log('🔄 Loading exchange rate routes...');
    const exchangeRateRoutes = require('./routes/exchangeRate').default;
    app.use('/api/v1/exchange-rate', exchangeRateRoutes);
    console.log('✅ Exchange rate routes loaded');
}
catch (error) {
    console.error('❌ Exchange rate routes failed:', error);
}
try {
    console.log('🔄 Loading subscription routes...');
    const subscriptionRoutes = require('./routes/subscriptions').default;
    app.use('/api/v1/subscriptions', subscriptionRoutes);
    console.log('✅ Subscription routes loaded');
}
catch (error) {
    console.error('❌ Subscription routes failed:', error);
}
app.get('/', (req, res) => {
    res.json({
        message: 'StacksGate API',
        version: '1.0.0',
        status: 'operational',
        documentation: '/api/v1/health'
    });
});
app.use((error, req, res, next) => {
    logger_1.logger.error('Unhandled error:', {
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
app.use((req, res) => {
    res.status(404).json({
        error: {
            type: 'api_error',
            message: 'Route not found',
        },
    });
});
let httpServer = null;
const gracefulShutdown = (signal) => {
    logger_1.logger.info(`Received ${signal}. Starting graceful shutdown...`);
    if (httpServer) {
        httpServer.close(() => {
            logger_1.logger.info('HTTP server closed');
            process.exit(0);
        });
    }
    else {
        process.exit(0);
    }
    setTimeout(() => {
        logger_1.logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
};
async function startWorkingServer() {
    try {
        try {
            console.log('🔄 Connecting to database...');
            const dbConnection = await (0, database_1.connectDatabase)();
            if (dbConnection) {
                console.log('✅ Database connected successfully');
            }
            else {
                console.log('⚠️  Database connection skipped - using in-memory storage');
            }
        }
        catch (error) {
            console.log('⚠️  Database connection failed, using in-memory storage:', error.message);
        }
        try {
            console.log('🔄 Connecting to Redis...');
            const redisConnection = await (0, redis_1.connectRedis)();
            if (redisConnection) {
                console.log('✅ Redis connected successfully');
            }
            else {
                console.log('⚠️  Redis connection skipped - using in-memory cache');
            }
        }
        catch (error) {
            console.log('⚠️  Redis connection failed, continuing without cache:', error.message);
        }
        httpServer = (0, http_1.createServer)(app);
        httpServer.listen(PORT, () => {
            console.log(`🚀 StacksGate API server running on port ${PORT}`);
            console.log(`🌐 Health check: http://localhost:${PORT}/api/v1/health`);
            console.log(`📖 API root: http://localhost:${PORT}/`);
            logger_1.logger.info(`StacksGate API server running on port ${PORT}`);
            logger_1.logger.info(`Environment: ${process.env.NODE_ENV}`);
            logger_1.logger.info(`CORS origin: ${process.env.CORS_ORIGIN}`);
        });
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        return httpServer;
    }
    catch (error) {
        logger_1.logger.error('Failed to start server:', error);
        console.error('❌ Server startup failed:', error);
        process.exit(1);
    }
}
console.log('🚀 Starting StacksGate Working Server...');
startWorkingServer();
exports.default = app;
