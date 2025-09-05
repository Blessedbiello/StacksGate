"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get('/api/v1/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        message: 'StacksGate API is running'
    });
});
app.get('/', (req, res) => {
    res.json({
        message: 'StacksGate API',
        version: '1.0.0',
        status: 'operational'
    });
});
app.listen(PORT, () => {
    console.log(`✅ StacksGate API server running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/api/v1/health`);
});
exports.default = app;
