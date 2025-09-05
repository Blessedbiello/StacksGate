"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("@/utils/logger");
const database_1 = require("@/utils/database");
dotenv_1.default.config();
console.log('✅ Environment loaded');
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
console.log('✅ Middleware configured');
try {
    console.log('🔄 Loading health routes...');
    const healthRoutes = require('./routes/health').default;
    app.use('/api/v1/health', healthRoutes);
    console.log('✅ Health routes loaded');
}
catch (error) {
    console.error('❌ Health routes failed:', error);
}
app.get('/api/v1/debug', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        message: 'StacksGate Debug API'
    });
});
console.log('✅ Routes configured');
async function startDebugServer() {
    try {
        console.log('🔄 Starting database connection...');
        await (0, database_1.connectDatabase)();
        console.log('✅ Database connected successfully');
        app.listen(PORT, () => {
            console.log(`✅ StacksGate Debug API running on port ${PORT}`);
            logger_1.logger.info(`Debug server started on port ${PORT}`);
        });
    }
    catch (error) {
        console.error('❌ Debug server failed:', error);
        process.exit(1);
    }
}
console.log('🚀 Starting debug server...');
startDebugServer();
exports.default = app;
