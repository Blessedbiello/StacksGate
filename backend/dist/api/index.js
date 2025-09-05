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
const logger_1 = require("@/utils/logger");
const database_1 = require("@/utils/database");
const redis_1 = require("@/utils/redis");
const payments_1 = __importDefault(require("@/routes/payments"));
const merchants_1 = __importDefault(require("@/routes/merchants"));
const webhooks_1 = __importDefault(require("@/routes/webhooks"));
const health_1 = __importDefault(require("@/routes/health"));
const paymentLinks_1 = __importDefault(require("@/routes/paymentLinks"));
const subscriptions_1 = __importDefault(require("@/routes/subscriptions"));
const exchangeRate_1 = __importDefault(require("@/routes/exchangeRate"));
dotenv_1.default.config();
const app = (0, express_1.default)();
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
        'https://stacksgate-frontend-gold.vercel.app',
        'https://stacks-gate-frontend.vercel.app',
        'https://stacksgate-widget-eukzacqe9-blessedbiellogmailcoms-projects.vercel.app',
        'https://stacksgate.vercel.app',
        'https://stacksgate-widget.vercel.app'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
let dbInitialized = false;
let redisInitialized = false;
async function initializeConnections() {
    if (!dbInitialized) {
        try {
            await (0, database_1.connectDatabase)();
            logger_1.logger.info('Database connected successfully');
            dbInitialized = true;
        }
        catch (error) {
            logger_1.logger.warn('Database connection failed, continuing:', error);
        }
    }
    if (!redisInitialized) {
        try {
            await (0, redis_1.connectRedis)();
            logger_1.logger.info('Redis connected successfully');
            redisInitialized = true;
        }
        catch (error) {
            logger_1.logger.warn('Redis connection failed, continuing without cache:', error);
        }
    }
}
app.use(async (req, res, next) => {
    await initializeConnections();
    next();
});
app.use('/api/v1/health', health_1.default);
app.use('/api/v1/payment-intents', payments_1.default);
app.use('/api/v1/merchants', merchants_1.default);
app.use('/api/v1/webhooks', webhooks_1.default);
app.use('/api/v1/payment-links', paymentLinks_1.default);
app.use('/api/v1/subscriptions', subscriptions_1.default);
app.use('/api/v1/exchange-rate', exchangeRate_1.default);
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
exports.default = app;
