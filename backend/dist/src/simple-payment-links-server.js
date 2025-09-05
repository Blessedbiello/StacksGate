"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const logger_1 = require("./utils/logger");
const paymentLinks_1 = __importDefault(require("./routes/paymentLinks"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)({
    origin: ['http://localhost:5173', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
app.use('/api/v1/payment-links', paymentLinks_1.default);
app.get('/api/v1/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'StacksGate Payment Links Server',
        timestamp: new Date().toISOString(),
    });
});
app.get('/', (req, res) => {
    res.json({
        message: 'StacksGate Payment Links API',
        version: '1.0.0',
        status: 'operational',
    });
});
app.use((err, req, res, next) => {
    logger_1.logger.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
    });
});
app.listen(PORT, () => {
    console.log(`🚀 StacksGate Payment Links Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/api/v1/health`);
    console.log(`🔗 Payment Links API: http://localhost:${PORT}/api/v1/payment-links`);
});
exports.default = app;
