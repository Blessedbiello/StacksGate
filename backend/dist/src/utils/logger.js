"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const logLevel = process.env.LOG_LEVEL || 'info';
const logFile = process.env.LOG_FILE || 'stacksgate.log';
const consoleFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.colorize(), winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
        msg += `\n${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
}));
const fileFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json());
const transports = [
    new winston_1.default.transports.Console({
        level: logLevel,
        format: consoleFormat,
    }),
];
if (process.env.NODE_ENV !== 'test') {
    transports.push(new winston_1.default.transports.File({
        filename: path_1.default.join(process.cwd(), 'logs', 'error.log'),
        level: 'error',
        format: fileFormat,
        maxsize: 5242880,
        maxFiles: 5,
    }), new winston_1.default.transports.File({
        filename: path_1.default.join(process.cwd(), 'logs', logFile),
        level: logLevel,
        format: fileFormat,
        maxsize: 5242880,
        maxFiles: 10,
    }));
}
exports.logger = winston_1.default.createLogger({
    level: logLevel,
    transports,
    exitOnError: false,
    exceptionHandlers: [
        new winston_1.default.transports.File({
            filename: path_1.default.join(process.cwd(), 'logs', 'exceptions.log'),
            format: fileFormat,
        }),
    ],
    rejectionHandlers: [
        new winston_1.default.transports.File({
            filename: path_1.default.join(process.cwd(), 'logs', 'rejections.log'),
            format: fileFormat,
        }),
    ],
});
const fs_1 = __importDefault(require("fs"));
const logsDir = path_1.default.join(process.cwd(), 'logs');
if (!fs_1.default.existsSync(logsDir)) {
    fs_1.default.mkdirSync(logsDir, { recursive: true });
}
exports.logger.info('Logger initialized', {
    level: logLevel,
    environment: process.env.NODE_ENV,
    logFile,
});
exports.default = exports.logger;
